// AutoPilot — מנוע האוטומציה המובנה של הסטודיו 🚀
//
// "כל מה ש-Make/Zapier עושות — בתוך לייקלינק": המוכרת מחברת ערוצים
// (Telegram / Facebook Page / Webhook), בוחרה תדירות ותבנית טקסט,
// והאתר מפרסם לבד — גם כשהיא לא מחוברת. Premium bundle.

import { useState, useEffect, useCallback } from "react";
import {
  Bot, Send, Globe, Facebook, Play, Pause, Save, Zap,
  CheckCircle2, XCircle, Sparkles, Lock, Radio,
} from "lucide-react";
import {
  getAutoPilotConfig,
  saveAutoPilotConfig,
  runAutoPilotNow,
  AUTOPILOT_INTERVALS,
  TEMPLATE_VARS,
  defaultTemplate,
  checkAutoPilotAccess,
} from "../../lib/autopilot";

const CHANNELS = [
  {
    type: "telegram",
    name: "Telegram",
    icon: Send,
    hint: "בוט שמפרסם לערוץ/קבוצה — יוצרים בוט אצל @BotFather ומדביקים כאן את הטוקן ומזהה הערוץ (@channel או ‎-100...)",
    fields: [
      { key: "botToken", label: "Bot Token" },
      { key: "chatId", label: "Chat / Channel ID" },
    ],
  },
  {
    type: "webhook",
    name: "Webhook (Make / Zapier / n8n)",
    icon: Globe,
    hint: "כל מערכת שתומכת ב-webhook — פתחי סצנריו ב-Make, הדביקי כאן את כתובת ה-hook, והפוסטים יזרמו לכל הרשתות",
    fields: [{ key: "url", label: "Webhook URL" }],
  },
  {
    type: "facebook",
    name: "Facebook Page",
    icon: Facebook,
    hint: "פרסום אוטומטי לעמוד הפייסבוק — נדרש Page Access Token ומזהה עמוד",
    fields: [
      { key: "pageId", label: "Page ID" },
      { key: "pageToken", label: "Page Access Token" },
    ],
  },
];

const EMPTY = {
  enabled: false,
  aiPolish: true,
  intervalMinutes: 180,
  template: "",
  storeUrl: "",
  productIds: [],
  channels: [],
};

