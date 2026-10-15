/**
 * AddProductLink — the Studio's dedicated screen:
 * "הוספת מוצר — מדביקים קישור וממשיכים".
 *
 * Three honest routes, one big paste field:
 *   1. "יש לי כבר קישור אפילייט" → the address is validated and stored EXACTLY
 *      as pasted (tracking is added only at click time, never as a silent
 *      rewrite of what the creator gave us).
 *   2. "יש לי רק קישור למוצר"      → we ask the platform's own authorized
 *      integration (affiliate-status) whether a commission link can be created;
 *      when it cannot, we explain how to create one in the creator's network.
 *   3. "ייבוא מוצרים"             → enabled only when that same integration
 *      answers "configured"; otherwise the honest "not available" state shows.
 *
 * Preview data (image / title / price) comes from the existing safe fetcher
 * (/api/fetch-product-info → server-side, follows redirects). When it fails we
 * never show a broken card — the manual fields open instead. No price,
 * commission, rating or sale is ever invented.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Link2, ShieldCheck, Download, Store, Check, CircleAlert, Loader2, Upload,
  Copy, ExternalLink, Trash2, Pencil, Plus,
} from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button, LabeledInput, LabeledTextarea } from "../ui/index.jsx";
import { fetchProductInfo } from "../../lib/productInfo.js";
import { uploadProductImage, safePreviewSrc, safeHref } from "../../lib/uploadImage.js";
import { CATEGORY_KEYS } from "../../lib/i18n.js";
import { money, isSafeImageUrl, DEFAULT_PRODUCT_IMAGE } from "../../utils/helpers.js";
import { withBase } from "../../lib/basePath.js";
import {
  LINK_ROUTE, AFFILIATE_DISCLOSURE, validateAffiliateUrl, classifyAffiliateUrl,
  linkErrorText, fetchAffiliateIntegration, networkGuide,
  AFFILIATE_NETWORKS, NETWORKS_BY_ID, PROMO_CHANNELS, LINK_STATUS,
  affiliateNetworkOf, linkStatusOf, linkStatusLabel, linkStatusTone,
  findDuplicateByUrl, parseLinksCsv,
} from "../../lib/affiliateLink.js";
import AffiliateAccounts, { readAccounts } from "./AffiliateAccounts.jsx";

const ROUTES = [
  {
    id: LINK_ROUTE.AFFILIATE,
    icon: Link2,
    he: { title: "יש לי כבר קישור אפילייט", body: "מדביקות את הקישור כמו שהוא — הוא נשמר במדויק, כולל המזהה שלכן." },
    en: { title: "I already have an affiliate link", body: "Paste it as-is — it is stored exactly, including your own ID." },
  },
  {
    id: LINK_ROUTE.PRODUCT,
    icon: ShieldCheck,
    he: { title: "יש לי רק קישור למוצר", body: "בודקים אם קיימת אינטגרציה מורשית ליצירת קישור עמלה; אם לא — הסבר איך ליצור אותו ברשת שלכן." },
    en: { title: "I only have a product link", body: "We check for an authorized integration that can create a commission link; if not, we explain how to make one in your network." },
  },
  {
    id: LINK_ROUTE.IMPORT,
    icon: Download,
    he: { title: "ייבוא מוצרים", body: "זמין רק כשקיימת אינטגרציה פעילה עם הרשאות מתאימות ומידע שניתן לייבא בפועל." },
    en: { title: "Import products", body: "Available only with an active integration, the right permissions and data that can really be imported." },
  },
];

const EMPTY_FIELDS = {
  title: "", description: "", image: "", category: CATEGORY_KEYS[0], price: "", commission: "",
  network: "", accountId: "", campaign: "", utmSource: "", utmMedium: "", utmCampaign: "",
};

const TONE_COLORS = {
  success: { bg: "var(--success-subtle)", fg: "var(--success)", border: "transparent" },
  warning: { bg: "var(--warning-subtle, #fff7e6)", fg: "var(--warning, #b45309)", border: "transparent" },
  muted: { bg: "var(--bg-subtle)", fg: "var(--text-faint)", border: "var(--border)" },
  danger: { bg: "var(--danger-subtle)", fg: "var(--danger)", border: "transparent" },
};

/** Small colored pill for an honest link status. */
function StatusPill({ status, lang }) {
  if (!status) return null;
  const tone = TONE_COLORS[linkStatusTone(status)] || TONE_COLORS.muted;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
    >
      {linkStatusLabel(status, lang)}
    </span>
  );
}

/** Shared integration probe: the server is the only source of truth. */
function useAffiliateIntegration() {
  const [state, setState] = useState({ state: "unknown", loading: true });
  useEffect(() => {
    let alive = true;
    fetchAffiliateIntegration()
      .then((res) => { if (alive) setState({ ...res, loading: false }); })
      .catch(() => { if (alive) setState({ state: "unknown", loading: false, error: "unreachable" }); });
    return () => { alive = false; };
  }, []);
  return state;
}

/**
 * @param {object} props
 * @param {(v:string)=>void} [props.onNavigate] studio view navigation
 * @param {boolean} [props.compact] onboarding mode (no product list chrome)
 * @param {(p:{id:string,status:string}|null)=>void} [props.onSaved] after a real save
 */
