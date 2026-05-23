import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { getAdminCities } from '../services/api';

// Cache timestamp'leri DB'de UTC tutulur; admin paneli geliştirici aracı
// olduğu için Türkiye saatinde gösterilir (tarayıcı saat dilimine bağlı kalmaz).
function formatDate(iso, locale) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Istanbul',
    });
  } catch {
    return iso;
  }
}

// Cache rolling cap: 200 sample. ok = median istatistiksel olarak güvenli sayılır
// (≥25), stable = doygunluğa yakın (≥50). Aşağıda hem badge sınıfı hem ikon
// seçimi bu eşiği kullanır.
const OK_THRESHOLD = 25;
const STABLE_THRESHOLD = 50;

function badgeClass(count) {
  if (count >= STABLE_THRESHOLD) return 'sample-badge stable';
  if (count >= OK_THRESHOLD) return 'sample-badge ok';
  return 'sample-badge low';
}

function formatMoney(amount, currency, locale) {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency || ''}`;
  }
}

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminCities();
      setData(result);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-title">
          <Database size={20} />
          <h1>{t('admin.title')}</h1>
        </div>
        <button className="admin-refresh-btn" onClick={load} disabled={loading} type="button">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          {t('admin.refresh')}
        </button>
      </header>

      {error && (
        <div className="admin-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading && !data && (
        <div className="admin-loading">{t('admin.loading')}</div>
      )}

      {data && (
        <>
          <section className="admin-summary">
            <div className="admin-stat">
              <span className="admin-stat-label">{t('admin.totalPriceRows')}</span>
              <span className="admin-stat-value">{data.summary.totalPriceRows}</span>
            </div>
            <div className="admin-stat">
              <span className="admin-stat-label">{t('admin.totalTipsRows')}</span>
              <span className="admin-stat-value">{data.summary.totalTipsRows}</span>
            </div>
            <div className="admin-stat">
              <span className="admin-stat-label">{t('admin.totalSamples')}</span>
              <span className="admin-stat-value">{data.summary.totalSamples}</span>
            </div>
          </section>

          <section className="admin-section">
            <h2 className="admin-section-title">{t('admin.pricesTitle')}</h2>
            {data.prices.length === 0 ? (
              <p className="admin-empty">{t('admin.empty')}</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('admin.col.city')}</th>
                      <th>{t('admin.col.country')}</th>
                      <th>{t('admin.col.currency')}</th>
                      <th>{t('admin.col.budget')}</th>
                      <th>{t('admin.col.samples')}</th>
                      <th>{t('admin.col.median')}</th>
                      <th>{t('admin.col.range')}</th>
                      <th>{t('admin.col.updated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.prices.map((row) => (
                      <tr key={`${row.cityKey}-${row.budgetLevel}`}>
                        <td>{row.cityDisplay || row.cityKey}</td>
                        <td>{row.countryCode || '—'}</td>
                        <td>{row.currencyCode || '—'}</td>
                        <td><span className={`budget-tag ${row.budgetLevel}`}>{t(`budget.${row.budgetLevel}`)}</span></td>
                        <td>
                          <span className={badgeClass(row.sampleCount)}>
                            {row.sampleCount >= OK_THRESHOLD ? <CheckCircle size={11} /> : <Clock size={11} />}
                            {row.sampleCount}
                          </span>
                        </td>
                        <td>{formatMoney(row.median, row.currencyCode, locale)}</td>
                        <td className="admin-range-cell">
                          {row.range
                            ? `${formatMoney(row.range.min, row.currencyCode, locale)} – ${formatMoney(row.range.max, row.currencyCode, locale)}`
                            : '—'}
                        </td>
                        <td className="admin-date">{formatDate(row.updatedAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-section">
            <h2 className="admin-section-title">{t('admin.tipsTitle')}</h2>
            {data.tips.length === 0 ? (
              <p className="admin-empty">{t('admin.empty')}</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('admin.col.city')}</th>
                      <th>{t('admin.col.country')}</th>
                      <th>{t('admin.col.samples')}</th>
                      <th>{t('admin.col.categories')}</th>
                      <th>{t('admin.col.updated')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tips.map((row) => (
                      <tr key={row.cityKey}>
                        <td>{row.cityDisplay || row.cityKey}</td>
                        <td>{row.countryCode || '—'}</td>
                        <td>
                          <span className={badgeClass(row.sampleCount)}>
                            {row.sampleCount >= OK_THRESHOLD ? <CheckCircle size={11} /> : <Clock size={11} />}
                            {row.sampleCount}
                          </span>
                        </td>
                        <td className="admin-categories">
                          {(row.categoriesEn.length ? row.categoriesEn : row.categoriesTr).join(', ') || '—'}
                        </td>
                        <td className="admin-date">{formatDate(row.updatedAt, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
