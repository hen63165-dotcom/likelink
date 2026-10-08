# LikeLink2: marketing playbook (anonymous brand)

One sentence everything returns to:
> **אותו מוצר, 20 קישורים. LikeLink2 מראה לך איזה אמיתי.**

Rules (always):
- Every claim describes what the site does today.
- No invented numbers, testimonials, rankings or "best price".
- Every post carries `#פרסומת · קישור שותפים`.
- AI characters are labelled "דמות שנוצרה ב-AI". Site footage is labelled "הקלטת מסך אמיתית".
- Captions never promise "comment and I'll DM you" until a reply automation is live. The CTA is **הקישור בביו**.
- Never buy followers, never use follow/unfollow, never send spam DMs.

The brand's face is **Luna**, a recurring original AI character, so the owner stays anonymous.

## Formats

| # | Format | Asset source | Goal |
|---|---|---|---|
| A | Luna street story: character walks, "something missing?", real product photo | native reel engine (`ai_story` / `ai_ugc`) | reach + saves |
| B | "מצאתי את המוצר מהסרטון": real screen recording of search → "why here" → product | `scripts/media/content/render-pack.mjs` (screen-reel.mp4) | understand the site |
| C | Carousel "נבחרו השבוע", real photos + catalog prices | same script (carousel-*.jpg) | saves |
| D | Explainer: "אותו מוצר. 20 קישורים. איזה נכון?" | `public/promo/likelink-studio.mp4` | signups (buyers + creators) |
| E | Story poll / question: "מה חיפשת היום?" | manual, 1 min | engagement signals |

## 14-day calendar (Instagram + Facebook page)

Cap: 3 feed posts a day, 3 stories a day. Times are Israel time.

| Day | 12:00 | 15:00 | 20:00 | Stories |
|---|---|---|---|---|
| 1 | A: tennis bracelet | D: explainer v4 | A: ring | poll "על מה את מחפשת קישור?" |
| 2 | C: carousel "נבחרו השבוע" | B: screen reel | A: next product | "שמרי את הקרוסלה" |
| 3 | A | — | B (FB) | question box |
| 4 | C (FB + IG) | A | — | behind the scenes: Luna |
| 5 | B | A | D (FB) | poll |
| 6 | A | C: new week | — | "מה להוסיף לאתר?" |
| 7 | rest: reply to every comment and DM | | | |
| 8–14 | repeat: the week's best hook (most saves) twice, new products into A + C | | | |

Every Sunday: look at saves, shares and bio clicks (`utm_source=instagram`). The hook with the most saves becomes next week's opening line.

## Creators (the strongest lever)

Each day the owner personally sends **5–10** messages, never more. The targets are creators with 1k–20k followers who already recommend products.

Template (edit one personal line each time):

> היי {שם}! ראיתי את ההמלצה שלך על {מוצר} — ממש אהבתי איך הצגת את זה.
> יש לנו ב-LikeLink2 סטודיו חינמי ליוצרות: קישור מעקב לכל מוצר שאת ממליצה עליו, עמוד מוצר יפה, ורואים כמה קליקים הגיעו.
> אם בא לך לנסות — likelink2.vercel.app/studio 💜
> (ואם לא מתאים, הכל טוב, תודה שקראת!)

Follow-up after 3 days, once only, and only if she answered or reacted:

> רציתי לוודא שהקישור עבד לך — אם יש שאלה על הסטודיו אני כאן.

Collab post: when a creator opens a studio, offer an Instagram Collab post. The post appears on both profiles.

## Channels

- **Instagram:** connected (Windsor). Reels, carousels and stories.
- **Facebook page:** connect `facebook_organic` in Windsor. After that, the same posts go to the page (photo + text + link).
- **TikTok / YouTube Shorts / Pinterest:** upload the same MP4 manually. Pinterest suits product images with a link.

## Series F: "החפצים מדברים" (talking-object tips)

The format of the big Israeli tip accounts: a Pixar-style 3D everyday object with a face gives one useful tip, a hook sits in a box at the bottom, and a brand tag sits in the corner. We take the format only, never another account's name, characters or tag. Our objects come from the world of shopping, and our tag is "LikeLink2 · טיפ".

The owner generates each 8-second clip with Veo (Gemini). The prompts ask for no text and no logos. We then add:
- the hook box;
- the corner tag;
- "דמות שנוצרה ב-AI";
- `#פרסומת · קישור שותפים`, on product episodes only.

Every tip is true, and every site claim is something the site does today.

| # | Character | Hook on screen | Line (Hebrew, for the character to say) | Goal |
|---|---|---|---|---|
| F1 | crying delivery box | הזמנת מסרטון… והגיע משהו אחר? | הזמנת אותי מרילס? לפני שקונים – תבדקי שיש תמונה אמיתית וקישור שמוביל למוצר עצמו! | buyers |
| F2 | golden link vs sneaky grey link | אותו מוצר. 20 קישורים. רק אחד אמיתי. | הרבה קישורים מובילים לדף הבית של החנות. לחיצה ארוכה – ותראי לאן הקישור באמת לוקח אותך. | buyers |
| F3 | silver ring with a marquise stone | איך יודעים שזה באמת כסף? | תסתכלי בפנים שלי – אם כתוב 925, אני כסף אמיתי. ואם לא כתוב? תשאלי את המוכר. | product (p-live-01) |
| F4 | dramatic smartphone | ממליצה לחברות על מוצרים כל יום? בחינם? | את ממליצה על מוצרים כל יום! בלייקלינק פותחים סטודיו בחינם – עמוד משלך וקישור מעקב לכל מוצר. | creator sign-ups |
| F5 | price tag in a carnival mask | המבצע הזה… באמת מבצע? | ששש… אני "מבצע"! אבל הנחה אמיתית יש רק כשהיה מחיר קודם אמיתי. תבדקי! | buyers |

Veo prompt template (English works best). Paste the Hebrew line in place of LINE:

> Pixar-style 3D animation. CHARACTER, cute expressive face, SETTING. It looks at the camera and says in Hebrew, clearly and warmly: "LINE". Soft cinematic light, shallow depth of field, vertical 9:16, 8 seconds, no on-screen text, no logos.

Cadence: one per day. F4 (creators) runs twice a week. The episode with the most saves sets the next week's opening hook.
