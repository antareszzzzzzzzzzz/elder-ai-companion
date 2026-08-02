import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '../services/api';

export type Role = 'elderly' | 'caregiver';

export type MemoryCardType = 'diet' | 'medication' | 'activity' | 'sleep' | 'body' | 'mood' | 'other';

export interface MemoryCard {
  id: string;
  type: MemoryCardType;
  title: string;
  content: string;
  date: string;
}

export interface Reminder {
  id: string;
  question: string;
  isActive: boolean;
}

export interface ElderData {
  id: string;
  username: string;
  name: string;
  birth: string;
  height: string;
  weight: string;
  bindingCode: string;
  memoryCards: MemoryCard[];
  reminders: Reminder[];
}

/** 從 GET /api/follow/my-following 回傳的結構 */
export interface FollowingElder {
  follow_id: string;
  account_id: string;
  account_handle: string;
  display_name: string;
  avatar_url: string;
}

export interface User {
  username: string;
  name: string;
  role: Role;
  accountId: string;
  consentGiven: boolean;
}

interface MockDataContextType {
  user: User | null;
  loading: boolean;
  elders: Record<string, ElderData>;
  boundElders: string[];
  followingElders: FollowingElder[];
  loginWithToken: (idToken: string) => Promise<void>;
  logout: () => void;
  bindElder: (username: string, code: string) => boolean;
  bindElderViaApi: (handle: string, code: string) => Promise<void>;
  generateBindingCode: (username: string) => void;
  updateElderProfile: (username: string, data: Partial<ElderData>) => void;
  updateReminders: (username: string, reminders: Reminder[]) => void;
  switchRole: () => Promise<void>;
  refreshFollowing: () => Promise<void>;
  markConsented: () => void;
}

const defaultElders: Record<string, ElderData> = {
  'elder1': {
    id: 'elder1',
    username: 'elder1',
    name: '王阿公',
    birth: '1945-05-12',
    height: '165',
    weight: '68',
    bindingCode: '123456',
    memoryCards: [
      { id: 'm1', type: 'medication', title: '用藥記憶卡', content: '今天早上 10:00 已經服用了降血壓藥物，提醒反應良好。', date: '2026-07-26' },
      { id: 'm2', type: 'diet', title: '飲食記憶卡', content: '中午吃了半碗白飯和清蒸魚，胃口不錯，但青菜吃得比較少。', date: '2026-07-26' },
    ],
    reminders: [
      { id: 'r1', question: '今天是否有吃過藥？', isActive: true },
      { id: 'r2', question: '今天有出去散步嗎？', isActive: false },
    ]
  }
};

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

export const MockDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [elders, setElders] = useState<Record<string, ElderData>>(defaultElders);
  const [boundElders, setBoundElders] = useState<string[]>([]);
  const [followingElders, setFollowingElders] = useState<FollowingElder[]>([]);

  // 初始化：檢查是否已有 token，嘗試自動登入
  useEffect(() => {
    const token = localStorage.getItem('id_token');
    if (token) {
      fetchUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  /** 從 /api/auth/me 取得使用者資料 */
  const fetchUser = async () => {
    try {
      const data = await api.get<any>('/api/auth/me');
      const userData: User = {
        username: data.account_handle || data.account_id?.slice(0, 8) || '',
        name: data.display_name || '使用者',
        role: (data.role === 'caregiver' ? 'caregiver' : 'elderly') as Role,
        accountId: data.account_id,
        consentGiven: data.consent_given === true,
      };
      setUser(userData);

      // 如果是照護者，自動載入追蹤列表
      if (userData.role === 'caregiver') {
        await loadFollowing();
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
      localStorage.removeItem('id_token');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      setUser(null);
    }
  };

  /** 載入追蹤中的長輩列表 */
  const loadFollowing = async () => {
    try {
      const data = await api.get<FollowingElder[]>('/api/follow/my-following');
      setFollowingElders(data);
    } catch (err) {
      console.error('Failed to load following:', err);
    }
  };

  /** 重新整理追蹤列表（供外部呼叫） */
  const refreshFollowing = async () => {
    await loadFollowing();
  };

  /** Cognito callback 後呼叫 */
  const loginWithToken = async (idToken: string) => {
    localStorage.setItem('id_token', idToken);
    await fetchUser();
  };

  const logout = () => {
    const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
    const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
    const FRONTEND_URL = window.location.origin;

    localStorage.removeItem('id_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    setFollowingElders([]);
    setBoundElders([]);

    if (COGNITO_DOMAIN && COGNITO_CLIENT_ID) {
      window.location.href = `https://${COGNITO_DOMAIN}/logout?client_id=${COGNITO_CLIENT_ID}&logout_uri=${encodeURIComponent(FRONTEND_URL)}`;
    }
  };

  /** 切換角色並持久化到後端 */
  const switchRole = async () => {
    if (!user) return;
    const newRole: Role = user.role === 'elderly' ? 'caregiver' : 'elderly';
    setUser({ ...user, role: newRole });

    try {
      await api.put('/api/profile/role', { role: newRole });
      // 如果切到照護者，載入追蹤列表
      if (newRole === 'caregiver') {
        await loadFollowing();
      }
    } catch (err) {
      console.error('Failed to update role:', err);
      setUser({ ...user, role: user.role });
    }
  };

  /** 呼叫後端 API 綁定長輩（照護者用） */
  const bindElderViaApi = async (handle: string, code: string) => {
    await api.post('/api/follow/request', {
      followee_handle: handle,
      binding_code: code,
    });
    // 綁定成功 → 重新載入追蹤列表
    await loadFollowing();
  };

  // 以下保留 Mock 邏輯做 fallback（不影響真實流程）
  const bindElder = (username: string, code: string) => {
    if (elders[username] && elders[username].bindingCode === code) {
      if (!boundElders.includes(username)) {
        setBoundElders([...boundElders, username]);
      }
      return true;
    }
    return false;
  };

  const generateBindingCode = (username: string) => {
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    setElders((prev) => ({
      ...prev,
      [username]: { ...prev[username], bindingCode: newCode },
    }));
    // 同步更新後端
    api.put('/api/profile/binding-code', { code: newCode }).catch(() => {});
  };

  const updateElderProfile = (username: string, data: Partial<ElderData>) => {
    setElders((prev) => ({
      ...prev,
      [username]: { ...prev[username], ...data },
    }));
  };

  const updateReminders = (username: string, reminders: Reminder[]) => {
    setElders((prev) => ({
      ...prev,
      [username]: { ...prev[username], reminders },
    }));
  };

  const markConsented = () => {
    if (user) {
      setUser({ ...user, consentGiven: true });
    }
  };

  return (
    <MockDataContext.Provider
      value={{
        user,
        loading,
        elders,
        boundElders,
        followingElders,
        loginWithToken,
        logout,
        bindElder,
        bindElderViaApi,
        generateBindingCode,
        updateElderProfile,
        updateReminders,
        switchRole,
        refreshFollowing,
        markConsented,
      }}
    >
      {children}
    </MockDataContext.Provider>
  );
};

export const useMockData = () => {
  const context = useContext(MockDataContext);
  if (context === undefined) {
    throw new Error('useMockData must be used within a MockDataProvider');
  }
  return context;
};
