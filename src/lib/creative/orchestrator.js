// The Creative Orchestrator — one pipeline per product, from real evidence (pure, no I/O).
//
//   ProductFacts → ContentStrategy → CreativeGeneration → QualityControl →
//   ProductPublishing → PerformanceFeedback
//
// Each stage reads what really exists — the catalog record, the plan
// (engine.js), the Creative Engine's job ledger (ops/creative jobs.json), the
// site's reels feed and the recorded click/view events — and reports one of:
//   COMPLETED          its output exists AND every validation check passed
//   PENDING            waiting on a step that runs on its own (the next engine run, the deploy)
//   BLOCKED            cannot run: a missing input or dependency, with the exact blocker
//   FAILED             ran and failed (QC, render, an output that went missing)
//   SKIPPED            an earlier stage is not completed
//   INSUFFICIENT_DATA  measured, but too few real events to say anything
// Nothing is marked COMPLETED from a plan, a mock or an assumption.
//
// The execution-method registry says, per method, whether it can run here
// and now: AVAILABLE, DELEGATED (another free executor in this repo runs it),
// UNAVAILABLE (a dependency is missing — named) or PAID_LOCKED (it needs a
// paid provider; the server-side lock, costGuard.js, keeps it off).
import { JOB, MODES, planProduct, validateProduct } from "./engine.js";
import { paidGenerationEnabled } from "./costGuard.js";
import { galleryPicks } from "../looks.js";
import { SELLER_REVIEWED, SELLER_SKIP } from "../reelsFeed.js";
import { MIN_EVIDENCE } from "../growth/likeloop.js";

export const STAGES = Object.freeze(["ProductFacts", "ContentStrategy", "CreativeGeneration", "QualityControl", "ProductPublishing", "PerformanceFeedback"]);
export const STATUS = Object.freeze({
  COMPLETED: "COMPLETED",
  PENDING: "PENDING",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
});
export const AVAILABILITY = Object.freeze({ AVAILABLE: "AVAILABLE", DELEGATED: "DELEGATED", UNAVAILABLE: "UNAVAILABLE", PAID_LOCKED: "PAID_LOCKED" });
export const STAGE_HE = Object.freeze({
  ProductFacts: "נתוני המוצר",
  ContentStrategy: "אסטרטגיה ותסריט",
  CreativeGeneration: "יצירת הסרטון",
  QualityControl: "בדיקות איכות",
  ProductPublishing: "פרסום בעמוד המוצר",
  PerformanceFeedback: "ביצועים",
});

/* ───────────────────────────────────────────── execution methods */

/**
 * Every way LikeLink2 can make part of a product video. `paid` methods are
 * benchmarks of what paid studios offer; with no adapter and the paid lock
 * closed they never run. `check(ctx)` decides availability for one product.
 */
