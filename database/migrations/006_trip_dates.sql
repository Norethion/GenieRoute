-- Migration 006: trips'e gezi tarihlerini ekler (start_date, end_date).
-- Hava durumu tahmini tarihe bağlıdır ve eskidiği için DB'ye snapshot olarak
-- KAYDEDİLMEZ; bunun yerine kayıtlı gezi açıldığında bu tarihler kullanılarak
-- Open-Meteo'dan CANLI yeniden çekilir (tahmin penceresi içindeyse).

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;
