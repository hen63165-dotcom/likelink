// Likelink PWA layer — Service Worker registration, install prompt,
// Share Target handling and Web Push subscription.
// Imported once from main.jsx — everything else is event-driven.

const SW_URL = "/sw.js";

let deferredInstallPrompt = null;

function registerSW() {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
  navigator.serviceWorker
    .register(SW_URL)
    .then((reg) => {
      // look for an updated worker every time the page loads
      reg.update().catch(() => {});
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            // new version waiting — refresh smoothly on next visit
            nw.postMessage("SKIP_WAITING");
          }
        });
      });
    })
    .catch(() => {});
}

function handleInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // expose for UI ("התקני את Likelink" banner can call window.__likelinkPwa.install())
    window.__likelinkPwa = window.__likelinkPwa || {};
    window.__likelinkPwa.canInstall = true;
  });
}

async function promptInstall() {
  if (!deferredInstallPrompt) return "unavailable";
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return outcome; // "accepted" | "dismissed"
}

// ─── Share Target: קבלת קישור מוואטסאפ/אינסטגרם/חולק-מערכת ─────────────────
// manifest share_target opens "/" with ?title=&text=&url= — we capture it,
// stash the shared link and notify the app to prefill the studio form.

function handleShareTarget() {
  const params = new URLSearchParams(location.search);
  const sharedUrl = params.get("url") || extractUrl(params.get("text") || "");
  if (!sharedUrl) return;
  sessionStorage.setItem("likelink_shared_product", JSON.stringify({
    url: sharedUrl,
    title: params.get("title") || "",
    ts: Date.now(),
  }));
  history.replaceState(null, "", location.pathname); // clean the URL bar
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("likelink:shared-product", { detail: { url: sharedUrl } }));
  }, 800); // let the app mount first
}

function extractUrl(text) {
  const m = String(text).match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : "";
}

export function getSharedProduct() {
  try {
    const raw = sessionStorage.getItem("likelink_shared_product");
    if (!raw) return null;
    sessionStorage.removeItem("likelink_shared_product");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── Web Push ───────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}

export async function subscribeToPush(marketerId) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "unsupported" };
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: permission };

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch("/api/push?publicKey=1");
      const { publicKey } = await res.json();
      if (!publicKey) return { ok: false, reason: "no_vapid_key" };
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "subscribe", marketerId, subscription: sub.toJSON() }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}

// ─── boot ───────────────────────────────────────────────────────────────────

registerSW();
handleInstallPrompt();
handleShareTarget();

window.__likelinkPwa = Object.assign(window.__likelinkPwa || {}, {
  install: promptInstall,
  subscribeToPush,
});
