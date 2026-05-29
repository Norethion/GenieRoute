import { Phone, Banknote, Bus, Landmark, UtensilsCrossed, CloudSun, Thermometer, Droplets } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const TIP_CONFIG = [
  { key: 'emergency', icon: Phone },
  { key: 'currency', icon: Banknote },
  { key: 'transport', icon: Bus },
  { key: 'culture', icon: Landmark },
  { key: 'food', icon: UtensilsCrossed },
];

function formatDate(dateStr, lang) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function CityTips({ tips, weather }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';

  const localizedTips = tips ? (tips[lang] || tips.en || tips) : null;

  if (!localizedTips && !weather) return null;

  return (
    <div className="city-tips">
      <div className="city-tips-header">
        <Landmark size={18} />
        <h3>{t('tips.title')}</h3>
      </div>

      {weather && weather.length > 0 && (
        <div className="weather-section">
          <div className="weather-header">
            <CloudSun size={16} />
            <span>{t('tips.weather')}</span>
          </div>
          <div className="weather-grid">
            {weather.map((day) => (
              <div key={day.date} className="weather-day-card">
                <span className="weather-date">{formatDate(day.date, lang)}</span>
                <div className="weather-temps">
                  <span className="weather-temp-max">
                    <Thermometer size={12} /> {Math.round(day.tempMax)}°
                  </span>
                  <span className="weather-temp-min">
                    {Math.round(day.tempMin)}°
                  </span>
                </div>
                {day.precipitation > 0 && (
                  <span className="weather-rain">
                    <Droplets size={11} /> {day.precipitation.toFixed(1)}mm
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {localizedTips && (
        <div className="city-tips-grid">
          {TIP_CONFIG.map((tipItem) => {
            if (!localizedTips[tipItem.key]) return null;
            const TipIcon = tipItem.icon;
            return (
              <div key={tipItem.key} className="city-tip-card">
                <div className="city-tip-icon">
                  <TipIcon size={16} />
                </div>
                <div className="city-tip-content">
                  <span className="city-tip-label">{t(`tips.${tipItem.key}`)}</span>
                  <p className="city-tip-text">{localizedTips[tipItem.key]}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
