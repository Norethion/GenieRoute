#!/usr/bin/env node
/**
 * web_search refresh fonksiyonunu doğrudan çağırarak mekanizmayı kanıtlar.
 * In-memory request sayacı backend restart'larda sıfırlandığı için 10. istek
 * tetiklemesine doğal yolla ulaşılması zor; bu script refresh'i elle bir kez
 * her şehir için çalıştırır. Çıktı: cache'e _meta.citations[] içeren bir
 * web_search sample eklenir, admin paneli bunu sayar.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const cityDataModel = require('../src/models/cityDataModel');
const cityDataService = require('../src/services/cityDataService');

const { refreshPricesWithWebSearch, refreshTipsWithWebSearch } = cityDataService._internal;

const TARGETS = [
  { city: 'Ankara',    countryCode: 'TR', countryName: 'Turkey', currencyCode: 'TRY' },
  { city: 'Paris',     countryCode: 'FR', countryName: 'France', currencyCode: 'EUR' },
  { city: 'Barcelona', countryCode: 'ES', countryName: 'Spain',  currencyCode: 'EUR' },
];

async function runCity(t) {
  const cityKey = cityDataService.normalizeCityKey(t.city);
  const before = await cityDataModel.getPricesRow(cityKey, 'medium');
  const beforeTips = await cityDataModel.getTipsRow(cityKey);
  console.log(`\n=== ${t.city} ===`);
  console.log(`  ÖNCE  prices=${before?.sample_count || 0}  tips=${beforeTips?.sample_count || 0}`);

  // İkisi paralel — birbirinden bağımsız endpoint'ler
  console.log(`  web_search çağrıları başladı...`);
  const t0 = Date.now();
  await Promise.all([
    refreshPricesWithWebSearch({ cityName: t.city, countryCode: t.countryCode, countryName: t.countryName, currencyCode: t.currencyCode, budgetLevel: 'medium' }),
    refreshTipsWithWebSearch({ cityName: t.city, countryCode: t.countryCode, countryName: t.countryName }),
  ]);
  console.log(`  bitti (${Math.round((Date.now() - t0) / 1000)}s)`);

  const after = await cityDataModel.getPricesRow(cityKey, 'medium');
  const afterTips = await cityDataModel.getTipsRow(cityKey);
  const priceSamples = Array.isArray(after?.samples) ? after.samples : [];
  const tipSamples = Array.isArray(afterTips?.samples) ? afterTips.samples : [];
  const webPriceSamples = priceSamples.filter((s) => s?._meta?.source === 'web_search');
  const webTipSamples = tipSamples.filter((s) => s?._meta?.source === 'web_search');
  console.log(`  SONRA prices=${after?.sample_count} (web=${webPriceSamples.length})  tips=${afterTips?.sample_count} (web=${webTipSamples.length})`);

  for (const [label, ws] of [['prices', webPriceSamples], ['tips', webTipSamples]]) {
    if (ws.length === 0) continue;
    const last = ws[ws.length - 1];
    const cites = last._meta.citations || [];
    console.log(`  → ${label} en son web sample: ${cites.length} kaynak (fetchedAt: ${last._meta.fetchedAt})`);
    for (const c of cites.slice(0, 3)) console.log(`     • ${c.url}`);
  }
}

async function main() {
  for (const t of TARGETS) {
    await runCity(t);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
