const CONVERSATIONS_KEY = "ll:creator-conversations:v1";

function conversationStore() { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } }
function readConversations() { try { const value = JSON.parse(conversationStore()?.getItem(CONVERSATIONS_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
function writeConversations(value) { try { conversationStore()?.setItem(CONVERSATIONS_KEY, JSON.stringify(value.slice(-50))); return true; } catch { return false; } }
function clean(value, max = 120) { return String(value ?? "").trim().slice(0, max); }
function conversationId() { return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function messageId() { return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

export function canAccessConversation(conversation, viewerId) {
  const viewer = clean(viewerId); return Boolean(viewer && Array.isArray(conversation?.participants) && conversation.participants.includes(viewer));
}

export function getConversations(viewerId) {
  const viewer = clean(viewerId); if (!viewer) return [];
  return readConversations().filter((entry) => canAccessConversation(entry, viewer)).map((entry) => ({
    ...entry,
    messages: Array.isArray(entry.messages) ? entry.messages : [],
    unreadCount: (entry.messages || []).filter((message) => message.recipientId === viewer && !message.read).length,
  })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getOrCreateConversation(viewerId, recipient) {
  const viewer = clean(viewerId); const other = clean(recipient?.id);
  if (!viewer || !other || viewer === other) return null;
  const entries = readConversations();
  const existing = entries.find((entry) => canAccessConversation(entry, viewer) && Array.isArray(entry.participants) && entry.participants.includes(other));
  if (existing) return getConversations(viewer).find((entry) => entry.id === existing.id) || existing;
  const conversation = { id: conversationId(), participants: [viewer, other], participantNames: { [viewer]: viewer, [other]: clean(recipient?.name) || other }, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  writeConversations([...entries, conversation]); return conversation;
}

export function appendConversationMessage(conversation, senderId, body) {
  const sender = clean(senderId); const text = clean(body, 1200);
  if (!conversation?.id || !sender || !text || !canAccessConversation(conversation, sender)) return null;
  const entries = readConversations(); const index = entries.findIndex((entry) => entry.id === conversation.id && canAccessConversation(entry, sender));
  if (index < 0) return null;
  const message = { id: messageId(), conversationId: conversation.id, senderId: sender, recipientId: conversation.participants.find((id) => id !== sender), body: text, read: true, createdAt: Date.now() };
  entries[index] = { ...entries[index], messages: [...(entries[index].messages || []), message].slice(-100), updatedAt: message.createdAt };
  writeConversations(entries); return { conversation: entries[index], message };
}

export function markConversationRead(conversation, viewerId) {
  const viewer = clean(viewerId); if (!conversation?.id || !canAccessConversation(conversation, viewer)) return null;
  const entries = readConversations(); const index = entries.findIndex((entry) => entry.id === conversation.id && canAccessConversation(entry, viewer));
  if (index < 0) return null;
  entries[index] = { ...entries[index], messages: (entries[index].messages || []).map((message) => message.recipientId === viewer ? { ...message, read: true, readAt: Date.now() } : message) };
  writeConversations(entries); return entries[index];
}
