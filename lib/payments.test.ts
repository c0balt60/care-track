// @vitest-environment node
// The deposit flow (PAY-1 #29) on an in-memory Postgres, with Stripe replaced by a fake
// that keeps sessions in a Map. Tests set what "the patient did on Stripe's page" by
// changing a session's status and payment intent.
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { approve, cancel, decline } from "./appointments";
import { bookSlot, slotIdFor } from "./booking";
import { db } from "./db";
import * as schema from "./db/schema";
import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { cancelDepositNote, DEPOSIT_CENTS, reconcileCheckout, releaseStaleHolds, startCheckout } from "./payments";

vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("./db/schema");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } }), { schema }) };
});

type FakeSession = { id: string; url: string; status: string; payment_intent: { id: string; status: string } | null };
const stripeFake = vi.hoisted(() => {
  const sessions = new Map<string, FakeSession>();
  const fail = { create: false };
  const api = {
    checkout: {
      sessions: {
        create: vi.fn(async () => {
          if (fail.create) throw new Error("Stripe is down");
          const id = `cs_test_${sessions.size + 1}`;
          sessions.set(id, { id, url: `https://checkout.stripe.test/${id}`, status: "open", payment_intent: null });
          return sessions.get(id)!;
        }),
        retrieve: vi.fn(async (id: string) => structuredClone(sessions.get(id)!)),
        expire: vi.fn(async (id: string) => {
          const s = sessions.get(id)!;
          if (s.status !== "open") throw new Error("Only open sessions can be expired");
          s.status = "expired";
          return structuredClone(s);
        }),
      },
    },
    paymentIntents: { capture: vi.fn(async () => ({})), cancel: vi.fn(async () => ({})) },
    refunds: { create: vi.fn(async () => ({ id: "re_1", status: "succeeded" })) },
  };
  return { sessions, fail, api };
});
// The fake API, plus Stripe's real signature checker so the webhook tests sign like Stripe does.
vi.mock("stripe", async (importOriginal) => {
  const Real = ((await importOriginal()) as { default: typeof import("stripe").default }).default;
  return { default: vi.fn(function Stripe() { return { ...stripeFake.api, webhooks: Real.webhooks }; }) };
});
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_fake");

const { sessions, api } = stripeFake;
const NOW = new Date("2030-01-07T12:00:00Z");
const TEN = new Date("2030-01-07T15:00:00Z"); // 10:00 New York

let instant: string;
let approval: string;
let alice: { userId: string; patientId: string };
let bob: { userId: string; patientId: string };
let clinicUser: { userId: string; practitionerId: string };

async function makePatient(name: string) {
  const [user] = await db.insert(schema.users).values({ email: `${name}@test`, name, role: "patient" }).returning();
  const [patient] = await db.insert(schema.patients).values({ userId: user.id, name }).returning();
  return { userId: user.id, patientId: patient.id };
}

async function makePractitioner(bookingMode: "instant" | "approval") {
  const [user] = await db.insert(schema.users).values({ email: `${bookingMode}@test`, name: bookingMode, role: "practitioner" }).returning();
  const [p] = await db
    .insert(schema.practitioners)
    .values({ userId: user.id, name: bookingMode, credentials: "MD", specialty: "Family medicine", city: "Troy, NY", bookingMode, timeZone: "America/New_York", slotMinutes: 30 })
    .returning();
  await db
    .insert(schema.availabilityRules)
    .values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ practitionerId: p.id, weekday, startTime: "09:00", endTime: "17:00" })));
  return { userId: user.id, practitionerId: p.id };
}

/** Holds the slot and starts Checkout, like the book action. Returns the appointment and session ids. */
async function hold(who: typeof alice, practitionerId: string) {
  const res = await bookSlot(who, slotIdFor(practitionerId, TEN), "Check-up", NOW, { hold: true });
  if (!res.ok) throw new Error(`hold failed: ${res.error}`);
  const url = await startCheckout(res.appointmentId, "http://localhost:3000", NOW);
  const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.appointmentId, res.appointmentId));
  return { id: res.appointmentId, url, sessionId: payment?.providerRef ?? "" };
}

/** What the patient did on Stripe's page. */
function pay(sessionId: string, intentStatus: "succeeded" | "requires_capture") {
  Object.assign(sessions.get(sessionId)!, { status: "complete", payment_intent: { id: `pi_${sessionId}`, status: intentStatus } });
}

