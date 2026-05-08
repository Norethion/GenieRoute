-- Migration 004: saved_plans'a bütçe ve şehir ipuçları snapshot'ı ekler.
-- Trip kaydedildiği anki budgetEstimate (yerel kur, exchange rate, sample sayısı vs.)
-- ve cityInfo (TR/EN ipuçları) plan_text yanında saklanır; saved trip açıldığında
-- yeniden hesaplama yapılmaz, böylece LLM sample counter'ı bozulmaz ve fiyatlar
-- kullanıcı için "kayıttaki an"a sabitlenmiş olur.

ALTER TABLE saved_plans
  ADD COLUMN IF NOT EXISTS budget_estimate JSONB,
  ADD COLUMN IF NOT EXISTS city_info JSONB;
