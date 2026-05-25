import { useState, useEffect, useRef, useMemo } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { MAPBOX_STYLES, DAY_COLORS } from '../data/mapStyles';
import { getCategoryColor, getCategoryLabel, getMarkerCategory, CATEGORY_COLORS } from '../data/markerCategories';
import MapFabGroup, { STYLE_CYCLE } from './MapFabGroup';
import PhotoWithFallback from './PhotoWithFallback';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const defaultCenter = { latitude: 39.9208, longitude: 32.8541 };

function getPhotoSrc(photoUrl) {
  if (!photoUrl) return null;
  if (/^https?:\/\//.test(photoUrl)) return photoUrl;
  const apiBase = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');
  return `${apiBase}${photoUrl}`;
}

function buildMapsUrl(marker) {
  const base = `https://www.google.com/maps/search/?api=1&query=${marker.lat},${marker.lng}`;
  return marker.placeId ? `${base}&query_place_id=${marker.placeId}` : base;
}

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

export default function MapView({ markers = [], center, highlightedPlace, dailyPlan, activeDay }) {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const mapRef = useRef(null);

  const [selectedMarker, setSelectedMarker] = useState(null);
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
    if (!categoryFilter) return base;
    return base.filter((m) => categoryFilter.has(getMarkerCategory(m)));
  }, [selectedDay, dayMarkers, markers, categoryFilter]);

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
    const geometry = cached?.geometry || {
      type: 'LineString',
      coordinates: dayPlaces.map((p) => [p.lng, p.lat]),
    };
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

  // İlk yüklemede tüm marker'lara fit — yalnız BIR KEZ. Sonraki marker
  // değişiklikleri (preview / chat update) haritayı yeniden çerçevelemesin;
  // aksi halde yeni eklenen mekan (varsayılan koordinatlar veya farklı ülke)
  // tüm haritayı dünya görünümüne zoom-out eder.
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || markers.length < 2 || initialFitDoneRef.current) return;
    const lats = markers.map((m) => m.lat);
    const lngs = markers.map((m) => m.lng);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 600 }
    );
    initialFitDoneRef.current = true;
  }, [markers]);

  // Gün değişimi VEYA o gün için marker dizisinin değişmesi durumlarında re-fit.
  // - Day 2 -> Day 1 (kullanıcı tab tıkladı): selectedDay değişti -> fit Day 1
  // - Preview eklenince: visibleMarkers reference'ı değişti -> yeni marker dahil re-fit
  // Önceki kod sadece [selectedDay]'e bağlıydı; preview marker eklendiğinde re-fit
  // tetiklenmediği için kullanıcı yeni mekanı viewport dışında görmüyordu.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || visibleMarkers.length < 2 || selectedDay < 0) return;
    const lats = visibleMarkers.map((m) => m.lat);
    const lngs = visibleMarkers.map((m) => m.lng);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 600 }
    );
  }, [selectedDay, visibleMarkers]);

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
        // Tek gün görünümünde gün rengi (rota akışını öne çıkarır), tüm günler
        // görünümünde kategori rengi (restoran/müze/kafe ayrımı görünür olur).
        let markerColor = getCategoryColor(marker);

        if (selectedDay >= 0 && dayMarkers[selectedDay]) {
          markerNumber = index + 1;
          markerColor = DAY_COLORS[selectedDay % DAY_COLORS.length];
        } else if (dayMarkers.length > 0) {
          for (let d = 0; d < dayMarkers.length; d++) {
            const idx = dayMarkers[d].findIndex((m) => m.name === marker.name);
            if (idx !== -1) {
              markerNumber = idx + 1;
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
              <p className="info-rating">{'★'.repeat(Math.round(selectedMarker.rating || 0))} {selectedMarker.rating}</p>
              <p>{selectedMarker.address}</p>
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
    />
    </div>
  );
}
