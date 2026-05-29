# GenieRoute AI

Kullanıcının şehir, gün, bütçe ve ilgi alanı girdisiyle Google Places API'den mekan verileri çekip, OpenAI ile günlük rota üreten ve haritada gösteren web uygulaması. Dünya çapında çalışır: tüm şehirler (Türkiye dahil) için bütçe ve ipuçları LLM ensemble + DB-cache yoluyla üretilir; her `(şehir, bütçe seviyesi)` için en fazla 100 örnek toplanır, sayısal alanlarda median ile birleştirilir. Çoklu para birimi (yerel + USD + EUR), ülke kodu Geocoding'den otomatik tespit edilir.

## Teknoloji Yığını

- **Backend:** Node.js + Express (REST API, port 3001) + Socket.io (chat WebSocket)
- **Frontend:** React 19 + Vite (port 5173) + react-i18next (TR/EN) + react-datepicker + lucide-react ikonlar
- **Veritabanı:** PostgreSQL 16 (Docker, port 5432) — kalkışta otomatik migration
- **Dış servisler:**
  - Google Places API (Text Search + Geocoding + Photo proxy)
  - OpenAI API (gpt-4o-mini, JSON mode plan üretimi + streaming chat)
  - Open-Meteo (hava durumu, anahtarsız)
  - open.er-api.com (çoklu base para birimi döviz kurları, 1 saat in-memory cache)
- **Harita:** Mapbox GL JS + react-map-gl (görselleştirme, rota polyline, 3D pitch); mekan verisi ve fotoğraflar Google Places API ile gelmeye devam eder (hibrit mimari)

## Proje Yapısı

