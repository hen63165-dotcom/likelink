export const MODALITIES = Object.freeze(["text", "vision", "image", "video", "audio", "transcription", "translation"]);
const lists = ["languages", "markets", "audience", "categories", "products", "platforms", "successfulPatterns"];
export function creatorContext(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_CONTEXT");
  const result = { schemaVersion: 1 };
  for (const key of ["brand", "style", "tone"]) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || input[key].length > 300)) throw new Error("INVALID_CONTEXT");
    result[key] = input[key] || "";
  }
  for (const key of lists) {
    const value = input[key] || [];
    if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== "string" || v.length > 120)) throw new Error("INVALID_CONTEXT");
    result[key] = value;
  }
  // Preferences are explicit user input; successful patterns are not inferred performance.
  return { ...result, source: "creator_supplied" };
}
export function contentContext(input = {}) {
  if (!input || !["text", "product", "url", "image", "video", "audio"].includes(input.kind)) throw new Error("INVALID_CONTENT");
  if (typeof input.text !== "string" || input.text.length > 4000) throw new Error("INVALID_CONTENT");
  const result = { schemaVersion: 1, kind: input.kind, text: input.text, source: "user_supplied", analysisStatus: "NOT_ANALYZED" };
  if (input.url) {
    let url;
    try { url = new URL(input.url); } catch { throw new Error("INVALID_CONTENT"); }
    if (url.protocol !== "https:" || url.username || url.password || input.url.length > 1500) throw new Error("INVALID_CONTENT");
    // Metadata only: no server fetch (no SSRF / fake vision).
    result.url = input.url;
  }
  return result;
}
export function validateTask(input) {
  if (!input || !["luna.suggest", "autopilot.polish", "content.analyze", "content.translate"].includes(input.operation)) throw new Error("INVALID_TASK");
  if (!MODALITIES.includes(input.modality)) throw new Error("INVALID_TASK");
  return { operation: input.operation, modality: input.modality, content: contentContext(input.content) };
}
