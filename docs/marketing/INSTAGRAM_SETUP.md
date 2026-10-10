# חיבור אינסטגרם: פרסום אוטומטי של רילסים מהאתר

מצב היום: מנוע הרילסים מרנדר ומאמת רילסים, אבל **לא שולח כלום לאינסטגרם** עד שהחיבור מוגדר
(`REQUIRES_CONNECTION`). זו התנהגות מכוונת. אין פרסום בלי מזהה פרסום אמיתי מ-Meta.

## דרישות (פעם אחת)
1. חשבון אינסטגרם מסוג **Business** או **Creator**, מחובר לעמוד פייסבוק.
2. אפליקציה ב-developers.facebook.com עם המוצר Instagram והרשאות
   `instagram_business_content_publish` (+ `instagram_business_manage_comments` לבוט התגובות,
   `instagram_business_manage_insights` ללמידה).
3. טוקן ארוך טווח (60 יום) והמספר של חשבון האינסטגרם (Instagram Business Account ID).
4. אל תדביקי טוקנים בצ'אט או בקוד. רק ב-Secrets.

## איפה מגדירים: שני מסלולים, שמות משתנים שונים
| מסלול | משתנים | איפה |
|---|---|---|
| מנוע הרילסים של האתר (`op=instagram`, שרת האתר) | `IG_USER_ID`, `IG_ACCESS_TOKEN`, אופציונלי `IG_DAILY_CAP` (ברירת מחדל 3) | משתני הסביבה של **פונקציית ה-API** (היום: Supabase edge function `api` / Netlify, כי Vercel חסום) |
| סקריפט העלאה מ-GitHub (`scripts/instagram/upload.mjs`) | `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` | GitHub → Settings → Secrets → Actions |
| בוט תגובות (`comment-bot.mjs`) | `IG_USER_ID`, `IG_ACCESS_TOKEN` | GitHub Secrets |

הרילסים של מוצרי האתר עוברים במסלול הראשון בלבד.

## בדיקה שזה עובד
1. Actions → "Native reels" → Run workflow (limit 1).
2. בשלב "Instagram Reels publisher": `status` צריך להיות `CONTAINER_CREATED` → `PUBLISHED`,
   ולא `REQUIRES_CONNECTION`.
3. הפרסום נחשב רק כשיש media id של אינסטגרם ב-`publish:log`.
4. כללים שנאכפים בקוד: רק רילסים v2 עם אודיו, לא אותו רילס פעמיים, עד `IG_DAILY_CAP` ביום,
   רק מוצר שעובר בדיקת תקינות קטלוג (תמונה אמיתית, לינק שותפים ייחודי).

## מה נשלח בכל רייל
כיתוב בעברית מתוך שדות המוצר האמיתיים בלבד, `#פרסומת · קישור שותפים`, גילוי שהסרטון אנימציה
ממוחשבת, ולינק מעקב עם `cid`. אין "הכי נמכר", אין ביקורות, אין הבטחות.
