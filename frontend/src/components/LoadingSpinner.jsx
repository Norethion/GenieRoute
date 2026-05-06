import { Search, Filter, Sparkles, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STEP_ICONS = [Search, Filter, Sparkles];

export default function LoadingSpinner({ message, currentStep = 0 }) {
  const { t } = useTranslation();

  const stateOf = (i) => (i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending');

  return (
    <div className="loading-container">
      <div className="loading-card">
        <div className="spinner"></div>
        <p className="loading-text">{message || t('loading.message')}</p>
        <div className="loading-steps">
          {STEP_ICONS.map((Icon, i) => {
            const state = stateOf(i);
            const RenderIcon = state === 'done' ? CheckCircle2 : Icon;
            return (
              <div key={i} className={`loading-step ${state}`}>
                <RenderIcon size={14} />
                <span>{t(`loading.step${i + 1}`)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
