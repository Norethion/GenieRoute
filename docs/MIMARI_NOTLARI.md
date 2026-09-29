# Mimari ve alan kuralları

Bu notlar davranışın gerekçesini özetler; güncel uygulama ayrıntıları için `backend/src/` ve `frontend/src/` kaynak alınır.

## Plan ve mekanlar

- Günlük planda yalnız Google Places ile bulunan veya Places lookup ile doğrulanan mekanlar kullanılmalıdır; LLM'nin uydurduğu konum kabul edilmez.
- `placesService` şehir Geocoding sonucunu aramaya bağlar ve fotoğrafları `/api/places/photo/:ref` üzerinden proxy eder; gizli Google anahtarı tarayıcıya aktarılmamalıdır.
- `filterService` düşük puanlı veya turistik olmayan adayları eler, `mustSeeService` ikonik yerleri destekler, `planner` yeterli mekan yoksa etkin gün sayısını düşürür.
- `routeOptimizer` günleri coğrafi yakınlığa göre kurar; şehir çapına uymayan uzak mekanlar gerektiğinde plandan çıkarılır, böylece kopuk günlük rotalar oluşmaz.
- Ulaşım modu şehirdeki gerçek toplu taşıma durumuna göre seçilir; toplu taşıma yoksa böyle bir rota önerilmemelidir.
- Fiyat ve ipucu üretimi şehir verisi cache'ine bağlıdır; sayısal fiyat örnekleri median ile birleştirilir ve para birimi Geocoding ülke kodundan bulunur.

## Sohbet ve veri

- `chatService` yanıt sonundaki `[PLAN_UPDATE]{...}[/PLAN_UPDATE]` bloğunu yorumlar; bu protokolü veya `llmService` prompt'larıyla uyumunu bozma.
- Sohbet değişiklikleri kullanıcıya önizleme olarak gösterilir; onay ve iptal akışı ile kalıcılık `plan_updates` verisine bağlıdır.
- Kullanıcı hesabı yoktur; geziler anonimdir ve sohbet oturumu aynı tarayıcıya `genieroute-client-uuid` ile bağlanır.
- Şema için sıralı `database/migrations/*.sql` dosyaları tek kaynaktır; backend bunları açılışta uygular.

## Arayüz ve anahtarlar

- Arayüz metinleri iki dil dosyasında birlikte tutulur: `frontend/src/i18n/locales/tr.json` ve `en.json`.
- Harita görselleştirmesi `VITE_MAPBOX_TOKEN` ile Mapbox kullanır; mekan ve fotoğraf verisi backend'deki Google Places çağrılarından gelir.
- OpenAI ve Google Places gizli anahtarları yalnız backend ortamında tutulur; frontend'e yazılmaz.
