// Landing attribution — where a visit came from, recorded ONLY when the URL
// says so (utm_* / cid / ref) or the referrer host is known. Kept for the
// browser session so a click later in the visit carries the same creative.
// Never guessed; never contains personal data.
const KEY = "ll_attr";
const clip = (v, n) => (v ? String(v).slice(0, n) : null);

export function landingAttribution() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { saved = null; }
  let fromUrl = null;
  try {
    const q = new URLSearchParams(window.location.search);
    const a = {
      src: clip(q.get("utm_source") || q.get("ref"), 80),
      med: clip(q.get("utm_medium"), 60),
      camp: clip(q.get("utm_campaign"), 80),
      cnt: clip(q.get("utm_content"), 60),
      cid: clip(/^[A-Za-z0-9_-]{1,60}$/.test(q.get("cid") || "") ? q.get("cid") : null, 60),
    };
    if (a.src || a.cid) {
      fromUrl = a;
      try { sessionStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode */ }
    }
  } catch { /* no window */ }
  let ref = null;
  try { ref = document.referrer ? new URL(document.referrer).hostname : null; } catch { ref = null; }
  const a = fromUrl || saved || (ref ? { src: clip(ref, 80) } : {});
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v));
}
