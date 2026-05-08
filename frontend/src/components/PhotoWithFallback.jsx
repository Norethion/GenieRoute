import { useState } from 'react';
import { MapPin } from 'lucide-react';

// errored state'i src değişiminde sıfırlanmaz; çağıran taraf src değişince
// key prop ile bileşeni yeniden mount eder.
export default function PhotoWithFallback({
  src,
  alt = '',
  fallbackText,
  fallbackIcon,
  className = '',
  imgClassName = '',
  loading = 'lazy',
}) {
  const [errored, setErrored] = useState(false);

  const Icon = fallbackIcon || MapPin;
  const label = (fallbackText || alt || '').trim();
  const shortLabel = label.split(/\s+/).slice(0, 3).join(' ') || '—';

  if (errored || !src) {
    return (
      <div className={`photo-fallback ${className}`} role="img" aria-label={label}>
        <Icon size={28} className="photo-fallback-icon" />
        <span className="photo-fallback-text">{shortLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={imgClassName}
      onError={() => setErrored(true)}
    />
  );
}
