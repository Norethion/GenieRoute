import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database, Settings, ArrowRight } from 'lucide-react';

const ADMIN_MODULES = [
  {
    slug: 'cities',
    path: '/admin/cities',
    icon: Database,
    titleKey: 'admin.modules.citiesTitle',
    descKey: 'admin.modules.citiesDesc',
  },
];

export default function AdminHomePage() {
  const { t } = useTranslation();

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-title">
          <Settings size={20} />
          <h1>{t('admin.homeTitle')}</h1>
        </div>
      </header>
      <p className="admin-home-intro">{t('admin.homeIntro')}</p>

      <div className="admin-modules-grid">
        {ADMIN_MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link key={mod.slug} to={mod.path} className="admin-module-card">
              <div className="admin-module-icon">
                <Icon size={22} />
              </div>
              <div className="admin-module-body">
                <h3>{t(mod.titleKey)}</h3>
                <p>{t(mod.descKey)}</p>
              </div>
              <ArrowRight size={16} className="admin-module-arrow" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
