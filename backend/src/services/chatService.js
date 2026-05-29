const OpenAI = require('openai');
const chatModel = require('../models/chatModel');
const preferencesModel = require('../models/preferencesModel');
const { CHAT_MODEL, buildChatParams } = require('../config/models');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildSystemPrompt(planContext, language, constraints = null) {
  const lang = language === 'tr' ? 'tr' : 'en';

  const dietary = Array.isArray(constraints?.dietary) ? constraints.dietary.filter(Boolean) : [];
  const accessibility = Array.isArray(constraints?.accessibility) ? constraints.accessibility.filter(Boolean) : [];
  // Diyet/erişilebilirlik kısıtları varsa dile göre tek satır ekle.
  const constraintsLineTr = (dietary.length || accessibility.length)
    ? `\n- Kullanıcı kısıtları (zorunlu): ${dietary.length ? `diyet — ${dietary.join(', ')}` : ''}${dietary.length && accessibility.length ? '; ' : ''}${accessibility.length ? `erişilebilirlik — ${accessibility.join(', ')}` : ''}. Önerilerin bu kısıtlara uysun.`
    : '';
  const constraintsLineEn = (dietary.length || accessibility.length)
    ? `\n- User constraints (mandatory): ${dietary.length ? `dietary — ${dietary.join(', ')}` : ''}${dietary.length && accessibility.length ? '; ' : ''}${accessibility.length ? `accessibility — ${accessibility.join(', ')}` : ''}. Keep suggestions compatible with these.`
    : '';

  const planUpdateInstructions = `
CRITICAL — PLAN MODIFICATION PROTOCOL:
When the user asks to change, add, remove, replace, or swap ANY activity in their plan, you MUST ALWAYS end your response with a [PLAN_UPDATE] block. This is NOT optional. Without this block, the change will NOT be saved.

You MUST use this EXACT format at the END of your message:

[PLAN_UPDATE]{"action":"replace_activity","day":1,"time":"morning","activity":{"time":"morning","place":"New Place Name","description_tr":"Türkçe açıklama","description_en":"English description","type":"attraction"}}[/PLAN_UPDATE]

- action: "replace_activity" (replace one activity) or "replace_day_title" (change day title)
- day: 1-indexed number (1, 2, 3...)
- time: "morning", "lunch", "afternoon", or "dinner"
- type: "attraction" or "restaurant"
- ALWAYS include BOTH description_tr AND description_en
- The JSON must be valid, on a single line, between the tags
- Write your explanation BEFORE the [PLAN_UPDATE] block
- If the user asks for a change and you don't include [PLAN_UPDATE], the system cannot apply it — so ALWAYS include it

PLACE NAME RULES — CRITICAL FOR MAP RENDERING:
- "place" MUST be the FULL, OFFICIAL name as it appears on Google Maps in the local language.
- DO NOT use abbreviations, nicknames, or shortened forms.
  * BAD: "1. Meclis"           GOOD: "Birinci Türkiye Büyük Millet Meclisi Müzesi"
  * BAD: "Anıt"                GOOD: "Anıtkabir"
  * BAD: "TBMM"                GOOD: "Türkiye Büyük Millet Meclisi"
  * BAD: "Saray"               GOOD: "Topkapı Sarayı"
  * BAD: "the Louvre"          GOOD: "Musée du Louvre"
- If you are not certain a place exists on Google Maps with that exact name, suggest a different well-known place instead.
- For restaurants/cafes, prefer chains and well-rated independent places that are findable on Google Maps.
- Always include the city or district context implicitly — the system already searches within the plan's city.
`;

  if (lang === 'tr') {
    return `Sen GenieRoute AI seyahat asistanısın. Kullanıcıya mevcut seyahat planı hakkında yardım ediyorsun.
Kısa ve bilgilendirici cevaplar ver. Kullanıcının planını iyileştirmesine yardımcı ol.
Plan hakkında soru sorabilir, alternatif önerilerde bulunabilir, planı değiştirebilirsin.

Mevcut plan bilgisi:
${planContext}

Kurallar:
- Kısa ve öz cevaplar ver (2-3 paragraf max)
- Türkçe yanıt ver
- Mekan önerirken planın oluşturulduğu şehirdeki mekanlardan bahset
- Bütçe önerilerinde mevcut bütçe seviyesini dikkate al
- Hava: Yağmurlu bir gün-parçasındaki açık-hava aktivitesini değiştirirken kapalı bir alternatif öner ve nedenini kısaca söyle${constraintsLineTr}
${planUpdateInstructions}`;
  }

  return `You are GenieRoute AI travel assistant. You help the user with their current travel plan.
Give concise, informative answers. Help the user improve their plan.
You can answer questions, suggest alternatives, and modify the plan.

Current plan info:
${planContext}

Rules:
- Keep answers short and concise (2-3 paragraphs max)
- Respond in English
- When suggesting places, reference places in the plan's city
- Consider the current budget level when making suggestions
- Weather: When replacing an outdoor activity in a rainy day-part, prefer an indoor alternative and briefly say why${constraintsLineEn}
${planUpdateInstructions}`;
}

