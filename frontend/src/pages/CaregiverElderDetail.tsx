import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMockData } from '../store/MockDataContext';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User, MessageSquare, BellRing, Trash2, Plus, Brain, Utensils, Pill, Activity, HeartPulse, Loader2, RefreshCw, Lightbulb, ChevronLeft, ChevronRight, Clock, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { healthApi, summaryApi, careItemsApi, followApi, type DailySummary, type HealthOverview, type CareItem } from '../services/api';

/** 照護者端記憶足跡時間軸子組件 */
interface CaregiverMemoryCard {
  id: string;
  type: string;
  title: string;
  content: string;
  date: string;
}

interface CaregiverDayNode {
  date: string;
  label: string;
  weekday: string;
  events: CaregiverMemoryCard[];
}

function groupCardsByDate(cards: CaregiverMemoryCard[]): CaregiverDayNode[] {
  const map = new Map<string, CaregiverMemoryCard[]>();
  for (const card of cards) {
    const date = card.date || '未知日期';
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(card);
  }
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const nodes: CaregiverDayNode[] = [];
  for (const [date, events] of map.entries()) {
    const d = new Date(date);
    const label = isNaN(d.getTime()) ? date : `${d.getMonth() + 1}/${d.getDate()}`;
    const weekday = isNaN(d.getTime()) ? '' : `週${weekdays[d.getDay()]}`;
    nodes.push({ date, label, weekday, events });
  }
  nodes.sort((a, b) => b.date.localeCompare(a.date));
  return nodes;
}

function getCaregiverCategoryLabel(type: string): string {
  switch (type) {
    case 'diet': return '飲食';
    case 'medication': return '用藥';
    case 'activity': return '活動';
    case 'mood': return '情緒';
    default: return '健康';
  }
}

