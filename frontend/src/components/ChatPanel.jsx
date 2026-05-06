import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageCircle, Sparkles, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { connectSocket, disconnectSocket, getClientUuid } from '../services/chatSocket';

const SUGGESTIONS = {
  tr: [
    'Daha ucuz restoran öner',
    'Sahil aktivitesi ekle',
    'Bu planı nasıl geliştirebilirim?',
  ],
  en: [
    'Suggest cheaper restaurants',
    'Add a beach activity',
    'How can I improve this plan?',
  ],
};

function parsePlanUpdate(text) {
  const match = text.match(/\[PLAN_UPDATE\]\s*([\s\S]*?)\s*\[\/PLAN_UPDATE\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function stripPlanUpdate(text) {
  // Remove complete blocks
  let clean = text.replace(/\[PLAN_UPDATE\][\s\S]*?\[\/PLAN_UPDATE\]/, '');
  // Remove incomplete blocks still streaming (starts with [PLAN_UPDATE] but no closing tag yet)
  clean = clean.replace(/\[PLAN_UPDATE\][\s\S]*$/, '');
  // Remove partial opening tag at the end (e.g. "[PLAN", "[PLAN_UP")
  clean = clean.replace(/\[PLAN_?U?P?D?A?T?E?\]?$/i, '');
  return clean.trim();
}

export default function ChatPanel({ planData, onPlanUpdate, tripId }) {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);
  const streamBufferRef = useRef('');
  const socketRef = useRef(null);
  const clientUuid = getClientUuid();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      // Trip için chat session başlat ve geçmişi iste
      if (tripId) {
        socket.emit('chat:init', { tripId, clientUuid, language: lang });
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setIsConnected(false));

    // Eğer zaten bağlıysa init'i hemen gönder
    if (socket.connected && tripId) {
      socket.emit('chat:init', { tripId, clientUuid, language: lang });
    }

    socket.on('chat:history', ({ messages: historyMsgs }) => {
      if (!historyMsgs || historyMsgs.length === 0) return;
      const restored = historyMsgs.map((m) => {
        if (m.role === 'assistant') {
          const planUpdate = parsePlanUpdate(m.content);
          return {
            role: 'assistant',
            content: stripPlanUpdate(m.content),
            streaming: false,
            planUpdate: planUpdate || undefined,
            planApplied: !!planUpdate, // geçmişten gelen update'leri uygulanmış say
          };
        }
        return { role: m.role, content: m.content, streaming: false };
      });
      setMessages(restored);
    });

    socket.on('chat:token', ({ content }) => {
      streamBufferRef.current += content;
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          updated[updated.length - 1] = { ...last, content: streamBufferRef.current };
        }
        return updated;
      });
    });

    socket.on('chat:done', () => {
      setIsStreaming(false);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          const fullText = last.content;
          const planUpdate = parsePlanUpdate(fullText);
          const displayText = stripPlanUpdate(fullText);
          updated[updated.length - 1] = {
            ...last,
            content: displayText,
            streaming: false,
            planUpdate: planUpdate || undefined,
            planApplied: false,
          };
        }
        return updated;
      });
    });

    socket.on('chat:error', ({ message }) => {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev.filter((m) => !m.streaming),
        { role: 'assistant', content: `⚠ ${message}`, streaming: false },
      ]);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect');
      socket.off('chat:history');
      socket.off('chat:token');
      socket.off('chat:done');
      socket.off('chat:error');
      disconnectSocket();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const sendMessage = (text) => {
    const msg = text || input.trim();
    if (!msg || isStreaming || !socketRef.current) return;

    const userMsg = { role: 'user', content: msg };
    const assistantMsg = { role: 'assistant', content: '', streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);
    streamBufferRef.current = '';

    socketRef.current.emit('chat:message', {
      message: msg,
      planData,
      language: lang,
      tripId,
      clientUuid,
    });
  };

  const applyPlanUpdate = (msgIndex) => {
    const msg = messages[msgIndex];
    if (!msg?.planUpdate || msg.planApplied) return;

    onPlanUpdate?.(msg.planUpdate);
    setMessages((prev) => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], planApplied: true };
      return updated;
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <MessageCircle size={16} />
        <span>{lang === 'tr' ? 'Seyahat Asistanı' : 'Travel Assistant'}</span>
        <div className={`chat-status ${isConnected ? 'connected' : ''}`} />
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <Sparkles size={20} />
            <p>{lang === 'tr' ? 'Planın hakkında soru sor veya önerileri dene:' : 'Ask about your plan or try suggestions:'}</p>
            <div className="chat-suggestions">
              {SUGGESTIONS[lang].map((s, i) => (
                <button key={i} className="chat-suggestion-btn" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-bubble">
              {stripPlanUpdate(msg.content)}
              {msg.streaming && <span className="chat-cursor">|</span>}
            </div>
            {msg.planUpdate && !msg.streaming && (
              <button
                className={`chat-apply-btn ${msg.planApplied ? 'applied' : ''}`}
                onClick={() => applyPlanUpdate(i)}
                disabled={msg.planApplied}
              >
                <Check size={14} />
                {msg.planApplied
                  ? (lang === 'tr' ? 'Uygulandı' : 'Applied')
                  : (lang === 'tr' ? 'Değişikliği Uygula' : 'Apply Change')}
              </button>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={lang === 'tr' ? 'Mesajınızı yazın...' : 'Type your message...'}
          disabled={isStreaming}
        />
        <button
          className="chat-send-btn"
          onClick={() => sendMessage()}
          disabled={!input.trim() || isStreaming}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
