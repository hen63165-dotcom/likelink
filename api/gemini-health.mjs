import { getGeminiHealth } from "../src/lib/cloud/geminiGateway.js";

export default async function handler(_req, res) {
  const health = await getGeminiHealth();
  res.status(health.ok ? 200 : health.configured ? 502 : 503).json({
    service: "likelink-gemini",
    timestamp: new Date().toISOString(),
    ...health,
  });
}
