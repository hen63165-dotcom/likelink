// 📦 TEMPORARY DIAGNOSTIC — REMOVE AFTER DIAGNOSIS (task: "find the corrupt data")
// One-time raw-data dump. Reads EXACTLY what is stored (Supabase `kv` table when
// configured, otherwise localStorage) — it does NOT use the sanitized in-memory
// marketplace state, so any corrupt legacy record shows up literally.
// Open the app with  /#dbg  (hash), or import + mount anywhere. It also logs
// the full dump to console under window.__RAW_DUMP.
import React, { useEffect, useState } from "react";
import { storage } from "../../lib/storage";
import { supabase, supabaseConfigured } from "../../lib/supabaseClient";
import { K } from "../../constants/keys";

const SHARED_KEYS = {
  marketers: {
    key: K.marketers,
    recordType: "array",
    fields: { id: "string", name: "string", email: "string", slug: "string", trackingId: "string", payPalEmail: "string", bio: "string", color: "string", createdAt: "number" },
  },
  products: {
    key: K.products,
    recordType: "array",
    fields: { price: "number", commission: "number", clicks: "number", createdAt: "number" },
  },
  sales: {
    key: K.sales,
    recordType: "array",
    fields: { saleAmount: "number", commissionAmount: "number", platformFee: "number", marketerNet: "number", ts: "number" },
  },
  payouts: {
    key: K.payouts,
    recordType: "array",
    fields: { amount: "number", ts: "number", paidAt: "number|null" },
  },
  settings: {
    key: K.settings,
    recordType: "object",
    fields: { platformFeePercent: "number" },
  },
  collections: {
    key: K.collections,
    recordType: "array",
    fields: { id: "string", marketerId: "string", title: "string", productIds: "array" },
  },
  clicks: {
    key: K.clicks,
    recordType: "array",
    fields: { productId: "string", marketerId: "string", ts: "number" },
  },
};
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const matches = (v, exp) =>
  exp === "number|null" ? v === null || typeof v === "number"
  : exp === "array" ? Array.isArray(v)
  : typeOf(v) === exp;

// For every field whose stored type !== expected type, capture the field value
// LITERALLY (no conversion, no sanitization) so we can see the corrupt object.
function audit(value, spec) {
  const list = spec.recordType === "array" ? value : [value];
  const mismatches = [];
  (Array.isArray(list) ? list : []).forEach((rec, i) => {
    if (!rec || typeof rec !== "object") {
      mismatches.push({ index: i, wholeRecordCantBeReadAsObject: rec });
      return;
    }
    Object.entries(spec.fields).forEach(([field, expected]) => {
      if (!(field in rec)) return;
      const v = rec[field];
      if (!matches(v, expected)) {
        mismatches.push({ index: i, field, expected, actualType: typeOf(v), literalValue: v });
      }
    });
  });
  return mismatches;
}

const tryParse = (raw) => {
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return { __notJson: String(raw) }; }
};

export default function RawDataDump() {
  const [text, setText] = useState("Dumping raw stored data…");
  useEffect(() => {
    (async () => {
      const out = { __note: "Literal stored copies — NOT the sanitized in-memory state.", timestamp: new Date().toISOString(), storageSource: supabaseConfigured ? "supabase (kv table), localStorage fallback" : "localStorage only", env: { supabaseConfigured }, personal: {}, shared: {}, localKeys: [], supabase: {} };

      // 1) Personal: which studio is logged in on this device
      const sessRaw = await storage.get(K.session, false);
      const sess = tryParse(sessRaw?.value ?? null);
      out.personal.session = { rawValue: sessRaw?.value ?? null, parsed: sess };
      const marketerId = sess?.marketerId ?? null;
      out.personal.marketerId = marketerId;

      // 2) Shared stores — via the adapter (Supabase→localStorage) plus the raw
      //    localStorage copy, so nothing is hidden by the fallback logic.
      for (const [name, spec] of Object.entries(SHARED_KEYS)) {
        const viaAdapter = await storage.get(spec.key, true).catch((e) => ({ error: String(e) }));
        const localRaw = localStorage.getItem("sch:shared:" + spec.key);
        const rawString = viaAdapter?.value ?? localRaw;
        const parsed = tryParse(rawString);
        out.shared[name] = {
          storedRawString: rawString == null ? null : String(rawString),
          parsedJson: parsed,
          typeMismatches: parsed && typeof parsed === "object" && !parsed.__notJson ? audit(parsed, spec) : [],
        };
      }
// 3) Supabase kv rows exactly as stored (when configured)
      if (supabaseConfigured) {
        try {
          const { data, error } = await supabase.from("kv").select("key,value");
          out.supabase.kvRows = error ? { error: String(error.message) } : data;
        } catch (e) { out.supabase.kvRows = { error: String(e) }; }
      }

      // 4) Every localStorage key under the app prefix, raw
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("sch:")) out.localKeys.push({ key: k, rawValue: localStorage.getItem(k) });
      }

      // 5) The logged-in studio record itself (first matching marketer)
      const mk = out.shared.marketers?.parsedJson;
      const studio = Array.isArray(mk) ? mk.find((m) => (m ? String(m.id) === String(marketerId) : false)) : null;
      out.personal.studioRecord = { marketerId, found: !!studio, record: studio ?? null };

      window.__RAW_DUMP = out;
      console.log("[RAW DUMP] full literal stored data →", JSON.stringify(out, null, 2));
      setText(JSON.stringify(out, null, 2));
    })();
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
      <h2 style={{ fontFamily: "sans-serif" }}>🔍 Raw stored data dump <span style={{ color: "#b00" }}>(temporary diagnostic — remove me)</span></h2>
      <p style={{ fontFamily: "sans-serif" }}>Copied to console too — <b>window.__RAW_DUMP</b>. Look at <code>typeMismatches[].literalValue</code> for the corrupt fields.</p>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#f6f6f4", padding: 12, borderRadius: 8 }}>{text}</pre>
    </div>
  );
}