export default function AutoPilot({ marketer, products, showToast }) {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [lastRun, setLastRun] = useState(null);

  const access = checkAutoPilotAccess(marketer, products);

  useEffect(() => {
    if (!marketer?.id || !access.allowed) return;
    setLoading(true);
    getAutoPilotConfig(marketer.id)
      .then((d) => {
        const c = d.config || {};
        setCfg({
          ...EMPTY,
          ...c,
          channels: (c.channels || []).map((ch) => ({
            type: ch.type,
            ...(ch.type === "telegram"
              ? { botToken: ch.botToken || "", chatId: ch.chatId || "" }
              : ch.type === "webhook"
                ? { url: "" } // masked server-side — must be re-entered to change
                : { pageId: ch.pageId || "", pageToken: ch.pageToken || "" }),
          })),
        });
        setLogs(c.logs || []);
      })
      .catch(() => setCfg({ ...EMPTY }))
      .finally(() => setLoading(false));
  }, [marketer?.id, access.allowed]);

  const patchChannel = useCallback((type, key, value) => {
    setCfg((prev) => {
      const channels = [...(prev?.channels || [])];
      let i = channels.findIndex((c) => c.type === type);
      if (i < 0) {
        i = channels.push({ type }) - 1;
      }
      channels[i] = { ...channels[i], [key]: value };
      return { ...prev, channels };
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // keep only channels that have their required fields filled
      const clean = {
        ...cfg,
        template: cfg.template || defaultTemplate(),
        channels: cfg.channels.filter((ch) =>
          ch.type === "telegram" ? ch.botToken && ch.chatId : ch.type === "webhook" ? ch.url : ch.pageId && ch.pageToken
        ),
      };
      const d = await saveAutoPilotConfig(marketer.id, clean);
      setLogs(d.config?.logs || []);
      showToast("AutoPilot נשמר! ✈️");
    } catch (e) {
      showToast(`שמירה נכשלה: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setTesting(true);
    try {
      await saveAutoPilotConfig(marketer.id, { ...cfg, template: cfg.template || defaultTemplate() });
      const d = await runAutoPilotNow(marketer.id);
      setLastRun(d);
      setLogs(d.config?.logs || []);
      showToast(d.ok ? "פוסט יצא לדרך! בדקי את הערוץ 🎉" : "אין מוצרים מאושרים לפרסום");
    } catch (e) {
      showToast(`ההרצה נכשלה: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  if (!access.allowed) {
    return (
      <div className="surface rounded-2xl p-5 mt-6">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={16} style={{ color: "var(--accent)" }} />
          <h3 className="disp text-[15px] font-semibold">AutoPilot — פרסום אוטומטי</h3>
        </div>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          החבילה המתקדמת: האתר מפרסם לבד לטלגרם, פייסבוק ועוד — בלי לצאת מהאתר.
          נדרש מנוי פרימיום או 5 מוצרים מאושרים (יש לך {access.approved}).
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="surface rounded-2xl p-5 mt-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
        <Bot size={18} className="inline-block me-1" /> טוען AutoPilot…
      </div>
    );
  }

  return (
    <div className="surface rounded-2xl p-5 mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot size={17} style={{ color: "var(--accent)" }} />
          <h3 className="disp text-[15px] font-semibold">AutoPilot — האתר מפרסם בשבילך</h3>
        </div>
        <button
          onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
          className="tap rounded-full px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1.5"
          style={{
            background: cfg.enabled ? "#10b981" : "var(--surface-2, rgba(0,0,0,.06))",
            color: cfg.enabled ? "#fff" : "var(--text)",
          }}
        >
          {cfg.enabled ? <Pause size={13} /> : <Play size={13} />}
          {cfg.enabled ? "פעיל" : "כבוי"}
        </button>
      </div>

      {/* Channels */}
      <div className="space-y-3">
        {CHANNELS.map((chDef) => {
          const ch = cfg.channels.find((c) => c.type === chDef.type) || { type: chDef.type };
          const Icon = chDef.icon;
          return (
            <div key={chDef.type} className="rounded-xl p-3" style={{ background: "var(--surface-2, rgba(0,0,0,.04))" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <Icon size={14} style={{ color: "var(--accent)" }} />
                <span className="text-[13px] font-semibold">{chDef.name}</span>
              </div>
              <p className="text-[11.5px] leading-relaxed mb-2" style={{ color: "var(--text-muted)" }}>{chDef.hint}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {chDef.fields.map((f) => (
                  <input
                    key={f.key}
                    value={ch[f.key] || ""}
                    onChange={(e) => patchChannel(chDef.type, f.key, e.target.value)}
                    placeholder={f.label}
                    className="rounded-lg px-3 py-2 text-[12.5px] bg-transparent border"
                    style={{ borderColor: "var(--border, rgba(0,0,0,.1))", color: "var(--text)" }}
                    dir="ltr"
                  />
                ))}
              </div>

            </div>
          );
        })}
      </div>

      {/* Frequency + AI */}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <select
          value={cfg.intervalMinutes}
          onChange={(e) => setCfg({ ...cfg, intervalMinutes: Number(e.target.value) })}
          className="rounded-lg px-3 py-2 text-[12.5px]"
          style={{ background: "var(--surface-2, rgba(0,0,0,.04))", color: "var(--text)" }}
        >
          {AUTOPILOT_INTERVALS.map((i) => (
            <option key={i.minutes} value={i.minutes}>{i.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={cfg.aiPolish} onChange={(e) => setCfg({ ...cfg, aiPolish: e.target.checked })} />
          <Sparkles size={13} style={{ color: "var(--accent)" }} /> שיפור AI לטקסט
        </label>
      </div>

      {/* Template */}
      <textarea
        value={cfg.template}
        onChange={(e) => setCfg({ ...cfg, template: e.target.value })}
        placeholder={defaultTemplate()}
        rows={4}
        className="w-full rounded-xl px-3 py-2.5 text-[12.5px] mt-3 bg-transparent border leading-relaxed"
        style={{ borderColor: "var(--border, rgba(0,0,0,.1))", color: "var(--text)" }}
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {TEMPLATE_VARS.map((v) => (
          <button
            key={v}
            onClick={() => setCfg({ ...cfg, template: `${cfg.template || ""}${v}` })}
            className="tap rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
            dir="ltr"
          >
            {v}
          </button>
        ))}
      </div>

      {/* Product pool */}
      <p className="text-[11.5px] mt-3 mb-1.5" style={{ color: "var(--text-muted)" }}>
        מוצרים לפרסום ({cfg.productIds.length || `כל ${products.length}`} נבחרו):
      </p>
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
        {products.map((p) => {
          const on = cfg.productIds.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() =>
                setCfg({
                  ...cfg,
                  productIds: on ? cfg.productIds.filter((id) => id !== p.id) : [...cfg.productIds, p.id],
                })
              }
              className="tap rounded-full px-2.5 py-1 text-[11px]"
              style={{
                background: on ? "var(--accent)" : "var(--surface-2, rgba(0,0,0,.05))",
                color: on ? "#fff" : "var(--text)",
              }}
            >
              {(p.title || "").slice(0, 22)}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={save}
          disabled={saving}
          className="tap flex-1 rounded-xl py-3 text-[13px] font-semibold flex items-center justify-center gap-1.5"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          <Save size={15} /> {saving ? "שומר…" : "שמירה"}
        </button>
        <button
          onClick={runNow}
          disabled={testing}
          className="tap rounded-xl px-4 py-3 text-[13px] font-semibold flex items-center gap-1.5"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Zap size={15} /> {testing ? "מפרסם…" : "פרסום עכשיו"}
        </button>
      </div>

      {lastRun?.ok && lastRun.text && (
        <div className="rounded-xl p-3 mt-3 text-[12px]" style={{ background: "var(--surface-2, rgba(0,0,0,.04))" }}>
          <Radio size={12} className="inline-block me-1" /> פוסט אחרון שנשלח:
          <pre className="whitespace-pre-wrap font-sans mt-1">{lastRun.text}</pre>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-[11.5px] font-semibold" style={{ color: "var(--text-muted)" }}>יומן פעילות:</p>
          {logs.slice(0, 8).map((l, i) => (
            <div key={`${l.ts}-${i}`} className="flex items-start gap-1.5 text-[11.5px]">
              {l.ok ? <CheckCircle2 size={12} color="#10b981" /> : <XCircle size={12} color="#ef4444" />}
              <span style={{ color: "var(--text-muted)" }}>
                {new Date(l.ts).toLocaleString("he-IL")} · {l.channel} · {l.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



