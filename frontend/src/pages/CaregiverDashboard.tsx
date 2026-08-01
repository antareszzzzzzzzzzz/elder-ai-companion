import React, { useState, useEffect } from 'react';
import { useMockData } from '../store/MockDataContext';
import { useNavigate } from 'react-router-dom';
import { Plus, User, LogOut, ArrowRight, HeartPulse, UserPlus, X, MessageSquare, Loader2, Trash2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { followApi } from '../services/api';

const CaregiverDashboard: React.FC = () => {
  const { user, followingElders, logout, bindElderViaApi, refreshFollowing } = useMockData();
  const navigate = useNavigate();
  const [showBindModal, setShowBindModal] = useState(false);
  const [bindUsername, setBindUsername] = useState('');
  const [bindCode, setBindCode] = useState('');
  const [bindError, setBindError] = useState('');
  const [bindLoading, setBindLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [pendingSent, setPendingSent] = useState<any[]>([]);
  const [cancelLoading, setCancelLoading] = useState<string | null>(null);

  const loadPendingSent = async () => {
    try {
      const data = await followApi.getMyPendingSent();
      setPendingSent(data);
    } catch (err) {
      console.error('Failed to load pending sent:', err);
    }
  };

  // 頁面載入時確保追蹤列表是最新的，並每 5 秒輪詢
  useEffect(() => {
    refreshFollowing();
    loadPendingSent();
    const interval = setInterval(() => {
      refreshFollowing();
      loadPendingSent();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleBind = async (e: React.FormEvent) => {
    e.preventDefault();
    setBindError('');

    if (!bindUsername || !bindCode) {
      setBindError('請輸入長輩帳號與綁定授權碼');
      return;
    }

    setBindLoading(true);
    try {
      await bindElderViaApi(bindUsername.trim(), bindCode.trim());
      await loadPendingSent();
      setShowBindModal(false);
      setBindUsername('');
      setBindCode('');
    } catch (err: any) {
      setBindError(err.message || '綁定失敗，請確認帳號與授權碼是否正確。');
    } finally {
      setBindLoading(false);
    }
  };

  const handleRemoveFollow = async (e: React.MouseEvent, followId: string) => {
    e.stopPropagation();
    if (!confirm('確定要取消追蹤此家人嗎？')) return;
    setRemoveLoading(followId);
    try {
      await followApi.remove(followId);
      await refreshFollowing();
    } catch (err) {
      console.error('Failed to remove follow:', err);
    } finally {
      setRemoveLoading(null);
    }
  };

  const handleCancelPending = async (followId: string) => {
    if (!confirm('確定要取消這個追蹤請求嗎？')) return;
    setCancelLoading(followId);
    try {
      await followApi.remove(followId);
      setPendingSent(prev => prev.filter(p => p.follow_id !== followId));
    } catch (err) {
      console.error('Failed to cancel pending:', err);
    } finally {
      setCancelLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <header className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HeartPulse className="w-8 h-8 text-teal-100" />
            <h1 className="text-2xl font-bold">照護者管理中心</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-medium text-teal-50 mr-2">歡迎，{user?.name}</span>
            <button onClick={() => navigate('/chat')} className="flex items-center gap-2 text-teal-100 hover:text-white transition-colors bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg font-semibold" title="回到聊天">
              <MessageSquare className="w-4 h-4" /> 回到聊天
            </button>
            <button onClick={logout} className="flex items-center gap-2 text-teal-100 hover:text-white transition-colors bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg font-semibold">
              <LogOut className="w-4 h-4" /> 登出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8 flex justify-between items-center">
          <h2 className="text-3xl font-bold text-slate-800">您照護的家人</h2>
          {followingElders.length > 0 && (
            <button
              onClick={() => setShowBindModal(true)}
              className="flex items-center gap-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-5 py-2.5 rounded-xl font-bold transition-colors"
            >
              <Plus className="w-5 h-5" /> 新增家人
            </button>
          )}
        </div>

        {followingElders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-12 text-center shadow-sm border border-slate-100 flex flex-col items-center justify-center min-h-[400px]"
          >
            <div className="w-24 h-24 bg-teal-50 rounded-full flex items-center justify-center mb-6">
              <UserPlus className="w-12 h-12 text-teal-500" />
            </div>
            <h3 className="text-2xl font-bold text-slate-700 mb-2">尚未綁定任何家人</h3>
            <p className="text-slate-500 mb-8 text-lg">請新增需要您照護的長輩帳號，即可開始追蹤與設定。</p>
            <button
              onClick={() => setShowBindModal(true)}
              className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white font-bold text-xl py-4 px-8 rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center gap-3 transform hover:-translate-y-1"
            >
              <Plus className="w-6 h-6" /> 立即新增家人
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {followingElders.map((elder) => (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={elder.follow_id}
                onClick={() => navigate(`/elder/${elder.account_id}`)}
                className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md hover:border-teal-200 transition-all cursor-pointer group relative"
              >
                <button
                  onClick={(e) => handleRemoveFollow(e, elder.follow_id)}
                  disabled={removeLoading === elder.follow_id}
                  className="absolute top-4 right-4 p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  title="取消追蹤"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-2xl text-white flex items-center justify-center shadow-inner text-2xl font-bold">
                    {(elder.display_name || '?')[0]}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-800">{elder.display_name}</h3>
                    <p className="text-slate-500 font-medium">@{elder.account_handle}</p>
                  </div>
                </div>
                <div className="flex justify-between items-center text-teal-600 font-semibold group-hover:text-teal-700">
                  <span>查看詳細資料與設定</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* 待接受的追蹤 */}
        {pendingSent.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-amber-500" />
              待接受的追蹤
              <span className="text-base font-normal text-slate-400">({pendingSent.length})</span>
            </h2>
            <div className="space-y-3">
              {pendingSent.map((item) => (
                <div
                  key={item.follow_id}
                  className="flex items-center justify-between p-4 bg-amber-50 rounded-xl border border-amber-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-400 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {(item.display_name || '?')[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{item.display_name || '未知'}</p>
                      <p className="text-sm text-slate-500">@{item.account_handle || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-amber-600 font-medium bg-amber-100 px-3 py-1 rounded-full">等待對方接受</span>
                    <button
                      onClick={() => handleCancelPending(item.follow_id)}
                      disabled={cancelLoading === item.follow_id}
                      className="text-sm text-red-400 hover:text-red-600 font-semibold transition-colors"
                    >
                      {cancelLoading === item.follow_id ? '取消中...' : '取消請求'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* 綁定 Modal */}
      <AnimatePresence>
        {showBindModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">綁定家人帳號</h3>
                <button onClick={() => setShowBindModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleBind} className="p-6">
                <p className="text-slate-600 mb-4 font-medium">
                  請輸入長輩的帳號代碼與其專屬的 6 碼綁定授權碼。
                </p>

                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-500 mb-1">長輩帳號代碼</label>
                    <input
                      type="text"
                      value={bindUsername}
                      onChange={(e) => { setBindUsername(e.target.value); setBindError(''); }}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50 transition-all"
                      placeholder="請輸入對方的帳號代碼"
                      autoFocus
                      disabled={bindLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-500 mb-1">綁定授權碼 (6碼)</label>
                    <input
                      type="text"
                      value={bindCode}
                      onChange={(e) => { setBindCode(e.target.value); setBindError(''); }}
                      className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-lg font-mono focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50 transition-all"
                      placeholder="請輸入 6 碼數字"
                      maxLength={6}
                      disabled={bindLoading}
                    />
                  </div>
                </div>

                {bindError && <p className="text-red-500 text-sm font-semibold mb-4">{bindError}</p>}
                {!bindError && <div className="h-6"></div>}
                <button
                  type="submit"
                  disabled={bindLoading}
                  className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-bold py-3.5 rounded-xl transition-colors text-lg shadow-md flex items-center justify-center gap-2"
                >
                  {bindLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                  {bindLoading ? '綁定中...' : '確認綁定'}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CaregiverDashboard;
