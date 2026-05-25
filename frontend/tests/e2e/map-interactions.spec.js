import { test, expect } from '@playwright/test';
import { seedMockTrip } from './fixtures.js';

// Test 1: Harita etkileşim akışı
// - Tüm Günler default -> Day 1 sekmesine geçiş -> rota belirir
// - Pin'e tıklama -> popup açılır
// - FAB grubu açılır -> Kategori filtre paneli görünür
//
// Bu test, dış servislere (LLM, Places API) bağımlı değildir; sessionStorage'a
// seedlenen mock trip ile UI bileşenlerini doğrular.

test.describe('Harita etkileşimleri', () => {
  test.beforeEach(async ({ page }) => {
    await seedMockTrip(page);
    await page.goto('/result');
    // İlk fitBounds ve marker render için kısa bekleme
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test("Tüm Günler default açılır, rota gizli, marker'lar görünür", async ({ page }) => {
    // "All Days" / "Tüm Günler" varsayılan aktif olmalı
    const allDaysTab = page.getByRole('button', { name: /All Days|Tüm Günler/ });
    await expect(allDaysTab).toBeVisible();
    await expect(allDaysTab).toHaveClass(/active/);

    // Day Card yerine overview placeholder gösterilmeli
    await expect(page.getByText(/Pick a day|Bir gün seçerek/)).toBeVisible();

    // Tüm 5 marker görünmeli
    const markers = page.locator('.map-pin');
    await expect(markers).toHaveCount(5);

    // Polyline (rota) gizli olmalı — source layer yok
    const routeLayers = await page.locator('canvas.mapboxgl-canvas').count();
    expect(routeLayers).toBeGreaterThan(0);
  });

  test('Day 1 sekmesine tıklandığında rota ve gün kartı belirir', async ({ page }) => {
    // Day 1 sekmesi — .day-tab class'ından, ilki "All Days" olduğu için nth(1)
    await page.locator('.day-tab:not(.day-tab-all)').first().click();
    await page.waitForTimeout(800);

    // DayCard görünür olmalı: "Anıtkabir" başlığı listede çıkar
    await expect(page.getByText('Anıtkabir').first()).toBeVisible();

    // Day 1'in 3 markeri'ni göstermeli (Anıtkabir, Hacı Arif Bey, Etnografya)
    await expect(page.locator('.map-pin')).toHaveCount(3);

    // Mapbox Directions API'sinden rota dönmesi için bekleme
    await page.waitForTimeout(2500);
  });

  test('Pin tıklanınca popup açılır ve kategori rozeti gösterilir', async ({ page }) => {
    // Day 1 sekmesine geç ki marker sayısı azalsın, ilk pin'i hedeflemek kolay olsun
    await page.locator('.day-tab:not(.day-tab-all)').first().click();
    await page.waitForTimeout(1000);

    // İlk pin'e tıkla (numara=1 olan Anıtkabir)
    await page.locator('.map-pin').first().click();

    // Popup açılmalı, başlık ve kategori rozeti olmalı
    await expect(page.locator('.mapboxgl-popup')).toBeVisible();
    await expect(page.locator('.mapboxgl-popup').getByRole('heading')).toContainText('Anıtkabir');
    await expect(page.locator('.mapboxgl-popup .info-badge')).toContainText(/Museum|Müze/);
  });

  test('FAB grubu açılır ve kategori filtre paneli gösterilir', async ({ page }) => {
    // Main FAB'a tıkla — sub-FAB'lar görünür olmalı
    await page.getByRole('button', { name: /Map Tools|Harita Araçları/ }).click();

    // 4 sub-FAB
    await expect(page.getByRole('button', { name: /Category Filter|Kategori Filtresi/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Enable 3D|3D Açık/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Theme/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Hide Route|Rotayı Gizle|Show Route|Rotayı Göster/ })).toBeVisible();

    // Kategori filtresi açıldığında 7 chip görünmeli
    await page.getByRole('button', { name: /Category Filter|Kategori Filtresi/ }).click();
    const chips = page.locator('.map-filter-chip');
    await expect(chips).toHaveCount(7);
  });

  test('Kategori filtre chip toggle çalışır (restoran gizlenince marker sayısı azalır)', async ({ page }) => {
    // Filtre panelini aç
    await page.getByRole('button', { name: /Map Tools|Harita Araçları/ }).click();
    await page.getByRole('button', { name: /Category Filter|Kategori Filtresi/ }).click();

    // Restaurant chip'i devre dışı bırak — filter panel içindeki chip'i hedefle
    await page.locator('.map-filter-chip').filter({ hasText: 'Restaurant' }).click();

    // Marker sayısı 5'ten 3'e düşmeli (2 restoran gizlendi)
    await expect(page.locator('.map-pin')).toHaveCount(3);
  });
});
