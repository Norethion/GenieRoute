# Gelecek Özellikler (Roadmap)

Vacanza (`production.vacanza.app/map`) incelemesinde tespit edilen, henüz uygulanmamış ve ileride değerlendirilecek özellikler. Bu dosya uygulanmamış fikir/kapsam notlarını içerir.

## 1. Draw-on-map ile günü yeniden planlama

**Ne:** Kullanıcı harita üzerinde bir alan (poligon) çizer, "bu günü bu bölgeye göre yeniden planla" der; o günün durakları çizilen alana göre yeniden seçilir/sıralanır.

**Vacanza'daki karşılığı:** Sohbet kartındaki "Redraw — Draw on map" bölümü ("Draw an area, then select the day to reschedule").

**Gerekecekler (tahmini):**
- Frontend: Mapbox GL Draw (`@mapbox/mapbox-gl-draw`) ile poligon çizimi; çizilen alanın bbox/merkez koordinatları.
- Backend: `routeOptimizer`'a "verilen bbox içindeki adayları o güne ata" kısıtı; ya da yeni bir `/planner/reschedule-day` ucu.
- Etkileşim: gün seçimi + çizim + onay akışı; mevcut `[PLAN_UPDATE]` protokolüyle veya yeni bir aksiyon türüyle entegrasyon.

**Maliyet/öncelik:** Orta-yüksek (yeni harita etkileşimi + optimizer kısıtı). İleri faz.

## 2. Otel & Uçak booking (3. parti entegrasyonlar)

**Ne:** Rota duraklarına/şehre göre satılabilir tur, otel ve uçak önerileri; tarihe göre etkinlikler.

**Vacanza'daki karşılığı:**
- "Book Flights & Hotels" üst-nav butonu
- "Museum & tour prices" — Viator (rota duraklarına göre tur/müze bileti fiyatları)
- "Event Recommendations" — Ticketmaster (tarihe göre konser/spor/etkinlik, tercihe göre sıralı)

**Gerekecekler (tahmini):**
- Dış servis hesapları/affiliate anlaşmaları (Viator, Ticketmaster, uçuş/otel sağlayıcısı).
- Backend: her servis için proxy uç + cache; tarih/şehir/durak bazlı sorgu.
- Frontend: rota kartında genişleyebilir "fiyatlar / etkinlikler" bölümleri.

**Maliyet/öncelik:** Yüksek (gelir/affiliate odaklı, dış bağımlılık). Şimdilik kapsam dışı.

---

> Not: Bu maddeler bilinçli olarak ertelendi.
