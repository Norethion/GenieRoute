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

/**
 * Her yerin adını iconic/curated listelerine göre eşleştir ve `category`
 * alanı ekle. Hiçbiriyle eşleşmeyen yerler 'regular' olur.
 */
function annotateCategories(places, { iconicNames = [], curatedNames = [] } = {}) {
  return places.map((p) => {
    let category = 'regular';
    if (iconicNames.some((n) => nameMatches(p.name, n))) category = 'iconic';
    else if (curatedNames.some((n) => nameMatches(p.name, n))) category = 'curated';
    return { ...p, category };
  });
}

// Kategori → ağırlık. iconic kalitenin işareti, regular sıradan; bu boost rating
// puanını koruyarak iconic'i tutarlı şekilde yukarı taşır.
const CATEGORY_BOOST = {
  iconic: 1.6,
  curated: 1.2,
  regular: 1.0,
};

/**
 * Mekanları ilgi alanı, bütçe ve puana göre filtrele ve gün sayısına böl.
 *
 * @param {Object} opts
 * @param {number} opts.days
 * @param {'relaxed'|'normal'|'intensive'} [opts.intensity='normal']
 */
function filterPlaces(places, { days, intensity = 'normal' }) {
  let filtered = [...places];

  filtered.sort((a, b) => {
    const baseA = a.rating * Math.log10(a.userRatingsTotal + 1);
    const baseB = b.rating * Math.log10(b.userRatingsTotal + 1);
    const boostA = CATEGORY_BOOST[a.category] ?? CATEGORY_BOOST.regular;
    const boostB = CATEGORY_BOOST[b.category] ?? CATEGORY_BOOST.regular;
    return (baseB * boostB) - (baseA * boostA);
  });

  const perDay = PLACES_PER_DAY_BY_INTENSITY[intensity] || PLACES_PER_DAY_BY_INTENSITY.normal;
  const maxPlaces = days * perDay;
  filtered = filtered.slice(0, maxPlaces);

  return filtered;
}

/**
 * Restoranları bütçe ve puana göre filtrele.
 */
function filterRestaurants(restaurants, { budget, days }) {
  let filtered = [...restaurants];

  // Bütçeye göre filtrele
  if (budget === 'low') {
    filtered = filtered.filter((r) => r.priceLevel === null || r.priceLevel <= 1);
  } else if (budget === 'medium') {
    filtered = filtered.filter((r) => r.priceLevel === null || r.priceLevel <= 2);
  }
  // high ise filtre yok

  // Puana göre sırala
  filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  // Gün başına 2 restoran (öğle + akşam)
  const maxRestaurants = days * 2;
  filtered = filtered.slice(0, maxRestaurants);

  return filtered;
}

module.exports = {
  filterPlaces,
  filterRestaurants,
  annotateCategories,
  PLACES_PER_DAY_BY_INTENSITY,
};
