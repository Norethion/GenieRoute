import { useNavigate } from 'react-router-dom';
import { Heart, Trash2, ExternalLink, Plus, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFavorites } from '../hooks/useFavorites';
import { getCategoryColor, getCategoryLabel } from '../data/markerCategories';
import { buildMapsUrl } from '../data/photoUrl';

export default function SavedPlacesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'tr';
  const { favorites, remove, loading } = useFavorites();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p className="loading-text">{t('loading.message')}</p>
      </div>
    );
  }

  return (
    <div className="saved-trips-page">
      <div className="saved-header">
        <h2>{t('favorites.title')}</h2>
        <span className="saved-count">{favorites.length}</span>
      </div>

      {favorites.length === 0 ? (
        <div className="no-result">
          <Heart size={48} strokeWidth={1.5} />
          <h3>{t('favorites.empty')}</h3>
          <p>{t('favorites.emptyDesc')}</p>
          <button onClick={() => navigate('/')} className="btn-next">
            <Plus size={16} />
            {t('result.createPlan')}
          </button>
        </div>
      ) : (
        <div className="saved-places-grid">
          {favorites.map((fav) => {
            // favori satırı marker shape'ine yakın — kategori rengi/etiketi için marker gibi davran
            const marker = { name: fav.name, markerType: fav.category === 'restaurant' ? 'restaurant' : undefined, lat: fav.lat, lng: fav.lng, placeId: fav.place_id, types: [] };
            const color = getCategoryColor({ markerType: marker.markerType, types: [] });
            const label = fav.category
              ? (getCategoryLabel({ markerType: marker.markerType, types: [] }, lang))
              : null;
            return (
              <div key={fav.place_id} className="saved-place-card">
                <div className="saved-place-top">
                  <h3>{fav.name}</h3>
                  <button
                    type="button"
                    className="saved-place-remove"
                    onClick={() => remove(fav.place_id)}
                    aria-label={t('favorites.remove')}
                    title={t('favorites.remove')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {fav.rating != null && (
                  <p className="info-rating"><Star size={12} /> {fav.rating}</p>
                )}
                {fav.city && <p className="saved-place-city">{fav.city}</p>}
                <div className="saved-place-footer">
                  {label && (
                    <span className="info-badge" style={{ background: `${color}1f`, color }}>{label}</span>
                  )}
                  {fav.lat != null && fav.lng != null && (
                    <a
                      className="saved-place-maps"
                      href={buildMapsUrl(marker)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={13} />
                      {t('map.openInGoogleMaps')}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
