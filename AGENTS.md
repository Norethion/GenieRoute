# GenieRoute AI

GenieRoute, şehir, süre, bütçe ve ilgi alanlarına göre gerçek mekanlardan günlük seyahat planı üreten, yerelde çalışan bir web uygulamasıdır.
Google Places mekanları sağlar, OpenAI rotayı oluşturur, kullanıcı planı haritada görür ve sohbetle düzenler.

## Teknoloji ve konumlar

- Backend: Node.js 22, Express, Socket.io ve PostgreSQL 18; HTTP girişleri `backend/src/routes/`, iş mantığı `backend/src/services/`, SQL erişimi `backend/src/models/` içindedir.
- Frontend: React 19, Vite, react-i18next ve Mapbox GL JS; sayfalar `frontend/src/pages/`, bileşenler `frontend/src/components/`, API ve socket istemcileri `frontend/src/services/` içindedir.
- Veritabanı: `database/migrations/*.sql`; `backend/src/config/migrate.js` dosyaları backend açılışında ada göre uygular.
- Kurulum ve ortam değişkenleri: [README.md](README.md), `backend/.env.example` ve `frontend/.env.example`.
- Mimari kararlar ve alan kuralları: [mimari notları](docs/MIMARI_NOTLARI.md); güncel API için `backend/src/routes/`, şema için `database/migrations/` kaynak alınır.

## Yerel komutlar

Komutları belirtilen dizinde çalıştır; kökte bir npm çalışma alanı yoktur.
Windows menüsü için `helper.bat` kullanılabilir.

| İş | Komut ve dizin |
| --- | --- |
| Bağımlılıkları kur | `cd backend && npm ci`; ayrıca `cd frontend && npm ci` |
| Veritabanını aç | Kökte `docker-compose up -d postgres`; host portu `5435`, container portu `5432` |
| API geliştirme | `cd backend && npm run dev` (`localhost:3001`) |
| Web geliştirme | `cd frontend && npm run dev` (`localhost:5173`) |
| Frontend build | `cd frontend && npm run build` |
| Backend lint | `cd backend && npm run lint` |
| Frontend lint | `cd frontend && npm run lint` |
| Tarayıcı testleri | `cd frontend && npm run test:e2e` |

Backend için build veya test script'i, iki paket için de typecheck script'i yoktur.
PR'larda [CI](.github/workflows/ci.yml) içindeki `Kod kalitesi` (backend ve frontend lint ve biçim kontrolü) ve `Önyüz derlemesi` (frontend build) zorunlu kontrollerdir; E2E testleri CI'da çalışmaz, gerekiyorsa yerelde çalıştır.
E2E için PostgreSQL ve backend açık olmalı; frontend'i `cd frontend && npm run dev -- --port 5174` ile ayrı terminalde aç, sonra [E2E rehberindeki](frontend/tests/e2e/README.md) anahtar ve test koşullarını izle.
Playwright sunucuları kendi başlatmaz ve `frontend/playwright.config.js` içindeki base URL `localhost:5174` değeridir.

## Korunacak sınırlar

- Planlarda API'den gelmeyen mekanları üretme; coğrafi filtre ve günlük rota sınırlarını koru ([mimari notları](docs/MIMARI_NOTLARI.md)).
- `[PLAN_UPDATE]` sohbet protokolünü ve değişikliğin önizleme/onay akışını koru ([mimari notları](docs/MIMARI_NOTLARI.md)).
- Google Places ve OpenAI gizli anahtarlarını backend'de tut; fotoğrafları proxy üzerinden sun, Mapbox public token'ını yalnız harita için kullan ([mimari notları](docs/MIMARI_NOTLARI.md)).
- Görünen metinleri `frontend/src/i18n/locales/tr.json` ve `en.json` içinde birlikte güncelle; Türkçe karakterleri koru ([mimari notları](docs/MIMARI_NOTLARI.md)).
- Şema değişikliklerini yeni SQL migration ile yap; mevcut migration'ları yeniden yazma ([mimari notları](docs/MIMARI_NOTLARI.md)).

## Git akışı

`main` üzerinden kısa ömürlü dal aç ve değişikliği `main` hedefine PR ile gönder.
PR'ye kimseyi atama; normal merge commit ile birleştirmeyi proje sahibi yapar.
Commit mesajları, PR metinleri (başlık, açıklama, yorumlar) ve dokümanlar Türkçe yazılır.
`README.md` Türkçedir; `README.en.md` onun İngilizce çevirisidir ve ikisi birlikte güncel tutulmalıdır.
Bu proje paylaşılan sunucuda dağıtılmıyor; dağıtım altyapısı bağlantısı yoktur.
