/**
 * Coğrafi kümeleme ve nearest-neighbor TSP ile rota optimize eder.
 * Yerleri yakınlığa göre günlere böler, sonra her gün içinde en kısa sırayı seçer.
 *
 * Gün-içi çap sınırı: kümeye yer eklenirken kümenin en uzak iki noktası arası
 * mesafe maxDailyDiameterKm'i aşmamalı. Sınırı geçen yerler outlier olarak
 * ayrılır ve en sonda en yakın günün centroid'ine zorla atanır.
 */

// Haversine distance in km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Build distance matrix
function buildDistanceMatrix(places) {
  const n = places.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversine(places[i].lat, places[i].lng, places[j].lat, places[j].lng);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

// Bir küme içindeki en uzak iki nokta arası mesafe (kümenin çapı)
function maxPairwiseDistance(places) {
  let max = 0;
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const d = haversine(places[i].lat, places[i].lng, places[j].lat, places[j].lng);
      if (d > max) max = d;
    }
  }
  return max;
}

// Find centroid of a group of places
function centroid(places) {
  const n = places.length;
  if (n === 0) return { lat: 0, lng: 0 };
  const sum = places.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / n, lng: sum.lng / n };
}

// Gün içindeki en uzak mesafeye göre ulaşım türü öner
function suggestTransit(km) {
  if (km < 2) return 'walking';
  if (km < 6) return 'tram/metro/bus';
  if (km < 12) return 'metro/ferry/taxi';
  return 'ferry/long-distance';
}

// Ulaşım moduna göre tavan değerleri (km). Şehir yarıçapı bu tavanın üstünde
// olamaz; yürüyüş ağırlıklı planda gün-içi mesafe küçük tutulur.
const TRANSPORT_DIAMETER_CAP = {
  walking: 3,
  transit: 8,
  car: 15,
  mixed: 14,
};

// Şehir yarıçapına göre dinamik gün-içi maksimum çap (km) hesapla.
// Ulaşım modu seçilmişse, formül çıktısı moda özgü tavanla sınırlandırılır.
function resolveMaxDailyDiameter(cityRadiusKm, transportMode = 'mixed') {
  const cap = TRANSPORT_DIAMETER_CAP[transportMode] || TRANSPORT_DIAMETER_CAP.mixed;
  // Yürüyüş gibi keskin tavanlarda taban da düşürülür (3 km'lik plan'da 6 km
  // tabanı anlamsız).
  const floor = transportMode === 'walking' ? 1.5 : transportMode === 'transit' ? 4 : 6;
  if (!cityRadiusKm || !Number.isFinite(cityRadiusKm)) {
    return Math.min(cap, 12);
  }
  return Math.max(floor, Math.min(cap, cityRadiusKm * 0.45));
}

// Yakınlık tabanlı greedy K-kümeleme; gün başına çap sınırı uygular.
// { clusters, outliers } döner — outliers, çap sınırına sığmayan ve sonda
// en yakın güne zorla yerleştirilen yerlerdir.
function clusterByDay(places, days, maxDiameterKm) {
  if (places.length <= days) {
    const clusters = places.map((p) => [p]);
    while (clusters.length < days) clusters.push([]);
    return { clusters, outliers: [] };
  }

  const perDay = Math.ceil(places.length / days);
  const remaining = [...places];
  const clusters = [];
  const outliers = [];

  for (let d = 0; d < days; d++) {
    if (remaining.length === 0) {
      clusters.push([]);
      continue;
    }

    const cluster = [remaining.shift()];

    while (cluster.length < perDay && remaining.length > 0) {
      const center = centroid(cluster);
      let nearestIdx = -1;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = haversine(center.lat, center.lng, remaining[i].lat, remaining[i].lng);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      if (nearestIdx === -1) break;

      const candidate = remaining[nearestIdx];
      const trial = [...cluster, candidate];

      // Çap sınırı: kümenin çapını şişirecek adayı atla
      if (maxPairwiseDistance(trial) > maxDiameterKm) {
        outliers.push(candidate);
        remaining.splice(nearestIdx, 1);
        continue;
      }

      cluster.push(candidate);
      remaining.splice(nearestIdx, 1);
    }

    clusters.push(cluster);
  }

  // Kalanları (remaining + outliers) yerleştir. Boş gün varsa her zaman doldur.
  // Aksi halde: en yakın gün centroid'i izin verilen gün-içi çaptan UZAKSA, o yeri
  // plana hiç katma (düşür) — kullanıcı kopuk/uzak bağımsız noktalar istemiyor.
  // Çapa sığan kalanlar ise dengeli şekilde en yakın güne eklenir (%25 toleransla
  // en az dolu gün seçilir; tek güne yığılma önlenir).
  const leftover = [...remaining, ...outliers];
  const BALANCE_TOL = 1.25;
  let dropped = 0;
  while (leftover.length > 0) {
    const p = leftover.shift();
    // Boş gün varsa önce onu doldur (mesafe kıyaslamasını ve düşürmeyi atla)
    const emptyIdx = clusters.findIndex((c) => c.length === 0);
    if (emptyIdx !== -1) {
      clusters[emptyIdx].push(p);
      continue;
    }
    const dists = clusters.map((c) => {
      const center = centroid(c);
      return haversine(center.lat, center.lng, p.lat, p.lng);
    });
    const minDist = Math.min(...dists);
    // En yakın gün bile çap sınırından uzaksa: zorlamak uzun sıçrama yaratır → düş.
    if (minDist > maxDiameterKm) {
      dropped++;
      continue;
    }
    let bestCluster = 0;
    let bestLen = Infinity;
    for (let c = 0; c < clusters.length; c++) {
      if (dists[c] <= minDist * BALANCE_TOL && clusters[c].length < bestLen) {
        bestLen = clusters[c].length;
        bestCluster = c;
      }
    }
    clusters[bestCluster].push(p);
  }

  return { clusters, outliers, dropped };
}

