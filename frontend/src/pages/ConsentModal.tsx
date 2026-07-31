import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface ConsentModalProps {
  onConsented: () => void;
}

const ConsentModal: React.FC<ConsentModalProps> = ({ onConsented }) => {
  const [loading, setLoading] = useState(false);

  const handleConsent = async () => {
    setLoading(true);
    try {
      await api.post('/api/profile/consent');
      onConsented();
    } catch (err) {
      console.error('Consent API error:', err);
      // 即使 API 失敗也讓使用者進入（避免卡死）
      onConsented();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
      >
        <div className="bg-emerald-50 px-8 py-6 border-b border-emerald-100 flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">使用前須知</h2>
            <p className="text-emerald-700 font-medium">請您先了解以下說明</p>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="text-lg text-slate-700 leading-relaxed space-y-4">
            <p>
              這個 App 會記住您跟它說過的話，包括您提到的飲食、活動、睡眠、用藥、身體狀況等生活小事，用來每天幫您整理成一份簡單的紀錄。
            </p>
            <p>
              這份紀錄會給您指定的家人或照護者看，讓他們知道您最近過得如何，不會給其他人看。
            </p>
            <p>
              您隨時可以請家人或照護者聯絡我們，要求刪除您的資料，或是停止使用這個服務。
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200">
            <p className="text-sm font-semibold text-slate-500 mb-2">關於您的資料安全：</p>
            <ul className="text-sm text-slate-500 space-y-1.5 list-disc list-inside">
              <li>您的對話內容和健康紀錄以加密方式儲存在 AWS 雲端資料庫中</li>
              <li>所有資料傳輸均透過 HTTPS 加密連線</li>
              <li>只有通過您授權的家人或照護者可以查看您的紀錄</li>
              <li>登入驗證由 AWS Cognito 提供，密碼不會被本系統儲存</li>
              <li>對話紀錄保留 30 天後自動清除，健康摘要長期保留供照護參考</li>
              <li>您或您的授權代理人可隨時要求完整刪除所有資料</li>
            </ul>
          </div>
        </div>

        <div className="px-8 py-6 bg-slate-50 border-t border-slate-100">
          <p className="text-slate-500 text-sm mb-4">如果您了解並同意，請按下方按鈕開始使用。</p>
          <button
            onClick={handleConsent}
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-emerald-300 disabled:to-teal-300 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all text-xl flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" /> 處理中...
              </>
            ) : (
              '我同意，開始使用'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ConsentModal;
