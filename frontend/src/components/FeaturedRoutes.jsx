import { useEffect, useState } from 'react';
import { MapPin, CalendarDays, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getFeaturedRoutes } from '../services/api';
import PhotoWithFallback from './PhotoWithFallback';

export default function FeaturedRoutes({ onRouteSelect }) {
  const { t, i18n } = useTranslation();
  const [routes, setRoutes] = useState([]);

  const lang = i18n.language === 'tr' ? 'tr' : 'en';

  useEffect(() => {
    getFeaturedRoutes()
      .then((data) => setRoutes(data.routes || []))
      .catch(() => {});
  }, []);

  if (routes.length === 0) return null;

  return (
    <div className="featured-routes">
      <div className="featured-header">
        <h2>{t('featured.title')}</h2>
        <p>{t('featured.subtitle')}</p>
      </div>
      <div className="featured-grid">
        {routes.map((route) => {
          const info = route[lang];
          return (
            <div
              key={route.slug}
              className="featured-card"
              onClick={() => onRouteSelect(route)}
            >
              <div className="featured-card-image">
                <PhotoWithFallback
                  src={route.image}
                  alt={info.title}
                  fallbackText={info.title}
                  fallbackIcon={MapPin}
                  className="featured-card-fallback"
                />
                <div className="featured-card-overlay">
                  <span className="featured-card-cta">
                    {t('featured.explore')} <ArrowRight size={14} />
                  </span>
                </div>
              </div>
              <div className="featured-card-body">
                <h3>{info.title}</h3>
                <p className="featured-card-desc">{info.desc}</p>
                <div className="featured-card-meta">
                  <span><MapPin size={13} /> {info.cities}</span>
                  <span><CalendarDays size={13} /> {route.days} {t('result.day')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
