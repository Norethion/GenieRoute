const axios = require('axios');

// Organization scope — proje API key'i bu endpoint'lere erişemez,
// ayrı bir Admin key gerekir (platform.openai.com → Settings → Admin keys).
const BASE = 'https://api.openai.com/v1/organization';
const CACHE_TTL = 60 * 1000;

// USD per 1M tokens (Mayıs 2026, openai.com/api/pricing). Resmi /costs
// günlük bucket'lar finalize olana kadar 0 döndüğü için token bazlı tahmini
// hesabı paralel tutuyoruz.
const PRICE_PER_M_TOKENS = {
  'gpt-5.5': { input: 5.00, output: 30.00 },
  'gpt-5.4': { input: 2.50, output: 15.00 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50 },
  'gpt-5.4-nano': { input: 0.20, output: 1.25 },
  'gpt-5-mini': { input: 0.25, output: 2.00 },
  'gpt-5-nano': { input: 0.05, output: 0.40 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

// Model adındaki tarih ekini sıyır: "gpt-5.4-mini-2025-08-07" → "gpt-5.4-mini".
function priceFor(model) {
  if (PRICE_PER_M_TOKENS[model]) return PRICE_PER_M_TOKENS[model];
  const stripped = model?.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  if (stripped && PRICE_PER_M_TOKENS[stripped]) return PRICE_PER_M_TOKENS[stripped];
  return null;
}

function estimateCost(model, inputTokens = 0, outputTokens = 0) {
  const p = priceFor(model);
  if (!p) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

const cache = new Map();

function unixSecondsForRange(range) {
  const now = Math.floor(Date.now() / 1000);
  const map = {
    '24h': 24 * 60 * 60,
    '7d': 7 * 24 * 60 * 60,
    '30d': 30 * 24 * 60 * 60,
    // 90 gün üst sınır — daha eskisinde upstream 500 dönüyor.
    'all': 90 * 24 * 60 * 60,
  };
  const span = map[range] || map['7d'];
  return { start: now - span, end: now };
}

function authHeader() {
  const key = process.env.OPENAI_ADMIN_API_KEY;
  if (!key) {
    const err = new Error('OPENAI_ADMIN_API_KEY not configured');
    err.code = 'NO_ADMIN_KEY';
    throw err;
  }
  return { Authorization: `Bearer ${key}` };
}

async function fetchAllPages(url, params) {
  const headers = authHeader();
  const allBuckets = [];
  let page = null;
  // 'all' (90 gün) → ~90 bucket × limit 31 = 3 sayfa. 20 sonsuz döngüye karşı
  // güvenlik kapağı.
  for (let i = 0; i < 20; i++) {
    const response = await axios.get(url, {
      headers,
      params: page ? { ...params, page } : params,
      timeout: 15000,
    });
    const data = response.data;
    if (Array.isArray(data?.data)) allBuckets.push(...data.data);
    if (!data?.has_more || !data?.next_page) break;
    page = data.next_page;
  }
  return allBuckets;
}

async function fetchCompletionsUsage(start, end) {
  const buckets = await fetchAllPages(`${BASE}/usage/completions`, {
    start_time: start,
    end_time: end,
    bucket_width: '1d',
    'group_by[]': 'model',
    limit: 31,
  });

  const byDay = [];
  let totalInput = 0;
  let totalOutput = 0;
  const byModel = new Map();

  for (const bucket of buckets) {
    const date = new Date((bucket.start_time || start) * 1000).toISOString().slice(0, 10);
    let dayInput = 0;
    let dayOutput = 0;
    let dayEstimated = 0;
    for (const row of bucket.results || []) {
      const inp = row.input_tokens || 0;
      const out = row.output_tokens || 0;
      dayInput += inp;
      dayOutput += out;
      totalInput += inp;
      totalOutput += out;
      const model = row.model || 'unknown';
      dayEstimated += estimateCost(model, inp, out) || 0;
      const cur = byModel.get(model) || { model, inputTokens: 0, outputTokens: 0 };
      cur.inputTokens += inp;
      cur.outputTokens += out;
      byModel.set(model, cur);
    }
    byDay.push({
      date,
      inputTokens: dayInput,
      outputTokens: dayOutput,
      estimatedCostUSD: dayEstimated,
    });
  }

  const modelArr = Array.from(byModel.values()).map((m) => ({
    ...m,
    estimatedCostUSD: estimateCost(m.model, m.inputTokens, m.outputTokens),
  }));
  const totalEstimatedCost = modelArr.reduce(
    (acc, m) => acc + (m.estimatedCostUSD || 0),
    0
  );

  return {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    totalEstimatedCostUSD: totalEstimatedCost,
    byDay,
    byModel: modelArr.sort(
      (a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens)
    ),
  };
}

async function fetchCosts(start, end) {
  const buckets = await fetchAllPages(`${BASE}/costs`, {
    start_time: start,
    end_time: end,
    bucket_width: '1d',
    limit: 31,
  });

  const byDay = [];
  let totalCost = 0;
  let currency = 'usd';

  for (const bucket of buckets) {
    const date = new Date((bucket.start_time || start) * 1000).toISOString().slice(0, 10);
    let dayCost = 0;
    for (const row of bucket.results || []) {
      // value bazen string ("0") gelir — string concat'e düşmemek için cast.
      const amount = Number(row.amount?.value) || 0;
      currency = row.amount?.currency || currency;
      dayCost += amount;
      totalCost += amount;
    }
    byDay.push({ date, costUSD: Number(dayCost) || 0 });
  }

  return { totalCostUSD: Number(totalCost) || 0, currency, byDay };
}

async function getUsage(range = '7d') {
  const cacheKey = range;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  const { start, end } = unixSecondsForRange(range);
  const [usage, costs] = await Promise.all([
    fetchCompletionsUsage(start, end),
    fetchCosts(start, end),
  ]);

  const dayMap = new Map();
  for (const d of usage.byDay) dayMap.set(d.date, { ...d, costUSD: 0 });
  for (const c of costs.byDay) {
    const existing = dayMap.get(c.date) || {
      date: c.date,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUSD: 0,
    };
    existing.costUSD = c.costUSD;
    dayMap.set(c.date, existing);
  }
  const byDay = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const value = {
    range,
    totalTokens: usage.totalTokens,
    totalInputTokens: usage.totalInputTokens,
    totalOutputTokens: usage.totalOutputTokens,
    totalCostUSD: costs.totalCostUSD,
    totalEstimatedCostUSD: usage.totalEstimatedCostUSD,
    currency: costs.currency,
    byDay,
    byModel: usage.byModel,
    fetchedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, { ts: Date.now(), value });
  return value;
}

module.exports = { getUsage };