export default function AddProductLink({ onNavigate, compact = false, onSaved }) {
  const { lang, categoryLabel } = useI18n();
  const he = lang === "he";
  const {
    currentMarketer: marketer, products, collections, showToast,
    onAddProduct, onUpdateProduct, onSetStatus, onDeleteProduct,
    onAddCollection, onUpdateCollection, onUpdateMarketer,
  } = useMarketplace();

  const [route, setRoute] = useState(LINK_ROUTE.AFFILIATE);
  const [routesOpen, setRoutesOpen] = useState(false);
  const showRoutes = routesOpen || route !== LINK_ROUTE.AFFILIATE;
  const [urlRaw, setUrlRaw] = useState("");
  const [checked, setChecked] = useState(null);   // validation result
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);   // {title,image,price,currency}
  const [previewFailed, setPreviewFailed] = useState(false);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);       // {id,status}
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [collectionPick, setCollectionPick] = useState("");
  const [networkPick, setNetworkPick] = useState("");      // "" = auto from URL
  const [accountPick, setAccountPick] = useState("");
  const [channels, setChannels] = useState([]);            // promo channels (traffic sources)
  const [csvText, setCsvText] = useState("");              // bulk CSV import
  const [csvResult, setCsvResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [search, setSearch] = useState("");                // dashboard filters
  const [filterNetwork, setFilterNetwork] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [selected, setSelected] = useState([]);            // bulk-select ids
  const [bulkBusy, setBulkBusy] = useState(false);
  const integration = useAffiliateIntegration();

  const accounts = useMemo(() => readAccounts(marketer), [marketer]);

  const set = (k) => (v) => setFields((s) => ({ ...s, [k]: v }));
  const mine = useMemo(
    () => (products || []).filter((p) => p.marketerId === marketer?.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [products, marketer]
  );
  const myCollections = useMemo(
    () => (collections || []).filter((c) => c.marketerId === marketer?.id),
    [collections, marketer]
  );
  const storeUrl = marketer?.slug ? `${window.location.origin}${withBase(`/u/${marketer.slug}`)}` : "";

  /** Validate + fetch a safe preview. Never throws, never fakes a result. */
  async function checkLink() {
    setErr("");
    const v = validateAffiliateUrl(urlRaw);
    setChecked(v);
    if (!v.ok) { setPreview(null); setPreviewFailed(false); return; }
    // Auto-preselect the network label from the link itself (creator can override).
    if (!networkPick) {
      const detected = affiliateNetworkOf(v.url);
      if (detected) setNetworkPick(detected.id);
    }
    setPreviewing(true);
    setPreviewFailed(false);
    try {
      const info = await fetchProductInfo(v.url);
      const got = Boolean(info && (info.title || info.image || info.price));
      setPreview(got ? info : null);
      setPreviewFailed(!got);
      if (got) {
        setFields((s) => ({
          ...s,
          title: s.title.trim() ? s.title : String(info.title || "").slice(0, 120),
          image: s.image.trim() ? s.image : (info.image || ""),
          price: s.price ? s.price : (info.price != null ? String(info.price) : ""),
        }));
      }
    } catch {
      setPreview(null);
      setPreviewFailed(true);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      set("image")(await uploadProductImage(file));
    } catch {
      setErr(he ? "התמונה לא הועלתה. אפשר להדביק כתובת תמונה במקום." : "The image did not upload. You can paste an image URL instead.");
    } finally {
      setUploading(false);
    }
  }

  /** Save a draft or publish. Returns the saved product id through onSaved. */
  async function save(status) {
    setErr("");
    const v = validateAffiliateUrl(urlRaw);
    if (!v.ok) return setErr(linkErrorText(v.error, lang));
    if (!fields.title.trim()) return setErr(he ? "חובת שם מוצר — זה מה שיראו בחנות." : "A product name is required — that is what the store shows.");
    if (!isSafeImageUrl(fields.image)) return setErr(he ? "כתובת התמונה לא תקינה." : "The image address is not valid.");
    if (!marketer) return setErr(he ? "יש להתחבר כדי לשמור מוצר." : "Sign in to save a product.");
    setSaving(true);
    try {
      const net = NETWORKS_BY_ID[networkPick] || null;
      const account = accounts.find((a) => a.id === accountPick) || null;
      // Claimed = the creator explicitly picked a non-manual network.
      const claimed = Boolean(net && net.kind !== "manual");
      const st = linkStatusOf(v.url, { claimed });
      const meta = {
        network: net ? net.id : "",
        accountId: account ? account.id : "",
        accountLabel: account ? account.label : "",
        channels,
        campaign: fields.campaign,
        utm: { source: fields.utmSource, medium: fields.utmMedium, campaign: fields.utmCampaign },
        linkStatus: st.status,
      };
      let result = null;
      if (editingId) {
        await onUpdateProduct(editingId, {
          title: fields.title.trim().slice(0, 120),
          description: fields.description.trim().slice(0, 600),
          image: fields.image.trim().slice(0, 4000),
          category: CATEGORY_KEYS.includes(fields.category) ? fields.category : "Other",
          price: Number(fields.price) || 0,
          commission: Number(fields.commission) || 0,
          // Where buyers go follows the edited link, not only what the editor shows.
          affiliateUrl: v.url,
          sourceUrl: v.url,
          utm: meta.utm,
          ...meta,
        });
        const current = (products || []).find((p) => p.id === editingId);
        if (current && current.status !== status) await onSetStatus(editingId, status);
        result = { id: editingId, status };
      } else {
        result = await onAddProduct({ ...fields, ...meta, affiliateUrl: v.url, sourceUrl: v.url, status });
      }
      if (!result?.id) {
        setErr(he ? "השמירה לא הושלמה. נסי שוב." : "The save did not complete. Try again.");
        return;
      }
      setSaved({ id: result.id, status: result.status || status });
      onSaved?.(result);
      if (!compact) setFields(EMPTY_FIELDS);
    } catch (e) {
      console.error("[AddProductLink] save failed", e);
      setErr(he ? "השמירה נכשלה — בדוקי את החיבור ונסי שוב." : "Saving failed — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function resetToNew() {
    setSaved(null);
    setEditingId(null);
    setUrlRaw("");
    setChecked(null);
    setPreview(null);
    setPreviewFailed(false);
    setFields(EMPTY_FIELDS);
    setNetworkPick("");
    setAccountPick("");
    setChannels([]);
    setErr("");
  }

  function startEdit(p) {
    setSaved(null);
    setEditingId(p.id);
    // The stored value may be a platform /r wrapper — show the original address.
    const original = p.sourceUrl || p.affiliateUrl || "";
    setUrlRaw(original);
    setChecked(validateAffiliateUrl(original));
    setPreview(null);
    setPreviewFailed(false);
    setNetworkPick(p.network || "");
    setAccountPick(p.accountId || "");
    setChannels(Array.isArray(p.channels) ? p.channels : []);
    setFields({
      title: p.title || "",
      description: p.description || "",
      image: p.image || "",
      category: CATEGORY_KEYS.includes(p.category) ? p.category : CATEGORY_KEYS[0],
      price: p.price ? String(p.price) : "",
      commission: p.commission ? String(p.commission) : "",
      campaign: p.campaign || "",
      utmSource: p.utm?.source || "",
      utmMedium: p.utm?.medium || "",
      utmCampaign: p.utm?.campaign || "",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast?.(label || (he ? "ההעתקה הושלמה" : "Copied"));
    } catch {
      showToast?.(text);
    }
  }

  async function addToCollection() {
    if (!saved?.id) return;
    const title = collectionName.trim();
    try {
      if (title) {
        const fresh = await onAddCollection(title, { productIds: [saved.id] });
        void fresh;
        setCollectionName("");
      } else if (collectionPick) {
        const col = (collections || []).find((c) => c.id === collectionPick);
        if (col && !(col.productIds || []).includes(saved.id)) await onUpdateCollection(col.id, [...(col.productIds || []), saved.id]);
      }
      showToast?.(he ? "המוצר נוסף לאוסף" : "Added to the collection");
    } catch {
      setErr(he ? "הוספה לאוסף נכשלה." : "Adding to the collection failed.");
    }
  }

  const classification = checked?.ok ? classifyAffiliateUrl(checked.url) : null;
  // Duplicate detection — warns, never blocks: variants are legitimate.
  const duplicateOf = checked?.ok && !editingId ? findDuplicateByUrl(mine, checked.url) : null;
  // Honest status preview shown next to the paste field.
  const statusPreview = checked?.ok
    ? linkStatusOf(checked.url, { claimed: Boolean(networkPick && NETWORKS_BY_ID[networkPick]?.kind !== "manual") })
    : null;

  const accountsForNetwork = accounts.filter((a) => !networkPick || a.network === networkPick);

  /** Bulk CSV import — every valid row becomes a private draft, verbatim. */
  async function importCsv() {
    setErr("");
    const parsed = parseLinksCsv(csvText);
    if (!parsed.rows.length) {
      setErr(he ? "אין שורות תקינות בקובץ. כדאי להתחיל בכותרת url או link." : "No valid rows in the file. Start with a url or link column.");
      setCsvResult(null);
      return;
    }
    const valid = parsed.rows.filter((r) => !r.error);
    if (!valid.length) {
      setErr(he ? "אף שורה לא הכילה כתובת תקינה — בדוקי את הקובץ." : "No row contained a valid address — check the file.");
      setCsvResult(null);
      return;
    }
    setImporting(true);
    let imported = 0;
    let failed = 0;
    for (const row of valid) {
      const net = AFFILIATE_NETWORKS.find((n) => n.id === row.network) || null;
      const st = linkStatusOf(row.url, { claimed: Boolean(net && net.kind !== "manual") });
      try {
        const res = await onAddProduct({
          title: row.title || (he ? "מוצר מיובא" : "Imported product"),
          description: "",
          image: "",
          category: CATEGORY_KEYS.includes(row.category) ? row.category : "Other",
          price: Number(row.price) || 0,
          affiliateUrl: row.url,
          sourceUrl: row.url,
          network: net ? net.id : "",
          linkStatus: st.status,
          status: "draft",
        });
        if (res?.id) imported += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setImporting(false);
    setCsvText("");
    setCsvResult({
      imported,
      failed,
      invalid: parsed.rows.filter((r) => r.error).length,
      truncated: parsed.truncated,
    });
    showToast?.(he ? `${imported} קישורים יובאו כטיוטות` : `${imported} links imported as drafts`);
  }

  /** Bulk actions on the selected dashboard rows. */
  async function runBulk(action) {
    if (!selected.length) return;
    if (action === "delete") {
      const okToDelete = typeof window !== "undefined" &&
        window.confirm(he ? `למחוק ${selected.length} מוצרים? לא ניתן לשחזר.` : `Delete ${selected.length} products? This cannot be undone.`);
      if (!okToDelete) return;
    }
    setBulkBusy(true);
    try {
      for (const id of selected) {
        if (action === "publish") await onSetStatus(id, "approved");
        else if (action === "draft") await onSetStatus(id, "draft");
        else if (action === "delete") await onDeleteProduct(id);
      }
      setSelected([]);
      showToast?.(
        action === "delete" ? (he ? "המוצרים נמחקו" : "Products deleted")
          : action === "publish" ? (he ? "המוצרים פורסמו" : "Products published")
          : (he ? "המוצרים חזרו לטיוטה" : "Products moved to drafts")
      );
    } catch {
      setErr(he ? "הפעולה ההמונית נכשלה חלקית — בדקי את הרשימה." : "The bulk action partially failed — check the list.");
    } finally {
      setBulkBusy(false);
    }
  }

  const networksInUse = useMemo(() => {
    const set = new Set();
    for (const p of mine) if (p.network) set.add(p.network);
    return [...set];
  }, [mine]);

  const visibleMine = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mine.filter((p) => {
      if (filterNetwork && p.network !== filterNetwork) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (q && !(`${p.title} ${p.description}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [mine, search, filterNetwork, filterStatus]);

  if (!marketer) {
    return (
      <div className="ll-card rounded-3xl p-6 text-center">
        <h2 className="text-lg font-extrabold" style={{ color: "var(--text)" }}>
          {he ? "כדי לשמור מוצר צריך סטודיו" : "Saving a product needs a studio"}
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {he ? "הרשמה לוקחת דקה — אחר כך חוזרים למסך הזה ומדביקים את הקישור." : "Sign-up takes a minute — then come back here and paste your link."}
        </p>
        <Button className="mt-4" onClick={() => onNavigate?.("products")}>
          {he ? "להרשמה / התחברות" : "Sign up / Sign in"}
        </Button>
      </div>
    );
  }

  return (
    <div dir={he ? "rtl" : "ltr"} className="space-y-5 max-w-3xl">
      {/* ── 1. Title + the one big paste field ─────────────────────────── */}
      <section className="ll-card rounded-3xl p-5 sm:p-6">
        <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>
          {he ? "השלב הראשון בסטודיו" : "The studio's first step"}
        </p>
        <h2 className="mt-1 text-xl sm:text-2xl font-extrabold leading-snug" style={{ color: "var(--text)" }}>
          {he ? "הוספת קישור: מדביקים קישור שותפים וממשיכים" : "Add a link: paste an affiliate link and continue"}
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          {he
            ? "יש לך קישור מ-AliExpress או מרשת אפילייט אחרת? הדביקי אותו כאן."
            : "Have a link from AliExpress or another affiliate network? Paste it here."}
        </p>

        <label htmlFor="ll-aff-url" className="mt-5 block text-sm font-extrabold" style={{ color: "var(--text)" }}>
          {he ? "הדביקי כאן את קישור האפילייט שלך" : "Paste your affiliate link here"}
        </label>
        <textarea
          id="ll-aff-url"
          dir="ltr"
          rows={3}
          value={urlRaw}
          onChange={(e) => { setUrlRaw(e.target.value); setChecked(null); setErr(""); }}
          onBlur={checkLink}
          placeholder="https://..."
          className="input-field mt-2 w-full rounded-2xl px-4 py-3 text-sm"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", minHeight: 84 }}
          aria-describedby="ll-aff-url-help"
          aria-invalid={checked && !checked.ok ? "true" : undefined}
        />
        <p id="ll-aff-url-help" className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {he
            ? "הכתובת נשמרת במדויק כפי שהדבקת — אנחנו לא משנים, מקצרים או מחליפים אותה."
            : "The address is stored exactly as you pasted it — we never change, shorten or replace it."}
        </p>

        {/* Truthful validation status — appears only after a real check */}
        {checked && !checked.ok && (
          <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">
            <CircleAlert size={14} className="mt-0.5 shrink-0" /> {linkErrorText(checked.error, lang)}
          </p>
        )}
        {checked?.ok && (
          <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "var(--success)" }} role="status">
            <Check size={14} className="mt-0.5 shrink-0" />
            <span dir="ltr">
              {he ? "קישור תקין · " : "Valid link · "}
              {checked.host}
              {classification?.kind === "affiliate"
                ? (he ? " · זוהה קישור אפילייט" : " · affiliate link detected")
                : (he ? " · קישור מוצר (ללא מזהה שותפים מזוהה)" : " · product link (no affiliate ID detected)")}
            </span>
          </p>
        )}

        {/* Honest per-link status — what we actually know about this link */}
        {statusPreview && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={statusPreview.status} lang={lang} />
            {statusPreview.status === LINK_STATUS.TRACKING_UNVERIFIED && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {he
                  ? "בחרת רשת אפילייט, אבל לא זוהו פרמטרי מעקב בכתובת. הקישור יישמר, אך לא נטען שהוא מפיק עמלות."
                  : "You picked an affiliate network, but no tracking parameters were detected. The link is saved — we do not claim it earns commission."}
              </span>
            )}
          </div>
        )}

        {/* Duplicate detection — warns, never deletes or blocks */}
        {duplicateOf && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[11.5px] leading-5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }} role="status">
            <CircleAlert size={13} className="mt-0.5 shrink-0" />
            <span>
              {he
                ? `כבר יש מוצר עם הקישור הזה: «${duplicateOf.title}». אפשר להמשיך ולשמור אם זה באמת קישור שונה.`
                : `A product with this link already exists: “${duplicateOf.title}”. You can still save if this is genuinely a different link.`}
            </span>
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={checkLink} disabled={previewing}>
            {previewing ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {previewing
              ? (he ? "בודקים את הקישור…" : "Checking the link…")
              : (he ? "בדיקת הקישור והצגת פרטים" : "Check link & fetch details")}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={resetToNew}>{he ? "ביטול עריכה" : "Stop editing"}</Button>
          )}
        </div>
      </section>

      {/* ── 2. The three routes ────────────────────────────────────────── */}
      <section className="ll-card rounded-3xl p-5 sm:p-6">
        {/* Most creators already have an affiliate link: the other routes wait behind one question. */}
        <button
          type="button"
          onClick={() => setRoutesOpen((o) => !o)}
          aria-expanded={showRoutes}
          className="ll-tap flex w-full items-center justify-between gap-2 text-start text-sm font-extrabold"
          style={{ color: "var(--text)" }}
        >
          <span>{he ? "אין לך עדיין קישור שותפים, או שרוצה לייבא מוצרים?" : "No affiliate link yet, or want to import products?"}</span>
          <span aria-hidden="true" className="text-xs" style={{ color: "var(--text-faint)" }}>{showRoutes ? "▲" : "▼"}</span>
        </button>
        {showRoutes ? (
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          {ROUTES.map((r) => {
            const Icon = r.icon;
            const active = route === r.id;
            const copy = he ? r.he : r.en;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={active}
                onClick={() => setRoute(r.id)}
                className="ll-tap rounded-2xl p-4 text-start transition"
                style={{
                  background: active ? "var(--accent-subtle)" : "var(--bg-subtle)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: active ? "var(--accent)" : "var(--text)" }}>
                  <Icon size={16} className="shrink-0" /> {copy.title}
                </span>
                <span className="mt-1.5 block text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
                  {copy.body}
                </span>
              </button>
            );
          })}
        </div>
        ) : null}

        {/* Route 2 — only a product link: the integration decides what we can promise */}
        {route === LINK_ROUTE.PRODUCT && (
          <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <p className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--text)" }}>
              {integration.loading
                ? <><Loader2 size={13} className="animate-spin" /> {he ? "בודקים אם קיימת אינטגרציה מורשית…" : "Checking for an authorized integration…"}</>
                : <><ShieldCheck size={13} /> {he ? "בדיקת אינטגרציה מורשית" : "Authorized integration check"}</>}
            </p>
            {!integration.loading && (
              <div className="mt-2 space-y-2 text-[12px] leading-5" style={{ color: "var(--text-secondary)" }}>
                {integration.state === "configured" ? (
                  <p>
                    {he
                      ? "קיימת אינטגרציית AliExpress Affiliate פעילה בפלטפורמה. היא שייכת לחשבון הבעלות ומייבאת מוצרים מאומתים — לכן קישור העמלה האישי שלך נוצר בחשבון הרשת שלך."
                      : "An active AliExpress Affiliate integration exists on the platform. It belongs to the owner's account and imports verified products — so your personal commission link is created in your own network account."}
                  </p>
                ) : integration.state === "not_configured" ? (
                  <p>
                    {he
                      ? "אין כרגע אינטגרציה מורשית שיכולה ליצור קישור עמלה. צרי את קישור העמלה בחשבון הרשת שלך והדביקי אותו בשדה למעלה."
                      : "There is currently no authorized integration that can create a commission link. Create the commission link in your network account and paste it in the field above."}
                  </p>
                ) : (
                  <p>
                    {he
                      ? "לא ניתן לבדוק את מצב האינטגרציה כרגע (אין תשובה מהשרת). אפשר להמשיך לפי ההוראות — או לנסות שוב בעוד כמה דקות."
                      : "The integration state could not be checked right now (no answer from the server). Continue with the steps — or try again in a few minutes."}
                  </p>
                )}
                <ol className="list-decimal space-y-1 ps-5">
                  {networkGuide(checked?.network, lang).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Route 3 — import: available only when the integration says so */}
        {route === LINK_ROUTE.IMPORT && (
          <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <p className="flex items-center gap-2 text-xs font-bold" style={{ color: "var(--text)" }}>
              {integration.loading
                ? <><Loader2 size={13} className="animate-spin" /> {he ? "בודקים זמינות ייבוא…" : "Checking import availability…"}</>
                : <><Download size={13} /> {he ? "זמינות ייבוא" : "Import availability"}</>}
            </p>
            {!integration.loading && (
              <div className="mt-2 space-y-2 text-[12px] leading-5" style={{ color: "var(--text-secondary)" }}>
                {integration.state === "configured" ? (
                  <p>
                    {he
                      ? "הייבוא האוטומטי פעיל בחשבון הבעלות של הפלטפורמה ופועל מדי יום: מוצרים עם תמונה, מחיר וקישור אמיתיים בלבד. אין ייבוא ידני מהסטודיו שלך — כל מוצר שאת רוצה מוסיפים מההדבקה למעלה."
                      : "Automatic import is active in the platform owner's account and runs daily: only products with a real image, price and link are imported. There is no manual import in your studio — add any product by pasting it above."}
                  </p>
                ) : integration.state === "not_configured" ? (
                  <p>
                    {he
                      ? "אין אינטגרציה פעילה — הייבוא האוטומטי אינו זמין כרגע. אפשר להמשיך בהדבקת קישור ידנית או בייבוא CSV למטה."
                      : "No active integration — automatic import is not available right now. Continue by pasting a link manually or with the CSV import below."}
                  </p>
                ) : (
                  <p>
                    {he
                      ? "לא ניתן לאמת את הייבוא כרגע (אין תשובה מהשרת). לא נציג ייבוא כזמין בלי אישור מהשרת."
                      : "Import cannot be verified right now (no answer from the server). We will not show it as available without the server's confirmation."}
                  </p>
                )}
              </div>
            )}

            {/* CSV bulk import — always available, client-side, drafts only */}
            <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
                {he ? "ייבוא קישורי CSV (עד 50 שורות)" : "CSV link import (up to 50 rows)"}
              </p>
              <p className="mt-1 text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>
                {he
                  ? "עמודות מזוהות: url (חובה), title, network, category, price — מופרדות פסיק או טאב, עם או בלי שורת כותרת. כל שורה תקינה נשמרת כטיוטה פרטית עם הקישור המדויק."
                  : "Recognised columns: url (required), title, network, category, price — comma or tab separated, with or without a header row. Each valid row is saved as a private draft with the exact address."}
              </p>
              <textarea
                dir="ltr"
                rows={5}
                value={csvText}
                onChange={(e) => { setCsvText(e.target.value); setCsvResult(null); setErr(""); }}
                placeholder={"title,url,network\nRing,https://www.aliexpress.com/item/1005001.html?aff_trace_key=x,aliexpress"}
                className="input-field mt-2 w-full rounded-2xl px-3.5 py-2.5 text-xs"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                aria-label={he ? "תוכן קובץ CSV" : "CSV file content"}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button onClick={importCsv} disabled={importing || !csvText.trim()}>
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  {importing ? (he ? "מייבאים…" : "Importing…") : (he ? "ייבוא כטיוטות" : "Import as drafts")}
                </Button>
                {csvResult && (
                  <span className="text-[11px] font-semibold" style={{ color: csvResult.imported ? "var(--success)" : "var(--text-muted)" }}>
                    {he
                      ? `${csvResult.imported} יובאו · ${csvResult.failed} נכשלו · ${csvResult.invalid} שורות לא תקינות${csvResult.truncated ? " · הקובץ נקטע אחרי 50 שורות" : ""}`
                      : `${csvResult.imported} imported · ${csvResult.failed} failed · ${csvResult.invalid} invalid rows${csvResult.truncated ? " · file truncated after 50 rows" : ""}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Preview + details + disclosure ──────────────────────────── */}
      <section className="ll-card rounded-3xl p-5 sm:p-6">
        <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
          {editingId ? (he ? "עריכת מוצר" : "Edit product") : (he ? "פרטי המוצר" : "Product details")}
        </h3>

        {previewing && (
          <p className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--accent)" }}>
            <Loader2 size={13} className="animate-spin" />
            {he ? "מביאים תמונה ופרטים מהדף…" : "Fetching the photo and details from the page…"}
          </p>
        )}
        {!previewing && previewFailed && checked?.ok && (
          <p className="mt-3 rounded-xl px-3.5 py-3 text-xs leading-5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }} role="status">
            {he
              ? "לא הצלחנו להביא תמונה ופרטים אוטומטית מהדף הזה — אין בעיה: מלאי את השדות למטה ידנית והמוצר יישמר."
              : "We could not fetch a photo and details from this page automatically — no problem: fill the fields below manually and the product will save."}
          </p>
        )}

        {preview && (
          <div className="mt-3 flex gap-3 rounded-2xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <img
              src={safePreviewSrc(preview.image, DEFAULT_PRODUCT_IMAGE)}
              alt=""
              className="ll-thumb shrink-0 object-cover" style={{ "--thumb": "5rem", "--thumb-r": "12px" }}
              onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
            />
            <div className="min-w-0 text-xs" style={{ color: "var(--text-secondary)" }}>
              <p className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{preview.title}</p>
              <p className="mt-1">
                {preview.price != null && preview.price !== ""
                  ? `${preview.currency ? `${preview.currency} ` : ""}${preview.price}`
                  : (he ? "אין מחיר בעמוד — אפשר למלא ידנית" : "No price on the page — you can add one manually")}
              </p>
              <p dir="ltr" className="mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                {he ? "חנות: " : "Store: "}{checked?.host}
              </p>
              <a
                href={safeHref(checked?.url)}
                target="_blank"
                rel="nofollow sponsored noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-semibold"
                style={{ color: "var(--accent)" }}
              >
                <ExternalLink size={12} /> {he ? "פתיחת כתובת היעד" : "Open destination"}
              </a>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <LabeledInput label={he ? "שם המוצר (חובה)" : "Product name (required)"} value={fields.title} onChange={set("title")} placeholder={he ? "למשל: טבעת זהב עדינה" : "e.g. Delicate gold ring"} />
          <LabeledTextarea label={he ? "תיאור" : "Description"} value={fields.description} onChange={set("description")} placeholder={he ? "למה את ממליצה עליו — במשפט או שניים" : "Why you recommend it — in a sentence or two"} />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{he ? "תמונה" : "Image"}</span>
            <div className="flex items-center gap-3">
              <img
                src={safePreviewSrc(fields.image, DEFAULT_PRODUCT_IMAGE)}
                alt=""
                className="ll-thumb shrink-0 object-cover"
                style={{ "--thumb": "4rem", "--thumb-r": "12px",  background: "var(--bg-subtle)" }}
                onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
              />
              <label className="ll-tap flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? (he ? "מעלה…" : "Uploading…") : (he ? "העלאה מהמכשיר" : "Upload from device")}
                <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
              </label>
            </div>
            <input
              value={fields.image}
              onChange={(e) => set("image")(e.target.value)}
              placeholder={he ? "או הדביקו כתובת תמונה" : "Or paste an image URL"}
              dir="ltr"
              className="input-field w-full px-3.5 py-2.5 text-xs"
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{he ? "קטגוריה" : "Category"}</span>
            <select value={fields.category} onChange={(e) => set("category")(e.target.value)} className="input-field w-full px-3.5 py-2.5 text-sm">
              {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          </label>

          {/* Everything beyond name, photo and category is optional: it waits
              behind one toggle so the everyday path is paste → details → publish. */}
          <details className="rounded-2xl px-3.5 py-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--text)" }}>
              {he ? "אפשרויות נוספות (לא חובה): תוכנית שותפים, חשבון, ערוצים, UTM, מחיר ועמלה" : "More options (optional): programme, account, channels, UTM, price and commission"}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
          {/* ── Network + account + channels (the universal manager core) ── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  {he ? "רשת אפילייט / מקור" : "Affiliate network / source"}
                </span>
                <select
                  value={networkPick}
                  onChange={(e) => { setNetworkPick(e.target.value); setAccountPick(""); }}
                  className="input-field w-full px-3.5 py-2.5 text-sm"
                >
                  <option value="">{he ? "בחירה אוטומטית מהקישור" : "Auto-detect from the link"}</option>
                  {AFFILIATE_NETWORKS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  {he ? "חשבון (אופציונלי)" : "Account (optional)"}
                </span>
                <select
                  value={accountPick}
                  onChange={(e) => setAccountPick(e.target.value)}
                  className="input-field w-full px-3.5 py-2.5 text-sm"
                >
                  <option value="">{he ? "ללא חשבון" : "No account"}</option>
                  {accountsForNetwork.map((a) => (
                    <option key={a.id} value={a.id}>
                      {NETWORKS_BY_ID[a.network]?.label ? `${NETWORKS_BY_ID[a.network].label} · ` : ""}{a.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => setShowAccounts((s) => !s)}
              className="ll-tap self-start text-[11px] font-semibold underline"
              style={{ color: "var(--accent)" }}
            >
              {showAccounts
                ? (he ? "סתירת ניהול החשבונות" : "Hide account manager")
                : (he ? `ניהול חשבונות אפילייט (${accounts.length})` : `Manage affiliate accounts (${accounts.length})`)}
            </button>
            {showAccounts && (
              <div className="mt-1">
                <AffiliateAccounts
                  marketer={marketer}
                  onUpdateMarketer={onUpdateMarketer}
                  showToast={showToast}
                />
              </div>
            )}
  
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                {he ? "ערוצי פרסום (מאיפה תגיע התנועה?)" : "Promotional channels (where does traffic come from?)"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PROMO_CHANNELS.map((c) => {
                  const on = channels.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setChannels((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                      className="ll-tap rounded-full px-3 py-1.5 text-[11px] font-bold transition"
                      style={{
                        background: on ? "var(--accent)" : "var(--bg-subtle)",
                        color: on ? "#fff" : "var(--text-secondary)",
                        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                {he
                  ? "ערוץ פרסום הוא מקור תנועה (אינסטגרם, טיקטוק…) — לא רשת אפילייט. אפשר לבחור כמה."
                  : "A channel is a traffic source (Instagram, TikTok…) — not an affiliate network. Pick as many as you like."}
              </p>
            </div>
  
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput
                label={he ? "שם קמפיין (אופציונלי)" : "Campaign name (optional)"}
                value={fields.campaign}
                onChange={set("campaign")}
                placeholder={he ? "למשל: סתיו 2026" : "e.g. Fall 2026"}
              />
              <div />
              <LabeledInput label="UTM source" value={fields.utmSource} onChange={set("utmSource")} placeholder="instagram" />
              <LabeledInput label="UTM medium" value={fields.utmMedium} onChange={set("utmMedium")} placeholder="story" />
              <LabeledInput label="UTM campaign" value={fields.utmCampaign} onChange={set("utmCampaign")} placeholder="black_friday" />
            </div>
            <p className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              {he
                ? "ה־UTM נשמרים כשדות נפרדים. הקישור השמור תמיד נשאר בדיוק כפי שהדבקת — אנחנו לא משנים אותו."
                : "UTM values are stored as separate fields. The saved link always stays exactly as you pasted it — we never alter it."}
            </p>
  
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label={he ? "מחיר (לא חובה)" : "Price (optional)"} value={fields.price} onChange={set("price")} placeholder="24.99" type="number" />
              <LabeledInput label={he ? "עמלה שלך (לא חובה)" : "Your commission (optional)"} value={fields.commission} onChange={set("commission")} placeholder="3.50" type="number" />
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {he
                ? "אנחנו לא ממציאים מחיר או עמלה: אם אין בעמוד — השדה נשאר ריק וממלאים ידנית."
                : "We never invent a price or commission: if the page has none, the field stays empty and you fill it in."}
            </p>
            </div>
          </details>
        </div>

        {/* Affiliate disclosure — always visible, exactly the legal wording */}
        <p className="mt-4 rounded-xl px-3.5 py-3 text-[11.5px] leading-5" style={{ background: "var(--accent-subtle)", color: "var(--text)" }}>
          {he ? AFFILIATE_DISCLOSURE.he : AFFILIATE_DISCLOSURE.en}
        </p>

        {err && (
          <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">
            <CircleAlert size={14} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}

        {/* Honest pre-publish warning: unverified tracking is never hidden */}
        {statusPreview?.status === LINK_STATUS.TRACKING_UNVERIFIED && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl px-3.5 py-3 text-[11.5px] leading-5" style={{ background: "var(--warning-subtle, #fff7e6)", color: "var(--warning, #b45309)" }} role="alert">
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            {he
              ? "לפני פרסום: לא זוהו פרמטרי מעקב אפילייט בכתובת. המוצר יפורסם, אבל אנחנו לא טוענים שהוא מפיק עמלות. אם יש קישור מעקב מהרשת — הדביקי אותו במקום."
              : "Before publishing: no affiliate tracking parameters were found in the address. The product will be published, but we do not claim it earns commission. If you have a tracking link from the network — paste it instead."}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => save("approved")} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {editingId ? (he ? "שמירה ופרסום" : "Save & publish") : (he ? "פרסום בחנות" : "Publish to the store")}
          </Button>
          <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>
            {he ? "שמירה כטיוטה" : "Save as draft"}
          </Button>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {he
            ? "טיוטה נשמרת רק אצלך ולא מוצגת לציבור. פרסום עושה את המוצר גלוי בעמוד החנות ובקישור האישי."
            : "A draft stays private to you. Publishing makes the product public on your store page and share link."}
        </p>
      </section>

      {/* ── 4. Confirmation after a real save ───────────────────────────── */}
      {saved && (
        <section className="ll-card rounded-3xl p-5 sm:p-6" role="status">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: "var(--success-subtle)", color: "var(--success)" }}>
              <Check size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
                {saved.status === "approved"
                  ? (he ? "המוצר פורסם בחנות" : "The product is published")
                  : (he ? "נשמר כטיוטה" : "Saved as a draft")}
              </h3>
              <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
                {saved.status === "approved"
                  ? (he
                      ? "הוא גלוי עכשיו בעמוד החנות ובקישור האישי שלך. כל קליק עליו יירשם כאירוע אמיתי בביצועים."
                      : "It is now visible on your store page and personal link. Every click on it is recorded as a real event in Performance.")
                  : (he
                      ? "הטיוטה נשמרה אצלך בלבד. כשתהיי מוכנה — לחצי «פרסום בחנות» כדי להציג אותה לציבור."
                      : "The draft is private to you. When ready, press “Publish to the store” to make it public.")}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => copy(`${window.location.origin}${withBase(`/p/${saved.id}`)}`, he ? "קישור המוצר הועתק" : "Product link copied")}
            >
              <Copy size={14} /> {he ? "העתקת קישור המוצר" : "Copy product link"}
            </Button>
            {storeUrl && (
              <Button variant="secondary" onClick={() => copy(storeUrl, he ? "קישור החנות הועתק" : "Store link copied")}>
                <Store size={14} /> {he ? "העתקת קישור החנות" : "Copy store link"}
              </Button>
            )}
            {storeUrl && (
              <Button variant="secondary" onClick={() => window.open(withBase(`/u/${marketer.slug}`), "_blank", "noopener")}>
                <ExternalLink size={14} /> {he ? "פתיחת החנות" : "Open store"}
              </Button>
            )}
            {saved.status === "draft" && (
              <Button
                onClick={async () => {
                  try {
                    await onSetStatus(saved.id, "approved");
                    setSaved({ id: saved.id, status: "approved" });
                  } catch {
                    setErr(he ? "הפרסום נכשל — נסי שוב." : "Publishing failed — try again.");
                  }
                }}
              >
                {he ? "פרסום עכשיו" : "Publish now"}
              </Button>
            )}
            <Button variant="secondary" onClick={resetToNew}>
              <Plus size={14} /> {he ? "הוספת מוצר נוסף" : "Add another product"}
            </Button>
          </div>

          {/* Collections (LTK-style folders) — available after a real save */}
          <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-bold" style={{ color: "var(--text)" }}>
              {he ? "הכנסה לאוסף (תיקייה)" : "Add to a collection (folder)"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {myCollections.length > 0 && (
                <select
                  value={collectionPick}
                  onChange={(e) => { setCollectionPick(e.target.value); setCollectionName(""); }}
                  className="input-field px-3 py-2 text-xs"
                  aria-label={he ? "בחירת אוסף" : "Choose a collection"}
                >
                  <option value="">{he ? "בחירת אוסף קיים…" : "Choose an existing collection…"}</option>
                  {myCollections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              )}
              <input
                value={collectionName}
                onChange={(e) => { setCollectionName(e.target.value); setCollectionPick(""); }}
                placeholder={he ? "או שם לאוסף חדש" : "Or a new collection name"}
                className="input-field px-3 py-2 text-xs"
              />
              <Button variant="secondary" onClick={addToCollection} disabled={!collectionPick && !collectionName.trim()}>
                {he ? "הוספה" : "Add"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── 5. My products — search, filter, bulk, edit, publish, delete ── */}
      {!compact && (
        <section className="ll-card rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
              {he ? "המוצרים והקישורים שלי" : "My products & links"}
            </h3>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {mine.length ? `${visibleMine.length}${visibleMine.length !== mine.length ? `/${mine.length}` : ""} ${he ? "פריטים" : "items"}` : ""}
            </span>
          </div>

          {/* Search + filters */}
          {mine.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={he ? "חיפוש לפי שם…" : "Search by name…"}
                className="input-field min-w-[160px] flex-1 px-3 py-2 text-xs"
                aria-label={he ? "חיפוש מוצרים" : "Search products"}
              />
              <select
                value={filterNetwork}
                onChange={(e) => setFilterNetwork(e.target.value)}
                className="input-field px-3 py-2 text-xs"
                aria-label={he ? "סינון לפי רשת" : "Filter by network"}
              >
                <option value="">{he ? "כל הרשתות" : "All networks"}</option>
                {networksInUse.map((id) => (
                  <option key={id} value={id}>{NETWORKS_BY_ID[id]?.label || id}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="input-field px-3 py-2 text-xs"
                aria-label={he ? "סינון לפי סטטוס" : "Filter by status"}
              >
                <option value="">{he ? "כל הסטטוסים" : "All statuses"}</option>
                <option value="approved">{he ? "פורסם" : "Published"}</option>
                <option value="draft">{he ? "טיוטה" : "Draft"}</option>
              </select>
            </div>
          )}

          {/* Bulk actions */}
          {visibleMine.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={selected.length === visibleMine.length && visibleMine.length > 0}
                  onChange={(e) => setSelected(e.target.checked ? visibleMine.map((p) => p.id) : [])}
                />
                {he ? "בחירת הכול" : "Select all"}
              </label>
              {selected.length > 0 && (
                <>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {selected.length} {he ? "נבחרו" : "selected"}
                  </span>
                  <Button variant="secondary" onClick={() => runBulk("publish")} disabled={bulkBusy}>
                    {he ? "פרסום" : "Publish"}
                  </Button>
                  <Button variant="secondary" onClick={() => runBulk("draft")} disabled={bulkBusy}>
                    {he ? "לטיוטה" : "To draft"}
                  </Button>
                  <Button variant="secondary" onClick={() => runBulk("delete")} disabled={bulkBusy}>
                    <Trash2 size={13} /> {he ? "מחיקה" : "Delete"}
                  </Button>
                </>
              )}
            </div>
          )}

          {mine.length === 0 ? (
            <p className="mt-3 rounded-xl px-3.5 py-4 text-xs leading-5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              {he
                ? "אין עדיין מוצרים. הדביקי קישור אפילייט בשדה למעלה, בדקי אותו ולחצי «פרסום בחנות» — ואז תראי אותו כאן."
                : "No products yet. Paste your affiliate link in the field above, check it and press “Publish to the store” — it will appear here."}
            </p>
          ) : visibleMine.length === 0 ? (
            <p className="mt-3 rounded-xl px-3.5 py-4 text-xs leading-5" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              {he ? "אין מוצרים שמתאימים לסינון הנוכחי. נסי להסיר את אחד הסינונים." : "No products match the current filters. Try removing one of the filters."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {visibleMine.map((p) => {
                const approved = p.status === "approved";
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl p-3" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))
                      }
                      aria-label={he ? `בחירת ${p.title}` : `Select ${p.title}`}
                      className="shrink-0"
                    />
                    <img
                      src={safePreviewSrc(p.image, DEFAULT_PRODUCT_IMAGE)}
                      alt=""
                      className="ll-thumb shrink-0 object-cover" style={{ "--thumb": "3rem", "--thumb-r": "8px" }}
                      onError={(e) => { e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold" style={{ color: "var(--text)" }}>{p.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <span
                          className="rounded-full px-2 py-0.5 font-bold"
                          style={{
                            background: approved ? "var(--success-subtle)" : "var(--bg-subtle)",
                            color: approved ? "var(--success)" : "var(--text-faint)",
                            border: `1px solid ${approved ? "transparent" : "var(--border)"}`,
                          }}
                        >
                          {approved ? (he ? "פורסם" : "Published") : (he ? "טיוטה" : "Draft")}
                        </span>
                        {p.linkStatus && <StatusPill status={p.linkStatus} lang={lang} />}
                        {p.network && (
                          <span className="rounded-full px-2 py-0.5" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                            {NETWORKS_BY_ID[p.network]?.label || p.network}
                          </span>
                        )}
                        {p.accountLabel && (
                          <span>{p.accountLabel}</span>
                        )}
                        <span>{p.price ? money(p.price, lang) : (he ? "ללא מחיר" : "No price")}</span>
                        <span>{Number(p.clicks || 0)} {he ? "קליקים" : "clicks"}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RowAction onClick={() => startEdit(p)}>
                        <Pencil size={13} /> {he ? "עריכה" : "Edit"}
                      </RowAction>
                      <RowAction
                        onClick={async () => {
                          try {
                            await onSetStatus(p.id, approved ? "draft" : "approved");
                          } catch {
                            setErr(he ? "השינוי לא נשמר — נסי שוב." : "The change did not save — try again.");
                          }
                        }}
                      >
                        {approved ? (he ? "החזרה לטיוטה" : "Back to draft") : (he ? "פרסום" : "Publish")}
                      </RowAction>
                      <RowAction
                        onClick={() => copy(p.sourceUrl || p.affiliateUrl, he ? "הכתובת המקורית הועתקה" : "Original URL copied")}
                        label={he ? "העתקת הקישור המקורי" : "Copy the original link"}
                      >
                        <Copy size={13} />
                      </RowAction>
                      <RowAction
                        onClick={() => copy(`${window.location.origin}${withBase(`/p/${p.id}`)}`, he ? "הקישור הועתק" : "Link copied")}
                        label={he ? "העתקת הקישור לעמוד המוצר בחנות" : "Copy the product page link"}
                      >
                        <ExternalLink size={13} />
                      </RowAction>
                      <RowAction
                        onClick={() => {
                          if (typeof window === "undefined") return;
                          if (window.confirm(he ? `למחוק את «${p.title}»? לא ניתן לשחזר.` : `Delete “${p.title}”? This cannot be undone.`)) {
                            onDeleteProduct(p.id).catch(() => setErr(he ? "המחיקה נכשלה." : "Deleting failed."));
                          }
                        }}
                        label={he ? "מחיקת המוצר" : "Delete the product"}
                      >
                        <Trash2 size={13} />
                      </RowAction>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** A small action in a product row: one line on a phone, never a full-width button. */
function RowAction({ onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ll-tap inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold"
      style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
    >
      {children}
    </button>
  );
}
