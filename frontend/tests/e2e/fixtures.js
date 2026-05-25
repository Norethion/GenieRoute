// Test fixture'lari — mock trip verisi (gercek backend cagrisi gerektirmez,
// sadece UI bilesenlerini denemek icin yeterli).
export const MOCK_TRIP_RESULT = {
  trip: { city: 'Ankara', days: 2, budget: 'medium', interests: ['kültür', 'müze'] },
  places: [
    { name: 'Anıtkabir', address: 'Anıttepe, Ankara', rating: 4.8, lat: 39.9255, lng: 32.8369, types: ['museum', 'tourist_attraction'], placeId: 'p1' },
    { name: 'Etnografya Müzesi', address: 'Talatpaşa Blv, Ankara', rating: 4.5, lat: 39.9337, lng: 32.8569, types: ['museum'], placeId: 'p2' },
    { name: 'Kocatepe Camii', address: 'Kocatepe, Ankara', rating: 4.7, lat: 39.9201, lng: 32.8541, types: ['place_of_worship', 'mosque'], placeId: 'p3' },
  ],
  restaurants: [
    { name: 'Hacı Arif Bey', address: 'Kızılay, Ankara', rating: 4.4, lat: 39.9214, lng: 32.8550, types: ['restaurant'], placeId: 'r1' },
    { name: 'Kalebar Restaurant', address: 'Ulus, Ankara', rating: 4.6, lat: 39.9396, lng: 32.8636, types: ['restaurant'], placeId: 'r2' },
  ],
  mapMarkers: [
    { name: 'Anıtkabir', address: 'Anıttepe', rating: 4.8, lat: 39.9255, lng: 32.8369, markerType: 'attraction', placeId: 'p1', types: ['museum', 'tourist_attraction'] },
    { name: 'Etnografya Müzesi', address: 'Talatpaşa', rating: 4.5, lat: 39.9337, lng: 32.8569, markerType: 'attraction', placeId: 'p2', types: ['museum'] },
    { name: 'Kocatepe Camii', address: 'Kocatepe', rating: 4.7, lat: 39.9201, lng: 32.8541, markerType: 'attraction', placeId: 'p3', types: ['place_of_worship', 'mosque'] },
    { name: 'Hacı Arif Bey', address: 'Kızılay', rating: 4.4, lat: 39.9214, lng: 32.8550, markerType: 'restaurant', placeId: 'r1', types: ['restaurant'] },
    { name: 'Kalebar Restaurant', address: 'Ulus', rating: 4.6, lat: 39.9396, lng: 32.8636, markerType: 'restaurant', placeId: 'r2', types: ['restaurant'] },
  ],
  dailyPlan: {
    days: [
      {
        day: 1,
        day_number: 1,
        title_tr: 'Tarih ve Atatürk',
        title_en: 'History & Atatürk',
        activities: [
          { time: 'morning', place: 'Anıtkabir', type: 'attraction', description: 'Atatürk Mozolesi ziyareti' },
          { time: 'lunch', place: 'Hacı Arif Bey', type: 'restaurant', description: 'Geleneksel Türk öğle yemeği' },
          { time: 'afternoon', place: 'Etnografya Müzesi', type: 'attraction', description: 'Etnografya koleksiyonu' },
        ],
      },
      {
        day: 2,
        day_number: 2,
        title_tr: 'Şehir Merkezi',
        title_en: 'City Center',
        activities: [
          { time: 'morning', place: 'Kocatepe Camii', type: 'attraction', description: "Türkiye'nin en büyük camisi" },
          { time: 'dinner', place: 'Kalebar Restaurant', type: 'restaurant', description: "Ulus'ta akşam yemeği" },
        ],
      },
    ],
  },
};

// SessionStorage'a mock trip yerlestir — testler /result sayfasinda
// dogrudan baslayabilsin.
export async function seedMockTrip(page) {
  await page.addInitScript((result) => {
    sessionStorage.setItem('genieroute-last-result', JSON.stringify(result));
  }, MOCK_TRIP_RESULT);
}