```
backend/
  src/
    index.js                  # Express + http server, Socket.io, migration runner
    config/
      db.js                   # PostgreSQL bağlantı havuzu (pg)
      migrate.js              # database/migrations/*.sql dosyalarını sırayla uygular
    routes/
      places.js               # /api/places: search, restaurants, lookup, photo proxy
      planner.js              # /api/planner: generate (tek atış) + prepare + llm (3 aşama)
      trips.js                # /api/trips: CRUD + plan güncelleme
      routes.js               # /api/routes: featured culture routes
      chat.js                 # /api/chats: session/history/updates okuma
    services/
      placesService.js        # Google Places + Geocoding çağrıları
      filterService.js        # Puan/bütçe/ilgi filtresi + ağırlıklı skor
      routeOptimizer.js       # Coğrafi kümeleme + nearest-neighbor TSP, gün-içi çap sınırı
      llmService.js           # OpenAI plan üretimi (JSON mode)
      chatService.js          # Socket.io chat handler + plan update protokolü
      budgetService.js        # Bütçe yönlendirici: TR şehri → curated; diğer → cityDataService
      cityDataService.js      # TR dışı şehirler için LLM-üretim + cache + 3-örnek ensemble (median)
      exchangeRateCache.js    # Çoklu base para birimi döviz kurları (1 saat in-memory cache)
      weatherService.js       # Open-Meteo günlük hava tahmini
    models/
      tripModel.js            # trips + saved_plans sorguları
      chatModel.js            # chat_sessions + chat_messages + plan_updates sorguları
      cityDataModel.js        # city_prices_cache + city_tips_cache CRUD
    middleware/
      errorHandler.js         # Merkezi hata yakalayıcı
    data/
      cultureRoutes.json      # Anasayfada öne çıkan kültür rotaları
      countryInfo.json        # ISO 3166-1 → { name, currency } haritası (~250 ülke)
      defaultPrices.json      # LLM tamamen başarısızsa generic USD fallback
      defaultTips.json        # LLM tamamen başarısızsa generic TR/EN ipuçları
  scripts/
    buildWorldCitiesList.js   # GeoNames cities15000 → frontend/src/data/worldCities.json

database/
  migrations/
    001_initial.sql           # trips + saved_plans
    002_chat_tables.sql       # chat_sessions + chat_messages + plan_updates
    003_world_data_cache.sql  # city_prices_cache + city_tips_cache (LLM ensemble cache)
    004_saved_plan_snapshots.sql  # saved_plans.budget_estimate + city_info JSONB
    005_budget_level_cache.sql    # city_prices_cache UNIQUE → (city_key, budget_level)
    006_trip_dates.sql            # trips.start_date + end_date (hava durumu açılışta canlı çekme)

frontend/
  src/
    main.jsx                  # React kök
    App.jsx                   # ThemeProvider + BrowserRouter (Navbar /result rotasında gizli)
    index.css                 # Tek dosya CSS, CSS değişkenleri (light/dark tema)
    i18n/
      index.js                # i18next kurulumu (localStorage'dan dil oku)
      locales/{tr,en}.json    # Çeviri dosyaları
    context/
      ThemeContext.jsx        # Açık/koyu tema sağlayıcı
    pages/
      HomePage.jsx            # Hero + TripForm + FeaturedRoutes
      ResultPage.jsx          # DailyPlan + MapView + ChatPanel + BudgetSummary + CityTips
      SavedTripsPage.jsx      # Kayıtlı geziler grid
    components/
      Navbar.jsx              # Üst nav (dil + tema toggle)
      TripForm.jsx            # Şehir/gün/tarih/bütçe/ilgi formu
      MapView.jsx             # Mapbox GL + Marker + Popup + GeoJSON polyline + FAB grubu wrapper
      MapFabGroup.jsx         # Sag-alt FAB grubu: kategori filtresi, 3D pitch, tema cycle, rota toggle
      DailyPlan.jsx           # Gün sekmeleri + aktif gün kartı
      DayCard.jsx             # Tek gün: morning / lunch / afternoon / dinner
      ChatPanel.jsx           # Socket.io ile streaming chat + plan guncelleme; floating=true ile react-draggable yuzen kart
      BudgetSummary.jsx       # Bütçe tahmini kartı
      CityTips.jsx            # Şehir ipuçları paneli
      FeaturedRoutes.jsx      # Anasayfa kültür rotaları
      LoadingSpinner.jsx      # 3 aşamalı animasyonlu yükleme
      Toast.jsx               # Başarı/hata bildirimi
    services/
      api.js                  # Axios instance + tüm REST çağrıları
      chatSocket.js           # socket.io-client + clientUuid yönetimi
    data/
      worldCities.json        # GeoNames türevi top ~5000 dünya şehri (otomatik tamamlama)
      mapStyles.js            # Mapbox style URL'leri (light/dark/streets/satellite) + DAY_COLORS
      markerCategories.js     # Google Places types[] -> kategori -> renk haritasi (restaurant/cafe/museum/landmark/shopping/transit/attraction)
```

## Projeyi Çalıştırma

Kök dizinde `start.bat` yoktur; tüm yönetim `helper.bat` üzerinden yapılır.

```bash
# İlk kurulum (npm install + docker build)
helper.bat → [i] Ilk Kurulum

# Hepsini başlat (DB + Backend + Frontend)
helper.bat → [1] Tumunu Baslat

# Tek tek
docker-compose up -d postgres      # Veritabanı (migration'lar backend kalkışında çalışır)
cd backend && npm run dev           # API: http://localhost:3001
cd frontend && npm run dev          # Web: http://localhost:5173
```

## API Uç Noktaları

### REST

