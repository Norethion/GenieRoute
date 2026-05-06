import { UtensilsCrossed, Bus, Ticket, Hotel, Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function BudgetSummary({ budget }) {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';

  if (!budget) return null;

  const labels = {
    tr: {
      title: 'Tahmini Bütçe',
      daily: 'Günlük Döküm',
      meals: 'Yemek (3 öğün)',
      transport: 'Ulaşım',
      activities: 'Müze & Aktivite',
      accommodation: 'Konaklama',
      dailyTotal: 'Günlük Toplam',
      total: 'Toplam Tahmini Maliyet',
      days: 'gün',
      note: 'Fiyatlar tahminidir ve değişiklik gösterebilir.',
    },
    en: {
      title: 'Budget Estimate',
      daily: 'Daily Breakdown',
      meals: 'Meals (3 per day)',
      transport: 'Transportation',
      activities: 'Museums & Activities',
      accommodation: 'Accommodation',
      dailyTotal: 'Daily Total',
      total: 'Total Estimated Cost',
      days: 'days',
      note: 'Prices are estimates and may vary.',
    },
  };

  const t = labels[lang];

  const formatTRY = (amount) => `₺${amount.toLocaleString('tr-TR')}`;

  return (
    <div className="budget-summary">
      <div className="budget-summary-header">
        <Calculator size={18} />
        <h3>{t.title}</h3>
      </div>

      <div className="budget-breakdown">
        <div className="budget-row">
          <span className="budget-row-label"><UtensilsCrossed size={14} /> {t.meals}</span>
          <span className="budget-row-value">{formatTRY(budget.daily.meals)}</span>
        </div>
        <div className="budget-row">
          <span className="budget-row-label"><Bus size={14} /> {t.transport}</span>
          <span className="budget-row-value">{formatTRY(budget.daily.transport)}</span>
        </div>
        <div className="budget-row">
          <span className="budget-row-label"><Ticket size={14} /> {t.activities}</span>
          <span className="budget-row-value">{formatTRY(budget.daily.activities)}</span>
        </div>
        <div className="budget-row">
          <span className="budget-row-label"><Hotel size={14} /> {t.accommodation}</span>
          <span className="budget-row-value">{formatTRY(budget.daily.accommodation)}</span>
        </div>
        <div className="budget-row budget-row-total">
          <span className="budget-row-label">{t.dailyTotal}</span>
          <span className="budget-row-value">{formatTRY(budget.daily.total)}</span>
        </div>
      </div>

      <div className="budget-total">
        <div className="budget-total-label">{t.total} ({budget.days} {t.days})</div>
        <div className="budget-total-amounts">
          <span className="budget-amount-primary">{formatTRY(budget.total.try)}</span>
          <span className="budget-amount-secondary">${budget.total.usd}</span>
          <span className="budget-amount-secondary">€{budget.total.eur}</span>
        </div>
      </div>

      <p className="budget-note">{t.note}</p>
    </div>
  );
}
