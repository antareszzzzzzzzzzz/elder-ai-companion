import React, { useState, useRef, useEffect } from 'react';
import { useMockData } from '../store/MockDataContext';
import { useNavigate } from 'react-router-dom';
import { Bot, Bell, Volume2, VolumeX, Mic, MicOff, Send, Settings, User as UserIcon, Repeat, Plus, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { chatApi, type ChatMessage, type ChatSession } from '../services/api';
import { sttService, ttsService } from '../services/speech';

const ElderlyDashboard: React.FC = () => {
  const { user, switchRole } = useMockData();
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [inputMsg, setInputMsg] = useState('');

  // Chat state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Speech state
  const [isRecording, setIsRecording] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [confirmedTranscript, setConfirmedTranscript] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(true);

  // Sidebar
  const [showSidebar, setShowSidebar] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialTranscript]);

  const loadSessions = async () => {
    try {
      const data = await chatApi.getSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const loadSession = async (session: ChatSession) => {
    setCurrentSession(session);
    setShowSidebar(false);
    try {
      const data = await chatApi.getMessages(session.session_id);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const createNewSession = () => {
    setCurrentSession(null);
    setMessages([]);
    setShowSidebar(false);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputMsg('');
    setPartialTranscript('');
    setConfirmedTranscript('');
    setIsLoading(true);

    try {
      const data = await chatApi.send(text, currentSession?.session_id || null);

      if (!currentSession && data.session_id) {
        const newSession: ChatSession = {
          session_id: data.session_id,
          account_id: '',
          title: text.slice(0, 20) + (text.length > 20 ? '...' : ''),
          created_at: new Date().toISOString(),
        };
        setCurrentSession(newSession);
        loadSessions();
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Auto-play TTS
      if (ttsEnabled && (data.audio || data.response)) {
        ttsService.play(data.audio, data.response);
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '抱歉，發生了錯誤，請稍後再試。',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputMsg);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await sttService.stop();
      setIsRecording(false);
      const fullText = (confirmedTranscript + partialTranscript).trim();
      if (fullText) {
        sendMessage(fullText);
      }
      setConfirmedTranscript('');
      setPartialTranscript('');
    } else {
      setIsRecording(true);
      setConfirmedTranscript('');
      setPartialTranscript('');
      await sttService.start({
        onPartial: (text) => setPartialTranscript(text),
        onFinal: (text) => {
          const trimmed = text.trim();
          if (!trimmed) return;
          setConfirmedTranscript((prev) => {
            const needsComma = prev && !/[，。！？,.\s]$/.test(prev);
            return prev + (needsComma ? '，' : '') + trimmed;
          });
          setPartialTranscript('');
        },
        onError: (err) => {
          console.error('STT error:', err);
          setIsRecording(false);
        },
      });
    }
  };

  return (
    <div className="bg-amber-50 h-screen flex overflow-hidden text-slate-800 font-sans">
      {/* 左側極簡控制欄 */}
      <aside className="w-64 bg-emerald-800 text-white flex flex-col justify-between p-4 shadow-xl z-10">
        <div className="space-y-6">
          <div className="text-center pb-4 border-b border-emerald-600">
            <div className="w-20 h-20 mx-auto bg-white rounded-full flex items-center justify-center mb-3 shadow-inner">
              <Bot className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold">小安助手</h1>
          </div>

          {/* 緊急呼叫按鈕 — 暫時停用，後端尚無對應邏輯
          <button className="w-full bg-red-500 hover:bg-red-600 text-white py-4 px-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition text-xl shadow-lg border-2 border-red-300 relative overflow-hidden group">
            <Bell className="w-6 h-6 animate-pulse" /> 緊急呼叫
          </button>
          */}

          {/* 對話紀錄按鈕 */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition"
          >
            <MessageSquare className="w-5 h-5" /> 對話紀錄
          </button>
        </div>

        {/* 底部設定區塊 */}
        <div className="relative">
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-full left-0 mb-4 w-full bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-100 overflow-hidden"
              >
                <div className="p-2 space-y-1">
                  <button
                    onClick={() => navigate('/profile')}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 rounded-lg transition-colors text-lg font-semibold text-slate-700"
                  >
                    <UserIcon className="w-5 h-5 text-emerald-600" />
                    查看個人資料
                  </button>
                  <button
                    onClick={() => switchRole()}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-teal-50 rounded-lg transition-colors text-lg font-semibold text-slate-700"
                  >
                    <Repeat className="w-5 h-5 text-teal-600" />
                    切換照護者角色
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all border-2 font-bold ${showSettings ? 'bg-emerald-700 border-emerald-500' : 'bg-emerald-900/50 hover:bg-emerald-700 border-transparent'}`}
          >
            <Settings className="w-6 h-6 text-emerald-200" />
            <span className="text-emerald-100 text-lg">系統設定</span>
          </button>
        </div>
      </aside>

      {/* 對話紀錄側邊面板 */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="bg-white border-r border-slate-200 flex flex-col overflow-hidden"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-700">對話紀錄</h3>
              <button onClick={createNewSession} className="text-sm bg-emerald-100 text-emerald-700 px-3 py-1 rounded-lg font-semibold hover:bg-emerald-200">
                <Plus className="w-4 h-4 inline mr-1" />新對話
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((session) => (
                <button
                  key={session.session_id}
                  onClick={() => loadSession(session)}
                  className={`w-full text-left p-3 rounded-lg text-sm truncate transition-colors ${
                    currentSession?.session_id === session.session_id
                      ? 'bg-emerald-50 text-emerald-700 font-semibold'
                      : 'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  {session.title || '新對話'}
                </button>
              ))}
              {sessions.length === 0 && (
                <p className="text-center text-slate-400 py-6 text-sm">還沒有對話紀錄</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 主對話區 */}
      <main className="flex-1 flex flex-col h-full bg-white relative">
        <header className="bg-emerald-100 border-b-2 border-emerald-200 px-6 py-4 flex justify-between items-center shadow-sm z-0">
          <h2 className="text-2xl font-bold text-emerald-800">今天想聊點什麼呢，{user?.name}？</h2>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${
              ttsEnabled ? 'bg-white/50 text-emerald-700' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            {ttsEnabled ? '語音朗讀已開啟' : '語音朗讀已關閉'}
          </button>
        </header>

        <div className="flex-1 p-6 overflow-y-auto space-y-6 chat-scroll bg-slate-50/50">
          {/* 空狀態提示 */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <Bot className="w-12 h-12 text-emerald-400" />
              </div>
              <p className="text-2xl text-slate-500 font-medium">開始跟小安聊天吧！</p>
              <p className="text-lg text-slate-400 mt-2">可以打字或按住麥克風說話</p>
            </div>
          )}

          {/* 訊息列表 */}
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex gap-4 max-w-4xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shadow-md flex-shrink-0 border-2 border-white">
                  <Bot className="w-7 h-7" />
                </div>
              )}
              <div
                className={`p-5 rounded-3xl shadow-md text-xl leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-500 text-white rounded-tr-none'
                    : 'bg-white border border-emerald-100 text-slate-700 rounded-tl-none'
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}

          {/* 錄音中的即時轉文字 */}
          {isRecording && (confirmedTranscript || partialTranscript) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4 max-w-4xl ml-auto flex-row-reverse"
            >
              <div className="p-5 rounded-3xl rounded-tr-none bg-emerald-100 text-emerald-700 border border-emerald-200 text-xl">
                {confirmedTranscript}
                {partialTranscript}
                <span className="animate-pulse">|</span>
              </div>
            </motion.div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex gap-4 max-w-4xl">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shadow-md flex-shrink-0 border-2 border-white">
                <Bot className="w-7 h-7" />
              </div>
              <div className="bg-white border border-emerald-100 p-5 rounded-3xl rounded-tl-none shadow-md">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-3 h-3 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-3 h-3 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 輸入區 */}
        <div className="p-6 bg-white border-t-2 border-slate-200 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <button
              onClick={toggleRecording}
              className={`w-24 h-24 rounded-full flex flex-col items-center justify-center shadow-lg transition flex-shrink-0 border-4 group relative ${
                isRecording
                  ? 'bg-gradient-to-b from-red-400 to-red-500 border-red-200 animate-pulse'
                  : 'bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 border-amber-200'
              }`}
            >
              {!isRecording && <div className="absolute inset-0 rounded-full animate-ping bg-amber-400 opacity-20"></div>}
              {isRecording ? (
                <MicOff className="w-8 h-8 mb-1 text-white" />
              ) : (
                <Mic className="w-8 h-8 mb-1 text-white group-hover:scale-110 transition-transform" />
              )}
              <span className="text-sm font-bold text-white">{isRecording ? '停止' : '按住說話'}</span>
            </button>
            <textarea
              rows={2}
              placeholder="也可以在這裡打字..."
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 border-2 border-slate-300 rounded-2xl px-6 py-4 text-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none bg-slate-50 transition-all shadow-inner"
            ></textarea>
            <button
              onClick={() => sendMessage(inputMsg)}
              disabled={!inputMsg.trim() || isLoading}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 h-24 rounded-2xl font-bold text-2xl flex items-center gap-3 transition shadow-lg flex-shrink-0 group"
            >
              傳送 <Send className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ElderlyDashboard;