| Method | Endpoint | Body / Query | Açıklama |
|--------|----------|--------------|----------|
| GET    | `/api/health` | — | Sağlık kontrolü |
| POST   | `/api/places/search` | `{ city, interests, language }` | Mekan arama (Text Search + Geocoding bias) |
| POST   | `/api/places/restaurants` | `{ city, budget, language }` | Restoran arama |
| POST   | `/api/places/lookup` | `{ name, city, language }` | Tek mekan adı → koordinat/detay |
| POST   | `/api/weather` | `{ lat, lng, startDate, endDate }` | Canlı hava tahmini (kayıtlı gezi açılışında) |
| GET    | `/api/places/photo/:ref` | — | Photo proxy (API anahtarını gizler, 24 saat cache) |
| POST   | `/api/planner/generate` | `{ city, days, budget, interests, language?, startDate?, endDate? }` | Tam pipeline tek atışta |
| POST   | `/api/planner/prepare` | `{ ..., rawPlaces, rawRestaurants }` | Adım 2: filter + optimize + budget + tips + weather |
| POST   | `/api/planner/llm` | `{ ..., places, restaurants, optimizedPlaces, optimizedRestaurants, maxDailyDiameterKm }` | Adım 3: yalnız LLM ile günlük plan |
| POST   | `/api/trips` | `{ city, days, budget, interests, planText, placesJson, restaurantsJson }` | Trip + plan kaydet |
| GET    | `/api/trips` | — | Kayıtlı tripleri listele |
| GET    | `/api/trips/:id` | — | Tek trip detayı |
| PUT    | `/api/trips/:id/plan` | `{ planText, placesJson, restaurantsJson }` | Mevcut planı güncelle (chat sonrası) |
| GET    | `/api/routes/featured` | — | Öne çıkan kültür rotaları |
| GET    | `/api/routes/:slug` | — | Tek rota detayı |
| GET    | `/api/chats/sessions/:tripId` | `?clientUuid=&language=` | Trip için chat session + son mesajlar |
| GET    | `/api/chats/sessions/:tripId/updates` | — | Trip'e uygulanmış tüm plan değişiklikleri |

Frontend, hızlı ve aşamalı geri bildirim için `/planner/generate` yerine 3-aşamalı orkestrasyonu (`generatePlanWithProgress`) kullanır: önce paralel `places.search` + `places.restaurants`, sonra `/planner/prepare`, son olarak `/planner/llm`. `LoadingSpinner` adımları sırayla gösterir.

### Socket.io (Chat)

Aynı portta (`http://localhost:3001`). Olaylar:

- **Client → Server**
  - `chat:init` `{ tripId, clientUuid, language }` — session aç/oluştur
  - `chat:message` `{ message, planData, language, tripId, clientUuid }` — yeni soru
- **Server → Client**
  - `chat:history` `{ sessionId, messages }` — init sonrası geçmiş
  - `chat:token` `{ content }` — streaming token
  - `chat:done` — yanıt bitti
  - `chat:error` `{ message }` — hata

LLM yanıtının sonunda `[PLAN_UPDATE]{...}[/PLAN_UPDATE]` JSON bloğu varsa `chatService` bunu parse edip `plan_updates` tablosuna yazar; frontend de planı yerinde günceller. Bu blok ZORUNLU bir protokoldür — `llmService` ve `chatService` system prompt'larında detayı vardır, korunmalıdır.

## Ortam Değişkenleri

**backend/.env:**
```
PORT=3001
DATABASE_URL=postgresql://genieroute:genieroute123@localhost:5432/genieroute
GOOGLE_PLACES_API_KEY=...
OPENAI_API_KEY=...
```

**frontend/.env:**
```
VITE_API_URL=http://localhost:3001/api
VITE_GOOGLE_MAPS_KEY=...
VITE_MAPBOX_TOKEN=pk....   # https://account.mapbox.com/access-tokens (ucretsiz, harita gorsellestirme icin)
```

Open-Meteo ve döviz kuru API'si anahtarsız çalışır.

## Veritabanı Şeması (PostgreSQL)

Migration dosyaları `database/migrations/` altında, isimleri sıralıdır (`001_*.sql`, `002_*.sql`...). Backend her kalkışta `runMigrations()` ile uygular; manuel müdahaleye gerek yok. Tablolar:

