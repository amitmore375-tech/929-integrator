import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export default async function handler(req, res) {
  try {
    // --- Auth ---
    const expected = process.env.TOKEN;
    const provided = req.headers['x-api-token'] || req.query.token;
    if (!expected || !provided || provided !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized: missing/invalid token' });
    }

    const url = req.query.url;
    const debug = req.query.debug === '1' || req.query.debug === 'true';

    if (!url) return res.status(400).json({ ok: false, error: 'missing url' });

    // נאפשר רק דפי 929 (ה־URL הראשי)
    const allow = [/^https?:\/\/(www\.)?929\.org\.il\/page\/\d+/i, /^https?:\/\/(edu\.)?929\.org\.il\//i];
    if (!allow.some(r => r.test(url))) {
      return res.status(400).json({ ok: false, error: 'url not allowed', url });
    }

    const browser = await chromium.launch({
      args: ['--no-sandbox','--disable-setuid-sandbox'],
      headless: true
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    // גלילה הדרגתית כדי לטעון lazy content / כרטיסיות
    await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      let last = 0;
      for (let i = 0; i < 8; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(500);
        const now = document.body.scrollHeight;
        if (now === last) break;
        last = now;
      }
      window.scrollTo(0, 0);
    });

    // תוכן מלא של העמוד
    const html = await page.content();
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // כותרת + תוכן הקריא של הדף עצמו (הפרק)
    const title = (doc.querySelector('title')?.textContent || '').trim();
    const reader = new Readability(doc);
    const articleParsed = reader.parse();
    const articleText = (articleParsed?.textContent || '').trim();

    // איסוף כל העוגנים (קישורים) + טקסט
    const rawAnchors = await page.$$eval('a', as =>
      as
        .map(a => ({
          href: a.href || '',
          text: (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim()
        }))
        .filter(x => x.href)
    );

    // ניקוי כפולים
    const uniq = (arr, key) => {
      const seen = new Set();
      return arr.filter(x => !seen.has(x[key]) && seen.add(x[key]));
    };
    const anchors = uniq(rawAnchors, 'href');

    // סיווגים בסיסיים לפי טקסט/דומיין
    const isYouTube = (h) => /youtube\.com|youtu\.be/i.test(h);
    const is929 = (h) => /\/\/(www\.)?929\.org\.il/i.test(h);
    const byText = (t, ...words) => words.some(w => t.includes(w));

    const youtube = anchors.filter(a => isYouTube(a.href));
    const chofrim = anchors.filter(a =>
      byText(a.text, 'חופרים', 'חפרנו', 'ארכיאולוג', 'מחקר') || /chofr|dig|archae/i.test(a.href)
    );
    const shimanu = anchors.filter(a =>
      byText(a.text, 'תשמעו', 'האזנה', 'פודקאסט', 'האזרו') || /soundcloud|spotify|podcast/i.test(a.href)
    );
    const simanim = anchors.filter(a => byText(a.text, 'סימנים'));
    const articles = anchors.filter(a =>
      (is929(a.href) && /article|post|story|blog|page\/\d+\/\d+/i.test(a.href))
      || byText(a.text, 'מאמר', 'כתבה', 'טור', 'מחשבה', 'לקריאה')
    );

    // נשמור גם את כלל הקישורים הפנימיים של 929 לשימוש העוזר
    const internal929 = anchors.filter(a => is929(a.href));

    await browser.close();

    return res.json({
      ok: true,
      url,
      title,
      article: {
        title,
        text: articleText
      },
      links: {
        youtube,
        chofrim,
        shimanu,
        simanim,
        articles,
        internal929
      },
      debug: debug ? { rawAnchors: anchors.slice(0, 500) } : undefined,
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
