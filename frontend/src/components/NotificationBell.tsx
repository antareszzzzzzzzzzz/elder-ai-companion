import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { followApi, summaryApi } from '../services/api';
import { AnimatePresence, motion } from 'framer-motion';

interface PendingRequest {
  follow_id: string;
  account_id: string;
  account_handle: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
}

interface SummaryNotice {
  account_id: string;
  display_name: string;
  date: string;
  summary_text: string;
}

/** 已讀狀態：{ [account_id]: 已讀的日期 } */
const SEEN_KEY = 'seen_daily_summaries';

function loadSeen(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function markSeen(accountId: string, date: string) {
  const seen = loadSeen();
  seen[accountId] = date;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // localStorage 不可用時就當作沒有已讀狀態，不影響主流程
  }
}

/** 台灣時區的今天（YYYY-MM-DD），與後端 TW_TZ 的日期切分一致 */
function todayTW(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface NotificationBellProps {
  /** 放在深色底的 header 上時傳 true，調整圖示配色 */
  onDark?: boolean;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ onDark = false }) => {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [summaryNotices, setSummaryNotices] = useState<SummaryNotice[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // 綁定請求：每 5 秒輪詢（維持原本行為）
  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 5000);
    return () => clearInterval(interval);
  }, []);

  // 每日摘要通知：每 60 秒輪詢
  // 間隔比綁定請求長，因為每次要對每位追蹤對象各查一次摘要
  useEffect(() => {
    fetchSummaryNotices();
    const interval = setInterval(fetchSummaryNotices, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchPending = async () => {
    try {
      const data = await followApi.getPendingRequests();
      setPendingRequests(data);
    } catch (err) {
      console.error('Failed to fetch pending requests:', err);
    }
  };

  const fetchSummaryNotices = async () => {
    try {
      const following = await followApi.getMyFollowing();
      if (!following || following.length === 0) {
        setSummaryNotices([]);
        return;
      }

      const today = todayTW();
      const seen = loadSeen();

      const results = await Promise.all(
        following.map(async (elder: any) => {
          try {
            const summaries = await summaryApi.getDailySummaries(elder.account_id);
            const todaySummary = summaries.find(
              (s) => s.date === today && s.summary_type !== 'weekly'
            );
            if (!todaySummary) return null;
            if (seen[elder.account_id] === today) return null;
            return {
              account_id: elder.account_id,
              display_name: elder.display_name || elder.account_handle || '家人',
              date: todaySummary.date,
              summary_text: todaySummary.summary_text,
            } as SummaryNotice;
          } catch {
            // 單一長輩查詢失敗不影響其他人
            return null;
          }
        })
      );

      setSummaryNotices(results.filter((r): r is SummaryNotice => r !== null));
    } catch (err) {
      console.error('Failed to fetch summary notices:', err);
    }
  };

  const handleApprove = async (followId: string) => {
    setActionLoading(followId);
    try {
      await followApi.approve(followId);
      setPendingRequests((prev) => prev.filter((r) => r.follow_id !== followId));
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (followId: string) => {
    setActionLoading(followId);
    try {
      await followApi.reject(followId);
      setPendingRequests((prev) => prev.filter((r) => r.follow_id !== followId));
    } catch (err) {
      console.error('Failed to reject:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenSummary = (notice: SummaryNotice) => {
    markSeen(notice.account_id, notice.date);
    setSummaryNotices((prev) => prev.filter((n) => n.account_id !== notice.account_id));
    setShowDropdown(false);
    navigate(`/elder/${notice.account_id}`);
  };

  const handleDismissSummary = (notice: SummaryNotice) => {
    markSeen(notice.account_id, notice.date);
    setSummaryNotices((prev) => prev.filter((n) => n.account_id !== notice.account_id));
  };

  const totalCount = pendingRequests.length + summaryNotices.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`relative p-2 rounded-full transition-colors ${
          onDark ? 'hover:bg-white/20' : 'hover:bg-emerald-200/50'
        }`}
        title="通知"
        aria-label={totalCount > 0 ? `通知，${totalCount} 則未讀` : '通知'}
        aria-expanded={showDropdown}
      >
        <Bell className={`w-6 h-6 ${onDark ? 'text-white' : 'text-emerald-700'}`} />
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full animate-pulse">
            {totalCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50"
          >
            <div className="max-h-96 overflow-y-auto">
              {/* ===== 每日摘要通知 ===== */}
              {summaryNotices.length > 0 && (
                <>
                  <div className="px-4 py-3 border-b border-slate-100 bg-teal-50">
                    <h4 className="font-bold text-teal-700">每日摘要</h4>
                  </div>
                  {summaryNotices.map((notice) => (
                    <div
                      key={notice.account_id}
                      className="px-4 py-3 border-b border-slate-50 hover:bg-slate-50/50"
                    >
                      <div className="flex items-start gap-3 mb-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-700 truncate">
                            {notice.display_name} 的每日摘要已產生
                          </p>
                          <p className="text-xs text-slate-400 mb-1">{notice.date}</p>
                          <p className="text-sm text-slate-500 line-clamp-2">
                            {notice.summary_text}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenSummary(notice)}
                          className="flex-1 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
                        >
                          查看摘要
                        </button>
                        <button
                          onClick={() => handleDismissSummary(notice)}
                          className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-600 text-sm font-semibold py-2 rounded-lg transition-colors"
                        >
                          知道了
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* ===== 綁定通知 ===== */}
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                <h4 className="font-bold text-slate-700">綁定通知</h4>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>目前沒有新的綁定請求</p>
                </div>
              ) : (
                pendingRequests.map((req) => (
                  <div
                    key={req.follow_id}
                    className="px-4 py-3 border-b border-slate-50 hover:bg-slate-50/50"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {(req.display_name || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-700 truncate">
                          {req.display_name || req.account_handle}
                        </p>
                        <p className="text-sm text-slate-500">想要追蹤您的健康狀況</p>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-13">
                      <button
                        onClick={() => handleApprove(req.follow_id)}
                        disabled={actionLoading === req.follow_id}
                        className="flex-1 flex items-center justify-center gap-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
                      >
                        <Check className="w-4 h-4" /> 允許
                      </button>
                      <button
                        onClick={() => handleReject(req.follow_id)}
                        disabled={actionLoading === req.follow_id}
                        className="flex-1 flex items-center justify-center gap-1 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-600 text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" /> 拒絕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
