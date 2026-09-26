import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Bot,
  User,
  Sparkles,
  Zap,
  BookOpen,
  ChevronDown,
  Minimize2,
  Maximize2,
  X,
  Loader2,
  Layers,
} from 'lucide-react';
import { ChatMessage, ChatRole } from '../types';
import { useI18n } from '../i18n';

interface GeminiChatbotProps {
  isOpen: boolean;
  onToggle: () => void;
  onApplyAction?: (actionType: string, payload: any) => void;
}

export const GeminiChatbot: React.FC<GeminiChatbotProps> = ({
  isOpen,
  onToggle,
  onApplyAction,
}) => {
  const { t, locale } = useI18n();
  // The welcome text is translated when shown, so it follows a language change
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: '', timestamp: Date.now() },
  ]);
  const messageText = (m: ChatMessage) => (m.id === 'welcome' ? t('chat.welcome') : m.content);

  const [input, setInput] = useState('');
  const [role, setRole] = useState<ChatRole>('general');
  const [model, setModel] = useState<string>('gemini-3.5-flash');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({
            role: m.role,
            content: messageText(m),
          })),
          role,
          model,
          locale,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('chat.errorResponse'));
      }

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: t('chat.errorMessage', { error: err.message }),
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl flex flex-col transition-all duration-200 overflow-hidden ${
        isMinimized ? 'w-80 h-14' : 'w-96 h-[540px]'
      }`}
    >
      {/* Top Header */}
      <div className="h-14 px-3.5 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
            <Bot size={16} />
          </div>
          <div>
            <h3 className="font-bold text-xs text-white flex items-center gap-1.5">
              {t('chat.title')}
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </h3>
            <span className="text-[10px] text-neutral-400 font-mono">
              {model}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized((m) => !m)}
            className="p-1 rounded text-neutral-400 hover:text-white"
            title={isMinimized ? t('chat.expand') : t('chat.minimize')}
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button
            onClick={onToggle}
            className="p-1 rounded text-neutral-400 hover:text-white"
            title={t('chat.close')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Role & Model Selector Bar */}
          <div className="p-2 border-b border-neutral-800 bg-neutral-900/90 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1">
              <span className="text-neutral-400">{t('chat.role')}</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ChatRole)}
                className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-sky-300 font-medium outline-none"
              >
                <option value="general">{t('chat.role.general')}</option>
                <option value="choreographer">{t('chat.role.choreographer')}</option>
                <option value="educator">{t('chat.role.educator')}</option>
                <option value="generator">{t('chat.role.generator')}</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-neutral-400">{t('chat.model')}</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 outline-none"
              >
                <option value="gemini-3.5-flash">3.5 Flash ({t('chat.model.general')})</option>
                <option value="gemini-3.1-flash-lite">3.1 Flash Lite ({t('chat.model.fast')})</option>
                <option value="gemini-3.1-pro-preview">3.1 Pro ({t('chat.model.complex')})</option>
                <option value="gemini-3.8-flash">3.8 Flash</option>
              </select>
            </div>
          </div>

          {/* Quick Suggestions Chips */}
          <div className="px-3 py-1.5 bg-neutral-950/40 border-b border-neutral-800 flex items-center gap-1.5 overflow-x-auto text-[10px] text-neutral-300 scrollbar-none">
            <button
              onClick={() =>
                handleSendMessage(
                  t('chat.suggest.chartsPrompt')
                )
              }
              className="px-2 py-0.5 rounded-full bg-neutral-800 hover:bg-neutral-700 whitespace-nowrap border border-neutral-700/60"
            >
              {t('chat.suggest.charts')}
            </button>
            <button
              onClick={() =>
                handleSendMessage(
                  t('chat.suggest.walkPrompt')
                )
              }
              className="px-2 py-0.5 rounded-full bg-neutral-800 hover:bg-neutral-700 whitespace-nowrap border border-neutral-700/60"
            >
              {t('chat.suggest.walk')}
            </button>
            <button
              onClick={() =>
                handleSendMessage(
                  t('chat.suggest.overlaysPrompt')
                )
              }
              className="px-2 py-0.5 rounded-full bg-neutral-800 hover:bg-neutral-700 whitespace-nowrap border border-neutral-700/60"
            >
              {t('chat.suggest.overlays')}
            </button>
          </div>

          {/* Scrollable Message History Thread */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-neutral-950/40">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={13} />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-xl p-3 text-xs leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-sky-500 text-neutral-950 font-medium rounded-tr-none'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-tl-none shadow-sm'
                  }`}
                >
                  {messageText(m)}
                </div>

                {m.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={13} />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <Loader2 size={14} className="animate-spin text-sky-400" />
                {t('chat.thinking')}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input */}
          <div className="p-2.5 border-t border-neutral-800 bg-neutral-950">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chat.placeholder')}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:border-sky-500 outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="p-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-neutral-950 font-bold transition shadow-md shadow-sky-500/20"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
