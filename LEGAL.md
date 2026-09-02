# Likelink 2 — Legal & Security Dossier 🛡️

> This file documents the platform's legal posture, privacy practices and the
> security layers that protect **the owner** (you), **each studio creator**,
> and **the concept itself**. It accompanies a live, creator-facing summary at
> `/legal.html`. Everything below is written in plain Hebrew-first language so
> it can be shortlisted for a lawyer's final review.

---

## 1. Terms of Service (מסגרת התנאים)

The platform acts as a **technical marketplace**: it connects creators
("משווקות"), shoppers, and the products they link to. The operator is not the
seller of the underlying goods.

- **אופי הפלטפורמה**: Likelink היא פלטפורמה טכנית המאפשרת ליוצרות להציג מוצרים
  ולפרסם קישורים. המכירה בפועל מתבצעת מול החנות/המוכר המקורי, ו-Likelink אינה
  צד לחוזה המכר, אינה מחזיקה מלאי ואינה אחראית למוצר, למשלוח או להחזרים.
- **עמלה**: יוצרת זכאית לעמלה בגובה שנקבע ויאושר בפלטפורמה (ברירת מחדל 85%
  ליוצרת). התשלומים כפופים לתנאי המינימום למשיכה וללוח התשלומים, ומשולמים
  דרך PayPal או שיטת תשלום מאושרת אחרת.
- **התחייבויות יוצרת**: הצגת מוצרים אמיתיים וזמינים; אי-העתקת תוכן מוגן;
  אי-שימוש בתמונות/סימני מסחר ללא הרשאה; מסירת מידע נכון על מחירים וזמינות.
- **תוכן אסור**: מוצרים מזויפים, תוכן מטעה, הונאות, סחורות אסורות בחוק, או
  שימוש בפלטפורמה לפעילות בלתי חוקית — יובילו להסרה מיידית ולחסימת חשבון.
- **אחריות**: הפלטפורמה ניתנת "כפי שהיא". האחריות מוגבלת לסכום העמלות שהופקדו
  ובוצעו בפועל. לא תהיה אחריות לנזק עקיף או למצב השוק/רשתות החיצוניות.
- **שינויים**: התנאים עשויים להתעדכן מעת לעת; המשך שימוש מהווה הסכמה לגרסה
  המעודכנת.

---

## 2. Privacy Policy (פרטיות)

- **מה נאסף**:
  - פרטי חשבון של יוצרת: שם, אימייל, מזהה סטודיו, פרטי תשלום (אימייל PayPal).
  - נתוני שימוש: קליקים, מכירות, צפיות, קישורי הפניה, מועדפות ועוקבים.
  - נתוני מערכת: כתובת IP לצורך ניהול סיכונים (rate limiting) בלבד.
- **איפה הנתונים נשמרים**: מסד הנתונים של Supabase (טבלת `kv`) עם חיבור מוצפן
  TLS, ונתונים אישיים של דפדפן (סשן, מועדפות) ב-localStorage באותו מכשיר.
- **שיתוף צד ג'**: אין מכירה של נתונים. שיתוף מינימלי מול ספקי תשתית
  (Vercel, Supabase, PayPal) אך ורק לצורך הפעלת השירות.
- **זכויות**: זכות עיון, תיקון, מחיקה והוצאת נתונים. גישה להגדרות RLS והדרכה
  נמצאת ב-SECURITY.md ובקובץ זה סעיף 5.
- **עוגיות/אחסון**: האתר משתמש ב-localStorage/sessionStorage לצורך פעולה
  שוטפת, בחלקו עמיד (persistent) ובחלקו זמני.
- **אבטחת תשלומים**: פרטי תשלום מעובדים ישירות מול PayPal — מספרי כרטיס/גישה
  לחשבון PayPal **אינם** עוברים דרך שרתי Likelink.

---

## 3. Security Layers — הגנת האתר (אתה = בעל הפלטפורמה)

