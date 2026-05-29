import { useState, useRef, useEffect, useMemo, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import DatePicker, { registerLocale } from 'react-datepicker';
import tr from 'date-fns/locale/tr';
import 'react-datepicker/dist/react-datepicker.css';
import {
  MapPin, Calendar, Wallet, Heart, Compass,
  ArrowRight, ArrowLeft, Sparkles,
} from 'lucide-react';
import worldCities from '../data/worldCities.json';
import { INTEREST_OPTIONS, INTENSITY_OPTIONS, TRANSPORT_OPTIONS } from '../data/tripOptions';

registerLocale('tr', tr);

// Türk diakritiklerini Latin karşılığına çevirir, "İstanbul" araması "Istanbul"u
// eşler. Replace toLowerCase'den ÖNCE yapılmalı: JS varsayılanı "İ".toLowerCase()
// "i̇" (i + combining dot, 2 codepoint) üretir, regex /İ/ ile yakalanmaz.
function foldDiacritics(s) {
  return s
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[ğĞ]/g, 'g')
    .toLowerCase();
}

// Anasayfada gösterilen popüler kartlar — isim + ülke kodu çiftleri
const POPULAR_CITY_PAIRS = [
  ['Istanbul', 'TR'],
  ['Antalya', 'TR'],
  ['Izmir', 'TR'],
  ['Ankara', 'TR'],
  ['Paris', 'FR'],
  ['Tokyo', 'JP'],
  ['Rome', 'IT'],
  ['Bangkok', 'TH'],
];

const DateInput = forwardRef(({ value, onClick, placeholder, disabled }, ref) => (
  <button type="button" className="date-input" onClick={onClick} ref={ref} disabled={disabled}>
    {value || <span className="date-input-placeholder">{placeholder}</span>}
  </button>
));

const STEPS = [
  { key: 'city', icon: MapPin },
  { key: 'duration', icon: Calendar },
  { key: 'budget', icon: Wallet },
  { key: 'style', icon: Compass },
  { key: 'interests', icon: Heart },
];

