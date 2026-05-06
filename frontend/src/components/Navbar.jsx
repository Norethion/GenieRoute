import { Link, useLocation } from 'react-router-dom';
import { Map, Bookmark, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

export default function Navbar() {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const currentLang = i18n.language;

  const switchLanguage = () => {
    const newLang = currentLang === 'tr' ? 'en' : 'tr';
    i18n.changeLanguage(newLang);
    localStorage.setItem('genieroute-lang', newLang);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand">
          <Map size={24} strokeWidth={2.5} />
          <span className="brand-text">GenieRoute</span>
        </Link>
        <div className="navbar-right">
          <div className="navbar-links">
            <Link to="/" className={`nav-link ${location.pathname === '/' ? 'nav-active' : ''}`}>
              <Map size={16} />
              {t('nav.explore')}
            </Link>
            <Link to="/saved" className={`nav-link ${location.pathname === '/saved' ? 'nav-active' : ''}`}>
              <Bookmark size={16} />
              {t('nav.saved')}
            </Link>
          </div>
          <button className="lang-toggle" onClick={switchLanguage} title="Switch language">
            {currentLang === 'tr' ? 'EN' : 'TR'}
          </button>
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </div>
    </nav>
  );
}
