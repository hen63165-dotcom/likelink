# השקה בעולם: מה עושים, צעד אחר צעד

כל הטקסטים באנגלית כאן מוכנים להעתקה. לא צריך להבין אותם: מעתיקים את הבלוק שמתחת לכותרת העברית ומדביקים.
כל מה שכתוב בהם אמיתי ונבדק מול הרדאר. אין בהם הבטחה, אין מספרי משתמשים ואין ביקורות.

## 1. האקר ניוז (Show HN): 5 דקות
1. נכנסים ל־news.ycombinator.com ופותחים חשבון (שם משתמש וסיסמה, בלי מייל).
2. לוחצים על submit.
3. בשדה title מדביקים את הכותרת, בשדה url את הקישור, ושולחים.
4. מיד אחרי זה לוחצים על הפוסט, ובתגובה הראשונה מדביקים את "התגובה הראשונה".
5. כדאי לפרסם בבוקר יום שלישי או רביעי (בשעון ישראל בין 15:00 ל־17:00).

כותרת:
```
Show HN: A product-trend radar that seals every call in Bitcoin before it is graded
```
קישור:
```
https://likelink2.vercel.app/radar?utm_source=hackernews&utm_medium=show_hn
```
התגובה הראשונה:
```
Hi HN. I built a radar that looks for consumer products that are starting to sell before they become trends.

Every morning it reads AliExpress's own order counts (through the official affiliate API), Google and YouTube suggestions in 51 countries plus Hebrew searches in Israel, and a few open social doors (Bluesky's AppView, Wikipedia pageviews).

The part I care about most: every call is written down in advance, hashed, and timestamped in Bitcoin through OpenTimestamps the same day, misses included. 14 days later it gets a public grade (hit at +50% in orders), and the grade is never edited. Trend tools I found publish accuracy they measured themselves; here you can check it yourself.

The evidence is open: for every new-product call, the store's daily order readings behind it, its sealed base and its grade:
https://github.com/hen63165-dotcom/likelink/releases/download/radar/evidence-public.json

Honest status: the record is young. The first grades are coming in now, and they will be shown as they are.

Things I learned the hard way this week: a seller's "2026 New" in a title proves nothing, so a product counts as new only if the radar saw it from its first orders; and "sticker paper for a kids' camera" is not a kids' camera.

I'd love blunt feedback on the method.
```

## 2. אינדי האקרס (Indie Hackers): 5 דקות
1. נכנסים ל־indiehackers.com ופותחים חשבון.
2. לוחצים על New Post, בוחרים בקבוצה Building in Public.
3. מדביקים כותרת וטקסט.

כותרת:
```
I seal every trend call in Bitcoin before it's graded. Here is the open evidence.
```
טקסט:
```
I'm building LikeLink2's trend radar alone, in public.

It reads AliExpress order counts every morning, plus Google and YouTube searches in 51 countries, and only calls a product when the numbers agree. Every call is timestamped in Bitcoin the same day, misses included, and graded in public 14 days later.

This week an outside review showed me two mistakes, so I fixed both in public: a "2026 New" smartwatch that was already selling 502 orders a month (now: new only if the radar saw it from the start), and thermal sticker paper filed as a kids' camera (now: an accessory "for X" is never X).

The daily readings behind every call are open here:
https://github.com/hen63165-dotcom/likelink/releases/download/radar/evidence-public.json

Radar (free during the trial): https://likelink2.vercel.app/radar?utm_source=indiehackers
```

## 3. פרודקט האנט (Product Hunt): 20 דקות, עדיף אחרי הדומיין
1. נכנסים ל־producthunt.com, פותחים חשבון ולוחצים על Submit.
2. מדביקים את הקישור, השם, השורה הקצרה והתיאור.
3. מעלים 3 צילומי מסך של עמוד הרדאר (היום, ההוכחה, ספר החתימות).
4. בוחרים תאריך השקה ומדביקים את התגובה הראשונה ביום ההשקה.

שם:
```
LikeLink2 Trend Radar
```
שורה קצרה (עד 60 תווים):
```
Product trends, sealed in Bitcoin before they're graded
```
תיאור:
```
A radar for consumer-product trends. Every morning it reads AliExpress order counts and searches in 51 countries, calls a product only when the signals agree, seals every call in Bitcoin the same day (misses included) and grades it in public 14 days later. The daily evidence behind each call is open for anyone to check.
```
התגובה הראשונה:
```
Hi! I'm the maker. Trend tools usually publish an accuracy figure they measured themselves. I wanted the opposite: every call written in advance, timestamped in Bitcoin, graded in public, with the raw daily readings open. The record is young and growing every day. Feedback welcome.
```
