import { useState } from 'react';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../hooks/usePreferences';
import { INTEREST_OPTIONS, INTENSITY_OPTIONS, TRANSPORT_OPTIONS } from '../data/tripOptions';
import Toast from '../components/Toast';

// Yeni (TripForm'da olmayan) seçenek listeleri — i18n preferences.* altında.
const TRAVEL_STYLE = ['relaxed', 'balanced', 'adventurous', 'cultural', 'luxury'];
const BUDGET_LEVELS = ['low', 'medium', 'high'];
const CUISINES = ['turkish', 'italian', 'asian', 'seafood', 'vegetarian', 'streetfood', 'finedining'];
const DIETARY = ['vegan', 'vegetarian', 'halal', 'glutenFree', 'lactoseFree', 'nutAllergy'];
const ACCESSIBILITY = ['wheelchair', 'lowMobility', 'visual', 'hearing', 'strollerFriendly'];
const ACCOMMODATION = ['hotel', 'boutique', 'hostel', 'apartment', 'resort'];
const LANGUAGES = ['tr', 'en', 'de', 'fr', 'es', 'ar', 'ru'];

function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`pref-chip${active ? ' active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export default function PreferencesPage() {
  const { t } = useTranslation();
  const { prefs, save, loading } = usePreferences();
  const [draft, setDraft] = useState({});
  const [previousPrefs, setPreviousPrefs] = useState(prefs);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  if (prefs !== previousPrefs) {
    setPreviousPrefs(prefs);
    if (prefs) setDraft(prefs);
  }

  const toggleMulti = (key, value) => {
    setDraft((d) => {
      const list = Array.isArray(d[key]) ? d[key] : [];
      const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
      return { ...d, [key]: next };
    });
    setDirty(true);
  };

  const setSingle = (key, value) => {
    setDraft((d) => ({ ...d, [key]: d[key] === value ? undefined : value }));
    setDirty(true);
  };

  const hasMulti = (key, value) => Array.isArray(draft[key]) && draft[key].includes(value);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(draft);
      setDirty(false);
      setToast({ message: t('preferences.saved'), type: 'success' });
    } catch {
      setToast({ message: t('preferences.saveError'), type: 'error' });
    } finally {
      setSaving(false);
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
    <div className="preferences-page">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="saved-header">
        <h2>{t('preferences.title')}</h2>
      </div>
      <p className="wizard-desc">{t('preferences.subtitle')}</p>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.travelStyle.title')}</div>
        <div className="pref-options">
          {TRAVEL_STYLE.map((v) => (
            <Chip key={v} active={draft.travelStyle === v} onClick={() => setSingle('travelStyle', v)}>
              {t(`preferences.travelStyle.${v}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.favoriteCategories.title')}</div>
        <div className="pref-options">
          {INTEREST_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Chip key={opt.value} active={hasMulti('favoriteCategories', opt.value)} onClick={() => toggleMulti('favoriteCategories', opt.value)}>
                <Icon size={14} /> {t(`wizard.interests.${opt.key}`)}
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.dailyBudget.title')}</div>
        <div className="pref-options">
          {BUDGET_LEVELS.map((v) => (
            <Chip key={v} active={draft.dailyBudget === v} onClick={() => setSingle('dailyBudget', v)}>
              {t(`budget.${v}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.activityLevel.title')}</div>
        <div className="pref-options">
          {INTENSITY_OPTIONS.map((opt) => (
            <Chip key={opt.value} active={draft.activityLevel === opt.value} onClick={() => setSingle('activityLevel', opt.value)}>
              {t(`wizard.style.intensity.${opt.value}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.cuisines.title')}</div>
        <div className="pref-options">
          {CUISINES.map((v) => (
            <Chip key={v} active={hasMulti('cuisines', v)} onClick={() => toggleMulti('cuisines', v)}>
              {t(`preferences.cuisines.${v}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.dietary.title')}</div>
        <div className="pref-options">
          {DIETARY.map((v) => (
            <Chip key={v} active={hasMulti('dietary', v)} onClick={() => toggleMulti('dietary', v)}>
              {t(`preferences.dietary.${v}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.accessibility.title')}</div>
        <div className="pref-options">
          {ACCESSIBILITY.map((v) => (
            <Chip key={v} active={hasMulti('accessibility', v)} onClick={() => toggleMulti('accessibility', v)}>
              {t(`preferences.accessibility.${v}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.tripPace.title')}</div>
        <div className="pref-options">
          {INTENSITY_OPTIONS.map((opt) => (
            <Chip key={opt.value} active={draft.tripPace === opt.value} onClick={() => setSingle('tripPace', opt.value)}>
              {t(`wizard.style.intensity.${opt.value}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.accommodation.title')}</div>
        <div className="pref-options">
          {ACCOMMODATION.map((v) => (
            <Chip key={v} active={hasMulti('accommodation', v)} onClick={() => toggleMulti('accommodation', v)}>
              {t(`preferences.accommodation.${v}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.transport.title')}</div>
        <div className="pref-options">
          {TRANSPORT_OPTIONS.map((opt) => (
            <Chip key={opt.value} active={hasMulti('transport', opt.value)} onClick={() => toggleMulti('transport', opt.value)}>
              {t(`wizard.style.transport.${opt.value}`)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="pref-section">
        <div className="pref-section-title">{t('preferences.languages.title')}</div>
        <div className="pref-options">
          {LANGUAGES.map((v) => (
            <Chip key={v} active={hasMulti('languages', v)} onClick={() => toggleMulti('languages', v)}>
              {t(`preferences.languages.${v}`)}
            </Chip>
          ))}
        </div>
      </div>

      <button className="btn-next pref-save-btn" onClick={handleSave} disabled={!dirty || saving}>
        <Save size={16} />
        {saving ? t('result.saving') : t('preferences.save')}
      </button>
    </div>
  );
}
