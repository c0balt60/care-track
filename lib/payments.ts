// Booking deposits through Stripe Checkout, in test mode (PAY-1 #29).
//
// The flow, start to finish:
//
//   1. The book action calls bookSlot(..., { hold: true }). The appointment is inserted
//      as "awaiting_payment", so the overlap constraint holds the time while the patient pays.
//   2. startCheckout() adds a "pending" payments row, creates a Checkout Session, and
//      returns Stripe's hosted payment page URL. The action redirects there.
//   3. Stripe sends the patient back to /api/stripe/checkout?appointment=<id> (with
//      &cancelled=1 if they backed out). That route calls reconcileCheckout(). So does
//      the webhook (/api/stripe/webhook, handleStripeEvent), which covers patients who
//      paid but never came back, and sessions that expired.
//   4. reconcileCheckout() asks Stripe what happened. It never trusts the URL:
//      - paid:          settleHold() turns the hold into a real booking (confirmed or pending)
//      - expired:       releaseHold() deletes the hold, freeing the time
//      - still open:    nothing, unless asked to release (cancel button, stale sweep),
//                       in which case the session is expired at Stripe first, so it can
//                       never be paid after we've given the time away
//
// Every step only acts on rows still "awaiting_payment" (or a payment still "authorized"),
// so running any of it twice is a no-op: the webhook and the return page can both run it
// for the same appointment without double-booking anything.
//
// Instant mode charges the card right away. Approval mode only places a hold on it
// (Stripe "manual capture"): approve() captures it, decline or withdraw releases it.
// Card holds expire after about 7 days, after which a capture fails (see finishHold).
//
// Cancelling a confirmed booking refunds the charged deposit when refundsDeposit() in
// ./appointment-rules says so (PAY-3 #31): see refundDeposit.
import { and, eq, lt } from "drizzle-orm";
import Stripe from "stripe";
import { REFUND_CUTOFF_HOURS, refundsDeposit, type RulesViewer } from "./appointment-rules";
import { recordBooked } from "./booking";
import { db } from "./db";
import { appointments, patients, payments, practitioners, stripeEvents } from "./db/schema";
import { logger } from "./logger";

const log = logger.child({ module: "payments" });

/** The flat deposit every new booking pays. Reschedules keep the original deposit. */
export const DEPOSIT_CENTS = 2500;
export const DEPOSIT_CURRENCY = "USD";
export const depositLabel = (DEPOSIT_CENTS / 100).toLocaleString("en-US", { style: "currency", currency: DEPOSIT_CURRENCY });

/**
 * How long a held slot waits for payment. Stripe requires a Checkout Session to live at
 * least 30 minutes; the extra minute keeps us clear of that limit if clocks disagree.
 */
export const HOLD_MINUTES = 31;

let client: Stripe | undefined;

/** The Stripe client. Throws when STRIPE_SECRET_KEY is missing, rather than booking without payment. */
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("payments: STRIPE_SECRET_KEY is not set");
  return (client ??= new Stripe(key));
}

/**
 * Starts paying for a held appointment. Returns Stripe's Checkout URL, or null if the
 * hold is gone or Stripe refused, in which case the hold is released and nothing is charged.
 *
 * `origin` is this site's origin (https://host), used to build the return URLs.
 */
export async function startCheckout(appointmentId: string, origin: string, now = new Date()): Promise<string | null> {
  const [held] = await db
    .select({ bookingMode: practitioners.bookingMode })
    .from(appointments)
    .innerJoin(practitioners, eq(practitioners.id, appointments.practitionerId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.status, "awaiting_payment")))
    .limit(1);
  if (!held) return null;

  const [payment] = await db
    .insert(payments)
    .values({ appointmentId, amountCents: DEPOSIT_CENTS, currency: DEPOSIT_CURRENCY, provider: "stripe" })
    .returning({ id: payments.id });

  const back = `${origin}/api/stripe/checkout?appointment=${appointmentId}`;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      // Cards only: they succeed or fail on the spot. Bank debits can take days to clear.
      allowed_payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          // Generic on purpose: Stripe shows this on receipts, so no names or reasons for the visit.
          price_data: { currency: DEPOSIT_CURRENCY.toLowerCase(), unit_amount: DEPOSIT_CENTS, product_data: { name: "Appointment deposit" } },
        },
      ],
      client_reference_id: appointmentId,
      metadata: { appointmentId },
      payment_intent_data: {
        metadata: { appointmentId },
        ...(held.bookingMode === "approval" && { capture_method: "manual" as const }),
      },
      expires_at: Math.floor(now.getTime() / 1000) + HOLD_MINUTES * 60,
      success_url: back,
      cancel_url: `${back}&cancelled=1`,
    });
    await db.update(payments).set({ providerRef: session.id }).where(eq(payments.id, payment.id));
    return session.url;
  } catch (err) {
    // If the session was created but saving its id failed, nobody ever sees its URL, so it can't be paid.
    log.error({ err, appointmentId }, "could not start checkout");
    await releaseHold(appointmentId);
    return null;
  }
}

type AfterReconcile = (typeof appointments.$inferSelect)["status"] | null;

