// Merkezi OpenAI model konfigürasyonu + model-ailesi duyarlı parametre kurucu.
//
// Çağrı tipine göre model (hepsi .env'den override edilebilir):
//   - OPENAI_PLAN_MODEL   : kullanıcıya görünen günlük plan üretimi (llmService)
//   - OPENAI_CHAT_MODEL   : sohbet asistanı (chatService, streaming)
//   - OPENAI_HELPER_MODEL : iç yardımcı çağrılar (cityDataService fiyat/ipucu, mustSeeService)
//
// Hibrit GPT-5.4 ailesi: plan + sohbet kaliteli mini, iç yardımcılar ekonomik nano.
// .env ile override edilebilir; verilmezse aşağıdaki varsayılanlar kullanılır.
const PLAN_MODEL = process.env.OPENAI_PLAN_MODEL || 'gpt-5.4-mini';
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-5.4-mini';
const HELPER_MODEL = process.env.OPENAI_HELPER_MODEL || 'gpt-5.4-nano';

// gpt-5* ve o-serisi reasoning modelleri farklı parametre kuralları kullanır:
// temperature DESTEKLENMEZ (gönderince 400), max_tokens yerine max_completion_tokens,
// opsiyonel reasoning_effort (minimal|low|medium|high).
function isReasoningModel(model) {
  return /^(gpt-5|o[0-9])/i.test(model || '');
}

// chat.completions.create için ortak param kurucu — model ailesine göre uyarlar.
// Reasoning modellerde: temperature atılır, max_completion_tokens reasoning token'ları
// için headroom ile ayarlanır (gizli reasoning token'ları da bu bütçeden harcanır),
// reasoning_effort eklenir. Standart modellerde: mevcut max_tokens + temperature.
function buildChatParams(model, { messages, maxTokens, jsonMode = false, stream = false, temperature = 0.7, reasoningEffort = 'low' }) {
  const params = { model, messages };
  if (jsonMode) params.response_format = { type: 'json_object' };
  if (stream) params.stream = true;

  if (isReasoningModel(model)) {
    // +2000: görünür çıktının reasoning token'ları yüzünden kesilmemesi için tampon
    params.max_completion_tokens = (maxTokens || 1024) + 2000;
    if (reasoningEffort) params.reasoning_effort = reasoningEffort;
  } else {
    if (maxTokens) params.max_tokens = maxTokens;
    params.temperature = temperature;
  }
  return params;
}

module.exports = { PLAN_MODEL, CHAT_MODEL, HELPER_MODEL, isReasoningModel, buildChatParams };
