import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useMockData } from './store/MockDataContext';

import AuthPage from './pages/AuthPage';
import AuthCallback from './pages/AuthCallback';
import ElderlyDashboard from './pages/ElderlyDashboard';
import ElderProfilePage from './pages/ElderProfilePage';
import CaregiverDashboard from './pages/CaregiverDashboard';
import CaregiverElderDetail from './pages/CaregiverElderDetail';
import ConsentModal from './pages/ConsentModal';

const App: React.FC = () => {
  const { user, loading, markConsented } = useMockData();

  // 處理 OAuth callback
  if (window.location.pathname === '/auth/callback') {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
    );
  }

  // 載入中
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-teal-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">載入中...</p>
        </div>
      </div>
    );
  }

  // 未登入
  if (!user) {
    return (
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  // 已登入但長輩尚未同意 → 顯示同意書
  if (user.role === 'elderly' && !user.consentGiven) {
    return <ConsentModal onConsented={markConsented} />;
  }

  // 已登入 — 依角色分流
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      {user.role === 'elderly' ? (
        <>
          <Route path="/" element={<ElderlyDashboard />} />
          <Route path="/profile" element={<ElderProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<ElderlyDashboard />} />
          <Route path="/caregiver" element={<CaregiverDashboard />} />
          <Route path="/chat" element={<ElderlyDashboard />} />
          <Route path="/profile" element={<ElderProfilePage />} />
          <Route path="/elder/:accountId" element={<CaregiverElderDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
};

export default App;