const appointment = async (id: string) => (await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)))[0];
const payment = async (id: string) => (await db.select().from(schema.payments).where(eq(schema.payments.appointmentId, id)))[0];
const events = async (id: string) =>
  (await db.select().from(schema.appointmentEvents).where(eq(schema.appointmentEvents.appointmentId, id))).map((e) => e.type).sort();

beforeAll(async () => {
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder: "./drizzle" });
  const i = await makePractitioner("instant");
  instant = i.practitionerId;
  const a = await makePractitioner("approval");
  approval = a.practitionerId;
  clinicUser = a;
  alice = await makePatient("alice");
  bob = await makePatient("bob");
});

beforeEach(async () => {
  await db.delete(schema.stripeEvents);
  await db.delete(schema.payments);
  await db.delete(schema.appointments);
  sessions.clear();
  stripeFake.fail.create = false;
  vi.clearAllMocks();
});

describe("instant mode", () => {
  it("holds the slot, then confirms once the card is charged", async () => {
    const h = await hold(alice, instant);
    expect(h.url).toBe(`https://checkout.stripe.test/${h.sessionId}`);
    expect(await appointment(h.id)).toMatchObject({ status: "awaiting_payment" });
    expect(await payment(h.id)).toMatchObject({ status: "pending", amountCents: DEPOSIT_CENTS, provider: "stripe" });
    expect(await events(h.id)).toEqual([]);
    const params = api.checkout.sessions.create.mock.calls[0] as unknown as [{ payment_intent_data: object }];
    expect(params[0].payment_intent_data).not.toHaveProperty("capture_method");

    pay(h.sessionId, "succeeded");
    expect(await reconcileCheckout(h.id)).toBe("confirmed");
    expect(await payment(h.id)).toMatchObject({ status: "succeeded" });
    expect(await events(h.id)).toEqual(["booked", "confirmed"]);
  });

  it("treats a repeated return from Stripe as a no-op", async () => {
    const h = await hold(alice, instant);
    pay(h.sessionId, "succeeded");
    await reconcileCheckout(h.id);
    expect(await reconcileCheckout(h.id)).toBe("confirmed");
    expect(await events(h.id)).toEqual(["booked", "confirmed"]);
  });

  it("blocks the time for others while the patient pays", async () => {
    await hold(alice, instant);
    expect(await bookSlot(bob, slotIdFor(instant, TEN), "Flu", NOW, { hold: true })).toEqual({ ok: false, error: "taken" });
  });
});

