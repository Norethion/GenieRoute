import { test, expect } from '@playwright/test';
import { seedMockTrip } from './fixtures.js';

// Test 2: Chat preview/cancel/confirm akışı
//
// ÖN ŞART: Backend (localhost:3001) açık olmalı ve gerçek bir tripId DB'de
// kayıtlı olmalı (chat session başlatılabilsin diye). Mock seedTrip yapıldıktan
// sonra "Save" butonuna tıklayıp tripId'yi alıyoruz.
//
// Bu test gerçek OpenAI çağrısı yapar (gpt-4o-mini, ~$0.001 / istek).
//
// Akış:
// - Önizle → İptal → state revert
// - Önizle → Onayla → DB save + applied tag
// - Sayfa yenile → applied tag persist (DB-tracking doğrulaması)

test.describe('Chat preview/cancel/confirm akışı', () => {
  test.beforeEach(async ({ page }) => {
    await seedMockTrip(page);
    await page.goto('/result');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Trip'i kaydet — chat session DB'de oluşsun diye
    await page.getByRole('button', { name: /^Save$|^Kaydet$/ }).click();
    await page.waitForTimeout(2000);
  });

  test('Önizle → İptal → eski state geri gelir', async ({ page }) => {
    // Chat mesajı gönder
    const input = page.getByRole('textbox', { name: /Type your message|Mesajınızı yazın/ });
    await input.fill('Hacı Arif Bey yerine Mado restoranını öner.');
    await page.locator('.chat-send-btn').click();

    // LLM streaming bitmesini ve Preview butonunun çıkmasını bekle
    await page.getByRole('button', { name: /Preview|Önizle/ }).waitFor({ state: 'visible', timeout: 45_000 });

    // Önizle tıkla
    await page.getByRole('button', { name: /Preview|Önizle/ }).click();

    // Day 1 Lunch artık Mado olmalı (önizleme uygulandı)
    await expect(page.getByText('Mado').first()).toBeVisible();

    // Onayla + İptal butonları görünür
    await expect(page.getByRole('button', { name: /Confirm|Onayla/ })).toBeVisible();

    // İptal
    await page.getByRole('button', { name: /^cancel$/ }).click();

    // Eski yer geri gelmeli (Hacı Arif Bey)
    await expect(page.getByText('Hacı Arif Bey').first()).toBeVisible({ timeout: 5_000 });

    // Preview butonu tekrar görünmeli
    await expect(page.getByRole('button', { name: /Preview|Önizle/ })).toBeVisible();
  });

  test('Önizle → Onayla → applied tag DB-persist (sayfa yenilense bile)', async ({ page }) => {
    const input = page.getByRole('textbox', { name: /Type your message|Mesajınızı yazın/ });
    await input.fill('Hacı Arif Bey yerine Mado restoranını öner.');
    await page.locator('.chat-send-btn').click();

    await page.getByRole('button', { name: /Preview|Önizle/ }).waitFor({ state: 'visible', timeout: 45_000 });

    // Önizle → Onayla
    await page.getByRole('button', { name: /Preview|Önizle/ }).click();
    await page.locator('.chat-apply-btn--confirm').click();

    // Applied tag görünmeli
    await expect(page.locator('.chat-applied-tag')).toBeVisible({ timeout: 5_000 });

    // Day 1 Lunch'ta Mado kalmalı
    await expect(page.getByText('Mado').first()).toBeVisible();

    // Sayfayı yenile — applied tag DB'den persist olmalı
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Mado hala kayıtlı (sessionStorage + DB save)
    await expect(page.getByText('Mado').first()).toBeVisible();
    // Applied tag DB-tracked (plan_updates.applied = true)
    await expect(page.locator('.chat-applied-tag')).toBeVisible();
    // Preview butonu görünmemeli (zaten uygulanmış)
    await expect(page.getByRole('button', { name: /Preview|Önizle/ })).toHaveCount(0);
  });

  test('"Yeni sohbet" backend session temizler — yenilemeden sonra mesajlar gelmez', async ({ page }) => {
    // Önce bir mesaj gönder
    const input = page.getByRole('textbox', { name: /Type your message|Mesajınızı yazın/ });
    await input.fill('Test mesajı: Anıtkabir hakkında kısa bilgi ver.');
    await page.locator('.chat-send-btn').click();

    // Streaming bitmesini bekle (Mesaj message-bubble içinde tamamen gelmiş)
    await page.waitForTimeout(20_000);

    // "+" yeni sohbet butonu (chat header'da)
    await page.getByRole('button', { name: 'new chat' }).click();

    // UI temizlenmiş olmalı — welcome ekran tekrar gelir
    await expect(page.locator('.chat-welcome')).toBeVisible();

    // Sayfayı yenile — DB'de de mesajlar silindiği için welcome screen kalır
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await expect(page.locator('.chat-welcome')).toBeVisible();
    await expect(page.locator('.chat-message')).toHaveCount(0);
  });
});
