const axios = require('axios');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function getPhotoUrl(photoReference) {
  if (!photoReference) return null;
  return `/api/places/photo/${encodeURIComponent(photoReference)}`;
}

function normalizePlace(place) {
  return {
    name: place.name,
    address: place.formatted_address || place.vicinity || '',
    rating: place.rating || 0,
    userRatingsTotal: place.user_ratings_total || 0,
    lat: place.geometry?.location?.lat,
    lng: place.geometry?.location?.lng,
    photoUrl: place.photos?.[0]?.photo_reference
      ? getPhotoUrl(place.photos[0].photo_reference)
      : null,
    photoUrls: (place.photos || [])
      .slice(0, 5)
      .map((p) => getPhotoUrl(p.photo_reference))
      .filter(Boolean),
    priceLevel: place.price_level ?? null,
    types: place.types || [],
    placeId: place.place_id,
  };
}

// Şehir adını lat/lng'ye çevirir (location bias için).
// Ek olarak viewport ve country code'u döndürür — country code multi-currency
// budget akışı ve country-aware LLM prompt'u için gereklidir.
async function geocodeCity(city, language = 'en') {
  const response = await axios.get(GEOCODE_URL, {
    params: {
      address: city,
      key: API_KEY,
      language,
    },
  });

  if (response.data.status === 'OK' && response.data.results.length > 0) {
    const result = response.data.results[0];
    const loc = result.geometry.location;
    const viewport = result.geometry.viewport
      ? {
          northeast: result.geometry.viewport.northeast,
          southwest: result.geometry.viewport.southwest,
        }
      : null;
    const countryComponent = (result.address_components || []).find((c) =>
      Array.isArray(c.types) && c.types.includes('country')
    );
    const countryCode = countryComponent?.short_name || null;
    return { lat: loc.lat, lng: loc.lng, viewport, countryCode };
  }
  return null;
}

async function searchPlaces(city, interests = [], language = 'en') {
  const interestKeywords = interests.length > 0 ? interests.join(' ') : 'tourist attraction';
  const query = `${interestKeywords} in ${city}`;

  const params = {
    query,
    key: API_KEY,
    language,
  };

  const coords = await geocodeCity(city, language);
  if (coords) {
    params.location = `${coords.lat},${coords.lng}`;
    params.radius = 50000;
  }

  const response = await axios.get(`${BASE_URL}/textsearch/json`, { params });

  if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${response.data.status}`);
  }

  return (response.data.results || []).map(normalizePlace);
}

async function searchRestaurants(city, budget, language = 'en') {
  const query = `restaurants in ${city}`;

  const params = {
    query,
    key: API_KEY,
    language,
  };

  const coords = await geocodeCity(city, language);
  if (coords) {
    params.location = `${coords.lat},${coords.lng}`;
    params.radius = 50000;
  }

  if (budget === 'low') {
    params.minprice = 0;
    params.maxprice = 1;
  } else if (budget === 'medium') {
    params.minprice = 1;
    params.maxprice = 2;
  } else if (budget === 'high') {
    params.minprice = 2;
    params.maxprice = 4;
  }

  const response = await axios.get(`${BASE_URL}/textsearch/json`, { params });

  if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${response.data.status}`);
  }

  return (response.data.results || []).map(normalizePlace);
}

// Lookup a single place by name within a city — returns normalized first match
async function lookupPlace(name, city, language = 'en') {
  const query = `${name} in ${city}`;
  const params = { query, key: API_KEY, language };

  const coords = await geocodeCity(city, language);
  if (coords) {
    params.location = `${coords.lat},${coords.lng}`;
    params.radius = 30000;
  }

  const response = await axios.get(`${BASE_URL}/textsearch/json`, { params });

  if (response.data.status !== 'OK' || !response.data.results?.length) {
    return null;
  }
  return normalizePlace(response.data.results[0]);
}

module.exports = {
  searchPlaces,
  searchRestaurants,
  geocodeCity,
  lookupPlace,
};
