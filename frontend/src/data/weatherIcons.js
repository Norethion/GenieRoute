import { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';

// Aktivite zaman dilimi -> gün-parçası (weatherDayParts anahtarı).
export function getDayPart(timeSlot) {
  if (timeSlot === 'morning' || timeSlot === 'mid-morning') return 'morning';
  if (timeSlot === 'dinner' || timeSlot === 'evening') return 'evening';
  // lunch, afternoon, late-afternoon, snack ve bilinmeyen -> afternoon
  return 'afternoon';
}

// WMO weather code -> lucide ikon bileşeni.
export function getWeatherIcon(code) {
  if (code === 0) return Sun;
  if (code === 1) return CloudSun;
  if (code === 2 || code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return CloudSun;
}

// trip.startDate (YYYY-MM-DD) + gün indeksi -> o günün tarihi (YYYY-MM-DD).
export function getDayDate(startDate, dayIndex) {
  if (!startDate) return null;
  const d = new Date(startDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + dayIndex);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
