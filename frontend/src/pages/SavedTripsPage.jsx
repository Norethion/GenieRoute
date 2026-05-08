import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, CalendarDays, Wallet, Plus, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTrips, getTripById } from '../services/api';

export default function SavedTripsPage() {
  const { t } = useTranslation();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingTripId, setLoadingTripId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getTrips()
      .then((data) => setTrips(data.trips || []))
      .catch(() => setError(t('savedTrips.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  const handleTripClick = async (tripId) => {
    setLoadingTripId(tripId);
    try {
      const data = await getTripById(tripId);
      const trip = data.trip;

      const dailyPlan = typeof trip.plan_text === 'string'
        ? JSON.parse(trip.plan_text)
        : trip.plan_text;

      const places = typeof trip.places_json === 'string'
        ? JSON.parse(trip.places_json)
        : trip.places_json || [];

      const restaurants = typeof trip.restaurants_json === 'string'
        ? JSON.parse(trip.restaurants_json)
        : trip.restaurants_json || [];

      const interests = typeof trip.interests === 'string'
        ? JSON.parse(trip.interests)
        : trip.interests || [];

      const budgetEstimate = typeof trip.budget_estimate === 'string'
        ? JSON.parse(trip.budget_estimate)
        : trip.budget_estimate || null;

      const cityInfo = typeof trip.city_info === 'string'
        ? JSON.parse(trip.city_info)
        : trip.city_info || null;

      const mapMarkers = [
        ...places.map((p) => ({ ...p, markerType: 'attraction' })),
        ...restaurants.map((r) => ({ ...r, markerType: 'restaurant' })),
      ];

      navigate('/result', {
        state: {
          tripId: trip.id,
          result: {
            trip: { city: trip.city, days: trip.days, budget: trip.budget, interests },
            dailyPlan, places, restaurants, mapMarkers,
            budgetEstimate, cityInfo,
          },
        },
      });
    } catch {
      setError(t('savedTrips.detailError'));
    } finally {
      setLoadingTripId(null);
    }
  };

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
        <h2>{t('savedTrips.title')}</h2>
        <span className="saved-count">{trips.length}</span>
      </div>

      {error && <div className="error-message">{error}</div>}

      {!error && trips.length === 0 ? (
        <div className="no-result">
          <Bookmark size={48} strokeWidth={1.5} />
          <h3>{t('savedTrips.empty')}</h3>
          <p>{t('savedTrips.emptyDesc')}</p>
          <button onClick={() => navigate('/')} className="btn-next">
            <Plus size={16} />
            {t('result.createPlan')}
          </button>
        </div>
      ) : (
        <div className="trips-grid">
          {trips.map((trip) => {
            const interests = typeof trip.interests === 'string'
              ? JSON.parse(trip.interests)
              : trip.interests;
            const isCardLoading = loadingTripId === trip.id;

            return (
              <div
                key={trip.id}
                className={`trip-card ${isCardLoading ? 'trip-card-loading' : ''}`}
                onClick={() => !isCardLoading && handleTripClick(trip.id)}
                style={{ cursor: isCardLoading ? 'wait' : 'pointer' }}
              >
                <div className="trip-card-top">
                  <h3>{trip.city}</h3>
                  <ExternalLink size={16} className="trip-card-icon" />
                </div>
                <div className="trip-card-details">
                  <span><CalendarDays size={14} /> {trip.days} {t('result.day')}</span>
                  <span><Wallet size={14} /> {t(`budget.${trip.budget}`, trip.budget)}</span>
                </div>
                {interests && Array.isArray(interests) && (
                  <div className="trip-interests">
                    {interests.map((i) => (
                      <span key={i} className="trip-interest-tag">#{i}</span>
                    ))}
                  </div>
                )}
                <div className="trip-card-footer">
                  {new Date(trip.created_at).toLocaleDateString('tr-TR')}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
