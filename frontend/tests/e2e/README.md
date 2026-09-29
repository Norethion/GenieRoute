# E2E Testleri

Playwright tabanlı uçtan-uca testler.
Tüm etkileşimler **click + type** ile yapılır, `page.evaluate` yok.

## Ön Şartlar

1. **Backend açık:** `cd backend && npm run dev` → http://localhost:3001
2. **Postgres açık:** `docker-compose up -d postgres`
3. **Frontend dev:** `cd frontend && npm run dev -- --port 5174` → http://localhost:5174
4. **.env tamam:** `VITE_MAPBOX_TOKEN` set + `OPENAI_API_KEY` backend'de

Mapbox/Google API anahtarları olmadan testler harita render kontrollerinde başarısız olur.
Playwright `frontend/playwright.config.js` içindeki `baseURL` olarak 5174 kullanır ve dev sunucusunu kendisi başlatmaz; normal `npm run dev` ise Vite varsayılanı olan 5173 portunu kullanır.

## Çalıştırma

```bash
cd frontend
npm run test:e2e             # headless, terminal output
npm run test:e2e:ui          # Playwright UI mode (interactive)
npm run test:e2e:report      # HTML rapor (son koşudan)

# Tek dosya
npx playwright test tests/e2e/map-interactions.spec.js

# Tek test (grep)
npx playwright test -g "Önizle"
```

## Test Dosyaları

| Dosya | Kapsam |
|-------|--------|
| `map-interactions.spec.js` | Harita etkileşimleri: Tüm Günler default, Day 1 rota, pin popup, FAB grubu, kategori filtre toggle. **LLM/Backend gerektirmez** — sadece sessionStorage mock. |
| `chat-preview.spec.js` | Chat preview/cancel/confirm akışı, plan-updates DB persistence, yeni sohbet reset. **OpenAI çağrısı yapar** (~$0.01/koşu). |

## Mock Data

`fixtures.js` mock bir Ankara 2-günlük seyahat planı içerir (5 marker: 2 müze + 1 cami + 2 restoran). `seedMockTrip(page)` ile testler `/result` sayfasına doğrudan girer; form doldurma adımı atlanır.

## Bilinen sınırlamalar

- `chat-preview.spec.js` testlerin tamamı tek bir backend session kullanır; paralel çalıştırma kapatıldı (`fullyParallel: false, workers: 1`).
- LLM cevabı bazı şehirler/sorularda farklı format dönerse `[PLAN_UPDATE]` bloğu parse edilemeyebilir → Preview butonu çıkmaz. Test bu durumda timeout ile başarısız olur.
- Mapbox Directions API rate limit'i 100k/ay; tek koşuda 3-5 istek atılır.
