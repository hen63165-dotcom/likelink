---
name: truth-guard
description: The last gate before anything of LikeLink2 goes public — a page, a post, a reel, a story, a caption, a product — checking every truth rule the site keeps (disclosure, AI labels, the seller's own claims only, no invented numbers, no other brands, no real person's likeness, no paid services, no secrets). Use before shipping, before handing the owner anything to post, or when she asks "זה בסדר לפרסם?".
---

# Truth guard

Run through every line; one "no" stops it.

- **Disclosure:** every affiliate post opens with `#פרסומת · קישור שותפים`; every product page carries the affiliate disclosure.
- **AI:** an AI character or voice is labelled on screen and in the caption ("דמות וקול AI"), and the owner turns on Instagram's AI label.
- **Claims:** only the seller's own words, attributed ("המוכר מציין: …"), present in that product's listing (`mustMatch`). No "הכי נמכר", ratings, review counts, sales, scarcity ("נשארו 2", "רק היום"), invented prices, or "קניתי/הזמנתי/ניסיתי" (`FORBIDDEN_CLAIMS`, `HOOK_FORBIDDEN`, `DROP_FORBIDDEN`, `check_truth`).
- **Pictures:** every image shows the product it names; a studio photo says "רקע: LikeLink2"; a seller video is "סרטון המוכר", never "real" or UGC; nothing LikeLink renders is called real footage.
- **Brands and people:** no other brand's name or logo (the owner's references may carry them; we never draw them), no real person's face as a character or a reference, no named animation studio in a prompt.
- **Money and accounts:** no paid API, credit, purchase or subscription without the owner's explicit yes (`PAID_GENERATION` stays off); nothing posted, sent or published on her behalf without her approval.
- **Secrets:** no token, key, password or e-mail in a commit, a log, a page or a reply.
- **Tests:** `npm test` and the engine's tests pass; a test is never weakened to make it pass.
