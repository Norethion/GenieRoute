import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Save, MapPin, UtensilsCrossed, CalendarDays, Map, ArrowLeft, Sun, Moon, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import DailyPlan from '../components/DailyPlan';
import MapView from '../components/MapView';
import Toast from '../components/Toast';
import BudgetSummary from '../components/BudgetSummary';
import CityTips from '../components/CityTips';
import ChatPanel from '../components/ChatPanel';
import { saveTrip, lookupPlace, updateTripPlan } from '../services/api';

const STORAGE_KEY = 'genieroute-last-result';
const STORAGE_KEY_TRIP_ID = 'genieroute-last-trip-id';

export default function ResultPage() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState(null);
  const [highlightedPlace, setHighlightedPlace] = useState(null);
  const [activeDay, setActiveDay] = useState(-1);
  // Gün sekmesine her tıklamada (aynı gün olsa bile) artar; MapView'ı yeniden
  // çerçevelemeye zorlar — aynı gün/Tüm Günler tekrar tıklanınca harita düzelir.
  const [fitVersion, setFitVersion] = useState(0);
  const highlightTimerRef = useRef(null);
  // Önizleme öncesi snapshot — iptal edilince geri yükle
  const previewSnapshotRef = useRef(null);

  const navResult = location.state?.result;
  const navTripId = location.state?.tripId;

  const [result, setResult] = useState(() => {
    if (navResult) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(navResult));
      return navResult;
    }
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const [tripId, setTripId] = useState(() => {
    // Yeni plan navigate edilmiş ama tripId yoksa, eski tripId'yi temizle
    if (navResult && !navTripId) {
      sessionStorage.removeItem(STORAGE_KEY_TRIP_ID);
      return null;
    }
    if (navTripId) {
      sessionStorage.setItem(STORAGE_KEY_TRIP_ID, String(navTripId));
      return navTripId;
    }
    const stored = sessionStorage.getItem(STORAGE_KEY_TRIP_ID);
    return stored ? Number(stored) : null;
  });

  useEffect(() => {
    if (navResult) {
      window.history.replaceState({}, '');
    }
  }, [navResult]);

  const clearToast = useCallback(() => setToast(null), []);

  // Önizleme — sadece UI state'i günceller, DB'ye yazmaz. Snapshot tutarız ki iptal
  // edildiğinde geri yükleyelim.
  const handlePreviewUpdate = useCallback(async (update) => {
    const isTr = i18n.language === 'tr';
    let newPlace = null;
    // Kullanici farkli gun ya da "Tum Gunler"de iken degisikligin oldugu gune
    // otomatik gec — aksi halde plan ve harita gorsel olarak guncellenmez.
    if (update.day && update.day >= 1) {
      const targetDay = update.day - 1;
      setActiveDay(targetDay);
      // Snapshot'i etkilenecek gun aktifken almak istiyoruz; bir frame bekle.
      await new Promise((r) => setTimeout(r, 50));
    }
    if (update.action === 'replace_activity' && update.activity?.place) {
      try {
        const cityName = result?.trip?.city;
        if (cityName) {
          const lookupResult = await lookupPlace({
            name: update.activity.place,
            city: cityName,
            language: i18n.language,
          });
          newPlace = lookupResult?.place || null;
        }
      } catch {
        // sessiz
      }
      // Lookup başarısız — önizleme yapma, kullanıcıya bildir.
      // Aksi halde plan günceller ama harita pin'i olmadığı için "yer kayboldu" izlenimi olur.
      if (!newPlace) {
        setToast({
          message: isTr
            ? `"${update.activity.place}" Google Haritalar'da bulunamadı. AI'dan tam adıyla başka bir öneri iste.`
            : `"${update.activity.place}" not found on Google Maps. Ask the AI for an alternative with the full name.`,
          type: 'error',
        });
        return;
      }
    }

    setResult((prev) => {
      if (!prev?.dailyPlan?.days) return prev;
      // Snapshot (deep clone) — iptal için
      previewSnapshotRef.current = JSON.parse(JSON.stringify(prev));

      const newResult = {
        ...prev,
        dailyPlan: { ...prev.dailyPlan, days: [...prev.dailyPlan.days] },
        places: [...(prev.places || [])],
        restaurants: [...(prev.restaurants || [])],
        mapMarkers: [...(prev.mapMarkers || [])],
      };
      const dayIndex = update.day - 1;

      if (update.action === 'replace_activity' && newResult.dailyPlan.days[dayIndex]) {
        const day = { ...newResult.dailyPlan.days[dayIndex] };
        const oldActivity = day.activities.find((act) => act.time === update.time);
        const oldPlaceName = oldActivity?.place;
        const newPlaceName = update.activity?.place;

        day.activities = day.activities.map((act) =>
          act.time === update.time ? { ...act, ...update.activity } : act
        );
        newResult.dailyPlan.days[dayIndex] = day;

        if (newPlace) {
          const isRestaurant = update.activity.type === 'restaurant';
          const targetList = isRestaurant ? newResult.restaurants : newResult.places;
          if (!targetList.some((p) => p.name === newPlace.name)) {
            targetList.push(newPlace);
            const markerType = isRestaurant ? 'restaurant' : 'attraction';
            if (!newResult.mapMarkers.some((m) => m.name === newPlace.name)) {
              newResult.mapMarkers.push({ ...newPlace, markerType });
            }
          }
        }

        if (oldPlaceName && oldPlaceName !== newPlaceName) {
          const stillReferenced = newResult.dailyPlan.days.some((dd) =>
            dd.activities?.some((a) => a.place === oldPlaceName)
          );
          if (!stillReferenced) {
            newResult.places = newResult.places.filter((p) => p.name !== oldPlaceName);
            newResult.restaurants = newResult.restaurants.filter((r) => r.name !== oldPlaceName);
            newResult.mapMarkers = newResult.mapMarkers.filter((m) => m.name !== oldPlaceName);
          }
        }
      } else if (update.action === 'replace_day_title' && newResult.dailyPlan.days[dayIndex]) {
        newResult.dailyPlan.days[dayIndex] = {
          ...newResult.dailyPlan.days[dayIndex],
          title_tr: update.title_tr,
          title_en: update.title_en,
        };
      }
      return newResult;
    });

    setToast({
      message: isTr ? 'Önizleme — onaylamak için "Onayla"ya bas.' : 'Preview — press "Confirm" to save.',
      type: 'success'
    });
  }, [i18n.language, result]);

  // Önizleme iptal — snapshot'a geri dön
  const handleCancelPreview = useCallback(() => {
    if (previewSnapshotRef.current) {
      setResult(previewSnapshotRef.current);
      previewSnapshotRef.current = null;
      const isTr = i18n.language === 'tr';
      setToast({
        message: isTr ? 'Önizleme iptal edildi.' : 'Preview cancelled.',
        type: 'success'
      });
    }
  }, [i18n.language]);

  const handlePlanUpdate = useCallback(async (update) => {
    const isTr = i18n.language === 'tr';
    let lookupFailed = false;
    let newPlace = null;

    // Kullanici farkli gun veya Tum Gunler'de iken Onayla/Apply yapilirsa
    // gorunmeyebilir — etkilenen gune otomatik gec.
    if (update.day && update.day >= 1) {
      setActiveDay(update.day - 1);
    }

    // Eğer önizleme akışı zaten state'i mutate ettiyse (snapshot var), tekrar uygulamadan
    // sadece DB'ye yaz. Aksi halde tek-atışta hem state'i değiştir hem kaydet.
    if (previewSnapshotRef.current) {
      previewSnapshotRef.current = null; // confirm — snapshot artık gerekmez
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      let autoSaved = false;
      if (tripId && result) {
        try {
          await updateTripPlan(tripId, {
            planText: JSON.stringify(result.dailyPlan),
            placesJson: result.places || [],
            restaurantsJson: result.restaurants || [],
          });
          autoSaved = true;
        } catch { /* sessizce */ }
      }
      setToast({
        message: autoSaved
          ? (isTr ? 'Plan güncellendi ve kaydedildi.' : 'Plan updated and saved.')
          : tripId
            ? (isTr ? 'Plan güncellendi (kaydedilemedi).' : 'Plan updated (could not save).')
            : (isTr ? 'Plan güncellendi.' : 'Plan updated.'),
        type: 'success',
      });
      return;
    }

    // Aktivite değişikliği için yeni mekanın koordinatlarını çek
    if (update.action === 'replace_activity' && update.activity?.place) {
      try {
        const cityName = result?.trip?.city;
        if (cityName) {
          const lookupResult = await lookupPlace({
            name: update.activity.place,
            city: cityName,
            language: i18n.language,
          });
          newPlace = lookupResult?.place || null;
          if (!newPlace) lookupFailed = true;
        }
      } catch {
        lookupFailed = true;
      }
      // Lookup başarısız — değişikliği uygulama; yoksa plan tutarsız olur (gün kartında var, haritada yok).
      if (lookupFailed) {
        setToast({
          message: isTr
            ? `"${update.activity.place}" Google Haritalar'da bulunamadı. Plan değiştirilmedi. AI'dan tam adıyla başka bir öneri iste.`
            : `"${update.activity.place}" not found on Google Maps. Plan not changed. Ask the AI for an alternative with the full name.`,
          type: 'error',
        });
        return;
      }
    }

    let updatedResult = null;
    setResult((prev) => {
      if (!prev?.dailyPlan?.days) return prev;
      const newResult = {
        ...prev,
        dailyPlan: { ...prev.dailyPlan, days: [...prev.dailyPlan.days] },
        places: [...(prev.places || [])],
        restaurants: [...(prev.restaurants || [])],
        mapMarkers: [...(prev.mapMarkers || [])],
      };
      const dayIndex = update.day - 1;

      if (update.action === 'replace_activity' && newResult.dailyPlan.days[dayIndex]) {
        const day = { ...newResult.dailyPlan.days[dayIndex] };

        // Değiştirilen yerin adını yakala — update sonrasında başka bir aktivite
        // tarafından kullanılmıyorsa eski marker'ı temizlemek için gerekli.
        const oldActivity = day.activities.find((act) => act.time === update.time);
        const oldPlaceName = oldActivity?.place;
        const newPlaceName = update.activity?.place;

        day.activities = day.activities.map((act) =>
          act.time === update.time ? { ...act, ...update.activity } : act
        );
        newResult.dailyPlan.days[dayIndex] = day;

        // Yeni mekan listelere ekle (varsa, duplikasyon kontrolü)
        if (newPlace) {
          const isRestaurant = update.activity.type === 'restaurant';
          const targetList = isRestaurant ? newResult.restaurants : newResult.places;
          const exists = targetList.some((p) => p.name === newPlace.name);
          if (!exists) {
            targetList.push(newPlace);
            const markerType = isRestaurant ? 'restaurant' : 'attraction';
            const markerExists = newResult.mapMarkers.some((m) => m.name === newPlace.name);
            if (!markerExists) {
              newResult.mapMarkers.push({ ...newPlace, markerType });
            }
          }
        }

        // Eski yer artık hiçbir aktivite tarafından referans verilmiyorsa temizle.
        if (oldPlaceName && oldPlaceName !== newPlaceName) {
          const stillReferenced = newResult.dailyPlan.days.some((dd) =>
            dd.activities?.some((a) => a.place === oldPlaceName)
          );
          if (!stillReferenced) {
            newResult.places = newResult.places.filter((p) => p.name !== oldPlaceName);
            newResult.restaurants = newResult.restaurants.filter((r) => r.name !== oldPlaceName);
            newResult.mapMarkers = newResult.mapMarkers.filter((m) => m.name !== oldPlaceName);
          }
        }
      } else if (update.action === 'replace_day_title' && newResult.dailyPlan.days[dayIndex]) {
        newResult.dailyPlan.days[dayIndex] = {
          ...newResult.dailyPlan.days[dayIndex],
          title_tr: update.title_tr,
          title_en: update.title_en,
        };
      }

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newResult));
      updatedResult = newResult;
      return newResult;
    });

    // Auto-save: kayıtlı plan ise DB'ye yaz
    let autoSaved = false;
    if (tripId && updatedResult) {
      try {
        await updateTripPlan(tripId, {
          planText: JSON.stringify(updatedResult.dailyPlan),
          placesJson: updatedResult.places || [],
          restaurantsJson: updatedResult.restaurants || [],
        });
        autoSaved = true;
      } catch {
        // sessizce başarısız ol — kullanıcıya toast'la bildir
      }
    }

    let message;
    if (lookupFailed) {
      message = isTr
        ? 'Plan güncellendi ama mekanın konumu bulunamadı.'
        : 'Plan updated but the place location could not be found.';
    } else if (autoSaved) {
      message = isTr ? 'Plan güncellendi ve kaydedildi.' : 'Plan updated and saved.';
    } else if (tripId) {
      message = isTr ? 'Plan güncellendi (kaydedilemedi).' : 'Plan updated (could not save).';
    } else {
      message = isTr ? 'Plan güncellendi.' : 'Plan updated.';
    }
    setToast({ message, type: lookupFailed ? 'error' : 'success' });
  }, [i18n.language, result, tripId]);

  const switchLanguage = () => {
    const newLang = i18n.language === 'tr' ? 'en' : 'tr';
    i18n.changeLanguage(newLang);
    localStorage.setItem('genieroute-lang', newLang);
  };

  if (!result) {
    return (
      <div className="no-result">
        <MapPin size={48} strokeWidth={1.5} />
        <h3>{t('result.noResult')}</h3>
        <p>{t('result.noResultDesc')}</p>
        <button onClick={() => navigate('/')} className="btn-next">
          {t('result.createPlan')}
        </button>
      </div>
    );
  }

  const { trip, dailyPlan, places, restaurants, mapMarkers, budgetEstimate, cityInfo, weather, weatherDayParts } = result;

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await saveTrip({
        city: trip.city,
        days: trip.days,
        budget: trip.budget,
        interests: trip.interests,
        planText: JSON.stringify(dailyPlan),
        placesJson: places,
        restaurantsJson: restaurants,
        budgetEstimate,
        cityInfo,
      });
      const newTripId = data?.trip?.id;
      if (newTripId) {
        setTripId(newTripId);
        sessionStorage.setItem(STORAGE_KEY_TRIP_ID, String(newTripId));
      }
      setSaved(true);
      setToast({ message: t('result.saveSuccess'), type: 'success' });
    } catch {
      setToast({ message: t('result.saveError'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleActivityClick = (activity) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedPlace(activity.place);
    highlightTimerRef.current = setTimeout(() => setHighlightedPlace(null), 1400);
  };

  // Gün sekmesi her tıklandığında haritayı yeniden çerçevele (aynı gün olsa bile).
  // Düz fonksiyon — erken return'den sonra tanımlandığı için hook kullanılmaz.
  const handleDayChange = (day) => {
    setActiveDay(day);
    setFitVersion((v) => v + 1);
  };

  return (
    <div className="result-page-immersive">
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}

      <div className="result-left">
        <div className="result-left-header">
          <button className="result-back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <div className="result-brand" onClick={() => navigate('/')}>
            <Map size={20} strokeWidth={2.5} />
            <span>GenieRoute</span>
          </div>
          <div className="result-header-actions">
            <button className="lang-toggle" onClick={switchLanguage}>
              {i18n.language === 'tr' ? 'EN' : 'TR'}
            </button>
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>

        <div className="result-left-content">
          <div className="result-trip-info">
            <h2>{trip.city}</h2>
            <div className="result-tags">
              <span className="result-tag"><CalendarDays size={12} /> {trip.days} {t('result.day')}</span>
              <span className="result-tag">{t(`budget.${trip.budget}`, trip.budget)}</span>
            </div>
            <div className="result-stats-inline">
              <span><MapPin size={13} /> {places?.length || 0} {t('result.places')}</span>
              <span><UtensilsCrossed size={13} /> {restaurants?.length || 0} {t('result.restaurants')}</span>
            </div>
          </div>

          <div className="result-actions-bar">
            <button onClick={() => navigate('/')} className="result-action-btn">
              <Plus size={14} />
              {t('result.newPlan')}
            </button>
            {!tripId && (
              <button
                onClick={handleSave}
                className={`result-action-btn result-action-primary ${saved ? 'btn-saved' : ''}`}
                disabled={saving || saved}
              >
                <Save size={14} />
                {saved ? t('result.saved') : saving ? t('result.saving') : t('result.save')}
              </button>
            )}
          </div>

          {result.notice?.type === 'few_places' && (
            <div className="few-places-notice">
              <Info size={16} />
              <span>{t('result.fewPlacesNotice', { found: result.notice.found, days: result.notice.days })}</span>
            </div>
          )}

          <DailyPlan plan={dailyPlan} onActivityClick={handleActivityClick} activeDay={activeDay} onDayChange={handleDayChange} weatherDayParts={weatherDayParts} />
          <BudgetSummary budget={budgetEstimate} />
          <CityTips tips={cityInfo} weather={weather} />
        </div>
      </div>

      <div className="result-right">
        <MapView markers={mapMarkers} highlightedPlace={highlightedPlace} dailyPlan={dailyPlan} activeDay={activeDay} fitVersion={fitVersion} />
        {/* Draggable floating chat — harita üzerinde, sürüklenebilir kart */}
        <div className="chat-float-container">
          <ChatPanel
            planData={{ trip, dailyPlan, weatherDayParts }}
            onPlanUpdate={handlePlanUpdate}
            onPreviewUpdate={handlePreviewUpdate}
            onCancelPreview={handleCancelPreview}
            tripId={tripId}
            floating
          />
        </div>
      </div>
    </div>
  );
}
