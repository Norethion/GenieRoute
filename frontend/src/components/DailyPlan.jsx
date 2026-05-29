import { useState } from 'react';
import { Lightbulb, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DayCard from './DayCard';

export default function DailyPlan({ plan, onActivityClick, activeDay: externalDay, onDayChange, weatherDayParts, tripStartDate }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';
  // Varsayılan: tüm günler görünümü (-1). Kullanıcı bir gün sekmesine tıklayınca o güne geçer.
  const [internalDay, setInternalDay] = useState(-1);
  const activeDay = externalDay !== undefined ? externalDay : internalDay;
  const setActiveDay = (day) => {
    setInternalDay(day);
    onDayChange?.(day);
  };

  if (!plan?.days?.length) return null;

  return (
    <div className="daily-plan">
      <div className="day-tabs">
        <button
          className={`day-tab day-tab-all ${activeDay < 0 ? 'active' : ''}`}
          onClick={() => setActiveDay(-1)}
        >
          <Calendar size={12} />
          {t('result.allDays')}
        </button>
        {plan.days.map((day, index) => (
          <button
            key={index}
            className={`day-tab ${activeDay === index ? 'active' : ''}`}
            onClick={() => setActiveDay(index)}
          >
            {t('result.day')} {day.day}
          </button>
        ))}
      </div>

      {activeDay >= 0 ? (
        <DayCard
          day={plan.days[activeDay]}
          onActivityClick={onActivityClick}
          dayWeather={Array.isArray(weatherDayParts) ? weatherDayParts[activeDay] : null}
          tripStartDate={tripStartDate}
          dayIndex={activeDay}
        />
      ) : (
        <div className="daily-plan-overview">
          <Calendar size={20} />
          <p>{t('result.allDaysHint')}</p>
        </div>
      )}

      {(() => {
        const tips = plan[`tips_${lang}`] || plan.tips_en || plan.tips || [];
        if (!tips.length) return null;
        return (
          <div className="tips-section">
            <div className="tips-header">
              <Lightbulb size={16} />
              <h4>{t('result.tips')}</h4>
            </div>
            <ul>
              {tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}
