# Likelink Content Studio: a Custom GPT for ChatGPT

A GPT that writes content drafts in Hebrew for the creator's real products, and saves them as drafts in the LikeLink studio. It can't publish, approve or charge.

## What is needed

- A **Professional** plan in LikeLink. Only this plan can create API keys.
- A ChatGPT account that can build GPTs (ChatGPT → Explore GPTs → Create).
- The GPT is set up by hand in the ChatGPT interface. LikeLink doesn't automate ChatGPT.

## Setup steps

1. **Create an API key in the studio:** Studio → "תוכניות הפצה" → "חיבור ל-ChatGPT" → "יצירת מפתח".
   - The key starts with `llk_` and is shown **only once**. Copy it.
2. **Create the GPT:** in ChatGPT go to Explore GPTs → Create → Configure.
   - **Name:** `Likelink Content Studio`
   - **Description:** the text from [gpt-config.md](gpt-config.md).
   - **Instructions:** paste the whole of [instructions.he.md](instructions.he.md).
   - **Conversation starters:** from [gpt-config.md](gpt-config.md).
   - **Capabilities:** Web Browsing off (the GPT must work only from product facts). DALL·E optional.
3. **Add the actions:** Actions → Create new action → Import from URL:
   `https://likelink2.vercel.app/api/gpt/openapi.json`
   - Five actions should appear: `list_products`, `get_tracking_link`, `create_content_draft`, `list_drafts`, `get_draft_status`.
4. **Authentication:** Authentication → API Key → Auth Type: **Bearer** → paste the `llk_…` key.
5. **Privacy Policy:** `https://likelink2.vercel.app/legal/privacy`
6. **Test:** ask "מה המוצרים שלי?" and then "תכיני טיוטה לטיקטוק למוצר הראשון".
   - The draft should appear in the studio under "טיוטות מ-ChatGPT".
7. **Share:** keep the GPT private ("Only me") or share it by link. Every user needs their own key. Never put the key inside the GPT's instructions.

## What the GPT can do and what it can't

| Can | Can't |
|---|---|
| Read your approved products | See other creators' products |
| Get a tracking link for each channel | Publish to any network |
| Save a content draft | Approve a draft (only you, in the studio) |
| List your drafts and their status | Charge, change a plan or send messages |

- Every draft gets the disclosure (`#פרסומת · קישור שותפים`) and the tracking link automatically.
- A draft with customer recommendations, reviews, "best seller" claims or promises is refused.
- Monthly draft quota: according to the plan (Professional: 300).
- Rate limit: 30 requests per minute per key.

## Revoking a key

Studio → "חיבור ל-ChatGPT" → "ביטול" next to the key. It stops working immediately. Then create a new key and update it in the GPT's Authentication settings.

## Optional OpenAI key on the server

`OPENAI_API_KEY` is not required.
- The content engine in the studio is native: it builds drafts from the product fields without any AI call.
- If the key is set, the existing intelligence layer (`/api/store?mode=intelligence`) can use it.
- The Custom GPT runs on your ChatGPT account and doesn't need a key on the server.
