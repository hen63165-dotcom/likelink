/**
 * LikeLink2 Voiceover Script Generator 🎙️
 * ========================================
 * Generates production-ready voiceover scripts from creative assets.
 *
 * Does NOT generate audio.
 * Does NOT connect to a TTS provider unless one is actually configured.
 *
 * Output:
 *   - language
 *   - tone
 *   - pacing
 *   - scene timing
 *   - hook
 *   - CTA
 *   - full voiceover script
 *
 * Status:
 *   VOICEOVER_READY — script generated, provider required for audio
 *   VOICEOVER_UNAVAILABLE — no provider configured
 */

export const VOICEOVER_STATUS = Object.freeze({
  READY: "VOICEOVER_READY",
  UNAVAILABLE: "VOICEOVER_UNAVAILABLE",
  PROCESSING: "VOICEOVER_PROCESSING",
  COMPLETED: "VOICEOVER_COMPLETED",
  FAILED: "VOICEOVER_FAILED",
  REAUTH_REQUIRED: "VOICEOVER_REAUTH_REQUIRED",
});

export function generateVoiceoverScript({ creative, product, character, ttsProvider = null }) {
  if (!creative || !product) return null;

  const script = creative.script || {};
  const language = creative.language || "he";
  const hasProvider = Boolean(ttsProvider);

  const lines = [];
  if (script.hook) lines.push({ text: script.hook, timingMs: 0, emotion: "excited" });
  if (script.introduction) lines.push({ text: script.introduction, timingMs: 3000, emotion: "friendly" });
  if (script.demonstration) lines.push({ text: script.demonstration, timingMs: 7000, emotion: "informative" });
  if (script.benefits) lines.push({ text: script.benefits, timingMs: 11000, emotion: "confident" });
  if (script.cta) lines.push({ text: script.cta, timingMs: 14500, emotion: "urgent_friendly" });

  const totalDurationMs = lines.length > 0 ? lines[lines.length - 1].timingMs + 3000 : 0;

  return {
    voiceoverId: `voiceover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: hasProvider ? VOICEOVER_STATUS.READY : VOICEOVER_STATUS.UNAVAILABLE,
    language,
    tone: character?.persona || "friendly_professional",
    pacing: "normal",
    totalDurationMs,
    lines,
    fullScript: lines.map((l) => l.text).join(" "),
    character: character ? { id: character.id, name: character.name } : null,
    provider: ttsProvider,
    blockers: hasProvider ? [] : ["no_tts_provider_configured"],
    metadata: {
      generatedAt: Date.now(),
      evidenceLevel: "ESTIMATED",
    },
  };
}

export function voiceoverSummary(voiceover, lang = "he") {
  if (!voiceover) return { he: "אין קריינות", en: "No voiceover" };
  const statusLabel = voiceover.status === VOICEOVER_STATUS.READY ? (lang === "he" ? "מוכן" : "Ready") : (lang === "he" ? "נדרש ספק" : "Provider required");
  return {
    he: `${statusLabel} · ${voiceover.lines?.length || 0} שורות · ${Math.round((voiceover.totalDurationMs || 0) / 1000)}s`,
    en: `${statusLabel} · ${voiceover.lines?.length || 0} lines · ${Math.round((voiceover.totalDurationMs || 0) / 1000)}s`,
  };
}
