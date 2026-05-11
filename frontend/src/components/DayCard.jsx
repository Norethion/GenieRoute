import { Sunrise, Sun, Sunset, UtensilsCrossed, Coffee, Sandwich } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

export default function DayCard({ day, onActivityClick }) {
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
        {day.activities.map((activity, index) => {
          // type='snack' önceliği — atıştırmalığın sandviç ikonu olur, time'a bakılmaz
          const Icon = TYPE_ICONS[activity.type] || TIME_ICONS[activity.time] || Sun;
          const desc = activity[`description_${lang}`] || activity.description_en || activity.description || '';
          return (
            <div
              key={index}
              className={`activity ${activity.type}`}
              onClick={() => onActivityClick?.(activity)}
            >
              <div className="activity-icon-wrapper">
                <Icon size={16} />
              </div>
              <div className="activity-content">
                <span className="activity-time">{t(`time.${activity.time}`, activity.time)}</span>
                <span className="activity-place">{activity.place}</span>
                <span className="activity-desc">{desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