/**
 * Brings a held appointment in line with its Checkout Session at Stripe. Returns the
 * appointment's status afterwards, or null when there's no appointment (released).
 *
 * With `release`, a session that's still open is expired first, then the hold is
 * released. Without it, an open session is left alone.
 */
export async function reconcileCheckout(appointmentId: string, { release = false } = {}): Promise<AfterReconcile> {
  const [row] = await db
    .select({ status: appointments.status, sessionId: payments.providerRef })
    .from(appointments)
    .leftJoin(payments, and(eq(payments.appointmentId, appointments.id), eq(payments.provider, "stripe")))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!row) return null;
  // Already settled (or later changed by the clinic): nothing to do.
  if (row.status !== "awaiting_payment") return row.status;
  // startCheckout never finished saving the session, so it was never shown to anyone.
  if (!row.sessionId) {
    if (!release) return row.status;
    await releaseHold(appointmentId);
    return null;
  }

  const expand = ["payment_intent"];
  let session = await stripe().checkout.sessions.retrieve(row.sessionId, { expand });
  if (session.status === "open" && release) {
    try {
      session = await stripe().checkout.sessions.expire(row.sessionId, { expand });
    } catch {
      // Stripe refuses to expire a session that was completed a moment ago. Read it again.
      session = await stripe().checkout.sessions.retrieve(row.sessionId, { expand });
    }
  }

  const intent = session.payment_intent as Stripe.PaymentIntent | null;
  if (session.status === "complete" && (intent?.status === "succeeded" || intent?.status === "requires_capture")) {
    return settleHold(appointmentId, intent.status === "succeeded" ? "succeeded" : "authorized");
  }
  if (session.status === "expired") {
    await releaseHold(appointmentId);
    return null;
  }
  return row.status;
}

/**
 * The deposit is paid (or held): the appointment becomes a booking. A charged deposit
 * means instant mode (confirmed), a held one approval mode (pending request). This
 * follows how the session was created, so a practitioner changing their booking mode
 * mid-checkout can't leave a pending request with money already taken.
 */
async function settleHold(appointmentId: string, paid: "succeeded" | "authorized"): Promise<AfterReconcile> {
  const status = paid === "succeeded" ? "confirmed" : "pending";
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(appointments)
      .set({ status })
      .where(and(eq(appointments.id, appointmentId), eq(appointments.status, "awaiting_payment")))
      .returning({ patientId: appointments.patientId });
    if (!updated) {
      // Someone else settled it a moment ago (e.g. the webhook and the return page at once).
      const [now] = await tx.select({ status: appointments.status }).from(appointments).where(eq(appointments.id, appointmentId));
      return now?.status ?? null;
    }

    await tx
      .update(payments)
      .set({ status: paid })
      .where(and(eq(payments.appointmentId, appointmentId), eq(payments.status, "pending")));
    // Holds are only made by a signed-in patient, so they always have a user id.
    const [patient] = await tx.select({ userId: patients.userId }).from(patients).where(eq(patients.id, updated.patientId));
    await recordBooked(tx, appointmentId, patient.userId!, status);
    return status;
  });
}

/**
 * Gives the time back: deletes the hold and its unpaid payment row. A hold was never a
 * booking, so it leaves no history. Only call this when Stripe can no longer take the
 * payment (session expired, or never created).
 */
async function releaseHold(appointmentId: string) {
  await db.transaction(async (tx) => {
    // Lock the row so a settle running at the same moment waits, then finds nothing.
    const [held] = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.status, "awaiting_payment")))
      .for("update");
    if (!held) return;
    await tx.delete(payments).where(eq(payments.appointmentId, appointmentId));
    await tx.delete(appointments).where(eq(appointments.id, appointmentId));
  });
}

/**
 * Clears holds whose patient never came back from Stripe (closed the tab). Each one is
 * checked with Stripe first: a hold that was actually paid becomes a booking instead.
 * Cheap when there's nothing stale: one indexed query, no Stripe calls.
 *
 * Runs lazily from openSlotsFor() and the book action. The webhook's
 * checkout.session.expired is the main path; this is the backstop for missed deliveries.
 */
export async function releaseStaleHolds(now = new Date()) {
  const cutoff = new Date(now.getTime() - HOLD_MINUTES * 60_000);
  const stale = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.status, "awaiting_payment"), lt(appointments.createdAt, cutoff)));
  for (const { id } of stale) {
    try {
      await reconcileCheckout(id, { release: true });
    } catch (err) {
      // Never break the page that triggered the sweep; the next one retries.
      log.error({ err, appointmentId: id }, "could not release stale hold");
    }
  }
}

/**
 * Checks a webhook request really came from Stripe (signed with STRIPE_WEBHOOK_SECRET) and
 * returns its event, or null if the signature is missing, wrong, or too old (replay window
 * is Stripe's default 5 minutes). Throws if the secret isn't configured.
 */
export function verifyStripeEvent(body: string, signature: string | null): Stripe.Event | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("payments: STRIPE_WEBHOOK_SECRET is not set");
  if (!signature) return null;
  try {
    return stripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return null;
  }
}

