import { Component } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// useTranslation class component'te kullanilamaz; mesajlari render eden kucuk
// fonksiyonel alt bilesen i18n'i burada cozer.
function ErrorFallback({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="error-boundary">
      <AlertTriangle size={48} strokeWidth={1.5} />
      <h2>{t('errorBoundary.title')}</h2>
      <p>{t('errorBoundary.message')}</p>
      <div className="error-boundary-actions">
        <button type="button" className="btn-next" onClick={onRetry}>
          <RotateCcw size={16} />
          {t('errorBoundary.retry')}
        </button>
        <a href="/" className="btn-back">
          <Home size={16} />
          {t('errorBoundary.home')}
        </a>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary yakaladi:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
