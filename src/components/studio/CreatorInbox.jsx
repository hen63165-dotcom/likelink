import React, { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, Users } from "lucide-react";
import { useI18n } from "../../lib/LangContext";
import { useMarketplace } from "../../context/MarketplaceContext";
import { Button, EmptyState } from "../ui/index.jsx";
import { appendConversationMessage, getConversations, getOrCreateConversation, markConversationRead } from "../../lib/creatorConversations.js";
import { recordActivity } from "../../lib/studioActivity.js";

function InboxHeader({ he }) {
  return <div className="ll-card rounded-2xl p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}><MessageCircle size={19} /></div><div><h3 className="text-lg font-bold" style={{ color: "var(--text)" }}>{he ? "מסרים ושיחות" : "Messages & conversations"}</h3><p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{he ? "שיחה עם יוצר או מוכר נשמרת רק אם שניהם משתתפים. אין כאן מסירה בין מכשירים." : "Only the current participant can read or send in a conversation. This inbox is device-local, not cross-device delivery."}</p></div></div></div>;
}

function ConversationList({ he, conversations, selected, marketer, onOpen, contacts, onStart }) {
  return <div className="ll-card rounded-2xl p-3"><p className="mb-2 text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{he ? "שיחות" : "Conversations"}</p>{conversations.length === 0 ? <p className="text-xs" style={{ color: "var(--text-muted)" }}>{he ? "בחרי איש קשר להתחלת שיחה." : "Choose a contact to start a conversation."}</p> : <div className="space-y-1">{conversations.map((conversation) => { const other = conversation.participants.find((id) => id !== marketer.id); return <button key={conversation.id} type="button" onClick={() => onOpen(conversation)} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-right text-sm" style={{ background: selected?.id === conversation.id ? "var(--accent-subtle)" : "transparent", color: "var(--text)" }}><span className="truncate">{conversation.participantNames?.[other] || other}</span>{conversation.unreadCount > 0 && <span className="rounded-full px-1.5 text-[10px]" style={{ background: "var(--accent)", color: "var(--bg)" }}>{conversation.unreadCount}</span>}</button>; })}</div>}<div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}><p className="mb-2 text-xs font-bold" style={{ color: "var(--text-secondary)" }}>{he ? "התחל שיחה" : "Start a conversation"}</p>{contacts.length === 0 ? <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>{he ? "אין עדיין אנשי קשר אמיתיים." : "No real contacts yet."}</p> : contacts.slice(0, 6).map((person) => <button key={person.id} type="button" onClick={() => onStart(person)} className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-right text-xs" style={{ color: "var(--text-secondary)" }}><Users size={13} /><span className="truncate">{person.name || person.id}</span></button>)}</div></div>;
}

function Thread({ he, selected, marketer, body, onBody, onSend }) {
  if (!selected) return <div className="ll-card rounded-2xl p-4"><EmptyState icon={MessageCircle} title={he ? "בחרי שיחה" : "Choose a conversation"} body={he ? "השיחות מוגבלות למשתתפים ונשמרות מקומית." : "Participant-only conversations, stored locally."} /></div>;
  return <div className="ll-card flex min-h-[220px] flex-col rounded-2xl p-4"><div className="border-b pb-3" style={{ borderColor: "var(--border)" }}><p className="text-sm font-bold" style={{ color: "var(--text)" }}>{he ? "שיחה מקומית" : "Local conversation"}</p><p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>{he ? "הודעות נשמרות במכשיר זה בלבד." : "Messages are stored on this device only."}</p></div><div className="flex-1 space-y-2 overflow-auto py-3">{(selected.messages || []).length === 0 ? <p className="text-xs" style={{ color: "var(--text-muted)" }}>{he ? "אין עדיין הודעות. כתבי הודעה אמיתית." : "No messages yet. Write a real message."}</p> : selected.messages.map((message) => <div key={message.id} className="max-w-[90%] rounded-xl px-3 py-2 text-xs" style={{ marginInlineStart: message.senderId === marketer.id ? "auto" : 0, background: message.senderId === marketer.id ? "var(--accent-subtle)" : "var(--bg-subtle)", color: "var(--text)" }}>{message.body}<p className="mt-1 text-[9px]" style={{ color: "var(--text-faint)" }}>{new Date(message.createdAt).toLocaleString()}</p></div>)}</div><form onSubmit={onSend} className="flex gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}><input value={body} onChange={(event) => onBody(event.target.value)} placeholder={he ? "כתבי הודעה…" : "Write a message…"} className="input-field min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm" /><Button className="!w-auto !px-3" type="submit" disabled={!body.trim()}><Send size={15} /></Button></form></div>;
}


export default function CreatorInbox({ onNavigate }) {
  const { lang } = useI18n(); const he = lang === "he";
  const { currentMarketer: marketer, marketers = [], showToast } = useMarketplace();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [body, setBody] = useState("");
  const contacts = useMemo(() => (marketers || []).filter((person) => person?.id && person.id !== marketer?.id), [marketers, marketer]);
  const selected = conversations.find((conversation) => conversation.id === selectedId) || conversations[0] || null;
  useEffect(() => { setConversations(getConversations(marketer?.id)); }, [marketer?.id]);
  function refresh() { setConversations(getConversations(marketer?.id)); }
  function start(person) { const conversation = getOrCreateConversation(marketer.id, person); if (conversation) { setSelectedId(conversation.id); refresh(); } }
  function open(conversation) { setSelectedId(conversation.id); if (markConversationRead(conversation, marketer.id)) refresh(); }
  function send(event) {
    event.preventDefault(); if (!selected || !body.trim()) return;
    const result = appendConversationMessage(selected, marketer.id, body); if (!result) return;
    setBody(""); setSelectedId(result.conversation.id); refresh();
    recordActivity("message_sent", he ? "נשלחה הודעה בשיחה" : "Message sent in conversation", { conversationId: result.conversation.id });
    showToast(he ? "ההודעה נשמרה במכשיר הזה" : "Message saved on this device");
  }
  if (!marketer) return <EmptyState icon={Users} title={he ? "התחברי כדי לפתוח את המסרים" : "Sign in to open inbox"} body={he ? "המסרים מוגבלים למשתתפים ונשמרים מקומית במכשיר." : "Messages are participant-scoped and stored locally on this device."} action={<Button onClick={() => onNavigate?.("products")}>{he ? "מתחברות" : "Sign in"}</Button>} />;
  return <div className="space-y-4" data-testid="creator-inbox"><InboxHeader he={he} /><div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]"><ConversationList he={he} conversations={conversations} selected={selected} marketer={marketer} onOpen={open} contacts={contacts} onStart={start} /><Thread he={he} selected={selected} marketer={marketer} body={body} onBody={setBody} onSend={send} /></div></div>;
}
