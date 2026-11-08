import { getStripe } from "@/server/billing/stripe";
import { pgBillingStore } from "@/server/billing/store";
import { WebhookSignatureError, handleStripeEvent, verifyStripeEvent } from "@/server/billing/webhook";

/**
 * Stripe webhook endpoint.
 *  400: bad or missing signature (Stripe will not retry a 4xx forever, and it should not).
 *  500: our failure. Nothing was committed, so Stripe's retry is safe.
 *  200: processed, duplicate, or an event type we do not handle.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  // The signature covers the exact bytes Stripe sent, so read the raw body.
  const payload = await request.text();

  let event;
  try {
    event = verifyStripeEvent(getStripe(), payload, request.headers.get("stripe-signature"), secret);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return Response.json({ error: "Invalid signature." }, { status: 400 });
    }
    throw err;
  }

  try {
    const outcome = await handleStripeEvent(event, pgBillingStore);
    return Response.json(outcome);
  } catch (err) {
    console.error(`[stripe] failed to process ${event.type} ${event.id}`, err);
    return Response.json({ error: "Processing failed." }, { status: 500 });
  }
}
