import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// בניית כתובת רינדור-שרת ל-https דרך r.jina.ai
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

function parseWithReadability(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;
  const pageTitle = (doc.querySelector("title")?.textContent || "").trim();
  let title = pageTitle || null;
  let text = (doc.body?.textContent || "").trim();

  try {
    const reader = new Readability(doc);
    const parsed = reader.parse();
    if (parsed) {
      title = parsed.title || title;
      if (parsed.textContent && parsed.textContent.trim()) {
        text = parsed.textContent.trim();
      }
    }
  } catch {}
  return { title, text, doc };
}

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

function linksFromText(text, allow) {
  const set = new Set();
  const re = /https?:\/\/[^\s)\]]+/g;
  for (const m of text.matchAll(re)) {
    const href = m[0];
    try {
      const norm = new URL(href).toString();
      if (allow.some((r) => r.test(norm))) set.add(norm);
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

    // --- נביא גם מקור וגם פולבק, ונבחר את העשיר יותר ---
    let htmlOriginal = "";
    let htmlFallbackWrapped = "";
    let fallbackText = "";
    let fallbackOk = false;

    // 1) מקור
    try { htmlOriginal = await fetchHtml(url); } catch (e) { htmlOriginal = ""; }

    // 2) פולבק (רינדור-שרת)
    try {
      const jr = await fetch(jinaUrl(url));
      if (jr.ok) {
        fallbackText = await jr.text(); // טקסט/מרק-דאון
        const safe = fallbackText
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
        htmlFallbackWrapped = `<article>${safe}</article>`;
        fallbackOk = true;
      }
    } catch {}

    // פרסינג לשני המקורות
    const parsedOrig = parseWithReadability(htmlOriginal, url);
    const parsedFB = htmlFallbackWrapped
      ? parseWithReadability(htmlFallbackWrapped, url)
      : { title: null, text: "" , doc: new JSDOM("<div/>").window.document };

    const lenOrig = (parsedOrig.text || "").length;
    const lenFB   = (parsedFB.text  || "").length;

    // בוחרים את העשיר יותר
    const useFallback = fallbackOk && lenFB > Math.max(lenOrig, 250);
    const chosen = useFallback ? parsedFB : parsedOrig;

    // קישורים
    const linksHTML = linksFromHTML(useFallback ? parsedFB.doc : parsedOrig.doc, url, allow);
    const linksFB   = useFallback ? linksFromText(fallbackText, allow) : [];
    const mergedLinks = Array.from(new Set([...linksHTML, ...linksFB])).slice(0, 250);

    return res.status(200).json({
      ok: true,
      url,
      title: chosen.title || parsedOrig.title || "",
      article: {
        title: chosen.title || null,
        text: chosen.text || null,
      },
      links: mergedLinks.map((href) => ({ href, text: "" })),
      usedFallback: useFallback,
      lens: { original: lenOrig, fallback: lenFB }
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