export default function TripForm({ onSubmit, isLoading, defaults }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  // Kayıtlı tercihler varsa form varsayılanlarını ön-doldur (şehir/tarih hariç).
  const [budget, setBudget] = useState(defaults?.dailyBudget || 'medium');
  const [intensity, setIntensity] = useState(defaults?.tripPace || defaults?.activityLevel || 'normal');
  const [transportMode, setTransportMode] = useState(
    Array.isArray(defaults?.transport) ? defaults.transport[0] : (defaults?.transport || 'mixed')
  );
  const [interests, setInterests] = useState(
    Array.isArray(defaults?.favoriteCategories) ? defaults.favoriteCategories : []
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  const isEn = i18n.language === 'en';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const diff = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  }, [startDate, endDate]);

  const maxEndDate = useMemo(() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    d.setDate(d.getDate() + 13);
    return d;
  }, [startDate]);

  const popularCities = useMemo(() => {
    return POPULAR_CITY_PAIRS
      .map(([name, country]) => {
        const folded = foldDiacritics(name);
        return worldCities.find(
          (c) => c.country === country && foldDiacritics(c.name) === folded
        );
      })
      .filter(Boolean);
  }, []);

  const filteredCities = useMemo(() => {
    if (city.trim().length === 0) return [];
    const query = foldDiacritics(city.trim());
    if (query.length === 0) return [];
    const matches = [];
    for (const c of worldCities) {
      const folded = foldDiacritics(c.name);
      if (folded.includes(query)) {
        matches.push({ city: c, starts: folded.startsWith(query) });
        if (matches.length >= 60) break;
      }
    }
    matches.sort((a, b) => {
      // Önce prefix match, sonra TR önceliği, sonra nüfus
      if (a.starts !== b.starts) return a.starts ? -1 : 1;
      const aTr = a.city.country === 'TR';
      const bTr = b.city.country === 'TR';
      if (aTr !== bTr) return aTr ? -1 : 1;
      return (b.city.pop || 0) - (a.city.pop || 0);
    });
    return matches.slice(0, 8).map((m) => m.city);
  }, [city]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectCity = (c) => {
    setCity(c.name);
    setShowSuggestions(false);
  };

  const toggleInterest = (value) => {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value]
    );
  };

  const canGoNext = () => {
    if (step === 0) return city.trim().length > 0;
    if (step === 1) return days >= 1 && days <= 14;
    if (step === 2) return true;
    if (step === 3) return true;
    if (step === 4) return interests.length > 0;
    return false;
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
    else {
      const fmt = (d) => d ? d.toISOString().split('T')[0] : undefined;
      onSubmit({
        city, days, budget, interests,
        intensity, transportMode,
        startDate: fmt(startDate), endDate: fmt(endDate),
      });
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && canGoNext()) {
      e.preventDefault();
      setShowSuggestions(false);
      handleNext();
    }
  };

  const budgetOptions = [
    { value: 'low', label: t('wizard.budget.low'), desc: t('wizard.budget.lowDesc') },
    { value: 'medium', label: t('wizard.budget.medium'), desc: t('wizard.budget.mediumDesc') },
    { value: 'high', label: t('wizard.budget.high'), desc: t('wizard.budget.highDesc') },
  ];

  return (
    <div className="wizard" onKeyDown={handleKeyDown}>
      <div className="wizard-progress">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <div className="wizard-step-dot">
                <Icon size={14} />
              </div>
              <span className="wizard-step-label">{t(`wizard.steps.${s.key}`)}</span>
              {i < STEPS.length - 1 && <div className="wizard-step-line" />}
            </div>
          );
        })}
      </div>

      <div className="wizard-content">
        {step === 0 && (
          <div className="wizard-panel" key="city">
            <h2 className="wizard-title">{t('wizard.city.title')}</h2>
            <p className="wizard-desc">{t('wizard.city.desc')}</p>

            <div className="popular-cities">
              <div className="popular-cities-label">
                {t('wizard.city.popular')}
              </div>
              <div className="popular-cities-grid">
                {popularCities.map((c) => (
                  <button
                    key={`${c.name}-${c.country}`}
                    className={`popular-city-btn ${city === c.name ? 'active' : ''}`}
                    onClick={() => selectCity(c)}
                    type="button"
                    disabled={isLoading}
                  >
                    <MapPin size={14} />
                    <span>{c.name}</span>
                    <span className="city-country-code">{c.country}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="city-input-wrapper">
              <MapPin size={20} className="city-input-icon" />
              <input
                ref={inputRef}
                type="text"
                className="city-input"
                placeholder={t('wizard.city.placeholder')}
                value={city}
                onChange={(e) => { setCity(e.target.value); setShowSuggestions(true); }}
                onFocus={() => { if (city.trim().length > 0) setShowSuggestions(true); }}
                autoFocus
                disabled={isLoading}
              />
              {showSuggestions && filteredCities.length > 0 && (
                <div className="city-suggestions" ref={suggestionsRef}>
                  {filteredCities.map((c) => (
                    <button
                      key={`${c.name}-${c.country}`}
                      className="city-suggestion"
                      onClick={() => selectCity(c)}
                      type="button"
                    >
                      <MapPin size={14} />
                      <span>{c.name}</span>
                      <span className="city-country-code">{c.country}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-panel" key="days">
            <h2 className="wizard-title">{t('wizard.days.title')}</h2>
            <p className="wizard-desc">{t('wizard.days.desc')}</p>
            <div className="date-range-picker">
              <div className="date-field">
                <label className="date-label">{t('wizard.days.startDate')}</label>
                <DatePicker
                  selected={startDate}
                  onChange={(date) => {
                    setStartDate(date);
                    if (endDate && date > endDate) setEndDate(null);
                  }}
                  minDate={today}
                  dateFormat={isEn ? 'MMM d, yyyy' : 'd MMMM yyyy'}
                  locale={isEn ? 'en' : 'tr'}
                  placeholderText={t('wizard.days.selectStartDate')}
                  customInput={<DateInput />}
                  disabled={isLoading}
                  popperPlacement="bottom-start"
                />
              </div>
              <div className="date-field">
                <label className="date-label">{t('wizard.days.endDate')}</label>
                <DatePicker
                  selected={endDate}
                  onChange={(date) => setEndDate(date)}
                  minDate={startDate || today}
                  maxDate={maxEndDate}
                  dateFormat={isEn ? 'MMM d, yyyy' : 'd MMMM yyyy'}
                  locale={isEn ? 'en' : 'tr'}
                  placeholderText={t('wizard.days.selectEndDate')}
                  customInput={<DateInput />}
                  disabled={isLoading || !startDate}
                  popperPlacement="bottom-start"
                />
              </div>
            </div>
            {days > 0 && (
              <div className="date-duration-badge">
                <Calendar size={14} />
                {t('wizard.days.duration', { count: days })}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-panel" key="budget">
            <h2 className="wizard-title">{t('wizard.budget.title')}</h2>
            <p className="wizard-desc">{t('wizard.budget.desc')}</p>
            <div className="budget-cards">
              {budgetOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`budget-card ${budget === opt.value ? 'active' : ''}`}
                  onClick={() => setBudget(opt.value)}
                  disabled={isLoading}
                >
                  <Wallet size={24} />
                  <span className="budget-card-label">{opt.label}</span>
                  <span className="budget-card-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-panel" key="style">
            <h2 className="wizard-title">{t('wizard.style.title')}</h2>
            <p className="wizard-desc">{t('wizard.style.desc')}</p>

            <div className="style-section">
              <div className="style-section-label">{t('wizard.style.intensity.title')}</div>
              <div className="style-options">
                {INTENSITY_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`style-card ${intensity === opt.value ? 'active' : ''}`}
                      onClick={() => setIntensity(opt.value)}
                      disabled={isLoading}
                    >
                      <Icon size={22} />
                      <span className="style-card-label">{t(`wizard.style.intensity.${opt.value}`)}</span>
                      <span className="style-card-desc">{t(`wizard.style.intensity.${opt.value}Desc`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="style-section">
              <div className="style-section-label">{t('wizard.style.transport.title')}</div>
              <div className="style-options">
                {TRANSPORT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`style-card ${transportMode === opt.value ? 'active' : ''}`}
                      onClick={() => setTransportMode(opt.value)}
                      disabled={isLoading}
                    >
                      <Icon size={22} />
                      <span className="style-card-label">{t(`wizard.style.transport.${opt.value}`)}</span>
                      <span className="style-card-desc">{t(`wizard.style.transport.${opt.value}Desc`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="wizard-panel" key="interests">
            <h2 className="wizard-title">{t('wizard.interests.title')}</h2>
            <p className="wizard-desc">{t('wizard.interests.desc')}</p>
            <div className="interest-grid">
              {INTEREST_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    className={`interest-card ${interests.includes(opt.value) ? 'active' : ''}`}
                    onClick={() => toggleInterest(opt.value)}
                    disabled={isLoading}
                  >
                    <Icon size={22} />
                    <span>{t(`wizard.interests.${opt.key}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="wizard-nav">
        {step > 0 && (
          <button className="btn-back" onClick={handleBack} disabled={isLoading}>
            <ArrowLeft size={16} />
            {t('wizard.back')}
          </button>
        )}
        <div className="wizard-nav-spacer" />
        <button
          className={`btn-next ${step === 4 ? 'btn-generate' : ''}`}
          onClick={handleNext}
          disabled={!canGoNext() || isLoading}
        >
          {step === 4 ? (
            <>
              <Sparkles size={16} />
              {isLoading ? t('wizard.generating') : t('wizard.generate')}
            </>
          ) : (
            <>
              {t('wizard.next')}
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
