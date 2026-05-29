import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, MessageCircle, Sparkles, Check, Minus, X, Plus, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { connectSocket, disconnectSocket, getClientUuid } from '../services/chatSocket';
import { buildFollowupSuggestions } from '../data/followups';

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
  let clean = text.replace(/\[PLAN_UPDATE\][\s\S]*?\[\/PLAN_UPDATE\]/, '');
  clean = clean.replace(/\[PLAN_UPDATE\][\s\S]*$/, '');
  clean = clean.replace(/\[PLAN_?U?P?D?A?T?E?\]?$/i, '');
  return clean.trim();
}

export default function ChatPanel({ planData, onPlanUpdate, onPreviewUpdate, onCancelPreview, tripId, floating = false }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'tr' ? 'tr' : 'en';
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  // Hangi mesajın önizlemesi aktif — aynı anda yalnız bir tane.
  const [previewIdx, setPreviewIdx] = useState(-1);
  const messagesEndRef = useRef(null);
  const streamBufferRef = useRef('');
  const socketRef = useRef(null);
  const clientUuid = getClientUuid();

  // Plana göre bağlama duyarlı takip önerileri (ilk mesajdan sonra, plan varsa).
  const followups = useMemo(
    () => buildFollowupSuggestions(planData?.dailyPlan, lang),
    [planData?.dailyPlan, lang]
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      if (tripId) {
        socket.emit('chat:init', { tripId, clientUuid, language: lang });
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setIsConnected(false));

    if (socket.connected && tripId) {
      socket.emit('chat:init', { tripId, clientUuid, language: lang });
    }

    socket.on('chat:history', ({ messages: historyMsgs }) => {
      if (!historyMsgs) return;
      const restored = historyMsgs.map((m) => {
        if (m.role === 'assistant') {
          const planUpdate = parsePlanUpdate(m.content);
          return {
            id: m.id,
            role: 'assistant',
            content: stripPlanUpdate(m.content),
            streaming: false,
            planUpdate: planUpdate || undefined,
            // Server'dan gelen applied bayraği DB'den; sadece BDM'in
            // önerdigi satirlar icin true.
            planApplied: !!m.applied,
          };
        }
        return { id: m.id, role: m.role, content: m.content, streaming: false };
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

    socket.on('chat:done', ({ messageId } = {}) => {
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
            id: messageId, // server'dan gelen mesaj id'si — "Uygula" tiklaninca bunu gondereriz
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

  const previewPlanUpdate = (msgIndex) => {
    const msg = messages[msgIndex];
    if (!msg?.planUpdate) return;
    onPreviewUpdate?.(msg.planUpdate);
    setPreviewIdx(msgIndex);
  };

  const confirmPlanUpdate = (msgIndex) => {
    const msg = messages[msgIndex];
    if (!msg?.planUpdate || msg.planApplied) return;
    // Onayla — persisten kaydeden mevcut akışı çalıştır
    onPlanUpdate?.(msg.planUpdate);
    socketRef.current?.emit('chat:plan-applied', { messageId: msg.id });
    setMessages((prev) => {
      const updated = [...prev];
      updated[msgIndex] = { ...updated[msgIndex], planApplied: true };
      return updated;
    });
    setPreviewIdx(-1);
  };

  const cancelPreview = () => {
    onCancelPreview?.();
    setPreviewIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    setMessages([]);
    streamBufferRef.current = '';
    // Backend'deki session içeriğini de temizle (sayfa yenilenince eski mesajlar gelmesin)
    socketRef.current?.emit('chat:reset');
  };

  const panelInner = (
    <>
      <div className="chat-header">
        <MessageCircle size={16} />
        <span className="chat-title-text">{t('chat.title')}</span>
        <div className={`chat-status ${isConnected ? 'connected' : ''}`} title={isConnected ? 'connected' : 'connecting'} />
        {floating && (
          <div className="chat-header-actions">
            <button
              type="button"
              className="chat-header-icon-btn"
              onClick={startNewChat}
              title={t('chat.newChat')}
              aria-label="new chat"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className="chat-header-icon-btn"
              onClick={() => setIsMinimized((v) => !v)}
              title={isMinimized ? t('chat.expand') : t('chat.minimize')}
              aria-label="minimize"
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              className="chat-header-icon-btn"
              onClick={() => setIsOpen(false)}
              title={t('chat.close')}
              aria-label="close"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {!isMinimized && (
        <>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <Sparkles size={20} />
                <p>{t('chat.welcome')}</p>
                <div className="chat-suggestions">
                  {/* Plan varsa bağlam duyarlı chip'ler; yoksa genel öneriler */}
                  {(followups.length > 0
                    ? followups.map((f) => ({ key: f.id, label: f.label, msg: f.message }))
                    : [t('chat.suggestion1'), t('chat.suggestion2'), t('chat.suggestion3')].map((s, i) => ({ key: `s-${i}`, label: s, msg: s }))
                  ).map((s) => (
                    <button key={s.key} className="chat-suggestion-btn" onClick={() => sendMessage(s.msg)}>
                      {s.label}
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
                {msg.planUpdate && !msg.streaming && !msg.planApplied && previewIdx !== i && (
                  <button
                    className="chat-apply-btn chat-apply-btn--preview"
                    onClick={() => previewPlanUpdate(i)}
                    title={t('chat.previewTooltip')}
                  >
                    <Eye size={11} />
                    {t('chat.preview')}
                  </button>
                )}
                {msg.planUpdate && !msg.streaming && !msg.planApplied && previewIdx === i && (
                  <span className="chat-apply-row">
                    <button
                      className="chat-apply-btn chat-apply-btn--confirm"
                      onClick={() => confirmPlanUpdate(i)}
                      title={t('chat.confirmTooltip')}
                    >
                      <Check size={11} />
                      {t('chat.confirm')}
                    </button>
                    <button
                      className="chat-apply-btn chat-apply-btn--cancel"
                      onClick={cancelPreview}
                      title={t('chat.cancelPreview')}
                      aria-label="cancel"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}
                {msg.planUpdate && !msg.streaming && msg.planApplied && (
                  <span className="chat-applied-tag" title={t('chat.appliedTooltip')}>
                    <Check size={11} />
                    {t('chat.applied')}
                  </span>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {messages.length > 0 && !isStreaming && followups.length > 0 && (
            <div className="chat-followups">
              {followups.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="chat-followup-chip"
                  onClick={() => sendMessage(f.message)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
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
        </>
      )}
    </>
  );

  if (!floating) {
    return <div className="chat-panel">{panelInner}</div>;
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        className="chat-reopen-fab"
        onClick={() => setIsOpen(true)}
        aria-label={t('chat.reopen')}
        title={t('chat.reopen')}
      >
        <MessageCircle size={20} />
      </button>
    );
  }

  return (
    <div className={`chat-panel chat-panel-floating${isMinimized ? ' minimized' : ''}`}>
      {panelInner}
    </div>
  );
}
