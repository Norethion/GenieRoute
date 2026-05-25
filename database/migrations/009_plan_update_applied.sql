-- plan_updates tablosuna applied flag'i ekle.
-- Önceden plan_updates yalnızca BDM'in onerdigi degisikligi log ediyordu;
-- kullanicinin gercek "Apply" eylemini takip edilemiyordu. Bu kolon sayfa
-- yenilemesi sonrasi hangi onerinin gercekten uygulandigini bilmemize yarar.

ALTER TABLE plan_updates ADD COLUMN IF NOT EXISTS applied BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE plan_updates ADD COLUMN IF NOT EXISTS applied_actually_at TIMESTAMP NULL;

-- Mevcut tum satirlari uygulanmamis sayalim (DEFAULT FALSE ile zaten dusuyor,
-- bu daha cok dokümantasyon icin).
UPDATE plan_updates SET applied = FALSE WHERE applied IS NULL;
