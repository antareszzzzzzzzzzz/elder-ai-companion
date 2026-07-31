import React from 'react';
import { HeartPulse, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMockData } from '../store/MockDataContext';

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const COGNITO_REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI;

const AuthPage: React.FC = () => {
  const { loading } = useMockData();

  const handleLogin = () => {
    const loginUrl = `https://${COGNITO_DOMAIN}/login?client_id=${COGNITO_CLIENT_ID}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(COGNITO_REDIRECT_URI)}`;
    window.location.href = loginUrl;
  };

  const handleRegister = () => {
    const signupUrl = `https://${COGNITO_DOMAIN}/signup?client_id=${COGNITO_CLIENT_ID}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(COGNITO_REDIRECT_URI)}`;
    window.location.href = signupUrl;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-teal-50 to-amber-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-teal-50 to-amber-50 flex items-center justify-center p-4">
      {/* 裝飾背景球 */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-amber-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/70 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/50 z-10"
      >
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
              <HeartPulse className="text-white w-10 h-10" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-center text-slate-800 mb-2">
            智慧長期照護平台
          </h2>
          <p className="text-center text-slate-500 mb-8 font-medium">
            結合 AI 的智慧陪伴與健康照護系統
          </p>

          <div className="space-y-4">
            <button
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-4 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 group text-lg"
            >
              登入系統
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={handleRegister}
              className="w-full bg-white border-2 border-emerald-200 hover:border-emerald-400 text-emerald-700 font-bold py-4 px-4 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 group text-lg"
            >
              註冊新帳號
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <p className="text-center text-slate-400 text-sm mt-8">
            使用 AWS Cognito 安全驗證
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;
