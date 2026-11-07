import { ECDH } from "node:crypto";
import { subscriptionShape } from "../lib/push-input.ts";

export { parsePlan } from "../lib/push-input.ts";

export function parseSubscription(value) {
  const subscription = subscriptionShape(value);
  if (!subscription) return;
  try {
    ECDH.convertKey(Buffer.from(subscription.keys.p256dh, "base64url"), "prime256v1");
    return subscription;
  } catch { return undefined; }
}
