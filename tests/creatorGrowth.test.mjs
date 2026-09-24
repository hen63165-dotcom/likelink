import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPromotionLink,
  buildPromotionMessage,
  getPromotionDrafts,
  PROMOTION_STATUS,
  savePromotionDraft,
  savePromotionStatus,
} from "../src/lib/creatorGrowth.js";
import {
  appendConversationMessage,
  canAccessConversation,
  getConversations,
  getOrCreateConversation,
  markConversationRead,
} from "../src/lib/creatorConversations.js";

function localStorageHarness() {
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  } };
  return values;
}

test("creator promotion uses real product attribution and explicit status transitions", () => {
  localStorageHarness();
  const link = buildPromotionLink({ product: { id: "p1" }, marketer: { id: "m1" }, goal: "product", channel: "whatsapp" });
  assert.match(link, /\/p\/p1/);
  assert.match(link, /utm_source=creator_whatsapp/);
  assert.match(link, /utm_campaign=creator_self_promotion/);
  assert.match(link, /product_id=p1/);
  assert.match(buildPromotionMessage({ product: { title: "מוצר אמיתי" }, goalId: "product" }), /מוצר אמיתי/);

  const draft = savePromotionDraft({ marketer: { id: "m1" }, product: { id: "p1", title: "מוצר אמיתי" }, goalId: "product", channels: ["copy"] });
  assert.equal(draft.status, PROMOTION_STATUS.DRAFT);
  assert.equal(savePromotionStatus(draft, PROMOTION_STATUS.READY_TO_SHARE).status, PROMOTION_STATUS.READY_TO_SHARE);
  assert.equal(savePromotionStatus(draft, PROMOTION_STATUS.APPROVED).status, PROMOTION_STATUS.APPROVED);
  assert.equal(getPromotionDrafts("other").length, 0);
});

test("conversation records are participant-scoped and unread state is local", () => {
  localStorageHarness();
  const conversation = getOrCreateConversation("m1", { id: "m2", name: "Creator Two" });
  assert.ok(conversation);
  assert.equal(canAccessConversation(conversation, "m1"), true);
  assert.equal(canAccessConversation(conversation, "m3"), false);
  assert.equal(getConversations("m3").length, 0);
  assert.equal(appendConversationMessage(conversation, "m3", "not allowed"), null);
  const result = appendConversationMessage(conversation, "m1", "Hello from the creator");
  assert.equal(result.message.senderId, "m1");
  assert.equal(result.message.recipientId, "m2");
  assert.equal(markConversationRead(conversation, "m1").messages.length, 1);
  assert.equal(getConversations("m1")[0].unreadCount, 0);
});
