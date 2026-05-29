import { useState, useEffect, useRef, useMemo } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader, ExternalLink, ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { MAPBOX_STYLES, DAY_COLORS } from '../data/mapStyles';
import { getCategoryColor, getCategoryLabel, getMarkerCategory, CATEGORY_COLORS } from '../data/markerCategories';
import { getPhotoSrc, buildMapsUrl } from '../data/photoUrl';
import { getPlaceContent } from '../services/api';
import { useFavorites } from '../hooks/useFavorites';
import MapFabGroup, { STYLE_CYCLE } from './MapFabGroup';
import PhotoWithFallback from './PhotoWithFallback';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const defaultCenter = { latitude: 39.9208, longitude: 32.8541 };

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[^a-z0-9\s]/g, '');
}

function findMarkerForPlace(markers, placeName) {
  if (!placeName) return null;
  const exact = markers.find((m) => m.name.toLowerCase() === placeName.toLowerCase());
  if (exact) return exact;
  const norm = normalize(placeName);
  if (!norm) return null;
  const normExact = markers.find((m) => normalize(m.name) === norm);
  if (normExact) return normExact;
  const candidates = markers.filter((m) => {
    const mn = normalize(m.name);
    if (!mn) return false;
    return mn.includes(norm) || norm.includes(mn);
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((best, m) =>
    Math.abs(normalize(m.name).length - norm.length) <
    Math.abs(normalize(best.name).length - norm.length) ? m : best
  );
}

function NumberedPin({ number, color, bouncing }) {
  return (
    <div className={`map-pin${bouncing ? ' bouncing' : ''}`} style={{ '--pin-color': color }}>
      <div className="map-pin-body">
        <span className="map-pin-number">{number}</span>
      </div>
    </div>
  );
}

export default function MapView({ markers = [], center, highlightedPlace, dailyPlan, activeDay, fitVersion = 0 }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const mapRef = useRef(null);
  const { isFavorite, toggle: toggleFavorite } = useFavorites();

  const [selectedMarker, setSelectedMarker] = useState(null);
  // Seçili mekanın Wikipedia/Wikivoyage açıklaması — { key, lang, content }.
  // key/lang ile eşleştirilir; eşleşmeyen sonuç "yükleniyor" sayılır (senkron
  // setState'ten kaçınmak için — react-hooks/set-state-in-effect temiz kalır).
  const [placeAbout, setPlaceAbout] = useState(null);
  // Yalnız favori mekanları göster (FAB toggle)
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  // FAB grubu state'leri — pitch, harita stili, rota görünürlüğü, kategori filtresi
  const [is3D, setIs3D] = useState(false);
  const [styleKey, setStyleKey] = useState(null); // null = tema otomatik (light/dark)
  const [routesVisible, setRoutesVisible] = useState(true);
  // categoryFilter null ise "tümü görünür"; Set ise yalnızca içindeki kategoriler
  const [categoryFilter, setCategoryFilter] = useState(null);
  // Mapbox Directions API'den dönen yol-takipli rota geojson'ları — day index ile cache
  const [directionsCache, setDirectionsCache] = useState({});
  const selectedDay = activeDay ?? -1;

  const selectedPhotos = useMemo(() => {
    if (!selectedMarker) return [];
    if (Array.isArray(selectedMarker.photoUrls) && selectedMarker.photoUrls.length) {
      return selectedMarker.photoUrls;
    }
    return selectedMarker.photoUrl ? [selectedMarker.photoUrl] : [];
  }, [selectedMarker]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [selectedMarker?.placeId, selectedMarker?.name]);

  // Mekan seçilince açıklamayı tembel yükle (Wikipedia/Wikivoyage). Sonuç key+lang
  // ile etiketlenir; senkron reset yok (yalnız async callback'te setState).
  useEffect(() => {
    const name = selectedMarker?.name;
    if (!name) return;
    const key = selectedMarker.placeId || name;
    const lang = i18n.language === 'tr' ? 'tr' : 'en';
    let active = true;
    getPlaceContent(name, lang)
      .then((data) => { if (active) setPlaceAbout({ key, lang, content: data?.content || null }); })
      .catch(() => { if (active) setPlaceAbout({ key, lang, content: null }); });
    return () => { active = false; };
  }, [selectedMarker?.placeId, selectedMarker?.name, i18n.language]);

  const dayMarkers = useMemo(() => {
    if (!dailyPlan?.days || !markers.length) return [];
    return dailyPlan.days.map((day) => {
      const dayPlaces = [];
      for (const activity of day.activities) {
        const found = findMarkerForPlace(markers, activity.place);
        if (found && !dayPlaces.some((p) => p.name === found.name)) {
          dayPlaces.push(found);
        }
      }
      return dayPlaces;
    });
  }, [dailyPlan, markers]);

  const highlightedMarker = useMemo(
    () => findMarkerForPlace(markers, highlightedPlace),
    [markers, highlightedPlace]
  );

  const visibleMarkers = useMemo(() => {
    let base;
    if (!dayMarkers.length) {
      base = markers;
    } else if (selectedDay >= 0) {
      base = dayMarkers[selectedDay] || [];
    } else {
      const seen = new Set();
      const result = [];
      for (const dayList of dayMarkers) {
        for (const m of dayList) {
          if (!seen.has(m.name)) {
            seen.add(m.name);
            result.push(m);
          }
        }
      }
      base = result;
    }
    if (categoryFilter) base = base.filter((m) => categoryFilter.has(getMarkerCategory(m)));
    if (favoritesOnly) base = base.filter((m) => isFavorite(m.placeId || m.name));
    return base;
  }, [selectedDay, dayMarkers, markers, categoryFilter, favoritesOnly, isFavorite]);

  // Seçili gün için Mapbox Directions API'sinden yol-takipli rota çek
  useEffect(() => {
    if (selectedDay < 0 || !dayMarkers[selectedDay]) return;
    const dayPlaces = dayMarkers[selectedDay];
    if (dayPlaces.length < 2) return;
    // Bu gün için cache'de varsa tekrar çekme
    const cacheKey = dayPlaces.map((p) => `${p.lat},${p.lng}`).join('|');
    if (directionsCache[selectedDay]?.cacheKey === cacheKey) return;

    const coords = dayPlaces.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => {
        const route = data?.routes?.[0]?.geometry;
        if (!route) return;
        setDirectionsCache((prev) => ({
          ...prev,
          [selectedDay]: { cacheKey, geometry: route },
        }));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        // Hata durumunda düz çizgiye düş — cache'i error olarak işaretle ki tekrar denemeyelim
        setDirectionsCache((prev) => ({
          ...prev,
          [selectedDay]: { cacheKey, geometry: null, error: true },
        }));
      });

    return () => controller.abort();
  }, [selectedDay, dayMarkers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polyline'ları GeoJSON Source+Layer ile çiziyoruz. Tüm-günler görünümünde rota yok;
  // tek-gün modunda Directions API'den gelen yol-takipli geometri (yoksa düz çizgi fallback).
  const routeLayers = useMemo(() => {
    if (!dayMarkers.length || !routesVisible || selectedDay < 0) return [];
    const dayPlaces = dayMarkers[selectedDay];
    if (!dayPlaces || dayPlaces.length < 2) return [];
    const cached = directionsCache[selectedDay];
    // Directions yüklenirken düz çizgi gösterme (flicker'ı önler); yalnız yanıt
    // geldiğinde yol-takipli rotayı çiz, hata olursa düz çizgiye düş.
    let geometry = cached?.geometry;
    if (!geometry) {
      if (cached?.error) {
        geometry = { type: 'LineString', coordinates: dayPlaces.map((p) => [p.lng, p.lat]) };
      } else {
        return []; // hâlâ yükleniyor → rota hazır olunca tek seferde görünür
      }
    }
    return [{
      id: `route-day-${selectedDay}`,
      color: DAY_COLORS[selectedDay % DAY_COLORS.length],
      geojson: { type: 'Feature', geometry },
    }];
  }, [dayMarkers, selectedDay, routesVisible, directionsCache]);

  // 3D pitch toggle — easeTo ile yumuşak geçiş
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: is3D ? 60 : 0, duration: 600 });
  }, [is3D]);

  // FAB stil seçimi geçerliyse onu kullan, aksi halde tema bazlı varsayılan
  const activeMapStyle = styleKey
    ? MAPBOX_STYLES[styleKey]
    : (theme === 'dark' ? MAPBOX_STYLES.dark : MAPBOX_STYLES.light);

  const cycleStyle = () => {
    setStyleKey((prev) => {
      const base = prev || (theme === 'dark' ? 'dark' : 'light');
      const i = STYLE_CYCLE.indexOf(base);
      return STYLE_CYCLE[(i + 1) % STYLE_CYCLE.length];
    });
  };

  const toggleCategoryFilter = (key) => {
    setCategoryFilter((prev) => {
      const all = Object.keys(CATEGORY_COLORS);
      const current = prev || new Set(all);
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Hepsi görünürse "filtre yok" anlamına null'a düşür
      if (next.size === all.length) return null;
      return next;
    });
  };

  const initialView = useMemo(() => ({
    latitude: center?.lat ?? (markers[0]?.lat || defaultCenter.latitude),
    longitude: center?.lng ?? (markers[0]?.lng || defaultCenter.longitude),
    zoom: 13,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tek birleşik fit effect: görünür marker'lara çerçevele.
  // - Mount + tüm-günler (selectedDay=-1): tüm benzersiz mekanlara fit (uzaklaşır).
  // - Tek gün: o günün mekanlarına fit.
  // - Preview/chat update: visibleMarkers değişir -> yeni mekan dahil re-fit.
  // - Aynı gün/Tüm Günler tekrar tıklanınca: fitVersion artar -> re-fit (marker'a
  //   yakınlaşıp geri dönüldüğünde de düzelir).
  // maxZoom: az/yakın marker'da sokak seviyesine aşırı yakınlaşmayı engeller.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || visibleMarkers.length === 0) return;
    if (visibleMarkers.length === 1) {
      map.flyTo({ center: [visibleMarkers[0].lng, visibleMarkers[0].lat], zoom: 14, duration: 600 });
      return;
    }
    const lats = visibleMarkers.map((m) => m.lat);
    const lngs = visibleMarkers.map((m) => m.lng);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 600, maxZoom: 15 }
    );
  }, [selectedDay, visibleMarkers, fitVersion]);

  // Popup'ı yalnız gün değişince kapat — marker dizisi update'i (preview)
  // popup'ı kapatmamalı, kullanıcı incelediği yeri kaybetmesin.
  useEffect(() => {
    setSelectedMarker(null);
  }, [selectedDay]);

  // DayCard'dan tıklanan yerle haritayı yakınlaştır
  useEffect(() => {
    if (!highlightedMarker || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [highlightedMarker.lng, highlightedMarker.lat],
      zoom: 16,
      duration: 800,
    });
    setSelectedMarker(null);
  }, [highlightedMarker]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="map-loading">
        <Loader size={24} className="map-spinner" />
        <p>{t('map.loading')}</p>
        <small style={{ color: 'var(--text-sub, #888)', marginTop: 8 }}>
          VITE_MAPBOX_TOKEN eksik — frontend/.env'ye ekleyin.
        </small>
      </div>
    );
  }

  return (
    <div className="map-view-wrapper">
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={initialView}
      style={{ width: '100%', height: '100%' }}
      mapStyle={activeMapStyle}
      attributionControl={false}
    >
      <NavigationControl position="top-left" showCompass={false} />

      {routeLayers.map((r) => (
        <Source key={r.id} id={r.id} type="geojson" data={r.geojson}>
          <Layer
            id={`${r.id}-line`}
            type="line"
            paint={{
              'line-color': r.color,
              'line-width': 3,
              'line-opacity': 0.8,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      ))}

      {visibleMarkers.map((marker, index) => {
        let markerNumber = index + 1;
        // Hem tek-gün hem tüm-günler görünümünde gün rengi kullanılır; böylece
        // tüm-günlerde hangi mekanın hangi güne ait olduğu renkten anlaşılır.
        // (Plan yoksa kategori rengine düşülür.)
        let markerColor = getCategoryColor(marker);

        if (selectedDay >= 0 && dayMarkers[selectedDay]) {
          markerNumber = index + 1;
          markerColor = DAY_COLORS[selectedDay % DAY_COLORS.length];
        } else if (dayMarkers.length > 0) {
          for (let d = 0; d < dayMarkers.length; d++) {
            const idx = dayMarkers[d].findIndex((m) => m.name === marker.name);
            if (idx !== -1) {
              markerNumber = idx + 1;
              markerColor = DAY_COLORS[d % DAY_COLORS.length]; // tüm-günlerde gün rengi
              break;
            }
          }
        }

        const isBouncing = highlightedMarker && marker.name === highlightedMarker.name;

        return (
          <Marker
            key={`${marker.name}-${index}`}
            longitude={marker.lng}
            latitude={marker.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedMarker(marker);
            }}
          >
            <NumberedPin number={markerNumber} color={markerColor} bouncing={isBouncing} />
          </Marker>
        );
      })}

      {selectedMarker && (
        <Popup
          longitude={selectedMarker.lng}
          latitude={selectedMarker.lat}
          offset={[0, -30]}
          closeOnClick={false}
          closeButton={true}
          onClose={() => setSelectedMarker(null)}
          maxWidth="260px"
          className="genieroute-popup"
        >
          <div className="info-window">
            {selectedPhotos.length > 0 && (
              <div className="info-window-photo-wrap">
                <PhotoWithFallback
                  key={selectedPhotos[photoIndex]}
                  imgClassName="info-window-img"
                  className="info-window-fallback"
                  src={getPhotoSrc(selectedPhotos[photoIndex])}
                  alt={selectedMarker.name}
                  fallbackText={selectedMarker.name}
                />
                {selectedPhotos.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="info-window-nav-btn prev"
                      onClick={() => setPhotoIndex((i) => (i - 1 + selectedPhotos.length) % selectedPhotos.length)}
                      aria-label="previous photo"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      className="info-window-nav-btn next"
                      onClick={() => setPhotoIndex((i) => (i + 1) % selectedPhotos.length)}
                      aria-label="next photo"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <div className="info-window-dots">
                      {selectedPhotos.map((_, i) => (
                        <span key={i} className={`info-window-dot${i === photoIndex ? ' active' : ''}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="info-window-body">
              <h4>{selectedMarker.name}</h4>
              <div className="info-rating-row">
                {selectedMarker.rating > 0 && (
                  <p className="info-rating">{'★'.repeat(Math.round(selectedMarker.rating))} {selectedMarker.rating}</p>
                )}
                <button
                  type="button"
                  className={`info-like-btn${isFavorite(selectedMarker.placeId || selectedMarker.name) ? ' liked' : ''}`}
                  onClick={() => toggleFavorite(selectedMarker)}
                  aria-label={t('favorites.like')}
                  title={isFavorite(selectedMarker.placeId || selectedMarker.name) ? t('favorites.remove') : t('favorites.like')}
                >
                  <Heart size={14} fill={isFavorite(selectedMarker.placeId || selectedMarker.name) ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p>{selectedMarker.address}</p>
              {(() => {
                const aboutKey = selectedMarker.placeId || selectedMarker.name;
                const aboutLang = i18n.language === 'tr' ? 'tr' : 'en';
                const ready = placeAbout && placeAbout.key === aboutKey && placeAbout.lang === aboutLang;
                const about = ready ? placeAbout.content : null;
                if (!ready) return <p className="info-about info-about-loading">{t('map.aboutLoading')}</p>;
                if (!about?.extract) return null;
                const srcLabel = about.source === 'wikivoyage'
                  ? 'Wikivoyage'
                  : (aboutLang === 'tr' ? 'Vikipedi' : 'Wikipedia');
                return (
                  <p className="info-about">
                    {about.extract}
                    {about.sourceUrl && (
                      <a className="info-about-source" href={about.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {srcLabel} (CC BY-SA) ↗
                      </a>
                    )}
                  </p>
                );
              })()}
              <span
                className="info-badge"
                style={{
                  background: `${getCategoryColor(selectedMarker)}1f`,
                  color: getCategoryColor(selectedMarker),
                }}
              >
                {getCategoryLabel(selectedMarker, i18n.language === 'en' ? 'en' : 'tr')}
              </span>
              <a
                className="info-window-btn"
                href={buildMapsUrl(selectedMarker)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} />
                {t('map.openInGoogleMaps')}
              </a>
            </div>
          </div>
        </Popup>
      )}
    </Map>
    <MapFabGroup
      mapRef={mapRef}
      is3D={is3D}
      onToggle3D={() => setIs3D((v) => !v)}
      styleKey={styleKey || (theme === 'dark' ? 'dark' : 'light')}
      onCycleStyle={cycleStyle}
      routesVisible={routesVisible}
      onToggleRoutes={() => setRoutesVisible((v) => !v)}
      categoryFilter={categoryFilter}
      onToggleCategory={toggleCategoryFilter}
      hasFilters={!!categoryFilter}
      favoritesOnly={favoritesOnly}
      onToggleFavorites={() => setFavoritesOnly((v) => !v)}
    />
    </div>
  );
}
