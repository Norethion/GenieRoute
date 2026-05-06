# GenieRoute AI - API Anahtarları Kurulum Rehberi

Bu projede 2 harici API kullanılmaktadır. Aşağıdaki adımları takip ederek API anahtarlarını alabilirsiniz.

---

## 1. Google Cloud — Places API + Maps JavaScript API

Google Cloud üzerinden hem mekan verilerini çekmek (Places API) hem de haritayı göstermek (Maps JavaScript API) için **tek bir API key** yeterlidir.

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
2. **Maps JavaScript API** — Arama kutusuna "Maps JavaScript API" yazın → Seçin → **Enable** (Etkinleştir)

### Adım 5: API Key oluşturun
- Sol menüden **APIs & Services > Credentials** (Kimlik Bilgileri) seçin
- Üstteki **+ CREATE CREDENTIALS** butonuna tıklayın
- **API key** seçin
- Oluşturulan key ekranda görünecek — kopyalayın

### Adım 6: API Key'i kısıtlayın (önerilen)
Oluşturulan key'e tıklayarak düzenleme sayfasına gidin:

**Application restrictions (Uygulama kısıtlaması):**
- Geliştirme aşamasında: "None" bırakabilirsiniz
- Yayınlama aşamasında: "HTTP referrers" seçip `localhost:*` ekleyin

**API restrictions (API kısıtlaması):**
- "Restrict key" seçin
- Listeden şunları işaretleyin:
  - Places API
  - Maps JavaScript API
- "Save" tıklayın

### Adım 7: Key'i projeye ekleyin
Kopyaladığınız API key'i 2 yere yazın:

**backend/.env:**
```
GOOGLE_PLACES_API_KEY=AIzaSy...........buraya_yapiştirin
```

**frontend/.env:**
```
VITE_GOOGLE_MAPS_KEY=AIzaSy...........ayni_key
```

> Her iki dosyada da aynı key kullanılabilir. Backend Places API için, frontend Maps görüntülemesi için kullanır.

---

## 2. OpenAI API — GPT-4o-mini

OpenAI API üzerinden LLM ile günlük seyahat rotası üretilecektir.

### Adım 1: OpenAI hesabı oluşturun
- https://platform.openai.com adresine gidin
- "Sign up" ile hesap oluşturun veya mevcut hesabınızla giriş yapın
- **NOT:** Bu ChatGPT hesabınızdan farklıdır. platform.openai.com üzerinden ayrıca kayıt/giriş gerekebilir

### Adım 2: Kredi yükleyin
- Sol menüden **Settings > Billing** seçin
- "Add payment method" ile kredi kartı ekleyin
- $5-10 arası kredi yükleyin (proje için fazlasıyla yeterli)
- **Maliyet tahmini:** gpt-4o-mini modeli çok ucuzdur
  - 1 plan üretimi yaklaşık ~2000 token kullanır
  - 1 milyon token = ~$0.15 (input) + ~$0.60 (output)
  - Yani 1000 plan üretseniz bile ~$1-2 arası tutar

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

## Özet: .env Dosyaları

Tüm key'leri aldıktan sonra dosyalarınız şöyle görünmeli:

### backend/.env
```
PORT=3001
DATABASE_URL=postgresql://genieroute:genieroute123@localhost:5432/genieroute
GOOGLE_PLACES_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### frontend/.env
```
VITE_API_URL=http://localhost:3001/api
VITE_GOOGLE_MAPS_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
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
