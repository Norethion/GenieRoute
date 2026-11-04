# GenieRoute AI

[English](README.en.md) · **Türkçe**

LLM destekli seyahat planlayıcı. Kullanıcı şehir, gün, bütçe ve ilgi alanı girer; uygulama Google Places API'den gerçek mekan verilerini çeker ve OpenAI ile günlük rotayı haritada gösterir. Dünya çapında çalışır (Türkiye dahil tüm şehirler için bütçe ve ipuçları LLM ensemble + DB-cache yoluyla üretilir).

## Ekran Görüntüleri

| Şehir ve tercih formu | Tüm günler haritada |
|---|---|
| ![Şehir ve tercih formu](docs/screenshots/home.png) | ![Tüm günler haritada](docs/screenshots/overview.png) |
| **Günlük plan ve rota** | **Sohbetle değişiklik önerisi ve önizleme** |
| ![Günlük plan ve rota](docs/screenshots/day-plan.png) | ![Sohbetle değişiklik önerisi ve önizleme](docs/screenshots/chat.png) |

## Özellikler

- LLM destekli günlük plan üretimi (varsayılan OpenAI gpt-5.4-mini)
- Google Places + Geocoding ile gerçek mekan/koordinat
- Coğrafi kümeleme + nearest-neighbor TSP ile gün-içi rota optimizasyonu
- Çoklu para birimi (yerel + USD + EUR) + 1 saat döviz kuru cache
- Hava tahmini (Open-Meteo, anahtarsız)
- Streaming sohbet ile plan düzenleme (Socket.io)
- TR/EN dil desteği, açık/koyu tema
- `/admin` cache gözlem paneli
- `/usage` API kullanım paneli (OpenAI maliyet/token + Google Cloud Monitoring)

## Hızlı Başlangıç

### Gereksinimler