function formatPlanContext(tripData) {
  if (!tripData) return 'No plan available.';

  const { trip, dailyPlan, weatherDayParts } = tripData;
  let context = `City: ${trip?.city || 'unknown'}\nDays: ${trip?.days || '?'}\nBudget: ${trip?.budget || 'medium'}\n`;

  if (dailyPlan?.days) {
    context += '\nDaily Plan:\n';
    for (const day of dailyPlan.days) {
      const title = day.title_en || day.title_tr || '';
      context += `Day ${day.day}: ${title}\n`;
      for (const act of day.activities) {
        context += `  - ${act.time}: ${act.place} (${act.type})\n`;
      }
    }
  }

  if (Array.isArray(weatherDayParts) && weatherDayParts.length) {
    context += '\nWeather (by day-part — rainy slots marked):\n';
    weatherDayParts.forEach((w, i) => {
      const mark = (p) => (p?.avoidOutdoor ? ' [rain]' : '');
      context += `Day ${i + 1} (${w.date}): morning${mark(w.morning)}, afternoon${mark(w.afternoon)}, evening${mark(w.evening)}\n`;
    });
  }

  return context;
}

function parsePlanUpdate(text) {
  const match = text.match(/\[PLAN_UPDATE\]\s*([\s\S]*?)\s*\[\/PLAN_UPDATE\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function setupChatSocket(io) {
  io.on('connection', (socket) => {
    let activeSession = null;
    // Tercih kısıtları (diyet/erişilebilirlik) session başına bir kez yüklenip
    // cache'lenir; her mesajda DB'ye gitmeyiz.
    let constraintsCache = null;
    let constraintsLoadedFor = null;

    // Client init: trip için session bul/oluştur, geçmişi yolla
    socket.on('chat:init', async (data) => {
      try {
        const { tripId, clientUuid, language } = data || {};
        if (!tripId) {
          socket.emit('chat:history', { messages: [] });
          return;
        }
        activeSession = await chatModel.getOrCreateSession({
          tripId: Number(tripId),
          clientUuid: clientUuid || null,
          language: language || 'en',
        });
        const messages = await chatModel.getRecentMessages(activeSession.id);
        const appliedMap = await chatModel.getAppliedStatusMap(activeSession.id);
        socket.emit('chat:history', {
          sessionId: activeSession.id,
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
            // Asistan mesajinin onerdigi plan-update gercekten uygulandi mi?
            applied: appliedMap[m.id] === true,
          })),
        });
      } catch (err) {
        socket.emit('chat:error', { message: err.message || 'Failed to initialize chat' });
      }
    });

    // Kullanici "Uygula"'ya bastiginda plan_updates satirini applied=true yap
    socket.on('chat:plan-applied', async ({ messageId } = {}) => {
      try {
        if (messageId) await chatModel.markPlanUpdateApplied(Number(messageId));
      } catch (err) {
        // Sessizce log; UX'i bozma
        console.error('Failed to mark plan-update applied:', err.message);
      }
    });

    // Yeni sohbet — mevcut session'ı koruyup içeriğini temizle (DB)
    socket.on('chat:reset', async () => {
      try {
        if (activeSession) {
          await chatModel.clearSession(activeSession.id);
        }
        socket.emit('chat:history', { sessionId: activeSession?.id || null, messages: [] });
      } catch (err) {
        socket.emit('chat:error', { message: err.message || 'Failed to reset chat' });
      }
    });

    socket.on('chat:message', async (data) => {
      const { message, planData, language, tripId, clientUuid } = data;

      try {
        // Session yoksa oluştur (init atlanmış olabilir)
        if (!activeSession && tripId) {
          activeSession = await chatModel.getOrCreateSession({
            tripId: Number(tripId),
            clientUuid: clientUuid || null,
            language: language || 'en',
          });
        }

        let savedUserMsg = null;
        if (activeSession) {
          savedUserMsg = await chatModel.saveMessage({
            sessionId: activeSession.id,
            role: 'user',
            content: message,
          });
        }

        // History DB'den gelir (son 20 mesaj OpenAI context'ine)
        let history = [];
        if (activeSession) {
          const recent = await chatModel.getRecentMessages(activeSession.id, 20);
          // Şu an gönderilen mesaj zaten kaydedildi, onu hariç tut
          history = recent
            .filter((m) => m.id !== savedUserMsg?.id)
            .map((m) => ({ role: m.role, content: m.content }));
        }

        // Diyet/erişilebilirlik kısıtlarını clientUuid'den yükle (session başına cache)
        if (clientUuid && constraintsLoadedFor !== clientUuid) {
          try {
            const prefs = await preferencesModel.getPreferences(clientUuid);
            constraintsCache = prefs
              ? { dietary: prefs.dietary || [], accessibility: prefs.accessibility || [] }
              : null;
          } catch {
            constraintsCache = null;
          }
          constraintsLoadedFor = clientUuid;
        }

        const planContext = formatPlanContext(planData);
        const systemPrompt = buildSystemPrompt(planContext, language, constraintsCache);

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message },
        ];

        const stream = await openai.chat.completions.create(
          buildChatParams(CHAT_MODEL, {
            messages,
            stream: true,
            maxTokens: 1200,
            temperature: 0.7,
            reasoningEffort: 'low',
          })
        );

        let fullText = '';
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullText += content;
            socket.emit('chat:token', { content });
          }
        }

        // Assistant cevabını DB'ye kaydet
        let savedAssistantMsg = null;
        if (activeSession) {
          savedAssistantMsg = await chatModel.saveMessage({
            sessionId: activeSession.id,
            role: 'assistant',
            content: fullText,
          });

          // Plan update varsa onu da kaydet
          const planUpdate = parsePlanUpdate(fullText);
          if (planUpdate) {
            try {
              await chatModel.savePlanUpdate({
                sessionId: activeSession.id,
                messageId: savedAssistantMsg.id,
                tripId: activeSession.trip_id,
                update: planUpdate,
              });
            } catch (err) {
              console.error('Failed to save plan update:', err.message);
            }
          }

          await chatModel.updateLastActivity(activeSession.id);
        }

        // Mesaj id'sini frontend'e gonder — "Uygula" tıklandiginda bu id ile
        // chat:plan-applied event'i gonderilecek
        socket.emit('chat:done', { messageId: savedAssistantMsg?.id || null });
      } catch (err) {
        socket.emit('chat:error', { message: err.message || 'Chat error occurred' });
      }
    });
  });
}

module.exports = { setupChatSocket };