// Nearest-neighbor TSP to order places within a day
function orderByNearest(places) {
  if (places.length <= 2) return places;

  const matrix = buildDistanceMatrix(places);
  const visited = new Set();
  const order = [];

  let current = 0;
  visited.add(current);
  order.push(places[current]);

  while (visited.size < places.length) {
    let nearest = -1;
    let nearestDist = Infinity;

    for (let i = 0; i < places.length; i++) {
      if (!visited.has(i) && matrix[current][i] < nearestDist) {
        nearestDist = matrix[current][i];
        nearest = i;
      }
    }

    if (nearest === -1) break;
    visited.add(nearest);
    order.push(places[nearest]);
    current = nearest;
  }

  return twoOptImprove(order);
}

// 2-opt improvement: NN sezgiseli lokal-optimum bir yol verir; bazı kenar
// çiftleri ters çevrilirse toplam mesafe azalır. 4-8 nokta için milisaniye
// mertebesinde, açık-zincir Hamilton yolu için çalışır (kapalı turda son↔ilk
// kenarı dahil edilmez).
function twoOptImprove(places) {
  const n = places.length;
  if (n < 4) return places;
  const dist = (a, b) => haversine(a.lat, a.lng, b.lat, b.lng);
  let route = [...places];
  let improved = true;
  let safety = 0;
  while (improved && safety < 50) {
    improved = false;
    safety++;
    for (let i = 0; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        // Mevcut: ...A-B...C-D...; aday: ...A-C...B-D... (i+1..j segmenti tersine)
        const A = route[i];
        const B = route[i + 1];
        const C = route[j];
        const D = route[j + 1];
        const before = dist(A, B) + dist(C, D);
        const after = dist(A, C) + dist(B, D);
        if (after + 1e-9 < before) {
          const reversed = route.slice(i + 1, j + 1).reverse();
          route = [...route.slice(0, i + 1), ...reversed, ...route.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return route;
}

/**
 * Restoranları gün-içi NN-sıralı yerlerin arasına en yakın komşuya göre enjekte eder.
 * Eski assignRestaurants centroid'e en yakın 2 restoran seçtiği için lunch ve
 * dinner konumları sıralama mantığına aykırı düşüp zig-zag yaratıyordu.
 *
 * Bu fonksiyon: gün için sıralı [yer1, yer2, yer3, yer4] verilince
 * lunch'ı ortadaki yere, dinner'ı son yere en yakın restoranı seçer ve sıraya
 * gömer → [yer1, yer2, R_lunch, yer3, yer4, R_dinner] gibi tek liste döndürür.
 *
 * @returns {Array<Array<Object & {kind: 'place' | 'restaurant'}>>} Gün başına karışık sıralı liste.
 */
function interleaveRestaurants(orderedPlacesByDay, restaurants, restPerDay = 2) {
  const remaining = [...restaurants];
  return orderedPlacesByDay.map((dayPlaces) => {
    if (!Array.isArray(dayPlaces) || dayPlaces.length === 0) return [];
    const n = dayPlaces.length;
    const restCount = Math.min(restPerDay, remaining.length);
    if (restCount === 0) {
      return dayPlaces.map((p) => ({ ...p, kind: 'place' }));
    }

    // Pozisyon = kaç yerden sonra restoran enjekte edilecek (1-tabanlı).
    // 1 restoran → ortaya (öğle); 2 → orta + son (öğle + akşam);
    // 3+ → erken (kahvaltı/kahve), orta (öğle), son (akşam) gibi dağıt.
    let positions;
    if (restCount === 1) {
      positions = [Math.max(1, Math.floor(n / 2))];
    } else if (restCount === 2) {
      positions = [Math.max(1, Math.floor(n / 2)), n];
    } else {
      // restCount kadar pozisyonu yerler arasına eşit dağıt (1..n)
      positions = [];
      for (let k = 1; k <= restCount; k++) {
        positions.push(Math.min(n, Math.max(1, Math.round((n * k) / (restCount + 1)) || 1)));
      }
    }

    const insertions = [];
    for (const pos of positions) {
      if (remaining.length === 0) break;
      const refPlace = dayPlaces[Math.min(pos, n) - 1];
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversine(refPlace.lat, refPlace.lng, remaining[i].lat, remaining[i].lng);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }
      insertions.push({ pos, restaurant: remaining.splice(nearestIdx, 1)[0] });
    }
    insertions.sort((a, b) => a.pos - b.pos);

    const result = [];
    let insIdx = 0;
    for (let placeIdx = 0; placeIdx <= n; placeIdx++) {
      while (insIdx < insertions.length && insertions[insIdx].pos === placeIdx) {
        result.push({ ...insertions[insIdx].restaurant, kind: 'restaurant' });
        insIdx++;
      }
      if (placeIdx < n) {
        result.push({ ...dayPlaces[placeIdx], kind: 'place' });
      }
    }
    return result;
  });
}

// Assign restaurants to days (nearest to day's cluster centroid)
function assignRestaurants(clusters, restaurants) {
  if (restaurants.length === 0) return clusters.map(() => []);

  const remaining = [...restaurants];
  const assignments = clusters.map(() => []);

  for (let d = 0; d < clusters.length; d++) {
    if (clusters[d].length === 0) continue;
    const center = centroid(clusters[d]);

    for (let r = 0; r < 2 && remaining.length > 0; r++) {
      let nearestIdx = 0;
      let nearestDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = haversine(center.lat, center.lng, remaining[i].lat, remaining[i].lng);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      assignments[d].push(remaining.splice(nearestIdx, 1)[0]);
    }
  }

  return assignments;
}

// Ulaşım moduna göre ortalama hız (km/sa) — seyahat süresi tahmini için.
const TRANSPORT_SPEED_KMH = {
  walking: 4.5,
  transit: 18,
  car: 30,
};
// Bacak mesafesine göre mod eşikleri (km). Mod hiyerarşisi: walking < transit < car.
// Seçilen mod, KISA bacaklarda alt modlara düşebilir (kullanıcı isteği):
//   walking → her bacak yürüme
//   transit → kısa bacak yürüme, üstü toplu taşıma
//   car / mixed → kısa yürüme, orta toplu taşıma, uzun araç (üçü de olabilir)
const WALK_MAX_KM = 1.2;
const TRANSIT_MAX_KM = 5;
// Toplu taşıma olmayan şehirde 'transit' bacağı için: bu mesafeye kadar yürünür,
// üstü araç (taksi). WALK_MAX_KM'den büyük çünkü transit-bacaklar zaten >WALK_MAX_KM.
const NO_TRANSIT_WALK_MAX_KM = 2;

// Bir bacak (önceki duraktan bu durağa) için mod + ortalama hız döndürür.
// Dönen mode: 'walking' | 'transit' | 'car'. (Eski 'motor' kaldırıldı; kayıtlı
// planlardaki 'motor' frontend'de araç ikonuyla geriye-uyumlu gösterilir.)
// hasTransit=false ise (şehirde anlamlı toplu taşıma yok) 'transit' bacaklar
// gerçekçi alternatife düşer: kısa-orta yürüme, uzun araç.
function legModeAndSpeed(transportMode, km, hasTransit = true) {
  const W = TRANSPORT_SPEED_KMH.walking;
  // Toplu taşıma yoksa transit yerine kullanılacak gerçekçi mod.
  const transitFallback = () =>
    km <= NO_TRANSIT_WALK_MAX_KM ? { mode: 'walking', speed: W } : { mode: 'car', speed: TRANSPORT_SPEED_KMH.car };
  const transitLeg = () =>
    hasTransit ? { mode: 'transit', speed: TRANSPORT_SPEED_KMH.transit } : transitFallback();

  // Yürüyüş modu: mesafeden bağımsız her bacak yürüme.
  if (transportMode === 'walking') return { mode: 'walking', speed: W };
  // Diğer tüm modlarda çok kısa bacaklar yürünür.
  if (km <= WALK_MAX_KM) return { mode: 'walking', speed: W };
  // Toplu taşıma modu araca yükselmez; kalan her bacak toplu taşıma (yoksa fallback).
  if (transportMode === 'transit') return transitLeg();
  // car / mixed: orta mesafe toplu taşıma (varsa), uzun mesafe araç.
  if (km <= TRANSIT_MAX_KM) return transitLeg();
  return { mode: 'car', speed: TRANSPORT_SPEED_KMH.car };
}

// Aktivite tipine/zaman dilimine göre tahmini durakta-kalma süresi (dakika).
function dwellMinutes(activity) {
  if (activity.type === 'restaurant') {
    return activity.time === 'dinner' ? 75 : 60;
  }
  if (activity.type === 'snack') return 30;
  const hay = `${activity.place || ''} ${activity.description_en || ''} ${activity.description_tr || ''}`.toLowerCase();
  if (/museum|müze|gallery|galeri|palace|saray|sergi/.test(hay)) return 90;
  return 75; // varsayılan gezilecek yer
}

function fmtTime(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = Math.round(totalMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Sıralı bir günün aktiviteleri için saatli program üretir (deterministik).
 * Gün başlangıç saatinden itibaren her durağa kalma süresi + bir önceki duraktan
 * seyahat süresi (haversine ÷ ulaşım hızı) eklenir. Yeni dış servis kullanılmaz.
 *
 * @param {Array<{lat,lng,type,time,place,...}>} activities  Haritadaki sırayla aktiviteler
 * @param {string} transportMode
 * @param {number} dayStartMin  Gün başlangıcı (dk; varsayılan 09:30 = 570)
 * @returns {Array<{arrival, departure, travelFromPrevMin, durationMin}>}  activities ile aynı sırada
 */
function computeSchedule(activities, transportMode = 'mixed', dayStartMin = 570, hasTransit = true) {
  let clock = dayStartMin;
  let prev = null;
  return activities.map((a) => {
    let travel = null;
    let travelMode = null;
    if (prev && Number.isFinite(a.lat) && Number.isFinite(prev.lat)) {
      const km = haversine(prev.lat, prev.lng, a.lat, a.lng);
      const { mode, speed } = legModeAndSpeed(transportMode, km, hasTransit);
      travel = Math.max(2, Math.round((km / speed) * 60)); // en az 2 dk
      travelMode = mode;
      clock += travel;
    }
    const arrival = clock;
    const duration = dwellMinutes(a);
    clock += duration;
    prev = a;
    return {
      arrival: fmtTime(arrival),
      departure: fmtTime(clock),
      travelFromPrevMin: travel,
      travelMode,
      durationMin: duration,
    };
  });
}

/**
 * Yerleri ve restoranları günlere kümeleyip her gün içinde yakınlığa göre sıralar.
 *
 * @param {Array} places          Filtrelenip puanlanmış lat/lng'li yerler.
 * @param {Array} restaurants     Filtrelenmiş lat/lng'li restoranlar.
 * @param {number} days           Tatil gün sayısı.
 * @param {number} [cityRadiusKm] Opsiyonel şehir yarıçapı (geocode viewport'tan);
 *                                gün-içi çap sınırını ölçeklemek için kullanılır.
 * @returns {{
 *   optimizedPlaces: Array<Array>,
 *   optimizedRestaurants: Array<Array>,
 *   maxDailyDiameterKm: number,
 * }}
 */
function optimizeRoute(places, restaurants, days, cityRadiusKm = null, transportMode = 'mixed', restPerDay = 2) {
  // Number.isFinite: lat/lng=0 (ekvator / Greenwich meridyeni) geçerli koordinattır;
  // truthy kontrol bunları yanlışlıkla elerdi (filterService ile tutarlı).
  const validPlaces = places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const validRestaurants = restaurants.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  const maxDailyDiameterKm = resolveMaxDailyDiameter(cityRadiusKm, transportMode);

  if (validPlaces.length === 0) {
    return {
      optimizedPlaces: Array.from({ length: days }, () => []),
      optimizedRestaurants: Array.from({ length: days }, () => []),
      maxDailyDiameterKm,
    };
  }

  const { clusters, dropped } = clusterByDay(validPlaces, days, maxDailyDiameterKm);
  if (dropped) console.warn(`[routeOptimizer] ${dropped} uzak outlier düşürüldü (gün-içi çap ${maxDailyDiameterKm.toFixed(1)} km)`);
  const optimizedPlaces = clusters.map(orderByNearest);
  const optimizedRestaurants = assignRestaurants(optimizedPlaces, validRestaurants);
  const optimizedItinerary = interleaveRestaurants(optimizedPlaces, validRestaurants, restPerDay);

  return { optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm };
}

module.exports = {
  optimizeRoute,
  haversine,
  maxPairwiseDistance,
  suggestTransit,
  resolveMaxDailyDiameter,
  interleaveRestaurants,
  computeSchedule,
};
