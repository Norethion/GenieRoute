import { useState } from 'react';
import { Compass, Filter, Box, Layers, Route, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../data/markerCategories';

const STYLE_CYCLE = ['light', 'dark', 'streets', 'satellite'];

export default function MapFabGroup({
  mapRef,
  is3D, onToggle3D,
  styleKey, onCycleStyle,
  routesVisible, onToggleRoutes,
  categoryFilter, onToggleCategory, hasFilters,
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  const [expanded, setExpanded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const labels = {
    main:      lang === 'tr' ? 'Harita Araçları' : 'Map Tools',
    close:     lang === 'tr' ? 'Kapat' : 'Close',
    filters:   lang === 'tr' ? 'Kategori Filtresi' : 'Category Filter',
    threeD:    is3D ? (lang === 'tr' ? '3D kapalı' : 'Disable 3D') : (lang === 'tr' ? '3D Açık' : 'Enable 3D'),
    style:     lang === 'tr' ? `Tema: ${styleKey}` : `Theme: ${styleKey}`,
    route:     routesVisible ? (lang === 'tr' ? 'Rotayı Gizle' : 'Hide Route') : (lang === 'tr' ? 'Rotayı Göster' : 'Show Route'),
  };

  const categoryKeys = Object.keys(CATEGORY_COLORS);

  return (
    <>
      {showFilters && (
        <div className="map-filter-panel">
          <div className="map-filter-header">
            <span>{labels.filters}</span>
            <button
              type="button"
              className="map-filter-close"
              onClick={() => setShowFilters(false)}
              aria-label="close filter panel"
            >
              <X size={14} />
            </button>
          </div>
          <div className="map-filter-list">
            {categoryKeys.map((key) => {
              const enabled = !categoryFilter || categoryFilter.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`map-filter-chip${enabled ? ' enabled' : ''}`}
                  onClick={() => onToggleCategory?.(key)}
                  style={{ '--chip-color': CATEGORY_COLORS[key] }}
                >
                  <span className="map-filter-dot" />
                  {CATEGORY_LABELS[key]?.[lang]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={`map-fab-group${expanded ? ' expanded' : ''}`}>
        {expanded && (
          <>
            <button
              type="button"
              className={`map-fab-sub${hasFilters ? ' has-filters' : ''}`}
              title={labels.filters}
              onClick={() => setShowFilters((v) => !v)}
            >
              <Filter size={18} />
            </button>
            <button
              type="button"
              className={`map-fab-sub${is3D ? ' active' : ''}`}
              title={labels.threeD}
              onClick={onToggle3D}
            >
              <Box size={18} />
            </button>
            <button
              type="button"
              className="map-fab-sub"
              title={labels.style}
              onClick={onCycleStyle}
            >
              <Layers size={18} />
            </button>
            <button
              type="button"
              className={`map-fab-sub${routesVisible ? ' active' : ''}`}
              title={labels.route}
              onClick={onToggleRoutes}
            >
              <Route size={18} />
            </button>
          </>
        )}
        <button
          type="button"
          className="map-fab-main"
          title={expanded ? labels.close : labels.main}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <X size={20} /> : <Compass size={20} />}
        </button>
      </div>
    </>
  );
}

export { STYLE_CYCLE };
