/* Safe re-export shim: components that render outside the
   MarketplaceProvider (e.g. the floating LunaAssistant on the public
   feed) still want to log real user actions without crashing when the
   provider is absent. This wrapper never throws. */
import { recordActivity } from "./studioActivity.js";

export function pushActivitySafe(type, label, meta) {
  try {
    recordActivity(type, label, meta);
  } catch {
    // best-effort only
  }
}
