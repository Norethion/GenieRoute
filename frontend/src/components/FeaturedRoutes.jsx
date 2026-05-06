import { useEffect, useState } from 'react';
import { MapPin, CalendarDays, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getFeaturedRoutes } from '../services/api';

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
        <h2>{lang === 'tr' ? 'Popüler Rotalar' : 'Popular Routes'}</h2>
        <p>{lang === 'tr' ? 'Hazır rotalardan birini seç, hemen keşfet.' : 'Pick a ready-made route and start exploring.'}</p>
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
                <img src={route.image} alt={info.title} loading="lazy" />
                <div className="featured-card-overlay">
                  <span className="featured-card-cta">
                    {lang === 'tr' ? 'Keşfet' : 'Explore'} <ArrowRight size={14} />
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
