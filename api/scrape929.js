import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// מזהה אם ה-HTML שקיבלנו כנראה "ריק" (SPA)
function looksEmptyHTML(html) {
  if (!html) return true;
  if (html.length < 2000) return true;
  if (/You need to enable JavaScript to run this app\./i.test(html)) return true;
  return false;
}

// בונה כתובת רינדור-שרת ל-https דרך r.jina.ai
function jinaUrl(orig) {
  const u = new URL(orig);
  const scheme = u.protocol.replace(":", ""); // 'https' או 'http'
  return `https://r.jina.ai/${scheme}://${u.host}${u.pathname}${u.search}`;
}

async function fetchHtml(url) {
  const ua =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
  const resp = await fetch(url, {
    headers: {
      "user-agent": ua,
      "accept-language": "he-IL,he;q=0.9,en;q=0.8",
      "accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });
  if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
  return await resp.text();
}

// חילוץ קישורים מ-HTML רגיל
function linksFromHTML(doc, baseUrl, allow) {
  const set = new Set();
  for (const a of doc.querySelectorAll("a[href]")) {
    try {
      const href = new URL(a.getAttribute("href"), baseUrl).toString();
      if (allow.some((r) => r.test(href))) set.add(href);
    } catch {}
  }
  return Array.from(set);
}

// חילוץ קישורים מתוך טקסט (למשל מה-fallback של jina)
function linksFromText(text, allow) {
  const set = new Set();
  const re = /https?:\/\/[^\s)\]]+/g;
  for (const m of text.matchAll(re)) {
    const href = m[0];
    try {
      if (allow.some((r) => r.test(href))) set.add(new URL(href).toString());
    } catch {}
  }
  return Array.from(set);
}

export default async function handler(req, res) {
  try {
    // ---- אימות: כותרת x-api-token או query ?token= ----
    const expected = process.env.INTEGRATOR_TOKEN || process.env.TOKEN;
    const provided = req.headers["x-api-token"] || req.query.token;
    if (!expected || !provided || provided !== expected) {
      return res
        .status(401)
        .json({ ok: false, error: "unauthorized: missing/invalid token" });
    }

    const url = req.query.url;
    if (!url) return res.status(400).json({ ok: false, error: "missing url" });

    // מרשים רק דומיינים של 929
    const allow = [
      /^https?:\/\/(www\.)?929\.org\.il\//,
      /^https?:\/\/(edu\.)?929\.org\.il\//,
    ];

    if (!allow.some((r) => r.test(url))) {
      return res.status(400).json({ ok: false, error: "url not allowed", url });
    }

    // ---- ניסיון 1: HTML ישיר ----
    let html = await fetchHtml(url);
    let usedFallback = false;

    // ננסה לקרוא עם Readability
    let article = null;
    let pageTitle = "";
    {
      const dom = new JSDOM(html, { url });
      const doc = dom.window.document;
      pageTitle = (doc.querySelector("title")?.textContent || "").trim();
      try {
        const reader = new Readability(doc);
        const parsed = reader.parse();
        if (parsed) {
          article = {
            title: parsed.title || pageTitle || null,
            text: (parsed.textContent || "").trim() || null,
          };
        }
      } catch {}
      if (!article) {
        const txt = (doc.body?.textContent || "").trim();
        article = { title: pageTitle || null, text: txt || null };
      }
    }

    // אם ה-HTML “ריק” או שהטקסט קצר מדי → פולבק ל-jina
    if (looksEmptyHTML(html) || !article?.text || article.text.length < 300) {
      const jr = await fetch(jinaUrl(url));
      if (jr.ok) {
        const fallbackText = await jr.text(); // טקסט מרונדר
        // עוטפים כ-HTML כדי לאפשר Readability, וגם נשמור את הטקסט הגולמי
        const safe = fallbackText
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
        html = `<article>${safe}</article>`;
        usedFallback = true;

        const dom2 = new JSDOM(html, { url });
        const doc2 = dom2.window.document;
        const pageTitle2 = (doc2.querySelector("title")?.textContent || "").trim();
        let parsed2 = null;
        try {
          const reader2 = new Readability(doc2);
          parsed2 = reader2.parse();
        } catch {}
        if (parsed2) {
          article = {
            title: parsed2.title || pageTitle2 || pageTitle || null,
            text: (parsed2.textContent || "").trim() || null,
          };
        } else {
          const txt2 = (doc2.body?.textContent || "").trim();
          article = { title: pageTitle2 || pageTitle || null, text: txt2 || null };
        }

        // קישורים גם מתוך הטקסט של הפולבק
        const extraFromText = linksFromText(fallbackText, allow);
        // נאחד עם מה שיוצא מ-HTML (ייתכן ריק)
        const doc2Links = linksFromHTML(doc2, url, allow);
        const merged = Array.from(new Set([...doc2Links, ...extraFromText]));
        return res.status(200).json({
          ok: true,
          url,
          title: article.title || pageTitle,
          article,
          links: merged.slice(0, 200).map((href) => ({ href, text: "" })),
          usedFallback: true,
        });
      }
    }

    // אם לא נכנסנו לפולבק – נחזיר את מה שיש מה-HTML
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    const links = linksFromHTML(doc, url, allow);

    return res.status(200).json({
      ok: true,
      url,
      title: article?.title || pageTitle || "",
      article,
      links: links.slice(0, 200).map((href) => ({ href, text: "" })),
      usedFallback,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

