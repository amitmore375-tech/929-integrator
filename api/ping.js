export default async function handler(req, res) {
  const expected = process.env.INTEGRATOR_TOKEN || process.env.TOKEN;
  const provided = req.headers['x-api-token'] || req.query.token || '';
  res.status(200).json({
    hasExpected: Boolean(expected),
    expectedLen: expected ? String(expected).length : 0,
    providedLen: String(provided).length
  });
}
