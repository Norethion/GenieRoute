#!/usr/bin/env node
/**
 * GeoNames cities15000 -> frontend/src/data/worldCities.json
 *
 * cities15000.zip (CC-BY-4.0): population > 15000 veya başkent.
 * Bu script ZIP'i indirir, açar, başkentleri ve nüfusa göre
 * en kalabalık ~5000 şehri seçer ve frontend bundle'ına yazar.
 *
 * Kullanım:
 *   npm run build:cities
 *
 * Atıf: GeoNames (https://www.geonames.org), CC-BY 4.0.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const AdmZip = require('adm-zip');

const SOURCE_URL = 'https://download.geonames.org/export/dump/cities15000.zip';
const TARGET_LIMIT = 5000;
const POPULATION_THRESHOLD = 100000;

const OUTPUT_PATH = path.join(__dirname, '..', '..', 'frontend', 'src', 'data', 'worldCities.json');

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const fetch = (currentUrl, redirectsLeft) => {
      https.get(currentUrl, (res) => {
        // Follow redirects (geonames bazen 30x dönüyor)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          res.resume();
          fetch(res.headers.location, redirectsLeft - 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    };
    fetch(url, 5);
  });
}

function parseGeonamesTsv(text) {
  const cities = [];
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 19) continue;

    const name = parts[1];
    const lat = parseFloat(parts[4]);
    const lng = parseFloat(parts[5]);
    const featureCode = parts[7];
    const country = parts[8];
    const population = parseInt(parts[14], 10) || 0;

    if (!name || !country || Number.isNaN(lat) || Number.isNaN(lng)) continue;

    cities.push({ name, country, lat, lng, pop: population, fc: featureCode });
  }
  return cities;
}

function selectTopCities(allCities, limit) {
  // Başkentler her zaman dahil; geri kalanı nüfusa göre.
  const capitals = allCities.filter((c) => c.fc === 'PPLC');
  const others = allCities
    .filter((c) => c.fc !== 'PPLC' && c.pop >= POPULATION_THRESHOLD)
    .sort((a, b) => b.pop - a.pop);

  const seen = new Set(capitals.map((c) => `${c.name}|${c.country}`));
  const selected = [...capitals];

  for (const c of others) {
    if (selected.length >= limit) break;
    const key = `${c.name}|${c.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(c);
  }

  // Frontend'e gönderilecek alanları sadeleştir
  return selected.map(({ name, country, lat, lng, pop }) => ({
    name,
    country,
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
    pop,
  }));
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geonames-'));
  const zipPath = path.join(tmpDir, 'cities15000.zip');

  console.log(`[build:cities] Downloading ${SOURCE_URL} ...`);
  await download(SOURCE_URL, zipPath);

  console.log('[build:cities] Extracting...');
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntries().find((e) => e.entryName === 'cities15000.txt');
  if (!entry) throw new Error('cities15000.txt not found in archive');
  const text = entry.getData().toString('utf8');

  console.log('[build:cities] Parsing TSV...');
  const all = parseGeonamesTsv(text);
  console.log(`[build:cities] Parsed ${all.length} cities`);

  const selected = selectTopCities(all, TARGET_LIMIT);
  console.log(`[build:cities] Selected ${selected.length} cities (capitals + top by population)`);

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(selected));
  const sizeKb = Math.round(fs.statSync(OUTPUT_PATH).size / 1024);
  console.log(`[build:cities] Wrote ${OUTPUT_PATH} (${sizeKb} KB)`);

  // Geçici klasörü temizle
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

main().catch((err) => {
  console.error('[build:cities] FAILED:', err);
  process.exit(1);
});