export const METHODS = Object.freeze([
  {
    id: "photo_motion", kind: "F", he: "תמונות המוכר בתנועת מצלמה (Ken Burns מדויק)", paid: false,
    executor: "creative-engine (ffmpeg on GitHub Actions)", dependencies: ["ffmpeg", "chromium", "github_actions", "store_media"],
    check: ({ photos }) => (photos >= 2 ? ok() : no("needs_two_checked_photos", "צריך לפחות 2 תמונות מוצר שנבדקו בעין (STORE_GALLERY_PICKS)")),
  },
  {
    id: "seller_footage_cut", kind: "D", he: "קטעים מסרטון המוכר בגרייד קולנועי והילוך איטי", paid: false,
    executor: "creative-engine (ffmpeg)", dependencies: ["ffmpeg", "store_media"],
    check: ({ productId }) => (SELLER_SKIP[productId] ? no("clip_shows_another_item", "בסרטון המוכר רואים פריט אחר") : SELLER_REVIEWED[productId] ? ok() : no("clip_not_checked", "סרטון המוכר עוד לא נבדק בעין")),
  },
  {
    id: "editorial_type", kind: "G", he: "טיפוגרפיה עברית (RTL), כותרת, שם המוצר ותוויות גילוי", paid: false,
    executor: "creative-engine (Chromium draws Hebrew, ffmpeg composes)", dependencies: ["chromium", "ffmpeg"],
    check: () => ok(),
  },
  {
    id: "luna_presenter", kind: "A", he: "לונה מדברת (דמות AI מקורית, קול עברי, הנפשת פה)", paid: false,
    executor: "luna-reels workflow (edge-tts + SadTalker on CPU, ~2 h)", dependencies: ["edge_tts", "github_actions"],
    check: () => delegated("luna_reels", "רץ בזרימת 'Luna reels' (סרטון נפרד, מסומן כדמות AI)"),
  },
  {
    id: "stylized_animation", kind: "E", he: "אנימציה מסוגננת עם דמות מקורית", paid: false,
    executor: "media-render workflow (Chromium canvas) — on demand", dependencies: ["chromium", "github_actions"],
    check: () => delegated("media_render", "רק לפי דרישה: כל רינדור נשמר באחסון הענן ומוריד ממכסת התעבורה"),
  },
  {
    id: "real_ugc", kind: "B", he: "UGC אמיתי: סרטון שאדם צילם עם המוצר", paid: false,
    executor: "product-video workflow (clip input)", dependencies: ["owner_footage"],
    check: ({ ownFootage }) => (ownFootage ? ok() : no("needs_owner_footage", "צריך סרטון שאדם אמיתי צילם עם המוצר; אין לקוחה מומצאת")),
  },
  {
    id: "product_in_hand_ai", kind: "C", he: "דמות AI מחזיקה את המוצר", paid: false,
    executor: "none", dependencies: ["verified_free_model"],
    check: () => no("no_verified_free_model", "אין מודל חינמי שנבדק ומראה את המוצר האמיתי ביד; במקום זה: תמונות המוכר עם המוצר על הדוגמנית"),
  },
  { id: "heygen_avatar", kind: "A", he: "אווטאר מדבר (שירות בתשלום)", paid: true, executor: "none (no adapter)", dependencies: ["paid_provider"] },
  { id: "makeugc_ad", kind: "B", he: "מודעת UGC סינתטית (שירות בתשלום)", paid: true, executor: "none (no adapter)", dependencies: ["paid_provider"] },
  { id: "higgsfield_cinematic", kind: "D", he: "וידאו קולנועי גנרטיבי (שירות בתשלום)", paid: true, executor: "none (no adapter)", dependencies: ["paid_provider"] },
  { id: "elevenlabs_voice", kind: "A", he: "קול סינתטי (שירות בתשלום)", paid: true, executor: "viral-reel workflow", dependencies: ["paid_provider"] },
]);

function ok() { return { state: AVAILABILITY.AVAILABLE }; }
function no(code, he) { return { state: AVAILABILITY.UNAVAILABLE, blocker: { code, he } }; }
function delegated(to, he) { return { state: AVAILABILITY.DELEGATED, delegatedTo: to, note: he }; }

/** Availability of every method for one product. Paid methods are PAID_LOCKED unless the server lock is open — and even then have no adapter. */
export function methodAvailability(product, { env = {}, ownFootage = false } = {}) {
  const ctx = { productId: product?.id, photos: galleryPicks(product).length, ownFootage };
  return METHODS.map((m) => {
    if (m.paid) {
      return {
        id: m.id, kind: m.kind, he: m.he, paid: true, executor: m.executor, dependencies: m.dependencies,
        state: AVAILABILITY.PAID_LOCKED,
        blocker: paidGenerationEnabled(env)
          ? { code: "no_adapter", he: "אין חיבור (adapter) לשירות הזה בקוד" }
          : { code: "paid_generation_disabled", he: "שירות בתשלום — נעול בשרת (אין קרדיטים בתשלום)" },
      };
    }
    return { id: m.id, kind: m.kind, he: m.he, paid: false, executor: m.executor, dependencies: m.dependencies, ...m.check(ctx) };
  });
}

