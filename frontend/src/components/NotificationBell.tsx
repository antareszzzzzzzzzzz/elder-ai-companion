import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { followApi } from '../services/api';
import { AnimatePresence, motion } from 'framer-motion';

interface PendingRequest {
  follow_id: string;
  account_id: string;
  account_handle: string;
  display_name: string;
  avatar_url: string;
  created_at: string;
}

const NotificationBell: React.FC = () => {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Poll for pending requests every 5 seconds
  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 5000);
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-full hover:bg-emerald-200/50 transition-colors"
        title="通知"
      >
        <Bell className="w-6 h-6 text-emerald-700" />
        {pendingRequests.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full animate-pulse">
            {pendingRequests.length}
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
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h4 className="font-bold text-slate-700">綁定通知</h4>
            </div>

            <div className="max-h-80 overflow-y-auto">
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
