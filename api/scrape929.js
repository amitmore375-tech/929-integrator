import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

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
      /^https?:\/\/(edu\.)?929\.org\.il\//
    ];
    if (!allow.some((r) => r.test(url))) {
      return res
        .status(400)
        .json({ ok: false, error: "url not allowed", url });
    }

    // ---- הורדת HTML ישירות (User-Agent רגיל) ----
    const resp = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
      }
    });
    if (!resp.ok) {
      return res
        .status(502)
        .json({ ok: false, error: `fetch failed: ${resp.status}` });
    }
    const html = await resp.text();

    // ---- ניתוח עם jsdom + readability ----
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    const pageTitle = (doc.querySelector("title")?.textContent || "").trim();

    let article = null;
    try {
      const reader = new Readability(doc);
      const parsed = reader.parse();
      if (parsed) {
        article = {
          title: parsed.title || pageTitle || null,
          text: parsed.textContent || null
        };
      }
    } catch {}

    // ---- קישורים פנימיים רלוונטיים ----
    const seen = new Set();
    const links = [...doc.querySelectorAll("a[href]")]
      .map((a) => {
        try {
          const u = new URL(a.getAttribute("href"), url).toString();
          return { href: u, text: (a.textContent || "").trim() };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((x) => allow.some((r) => r.test(x.href)))
      .filter((x) => {
        if (seen.has(x.href)) return false;
        seen.add(x.href);
        return true;
      })
      .slice(0, 100);

    return res.status(200).json({
      ok: true,
      url,
      title: pageTitle,
      article,
      links
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

