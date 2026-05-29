import axios from 'axios';
import { getClientUuid } from './chatSocket';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function generatePlan({ city, days, budget, interests, language, startDate, endDate, intensity, transportMode }) {
  const response = await api.post('/planner/generate', {
    city,
    days: Number(days),
    budget,
    interests,
    intensity: intensity || 'normal',
    transportMode: transportMode || 'mixed',
    language: language || 'en',
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    clientUuid: getClientUuid(),
  });
  return response.data;
}

// Sequential orchestrator: 3 stages, calls onStep(1|2|3) after each completes.
// Returns the same shape as generatePlan() so callers don't need to change downstream.
export async function generatePlanWithProgress(formData, onStep) {
  const { city, days, budget, interests, startDate, endDate } = formData;
  const lang = formData.language || 'en';
  const intensity = formData.intensity || 'normal';
  const transportMode = formData.transportMode || 'mixed';
  const daysNum = Number(days);
  const clientUuid = getClientUuid();
  // Yemek/mutfak ilgi alanı seçildiyse restoran aramasını genişlet (kafe/pazar/sokak lezzeti)
  const FOOD_INTERESTS = ['food', 'cuisine', 'yemek', 'mutfak', 'gastronomy', 'gurme', 'lezzet'];
  const foodFocused = Array.isArray(interests) && interests.some((i) => FOOD_INTERESTS.includes(String(i).toLowerCase()));
  const notify = (step) => { try { onStep && onStep(step); } catch { /* ignore */ } };

  // Stage 1: places + restaurants in parallel
  const [placesRes, restaurantsRes] = await Promise.all([
    api.post('/places/search', { city, interests, language: lang }).then((r) => r.data),
    api.post('/places/restaurants', { city, budget, language: lang, foodFocused }).then((r) => r.data),
  ]);
  notify(1);

  // Stage 2: filter + optimize + budget + tips + weather (clientUuid → affinity sıralaması)
  const prep = await api.post('/planner/prepare', {
    city, days: daysNum, budget, interests, language: lang,
    intensity, transportMode,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    rawPlaces: placesRes.places || [],
    rawRestaurants: restaurantsRes.restaurants || [],
    clientUuid,
  }).then((r) => r.data);
  notify(2);

  // Stage 3: LLM (countryCode prepare'den geliyor — country-aware prompt için;
  // weatherDayParts → hava-duyarlı planlama; clientUuid → diyet/erişilebilirlik kısıtları)
  const { dailyPlan } = await api.post('/planner/llm', {
    city, days: daysNum, budget, interests, language: lang,
    intensity, transportMode,
    places: prep.places,
    restaurants: prep.restaurants,
    optimizedPlaces: prep.optimizedPlaces,
    optimizedRestaurants: prep.optimizedRestaurants,
    optimizedItinerary: prep.optimizedItinerary,
    maxDailyDiameterKm: prep.maxDailyDiameterKm,
    countryCode: prep.countryCode,
    weatherDayParts: prep.weatherDayParts || undefined,
    clientUuid,
  }).then((r) => r.data);
  notify(3);

  return {
    trip: { city, days: daysNum, budget, interests, startDate, endDate, countryCode: prep.countryCode, intensity, transportMode, clientUuid },
    language: lang,
    dailyPlan,
    places: prep.places,
    restaurants: prep.restaurants,
    mapMarkers: prep.mapMarkers,
    budgetEstimate: prep.budgetEstimate,
    cityInfo: prep.cityInfo,
    weather: prep.weather,
    weatherDayParts: prep.weatherDayParts,
  };
}

export async function searchPlaces(city, interests) {
  const response = await api.post('/places/search', { city, interests });
  return response.data;
}

export async function searchRestaurants(city, budget) {
  const response = await api.post('/places/restaurants', { city, budget });
  return response.data;
}

// Mekan açıklaması (Wikipedia/Wikivoyage, tembel) — bulunamazsa 404 (çağıran yutar).
export async function getPlaceContent(name, language) {
  const response = await api.get('/places/content', { params: { name, language } });
  return response.data; // { content: { extract, thumbUrl, source, sourceUrl } }
}

// --- Favoriler (sunucu tarafı, clientUuid ile) ---
export async function getFavorites(clientUuid) {
  const response = await api.get('/favorites', { params: { clientUuid } });
  return response.data;
}

export async function addFavorite(clientUuid, place) {
  const response = await api.post('/favorites', { clientUuid, ...place });
  return response.data;
}

export async function removeFavorite(clientUuid, placeId) {
  const response = await api.delete(`/favorites/${encodeURIComponent(placeId)}`, { params: { clientUuid } });
  return response.data;
}

// --- Tercihler (sunucu tarafı, clientUuid ile) ---
export async function getPreferences(clientUuid) {
  const response = await api.get('/preferences', { params: { clientUuid } });
  return response.data;
}

export async function savePreferences(clientUuid, prefs) {
  const response = await api.put('/preferences', { clientUuid, prefs });
  return response.data;
}

export async function saveTrip(tripData) {
  const response = await api.post('/trips', tripData);
  return response.data;
}

export async function getTrips() {
  const response = await api.get('/trips');
  return response.data;
}

export async function getTripById(id) {
  const response = await api.get(`/trips/${id}`);
  return response.data;
}

export async function getFeaturedRoutes() {
  const response = await api.get('/routes/featured');
  return response.data;
}

export async function lookupPlace({ name, city, language }) {
  const response = await api.post('/places/lookup', { name, city, language });
  return response.data;
}

export async function updateTripPlan(tripId, { planText, placesJson, restaurantsJson }) {
  const response = await api.put(`/trips/${tripId}/plan`, { planText, placesJson, restaurantsJson });
  return response.data;
}

export async function getAdminCities() {
  const response = await api.get('/admin/cities');
  return response.data;
}

export async function getOpenAIUsage(range = '7d') {
  const response = await api.get('/usage/openai', { params: { range } });
  return response.data;
}

export async function getGoogleCloudUsage(range = '7d') {
  const response = await api.get('/usage/google/cloud', { params: { range } });
  return response.data;
}

export default api;
