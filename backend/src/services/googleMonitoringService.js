// Cloud Monitoring API → request_count metric. Service account
// GOOGLE_APPLICATION_CREDENTIALS ile sağlanır (Monitoring Viewer rolü).

let MetricServiceClient = null;
try {
  // Lazy require — paket yoksa /usage dışındaki kod yine kalksın.
  ({ MetricServiceClient } = require('@google-cloud/monitoring'));
} catch (err) {
  console.warn('[googleMonitoringService] @google-cloud/monitoring not installed:', err.message);
}

const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

let clientInstance = null;
function getClient() {
  if (!MetricServiceClient) {
    const err = new Error('@google-cloud/monitoring package not installed');
    err.code = 'NO_PACKAGE';
    throw err;
  }
  if (!process.env.GCP_PROJECT_ID) {
    const err = new Error('GCP_PROJECT_ID not configured');
    err.code = 'NO_PROJECT';
    throw err;
  }
  if (!clientInstance) clientInstance = new MetricServiceClient();
  return clientInstance;
}

function rangeSeconds(range) {
  // request_count retention'ı pratikte 6 hafta; 'all' için 90 gün üst sınır,
  // eski veri yoksa boş döner.
  const map = {
    '24h': 24 * 3600,
    '7d': 7 * 24 * 3600,
    '30d': 30 * 24 * 3600,
    'all': 90 * 24 * 3600,
  };
  return map[range] || map['7d'];
}

const TRACKED_SERVICES = [
  'places-backend.googleapis.com',
  'geocoding-backend.googleapis.com',
  'maps-backend.googleapis.com',
];

// USD/istek (Google Maps Platform 2026 listesine yaklaşık).
// $200 ücretsiz aylık krediden sonra geçerli; tahmini olarak hesaplanır.
const PRICE_PER_REQUEST_BY_DOMAIN = {
  'places-backend.googleapis.com': 0.032,      // Places Text Search
  'geocoding-backend.googleapis.com': 0.005,   // Geocoding
  'maps-backend.googleapis.com': 0.007,        // Maps JS Dynamic Maps
};

async function getRequestCounts(range = '7d') {
  const cacheKey = range;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.value;

  const client = getClient();
  const projectId = process.env.GCP_PROJECT_ID;
  const endSec = Math.floor(Date.now() / 1000);
  const startSec = endSec - rangeSeconds(range);

  const filter =
    'metric.type="serviceruntime.googleapis.com/api/request_count" AND (' +
    TRACKED_SERVICES.map((s) => `resource.label."service"="${s}"`).join(' OR ') +
    ')';

  const [timeSeries] = await client.listTimeSeries({
    name: client.projectPath(projectId),
    filter,
    interval: {
      startTime: { seconds: startSec },
      endTime: { seconds: endSec },
    },
    aggregation: {
      alignmentPeriod: { seconds: 24 * 3600 },
      perSeriesAligner: 'ALIGN_SUM',
      crossSeriesReducer: 'REDUCE_SUM',
      groupByFields: ['resource.label."service"', 'metric.label."response_code_class"'],
    },
    view: 'FULL',
  });

  const byDayService = new Map();
  const byService = new Map();
  let total = 0;

  for (const series of timeSeries || []) {
    const service = series.resource?.labels?.service || 'unknown';
    const respClass = series.metric?.labels?.response_code_class || '';
    for (const point of series.points || []) {
      const tsSec = Number(point.interval?.endTime?.seconds || 0);
      const date = new Date(tsSec * 1000).toISOString().slice(0, 10);
      const value = Number(point.value?.int64Value || point.value?.doubleValue || 0);
      total += value;

      const dayKey = `${date}__${service}`;
      const dayCur = byDayService.get(dayKey) || { date, service, count: 0, errors: 0 };
      dayCur.count += value;
      if (respClass.startsWith('4') || respClass.startsWith('5')) dayCur.errors += value;
      byDayService.set(dayKey, dayCur);

      const svcCur = byService.get(service) || { service, count: 0, errors: 0 };
      svcCur.count += value;
      if (respClass.startsWith('4') || respClass.startsWith('5')) svcCur.errors += value;
      byService.set(service, svcCur);
    }
  }

  const byServiceArr = Array.from(byService.values()).map((s) => {
    const price = PRICE_PER_REQUEST_BY_DOMAIN[s.service] ?? 0;
    return {
      ...s,
      pricePerRequestUSD: price,
      estimatedCostUSD: Number((s.count * price).toFixed(4)),
    };
  });
  const totalEstimatedCost = byServiceArr.reduce(
    (acc, s) => acc + s.estimatedCostUSD,
    0
  );

  const value = {
    range,
    totalRequests: total,
    estimatedCostUSD: Number(totalEstimatedCost.toFixed(4)),
    byService: byServiceArr.sort((a, b) => b.count - a.count),
    byDay: Array.from(byDayService.values()).sort((a, b) =>
      a.date.localeCompare(b.date) || a.service.localeCompare(b.service)
    ),
    pricing: PRICE_PER_REQUEST_BY_DOMAIN,
    fetchedAt: new Date().toISOString(),
  };
  cache.set(cacheKey, { ts: Date.now(), value });
  return value;
}

module.exports = { getRequestCounts };
