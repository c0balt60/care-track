// Stripe's webhook (PAY-2 #30). Stripe POSTs events here; nobody signs in, so the only
// proof the request is from Stripe is its signature (verifyStripeEvent in lib/payments.ts).
//
//   400  signature missing or wrong: Stripe doesn't retry, and nothing was touched
//   500  handling failed: Stripe retries later (the event isn't marked handled)
//   200  handled, already handled before, or an event type we don't act on
//
// Locally: stripe listen --forward-to localhost:3000/api/stripe/webhook
import { logger } from "@/lib/logger";
import { handleStripeEvent, verifyStripeEvent } from "@/lib/payments";

const log = logger.child({ module: "stripe-webhook" });

export async function POST(request: Request) {
  // The raw body: the signature covers these exact bytes, so don't parse it first.
  const event = verifyStripeEvent(await request.text(), request.headers.get("stripe-signature"));
  if (!event) return new Response("Invalid signature", { status: 400 });

  try {
    await handleStripeEvent(event);
  } catch (err) {
    log.error({ err, eventId: event.id, type: event.type }, "could not handle Stripe event");
    return new Response("Failed", { status: 500 });
  }
  return new Response(null, { status: 200 });
}