- **trips** — `(id, city, days, budget, interests JSONB, start_date, end_date, created_at)`
- **saved_plans** — `(id, trip_id FK→trips ON DELETE CASCADE, plan_text JSONB, places_json, restaurants_json, created_at)`
- **chat_sessions** — `(id, trip_id FK, client_uuid, language, created_at, last_activity)`
- **chat_messages** — `(id BIGSERIAL, session_id FK ON DELETE CASCADE, role 'user'|'assistant', content, tokens_used, created_at)`
- **plan_updates** — `(id BIGSERIAL, session_id FK, message_id FK→chat_messages ON DELETE SET NULL, trip_id FK, action, day_number, time_slot, changes_json JSONB, applied_at)`
- **city_prices_cache** — `(id, city_key, budget_level, city_display, country_code, currency_code, samples JSONB, merged JSONB, sample_count, created_at, updated_at)` — TR dışı şehirler için LLM-üretimli fiyat tablosu. UNIQUE `(city_key, budget_level)` — her budget tipi (low/medium/high) bağımsız sample havuzu; 100-örnek ensemble + median
- **city_tips_cache** — `(id, city_key UNIQUE, city_display, country_code, samples JSONB, merged JSONB, sample_count, created_at, updated_at)` — TR dışı şehirler için LLM-üretimli ipuçları (budget'a bağlı değil), 100-örnek geçmişi tutar; "merged" en son örnek

## Kodlama Kuralları

- **UI metinleri:** Türkçe karakterlerle (ş, ç, ö, ü, ğ, ı, İ). ASCII bozulması yapma — "Olustur" değil "Oluştur"; "Sehir" değil "Şehir"; "gun" değil "gün". Tek istisna: `helper.bat` (Windows konsol cp857 sorunu).
- **Çoklu dil:** Tüm UI metinleri `frontend/src/i18n/locales/{tr,en}.json` üzerinden. Hardcoded metin ekleme — yeni metni iki dilde de eklemen gerekir.
- **Değişken ve fonksiyon adları:** İngilizce.
- **Yorum satırları:**
  - **Türkçe** yaz (Türkçe karakterlerle).
  - **Sadece gerektiğinde** yaz: niyet ya da "neden" açık değilse, ince bir kısıt/varsayım varsa, tuhaf bir geçici çözüm varsa. İyi adlandırılmış kod açıklama gerektirmez.
  - "Ne yaptığını" değil, "neden öyle yaptığını" anlat. Kodun zaten söylediği şeyi tekrar etme.
  - Mevcut yorumlar ağırlıkla Türkçe — bu standardı koru.
- **CSS:** `frontend/src/index.css` içinde vanilla CSS + CSS değişkenleri (light/dark tema). Tailwind yok, CSS modules yok.
- **State:** Yalnızca React `useState` / `useEffect` / Context API. Redux veya Zustand yok. Tema için `ThemeContext`, dil için `useTranslation`.
- **Routing:** react-router-dom v7. `/result` rotasında Navbar gizlenir (full-screen layout için).
- **HTTP:** Tüm REST çağrıları `frontend/src/services/api.js` üzerinden axios ile; chat için `chatSocket.js` üzerinden socket.io-client.
- **Backend deseni:** `routes → services → models`. Route'lar yalnız HTTP/validation; iş mantığı `services/`; SQL ise `models/`.
- **Hata yönetimi:** Route'larda `try/catch`, hatayı `next(err)` ile `errorHandler` middleware'ine geçir. Servislerde hata fırlat, route yakalasın.
- **Validasyon:** Sınır değerleri route seviyesinde kontrol et (ör. `validatePlanInput` — `days 1-14`, `budget low|medium|high`, `interests 1-8 madde`, `city ≤100 char`).

## Önemli Notlar

- LLM prompt'u GPT'ye **YALNIZCA** API'den gelen mekanları kullanmasını söyler — uydurma (hallucinated) lokasyon kabul edilmez. Bu kural `llmService` ve `chatService` system prompt'larında korunmalıdır.
- Places API yanlış şehir sonuçlarını engellemek için **Geocoding bias** ile çağrılır.
- Sonuçlar şu şemaya normalize edilir: `{ name, address, rating, lat, lng, photoUrl, priceLevel, types, placeId }`.
- `filterService` `rating * log10(userRatingsTotal)` ağırlıklı skoru ile sıralar ve gün başına sınır koyar. Ayrıca **turistik olmayan POI'leri eler** (`isTouristicPlace`): hastane, mağaza, banka, benzinlik gibi tipler turistik bir "çapa" tipi yoksa havuzdan çıkarılır.
- **Gün dengeleme:** Kaliteli mekan sayısı gün sayısının çok altındaysa (`planner.computeEffectiveDays`, gün başına ~2 atraksiyon), plan günleri gerçekçi seviyeye indirilir; yanıt `trip.days = effectiveDays` döner ve `reduced_days` bildirimi gösterilir. Atraksiyon havuzu zaten `mustSeeService` (LLM-curated + Places lookup) ile zenginleştirilir.
- **Toplu taşıma gerçekliği:** `llmService.assessCityHasTransit` ile şehirde anlamlı toplu taşıma olup olmadığı (tek hafif LLM çağrısı) belirlenir; yoksa `routeOptimizer.legModeAndSpeed` 'transit' bacaklarını yürüyüş (kısa) / araç (uzun) olarak gösterir. Mod hiyerarşisi: `walking` sadece yürüme; `transit` kısa bacak yürüme + üstü toplu taşıma; `car`/`mixed` kısa yürüme + orta toplu taşıma + uzun araç.
- `routeOptimizer` haversine + nearest-neighbor ile günleri kümeler; gün-içi maksimum çap dinamik olarak şehir geocode viewport'undan hesaplanır (`computeCityRadiusKm`). Gün çapına sığmayan outlier yerler: boş gün varsa oraya yerleştirilir, aksi halde en yakın gün centroid'i bile çapı aşıyorsa **plandan düşürülür** (kopuk/uzak bağımsız noktaları engellemek için). Aday havuzu da şehir merkezine `max(35 km, yarıçap×3)` eşiğiyle sınırlanır (`planner` → `filterService.pruneByDistance`).
- Photo URL'leri `/api/places/photo/:ref` proxy'si üzerinden gelir — Google API anahtarı browser'a sızmaz.
- **Kullanıcı hesabı yok** — tripler anonim. Chat session'ları `localStorage`'daki `genieroute-client-uuid` ile aynı tarayıcıya bağlanır.
- Google Places API faturalama gerektirir (aylık 200$ ücretsiz kredi vardır).
- OpenAI plan üretimi `response_format: { type: 'json_object' }` ile yapılandırılmış çıktı kullanır; chat ise streaming çalışır.
- `budgetService` şehir adını normalize eder (diakritik temizleme + lowercase + parantez içlerini kaldırma). Tüm şehirler — Türkiye dahil — `cityDataService.getPricesForCity({ ..., budgetLevel })` çağrısıyla LLM yolundan geçer: OpenAI gpt-4o-mini JSON mode ile fiyat tablosu üretir, PostgreSQL `city_prices_cache`'e `(city_key, budget_level)` anahtarıyla kaydedilir, ülkenin yerel para biriminde döner. Aynı `(şehir, budget_level)` için 100 farklı isteğe kadar yeni LLM örneği üretir; `merged` her sayısal yaprak için median alınarak hesaplanır (halüsinasyon outlier'larına karşı dayanıklı). `dailyRange = { min, max }` 2+ sample varsa frontend'de "± aralık" rozeti olarak görünür. LLM tamamen başarısız olursa `defaultPrices.json` (USD bazlı generic) kullanılır.
- Tips için aynı mimari: tüm şehirler `cityDataService.getTipsForCity` → `city_tips_cache` (text alanlarda median anlamsız olduğu için en son örnek `merged` olur). LLM hata verirse `defaultTips.json` döner.
- Currency conversion: `exchangeRateCache.getExchangeRates(baseCurrency)` herhangi bir base'i destekler (TR→TRY, FR→EUR, JP→JPY, vb.). `countryInfo.json` ISO 3166-1 → para birimi haritası içerir; ülke kodu `placesService.geocodeCity` response'undaki `address_components.country.short_name`'den çıkarılır.
- `frontend/src/data/worldCities.json` GeoNames cities15000'den (CC-BY 4.0) türetilmiştir; `npm run build:cities` ile yeniden üretilebilir. Ek atıf: `attribution.cities` i18n key'iyle anasayfa altında görünür.
