/**
 * AffiliateAccounts — "חשבונות אפילייט": the creator saves MULTIPLE named
 * accounts, each with its own network and an optional public tracking id.
 *
 * Hard rules:
 *   • We never ask for a password, cookie or API token of an external network.
 *   • A saved account is a LABEL for organizing links — it never means the
 *     network is "connected"; only a real server integration can say that.
 *   • Everything is stored on the creator's own studio record (ownership =
 *     the existing auth model), never shared with other creators.
 */
import React, { useState } from "react";
import { KeyRound, Plus, Trash2, CircleAlert, Check } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { Button, LabeledInput } from "../ui/index.jsx";
import { AFFILIATE_NETWORKS, NETWORKS_BY_ID } from "../../lib/affiliateLink.js";

const uid = () => `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Read the accounts list off a marketer record, tolerating bad data. */
export function readAccounts(marketer) {
  const raw = marketer?.affiliateAccounts;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object")
    .map((a) => ({
      id: typeof a.id === "string" && a.id ? a.id : uid(),
      network: typeof a.network === "string" ? a.network : "",
      label: typeof a.label === "string" ? a.label.slice(0, 80) : "",
      trackingId: typeof a.trackingId === "string" ? a.trackingId.slice(0, 100) : "",
    }))
    .filter((a) => a.label);
}

export default function AffiliateAccounts({ marketer, onUpdateMarketer, showToast }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const [network, setNetwork] = useState("aliexpress");
  const [label, setLabel] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const accounts = readAccounts(marketer);

  async function addAccount() {
    setErr("");
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setErr(he ? "חובה שם לחשבון — למשל «החשבון הראשי ב-AliExpress»." : "An account name is required — e.g. “My main AliExpress account”.");
      return;
    }
    if (!NETWORKS_BY_ID[network]) {
      setErr(he ? "בחרי רשת מהרשימה." : "Choose a network from the list.");
      return;
    }
    setSaving(true);
    try {
      await onUpdateMarketer(marketer.id, {
        affiliateAccounts: [
          ...accounts,
          { id: uid(), network, label: cleanLabel, trackingId: trackingId.trim() },
        ],
      });
      setLabel("");
      setTrackingId("");
      showToast?.(he ? "החשבון נשמר" : "Account saved");
    } catch {
      setErr(he ? "השמירה נכשלה — נסי שוב." : "Saving failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount(id) {
    setErr("");
    setSaving(true);
    try {
      await onUpdateMarketer(marketer.id, {
        affiliateAccounts: accounts.filter((a) => a.id !== id),
      });
      showToast?.(he ? "החשבון הוסר" : "Account removed");
    } catch {
      setErr(he ? "ההסרה נכשלה — נסי שוב." : "Removing failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ll-card rounded-3xl p-5 sm:p-6">
      <h3 className="text-sm font-extrabold" style={{ color: "var(--text)" }}>
        {he ? "חשבונות אפילייט שלי" : "My affiliate accounts"}
      </h3>
      <p className="mt-1.5 text-[11.5px] leading-5" style={{ color: "var(--text-secondary)" }}>
        {he
          ? "שמרי כאן כל חשבון שותפים בנפרד כדי לארגן את הקישורים. זה תווית לארגון בלבד — אף סיסמה או טוקן לא נשמרים, ורשת לא מוצגת כ«מחוברת» בלי אינטגרציה אמיתית."
          : "Save each affiliate account here to organize your links. This is an organizing label only — no passwords or tokens are stored, and a network is never shown as “connected” without a real integration."}
      </p>

      {accounts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {accounts.map((a) => {
            const net = NETWORKS_BY_ID[a.network];
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl px-3.5 py-2.5"
                style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}
              >
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                >
                  {net?.label || a.network || (he ? "ללא רשת" : "No network")}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold" style={{ color: "var(--text)" }}>
                  {a.label}
                </span>
                {a.trackingId && (
                  <span className="truncate text-[11px]" dir="ltr" style={{ color: "var(--text-muted)" }}>
                    {a.trackingId}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAccount(a.id)}
                  disabled={saving}
                  aria-label={he ? `מחיקת חשבון ${a.label}` : `Delete account ${a.label}`}
                  className="ll-tap rounded-lg p-1.5"
                  style={{ color: "var(--danger)" }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {he ? "רשת" : "Network"}
          </span>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="input-field w-full px-3.5 py-2.5 text-sm"
          >
            {AFFILIATE_NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </select>
        </label>
        <LabeledInput
          label={he ? "כינוי החשבון (חובה)" : "Account nickname (required)"}
          value={label}
          onChange={setLabel}
          placeholder={he ? "למשל: החשבון הראשי שלי ב-AliExpress" : "e.g. My main AliExpress account"}
        />
        <LabeledInput
          label={he ? "מזהה מעקב / תג (אופציונלי)" : "Tracking ID / tag (optional)"}
          value={trackingId}
          onChange={setTrackingId}
          placeholder={he ? "למשל: ה־tag או ה־ID שלך ברשת" : "e.g. your tag or ID in the network"}
        />
        <p className="flex items-start gap-1.5 text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>
          <KeyRound size={12} className="mt-0.5 shrink-0" />
          {he
            ? "לעולם לא נבקש סיסמה, עוגייה או טוקן של רשת חיצונית. קישור אפילייט יוצרים ברשת עצמה ומדביקים כאן."
            : "We never ask for an external network's password, cookie or token. Create the affiliate link inside the network itself and paste it here."}
        </p>
        {err && (
          <p className="flex items-start gap-1.5 text-xs font-semibold" style={{ color: "var(--danger)" }} role="alert">
            <CircleAlert size={13} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}
        <div>
          <Button onClick={addAccount} disabled={saving}>
            {saving ? <Check size={14} /> : <Plus size={14} />}
            {he ? "הוספת חשבון" : "Add account"}
          </Button>
        </div>
      </div>
    </section>
  );
}