/**
 * Acts on a verified webhook event (PAY-2 #30). Both events just make reconcileCheckout()
 * ask Stripe for the session's current state, so it never acts on a stale event body:
 *   checkout.session.completed  the patient paid, maybe without coming back: book it
 *   checkout.session.expired    nobody paid in time: free the slot
 *
 * Each event id is stored first, so a redelivered event is a no-op. If acting fails, the id
 * is removed again and the error rethrown: the webhook answers 500 and Stripe retries.
 */
export async function handleStripeEvent(event: Stripe.Event) {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") return;
  const appointmentId = event.data.object.metadata?.appointmentId;
  if (!appointmentId) return; // A session this app didn't create.

  const [claimed] = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (!claimed) return;

  try {
    await reconcileCheckout(appointmentId);
  } catch (err) {
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    throw err;
  }
}

/** The PaymentIntent behind a completed Checkout Session. */
async function intentIdFor(sessionId: string) {
  const { payment_intent: intent } = await stripe().checkout.sessions.retrieve(sessionId);
  return typeof intent === "string" ? intent : intent!.id;
}

type Payment = typeof payments.$inferSelect;

/**
 * The charged deposit behind an appointment, or null. A reschedule keeps the original
 * deposit, so this follows rescheduledFromId back to the booking that paid it.
 */
export async function paidDeposit(appointmentId: string): Promise<Payment | null> {
  let id: string | null = appointmentId;
  while (id) {
    const [row]: { payment: Payment | null; from: string | null }[] = await db
      .select({ payment: payments, from: appointments.rescheduledFromId })
      .from(appointments)
      .leftJoin(payments, and(eq(payments.appointmentId, appointments.id), eq(payments.status, "succeeded")))
      .where(eq(appointments.id, id))
      .limit(1);
    if (!row) return null;
    if (row.payment) return row.payment;
    id = row.from;
  }
  return null;
}

/**
 * Refunds a cancelled appointment's deposit in full (PAY-3 #31). Runs after the
 * cancellation has committed, like finishHold. The idempotency key makes a repeat call
 * return Stripe's first refund instead of refunding twice.
 */
export async function refundDeposit(appointmentId: string) {
  const payment = await paidDeposit(appointmentId);
  if (!payment?.providerRef) return;
  try {
    const intentId = await intentIdFor(payment.providerRef);
    await stripe().refunds.create({ payment_intent: intentId }, { idempotencyKey: `refund-${payment.id}` });
  } catch (err) {
    // ponytail: no retry. The payment stays "succeeded" and this log is the only trace; refund by hand from the Dashboard.
    log.error({ err, appointmentId, paymentId: payment.id }, "could not refund deposit");
    return;
  }
  await db
    .update(payments)
    .set({ status: "refunded" })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "succeeded")));
}

/** The cancel dialog's line about the deposit, or undefined when nothing was charged. */
export async function cancelDepositNote(viewer: RulesViewer, appointmentId: string, startsAt: Date, now = new Date()) {
  const deposit = await paidDeposit(appointmentId);
  if (!deposit) return undefined;
  const amount = (deposit.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: deposit.currency });
  if (viewer.role !== "patient") return `The patient's ${amount} deposit will be refunded.`;
  return refundsDeposit(viewer, startsAt, now)
    ? `Your ${amount} deposit will be refunded.`
    : `It's less than ${REFUND_CUTOFF_HOURS} hours away, so your ${amount} deposit won't be refunded.`;
}

/** Approval mode: the practitioner accepted, so charge the held deposit. */
export const captureDeposit = (appointmentId: string) => finishHold(appointmentId, "capture");

/** Approval mode: the request was declined or withdrawn, so release the hold on the card. */
export const releaseDeposit = (appointmentId: string) => finishHold(appointmentId, "cancel");

/**
 * Captures or releases an "authorized" deposit. Runs after the appointment change has
 * committed: a Stripe hiccup must not undo an approval. On failure it logs, and a failed
 * capture is marked "failed" so the clinic can see the deposit wasn't collected.
 */
async function finishHold(appointmentId: string, action: "capture" | "cancel") {
  const [payment] = await db
    .select({ id: payments.id, sessionId: payments.providerRef })
    .from(payments)
    .where(and(eq(payments.appointmentId, appointmentId), eq(payments.status, "authorized")))
    .limit(1);
  if (!payment?.sessionId) return;

  let status: (typeof payments.$inferSelect)["status"];
  try {
    const intentId = await intentIdFor(payment.sessionId);
    if (action === "capture") await stripe().paymentIntents.capture(intentId);
    else await stripe().paymentIntents.cancel(intentId);
    status = action === "capture" ? "succeeded" : "cancelled";
  } catch (err) {
    // ponytail: no retry. A capture after the ~7-day hold limit, or a network error, ends as "failed".
    log.error({ err, appointmentId, action }, "could not finish deposit hold");
    if (action === "cancel") return; // An uncancelled hold lapses on its own; leave it "authorized".
    status = "failed";
  }
  await db
    .update(payments)
    .set({ status })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "authorized")));
}
