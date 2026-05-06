const OpenAI = require('openai');
const chatModel = require('../models/chatModel');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildSystemPrompt(planContext, language) {
  const lang = language === 'tr' ? 'tr' : 'en';

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
${planUpdateInstructions}`;
}

function formatPlanContext(tripData) {
  if (!tripData) return 'No plan available.';

  const { trip, dailyPlan } = tripData;
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
        socket.emit('chat:history', {
          sessionId: activeSession.id,
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
          })),
        });
      } catch (err) {
        socket.emit('chat:error', { message: err.message || 'Failed to initialize chat' });
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

        const planContext = formatPlanContext(planData);
        const systemPrompt = buildSystemPrompt(planContext, language);

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message },
        ];

        const stream = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          stream: true,
          max_tokens: 1200,
          temperature: 0.7,
        });

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

        socket.emit('chat:done');
      } catch (err) {
        socket.emit('chat:error', { message: err.message || 'Chat error occurred' });
      }
    });
  });
}

module.exports = { setupChatSocket };
