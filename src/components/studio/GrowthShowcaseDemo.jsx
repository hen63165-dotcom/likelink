import React, { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpLeft, BarChart3, Bot, CheckCircle2, Megaphone, Package, Radio, Sparkles, Users } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { money } from "../../utils/helpers.js";

function StatePill({ state, he }) {
  const map = {
    live: { he: "חי", en: "LIVE", bg: "var(--success-subtle)", fg: "var(--success)" },
    ready: { he: "מוכן", en: "READY", bg: "var(--accent-subtle)", fg: "var(--accent)" },
    blocked: { he: "נדרש חיבור", en: "CONNECT", bg: "var(--warning-subtle)", fg: "var(--warning)" },
  };
  const x = map[state] || map.blocked;
  return <span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: x.bg, color: x.fg }}>{he ? x.he : x.en}</span>;
}

export default function GrowthShowcaseDemo({ onNavigate }) {
  const { lang } = useI18n();
  const he = lang === "he";
  const { products = [], clicks = [], sales = [], currentMarketer } = useMarketplace();
  const [discover, setDiscover] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [autopilot, setAutopilot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/store?mode=discover", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/autopilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "autonomous-jobs-status" }) }).then(r => r.ok ? r.json() : null).catch(() => null),
      currentMarketer?.id
        ? fetch("/api/autopilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "get", marketerId: currentMarketer.id }) }).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),
    ]).then(([d, j, a]) => {
      if (cancelled) return;
      setDiscover(d);
      setJobs(Array.isArray(j?.jobs) ? j.jobs : []);
      setAutopilot(a?.config || null);
    });
    return () => { cancelled = true; };
  }, [currentMarketer?.id]);

  const approved = useMemo(() => products.filter(p => p?.status === "approved"), [products]);
  const ranked = useMemo(() => {
    const source = Array.isArray(discover?.results) && discover.results.length ? discover.results : approved;
    return source.slice(0, 5).map(p => ({ ...p, clicks: clicks.filter(c => c?.productId === p.id).length, sales: sales.filter(s => s?.productId === p.id).length }));
  }, [discover, approved, clicks, sales]);
  const revenue = sales.reduce((sum, s) => sum + (Number(s?.amount) || 0), 0);
  const successfulJobs = jobs.filter(j => j.state === "success").length;
  const failedJobs = jobs.filter(j => j.state === "failed").length;
  const configuredChannels = Array.isArray(autopilot?.channels) ? autopilot.channels.filter(Boolean) : [];
  const publishedLogs = Array.isArray(autopilot?.logs) ? autopilot.logs.filter(l => l?.ok) : [];
  const latest = ranked[0] || null;
  const t = (a, b) => he ? a : b;

  return (
    <section className="ll-growth-command relative overflow-hidden rounded-[24px]">
      <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full blur-3xl" style={{ background: "rgba(99,102,241,.16)" }} />
      <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full blur-3xl" style={{ background: "rgba(6,182,212,.10)" }} />
      <div className="relative grid gap-4 p-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(270px,.8fr)] lg:p-5">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", boxShadow: "0 12px 30px rgba(99,102,241,.25)" }}><Sparkles size={21} color="white" /></div>
              <div><div className="flex items-center gap-2"><h3 className="text-lg font-black tracking-tight" style={{ color: "var(--text)" }}>{t("Luna · Growth Control Center", "Luna · Growth Control Center")}</h3><StatePill state={successfulJobs || configuredChannels.length ? "live" : "blocked"} he={he} /></div><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{t("החלטות, יצירה, הפצה ומדידה — רק לפי נתונים אמיתיים.", "Decisions, creation, distribution and measurement — backed by real data.")}</p></div>
            </div>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-faint)" }}><span className="inline-block h-2 w-2 rounded-full" style={{ background: failedJobs ? "var(--danger)" : "var(--success)" }} />{failedJobs ? t(failedJobs + " תקלות דורשות בדיקה", failedJobs + " failures need attention") : t("ענן פעיל", "Cloud healthy")}</div>
          </div>

          {latest ? (
            <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, rgba(99,102,241,.12), rgba(15,19,33,.92))" }}>
              <div className="grid min-h-[220px] md:grid-cols-[1.05fr_.95fr]">
                <div className="relative min-h-[190px] overflow-hidden">{latest.image ? <img src={latest.image} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ aspectRatio: "auto", opacity: .88 }} /> : <div className="absolute inset-0 flex items-center justify-center" style={{ background: "var(--bg-subtle)" }}><Package size={42} style={{ color: "var(--text-faint)" }} /></div>}<div className="absolute inset-0" style={{ background: "linear-gradient(90deg, transparent 25%, rgba(8,11,20,.88) 100%)" }} /><div className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "rgba(8,11,20,.72)", color: "var(--accent)" }}>{t("בחירה אמיתית של Luna", "Luna real selection")}</div></div>
                <div className="flex flex-col justify-center p-5" dir={he ? "rtl" : "ltr"}><p className="text-[10px] font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent)" }}>SPOTLIGHT</p><h4 className="mt-2 text-xl font-black leading-tight" style={{ color: "var(--text)" }}>{latest.title}</h4><p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>{Number(latest.price) > 0 ? String(latest.price) + " ₪" : t("מחיר לא זמין", "Price unavailable")}</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,.035)" }}><div className="text-base font-black" style={{ color: "var(--text)" }}>{latest.clicks}</div><div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{t("קליקים", "Clicks")}</div></div><div className="rounded-xl p-2.5" style={{ background: "rgba(255,255,255,.035)" }}><div className="text-base font-black" style={{ color: "var(--text)" }}>{latest.sales}</div><div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{t("מכירות", "Sales")}</div></div></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => onNavigate?.("luna")} className="ll-growth-cta inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black" type="button"><Bot size={14} /> {t("לפתיחת Luna", "Open Luna")}</button><a href={latest.id ? "/p/" + encodeURIComponent(latest.id) : "#"} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>{t("צפייה במוצר", "View product")} <ArrowUpLeft size={13} /></a></div></div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,.02)" }}><div><Package size={30} className="mx-auto mb-3" style={{ color: "var(--text-faint)" }} /><p className="font-bold" style={{ color: "var(--text)" }}>{t("אין עדיין מוצר מאושר להצגה", "No approved product to showcase yet")}</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{t("הוסיפי מוצר אמיתי — הוא יופיע כאן אוטומטית.", "Add a real product and it will appear here automatically.")}</p></div></div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[[Package, approved.length, t("מוצרים", "Products")], [Activity, clicks.length, t("קליקים", "Clicks")], [BarChart3, sales.length, t("הזמנות", "Orders")], [Users, money(revenue, lang), t("הכנסות", "Revenue")]].map(([Icon, value, label]) => <div key={label} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,.025)" }}><Icon size={14} style={{ color: "var(--accent)" }} /><div className="mt-2 text-base font-black" style={{ color: "var(--text)" }}>{value}</div><div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</div></div>)}
          </div>
        </div>

        <aside className="min-w-0"><div className="h-full rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "rgba(15,19,33,.78)" }}>
          <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-black" style={{ color: "var(--text)" }}>{t("גילויים חיים", "Live discoveries")}</p><p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{t("מהקטלוג והאותות האמיתיים", "From real catalog signals")}</p></div><Radio size={15} style={{ color: "var(--accent)" }} /></div>
          <div className="space-y-2">{ranked.slice(0, 4).map((p, i) => <div key={p.id || i} className="flex items-center gap-2 rounded-xl p-2" style={{ background: "rgba(255,255,255,.035)" }}>{p.image ? <img src={p.image} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" style={{ aspectRatio: "1 / 1" }} /> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--bg-subtle)" }}><Package size={14} /></div>}<div className="min-w-0 flex-1"><p className="truncate text-xs font-bold" style={{ color: "var(--text)" }}>{p.title}</p><p className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>{Number(p.price) > 0 ? String(p.price) + " ₪" : "—"} · {p.clicks} {t("קליקים", "clicks")}</p></div><span className="text-[10px] font-black" style={{ color: i === 0 ? "var(--accent)" : "var(--text-faint)" }}>#{i + 1}</span></div>)}{!ranked.length && <div className="rounded-xl border border-dashed p-5 text-center text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{t("אין עדיין אותות", "No signals yet")}</div>}</div>

          <div className="my-4 h-px" style={{ background: "var(--border)" }} /><div className="mb-2 flex items-center justify-between"><p className="text-sm font-black" style={{ color: "var(--text)" }}>{t("הפצה חיצונית", "External distribution")}</p><Megaphone size={15} style={{ color: "var(--accent)" }} /></div>
          {configuredChannels.length ? <div className="space-y-2">{configuredChannels.slice(0, 4).map(ch => { const hits = publishedLogs.filter(l => String(l.channel || "").split(",").includes(ch.type) && l.ok).length; return <div key={ch.type} className="flex items-center justify-between rounded-xl p-2.5" style={{ background: "rgba(255,255,255,.035)" }}><span className="text-xs font-bold" style={{ color: "var(--text)" }}>{ch.type}</span><StatePill state={hits ? "live" : "ready"} he={he} /></div>; })}<p className="pt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>{t("הערוץ מסומן חי רק לאחר הצלחת פרסום שנרשמה.", "A channel is marked live only after a recorded successful publish.")}</p></div> : <div className="rounded-xl border border-dashed p-4" style={{ borderColor: "var(--border)" }}><p className="text-xs font-bold" style={{ color: "var(--text)" }}>{t("אין עדיין ערוץ חיצוני מוגדר", "No external channel configured yet")}</p><p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{t("חברי ערוץ ב-AutoPilot כדי לאפשר פרסום חיצוני אמיתי.", "Connect a channel in AutoPilot for real external publishing.")}</p></div>}

          <div className="mt-4 rounded-xl p-3" style={{ background: "linear-gradient(135deg, rgba(99,102,241,.12), rgba(6,182,212,.08))" }}><div className="flex items-center gap-2"><CheckCircle2 size={15} style={{ color: "var(--success)" }} /><p className="text-xs font-black" style={{ color: "var(--text)" }}>{t("אין נתוני Demo", "No demo data")}</p></div><p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{t("כל מספר כאן מגיע מה-context, מהענן או מפעולת פרסום שנרשמה.", "Every number here comes from live context, cloud state, or recorded publishing activity.")}</p></div>
        </div></aside>
      </div>
    </section>
  );
}