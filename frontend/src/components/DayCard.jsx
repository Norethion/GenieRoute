import { Sunrise, Sun, Sunset, UtensilsCrossed, Coffee, Sandwich, AlertTriangle, Navigation, Footprints, Car, Bus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDayPart, getWeatherIcon } from '../data/weatherIcons';

// Bacak ulaşım modu → ikon + etiket anahtarı. 'motor' = mixed modun uzun (araç/taşıt) bacağı.
const TRAVEL_MODE_META = {
  walking: { Icon: Footprints, key: 'result.travelWalk' },
  transit: { Icon: Bus, key: 'result.travelTransit' },
  car: { Icon: Car, key: 'result.travelCar' },
  motor: { Icon: Car, key: 'result.travelMotor' },
};

const TIME_ICONS = {
  morning: Sunrise,
  'mid-morning': Sun,
  lunch: Coffee,
  afternoon: Sun,
  'late-afternoon': Sun,
  dinner: UtensilsCrossed,
  evening: Sunset,
};

const TYPE_ICONS = {
  snack: Sandwich,
};

export default function DayCard({ day, onActivityClick, dayWeather }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';

  const dayTitle = day[`title_${lang}`] || day.title_en || day.title || '';

  return (
    <div className="day-card">
      <div className="day-header">
        <span className="day-number">{t('result.day')} {day.day}</span>
        <span className="day-title">{dayTitle}</span>
      </div>
      <div className="activities">
        {(day.activities || []).map((activity, index) => {
          // type='snack' önceliği — atıştırmalığın sandviç ikonu olur, time'a bakılmaz
          const Icon = TYPE_ICONS[activity.type] || TIME_ICONS[activity.time] || Sun;
          const desc = activity[`description_${lang}`] || activity.description_en || activity.description || '';
          // Hava rozeti: zaman dilimine karşılık gelen gün-parçası tahmini.
          const part = dayWeather?.[getDayPart(activity.time)];
          const WeatherIcon = part ? getWeatherIcon(part.weatherCode) : null;
          // Kapalı mekan değilse ve dilim yağmurluysa uyarı göster
          const warnOutdoor = part?.avoidOutdoor && activity.environment !== 'indoor' && activity.type !== 'restaurant';
          return (
            <div key={index}>
              {/* Duraklar-arası seyahat süresi rozeti (ilk durakta yok) — modu da gösterir */}
              {activity.travelFromPrevMin != null && (() => {
                const meta = TRAVEL_MODE_META[activity.travelMode];
                const TravelIcon = meta?.Icon || Navigation;
                return (
                  <div className="activity-travel">
                    <TravelIcon size={11} /> ~{activity.travelFromPrevMin} {t('result.minShort', 'dk')}
                    {meta && <span className="activity-travel-mode">· {t(meta.key)}</span>}
                  </div>
                );
              })()}
              <div
                className={`activity ${activity.type}`}
                onClick={() => onActivityClick?.(activity)}
              >
              <div className="activity-icon-wrapper">
                <Icon size={16} />
              </div>
              <div className="activity-content">
                <div className="activity-time-row">
                  <span className="activity-time">{t(`time.${activity.time}`, activity.time)}</span>
                  {activity.arrival && activity.departure && (
                    <span className="activity-clock">{activity.arrival}–{activity.departure}</span>
                  )}
                  {part && WeatherIcon && (
                    <span
                      className={`activity-weather-badge${warnOutdoor ? ' avoid-outdoor' : ''}`}
                      title={`${part.precipProb}% ${t('result.rainProb', 'rain')}`}
                    >
                      <WeatherIcon size={12} />
                      {warnOutdoor && (
                        <span className="activity-weather-warn">
                          <AlertTriangle size={11} /> {t('result.avoidOutdoor')}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <span className="activity-place">{activity.place}</span>
                <span className="activity-desc">{desc}</span>
              </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