describe("leaving without paying", () => {
  it("cancel button: expires the session at Stripe and frees the time", async () => {
    const h = await hold(alice, instant);
    expect(await reconcileCheckout(h.id, { release: true })).toBeNull();
    expect(api.checkout.sessions.expire).toHaveBeenCalledWith(h.sessionId, expect.anything());
    expect(await appointment(h.id)).toBeUndefined();
    expect(await payment(h.id)).toBeUndefined();
    expect((await bookSlot(bob, slotIdFor(instant, TEN), "Flu", NOW, { hold: true })).ok).toBe(true);
  });

  it("does not release a hold that was paid a moment before the cancel", async () => {
    const h = await hold(alice, instant);
    pay(h.sessionId, "succeeded"); // expire() now refuses, like Stripe does for completed sessions
    expect(await reconcileCheckout(h.id, { release: true })).toBe("confirmed");
  });

  it("stale sweep: releases abandoned holds but books ones that were paid", async () => {
    const abandoned = await hold(alice, instant);
    const paidButClosedTab = await hold(bob, approval);
    pay(paidButClosedTab.sessionId, "requires_capture");

    // createdAt is the real clock, so a sweep "an hour from now" sees both as stale.
    await releaseStaleHolds(new Date(Date.now() + 3_600_000));
    expect(await appointment(abandoned.id)).toBeUndefined();
    expect(await appointment(paidButClosedTab.id)).toMatchObject({ status: "pending" });
  });

  it("a fresh hold isn't swept", async () => {
    const h = await hold(alice, instant);
    await releaseStaleHolds(new Date());
    expect(await appointment(h.id)).toMatchObject({ status: "awaiting_payment" });
    expect(api.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it("releases the hold if Stripe refuses to create the session", async () => {
    stripeFake.fail.create = true;
    const h = await hold(alice, instant);
    expect(h.url).toBeNull();
    expect(await appointment(h.id)).toBeUndefined();
  });
});

describe("approval mode", () => {
  const practitionerViewer = () => ({ userId: clinicUser.userId, name: "approval", email: "approval@test", role: "practitioner" as const, practitionerId: approval });

  it("only holds the card, then charges it when the practitioner approves", async () => {
    const h = await hold(alice, approval);
    const params = api.checkout.sessions.create.mock.calls[0] as unknown as [{ payment_intent_data: object }];
    expect(params[0].payment_intent_data).toMatchObject({ capture_method: "manual" });

    pay(h.sessionId, "requires_capture");
    expect(await reconcileCheckout(h.id)).toBe("pending");
    expect(await payment(h.id)).toMatchObject({ status: "authorized" });
    expect(await events(h.id)).toEqual(["booked"]);

    expect(await approve(practitionerViewer(), h.id, NOW)).toMatchObject({ ok: true });
    expect(api.paymentIntents.capture).toHaveBeenCalledWith(`pi_${h.sessionId}`);
    expect(await payment(h.id)).toMatchObject({ status: "succeeded" });
  });

  it("releases the hold on decline, without charging", async () => {
    const h = await hold(alice, approval);
    pay(h.sessionId, "requires_capture");
    await reconcileCheckout(h.id);

    expect(await decline(practitionerViewer(), h.id, "", NOW)).toMatchObject({ ok: true });
    expect(api.paymentIntents.cancel).toHaveBeenCalledWith(`pi_${h.sessionId}`);
    expect(api.paymentIntents.capture).not.toHaveBeenCalled();
    expect(await payment(h.id)).toMatchObject({ status: "cancelled" });
  });

  it("marks the deposit failed when the capture fails, but keeps the approval", async () => {
    const h = await hold(alice, approval);
    pay(h.sessionId, "requires_capture");
    await reconcileCheckout(h.id);
    api.paymentIntents.capture.mockRejectedValueOnce(new Error("authorization expired"));

    expect(await approve(practitionerViewer(), h.id, NOW)).toMatchObject({ ok: true });
    expect(await appointment(h.id)).toMatchObject({ status: "confirmed" });
    expect(await payment(h.id)).toMatchObject({ status: "failed" });
  });
});

describe("webhook (PAY-2)", () => {
  let n = 0;
  /** A Stripe event about a session, as Stripe would POST it. */
  function event(type: string, sessionId: string, appointmentId: string) {
    return JSON.stringify({ id: `evt_${++n}`, object: "event", type, data: { object: { id: sessionId, object: "checkout.session", metadata: { appointmentId } } } });
  }
  async function post(body: string, secret = "whsec_test_fake") {
    const signature = (await vi.importActual<{ default: typeof Stripe }>("stripe")).default.webhooks.generateTestHeaderString({ payload: body, secret });
    return webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": signature } }));
  }

  it("completed: books a patient who paid but never came back", async () => {
    const h = await hold(alice, instant);
    pay(h.sessionId, "succeeded");
    expect((await post(event("checkout.session.completed", h.sessionId, h.id))).status).toBe(200);
    expect(await appointment(h.id)).toMatchObject({ status: "confirmed" });
    expect(await payment(h.id)).toMatchObject({ status: "succeeded" });
  });

  it("a replayed event is a no-op", async () => {
    const h = await hold(alice, instant);
    pay(h.sessionId, "succeeded");
    const body = event("checkout.session.completed", h.sessionId, h.id);
    await post(body);
    vi.clearAllMocks();

    expect((await post(body)).status).toBe(200);
    expect(api.checkout.sessions.retrieve).not.toHaveBeenCalled();
    expect(await events(h.id)).toEqual(["booked", "confirmed"]);
    expect(await db.select().from(schema.stripeEvents)).toHaveLength(1);
  });

  it("expired: frees the time", async () => {
    const h = await hold(alice, instant);
    sessions.get(h.sessionId)!.status = "expired";
    expect((await post(event("checkout.session.expired", h.sessionId, h.id))).status).toBe(200);
    expect(await appointment(h.id)).toBeUndefined();
  });

  it("rejects a bad signature without touching anything", async () => {
    const h = await hold(alice, instant);
    pay(h.sessionId, "succeeded");
    expect((await post(event("checkout.session.completed", h.sessionId, h.id), "whsec_wrong")).status).toBe(400);
    expect(await appointment(h.id)).toMatchObject({ status: "awaiting_payment" });
    expect(await db.select().from(schema.stripeEvents)).toHaveLength(0);
  });

  it("answers 500 when handling fails, so Stripe's retry runs it again", async () => {
    const h = await hold(alice, instant);
    pay(h.sessionId, "succeeded");
    const body = event("checkout.session.completed", h.sessionId, h.id);
    api.checkout.sessions.retrieve.mockRejectedValueOnce(new Error("Stripe is down"));

    expect((await post(body)).status).toBe(500);
    expect(await db.select().from(schema.stripeEvents)).toHaveLength(0);
    expect((await post(body)).status).toBe(200);
    expect(await appointment(h.id)).toMatchObject({ status: "confirmed" });
  });

  it("ignores events it doesn't act on", async () => {
    expect((await post(event("customer.created", "cus_1", ""))).status).toBe(200);
    expect(await db.select().from(schema.stripeEvents)).toHaveLength(0);
  });
});

describe("refund on cancel (PAY-3)", () => {
  const DAYS_BEFORE = new Date(NOW.getTime() - 2 * 86_400_000); // 51 hours before TEN
  const patientViewer = () => ({ ...alice, name: "alice", email: "alice@test", role: "patient" as const });
  const clinicViewer = () => ({ userId: clinicUser.userId, name: "approval", email: "approval@test", role: "practitioner" as const, practitionerId: approval });

  async function booked(practitionerId: string) {
    const h = await hold(alice, practitionerId);
    pay(h.sessionId, practitionerId === instant ? "succeeded" : "requires_capture");
    await reconcileCheckout(h.id);
    if (practitionerId === approval) await approve(clinicViewer(), h.id, NOW);
    return h;
  }

  it("refunds a patient who cancels 24h or more ahead", async () => {
    const h = await booked(instant);
    expect(await cancelDepositNote(patientViewer(), h.id, TEN, DAYS_BEFORE)).toBe("Your $25.00 deposit will be refunded.");
    expect(await cancel(patientViewer(), h.id, "", DAYS_BEFORE)).toMatchObject({ ok: true });
    expect(api.refunds.create).toHaveBeenCalledWith({ payment_intent: `pi_${h.sessionId}` }, { idempotencyKey: expect.stringMatching(/^refund-/) });
    expect(await payment(h.id)).toMatchObject({ status: "refunded" });
  });

  it("keeps the deposit when the patient cancels later than that", async () => {
    const h = await booked(instant);
    expect(await cancelDepositNote(patientViewer(), h.id, TEN, NOW)).toMatch(/won't be refunded/);
    expect(await cancel(patientViewer(), h.id, "", NOW)).toMatchObject({ ok: true });
    expect(api.refunds.create).not.toHaveBeenCalled();
    expect(await payment(h.id)).toMatchObject({ status: "succeeded" });
  });

  it("always refunds when the clinic cancels", async () => {
    const h = await booked(approval);
    expect(await cancel(clinicViewer(), h.id, "Practitioner is ill", NOW)).toMatchObject({ ok: true });
    expect(await payment(h.id)).toMatchObject({ status: "refunded" });
  });

  it("refunds the original deposit when a rescheduled appointment is cancelled", async () => {
    const h = await booked(instant);
    const later = new Date(TEN.getTime() + 86_400_000);
    const moved = await bookSlot(alice, slotIdFor(instant, later), "Check-up", DAYS_BEFORE, { rescheduleFromId: h.id });
    if (!moved.ok) throw new Error(moved.error);
    expect(await cancel(patientViewer(), moved.appointmentId, "", DAYS_BEFORE)).toMatchObject({ ok: true });
    expect(await payment(h.id)).toMatchObject({ status: "refunded" });
  });

  it("still cancels if Stripe refuses the refund, leaving the payment as charged", async () => {
    const h = await booked(instant);
    api.refunds.create.mockRejectedValueOnce(new Error("Stripe is down"));
    expect(await cancel(patientViewer(), h.id, "", DAYS_BEFORE)).toMatchObject({ ok: true });
    expect(await appointment(h.id)).toMatchObject({ status: "cancelled" });
    expect(await payment(h.id)).toMatchObject({ status: "succeeded" });
  });
});
