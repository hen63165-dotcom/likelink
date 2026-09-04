# Likelink — השלבים הבאים (NEXT STEPS)

מדריך זה מיועד לבעלת הפלטפורמה. הוא מסביר מה עדיין צריך לעשות ביד כדי שהאפליקציה
תעבוד עם אימות אמיתי ותשלומים אמיתיים לפני השקה.

---

## 1. משתני סביבה (`.env`) — חייבים למלא
העתיקי את הקובץ `.env.example` לקובץ `.env` ומלאי את הערכים:

```
VITE_SUPABASE_URL=https://<הפרויקט שלך>.supabase.co
VITE_SUPABASE_ANON_KEY=<המפתח הציבורי anon>
ADMIN_CODE=<קוד מנהל ארוך ואקראי — בצד השרת בלבד, לעולם לא עם קידומת VITE_>
```

בלי אלה, האפליקציה רצה במצב דמו (הנתונים נשמרים רק בדפדפן המקומי ואינם משותפים).
**חסר כרגע:** כל שלושת המשתנים (אין קובץ `.env` על הדיסק במצב הנוכחי).

## 2. ספק תשלומים ישראלי — הרשמה וקישור
אין דרך לפתוח עבורך חשבון סוחר — זה דורש הרשמה והזדהות עסקית שלך. השלבים:

1. בחרי ספק: **Tranzila** (`trendline.co.il`) · **Cardcom** (`cardcom.co.il`) · **PayPlus**.
2. הירשמי לחשבון סוחר (נדרשים פרטי עסק וחשבון בנק).
3. קבלי מהספק: **מזהה סוחר (merchant id)** ו-**מפתח API (api key)**.

### איפה להדביק בקוד
קובץ: `src/lib/payments.js`

- בחלק `PROVIDER_CONFIG`: מלאי `merchantId`, `apiKey` ו-`apiBaseUrl`
  (כתובת ה-API האמיתית של הספק).
- בפונקציה `processPayout()`: החלפי את הקטע המסומן
  `PAYMENT PROVIDER API CALL GOES HERE` בקריאת ה-API האמיתית של הספק
  ליצירת העברה/תשלום ליוצרת.

## 3. RLS — אבטחת נתונים (לפני השקה)
כל יוצרת תיגש רק לנתונים שלה (לא של אחרות), ורק מנהלת תשנה הגדרות כלליות.
הדביקי את זה ב-**SQL Editor** של Supabase:

```sql
-- טבלת פרופילים לכל משתמש מאומת
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  owner_uid uuid,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- כל משתמש קורא/כותב רק את הפרופיל שלו
create policy "own profile" on public.profiles
  for all using (auth.uid() = id);

-- דוגמה לטבלת marketers: יוצרת נוגעת רק בשורות שלה
alter table public.marketers enable row level security;
create policy "seller own marketers" on public.marketers
  for all using (auth.uid() = owner_uid);
```

## 4. אימות אמיתי (Supabase Auth)
האימות כבר **מחובר** לממשק ההרשמה/כניסה: שדות סיסמה נוספו ב-
`src/components/sell/SellView.jsx`, והפונקציות ב-`src/lib/auth.js`
(`signUpSeller`, `signInSeller`, `signOutSeller`, `isAdmin`) נקראות מ-
`src/context/MarketplaceContext.jsx`. אם אין משתני סביבה — נופל למצב דמו מקומי.

כדי להפעיל אימות אמיתי:
1. מלאי `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
2. הפעילי ב-Supabase: **Authentication → Providers → Email**.
3. צרי את טבלת `profiles` (ראה סעיף RLS למטה) כדי ש-`isAdmin()` ו-RLS יעבדו.

## 5. נתוני תשלום
מודל הנתונים ב-`src/lib/payments.js` מוכן:
- `getSellerPayoutSummary(sales, marketerId)` — להציג ליוצרת כמה מגיע לה.
- `processPayout(payout)` — לבצע בפועל העברה (אחרי חיבור הספק).

---

## מה אמיתי עכשיו / מה ממתין לך
**אמיתי:** הפיד, פרופילי יוצרות, הסטודיו, רישום קליקים ומכירות, ניהול, עברית+אנגלית ו-RTL.
**ממתין לך:** הרשמה לספק תשלום ישראלי, חיבור Supabase Auth, הטמעת מדיניות ה-RLS,
ומילוי משתני הסביבה ב-`.env`.

---

## 6. מערכת התשלומים האוטומטית (Cron) — בדיקה ידנית

מערכת התשלומים רצה אוטומטית כל יום ב-**02:00 UTC** (Vercel Cron).
אפשר להריץ אותה ידנית בכל רגע כדי לבדוק:

### איך בודקים ידנית
```
POST https://<הדומיין שלך>.vercel.app/api/payouts/process?secret=<ערך PAYOUTS_SECRET>
```

או עם curl:
```bash
curl -X POST "https://<הדומיין שלך>.vercel.app/api/payouts/process?secret=YOUR_SECRET"
```

**תשובה מוצלחת:**
```json
{ "ok": true, "processed": 2, "results": [ ... ] }
```

### מה צריך להיות מוגדר ב-Vercel
רשימה מלאה עם הסברים: `.env.example`. המשתנים הרלוונטיים ל-worker:
| משתנה | למה |
|---|---|
| `PAYPAL_CLIENT_ID` | מזהה הלקוח של PayPal (fallback: `VITE_PAYPAL_CLIENT_ID`) |
| `PAYPAL_CLIENT_SECRET` | סוד PayPal — זיהוי Sandbox/פרודקשן אוטומטי לפי שם הסוד |
| `PAYPAL_ENV=live` | אופציונלי — כופה פרודקשן גם אם הסוד מכיל "sandbox" |
| `PAYOUTS_SECRET` | סוד לאימות קריאות ידניות ל-worker (?secret=...) |

### איך זה עובד
1. יוצרת בוחרת בסטודיו שלה "PayPal" ומחברת את האימייל שלה (מודאל "חיבור PayPal").
2. אדמין יוצר תשלום מהפאנל — הסטטוס "ממתין".
3. ה-cron היומי (או קריאה ידנית) שולח דרך PayPal Mass Payouts לאימייל שנשמר,
   מסמן "שולם" עם מזהה אצווה, והיוצרה רואה את זה ב"היסטוריית תשלומים" בסטודיו.
4. שיטת "בנק" או "אחר" מתועדות לטיפול ידני שלך (הערה עם הפרטים נשמרת בתשלום).

### הערות
- **Sandbox vs Production:** אם `PAYPAL_CLIENT_SECRET` מכיל "sandbox" — התשלומים
  נשלחים לסביבת הבדיקה של PayPal (לא כסף אמיתי). אחרת — פרודקשן.
  אפשר לכפות פרודקשן עם `PAYPAL_ENV=live`.
- ה-worker מאובטח: הוא מקבל בקשות רק מ-Vercel Cron (header `x-vercel-cron`)
  או עם הסוד הנכון בפרמטר `secret`.
- אם אין תשלומים ממתינים, התשובה תהיה `{ "ok": true, "processed": 0 }`.
