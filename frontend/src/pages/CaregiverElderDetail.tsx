import React, { useState, useEffect } from 'react';
import { useMockData } from '../store/MockDataContext';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, User, MessageSquare, BellRing, Save, Trash2, Plus, Brain, Utensils, Pill, Activity, HeartPulse, Loader2, RefreshCw, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { healthApi, summaryApi, type DailySummary, type HealthOverview } from '../services/api';

const CaregiverElderDetail: React.FC = () => {
  const { followingElders, updateReminders, elders } = useMockData();
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

  // Reminders (仍為本地 state，後端尚未支援)
  const elderMockData = elderInfo ? elders[elderInfo.account_handle] : null;
  const [reminders, setReminders] = useState(elderMockData?.reminders || []);
  const [newQuestion, setNewQuestion] = useState('');

  useEffect(() => {
    if (accountId) {
      loadHealthData();
    }
  }, [accountId]);

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

  const handleSaveReminders = () => {
    if (elderInfo && elderMockData) {
      updateReminders(elderInfo.account_handle, reminders);
      alert('提醒設定已儲存！');
    }
  };

  const handleAddReminder = () => {
    if (newQuestion.trim()) {
      setReminders([...reminders, { id: Date.now().toString(), question: newQuestion, isActive: true }]);
      setNewQuestion('');
    }
  };

  const removeReminder = (id: string) => {
    setReminders(reminders.filter((r) => r.id !== id));
  };

  const toggleReminder = (id: string) => {
    setReminders(reminders.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r)));
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
    ? [...(healthOverview.medication_facts || []), ...(healthOverview.body_facts || [])].map((f) => ({
        id: f.fact_id,
        type: categoryToType(f.category),
        title: `${f.category}記憶卡`,
        content: f.content,
        date: f.updated_at?.split('T')[0] || '',
      }))
    : [];

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
              onClick={() => navigate('/')}
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

                {/* 記憶卡片 */}
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Brain className="w-6 h-6 text-teal-500" /> 記憶卡片總覽
                  </h3>
                  {loadingOverview ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                      <span className="ml-2 text-slate-500">載入中...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {memoryCards.map((card) => (
                        <div key={card.id} className={`p-5 rounded-2xl border ${getBgForType(card.type)}`}>
                          <div className="flex items-center gap-2 mb-2">
                            {getIconForType(card.type)}
                            <h4 className="font-bold text-slate-800">{card.title}</h4>
                          </div>
                          <p className="text-slate-700">{card.content}</p>
                          <p className="text-right text-xs text-slate-500 mt-2 font-medium">{card.date}</p>
                        </div>
                      ))}
                      {memoryCards.length === 0 && (
                        <p className="col-span-2 text-slate-400 text-center py-6">尚無記憶卡片紀錄</p>
                      )}
                    </div>
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
                  <button
                    onClick={handleGenerateInsights}
                    disabled={generatingInsights}
                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-xl font-bold transition-all shadow-md"
                  >
                    {generatingInsights ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    {generatingInsights ? '分析中...' : '更新跨日洞察'}
                  </button>
                </div>

                {/* 摘要時間軸 */}
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative">
                  <div className="absolute left-10 top-16 bottom-8 w-1 bg-teal-100 rounded-full"></div>

                  {loadingOverview ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                      <span className="ml-2 text-slate-500">載入摘要中...</span>
                    </div>
                  ) : dailySummaries.length > 0 ? (
                    <div className="space-y-8 relative z-10">
                      {dailySummaries.map((summary, idx) => {
                        const isWeekly = summary.summary_type === 'weekly';
                        return (
                          <div key={idx} className="flex gap-6">
                            <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center shadow-md flex-shrink-0 mt-1 ${isWeekly ? 'bg-indigo-400' : 'bg-teal-500'}`}>
                              <MessageSquare className="w-4 h-4" />
                            </div>
                            <div className={`p-6 rounded-2xl border flex-1 ${isWeekly ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
                              <div className="flex justify-between items-center mb-3">
                                <h4 className="font-bold text-lg text-slate-800">{isWeekly ? '本週總結' : '每日摘要'}</h4>
                                <span className="text-sm font-semibold text-slate-500">{summary.date}</span>
                              </div>
                              <p className="text-slate-700 leading-relaxed text-lg">{summary.summary_text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 relative z-10">
                      <p className="text-slate-400 text-lg">尚無摘要紀錄，點擊上方按鈕產生</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========== 設定提醒 Tab ========== */}
            {activeTab === 'reminders' && (
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <BellRing className="w-6 h-6 text-teal-500" /> 主動關懷設定
                    </h3>
                    <p className="text-slate-500 mt-1">設定小安助手在與長輩對話時，主動詢問的關心事項。</p>
                  </div>
                  <button onClick={handleSaveReminders} className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all shadow-md">
                    <Save className="w-5 h-5" /> 儲存變更
                  </button>
                </div>

                <div className="space-y-4 mb-8">
                  {reminders.map((reminder) => (
                    <div key={reminder.id} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${reminder.isActive ? 'border-teal-200 bg-teal-50/50' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                      <div className="flex items-center gap-4 flex-1">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={reminder.isActive} onChange={() => toggleReminder(reminder.id)} className="sr-only peer" />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500"></div>
                        </label>
                        <span className={`text-lg font-semibold ${reminder.isActive ? 'text-slate-800' : 'text-slate-500 line-through'}`}>{reminder.question}</span>
                      </div>
                      <button onClick={() => removeReminder(reminder.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  {reminders.length === 0 && (
                    <p className="text-center text-slate-400 py-4">目前沒有設定任何提醒事項</p>
                  )}
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                  <h4 className="font-bold text-slate-700 mb-4 text-lg">新增關懷事項</h4>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddReminder()}
                      placeholder="例如：今天量血壓了嗎？"
                      className="flex-1 border border-slate-300 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50"
                    />
                    <button onClick={handleAddReminder} disabled={!newQuestion.trim()} className="bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white px-6 rounded-xl font-bold transition-colors flex items-center gap-2">
                      <Plus className="w-5 h-5" /> 新增
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default CaregiverElderDetail;
