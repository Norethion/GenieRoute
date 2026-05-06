import { useState, useRef, useEffect, useMemo, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import DatePicker, { registerLocale } from 'react-datepicker';
import tr from 'date-fns/locale/tr';
import 'react-datepicker/dist/react-datepicker.css';
import {
  MapPin, Calendar, Wallet, Heart,
  Landmark, UtensilsCrossed, TreePine, Palette,
  ShoppingBag, Moon, Drama, BookOpen,
  Waves, Droplets, Coffee, Mountain,
  ArrowRight, ArrowLeft, Sparkles
} from 'lucide-react';
import TURKEY_CITIES from '../data/turkeyCities';

registerLocale('tr', tr);

const DateInput = forwardRef(({ value, onClick, placeholder, disabled }, ref) => (
  <button type="button" className="date-input" onClick={onClick} ref={ref} disabled={disabled}>
    {value || <span className="date-input-placeholder">{placeholder}</span>}
  </button>
));

const INTEREST_OPTIONS = [
  { value: 'history', key: 'history', icon: Landmark },
  { value: 'food', key: 'food', icon: UtensilsCrossed },
  { value: 'nature', key: 'nature', icon: TreePine },
  { value: 'museum', key: 'museum', icon: Palette },
  { value: 'shopping', key: 'shopping', icon: ShoppingBag },
  { value: 'nightlife', key: 'nightlife', icon: Moon },
  { value: 'art', key: 'art', icon: Drama },
  { value: 'culture', key: 'culture', icon: BookOpen },
  { value: 'ottoman', key: 'ottoman', icon: Landmark },
  { value: 'beach', key: 'beach', icon: Waves },
  { value: 'thermal', key: 'thermal', icon: Droplets },
  { value: 'cuisine', key: 'cuisine', icon: Coffee },
  { value: 'bazaar', key: 'bazaar', icon: ShoppingBag },
  { value: 'hiking', key: 'hiking', icon: Mountain },
];

const STEPS = [
  { key: 'city', icon: MapPin },
  { key: 'duration', icon: Calendar },
  { key: 'budget', icon: Wallet },
  { key: 'interests', icon: Heart },
];

export default function TripForm({ onSubmit, isLoading }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [budget, setBudget] = useState('medium');
  const [interests, setInterests] = useState([]);
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

  const popularCities = useMemo(() => TURKEY_CITIES.filter((c) => c.popular), []);

  const filteredCities = useMemo(() => {
    if (city.trim().length === 0) return [];
    const query = city.toLowerCase();
    return TURKEY_CITIES.filter(
      (c) => c.name.toLowerCase().includes(query) || c.nameEn.toLowerCase().includes(query)
    ).slice(0, 5);
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
    setCity(isEn ? c.nameEn : c.name);
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
    if (step === 3) return interests.length > 0;
    return false;
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else {
      const fmt = (d) => d ? d.toISOString().split('T')[0] : undefined;
      onSubmit({ city, days, budget, interests, startDate: fmt(startDate), endDate: fmt(endDate) });
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
                {isEn ? 'Popular Destinations' : 'Popüler Şehirler'}
              </div>
              <div className="popular-cities-grid">
                {popularCities.map((c) => (
                  <button
                    key={c.name}
                    className={`popular-city-btn ${city === (isEn ? c.nameEn : c.name) ? 'active' : ''}`}
                    onClick={() => selectCity(c)}
                    type="button"
                    disabled={isLoading}
                  >
                    <MapPin size={14} />
                    <span>{isEn ? c.nameEn : c.name}</span>
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
                      key={c.name}
                      className="city-suggestion"
                      onClick={() => selectCity(c)}
                      type="button"
                    >
                      <MapPin size={14} />
                      <span>{isEn ? c.nameEn : c.name}</span>
                      {c.popular && <span className="popular-badge">{isEn ? 'Popular' : 'Popüler'}</span>}
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
                  placeholderText={isEn ? 'Select start date' : 'Başlangıç tarihi seç'}
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
                  placeholderText={isEn ? 'Select end date' : 'Bitiş tarihi seç'}
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
          className={`btn-next ${step === 3 ? 'btn-generate' : ''}`}
          onClick={handleNext}
          disabled={!canGoNext() || isLoading}
        >
          {step === 3 ? (
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
