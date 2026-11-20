// What a reader without JavaScript sees on /radar (the owner, 2026-11-19: ChatGPT "checked the radar
// and said it has no differentiation"). It had read the page as AI engines do, without running the
// app, and the HTML said only the home page's line ("ההמלצות של היוצרים…") — not one word about the
// radar. The build now writes the radar's own facts into /radar's HTML: the same content the page
// shows a person after it loads (what it reads, the four signals, "how do you know it's real", the
// ledger and today's record), never crawler-only text or links. Pure: the build passes the public
// board when it could read it; without one, only the fixed facts are written.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fmt = (n) => Number(n).toLocaleString("en-US");
const dm = (d) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}.${d.slice(0, 4)}` : "");

/** The dated sentence: always "we found", with the day of the worldwide check (docs/research/radar-gap-map.md). */
export const RADAR_CLAIM = Object.freeze({
  checked: "2026-11-20", // the tenth check (docs/research/radar-gap-map.md) found it still holds
  he: "רדאר טרנדי המוצרים היחיד שמצאנו בעולם שחותם כל קביעה מראש, גם את הטעויות, ונותן לה ציון בפומבי.",
  en: "The only product-trend radar we found in the world that seals every call in advance, misses included, and grades it in public.",
});

/** The <main> of /radar's HTML, from the public board (or none). */
export function radarStaticMain(board = null) {
  const world = board?.world && num(board.world.categories) ? board.world : null;
  const rec = board?.record || null;
  const graded = num(rec?.graded) ?? 0;
  const hits = num(rec?.hits) ?? 0;
  const ledger = board?.ledger && /^[0-9a-f]{64}$/.test(String(board.ledger.sha256 || "")) ? board.ledger : null;
  const today = [];
  if (world) today.push(`<li>הרדאר קרא ${fmt(world.readToday ?? 0)} קטגוריות של אליאקספרס מתוך ${fmt(world.categories)}${num(world.fashionDaily) ? `, ומתוכן ${fmt(world.fashionDaily)} של אופנה בכל יום` : ""}.</li>`);
  if (num(board?.fresh?.tracking)) today.push(`<li>${fmt(board.fresh.tracking)} מוצרים חדשים במעקב יומי.</li>`);
  today.push(graded
    ? `<li>עד היום ${fmt(graded)} קביעות קיבלו ציון בפומבי, ${fmt(hits)} מהן פגיעות.</li>`
    : `<li>הקביעה הבאה נחתמת כשכל 4 הסימנים מסכימים, והציון שלה מתפרסם אחרי 14 יום.</li>`);
  if (ledger) today.push(`<li>החתימה היומית האחרונה בביטקוין: ${esc(dm(ledger.d))} · SHA-256 <span dir="ltr">${esc(ledger.sha256.slice(0, 16))}…</span></li>`);
  const anchor = board?.anchors?.list?.[0];
  if (anchor && /^[0-9a-f]{64}$/.test(String(anchor.block || "")) && Number.isInteger(anchor.height)) today.push(`<li>ספר החתימות של ${esc(dm(anchor.d))} נמצא בתוך בלוק ביטקוין <a href="https://mempool.space/block/${esc(anchor.block)}">#${esc(String(anchor.height))}</a> (נבדק מול שורש המרקל של הבלוק)</li>`);
  return `<main>
          <h1>רדאר הטרנדים של LikeLink2</h1>
          <p>כל בוקר הרדאר קורא את אליאקספרס: את כל 564 הקטגוריות בסבב של כשבוע, ואת כל האופנה בכל יום. הוא מודד את קצב ההזמנות, כמה מוכרים חדשים מצטרפים ואת המחיר, בודק אם כבר מחפשים את המוצר בגוגל וביוטיוב בעברית, ובודק אותו ב־15 מדינות. הוא קובע רק כשכל 4 הסימנים מסכימים: העולם, הביקוש, המוכרים וישראל.</p>
          <h2>איך יודעים שזה אמיתי?</h2>
          <p><strong>${esc(RADAR_CLAIM.he)}</strong> (לפי בדיקה עולמית מ־${esc(dm(RADAR_CLAIM.checked))})</p>
          <ul>
            <li>בכלי טרנדים אחרים: אחוז דיוק שהחברה מדדה ומפרסמת בעצמה.</li>
            <li>ברדאר: כל קביעה כתובה מראש, עם תאריך חתום בביטקוין, כולל הפספוסים. כל אחד בודק בעצמו.</li>
          </ul>
          <ol>
            <li>ביום הקביעה הרדאר כותב אותה בספר, עם התאריך ומספר ההזמנות של אותו יום.</li>
            <li>באותו יום טביעת האצבע של הספר נחתמת בביטקוין דרך OpenTimestamps. מהרגע הזה הספר קבוע.</li>
            <li>אחרי 14 יום: ציון בפומבי, פגיעה או פספוס. שניהם נשארים בספר לתמיד.</li>
            <li>כל אחד מוריד את הקבצים מספר החתימות המלא ובודק אותם באתר החינמי opentimestamps.org.</li>
          </ol>
          <h2>מה הרדאר מודד</h2>
          <ul>
            <li>פער ישראל: האם כבר מחפשים את זה בעברית, בגוגל וביוטיוב, מול מה שקורה בעולם.</li>
            <li>השעון העולמי: באיזה יום טרנד הגיע לכל אחת מ־15 מדינות, והקביעה החתומה איזו מדינה הבאה.</li>
            <li>מוצרים חדשים שמתחילים לרוץ: מוצרים קטנים שההזמנות שלהם גדלות מהר, עם מעט מוכרים ובלי באז ברשתות.</li>
            <li>המבצע האמיתי: מחיר החנות של כל מוצר נרשם ונחתם כל יום, כדי לבדוק אם "מבצע" הוא באמת מבצע.</li>
            <li>החוש השישי: כל אחד יכול לבחור מוצר מול הרדאר, עם קבלה חתומה וציון באותו כלל בדיוק.</li>
            <li>הרדאר מול המזל: כל יום נבחר באקראי סוג מוצר אחד, לפי טביעת האצבע של מחירי החנות החתומים של אותו יום, ומקבל ציון באותו כלל. ככה רואים כמה הרדאר טוב יותר ממזל.</li>
          </ul>
          <h2>היום</h2>
          <ul>
            ${today.join("\n            ")}
          </ul>
          <h2 lang="en" dir="ltr">In English</h2>
          <p lang="en" dir="ltr">Every morning the LikeLink2 radar reads AliExpress (all 564 categories in about a week, all of fashion daily), checks Google and YouTube searches in Hebrew and in 15 countries, and makes a call only when all four signals agree. ${esc(RADAR_CLAIM.en)} (Per a worldwide check on ${esc(dm(RADAR_CLAIM.checked))}.) Each day's books are hashed with SHA-256 and timestamped in Bitcoin through OpenTimestamps, so anyone can check that nothing was added, removed or changed later. Beside the calls, one kind is drawn at random each day (seeded by the hash of that day's sealed store prices) and graded by the same rule, so the record shows the radar against luck.</p>
          <nav aria-label="הרדאר">
            <a href="/radar#proof">איך יודעים שזה אמיתי</a> · <a href="/radar#ledger">ספר החתימות המלא</a> · <a href="/magic">כפתור הקסם</a> · <a href="/radar-pro">המסלולים</a>
          </nav>
        </main>`;
}

/** Puts the radar's own <main> into the app shell's first paint (the part React replaces on load). */
export function withRadarMain(html, board = null) {
  return String(html).replace(/<main>[\s\S]*?<\/main>/, radarStaticMain(board));
}
