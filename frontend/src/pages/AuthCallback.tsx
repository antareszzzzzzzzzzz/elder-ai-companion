import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMockData } from '../store/MockDataContext';
import { HeartPulse, Loader2 } from 'lucide-react';

/**
 * OAuth Callback 頁面
 * Cognito 驗證完成後，後端會 redirect 到這裡帶上 tokens：
 * /auth/callback?id_token=xxx&access_token=xxx&refresh_token=xxx
 */
const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithToken } = useMockData();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idToken = params.get('id_token');
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (idToken) {
      // 儲存 tokens
      localStorage.setItem('id_token', idToken);
      if (accessToken) localStorage.setItem('access_token', accessToken);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);

      // 觸發登入流程（會去呼叫 /api/auth/me 取得使用者資料）
      loginWithToken(idToken).then(() => {
        navigate('/', { replace: true });
      });
    } else {
      // 沒有 token，回到登入頁
      navigate('/login', { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-teal-50 to-amber-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg mx-auto mb-6 transform rotate-3">
          <HeartPulse className="text-white w-10 h-10" />
        </div>
        <div className="flex items-center gap-3 justify-center">
          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          <p className="text-xl text-slate-600 font-medium">正在登入中...</p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;
