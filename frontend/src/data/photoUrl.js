// MapView ve SavedPlaces ortak kullanır — foto proxy URL'i ve Google Maps linki.

export function getPhotoSrc(photoUrl) {
  if (!photoUrl) return null;
  if (/^https?:\/\//.test(photoUrl)) return photoUrl;
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');
  return `${apiBase}${photoUrl}`;
}

export function buildMapsUrl(marker) {
  const base = `https://www.google.com/maps/search/?api=1&query=${marker.lat},${marker.lng}`;
  return marker.placeId ? `${base}&query_place_id=${marker.placeId}` : base;
}
