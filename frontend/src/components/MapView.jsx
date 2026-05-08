import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { Loader, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { lightStyle, darkStyle, DAY_COLORS } from '../data/mapStyles';

const containerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 39.9208, lng: 32.8541 };

function createNumberedIcon(number, color) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
      <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26C32 7.16 24.84 0 16 0z" fill="${color}"/>
      <circle cx="16" cy="16" r="10" fill="white"/>
      <text x="16" y="21" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}">${number}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

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

// Normalize text for fuzzy matching (Turkish chars, trim, lowercase)
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
  // Substring fallback. Boş normalize edilmiş adları (CJK/Arap-only isimler
  // "" döner) atla, aksi halde "".includes() her şeyi sahte eşler.
  // Birden fazla aday varsa uzunluk farkı en küçük olan en spesifik kabul edilir.
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

export default function MapView({ markers = [], center, highlightedPlace, dailyPlan, activeDay }) {
  const { t } = useTranslation();
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || '',
  });

  const [selectedMarker, setSelectedMarker] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [mapReady, setMapReady] = useState(false);
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
  const mapRef = useRef(null);
  const { theme } = useTheme();

  // Build day-to-markers mapping with fuzzy matching
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

  // Tek seferlik global eşleşme — render içinde marker bazında çağrı yaparsak
  // substring fallback birden fazla marker'a yanlış BOUNCE verir.
  const highlightedMarker = useMemo(
    () => findMarkerForPlace(markers, highlightedPlace),
    [markers, highlightedPlace]
  );

  const visibleMarkers = useMemo(() => {
    if (!dayMarkers.length) return markers;
    if (selectedDay >= 0) return dayMarkers[selectedDay] || [];
    // "Tüm günler" görünümünde sadece bir güne atanmış marker'ları göster.
    // LLM'in seçmediği yerler haritayı kalabalıklaştırmaz; her marker'ın bir
    // gün rengi olur (default mavi/kırmızı çakışması yaşanmaz).
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
    return result;
  }, [selectedDay, dayMarkers, markers]);

  // Polyline'ları imperatif yönetiyoruz — @react-google-maps/api Polyline'ı
  // ne path ne options prop değişikliklerini alttaki google.maps.Polyline'a
  // güvenilir şekilde yansıtıyor (unmount sırasında setMap(null) bile
  // çağırmıyor). Bu yüzden google.maps.Polyline objelerini bizzat oluşturup,
  // her render'da eski olanları setMap(null) ile haritadan temizliyoruz.
  const polylinesRef = useRef([]);

  // Only compute center once on initial render — after that the map manages its own center
  const mapCenter = useMemo(() => {
    return center || (markers.length > 0
      ? { lat: markers[0].lat, lng: markers[0].lng }
      : defaultCenter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMarkerClick = useCallback((marker) => {
    setSelectedMarker(marker);
  }, []);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    setMapReady(true);
    if (markers.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [markers]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setOptions({
        styles: theme === 'dark' ? darkStyle : lightStyle,
      });
    }
  }, [theme]);

  useEffect(() => {
    if (highlightedPlace && mapRef.current) {
      const found = findMarkerForPlace(markers, highlightedPlace);
      if (found) {
        mapRef.current.panTo({ lat: found.lat, lng: found.lng });
        mapRef.current.setZoom(16);
      }
    }
  }, [highlightedPlace, markers]);

  useEffect(() => {
    if (mapRef.current && visibleMarkers.length > 1) {
      const bounds = new window.google.maps.LatLngBounds();
      visibleMarkers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      mapRef.current.fitBounds(bounds, { padding: 60 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

  // İmperatif polyline yönetimi: önce eski objeleri haritadan kaldır, sonra
  // sadece görünmesi gereken günler için yeni google.maps.Polyline oluştur.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!dayMarkers.length) return;

    dayMarkers.forEach((dayPlaces, i) => {
      if (dayPlaces.length < 2) return;
      const visible = selectedDay < 0 || selectedDay === i;
      if (!visible) return;

      const polyline = new window.google.maps.Polyline({
        path: dayPlaces.map((p) => ({ lat: p.lat, lng: p.lng })),
        strokeColor: DAY_COLORS[i % DAY_COLORS.length],
        strokeOpacity: 0.8,
        strokeWeight: 3,
        geodesic: true,
        clickable: false,
        map: mapRef.current,
      });
      polylinesRef.current.push(polyline);
    });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [mapReady, dayMarkers, selectedDay]);

  if (!isLoaded) {
    return (
      <div className="map-loading">
        <Loader size={24} className="map-spinner" />
        <p>{t('map.loading')}</p>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={mapCenter}
      zoom={13}
      onLoad={onMapLoad}
      options={{
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        styles: theme === 'dark' ? darkStyle : lightStyle,
      }}
    >
      {visibleMarkers.map((marker, index) => {
        let markerNumber = index + 1;
        let markerColor = marker.markerType === 'restaurant' ? '#EA4335' : '#4285F4';

        if (selectedDay >= 0 && dayMarkers[selectedDay]) {
          markerNumber = index + 1;
          markerColor = DAY_COLORS[selectedDay % DAY_COLORS.length];
        } else if (dayMarkers.length > 0) {
          for (let d = 0; d < dayMarkers.length; d++) {
            const idx = dayMarkers[d].findIndex((m) => m.name === marker.name);
            if (idx !== -1) {
              markerColor = DAY_COLORS[d % DAY_COLORS.length];
              markerNumber = idx + 1;
              break;
            }
          }
        }

        return (
          <Marker
            key={`${marker.name}-${index}`}
            position={{ lat: marker.lat, lng: marker.lng }}
            title={marker.name}
            icon={{
              url: createNumberedIcon(markerNumber, markerColor),
              scaledSize: new window.google.maps.Size(32, 42),
            }}
            animation={
              highlightedMarker && marker.name === highlightedMarker.name
                ? window.google.maps.Animation.BOUNCE
                : undefined
            }
            onClick={() => onMarkerClick(marker)}
          />
        );
      })}

      {selectedMarker && (
        <InfoWindow
          position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
          onCloseClick={() => setSelectedMarker(null)}
        >
          <div className="info-window">
            {selectedPhotos.length > 0 && (
              <div className="info-window-photo-wrap">
                <img
                  key={selectedPhotos[photoIndex]}
                  className="info-window-img"
                  src={getPhotoSrc(selectedPhotos[photoIndex])}
                  alt={selectedMarker.name}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
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
              {selectedMarker.markerType && (
                <span className={`info-badge ${selectedMarker.markerType}`}>
                  {t(`map.${selectedMarker.markerType}`)}
                </span>
              )}
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
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
