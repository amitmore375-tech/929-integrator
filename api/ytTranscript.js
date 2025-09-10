
import { YoutubeTranscript } from 'youtube-transcript';

export default async function handler(req, res) {
  try {
    // --- Simple header-based auth ---
   const expected = process.env.TOKEN;
const provided = req.headers['x-api-token'] || req.query.token; // ← גם דרך query
if (!expected || !provided || provided !== expected) {
  return res.status(401).json({ ok: false, error: 'unauthorized: missing/invalid token' });
}

    const v = req.query.v;
    const lang = req.query.lang || 'he';
    if (!v) return res.status(400).json({ ok: false, error: "missing v (video id)" });
    let transcript = [];
    try {
      transcript = await YoutubeTranscript.fetchTranscript(v, { lang });
    } catch (e) {
      try { transcript = await YoutubeTranscript.fetchTranscript(v); } catch (e2) { transcript = []; }
    }
    res.status(200).json({ ok: true, url: `https://www.youtube.com/watch?v=${v}`, transcript });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