- **Node.js 22**
- **Docker Desktop** (PostgreSQL container'ı için)
- **Google Cloud** hesabı (Places API + Geocoding API etkin, faturalandırma açık)
- **Mapbox** public access token'ı (harita görselleştirmesi için)
- **OpenAI API** hesabı (kredi yüklü)

### Kurulum

```bash
git clone <repo-url>
cd GenieRoute-AI
```

Sonra `backend/.env.example` ve `frontend/.env.example` dosyalarını sırasıyla `backend/.env` ve `frontend/.env` olarak kopyala, [Ortam Değişkenleri](#ortam-değişkenleri) bölümündeki adımları izleyerek doldur.

```bash
# Bağımlılıkları yükle ve veritabanı container'ını ayağa kaldır
helper.bat
# → [i] Ilk Kurulum   (npm install + docker pull)

# Tüm servisleri başlat
helper.bat
# → [1] Tumunu Baslat
```

- Backend: <http://localhost:3001>
- Frontend: <http://localhost:5173>
- Usage paneli: <http://localhost:5173/usage>
- Admin paneli: <http://localhost:5173/admin>

Migration'lar backend kalkışında otomatik uygulanır (`database/migrations/`).

### PostgreSQL 18'e geçiş

PostgreSQL 16 verileri eski `pgdata` biriminde kalır; PostgreSQL 18 yeni `pgdata18` birimini kullanır.
Verileri taşımak için eski `pgdata` birimini geçici bir `postgres:16` konteynerine `/var/lib/postgresql/data` yolunda bağlayıp `pg_dumpall` ile SQL dökümü alın, ardından dökümü yeni PostgreSQL 18 konteynerinde `psql` ile geri yükleyin.
Temiz başlamak isterseniz yeni birimi olduğu gibi kullanın; backend açıldığında migration'lar otomatik uygulanır.

## Ortam Değişkenleri

### `backend/.env`

#### `PORT`
Backend port'u. Varsayılan `3001`.

#### `DATABASE_URL`
PostgreSQL bağlantı stringi. Docker compose ile gelen varsayılanı kullan:
```
DATABASE_URL=postgresql://genieroute:genieroute123@localhost:5435/genieroute
```

#### `GOOGLE_PLACES_API_KEY` (zorunlu)
Backend'in Places + Geocoding + Photo proxy çağrıları için kullandığı API key.

**Nasıl alınır:**
1. <https://console.cloud.google.com/> → ücretsiz kayıt veya giriş
2. Üst menüden bir proje oluştur (örn. `GenieRoute`) — proje ID'si daha sonra `GCP_PROJECT_ID` için kullanılacak
3. Sol menü → **APIs & Services → Library**
4. Şu API'leri etkinleştir (her biri için "Enable" tıkla):
   - **Places API**
   - **Geocoding API**
5. **APIs & Services → Credentials → Create Credentials → API Key**
6. Anahtarı kopyala → `backend/.env`'e yapıştır

> **Faturalama:** Google Maps Platform $200 aylık ücretsiz kredi verir. Bu, kabaca 6.250 Text Search / 40.000 Geocoding / 28.500 Photo isteğine denk gelir. Üzeri kart faturalanır, bu yüzden faturalandırmayı etkinleştirip bütçe alarmı kurman önerilir.

#### `OPENAI_API_KEY` (zorunlu)
Plan üretimi ve sohbet için kullanılan **proje** API key'i.

**Nasıl alınır:**
1. <https://platform.openai.com/api-keys>
2. **Create new secret key** → Project: default → Role: All
3. Kopyala (sadece bir kere gösterilir) → `backend/.env`'e yapıştır
4. <https://platform.openai.com/settings/organization/billing> üzerinden hesabına kredi yükle (yeni hesaplara $5–$18 aralığında promo kredi verilebilir)

#### `OPENAI_ADMIN_API_KEY` (opsiyonel — `/usage` için)
OpenAI'nin organization-level kullanım/maliyet API'lerine erişim. Proje key'inden farklı, ayrıca alınır. Olmadan da uygulama çalışır; sadece `/usage` sayfasında OpenAI bölümü "yapılandırılmamış" mesajı gösterir.

**Nasıl alınır:**
1. <https://platform.openai.com/settings/organization/admin-keys>
2. **Create new admin key** → kopyala → `backend/.env`'e yapıştır
3. **Not:** Bu key'i alabilmek için organization owner olman gerekir (kişisel hesabınsa zaten owner'sın).

#### `GCP_PROJECT_ID` (opsiyonel — `/usage` için)
Google Cloud projenin ID'si (Name değil). `places-backend.googleapis.com` çağrı sayılarını Cloud Monitoring'den okumak için.

**Nasıl bulunur:**
1. <https://console.cloud.google.com/>
2. Üstte proje seçici (Google Cloud logosunun yanı) → tıkla
3. **ALL** sekmesi → projenin satırında **ID** sütunu (örn. `genieroute-457821` — sadece "genieroute" değil, sayı ekiyle birlikte)
4. Bu değeri `backend/.env`'e yapıştır

#### `GOOGLE_APPLICATION_CREDENTIALS` (opsiyonel — `/usage` için)
Cloud Monitoring API'sine kimlik doğrulaması için service account JSON dosyasının **mutlak yolu**. Places API key'i bu API için yetmez; service account zorunlu.

**Nasıl alınır:**
1. <https://console.cloud.google.com/iam-admin/serviceaccounts>
2. Yukarıda oluşturduğun GenieRoute projesini seç
3. **Create Service Account**
   - Name: `genieroute-monitoring`
   - Continue
4. **Grant access** → Role: **Monitoring Viewer** (`roles/monitoring.viewer`) → Done
5. Oluşan satıra tıkla → **Keys** sekmesi → **Add Key → Create new key → JSON** → indirilen dosyayı `backend/gcp-monitoring-sa.json` olarak kaydet
6. `backend/.env`'e tam yolu yaz:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=D:\workspace-ali\GenieRoute-AI\backend\gcp-monitoring-sa.json
   ```

> ⚠️ **Bu JSON dosyasını ASLA git'e commit etme.** Repo'ya girerse Google otomatik iptal eder ve key sızdırılmış sayılır. `.gitignore` zaten `**/gcp-*-sa.json` desenini dışlıyor; dosya adını bu desene uyarak isimlendir.

### `frontend/.env`

#### `VITE_API_URL`
Backend URL'i. Varsayılanı bırak:
```
VITE_API_URL=http://localhost:3001/api
```

#### `VITE_MAPBOX_TOKEN` (zorunlu)
Harita `frontend/src/components/MapView.jsx` içinde Mapbox ile çizilir; public access token'ını <https://account.mapbox.com/access-tokens/> adresinden alıp `frontend/.env` dosyasına ekle.
Google Places anahtarını frontend'e ekleme; mekan ve fotoğraf çağrıları backend üzerinden yapılır.

## /usage Paneli

OpenAI ve Google Cloud kullanımını tek sayfadan görmek için. URL: <http://localhost:5173/usage>

İki panel:
- **OpenAI (Admin API):** token sayısı, model bazlı kırılım, tahmini USD (token × model fiyatı), resmi USD (Costs API)
- **Google Cloud (Monitoring API):** servis bazlı istek sayısı (places-backend, geocoding-backend, maps-backend), tahmini USD

Tarih aralığı: 24 saat / 7 gün / 30 gün / Tüm Zamanlar.

İlgili env değişkenleri (`OPENAI_ADMIN_API_KEY`, `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`) yapılandırılmamışsa ilgili panel "yapılandırılmamış" mesajı gösterir; uygulamanın geri kalanı normal çalışmaya devam eder.

## Klasör Yapısı

Kod haritası için [CLAUDE.md](CLAUDE.md) dosyasına, davranış açıklamaları için [mimari notlarına](docs/MIMARI_NOTLARI.md) bak.

```
backend/    Express + Socket.io API, PostgreSQL, services/models/routes
frontend/   React 19 + Vite, i18n, ThemeContext
database/   migrations/ (kalkışta otomatik uygulanır)
helper.bat  Windows başlatıcı (Türkçe menü)
```

## Lisans ve Atıflar

- Kod: tüm hakları saklıdır, bkz. [LICENSE](LICENSE).
- Şehir verileri: [GeoNames](https://www.geonames.org/) (CC BY 4.0)
- Hava verisi: [Open-Meteo](https://open-meteo.com/) (anahtarsız)
- Döviz kurları: [open.er-api.com](https://www.exchangerate-api.com/) (anahtarsız ücretsiz tier)
- `frontend/public/images/routes/antalya.jpg`: [Marmaris harbor (aerial view)](https://commons.wikimedia.org/wiki/File:Marmaris_harbor_(aerial_view),_Mu%C4%9Fla_Province,_southwest_Turkey,_Mediterranean.jpg), Mstyslav Chernov, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)

## Sorun Giderme

| Belirti | Olası neden |
|---|---|
| `EADDRINUSE :::3001` | Başka bir backend instance çalışıyor. `Get-NetTCPConnection -LocalPort 3001` ile bul, `Stop-Process` ile kapat. |
| `/usage` OpenAI panel "OPENAI_ADMIN_API_KEY not configured" | Admin key eklenmemiş veya backend restart edilmemiş. |
| `/usage` Cloud Monitoring "GCP_PROJECT_ID not configured" | `GCP_PROJECT_ID` veya service account JSON eksik. |
| Plan üretiminde "Places API error: REQUEST_DENIED" | Faturalandırma kapalı veya API etkin değil. Cloud Console'da kontrol et. |
| Plan üretiminde "401 Unauthorized" (OpenAI) | API key geçersiz veya kredi bitmiş. |
| Migration hatası kalkışta | Postgres container kalkmamış olabilir: `docker-compose up -d postgres`. |
