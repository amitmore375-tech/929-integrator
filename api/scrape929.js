
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export default async function handler(req, res) {
  try {
    // --- Simple header-based auth ---
    const tokenHeader = req.headers['x-api-token'];
    const expected = process.env.TOKEN;
    if (!expected || !tokenHeader || tokenHeader !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized: missing/invalid x-api-token' });
    }

    const url = req.query.url;
    if (!url) return res.status(400).json({ ok: false, error: "missing url" });
    const allow = [/^https?:\/\/(www\.)?929\.org\.il\//, /^https?:\/\/edu\.929\.org\.il\//];
    if (!allow.some(r => r.test(url))) {
      return res.status(400).json({ ok: false, error: "url not allowed", url });
    }
    const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'], headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);

    const html = await page.content();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    const title = (article && article.title) || dom.window.document.title || "";
    const byline = (article && article.byline) || "";
    const contentHTML = (article && article.content) || "";
    const text = (article && article.textContent) || dom.window.document.body.textContent || "";

    const aTags = [...dom.window.document.querySelectorAll('a[href]')];
    const linksMap = new Map();
    for (const a of aTags) {
      const href = a.getAttribute('href');
      if (!href) continue;
      let abs = href;
      try { abs = new URL(href, url).toString(); } catch {};
      linksMap.set(abs, (a.textContent || '').trim());
    }
    const links = [...linksMap.entries()].map(([href, text])=>({href, text}));

    await browser.close();
    res.status(200).json({ ok: true, url, title, byline, text, html: contentHTML, links });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
