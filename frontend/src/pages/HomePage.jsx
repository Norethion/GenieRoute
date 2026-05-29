import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TripForm from '../components/TripForm';
import FeaturedRoutes from '../components/FeaturedRoutes';
import LoadingSpinner from '../components/LoadingSpinner';
import { generatePlanWithProgress } from '../services/api';
import { usePreferences } from '../hooks/usePreferences';

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const { prefs, loading: prefsLoading } = usePreferences();
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const runGeneration = async (formData, onSuccess) => {
    setIsLoading(true);
    setCurrentStep(0);
    setError(null);
    try {
      const result = await generatePlanWithProgress(
        { ...formData, language: i18n.language },
        (step) => setCurrentStep(step),
      );
      onSuccess?.(result);
      // Son tikin görünmesi için kısa bekleme
      setTimeout(() => navigate('/result', { state: { result } }), 320);
    } catch (err) {
      setError(err.response?.data?.error || t('error.generic'));
      setIsLoading(false);
      setCurrentStep(0);
    }
  };

  const handleSubmit = (formData) => runGeneration(formData);

  const handleRouteSelect = async (route) => {
    const cacheKey = `route_cache_${route.slug}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const result = JSON.parse(cached);
        navigate('/result', { state: { result } });
        return;
      } catch { /* ignore parse errors, regenerate */ }
    }

    const formData = {
      city: route.city,
      days: route.days,
      budget: route.budget,
      interests: route.interests,
    };
    runGeneration(formData, (result) => {
      sessionStorage.setItem(cacheKey, JSON.stringify(result));
    });
  };

  return (
    <div className="home-page">
      <div className="hero">
        <h1 className="hero-title">
          <span className="hero-badge">
            <Sparkles size={10} />
            {t('hero.badge')}
          </span>
          {t('hero.title1')}
          <span className="hero-accent"> {t('hero.title2')}</span>
        </h1>
        <p className="hero-subtitle">{t('hero.subtitle')}</p>
      </div>

      {error && <div className="error-message"><span>{error}</span></div>}

      {isLoading ? (
        <LoadingSpinner currentStep={currentStep} />
      ) : (
        <>
          <TripForm key={prefsLoading ? 'np' : 'p'} onSubmit={handleSubmit} isLoading={isLoading} defaults={prefs} />
          <FeaturedRoutes onRouteSelect={handleRouteSelect} />
          <p className="attribution-note">{t('attribution.cities')}</p>
        </>
      )}
    </div>
  );
}
