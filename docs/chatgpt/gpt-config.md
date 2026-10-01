# GPT configuration: Likelink Content Studio

| Field | Value |
|---|---|
| Name | Likelink Content Studio |
| Description | עוזרת תוכן בעברית ליוצרות LikeLink: הוקים, תסריטים קצרים וכיתובים מהמוצרים האמיתיים שלך, עם גילוי נאות ולינק מעקב. שומרת טיוטות בסטודיו ולא מפרסמת לבד. |
| Instructions | The full contents of `instructions.he.md` |
| Actions (OpenAPI) | `https://likelink2.vercel.app/api/gpt/openapi.json` |
| Authentication | API Key → Bearer → a key `llk_…` from the studio (Professional) |
| Privacy Policy | `https://likelink2.vercel.app/legal/privacy` |
| Web Browsing | Off |
| Visibility | Only me, or shared by link. Each creator needs their own key. |

## Conversation starters

- מה המוצרים שלי?
- תכתבי 3 הוקים לטיקטוק למוצר הראשון שלי
- תסריט של 20 שניות לרילס, עם גילוי נאות
- תשמרי טיוטה לפינטרסט ותני לי את הלינק

## Actions from the spec

| operationId | Method and path | What it does |
|---|---|---|
| `list_products` | `GET /api/gpt/products` | The creator's approved products |
| `get_tracking_link` | `GET /api/gpt/products/{productId}/tracking-link?channel=` | Tracking link and disclosure text |
| `create_content_draft` | `POST /api/gpt/drafts` | Saves a DRAFT only |
| `list_drafts` | `GET /api/gpt/drafts` | The 20 most recent drafts |
| `get_draft_status` | `GET /api/gpt/drafts/{draftId}` | Status of one draft |

The spec has no publish or approve action.