const CaregiverMemoryTimeline: React.FC<{
  memoryCards: CaregiverMemoryCard[];
  getIconForType: (type: string) => React.ReactNode;
  getBgForType: (type: string) => string;
}> = ({ memoryCards, getIconForType, getBgForType }) => {
  const dayNodes = groupCardsByDate(memoryCards);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (timelineRef.current?.offsetLeft || 0));
    setScrollLeft(timelineRef.current?.scrollLeft || 0);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - (timelineRef.current?.offsetLeft || 0);
    const walk = (x - startX) * 1.5;
    if (timelineRef.current) timelineRef.current.scrollLeft = scrollLeft - walk;
  }, [isDragging, startX, scrollLeft]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    setStartX(e.touches[0].pageX - (timelineRef.current?.offsetLeft || 0));
    setScrollLeft(timelineRef.current?.scrollLeft || 0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const x = e.touches[0].pageX - (timelineRef.current?.offsetLeft || 0);
    const walk = (x - startX) * 1.5;
    if (timelineRef.current) timelineRef.current.scrollLeft = scrollLeft - walk;
  }, [isDragging, startX, scrollLeft]);

  const scrollTimeline = (direction: 'left' | 'right') => {
    if (!timelineRef.current) return;
    const scrollAmount = 200;
    timelineRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  const selectedDay = dayNodes[selectedIndex] || null;

  if (dayNodes.length === 0) {
    return (
      <div className="py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <Brain className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">目前還沒有記憶點滴紀錄</p>
      </div>
    );
  }

  return (
    <>
      {/* 橫向時間軸 */}
      <div className="relative mb-6">
        <button onClick={() => scrollTimeline('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white/90 border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:bg-teal-50 hover:border-teal-300 transition-colors">
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <button onClick={() => scrollTimeline('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white/90 border border-slate-200 rounded-full flex items-center justify-center shadow-sm hover:bg-teal-50 hover:border-teal-300 transition-colors">
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>

        <div
          ref={timelineRef}
          className="overflow-x-auto scrollbar-hide mx-10 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
        >
          <div className="flex items-center min-w-max py-4 px-2">
            <div className="absolute top-1/2 left-12 right-12 h-0.5 bg-gradient-to-r from-teal-200 via-teal-300 to-teal-200 -translate-y-1/2 pointer-events-none" />
            {dayNodes.map((node, idx) => (
              <div key={node.date} className="flex flex-col items-center mx-3 relative" style={{ minWidth: '80px' }}>
                <button
                  onClick={() => setSelectedIndex(idx)}
                  className={`relative z-10 w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all duration-200 border-2 ${
                    idx === selectedIndex
                      ? 'bg-teal-500 border-teal-600 text-white shadow-lg shadow-teal-200 scale-110'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:bg-teal-50'
                  }`}
                >
                  <span className="text-xs font-bold leading-tight">{node.label}</span>
                  <span className="text-[10px] leading-tight opacity-80">{node.weekday}</span>
                </button>
                <span className={`mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  idx === selectedIndex ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {node.events.length} 則
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 選中日期的記憶點滴列表 */}
      <AnimatePresence mode="wait">
        {selectedDay && (
          <motion.div
            key={selectedDay.date}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="w-3 h-3 rounded-full bg-teal-500" />
              <h4 className="text-lg font-bold text-slate-800">{selectedDay.date}</h4>
              <span className="text-sm text-slate-500">{selectedDay.weekday}</span>
              <span className="ml-auto text-sm text-slate-400">共 {selectedDay.events.length} 則記憶點滴</span>
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-3 pr-1 scrollbar-thin">
              {selectedDay.events.map((card, eventIdx) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: eventIdx * 0.05 }}
                  className={`flex items-start gap-4 p-4 rounded-xl border ${getBgForType(card.type)} transition-all hover:shadow-sm`}
                >
                  <div className="p-2 bg-white/70 rounded-lg shadow-sm flex-shrink-0">
                    {getIconForType(card.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 bg-white/60 rounded-full text-slate-600">
                        {getCaregiverCategoryLabel(card.type)}
                      </span>
                    </div>
                    <p className="text-base text-slate-700 leading-relaxed">{card.content}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {selectedDay.events.length > 5 && (
              <p className="text-center text-sm text-slate-400 mt-3 pt-2 border-t border-slate-100">
                ↑ 向上滑動查看更多記憶點滴
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const CaregiverElderDetail: React.FC = () => {
  const { followingElders } = useMockData();
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();

  const [activeTab, setActiveTab] = useState<'profile' | 'ai_summary' | 'reminders'>('profile');

  // 從追蹤列表找到對應的長輩基本資訊
  const elderInfo = followingElders.find((e) => e.account_id === accountId);

  // API data
  const [healthOverview, setHealthOverview] = useState<HealthOverview | null>(null);
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Reminders — 串接後端 API
  const [careItems, setCareItems] = useState<CareItem[]>([]);
  const [loadingCareItems, setLoadingCareItems] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newTrackMode, setNewTrackMode] = useState(true); // true = 需確認, false = 提醒一次即可

  // 每日摘要自動推播排程
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('20:00');
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [pushingNow, setPushingNow] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    if (accountId) {
      loadHealthData();
      loadCareItems();
      loadSchedule();
    }
  }, [accountId]);

  const loadSchedule = async () => {
    if (!accountId) return;
    setLoadingSchedule(true);
    try {
      const data = await followApi.getSummarySchedule(accountId);
      if (data.daily_summary_time) {
        setScheduleEnabled(true);
        setScheduleTime(data.daily_summary_time);
      } else {
        setScheduleEnabled(false);
      }
    } catch (err) {
      console.warn('Summary schedule API error:', err);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handlePushNow = async () => {
    if (!accountId) return;
    setPushingNow(true);
    setPushMessage(null);
    try {
      const data = await summaryApi.pushNow(accountId);

      if (data.message) {
        setPushMessage(data.message);
      } else if (data.recipients && data.recipients.length > 0) {
        setPushMessage(
          `已產生 ${data.date} 的摘要（${data.facts_count} 筆紀錄），並寄送至 ${data.recipients.join('、')}`
        );
      } else if (data.email_enabled === false) {
        setPushMessage(
          `已產生 ${data.date} 的摘要（${data.facts_count} 筆紀錄）。Email 通知未啟用，僅有站內通知。`
        );
      } else {
        setPushMessage(
          `已產生 ${data.date} 的摘要（${data.facts_count} 筆紀錄），但沒有成功寄出信件，請查看後端 log。`
        );
      }

      // 重新載入摘要清單，讓新產生的摘要立即顯示
      await loadHealthData();
    } catch (err: any) {
      setPushMessage(err?.message || '推播失敗，請稍後再試');
    } finally {
      setPushingNow(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!accountId) return;
    setSavingSchedule(true);
    setScheduleMessage(null);
    try {
      const data = await followApi.setSummarySchedule(
        accountId,
        scheduleEnabled ? scheduleTime : null
      );
      setScheduleMessage(
        data.daily_summary_time
          ? `已設定：每天 ${data.daily_summary_time} 自動產生每日摘要`
          : '已關閉自動推播'
      );
    } catch (err: any) {
      setScheduleMessage(err?.message || '設定失敗，請稍後再試');
    } finally {
      setSavingSchedule(false);
    }
  };

  const loadCareItems = async () => {
    if (!accountId) return;
    setLoadingCareItems(true);
    try {
      const items = await careItemsApi.getItems(accountId);
      setCareItems(items);
    } catch (err) {
      console.warn('Care items API error:', err);
    } finally {
      setLoadingCareItems(false);
    }
  };

  const loadHealthData = async () => {
    if (!accountId) return;
    setLoadingOverview(true);
    try {
      const overview = await healthApi.getOverview(accountId);
      setHealthOverview(overview);
      if (overview.daily_summaries) {
        setDailySummaries(overview.daily_summaries);
      }
    } catch (err) {
      console.warn('Health API error:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  const handleGenerateInsights = async () => {
    if (!accountId) return;
    setGeneratingInsights(true);
    try {
      const data = await healthApi.generateInsights(accountId);
      if (data.insights) {
        setInsights(data.insights);
      }
    } catch (err) {
      console.error('Generate insights error:', err);
    } finally {
      setGeneratingInsights(false);
    }
  };

  // 跨日洞察的觸發按鈕目前被註解停用，但 state 與 handler 保留以便日後恢復。
  // 這裡明確標記為「刻意未使用」，避免 tsc 的 noUnusedLocals 讓 build 失敗。
  // 恢復按鈕後可直接刪掉這三行。
  void RefreshCw;
  void generatingInsights;
  void handleGenerateInsights;

  const handleGenerateSummary = async () => {
    if (!accountId) return;
    setGeneratingSummary(true);
    try {
      await summaryApi.generateDaily(accountId);
      await loadHealthData();
    } catch (err) {
      console.error('Generate summary error:', err);
    } finally {
      setGeneratingSummary(false);
    }
  };

  const [generatingWeekly, setGeneratingWeekly] = useState(false);
  const handleGenerateWeekly = async () => {
    if (!accountId) return;
    setGeneratingWeekly(true);
    try {
      await summaryApi.generateWeekly(accountId);
      await loadHealthData();
    } catch (err) {
      console.error('Generate weekly error:', err);
    } finally {
      setGeneratingWeekly(false);
    }
  };

  const handleAddReminder = async () => {
    if (!newQuestion.trim() || !accountId) return;
    try {
      const newItem = await careItemsApi.addItem(accountId, newQuestion.trim(), newTrackMode);
      setCareItems([newItem, ...careItems]);
      setNewQuestion('');
      setNewTrackMode(true);
    } catch (err) {
      console.error('Add care item error:', err);
      alert('新增失敗，請稍後再試');
    }
  };

  const removeReminder = async (factId: string) => {
    if (!accountId) return;
    try {
      // 先把 track 設為 false（停止 AI 提醒），再從 UI 移除
      await careItemsApi.deleteItem(accountId, factId);
      setCareItems(careItems.filter((r) => r.fact_id !== factId));
    } catch (err) {
      console.error('Delete care item error:', err);
      alert('刪除失敗，請稍後再試');
    }
  };

  const handleStopTracking = async (factId: string) => {
    if (!accountId) return;
    try {
      await careItemsApi.updateTrack(accountId, factId, false);
      setCareItems(careItems.map((r) => r.fact_id === factId ? { ...r, track: false } : r));
    } catch (err) {
      console.error('Stop tracking error:', err);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'diet': return <Utensils className="w-5 h-5 text-amber-500" />;
      case 'medication': return <Pill className="w-5 h-5 text-rose-500" />;
      case 'activity': return <Activity className="w-5 h-5 text-emerald-500" />;
      case 'mood': return <Brain className="w-5 h-5 text-indigo-500" />;
      default: return <HeartPulse className="w-5 h-5 text-teal-500" />;
    }
  };

  const getBgForType = (type: string) => {
    switch (type) {
      case 'diet': return 'bg-amber-50 border-amber-200';
      case 'medication': return 'bg-rose-50 border-rose-200';
      case 'activity': return 'bg-emerald-50 border-emerald-200';
      case 'mood': return 'bg-indigo-50 border-indigo-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  const categoryToType = (category: string) => {
    switch (category) {
      case '飲食': return 'diet';
      case '用藥': return 'medication';
      case '活動': return 'activity';
      case '情緒': return 'mood';
      default: return 'activity';
    }
  };

  // 顯示名稱
  const displayName = healthOverview?.display_name || elderInfo?.display_name || '未知';

  // 記憶卡片資料
  const memoryCards = healthOverview
    ? [
        ...(healthOverview.medication_facts || []),
        ...(healthOverview.body_facts || []),
        ...(healthOverview.diet_facts || []),
        ...(healthOverview.mood_facts || []),
        ...(healthOverview.other_facts || []),
      ].map((f) => ({
        id: f.fact_id,
        type: categoryToType(f.category),
        title: `${f.category}記憶卡`,
        content: f.content,
        date: f.updated_at?.split('T')[0] || '',
      }))
    : [];

  // 摘要依 summary_type 分組，各自依 date 新到舊排序
  const weeklySummaries = dailySummaries
    .filter((s) => s.summary_type === 'weekly')
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const dailyOnlySummaries = dailySummaries
    .filter((s) => s.summary_type !== 'weekly')
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (!accountId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-700 mb-4">找不到該家人資料</h2>
          <button onClick={() => navigate('/')} className="text-teal-600 hover:underline">返回首頁</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* 頂部導覽 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4">
          <div className="py-4 flex items-center justify-between">
            <button
              onClick={() => navigate('/caregiver')}
              className="flex items-center gap-2 text-slate-600 hover:text-teal-600 font-semibold transition-colors"
            >
              <ArrowLeft className="w-6 h-6" /> 返回列表
            </button>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-teal-600" />
              </div>
              {displayName} 的專屬照護區
            </h1>
            <div className="w-24"></div>
          </div>

          {/* Tabs */}
          <div className="flex gap-8 overflow-x-auto pb-[-1px]">
            {[
              { id: 'profile', icon: User, label: '個人資料' },
              { id: 'ai_summary', icon: MessageSquare, label: 'AI 摘要紀錄' },
              { id: 'reminders', icon: BellRing, label: '設定提醒' },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 py-4 px-2 font-bold text-lg border-b-4 transition-colors ${isActive ? 'border-teal-500 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'}`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-teal-500' : ''}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* ========== 個人資料 Tab ========== */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-400 uppercase">姓名</p>
                    <p className="text-xl font-bold text-slate-800">{displayName}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-400 uppercase">帳號代碼</p>
                    <p className="text-xl font-bold text-slate-800">@{elderInfo?.account_handle || '—'}</p>
                  </div>
                  {healthOverview && (
                    <div className="col-span-2">
                      <p className="text-sm font-semibold text-slate-400 uppercase">累計 AI 互動次數</p>
                      <p className="text-xl font-bold text-teal-600">{healthOverview.interaction_count} 次</p>
                    </div>
                  )}
                </div>

                {/* 記憶足跡時間軸 */}
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Clock className="w-6 h-6 text-teal-500" /> 記憶足跡總覽
                  </h3>
                  {loadingOverview ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                      <span className="ml-2 text-slate-500">載入中...</span>
                    </div>
                  ) : (
                    <CaregiverMemoryTimeline
                      memoryCards={memoryCards}
                      getIconForType={getIconForType}
                      getBgForType={getBgForType}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ========== AI 摘要紀錄 Tab ========== */}
            {activeTab === 'ai_summary' && (
              <div className="space-y-6">
                {/* 跨日洞察 */}
                {insights && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-50 border border-amber-200 rounded-3xl p-6 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-6 h-6 text-amber-500" />
                      <h3 className="font-bold text-lg text-amber-700">近期觀察洞察</h3>
                    </div>
                    <p className="text-amber-800 text-lg leading-relaxed">{insights}</p>
                  </motion.div>
                )}

                {/* 自動推播每日摘要設定 */}
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <div className="mb-5">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <Clock className="w-6 h-6 text-teal-500" /> 自動推播每日摘要
                    </h3>
                    <p className="text-slate-500 mt-1">
                      設定時間後，系統會在每天該時間自動產生 {displayName} 的每日摘要，並在通知鈴鐺提醒您。
                    </p>
                  </div>

                  {loadingSchedule ? (
                    <div className="flex items-center py-4">
                      <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
                      <span className="ml-2 text-slate-500">載入設定中...</span>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <div className="flex items-center gap-3 mb-5">
                        <input
                          id="schedule-enabled"
                          type="checkbox"
                          checked={scheduleEnabled}
                          onChange={(e) => {
                            setScheduleEnabled(e.target.checked);
                            setScheduleMessage(null);
                          }}
                          className="w-5 h-5 rounded border-slate-300 text-teal-600 focus:ring-4 focus:ring-teal-100 cursor-pointer"
                        />
                        <label
                          htmlFor="schedule-enabled"
                          className="text-lg font-semibold text-slate-700 cursor-pointer"
                        >
                          啟用自動推播
                        </label>
                      </div>

                      <div className="flex flex-wrap items-end gap-4">
                        <div>
                          <label
                            htmlFor="schedule-time"
                            className="block text-sm font-semibold text-slate-600 mb-2"
                          >
                            推播時間（台灣時間）
                          </label>
                          <input
                            id="schedule-time"
                            type="time"
                            value={scheduleTime}
                            disabled={!scheduleEnabled}
                            onChange={(e) => {
                              setScheduleTime(e.target.value);
                              setScheduleMessage(null);
                            }}
                            className="border border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>

                        <button
                          onClick={handleSaveSchedule}
                          disabled={savingSchedule || (scheduleEnabled && !scheduleTime)}
                          className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white rounded-xl font-bold transition-all shadow-md"
                        >
                          {savingSchedule ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Clock className="w-5 h-5" />
                          )}
                          {savingSchedule ? '儲存中...' : '儲存設定'}
                        </button>
                      </div>

                      {scheduleMessage && (
                        <p className="mt-4 text-sm font-semibold text-teal-700" role="status">
                          {scheduleMessage}
                        </p>
                      )}

                      <p className="mt-4 text-xs text-slate-400 leading-relaxed">
                        若伺服器在設定時間點未啟動，之後啟動時會自動補產生當天摘要。
                        平時同一天只會產生一次；每次儲存設定後會允許重新產生一次，
                        方便確認設定是否生效。
                      </p>

                      {/* 立即推播：不受「當天已有摘要」限制，方便展示與測試 */}
                      <div className="mt-5 pt-5 border-t border-slate-200">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={handlePushNow}
                            disabled={pushingNow}
                            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-xl font-bold transition-all shadow-md"
                          >
                            {pushingNow ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Send className="w-5 h-5" />
                            )}
                            {pushingNow ? '推播中...' : '立即推播（測試）'}
                          </button>
                          <span className="text-xs text-slate-400">
                            不必等到設定時間，立刻產生今日摘要並寄出通知，可重複執行
                          </span>
                        </div>

                        {pushMessage && (
                          <p className="mt-3 text-sm font-semibold text-amber-700" role="status">
                            {pushMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 操作按鈕 */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleGenerateSummary}
                    disabled={generatingSummary}
                    className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white rounded-xl font-bold transition-all shadow-md"
                  >
                    {generatingSummary ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {generatingSummary ? '生成中...' : '產生每日摘要'}
                  </button>
                  <button
                    onClick={handleGenerateWeekly}
                    disabled={generatingWeekly}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white rounded-xl font-bold transition-all shadow-md"
                  >
                    {generatingWeekly ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {generatingWeekly ? '生成中...' : '產生本週總結'}
                  </button>
                  {/* 暫時隱藏「更新跨日洞察」按鈕，之後可能恢復
                  <button
                    onClick={handleGenerateInsights}
                    disabled={generatingInsights}
                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-xl font-bold transition-all shadow-md"
                  >
                    {generatingInsights ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    {generatingInsights ? '分析中...' : '更新跨日洞察'}
                  </button>
                  */}
                </div>

                {/* 摘要區塊 */}
                {loadingOverview ? (
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                      <span className="ml-2 text-slate-500">載入摘要中...</span>
                    </div>
                  </div>
                ) : dailySummaries.length > 0 ? (
                  <>
                    {/* 本週總結區塊 */}
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative">
                      <h3 className="text-xl font-bold text-slate-800 mb-6">本週總結</h3>
                      {weeklySummaries.length > 0 && (
                        <div className="absolute left-10 top-20 bottom-8 w-1 bg-indigo-100 rounded-full"></div>
                      )}
                      {weeklySummaries.length > 0 ? (
                        <div className="space-y-8 relative z-10">
                          {weeklySummaries.map((summary, idx) => (
                            <div key={idx} className="flex gap-6">
                              <div className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md flex-shrink-0 mt-1 bg-indigo-400">
                                <MessageSquare className="w-4 h-4" />
                              </div>
                              <div className="p-6 rounded-2xl border flex-1 bg-indigo-50/50 border-indigo-200">
                                <div className="flex justify-between items-center mb-3">
                                  <h4 className="font-bold text-lg text-slate-800">本週總結</h4>
                                  <span className="text-sm font-semibold text-slate-500">{summary.date}</span>
                                </div>
                                <p className="text-slate-700 leading-relaxed text-lg">{summary.summary_text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-center py-6">尚無本週總結，點擊上方按鈕產生</p>
                      )}
                    </div>

                    {/* 每日摘要區塊 */}
                    <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative">
                      <h3 className="text-xl font-bold text-slate-800 mb-6">每日摘要</h3>
                      {dailyOnlySummaries.length > 0 && (
                        <div className="absolute left-10 top-20 bottom-8 w-1 bg-teal-100 rounded-full"></div>
                      )}
                      {dailyOnlySummaries.length > 0 ? (
                        <div className="space-y-8 relative z-10">
                          {dailyOnlySummaries.map((summary, idx) => (
                            <div key={idx} className="flex gap-6">
                              <div className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md flex-shrink-0 mt-1 bg-teal-500">
                                <MessageSquare className="w-4 h-4" />
                              </div>
                              <div className="p-6 rounded-2xl border flex-1 bg-slate-50 border-slate-200">
                                <div className="flex justify-between items-center mb-3">
                                  <h4 className="font-bold text-lg text-slate-800">每日摘要</h4>
                                  <span className="text-sm font-semibold text-slate-500">{summary.date}</span>
                                </div>
                                <p className="text-slate-700 leading-relaxed text-lg">{summary.summary_text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-center py-6">尚無每日摘要，點擊上方按鈕產生</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                    <div className="text-center py-12">
                      <p className="text-slate-400 text-lg">尚無摘要紀錄，點擊上方按鈕產生</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========== 設定提醒 Tab ========== */}
            {activeTab === 'reminders' && (
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="mb-8">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <BellRing className="w-6 h-6 text-teal-500" /> 主動關懷設定
                  </h3>
                  <p className="text-slate-500 mt-1">設定小安助手在與長輩對話時，主動詢問的關心事項。</p>
                </div>

                {/* 新增關懷事項區塊 */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-8">
                  <h4 className="font-bold text-slate-700 mb-4 text-lg">新增關懷事項</h4>
                  <div className="flex gap-4 mb-4">
                    <input
                      type="text"
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddReminder()}
                      placeholder="例如：今天記得餵貓了嗎？"
                      className="flex-1 border border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                    />
                    <button onClick={handleAddReminder} disabled={!newQuestion.trim()} className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white px-6 rounded-xl font-bold transition-colors flex items-center gap-2">
                      <Plus className="w-5 h-5" /> 新增
                    </button>
                  </div>
                  {/* 追蹤模式切換 */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-600">提醒模式：</span>
                    <button
                      onClick={() => setNewTrackMode(true)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${newTrackMode ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                    >
                      需要確認回覆
                    </button>
                    <button
                      onClick={() => setNewTrackMode(false)}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!newTrackMode ? 'bg-indigo-500 text-white shadow-md' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                    >
                      提醒一次即可
                    </button>
                    <span className="text-xs text-slate-400 ml-2">
                      {newTrackMode ? '長輩需明確回覆已完成才會停止提醒' : 'AI 提過一次後自動結束'}
                    </span>
                  </div>
                </div>

                {/* 進行中的提醒（track=true） */}
                {loadingCareItems ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                    <span className="ml-2 text-slate-500">載入關懷事項中...</span>
                  </div>
                ) : (
                  <>
                    {/* 等待回覆中的提醒 */}
                    {careItems.filter((r) => r.track).length > 0 && (
                      <div className="mb-8">
                        <h4 className="font-bold text-slate-700 mb-4 text-lg flex items-center gap-2">
                          <span className="w-3 h-3 bg-amber-400 rounded-full animate-pulse"></span>
                          提醒中（等待長輩回應）
                        </h4>
                        <div className="space-y-3">
                          {careItems.filter((r) => r.track).map((item) => (
                            <div key={item.fact_id} className="flex items-center justify-between p-4 rounded-xl border-2 border-amber-200 bg-amber-50/50 transition-all">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="flex flex-col">
                                  <span className="text-lg font-semibold text-slate-800">{item.content}</span>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.require_confirmation ? 'bg-teal-100 text-teal-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                      {item.require_confirmation ? '需確認回覆' : '提醒一次即可'}
                                    </span>
                                    <span className="text-xs text-amber-600 font-semibold">未獲回覆</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleStopTracking(item.fact_id)}
                                  className="px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                                  title="手動標記為已完成"
                                >
                                  標記完成
                                </button>
                                <button onClick={() => removeReminder(item.fact_id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="刪除此提醒">
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 已完成的提醒（track=false），最多顯示 10 項 */}
                    {careItems.filter((r) => !r.track).length > 0 && (
                      <div className="mb-4">
                        <h4 className="font-bold text-slate-400 mb-4 text-lg">
                          已完成 / 已停止提醒
                          {careItems.filter((r) => !r.track).length > 10 && (
                            <span className="text-sm font-normal ml-2">（顯示最新 10 項，共 {careItems.filter((r) => !r.track).length} 項）</span>
                          )}
                        </h4>
                        <div className="space-y-3">
                          {careItems.filter((r) => !r.track).slice(0, 10).map((item) => (
                            <div key={item.fact_id} className="flex items-center justify-between p-4 rounded-xl border-2 border-slate-100 bg-slate-50 opacity-60 transition-all">
                              <div className="flex items-center gap-3 flex-1">
                                <span className="text-lg font-semibold text-slate-500 line-through">{item.content}</span>
                              </div>
                              <button onClick={() => removeReminder(item.fact_id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="刪除">
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {careItems.length === 0 && (
                      <p className="text-center text-slate-400 py-8 text-lg">目前沒有設定任何關懷提醒事項</p>
                    )}
                  </>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default CaregiverElderDetail;
