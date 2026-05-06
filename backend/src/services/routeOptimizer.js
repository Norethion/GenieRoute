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

// Şehir yarıçapına göre dinamik gün-içi maksimum çap (km) hesapla
function resolveMaxDailyDiameter(cityRadiusKm) {
  if (!cityRadiusKm || !Number.isFinite(cityRadiusKm)) return 12;
  return Math.max(6, Math.min(14, cityRadiusKm * 0.45));
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

  // Kalanları (remaining + outliers) en yakın gün centroid'ine zorla yerleştir.
  // Burada çap sınırı bilinçli olarak gevşetilir, hiçbir yer düşürülmesin diye.
  const leftover = [...remaining, ...outliers];
  while (leftover.length > 0) {
    const p = leftover.shift();
    let bestCluster = 0;
    let bestDist = Infinity;
    for (let c = 0; c < clusters.length; c++) {
      if (clusters[c].length === 0) {
        // Boş gün varsa, bu yer onun başlangıç noktası olur
        bestCluster = c;
        bestDist = -1;
        break;
      }
      const center = centroid(clusters[c]);
      const dist = haversine(center.lat, center.lng, p.lat, p.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestCluster = c;
      }
    }
    clusters[bestCluster].push(p);
  }

  return { clusters, outliers };
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

  return order;
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
function optimizeRoute(places, restaurants, days, cityRadiusKm = null) {
  const validPlaces = places.filter((p) => p.lat && p.lng);
  const validRestaurants = restaurants.filter((r) => r.lat && r.lng);
  const maxDailyDiameterKm = resolveMaxDailyDiameter(cityRadiusKm);

  if (validPlaces.length === 0) {
    return {
      optimizedPlaces: Array.from({ length: days }, () => []),
      optimizedRestaurants: Array.from({ length: days }, () => []),
      maxDailyDiameterKm,
    };
  }

  const { clusters } = clusterByDay(validPlaces, days, maxDailyDiameterKm);
  const optimizedPlaces = clusters.map(orderByNearest);
  const optimizedRestaurants = assignRestaurants(optimizedPlaces, validRestaurants);

  return { optimizedPlaces, optimizedRestaurants, maxDailyDiameterKm };
}

module.exports = {
  optimizeRoute,
  haversine,
  maxPairwiseDistance,
  suggestTransit,
  resolveMaxDailyDiameter,
};