| שכבת הגנה | מצב | תיאור |
|---|---|---|
| ניהול אדמין צד-שרת | ✅ מיושם | `POST /api/admin/auth` — הקוד נשמר רק ב-`ADMIN_CODE` בשרת, אינו בבאנדל, טוקן HMAC-SHA256 תוקף 8h, rate-limit + השהייה |
| העדר סודות ב-JS ציבורי | ✅ מיושם | `VITE_ADMIN_CODE` הוסר לחלוטין מהקוד; המתקן אוסר להוסיפו ל-Vercel |
| סודות קרונים | ✅ מוכח | `PAYOUTS_SECRET` / `PRICE_WATCH_SECRET` / `AUTOPILOT_SECRET` + ה-header `x-vercel-cron` |
| פרטיות Studio (RLS) | 📌 מומלץ | הגדרת Row Level Security ב-Supabase כך שכל יוצרת תיגע רק לנתונים שלה (סעיף 5) |
| Headers אבטחה | ✅ מיושם | HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy (`vercel.json`) |
| סינון קלט | ✅ מיושם | `src/lib/security.js` — `sanitizeInput`/`sanitizeObject` ל-UI ולפני שמירה |
| מניעת Brute-Force | ✅ מיושם | rate-limiting לאימות אדמין + ניתוב רגישויות |
| HTTPS מלא | ✅ | מובטח ע"י Vercel + HSTS preload |

---

## 4. Protecting The Idea 📜 (הגנה על הרעיון)

- **הקוד**: כל הקוד הוא "פרטי"/בבעלותך הואיל והפרויקט הוא ריפו פרטי ב-GitHub.
  בנוסף — חוק זכויות יוצרים חל אוטומטית על קוד מקורי מרגע כתיבתו.
- **הגנה בקוד**: כל ה"מנועים" (AI hooks, Swarm, Growth Engine, גיימיפיקציה)
  הם קוד מקורי ומוגן. יש להשאיר את הריפו **פרטי**.
- **מומלץ להתקשר עם יוצרות**: בטרם תשלום משמעותי/שותפות ממושכת — חתימה על
  מסמך סודיות (NDA) + סעיף אי-תחרות לתקופה סבירה. תבנית סעיף כלולה
  בעמוד `/legal.html` ובקובץ זה.
- **סימן מסחר**: רישום סימן מסחר "Likelink" במשרד הפטנטים (אם טרם) — מומלץ
  אם בכוונה להתרחב. בדיקת זמינות: רשות הפטנטים הישראלית/EUIPO.
- **מה לא מגן**: אי-אפשר - ואין טעם - לנסות להגן על "מושג" כללי של
  affiliate-marketing; ההגנה היא על ה-bundle הספציפי, שם המותג והניסוחים.

---

## 5. Per-Studio Max Security (הגנת כל סטודיו)

מומלץ לאכוף ב-Supabase את המדיניות הבאה (לאחר חיבור Auth):

```sql
-- דוגמה: יוצרת קוראת/כותבת רק את השורות שלה
ALTER TABLE kv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator reads own studio" ON kv
  FOR SELECT USING (auth.uid()::text = key);

CREATE POLICY "creator writes own studio" ON kv
  FOR INSERT WITH CHECK (auth.uid()::text = key);
```

בנוסף:
- כל נתוני הסטודיו מאוחסנים תחת מפתח ייחודי של היוצרת (`key`).
- קלט ממוקד עובר סניטציה (`src/lib/security.js`) לפני שמירה.
- פרטי PayPal של יוצרת משמשים רק לשירות התשלומים ואינם מוצגים לשאר המשתמשים.

---

## 6. Production Checklist (לפני השקה)

- [ ] הוספת `ADMIN_CODE` + `ADMIN_SESSION_SECRET` ב-Vercel (Production + Preview);
      **הסרת** `VITE_ADMIN_CODE` אם קיים.
- [ ] === deploy ===
- [ ] הפעלת RLS לפי סעיף 5 (אם Supabase Auth מופעל).
- [ ] שינוי `ADMIN_CODE` ממחרוזת ברירת-המחדל למחרוזת אקראית (24+ תווים).
- [ ] ליווי משפטי לגרסה סופית של `/legal.html`.
- [ ] שמירת `.env` מחוץ ל-Git (כבר מוגדר ב-`.gitignore`).

---
*Likelink 2 — internal legal & security reference. Not a substitute for a lawyer's advice.*