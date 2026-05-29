import { useState, useEffect, useMemo, useCallback } from 'react';
import { getClientUuid } from '../services/chatSocket';
import { getFavorites, addFavorite, removeFavorite } from '../services/api';
import { getMarkerCategory } from '../data/markerCategories';

// placeId yoksa isimle eşle — chat ile eklenen bazı yerlerde placeId olmayabilir.
function favKey(place) {
  return place?.placeId || place?.name || '';
}

export function useFavorites() {
  const clientUuid = getClientUuid();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getFavorites(clientUuid)
      .then((data) => { if (active) setFavorites(data.favorites || []); })
      .catch(() => { if (active) setFavorites([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientUuid]);

  const favIds = useMemo(() => new Set(favorites.map((f) => f.place_id)), [favorites]);
  const isFavorite = useCallback((placeId) => favIds.has(placeId), [favIds]);

  const toggle = useCallback(async (place) => {
    const placeId = favKey(place);
    if (!placeId) return;
    if (favIds.has(placeId)) {
      // Optimistic remove
      const prev = favorites;
      setFavorites((f) => f.filter((x) => x.place_id !== placeId));
      try {
        await removeFavorite(clientUuid, placeId);
      } catch {
        setFavorites(prev); // rollback
      }
    } else {
      const payload = {
        placeId,
        name: place.name,
        category: getMarkerCategory(place),
        city: place.city || null,
        lat: place.lat ?? null,
        lng: place.lng ?? null,
        rating: place.rating ?? null,
      };
      // Optimistic add (server şekline yakın bir satır)
      const optimistic = {
        place_id: placeId, name: payload.name, category: payload.category,
        city: payload.city, lat: payload.lat, lng: payload.lng, rating: payload.rating,
      };
      const prev = favorites;
      setFavorites((f) => [optimistic, ...f]);
      try {
        await addFavorite(clientUuid, payload);
      } catch {
        setFavorites(prev); // rollback
      }
    }
  }, [clientUuid, favIds, favorites]);

  const remove = useCallback(async (placeId) => {
    const prev = favorites;
    setFavorites((f) => f.filter((x) => x.place_id !== placeId));
    try {
      await removeFavorite(clientUuid, placeId);
    } catch {
      setFavorites(prev);
    }
  }, [clientUuid, favorites]);

  return { favorites, isFavorite, toggle, remove, loading };
}
