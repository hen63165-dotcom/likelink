import React, { useMemo } from "react";
import { Send, CheckCircle2, AlertCircle, Landmark, CreditCard, Globe } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { money } from "../../utils/helpers";
import { getSellerPayoutSummary, PAYOUT_STATUS } from "../../lib/payments";
import { MIN_PAYOUT_THRESHOLD, PAYOUT_LABELS, PAYOUT_DEFAULT } from "../../constants/keys";

/**
 * Platform financial control center.
 * Shows each creator's pending balance, their chosen payout method
 * (PayPal / bank / other) and destination details, and lets the owner
 * trigger a payout in one tap. Money flows per each creator's choice.
 */
export default function PayoutsSection() {
  const { lang } = useI18n();
  const { marketers, sales, payouts, charges, settings, onCreatePayout, onMarkPayoutPaid } = useMarketplace();

  const L = (he, en) => (lang === "he" ? he : en);

  const totalGMV = (sales || []).reduce((s, x) => s + (x.saleAmount || 0), 0);
  const totalFees = (sales || []).reduce((s, x) => s + (x.platformFee || 0), 0);
  const totalPaid = (payouts || []).filter((p) => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = (payouts || []).filter((p) => p.status === "pending").reduce((s, p) => s + (p.amount || 0), 0);
  const feeRate = settings?.platformFeePercent ?? 15;

  const methodIcon = (m) =>
    m === "bank" ? <Landmark size={12} /> : m === "other" ? <Globe size={12} /> : <CreditCard size={12} />;

  const rows = useMemo(
    () =>
      (marketers || []).map((m) => {
        const summary = getSellerPayoutSummary(sales, payouts, m.id, charges);
        const openPayout = (payouts || []).find((p) => p.marketerId === m.id && (p.status === PAYOUT_STATUS.PENDING || p.status === PAYOUT_STATUS.PROCESSING));
        const method = m.paymentMethod || PAYOUT_DEFAULT;
        const done = summary.pendingPayout < MIN_PAYOUT_THRESHOLD;
        return { m, summary, openPayout, method, done };
      }),
    [marketers, sales, payouts, charges]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="surface rounded-2xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{L("עמלות שלך", "Your fees")}</p>
          <p className="mono text-lg font-bold mt-1" style={{ color: "var(--accent)" }}>{money(totalFees, lang)}</p>
          <p className="text-[10px] text-faint mt-0.5">{feeRate}% {L("מכל מכירה", "per sale")}</p>
        </div>
        <div className="surface rounded-2xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{L("נפח מכירות (GMV)", "Total GMV")}</p>
          <p className="mono text-lg font-bold mt-1">{money(totalGMV, lang)}</p>
          <p className="text-[10px] text-faint mt-0.5">{L("לפני עמלת פלטפורמה", "before platform fee")}</p>
        </div>
        <div className="surface rounded-2xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{L("משולם ליוצרות", "Paid out")}</p>
          <p className="mono text-lg font-bold mt-1" style={{ color: "var(--success)" }}>{money(totalPaid, lang)}</p>
          <p className="text-[10px] text-faint mt-0.5">{payouts.filter((p) => p.status === "paid").length} {L("תשלומים", "paid")}</p>
        </div>
        <div className="surface rounded-2xl p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{L("ממתינים לתשלום", "Pending payouts")}</p>
          <p className="mono text-lg font-bold mt-1" style={{ color: "var(--warning)" }}>{money(totalPending, lang)}</p>
          <p className="text-[10px] text-faint mt-0.5">{payouts.filter((p) => p.status === "pending").length} {L("בתור", "in queue")}</p>
        </div>
      </div>

      {/* Per-creator payout list */}
      <div className="surface rounded-2xl p-4">
        <p className="text-sm font-semibold mb-3">{L("מוכרות לתשלום", "Creators due")}</p>
        {rows.length === 0 ? (
          <p className="text-xs text-muted">{L("אין מוכרות רשומות", "No creators yet")}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rows.map(({ m, summary, openPayout, method, done }) => {
              const dest = method === "paypal"
                ? (m.payPalEmail || L("אימייל לא מוגדר", "No email"))
                : method === "bank"
                ? (m.bankDetails?.iban || L("פרטים לא מוגדרים", "No details"))
                : (m.paymentNote || L("אחר", "Other"));
              return (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl surface-subtle">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 disp font-bold text-sm" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{m.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted">
                        {methodIcon(method)} {PAYOUT_LABELS[method] || method}
                      </span>
                      <span className="text-[10px] text-faint truncate">{dest}</span>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="mono text-sm font-bold" style={{ color: done ? "var(--text-muted)" : "var(--success)" }}>
                      {money(summary.pendingPayout, lang)}
                    </p>
                    <p className="text-[10px] text-faint">{L("חובה", "owed")}</p>
                  </div>
                  <div className="shrink-0">
                    {openPayout ? (
                      <button onClick={() => onMarkPayoutPaid(openPayout.id)} className="tap flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: "var(--success-subtle)", color: "var(--success)" }}>
                        <CheckCircle2 size={12} /> {L("סמן שולם", "Mark paid")}
                      </button>
                    ) : done ? (
                      <span className="text-[10px] text-faint flex items-center gap-1">
                        <AlertCircle size={11} /> {L("מתחת לסף", "Below")}
                      </span>
                    ) : (
                      <button onClick={() => onCreatePayout(m.id)} className="tap flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}>
                        <Send size={12} /> {L("צור תשלום", "Payout")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}