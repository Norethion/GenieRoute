const express = require('express');
const router = express.Router();
const openaiAdminService = require('../services/openaiAdminService');
const googleMonitoringService = require('../services/googleMonitoringService');

const ALLOWED_RANGES = new Set(['24h', '7d', '30d', 'all']);
function pickRange(req) {
  const r = req.query.range;
  return ALLOWED_RANGES.has(r) ? r : '7d';
}

// 200 + ok:false: bir panel patladığında diğeri yüklenebilsin diye
// HTTP error code yerine payload içinde hata kodu döner.
function gracefulError(res, err) {
  const code = err.code || 'ERROR';
  const message = err.message || 'Unknown error';
  res.status(200).json({ ok: false, code, error: message });
}

router.get('/openai', async (req, res) => {
  try {
    const data = await openaiAdminService.getUsage(pickRange(req));
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[usage/openai]', err.message);
    gracefulError(res, err);
  }
});

router.get('/google/cloud', async (req, res) => {
  try {
    const data = await googleMonitoringService.getRequestCounts(pickRange(req));
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[usage/google/cloud]', err.message);
    gracefulError(res, err);
  }
});

module.exports = router;
