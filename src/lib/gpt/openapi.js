// OpenAPI 3.1 for the "Likelink Content Studio" Custom GPT.
// Served at /api/gpt/openapi.json (→ /api/store?mode=gpt&op=openapi).
// Read-mostly: the only write is create_content_draft, which stores a DRAFT.
// There is intentionally no publish operation.
import { PRODUCTION_ORIGIN } from "../../constants/domain.js";
import { DISTRIBUTION_CHANNELS } from "../discovery/distribution.js";

const CHANNELS = DISTRIBUTION_CHANNELS.map((c) => c.id);
const ERR = { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };

export function buildOpenApiSpec({ origin } = {}) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Likelink Content Studio API",
      version: "1.0.0",
      description: "Read the creator's own LikeLink products and tracking links, and save content DRAFTS to their studio. Drafts are never published by this API — the creator reviews and posts them. No income or sales claims; no invented testimonials.",
    },
    servers: [{ url: origin || PRODUCTION_ORIGIN }],
    security: [{ ApiKey: [] }],
    paths: {
      "/api/gpt/products": {
        get: {
          operationId: "list_products",
          summary: "List the creator's approved products",
          description: "Returns the creator's own approved products (title, description, price, category, image, page URL). Use only these facts in content.",
          responses: { 200: { description: "Products", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, products: { type: "array", items: { $ref: "#/components/schemas/Product" } } } } } } }, 401: ERR, 402: ERR, 429: ERR },
        },
      },
      "/api/gpt/products/{productId}/tracking-link": {
        get: {
          operationId: "get_tracking_link",
          summary: "Get the tracking link for a product",
          description: "Returns the product's tracking link (clicks are attributed to the channel) and the disclosure text that must appear in the post.",
          parameters: [
            { name: "productId", in: "path", required: true, schema: { type: "string" } },
            { name: "channel", in: "query", required: false, schema: { type: "string", enum: CHANNELS } },
          ],
          responses: { 200: { description: "Tracking link", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, productId: { type: "string" }, trackingLink: { type: "string", format: "uri" }, disclosure: { type: ["string", "null"] } } } } } }, 401: ERR, 402: ERR, 404: ERR, 429: ERR },
        },
      },
      "/api/gpt/drafts": {
        get: {
          operationId: "list_drafts",
          summary: "List recent drafts",
          description: "The 20 most recent content drafts in the creator's studio, with their status.",
          responses: { 200: { description: "Drafts", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, drafts: { type: "array", items: { $ref: "#/components/schemas/Draft" } } } } } } }, 401: ERR, 402: ERR, 429: ERR },
        },
        post: {
          operationId: "create_content_draft",
          summary: "Save a content draft (never published)",
          description: "Saves a DRAFT for one product and channel. The server adds the disclosure and the tracking link if missing. Rejects testimonials, reviews, rankings and guarantees. Nothing is posted.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: {
              type: "object",
              required: ["productId", "channel", "hook", "caption"],
              properties: {
                productId: { type: "string" },
                channel: { type: "string", enum: CHANNELS },
                hook: { type: "string", maxLength: 200 },
                script: { type: "string", maxLength: 4000, description: "Optional 15–30s script. Facts from the product only." },
                caption: { type: "string", maxLength: 2200 },
                hashtags: { type: "array", maxItems: 10, items: { type: "string", maxLength: 40 } },
              },
            } } },
          },
          responses: { 201: { description: "Draft saved", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, draft: { $ref: "#/components/schemas/Draft" } } } } } }, 400: ERR, 401: ERR, 402: ERR, 404: ERR, 422: ERR, 429: ERR },
        },
      },
      "/api/gpt/drafts/{draftId}": {
        get: {
          operationId: "get_draft_status",
          summary: "Get one draft and its status",
          description: "DRAFT until the creator approves it in the studio. The API cannot approve or publish.",
          parameters: [{ name: "draftId", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Draft", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, draft: { $ref: "#/components/schemas/Draft" } } } } } }, 401: ERR, 404: ERR, 429: ERR },
        },
      },
    },
    components: {
      securitySchemes: { ApiKey: { type: "http", scheme: "bearer", description: "A LikeLink API key (llk_…) created in the studio. Professional plan." } },
      schemas: {
        Product: { type: "object", properties: {
          id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, price: { type: ["number", "null"] },
          currency: { type: "string" }, category: { type: "string" }, image: { type: ["string", "null"] }, productUrl: { type: "string", format: "uri" },
          saleModel: { type: "string", enum: ["affiliate", "direct", "none"] },
        } },
        Draft: { type: "object", properties: {
          id: { type: "string" }, productId: { type: "string" }, channel: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "APPROVED_FOR_MANUAL_POST"] },
          hook: { type: "string" }, caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" } },
          trackingLink: { type: "string", format: "uri" }, createdAt: { type: "string" }, approvedAt: { type: ["string", "null"] },
          source: { type: "string" }, aiLabel: { type: "string" }, note: { type: "string" },
        } },
        Error: { type: "object", properties: { ok: { type: "boolean" }, error: { type: "string" }, explanation: { type: "string" } } },
      },
    },
  };
}
