// Google Places types[] → kategori → renk haritası.
// Vacanza referansı: kategori bazlı renk kodlaması ile ilk bakışta
// restoran/müze/kafe ayrımı yapılabilir.

export const CATEGORY_COLORS = {
  restaurant: '#FF6B6B', // coral — yeme-içme
  cafe:       '#FFB347', // amber — kafe/tatlı
  museum:     '#00B4D8', // teal  — müze/sanat
  landmark:   '#8E44AD', // purple — anıt/cami/park
  shopping:   '#2DD4A8', // green — alışveriş
  transit:    '#64748B', // slate — ulaşım
  attraction: '#4285F4', // blue  — varsayılan turistik
};

export const CATEGORY_LABELS = {
  restaurant: { tr: 'Restoran', en: 'Restaurant' },
  cafe:       { tr: 'Kafe', en: 'Cafe' },
  museum:     { tr: 'Müze / Kültür', en: 'Museum / Culture' },
  landmark:   { tr: 'Anıt / Yer', en: 'Landmark' },
  shopping:   { tr: 'Alışveriş', en: 'Shopping' },
  transit:    { tr: 'Ulaşım', en: 'Transit' },
  attraction: { tr: 'Turistik', en: 'Attraction' },
};

const TYPE_TO_CATEGORY = [
  ['restaurant', ['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'bar', 'night_club', 'bakery', 'ice_cream_shop']],
  ['cafe',       ['cafe', 'coffee_shop']],
  ['museum',     ['museum', 'art_gallery', 'library', 'performing_arts_theater', 'movie_theater']],
  ['landmark',   ['place_of_worship', 'church', 'mosque', 'hindu_temple', 'synagogue', 'monument', 'park', 'natural_feature', 'zoo', 'aquarium', 'amusement_park']],
  ['shopping',   ['shopping_mall', 'store', 'supermarket', 'department_store', 'market', 'clothing_store']],
  ['transit',    ['subway_station', 'train_station', 'airport', 'bus_station', 'transit_station', 'taxi_stand']],
  ['attraction', ['tourist_attraction', 'point_of_interest']],
];

// Backend'den gelen marker'larda markerType ('restaurant' | 'attraction') ya da
// types[] (Google Places ham tipleri) bulunabilir. Her ikisini de destekle.
export function getMarkerCategory(marker) {
  if (!marker) return 'attraction';
  if (marker.markerType === 'restaurant') return 'restaurant';

  const types = Array.isArray(marker.types) ? marker.types : [];
  for (const [category, matchTypes] of TYPE_TO_CATEGORY) {
    if (types.some((t) => matchTypes.includes(t))) return category;
  }
  return 'attraction';
}

export function getCategoryColor(marker) {
  return CATEGORY_COLORS[getMarkerCategory(marker)] || CATEGORY_COLORS.attraction;
}

export function getCategoryLabel(marker, lang = 'tr') {
  const cat = getMarkerCategory(marker);
  return CATEGORY_LABELS[cat]?.[lang] || CATEGORY_LABELS.attraction[lang];
}
