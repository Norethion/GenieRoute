import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, RefreshCw, AlertCircle, Cpu, Cloud, Info } from 'lucide-react';
import { getOpenAIUsage, getGoogleCloudUsage } from '../services/api';

const RANGES = ['24h', '7d', '30d', 'all'];
const CACHE_PREFIX = 'genieroute-usage-cache:';

function formatUSD(amount, locale) {
  if (amount == null || !Number.isFinite(amount)) return '—';
  if (amount === 0) return '$0.00';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: amount < 1 ? 4 : 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(4)}`;
  }
}

function formatNumber(n, locale) {
  if (n == null || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}

function safeNum(v) {
  if (!Number.isFinite(v)) return 0;
  if (Math.abs(v) < 1e-6) return 0;
  return v;
}

function formatDate(iso, locale, short = true) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return short
      ? d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
      : d.toLocaleString(locale);
  } catch {
    return iso;
  }
}

function formatRelative(iso, t, locale) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t('usage.relative.justNow');
  const min = Math.floor(ms / 60_000);
  if (min < 60) return t('usage.relative.minutes', { count: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('usage.relative.hours', { count: h });
  return formatDate(iso, locale, false);
}

// localStorage erişimi quota/private mode'da exception atabilir; sessizce yut.
function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      data,
      fetchedAt: new Date().toISOString(),
    }));
  } catch { /* quota or disabled */ }
}

// Stale-while-revalidate: cache varsa hemen göster + arka planda fetch.
// force artarsa cache'i bypass eder (refresh butonu).
function useUsageData(cacheKey, fetcher, range, force) {
  const [state, setState] = useState(() => {
    const c = readCache(cacheKey);
    return c?.data
      ? { loading: false, data: c.data, error: null, fetchedAt: c.fetchedAt, fromCache: true }
      : { loading: true, data: null, error: null, fetchedAt: null, fromCache: false };
  });
  const prevKey = useRef(cacheKey);
  const prevForce = useRef(force);

  useEffect(() => {
    let cancelled = false;
    const cached = readCache(cacheKey);
    const keyChanged = prevKey.current !== cacheKey;
    const forceChanged = prevForce.current !== force;
    prevKey.current = cacheKey;
    prevForce.current = force;

    if (cached?.data && !force) {
      // Önbellekteki veriyi anında göster (veri-fetch efekti, harici sync — perf riski yok).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({
        loading: false,
        data: cached.data,
        error: null,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
      });
    } else if (keyChanged || forceChanged) {
      // Yeni range veya explicit refresh — eski veriyi temizle ki skeleton
      // slot'ları görünür ve kullanıcı yenilemenin başladığını anlasın.
      setState({ loading: true, data: null, error: null, fetchedAt: null, fromCache: false });
    } else {
      // İlk render veya başka tetik — eski veriyi koruyup loading bayrağı set et.
      setState((s) => ({ ...s, loading: true, error: null }));
    }

    fetcher(range)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok === false) {
          setState((s) => ({
            ...s,
            loading: false,
            error: res.error || 'Error',
          }));
        } else {
          writeCache(cacheKey, res.data);
          setState({
            loading: false,
            data: res.data,
            error: null,
            fetchedAt: new Date().toISOString(),
            fromCache: false,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err.message || 'Network error',
        }));
      });

    return () => { cancelled = true; };
  }, [cacheKey, range, force, fetcher]);

  return state;
}

function BarChart({ data, color, formatValue, locale, dense }) {
  const [hover, setHover] = useState(null);
  if (!data || data.length === 0) return null;

  const values = data.map((d) => safeNum(d.value));
  const max = Math.max(...values, 1e-9);
  const allZero = values.every((v) => v === 0);

  // X-axis kalabalığını önlemek için sadece uç + orta noktaları etiketle.
  const labelIndices = new Set([0, data.length - 1]);
  if (data.length >= 5) labelIndices.add(Math.floor(data.length / 2));
  if (data.length >= 9) {
    labelIndices.add(Math.floor(data.length / 4));
    labelIndices.add(Math.floor((3 * data.length) / 4));
  }

  const chartStyle = {
    '--chart-color': color,
    '--chart-color-soft': `${color}aa`,
  };

  return (
    <div className={`usage-chart${dense ? ' is-dense' : ''}`} style={chartStyle}>
      <div className="usage-chart-bars">
        {data.map((d, i) => {
          const v = values[i];
          const heightPct = allZero ? 0 : (v / max) * 100;
          const isHover = hover === i;
          const dimmed = hover !== null && !isHover;
          return (
            <div
              key={i}
              className={
                'usage-chart-cell' +
                (isHover ? ' is-hover' : '') +
                (dimmed ? ' is-dim' : '')
              }
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div
                className="usage-chart-fill"
                style={{
                  height: `${heightPct}%`,
                  minHeight: v > 0 ? 2 : 0,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="usage-chart-axis">
        {data.map((d, i) => (
          <span key={i}>{labelIndices.has(i) ? formatDate(d.date, locale) : ''}</span>
        ))}
      </div>

      {hover !== null && (
        <div
          className="usage-tooltip"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
        >
          <div className="usage-tooltip-date">{formatDate(data[hover].date, locale)}</div>
          <div className="usage-tooltip-value">{formatValue(values[hover])}</div>
        </div>
      )}
    </div>
  );
}

function SkBox({ w = '100%', h = 14, style }) {
  return (
    <span
      className="skeleton"
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        ...style,
      }}
    />
  );
}

function SkeletonStats() {
  return (
    <section className="admin-summary usage-skeleton-stats">
      {[0, 1].map((i) => (
        <div key={i} className="admin-stat usage-skeleton-stat">
          <SkBox w={70} h={9} />
          <SkBox w={'70%'} h={22} />
          <SkBox w={'50%'} h={9} />
        </div>
      ))}
    </section>
  );
}

// Gerçek BarChart yapısını taklit eder — render'da layout zıplaması olmasın.
function SkeletonChart({ bars = 14 }) {
  // Math.sin ile deterministik yükseklikler (render'da titremesin).
  const seed = (i) => 0.35 + 0.6 * Math.abs(Math.sin((i + 1) * 1.7));
  return (
    <div className="usage-section">
      <SkBox w={120} h={10} style={{ marginBottom: 6 }} />
      <div className="usage-skeleton-chart-bars">
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className="skeleton"
            style={{
              flex: 1,
              height: `${Math.round(seed(i) * 100)}%`,
              borderRadius: '4px 4px 0 0',
            }}
          />
        ))}
      </div>
      <div className="usage-skeleton-chart-axis">
        <SkBox w={28} h={8} />
        <SkBox w={28} h={8} />
      </div>
    </div>
  );
}

function SkeletonTable({ rows = 3, cols = 3 }) {
  return (
    <div className="admin-table-wrap usage-section">
      <table className="admin-table">
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, c) => (
              <th key={c}><SkBox w={'60%'} h={9} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}><SkBox w={c === 0 ? '85%' : '50%'} h={11} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorBlock({ error, hint }) {
  return (
    <div className="admin-error" role="alert">
      <AlertCircle size={16} />
      <div>
        <div>{error}</div>
        {hint && <div className="usage-stat-extra">{hint}</div>}
      </div>
    </div>
  );
}

function FreeTierNote({ text }) {
  return (
    <div className="usage-note">
      <Info size={14} />
      <span className="usage-note-text">{text}</span>
    </div>
  );
}

function FreshnessBadge({ fetchedAt, loading, fromCache, locale, t }) {
  if (!fetchedAt) return null;
  return (
    <div className="usage-fresh">
      {loading && <RefreshCw size={11} className="spinning" />}
      <span>
        {t('usage.common.lastUpdated')}: {formatRelative(fetchedAt, t, locale)}
        {fromCache && !loading && ` ${t('usage.common.cached')}`}
      </span>
    </div>
  );
}

// Her panel daima 5 satır (header + stats + chart + table + note) render eder
// ki .usage-grid subgrid ile iki paneli satır satır hizalayabilsin. Boş slot'lar
// için `usage-slot-empty` placeholder kullanılır.
function PanelShell({ icon: Icon, title, badge, children }) {
  return (
    <section className="admin-section usage-panel">
      <div className="usage-panel-header">
        <h2 className="admin-section-title">
          <Icon size={18} />
          <span>{title}</span>
        </h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function EmptySlot() {
  return <div className="usage-slot-empty" aria-hidden="true" />;
}

function StatGrid({ children }) {
  return <section className="admin-summary usage-stats">{children}</section>;
}

function OpenAIPanel({ range, force, locale }) {
  const { t } = useTranslation();
  const { data, loading, error, fetchedAt, fromCache } = useUsageData(
    `openai:${range}`,
    getOpenAIUsage,
    range,
    force
  );

  // estimatedCostUSD öncelikli — resmi costUSD geç finalize olduğu için
  // 24h/7d aralığında genelde 0 görünür.
  const chartData = data?.byDay?.map((d) => ({
    date: d.date,
    value: safeNum(d.estimatedCostUSD ?? d.costUSD ?? 0),
  })) || [];
  const hasChart = chartData.length > 0 && chartData.some((d) => d.value > 0);

  // 5 slot: header + stats + chart + table + note. Hata olduğunda stats slot'a
  // hata bloğu yerleştirilir, sonraki slot'lar boş kalır — subgrid hizalama korunur.
  let statsSlot, chartSlot, tableSlot, noteSlot;

  if (error) {
    statsSlot = <ErrorBlock error={error} hint={t('usage.common.configHint')} />;
    chartSlot = <EmptySlot />;
    tableSlot = <EmptySlot />;
    noteSlot = <EmptySlot />;
  } else if (!data) {
    statsSlot = <SkeletonStats />;
    chartSlot = <SkeletonChart />;
    tableSlot = <SkeletonTable rows={2} cols={3} />;
    noteSlot = (
      <div className="usage-skeleton-note">
        <SkBox w={14} h={14} style={{ borderRadius: '50%' }} />
        <SkBox w={'85%'} h={9} />
      </div>
    );
  } else {
    statsSlot = (
      <StatGrid>
        <div className="admin-stat">
          <span className="admin-stat-label">{t('usage.openai.estimatedCost')}</span>
          <span className="admin-stat-value">{formatUSD(data.totalEstimatedCostUSD, locale)}</span>
          {data.totalCostUSD > 0 && (
            <span className="usage-stat-extra">
              {t('usage.openai.officialCost')}: {formatUSD(data.totalCostUSD, locale)}
            </span>
          )}
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">{t('usage.openai.totalTokens')}</span>
          <span className="admin-stat-value">{formatNumber(data.totalTokens, locale)}</span>
          <span className="usage-stat-extra">
            {formatNumber(data.totalInputTokens, locale)} / {formatNumber(data.totalOutputTokens, locale)}
          </span>
        </div>
      </StatGrid>
    );
    chartSlot = (
      <div className="usage-section usage-chart-slot">
        <div className="usage-chart-label">{t('usage.openai.byDay')}</div>
        {hasChart ? (
          <BarChart
            data={chartData}
            color="#10b981"
            locale={locale}
            dense={chartData.length > 30}
            formatValue={(v) => formatUSD(v, locale)}
          />
        ) : (
          <div className="usage-empty-block">{t('usage.common.noData')}</div>
        )}
      </div>
    );
    tableSlot = data.byModel?.length > 0 ? (
      <div className="admin-table-wrap usage-section usage-table-slot">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('usage.openai.modelHeader')}</th>
              <th>{t('usage.openai.tokensHeader')}</th>
              <th>{t('usage.openai.modelCostHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {data.byModel.map((m) => (
              <tr key={m.model}>
                <td>{m.model}</td>
                <td>
                  {formatNumber(m.inputTokens, locale)} / {formatNumber(m.outputTokens, locale)}
                </td>
                <td>{formatUSD(m.estimatedCostUSD, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <EmptySlot />
    );
    noteSlot = <FreeTierNote text={t('usage.openai.freeTier')} />;
  }

  return (
    <PanelShell
      icon={Cpu}
      title={t('usage.openai.title')}
      badge={<FreshnessBadge fetchedAt={fetchedAt} loading={loading} fromCache={fromCache} locale={locale} t={t} />}
    >
      {statsSlot}
      {chartSlot}
      {tableSlot}
      {noteSlot}
    </PanelShell>
  );
}

function GoogleCloudPanel({ range, force, locale }) {
  const { t } = useTranslation();
  const { data, loading, error, fetchedAt, fromCache } = useUsageData(
    `gcloud:${range}`,
    getGoogleCloudUsage,
    range,
    force
  );

  const byDayTotal = data?.byDay
    ? Object.values(
        data.byDay.reduce((acc, row) => {
          acc[row.date] = acc[row.date] || { date: row.date, value: 0 };
          acc[row.date].value += row.count;
          return acc;
        }, {})
      ).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const hasData = data?.byService?.length > 0;
  const hasChart = byDayTotal.length > 0;

  let statsSlot, chartSlot, tableSlot, noteSlot;

  if (error) {
    statsSlot = <ErrorBlock error={error} hint={t('usage.common.configHint')} />;
    chartSlot = <EmptySlot />;
    tableSlot = <EmptySlot />;
    noteSlot = <EmptySlot />;
  } else if (!data) {
    statsSlot = <SkeletonStats />;
    chartSlot = <SkeletonChart />;
    tableSlot = <SkeletonTable rows={2} cols={4} />;
    noteSlot = (
      <div className="usage-skeleton-note">
        <SkBox w={14} h={14} style={{ borderRadius: '50%' }} />
        <SkBox w={'85%'} h={9} />
      </div>
    );
  } else {
    statsSlot = (
      <StatGrid>
        <div className="admin-stat">
          <span className="admin-stat-label">{t('usage.googleCloud.totalRequests')}</span>
          <span className="admin-stat-value">{formatNumber(data.totalRequests, locale)}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">{t('usage.googleCloud.estimatedCost')}</span>
          <span className="admin-stat-value">{formatUSD(data.estimatedCostUSD, locale)}</span>
        </div>
      </StatGrid>
    );
    chartSlot = (
      <div className="usage-section usage-chart-slot">
        <div className="usage-chart-label">{t('usage.googleCloud.byDay')}</div>
        {hasChart ? (
          <BarChart
            data={byDayTotal}
            color="#f59e0b"
            locale={locale}
            dense={byDayTotal.length > 30}
            formatValue={(v) => `${formatNumber(v, locale)} req`}
          />
        ) : (
          <div className="usage-empty-block">{t('usage.common.noData')}</div>
        )}
      </div>
    );
    tableSlot = hasData ? (
      <div className="admin-table-wrap usage-section usage-table-slot">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('usage.googleCloud.serviceHeader')}</th>
              <th>{t('usage.googleCloud.requestsHeader')}</th>
              <th>{t('usage.googleCloud.errorsHeader')}</th>
              <th>{t('usage.googleCloud.costHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {data.byService.map((row) => (
              <tr key={row.service}>
                <td>{row.service}</td>
                <td>{formatNumber(row.count, locale)}</td>
                <td>{row.errors}</td>
                <td>{formatUSD(row.estimatedCostUSD, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="admin-empty usage-section">{t('usage.common.noData')}</p>
    );
    noteSlot = <FreeTierNote text={t('usage.googleCloud.freeTier')} />;
  }

  return (
    <PanelShell
      icon={Cloud}
      title={t('usage.googleCloud.title')}
      badge={<FreshnessBadge fetchedAt={fetchedAt} loading={loading} fromCache={fromCache} locale={locale} t={t} />}
    >
      {statsSlot}
      {chartSlot}
      {tableSlot}
      {noteSlot}
    </PanelShell>
  );
}

export default function UsagePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';

  const [range, setRange] = useState('7d');
  const [forceCounter, setForceCounter] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Refresh tıklanınca panellerin veri silinip skeleton'a düşmesi 1 tick alır;
  // refresh butonu kısa süre spin + disabled olarak görsel geri bildirim verir.
  const refresh = useCallback(() => {
    setForceCounter((k) => k + 1);
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 2500);
  }, []);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-title">
          <Activity size={20} />
          <h1>{t('usage.title')}</h1>
        </div>
        <div className="usage-toolbar">
          <div role="tablist" className="usage-range-tabs">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={range === r}
                onClick={() => setRange(r)}
                className="admin-refresh-btn usage-range-tab"
              >
                {t(`usage.range.${r}`)}
              </button>
            ))}
          </div>
          <button className="admin-refresh-btn" onClick={refresh} type="button" disabled={isRefreshing}>
            <RefreshCw size={14} className={isRefreshing ? 'spinning' : ''} />
            {t('usage.refresh')}
          </button>
        </div>
      </header>
      <p className="admin-home-intro">{t('usage.subtitle')}</p>

      <div className="usage-grid">
        <OpenAIPanel range={range} force={forceCounter} locale={locale} />
        <GoogleCloudPanel range={range} force={forceCounter} locale={locale} />
      </div>
    </div>
  );
}