/**
 * Per scene of the lookbook, the method that makes it and the alternatives
 * it beat, each with its reason. The first AVAILABLE method in the scene's
 * preference order wins; nothing unavailable is ever chosen.
 */
export const SCENE_PREFERENCES = Object.freeze({
  opening: ["product_in_hand_ai", "real_ugc", "photo_motion"],
  closeup: ["real_ugc", "seller_footage_cut", "photo_motion"],
  detail: ["photo_motion"],
  end: ["editorial_type"],
});

export function routeScenes(availability) {
  const byId = new Map(availability.map((a) => [a.id, a]));
  return Object.entries(SCENE_PREFERENCES).map(([scene, prefs]) => {
    const rejected = [];
    let chosen = null;
    for (const id of prefs) {
      const a = byId.get(id);
      if (a?.state === AVAILABILITY.AVAILABLE) { chosen = id; break; }
      rejected.push({ id, state: a?.state || AVAILABILITY.UNAVAILABLE, reason: a?.blocker?.code || a?.delegatedTo || "unknown" });
    }
    return { scene, chosen, rejected };
  });
}

/* ─────────────────────────────────────────────────── stages */

/** A stage is COMPLETED only with an output and every check passing; otherwise FAILED with the failing checks. */
function verified(id, output, checks) {
  const list = checks.map(([name, pass]) => ({ name, pass: Boolean(pass) }));
  const pass = output != null && list.every((c) => c.pass);
  return { id, status: pass ? STATUS.COMPLETED : STATUS.FAILED, output: pass ? output : output ?? null, validation: { pass, checks: list }, blocker: pass ? null : { code: "validation_failed", he: `בדיקה נכשלה: ${list.filter((c) => !c.pass).map((c) => c.name).join(", ")}` } };
}
const stage = (id, status, extra = {}) => ({ id, status, output: null, validation: null, blocker: null, ...extra });
const skipped = (id, after) => stage(id, STATUS.SKIPPED, { blocker: { code: "upstream_not_completed", he: `ממתין לשלב "${STAGE_HE[after] || after}"` } });

/** The job for this product in the ledger: one of the plan's own keys first, else the newest live one. */
export function jobFor(ledger, productId, key) {
  const keys = [].concat(key);
  const jobs = (ledger?.jobs || []).filter((j) => j.productId === productId && j.status !== JOB.SUPERSEDED);
  return jobs.find((j) => keys.includes(j.key)) || jobs[0] || null;
}

/**
 * The keys a job made from the current product could carry. Whether the seller
 * clip is on hand is the runner's fact (the product-video-sources release), not
 * the Studio's, so the plan with that one input flipped counts too; any other
 * change (title, photos, link, template) gives a key no job has yet.
 */
function planKeys(product, plan, { products, sellerVideos }) {
  const flipped = new Set(sellerVideos);
  if (flipped.has(product.id)) flipped.delete(product.id);
  else flipped.add(product.id);
  const alt = planProduct(product, { products, sellerVideos: flipped, mode: MODES.ZERO_PAID_CREDITS });
  return alt.ok && alt.key !== plan.key ? [plan.key, alt.key] : [plan.key];
}

/**
 * Run the whole pipeline for one product from the evidence at hand.
 * @param ctx.products the catalog (raw records)
 * @param ctx.sellerVideos product ids with a seller clip on hand (the engine's runner knows; the Studio passes the reviewed set)
 * @param ctx.ledger the Creative Engine's jobs.json (or null when it could not be read)
 * @param ctx.feed the site's reels feed index.json (or null)
 * @param ctx.events recorded click/view events (marketplace:clicks)
 */
