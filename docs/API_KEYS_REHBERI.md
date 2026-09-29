# GenieRoute AI - API Anahtarları Kurulum Rehberi

Bu projede 3 harici servis kullanılır: Google Cloud (mekan ve konum), OpenAI (plan ve sohbet) ve Mapbox (harita).
Aşağıdaki adımları takip ederek anahtarları alabilirsiniz.

---

## 1. Google Cloud — Places API + Geocoding API

Backend, mekan verileri ve fotoğraflar için Places API'yi, konum bulmak için Geocoding API'yi **tek bir API key** ile çağırır.
Harita Mapbox ile çizildiği için Maps JavaScript API gerekmez.

### Adım 1: Google Cloud Console'a giriş
- https://console.cloud.google.com adresine gidin
- Google hesabınızla giriş yapın
- Hesabınız yoksa ücretsiz oluşturun

### Adım 2: Yeni proje oluşturun
- Sol üstteki proje seçiciye tıklayın
- "New Project" (Yeni Proje) butonuna tıklayın
- Proje adı: `GenieRoute` (istediğiniz adı verebilirsiniz)
- "Create" (Oluştur) butonuna tıklayın
- Proje oluşturulduktan sonra o projeyi seçin

### Adım 3: Faturalandırmayı etkinleştirin
- Sol menüden **Billing** (Faturalandırma) seçin
- Bir faturalandırma hesabı bağlayın (kredi kartı gerekli)
- **NOT:** Google her ay $200 ücretsiz kredi verir. Normal kullanımda bu projeyi ücretsiz çalıştırabilirsiniz
- Kişisel kullanım ve geliştirme için bu kredi fazlasıyla yeterlidir

### Adım 4: API'leri etkinleştirin
Sol menüden **APIs & Services > Library** (API Kitaplığı) yolunu izleyin ve aşağıdaki 2 API'yi arayıp etkinleştirin:

1. **Places API** — Arama kutusuna "Places API" yazın → Seçin → **Enable** (Etkinleştir)
2. **Geocoding API** — Arama kutusuna "Geocoding API" yazın → Seçin → **Enable** (Etkinleştir)

### Adım 5: API Key oluşturun
- Sol menüden **APIs & Services > Credentials** (Kimlik Bilgileri) seçin
- Üstteki **+ CREATE CREDENTIALS** butonuna tıklayın
- **API key** seçin
- Oluşturulan key ekranda görünecek — kopyalayın

### Adım 6: API Key'i kısıtlayın (önerilen)
Oluşturulan key'e tıklayarak düzenleme sayfasına gidin:

**Application restrictions (Uygulama kısıtlaması):**
- Key yalnız backend'den çağrıldığı için "HTTP referrers" kısıtlaması kullanmayın; bu kısıtlama sunucu isteklerini reddettirir
- Geliştirme aşamasında "None" bırakabilir, yayınlama aşamasında "IP addresses" seçip sunucunun IP adresini ekleyebilirsiniz

**API restrictions (API kısıtlaması):**
- "Restrict key" seçin
- Listeden şunları işaretleyin:
  - Places API
  - Geocoding API
- "Save" tıklayın

### Adım 7: Key'i projeye ekleyin
Kopyaladığınız API key'i yalnız backend'e yazın:

**backend/.env:**
```
GOOGLE_PLACES_API_KEY=AIzaSy...........buraya_yapiştirin
```

> Google key'ini frontend'e eklemeyin; mekan ve fotoğraf istekleri backend üzerinden geçer.

---

## 2. OpenAI API

OpenAI API günlük seyahat planını ve sohbet yanıtlarını üretir.
Varsayılan modeller `backend/src/config/models.js` içindedir; `backend/.env` içinde `OPENAI_PLAN_MODEL`, `OPENAI_CHAT_MODEL` ve `OPENAI_HELPER_MODEL` ile değiştirilebilir.

### Adım 1: OpenAI hesabı oluşturun
- https://platform.openai.com adresine gidin
- "Sign up" ile hesap oluşturun veya mevcut hesabınızla giriş yapın
- **NOT:** Bu ChatGPT hesabınızdan farklıdır. platform.openai.com üzerinden ayrıca kayıt/giriş gerekebilir

### Adım 2: Kredi yükleyin
- Sol menüden **Settings > Billing** seçin
- "Add payment method" ile kredi kartı ekleyin
- $5-10 arası kredi yükleyin (proje için fazlasıyla yeterli)
- **Maliyet:** Kullanılan modellerin güncel fiyatları için https://openai.com/api/pricing sayfasına bakın

### Adım 3: API Key oluşturun
- Sol menüden **API keys** seçin (veya https://platform.openai.com/api-keys adresine gidin)
- **+ Create new secret key** butonuna tıklayın
- İsim verin: `genieroute` (opsiyonel)
- **Create secret key** tıklayın
- Oluşturulan key'i hemen kopyalayın
- **ÖNEMLİ:** Bu key sadece bir kez gösterilir! Kopyalamadan kapatırsanız yeni key oluşturmanız gerekir

### Adım 4: Key'i projeye ekleyin

**backend/.env:**
```
OPENAI_API_KEY=sk-proj-...........buraya_yapiştirin
```

> OpenAI key sadece backend'de kullanılır. Frontend'e eklemeyin — güvenlik riski oluşturur.

---

## 3. Mapbox — Harita

Frontend haritayı Mapbox GL JS ile çizer ve bir public access token ister.

- https://account.mapbox.com/access-tokens/ adresinde hesap açın ve varsayılan public token'ı kopyalayın
- Token'ı `frontend/.env` dosyasına yazın:

```
VITE_MAPBOX_TOKEN=pk.eyJ1...........buraya_yapiştirin
```

> Bu token tarayıcıya gönderilir; Mapbox hesabında URL kısıtlamasıyla yalnız kendi adreslerinize açabilirsiniz.

---

## Özet: .env Dosyaları

Tüm key'leri aldıktan sonra dosyalarınız şöyle görünmeli:

### backend/.env
```
PORT=3001
DATABASE_URL=postgresql://genieroute:genieroute123@localhost:5435/genieroute
GOOGLE_PLACES_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### frontend/.env
```
VITE_API_URL=http://localhost:3001/api
VITE_MAPBOX_TOKEN=pk.eyJ1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Sık Karşılaşılan Sorunlar

### "This API key is not authorized"
- Google Cloud Console'da ilgili API'lerin etkinleştirildiğinden emin olun
- API key kısıtlamalarını kontrol edin

### "You exceeded your current quota" (OpenAI)
- Billing sayfasından kredi yükleyin
- Kullanım limitlerini kontrol edin: Settings > Limits

### "Billing account not found" (Google)
- Faturalandırma hesabı bağlanmamış — Billing sayfasından kredi kartı ekleyin
- Ücretsiz deneme süresi aktif olmayabilir

### "REQUEST_DENIED" (Places API)
- Places API etkinleştirilmemiş olabilir
- API & Services > Library'den "Places API"yi etkinleştirin
- Key oluşturduktan sonra birkaç dakika bekleyin (yayılma süresi)

### API key'im çalınırsa ne olur?
- Google Cloud Console'dan key'i hemen silin ve yeni oluşturun
- OpenAI Dashboard'dan key'i revoke edin
- `.env` dosyaları `.gitignore`'da olduğu için GitHub'a push edilmez
- **Asla** API key'lerinizi kod içine yazmayın, her zaman `.env` kullanın
