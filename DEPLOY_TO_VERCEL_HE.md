# מדריך פרסום Likelink ל-Vercel - Israel's Premier Social Commerce Platform

## סקירה כללית

מדריך זה יcovered איך לפרסם את Likelink באופן מלא ל-Vercel ולקבל URL ציבורי לפעולה.

---

## שלב 1: הכנת הפרויקט

### 1.1 התקנת TLDs נדרשים

```bash
cd C:\Users\User\Desktop\likelink2
npm install
```

### 1.2 הגדרת משתני סביבה

צור קובץ `.env` בשורש הפרויקט:

```env
VITE_SUPABASE_URL=https://sbzzgfthgaurgcuxiuql.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_ADMIN_CODE=hub-admin-2026
```

**חשוב:**
- קבל את ה-SUPABASE_URL וה-ANON_KEY מ-Supabase Dashboard
- Admin code נגיש למנהלים בלבד

---

## שלב 2: Build מקומי

### 2.1 הרצת Build

```bash
npm run build
```

**צפה ב-output:**
- `dist/` תיקייה חדשה נוצרת
- גודל כולל: ~2MB (כולל HTML, CSS, JS)

### 2.2 בדיקת תקינות

```bash
npm run preview
```

פתח דפדפן בכתובת `http://localhost:4173` ובדוק:
- [ ] תמונה נטענת
- [ ] פיד מוצרים מוצג
- [ ] עגלה פועלת
- [ ] analytics עובד

---

## שלב 3: פרסום ל-Vercel

### 3.1 התקנת Vercel CLI

```bash
npm install -g vercel
```

### 3.2 העלאה ראשונה

```bash
cd C:\Users\User\Desktop\likelink2
vercel
```

**בקש Hoe:**
1. Set up and deploy? **Yes**
2. Which scope? **חשבון שלך**
3. Link to existing project? **No**
4. Project name? **likelink**
5. In which directory is your code located? **./**
6. Want to override settings? **No**

### 3.3 הגדרת משתני סביבה ב-Vercel

אחרי העלאה ראשונה:

```bash
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel env add VITE_ADMIN_CODE
```

או דרך ה-Vercel Dashboard:
1. לך ל-[vercel.com/dashboard](https://vercel.com/dashboard)
2. בפרויקט `likelink` > Settings > Environment Variables
3. הוסף כל משתנה מסוג `Production`

---

## שלב 4: תצורה נוספת

### 4.1 עדכון Domain

**אפשרויות:**

**אופציה A - Vercel Domain (חינם):**
- כתובת זמנית: `likelink.vercel.app`
- ניתן לשנות ב-Settings > Domains

**אופציה B - Domain משלי (מומלץ):**
- רכש domain מ-GoDaddy, Namecheap, או אחר
- ב-Vercel Settings > Domains > Add

**אפשרויות DomainPOPULARIES בישראל:**
- `likelink.co.il`
- `likelink.app`
- `getlikelink.com`

### 4.2 הגדרת SEO

ערוך `index.html`:

```html
<head>
  <title>Likelink - פלטפורמת הסחר הסוציאלי המובילה בישראל</title>
  <meta name="description" content="הפכו את הפיד לרמקול מכירות. יוצרים מוכרים מוצרים, קונים רוכשים בקלות.">
  <meta name="keywords" content="social commerce, affiliate marketing, ישראל, יוצרים, מכירות">
  <link rel="canonical" href="https://likelink.co.il">
</head>
```

---

## שלב 5: עדכון תחזוקה

### 5.1 עדכון קבוע

כאשר משנה בקוד:

```bash
# עדכון ידני
vercel --prod

# או העלאה אוטומטית
git push origin main  # אם מחובר ל-GitHub
```

### 5.2 בדיקות לאחר עדכון

```bash
# בדיקת URL
curl https://likelink.vercel.app

# בדיקת API
curl https://likelink.vercel.app/api/health
```

---

## שלב 6: ניטור ואבטחה

### 6.1 Vercel Analytics

1. Vercel Dashboard > Analytics
2. הפעל Web Analytics
3. עקוב אחרי:
   - Page Views
   - Unique Visitors
   - Bounce Rate
   - Avg Session Duration

### 6.2 הגדרת Security Headers

צור `vercel.json` בשורש הפרויקט:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {"key": "X-Frame-Options", "value": "DENY"},
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "Permissions-Policy", "value": "geolocation=(), microphone=()"}
      ]
    }
  ]
}
```

### 6.3 הגנת מקור קוד

```bash
# confirmation שהקוד לא Metropolitan
ls -la dist/
# אמור להיות רק קבצים מ�-build, לא שורשים מקוריים
```

---

## שלב 7: בדיקות סופיות

### 7.1 Checklist לפני פרסום

- [ ] Build עובד מקומית (`npm run build`)
- [ ] אין שגיאות Console
- [ ] Supabase מוגדר ומחובר
- [ ] משתני סביבה הוגדרו ב-Vercel
- [ ] ערכת עיצוב עובדת
- [ ] תמונות נטענות מ-CDN
- [ ] Analytics עוקב אחריイベントים

### 7.2 בדיקת URL ציבורי

```bash
# בדוק שהאתר עולה
curl -I https://likelink.vercel.app

# צפה ב-Status Code
# אמור להיות 200 OK
```

---

## שלב 8: תחזוקה שוטפת

### טבלת תחזוקה חודשית

| משימה | תדירות | עדכון |
|--------|----------|--------|
| Build ובדיקה | שבועי | גרסה חדשה |
| עדכון TLDs | חודשי | `npm update` |
| גיבוי נתונים | שבועי | Supabase backup |
| ניטור אבטחה | יומי | Vercel alerts |
| בדיקת ביצועים | חודשי | Vercel Analytics |

### עדכוני TLDs קריטיים

```bash
# עדכון React
npm install react@latest react-dom@latest

# עדכון Vite
npm install vite@latest

# עדכון Framer Motion
npm install framer-motion@latest
```

---

## טיפול בבעיות נפוצות

### בעיה: Build נכשל

```bash
# נקה cache
rm -rf node_modules package-lock.json
npm install
npm run build
```

### בעיה: משתני סביבה לא עובדים

1. וודא שהשתנת beginning ב-`import.meta.env`
2. בדוק ב-Vercel Dashboard שהמשתנים מוגדרים
3. ריסטarto Build

```bash
vercel --prod --force
```

### בעיה: Supabase לא מחובר

```bash
# בדוק URL
console.log(import.meta.env.VITE_SUPABASE_URL)

# בדוק שאיןorer Errors
# בדוק מדיניות RLS ב-Supabase
```

---

## רשת תמיכה

- **Vercel Docs:** https://vercel.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **React Docs:** https://react.dev
- **Likelink Support:** support@likelink.co.il

---

## סיכום

✅ **לאחר ביצוע כל השלבים:**

- אתר פעיל ב-`https://likelink.vercel.app`
- או ב-Domain משלי `https://likelink.co.il`
- העלאה אוטומטית מוגדרת
- אבטחה מורטת
- ניטור פעיל

**הפלטפורמה מוכנה לשרת את יצואנים ולקוחות בישראל!** 🇮🇱🚀
