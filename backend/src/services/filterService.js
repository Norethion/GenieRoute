// Yoğunluk → gün başına ortalama yer sayısı. Form'daki intensity seçimine bağlı.
const PLACES_PER_DAY_BY_INTENSITY = {
  relaxed: 3,
  normal: 4,
  intensive: 6,
};

// İsim eşleme için: lowercase + diakritik temizleme + parantez içi sil.
// qualityMetrics.normalizeName ile aynı fikir; çift kayıt yerine küçük helper.
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatches(placeName, refName) {
  const a = normalizeName(placeName);
  const b = normalizeName(refName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

// Açık/kapalı mekan sezgisi — Google Places types[] üzerinden. Hava-duyarlı
// planlamada yağmurlu dilimlerde kapalı mekan tercih ettirmek için kullanılır.
// 'tourist_attraction' tek başına belirsiz → 'mixed'.
const OUTDOOR_TYPES = new Set([
  'park', 'natural_feature', 'zoo', 'amusement_park', 'campground',
  'rv_park', 'hiking_area', 'beach', 'botanical_garden', 'stadium',
]);
const INDOOR_TYPES = new Set([
  'museum', 'art_gallery', 'shopping_mall', 'restaurant', 'cafe', 'aquarium',
  'movie_theater', 'library', 'spa', 'casino', 'book_store', 'department_store',
]);

function classifyEnvironment(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  if (types.some((t) => OUTDOOR_TYPES.has(t))) return 'outdoor';
  if (types.some((t) => INDOOR_TYPES.has(t))) return 'indoor';
  return 'mixed';
}

// Turistik "çapa" tipleri: bunlardan biri varsa mekan her hâlükârda turistiktir.
const TOURISTIC_ANCHOR_TYPES = new Set([
  'tourist_attraction', 'museum', 'art_gallery', 'park', 'natural_feature',
  'place_of_worship', 'church', 'mosque', 'hindu_temple', 'synagogue',
  'zoo', 'aquarium', 'amusement_park', 'botanical_garden', 'monument',
  'historical_landmark', 'landmark', 'hiking_area', 'beach', 'campground',
  'shopping_mall', 'market', 'performing_arts_theater', 'movie_theater', 'library',
]);
// Turistik olmayan tipler: çapa yoksa ve bunlardan biri varsa mekan elenir
// (hastane, mağaza, banka, benzinlik vb. — Aydın planındaki LC Waikiki/hastane gibi).
const NON_TOURISTIC_TYPES = new Set([
  // sağlık
  'hospital', 'doctor', 'dentist', 'pharmacy', 'drugstore', 'physiotherapist', 'veterinary_care', 'health',
  // finans / resmi
  'bank', 'atm', 'accounting', 'finance', 'insurance_agency', 'local_government_office',
  'courthouse', 'police', 'fire_station', 'post_office', 'embassy',
  // otomotiv
  'gas_station', 'car_repair', 'car_dealer', 'car_rental', 'car_wash',
  // hizmet
  'lawyer', 'real_estate_agency', 'moving_company', 'storage', 'plumber', 'electrician', 'laundry', 'funeral_home',
  // genel perakende (mağaza)
  'clothing_store', 'shoe_store', 'electronics_store', 'furniture_store', 'home_goods_store',
  'hardware_store', 'convenience_store', 'supermarket', 'grocery_or_supermarket', 'liquor_store',
  'cell_phone_store', 'pet_store', 'florist', 'bicycle_store', 'store',
  // diğer
  'gym', 'school', 'primary_school', 'secondary_school', 'lodging', 'parking',
]);

// Mekan turistik mi? Çapa tipi varsa evet; yoksa turistik-olmayan tip içeriyorsa hayır;
// hiçbiri yoksa (yalnız point_of_interest/establishment) şüpheden faydalanıp tutulur.
function isTouristicPlace(place) {
  const types = Array.isArray(place?.types) ? place.types : [];
  if (types.some((t) => TOURISTIC_ANCHOR_TYPES.has(t))) return true;
  if (types.some((t) => NON_TOURISTIC_TYPES.has(t))) return false;
  return true;
}

/**
 * Her yerin adını iconic/curated listelerine göre eşleştir ve `category` +
 * `environment` (indoor/outdoor/mixed) alanları ekle. Hiçbiriyle eşleşmeyen
 * yerler 'regular' olur.
 */
function annotateCategories(places, { iconicNames = [], curatedNames = [] } = {}) {
  return places.map((p) => {
    let category = 'regular';
    if (iconicNames.some((n) => nameMatches(p.name, n))) category = 'iconic';
    else if (curatedNames.some((n) => nameMatches(p.name, n))) category = 'curated';
    return { ...p, category, environment: classifyEnvironment(p) };
  });
}

// Kategori → ağırlık. iconic kalitenin işareti, regular sıradan; bu boost rating
// puanını koruyarak iconic'i tutarlı şekilde yukarı taşır.
const CATEGORY_BOOST = {
  iconic: 1.6,
  curated: 1.2,
  regular: 1.0,
};

// Google Places types[] -> marker kategorisi. Frontend markerCategories.js ile
// aynı eşleme — affinity karşılaştırması favori 'category' alanıyla tutarlı olsun.
const TYPE_TO_MARKER_CATEGORY = [
  ['restaurant', ['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'bar', 'night_club', 'bakery', 'ice_cream_shop']],
  ['cafe', ['cafe', 'coffee_shop']],
  ['museum', ['museum', 'art_gallery', 'library', 'performing_arts_theater', 'movie_theater']],
  ['landmark', ['place_of_worship', 'church', 'mosque', 'hindu_temple', 'synagogue', 'monument', 'park', 'natural_feature', 'zoo', 'aquarium', 'amusement_park']],
  ['shopping', ['shopping_mall', 'store', 'supermarket', 'department_store', 'market', 'clothing_store']],
  ['transit', ['subway_station', 'train_station', 'airport', 'bus_station', 'transit_station', 'taxi_stand']],
  ['attraction', ['tourist_attraction', 'point_of_interest']],
];

function markerCategoryOf(place) {
  if (place?.markerType === 'restaurant') return 'restaurant';
  const types = Array.isArray(place?.types) ? place.types : [];
  for (const [category, matchTypes] of TYPE_TO_MARKER_CATEGORY) {
    if (types.some((t) => matchTypes.includes(t))) return category;
  }
  return 'attraction';
}

/**
 * Favori istatistiklerinden (getFavoriteStats) affinity sinyali üret. count >= 2
 * olan kategori/şehirleri "üst beğeni" sayar; hiçbiri 2'ye ulaşmazsa en çok
 * beğenilen tek tanesini alır (top-1). Boş ise null döner (boost yok).
 */
function buildAffinity(stats) {
  if (!stats || stats.total < 1) return null;
  const pick = (obj) => {
    const entries = Object.entries(obj || {});
    if (!entries.length) return new Set();
    const strong = entries.filter(([, n]) => n >= 2).map(([k]) => k);
    if (strong.length) return new Set(strong);
    // 2'ye ulaşan yok — en çok beğenilen tek anahtar
    const top = entries.sort((a, b) => b[1] - a[1])[0][0];
    return new Set([top]);
  };
  return { topCategories: pick(stats.byCategory), topCities: pick(stats.byCity) };
}

// Beğenilen kategori +%15, beğenilen şehir +%10 (çarpımsal). affinity yoksa 1.
function affinityMultiplier(place, affinity) {
  if (!affinity) return 1;
  let m = 1;
  if (affinity.topCategories?.size && affinity.topCategories.has(markerCategoryOf(place))) m *= 1.15;
  if (affinity.topCities?.size && place.city && affinity.topCities.has(place.city)) m *= 1.10;
  return m;
}

// Haversine (km) — şehir-merkezi mesafe eşiği için.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Şehir merkezinden maxRadiusKm'den uzak (koordinatlı) yerleri ele. Google Text
// Search'ün konum biası hard sınır olmadığı için, veri-fakiri yerlerde başka
// ülkelerden alakasız eşleşmeler dönebiliyor (ör. "Tristan da Cunha" → Fransız
// Guyanası'ndaki "La Trinité", 6.000+ km); bu eşik onları temizler. Koordinatsız
// kayıtlara dokunmaz (optimizer zaten onları düşürür).
function pruneByDistance(list, center, maxRadiusKm) {
  if (!center || !Number.isFinite(maxRadiusKm)) return list;
  return list.filter((p) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return true;
    return haversineKm(center.lat, center.lng, p.lat, p.lng) <= maxRadiusKm;
  });
}

// Şehir merkezine uzaklığa göre "kopuk uzak nokta" (ör. Aydın'da 30 km'deki Nysa)
// elemesi. Sabit yarıçap yerine ADAPTİF: mekan kütlesinin medyan uzaklığının
// `factor` katını aşan ve `floorKm`'den uzak olanlar düşer. Böylece mekanların
// çoğu merkeze yakınsa uzak tek-tük noktalar atılır; gerçekten yayılmış şehirlerde
// (büyük metropol) medyan da büyük olacağından bir şey atılmaz. Az veriyle (<6)
// outlier tespiti güvenilmez olduğundan dokunulmaz.
function pruneCenterOutliers(list, center, { floorKm = 8, factor = 3 } = {}) {
  if (!center) return list;
  const withD = list.map((p) => ({
    p,
    d: (Number.isFinite(p.lat) && Number.isFinite(p.lng))
      ? haversineKm(center.lat, center.lng, p.lat, p.lng) : null,
  }));
  const dists = withD.map((x) => x.d).filter((d) => d != null).sort((a, b) => a - b);
  if (dists.length < 6) return list;
  const median = dists[Math.floor(dists.length / 2)];
  const threshold = Math.max(floorKm, median * factor);
  return withD.filter((x) => x.d == null || x.d <= threshold).map((x) => x.p);
}

/**
 * Mekanları ilgi alanı, bütçe ve puana göre filtrele ve gün sayısına böl.
 *
 * @param {Object} opts
 * @param {number} opts.days
 * @param {'relaxed'|'normal'|'intensive'} [opts.intensity='normal']
 * @param {{topCategories:Set,topCities:Set}|null} [opts.affinity=null] - kullanıcı favorilerinden türetilen sıralama sinyali
 * @param {{lat:number,lng:number}|null} [opts.center=null] - şehir merkezi (mesafe eşiği için)
 * @param {number|null} [opts.maxRadiusKm=null] - merkezden bu km'den uzak yerler elenir
 */
function filterPlaces(places, { days, intensity = 'normal', affinity = null, center = null, maxRadiusKm = null }) {
  let filtered = pruneByDistance([...places], center, maxRadiusKm);
  // Turistik olmayan POI'leri (hastane, mağaza, banka, benzinlik…) ele.
  filtered = filtered.filter(isTouristicPlace);
  // Kopuk uzak noktaları (mekan kütlesinden ayrık) adaptif olarak ele.
  filtered = pruneCenterOutliers(filtered, center);

  filtered.sort((a, b) => {
    const baseA = a.rating * Math.log10(a.userRatingsTotal + 1);
    const baseB = b.rating * Math.log10(b.userRatingsTotal + 1);
    const boostA = (CATEGORY_BOOST[a.category] ?? CATEGORY_BOOST.regular) * affinityMultiplier(a, affinity);
    const boostB = (CATEGORY_BOOST[b.category] ?? CATEGORY_BOOST.regular) * affinityMultiplier(b, affinity);
    return (baseB * boostB) - (baseA * boostA);
  });

  const perDay = PLACES_PER_DAY_BY_INTENSITY[intensity] || PLACES_PER_DAY_BY_INTENSITY.normal;
  const maxPlaces = days * perDay;
  filtered = filtered.slice(0, maxPlaces);

  return filtered;
}

/**
 * Restoranları bütçe ve puana göre filtrele.
 * @param {number} [opts.restPerDay=2] - gün başına yemek durağı (yemek odaklı planda 3).
 * @param {{lat:number,lng:number}|null} [opts.center=null] - şehir merkezi (mesafe eşiği için)
 * @param {number|null} [opts.maxRadiusKm=null] - merkezden bu km'den uzak yerler elenir
 */
function filterRestaurants(restaurants, { budget, days, restPerDay = 2, center = null, maxRadiusKm = null }) {
  let filtered = pruneByDistance([...restaurants], center, maxRadiusKm);
  // Kopuk uzak restoranları ele — aksi halde yürüyüş modunda 35 km'lik (463 dk!)
  // saçma bacaklar oluşuyordu (uzak sahil restoranı bir güne atanınca).
  filtered = pruneCenterOutliers(filtered, center);

  // Bütçeye göre filtrele
  if (budget === 'low') {
    filtered = filtered.filter((r) => r.priceLevel === null || r.priceLevel <= 1);
  } else if (budget === 'medium') {
    filtered = filtered.filter((r) => r.priceLevel === null || r.priceLevel <= 2);
  }
  // high ise filtre yok

  // Puana göre sırala
  filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  // Gün başına restPerDay restoran (öğle + akşam, yemek odaklıysa +1)
  const maxRestaurants = days * restPerDay;
  filtered = filtered.slice(0, maxRestaurants);

  return filtered;
}

module.exports = {
  filterPlaces,
  filterRestaurants,
  annotateCategories,
  buildAffinity,
  normalizeName,
  PLACES_PER_DAY_BY_INTENSITY,
};
