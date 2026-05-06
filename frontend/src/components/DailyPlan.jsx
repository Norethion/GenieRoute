import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DayCard from './DayCard';

export default function DailyPlan({ plan, onActivityClick, activeDay: externalDay, onDayChange }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';
  const [internalDay, setInternalDay] = useState(0);
  const activeDay = externalDay !== undefined && externalDay >= 0 ? externalDay : internalDay;
  const setActiveDay = (day) => {
    setInternalDay(day);
    onDayChange?.(day);
  };

  if (!plan?.days?.length) return null;

  return (
    <div className="daily-plan">
      <div className="day-tabs">
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

      <DayCard day={plan.days[activeDay]} onActivityClick={onActivityClick} />

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
