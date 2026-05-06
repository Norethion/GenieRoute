import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export async function generatePlan({ city, days, budget, interests, language, startDate, endDate }) {
  const response = await api.post('/planner/generate', {
    city,
    days: Number(days),
    budget,
    interests,
    language: language || 'en',
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });
  return response.data;
}

// Sequential orchestrator: 3 stages, calls onStep(1|2|3) after each completes.
// Returns the same shape as generatePlan() so callers don't need to change downstream.
export async function generatePlanWithProgress(formData, onStep) {
  const { city, days, budget, interests, startDate, endDate } = formData;
  const lang = formData.language || 'en';
  const daysNum = Number(days);
  const notify = (step) => { try { onStep && onStep(step); } catch { /* ignore */ } };

  // Stage 1: places + restaurants in parallel
  const [placesRes, restaurantsRes] = await Promise.all([
    api.post('/places/search', { city, interests, language: lang }).then((r) => r.data),
    api.post('/places/restaurants', { city, budget, language: lang }).then((r) => r.data),
  ]);
  notify(1);

  // Stage 2: filter + optimize + budget + tips + weather
  const prep = await api.post('/planner/prepare', {
    city, days: daysNum, budget, interests, language: lang,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    rawPlaces: placesRes.places || [],
    rawRestaurants: restaurantsRes.restaurants || [],
  }).then((r) => r.data);
  notify(2);

  // Stage 3: LLM
  const { dailyPlan } = await api.post('/planner/llm', {
    city, days: daysNum, budget, interests, language: lang,
    places: prep.places,
    restaurants: prep.restaurants,
    optimizedPlaces: prep.optimizedPlaces,
    optimizedRestaurants: prep.optimizedRestaurants,
    maxDailyDiameterKm: prep.maxDailyDiameterKm,
  }).then((r) => r.data);
  notify(3);

  return {
    trip: { city, days: daysNum, budget, interests, startDate, endDate },
    language: lang,
    dailyPlan,
    places: prep.places,
    restaurants: prep.restaurants,
    mapMarkers: prep.mapMarkers,
    budgetEstimate: prep.budgetEstimate,
    cityInfo: prep.cityInfo,
    weather: prep.weather,
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

export default api;
