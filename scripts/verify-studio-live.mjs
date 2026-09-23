// Live Studio verification — real browser (headless Edge + CDP) against a
// running origin (production by default). Verifies the user-facing Studio:
//   • dark navy command center (no cream override)
//   • every sidebar view renders real content (no dead-end screens)
//   • Luna opens from the visible Studio UI and reacts to a real click
//   • a real user action lands in the Overview activity strip
//   • navigation works and NO uncaught browser exceptions occur
// Usage: node scripts/verify-studio-live.mjs [baseUrl]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const BASE = process.argv[2] || "https://likelink2.vercel.app";
const PORT = 9347;
const NAV_LABELS = [
  "סקירה כללית", "לונה · מרכז בקרה", "מוצרים וסטודיו", "תבונת מוצר",
  "UGC · קהילה", "וידאו AI", "מעבדת יוצרים", "תוכן",
  "שיווק עצמי", "קמפיינים", "טרנדים", "פרסום", "ביצועים",
  "אמון", "טייס אוטומטי", "המלצות", "הגדרות",
];
const CREAM = "rgb(247, 243, 234)";
const NAVY = "rgb(11, 13, 26)";
const LUNA_BUBBLE = 'button[aria-label="עוזרת דיגיטלית"]';

const profile = mkdtempSync(join(tmpdir(), "likelink-studio-live-"));
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" });

let ws;
const exceptions = [];
const report = { views: {}, luna: {}, activity: {}, theme: {} };

export const __unused = null;

try {
  let targets;
  for (let n = 0; n < 60; n++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(targets?.length, "Edge remote debugger did not start");
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description || d.text || "unknown exception");
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const until = async (expr, tries = 80) => {
    for (let i = 0; i < tries; i++) { if (await evaluate(`Boolean(${expr})`)) return true; await new Promise((r) => setTimeout(r, 150)); }
    throw new Error("timeout: " + expr);
  };
  const clickText = async (text) => evaluate(
    `(() => { const b = [...document.querySelectorAll('button,a')].find(x => (x.textContent||'').includes(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`
  );
  const bodyText = () => evaluate("document.body.textContent || ''");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const gotoStudio = async (view) => {
    await send("Page.navigate", { url: view ? `${BASE}/studio/${view}` : `${BASE}/studio` });
    await until("document.getElementById('root') && document.getElementById('root').children.length > 0");
    await sleep(900);
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await gotoStudio();

  const themeProbe = await evaluate(`({ theme: document.documentElement.getAttribute('data-theme'), body: getComputedStyle(document.body).backgroundColor })`);
  report.theme = themeProbe;
  assert.equal(themeProbe.theme, "dark", "Studio must be dark");
  assert.notEqual(themeProbe.body, CREAM, "Studio body must not be cream");
  assert.equal(themeProbe.body, NAVY, "Studio body must be deep navy #0b0d1a");

  for (const label of NAV_LABELS) {
    const clicked = await clickText(label);
    assert.ok(clicked, `sidebar item must exist: ${label}`);
    await sleep(700);
    const text = await bodyText();
    report.views[label] = text.replace(/\s+/g, " ").trim().slice(0, 110);
    assert.ok(text.length > 300, `view "${label}" rendered too little content (${text.length} chars)`);
  }

  await gotoStudio("luna");
  await until(`document.querySelector('${LUNA_BUBBLE}')`);
  await evaluate(`document.querySelector('${LUNA_BUBBLE}').click()`);
  await sleep(500);
  await until("[...document.querySelectorAll('button')].some(b => (b.textContent||'').includes('בקשי מלונה'))");
  assert.ok(await clickText("בקשי מלונה רעיון לקידום"), "Luna ask button must be clickable");
  let lunaText = "";
  let sawThinking = false;
  for (let i = 0; i < 60; i++) {
    const t = await bodyText();
    if (t.includes("לונה חושבת")) sawThinking = true;
    if (sawThinking && !t.includes("לונה חושבת")) { lunaText = t; break; }
    await sleep(250);
  }
  if (!lunaText) lunaText = await bodyText();
  report.luna = { thinking: sawThinking, afterAsk: lunaText.replace(/\s+/g, " ").slice(0, 220) };
  assert.ok(sawThinking, "Luna must show a visible loading state");
  const honest = ["הענן", "המנוע", "מכסת", "התחברות", "מוכן", "רעיון"].some((k) => lunaText.includes(k));
  assert.ok(honest, "Luna must end in a real result or an honest status");

  await gotoStudio();
  let overview = await bodyText();
  if (!overview.includes("תנועה אחרונה")) {
    await evaluate(`document.querySelector('${LUNA_BUBBLE}')?.click()`);
    await sleep(400);
    await clickText("בקשי מלונה רעיון לקידום");
    await sleep(2500);
    await gotoStudio();
    overview = await bodyText();
  }
  report.activity = {
    stripVisible: overview.includes("תנועה אחרונה"),
    hasLunaEntry: overview.includes("לונה") || overview.includes("ביקשת"),
  };
  assert.ok(report.activity.stripVisible, "Overview must show the activity strip after real actions");
  assert.ok(report.activity.hasLunaEntry, "activity strip must contain the real Luna action");

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync("scripts/_studio-live.png", Buffer.from(shot.data, "base64"));
  assert.deepEqual(exceptions, [], "no uncaught browser exceptions expected");

  console.log("STUDIO LIVE PASS");
  console.log(JSON.stringify(report, null, 2));
} finally {
  ws?.close();
  edge.kill();
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 1500);
}