export function orchestrate(product, { products = [], sellerVideos = new Set(), ledger = null, feed = null, events = [], env = {}, now = Date.now() } = {}) {
  const id = product?.id || "";
  const stages = [];
  const availability = methodAvailability(product, { env });

  // 1) ProductFacts
  const valid = validateProduct(product, products);
  const facts = valid.ok
    ? {
        title: product.title,
        affiliateUrl: product.affiliateUrl,
        price: Number(product.price) > 0 ? { value: Number(product.price), currency: product.currency || "ILS", source: product.priceSource || "", checkedAt: product.priceCheckedAt || null } : null,
        checkedPhotos: galleryPicks(product).length,
        category: product.category || "",
      }
    : null;
  stages.push(valid.ok
    ? verified("ProductFacts", facts, [["own_https_affiliate_link", /^https:\/\//.test(facts.affiliateUrl)], ["title", Boolean(facts.title)], ["price_has_source", !facts.price || Boolean(facts.price.source)]])
    : stage("ProductFacts", STATUS.BLOCKED, { blocker: { code: valid.issues.join(","), he: "נתוני המוצר לא תקינים לפרסום (קישור, תמונה, אישור)" } }));

  // 2) ContentStrategy
  let plan = null;
  if (stages[0].status !== STATUS.COMPLETED) stages.push(skipped("ContentStrategy", "ProductFacts"));
  else {
    plan = planProduct(product, { products, sellerVideos, mode: MODES.ZERO_PAID_CREDITS });
    if (!plan.ok) {
      stages.push(stage("ContentStrategy", STATUS.BLOCKED, {
        blocker: { code: plan.reason, he: plan.reason === "no_worn_photo_checked" ? "אין תמונה נקייה של המוצר על דוגמנית — המוצר מקבל את הסרטון של לונה במקום" : "אין שיטה חינמית שמתאימה למוצר הזה" },
        fallback: plan.delegate || null,
      }));
    } else {
      const scenes = routeScenes(availability);
      stages.push(verified("ContentStrategy", {
        class: plan.class, audience: plan.audience, template: plan.template, look: plan.look,
        opening: plan.script.opening.text, name: plan.script.name, end: plan.script.end, labels: plan.script.labels,
        caption: plan.caption, scenes, key: plan.key,
      }, [
        ["disclosure_on_every_frame", plan.script.labels.some((l) => /#פרסומת/.test(l))],
        ["whose_media_named", plan.script.labels.some((l) => /המוכר/.test(l))],
        ["every_scene_has_an_available_method", scenes.every((s) => s.chosen)],
        ["zero_paid_credits", plan.mode === MODES.ZERO_PAID_CREDITS],
      ]));
    }
  }

  // 3) CreativeGeneration — only a stored, measured file counts.
  const keys = plan?.ok ? planKeys(product, plan, { products, sellerVideos }) : [];
  const job = plan?.ok ? jobFor(ledger, id, keys) : null;
  if (stages[1].status !== STATUS.COMPLETED) stages.push(skipped("CreativeGeneration", "ContentStrategy"));
  else if (!ledger) stages.push(stage("CreativeGeneration", STATUS.PENDING, { blocker: { code: "ledger_unreadable", he: "לא הצלחנו לקרוא את יומן המשימות של המנוע" } }));
  else if (!job || job.status === JOB.QUEUED) stages.push(stage("CreativeGeneration", STATUS.PENDING, { blocker: { code: "awaiting_engine_run", he: "ממתין להרצה הבאה של המנוע (כל יום 04:20 UTC)" } }));
  // An older job, made before the product changed: the current plan has not run yet.
  else if (!keys.includes(job.key)) stages.push(stage("CreativeGeneration", STATUS.PENDING, { blocker: { code: "plan_changed_awaiting_run", he: "נתוני המוצר השתנו מאז הסרטון האחרון — ההרצה הבאה של המנוע (04:20 UTC) תכין גרסה מעודכנת" }, job: { id: job.id, status: job.status } }));
  else if (job.status === JOB.FAILED || job.status === JOB.DEAD) stages.push(stage("CreativeGeneration", STATUS.FAILED, { blocker: { code: job.error?.class || "render_failed", he: job.status === JOB.DEAD ? `נכשל ${job.attempts} פעמים — צריך בדיקה: ${job.error?.message || ""}` : `נכשל, ינסה שוב אחרי ${new Date(job.nextAttemptAt || now).toISOString()}` }, job: { id: job.id, status: job.status, attempts: job.attempts } }));
  else stages.push(verified("CreativeGeneration", { file: job.output?.file, bytes: job.output?.bytes, seconds: job.output?.seconds, sha256: job.output?.sha256, jobId: job.id, keyMatchesPlan: keys.includes(job.key) }, [
    ["file_exists", Boolean(job.output?.file) && Number(job.output?.bytes) > 0],
    ["fingerprint_recorded", /^[0-9a-f]{64}$/.test(String(job.output?.sha256 || ""))],
    ["made_from_this_plan", keys.includes(job.key)],
  ]));

  // 4) QualityControl
  if (stages[2].status !== STATUS.COMPLETED) stages.push(skipped("QualityControl", "CreativeGeneration"));
  else stages.push(verified("QualityControl", { checks: job.qc?.checks || [], seconds: job.qc?.seconds, width: job.qc?.width, height: job.qc?.height }, [["qc_ran", Array.isArray(job.qc?.checks) && job.qc.checks.length > 0], ["qc_passed", job.qc?.pass === true]]));

  // 5) ProductPublishing — LIVE only with the engine's byte proof AND the entry still in today's feed.
  const entry = (feed?.reels || []).find((e) => e?.id === `lookbook-${id}`);
  if (stages[3].status !== STATUS.COMPLETED) stages.push(skipped("ProductPublishing", "QualityControl"));
  else if (job.status === JOB.STORED) stages.push(stage("ProductPublishing", STATUS.PENDING, { blocker: { code: "awaiting_site_deploy", he: "הסרטון שמור; ממתין לעדכון האתר והבדיקה הבאה" } }));
  else if (job.status === JOB.LIVE) stages.push(verified("ProductPublishing", { page: `/p/${id}`, feedId: job.live?.feedId, bytes: job.live?.bytes, checkedAt: job.live?.checkedAt }, [
    ["byte_proof", Number(job.live?.bytes) > 0 && Number(job.live?.bytes) === Number(job.release?.bytes)],
    ["still_in_site_feed", feed ? Boolean(entry) : true],
    ["disclosure_label_in_feed", feed ? Boolean(entry?.labels?.some((l) => /#פרסומת/.test(l))) : true],
  ]));
  else stages.push(stage("ProductPublishing", STATUS.PENDING, { blocker: { code: "awaiting_storage", he: "הקובץ עוד לא נשמר" } }));

  // 6) PerformanceFeedback — recorded events only, never estimated.
  const camp = `v-lookbook-${id}`;
  if (stages[4].status !== STATUS.COMPLETED) stages.push(skipped("PerformanceFeedback", "ProductPublishing"));
  else {
    const mine = (Array.isArray(events) ? events : []).filter((e) => e && e.productId === id && (e.camp === camp || e.cid === camp) && e.src !== "e2e_check");
    const clicks = mine.filter((e) => e.type !== "view").length;
    const views = mine.filter((e) => e.type === "view").length;
    const output = { campaign: camp, clicks, views, minEvidence: MIN_EVIDENCE, since: job?.live?.checkedAt || null };
    stages.push(clicks + views === 0
      ? stage("PerformanceFeedback", STATUS.INSUFFICIENT_DATA, { output, blocker: { code: "no_attributed_events_yet", he: "עוד אין קליקים או צפיות שנרשמו מהסרטון הזה" } })
      : clicks + views < MIN_EVIDENCE
        ? stage("PerformanceFeedback", STATUS.INSUFFICIENT_DATA, { output, blocker: { code: "below_min_evidence", he: `נרשמו ${clicks + views} אירועים; מסקנה רק אחרי ${MIN_EVIDENCE}` } })
        : verified("PerformanceFeedback", output, [["measured_events", true]]));
  }

  const done = stages.filter((s) => s.status === STATUS.COMPLETED).length;
  return { productId: id, stages, availability, completed: done, of: STAGES.length, video: entry ? { url: entry.video, look: entry.look, labels: entry.labels } : null, mode: MODES.ZERO_PAID_CREDITS };
}
