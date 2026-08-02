/**
 * API Service Layer
 * 封裝與 elder-care-app 後端的所有 HTTP 通訊
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

class ApiService {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem('id_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async get<T = any>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async post<T = any>(path: string, body: any = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async put<T = any>(path: string, body: any = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async delete<T = any>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }
}

export const api = new ApiService();

// ============ 型別定義 ============

export interface ChatMessage {
  message_id?: string;
  session_id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatSession {
  session_id: string;
  account_id: string;
  title: string;
  created_at: string;
}

export interface ChatSendResponse {
  session_id: string;
  response: string;
  audio: string; // base64 mp3
  memory_updates: Array<{
    op: string;
    fact_id: string;
    category?: string;
    track?: boolean;
  }>;
}

export interface Fact {
  fact_id: string;
  account_id: string;
  category: string; // 飲食, 用藥, 活動, 睡眠, 身體, 情緒, 其他
  content: string;
  track: boolean;
  updated_at: string;
}

export interface DailySummary {
  'account_id#date'?: string;
  account_id: string;
  date: string;
  summary_type?: 'daily' | 'weekly';
  summary_text: string;
}

export interface HealthOverview {
  account_id: string;
  display_name: string;
  interaction_count: number;
  gender?: string;
  birth?: string;
  height?: string;
  weight?: string;
  chronic_conditions?: string;
  current_medications?: string;
  allergies?: string;
  daily_summaries: DailySummary[];
  medication_facts: Fact[];
  body_facts: Fact[];
  diet_facts?: Fact[];
  mood_facts?: Fact[];
  other_facts?: Fact[];
  cross_day_insights: string | null;
}

export interface SummarySchedule {
  followee_id: string;
  /** "HH:MM"（24 小時制，台灣時間）；null 代表未設定 / 已關閉 */
  daily_summary_time: string | null;
}

export interface ProfileData {
  account_id: string;
  account_handle: string;
  display_name: string;
  avatar_url: string;
  age: number | null;
  gender: string | null;
  birth: string;
  height: string;
  weight: string;
  chronic_conditions: string; // JSON string of array
  current_medications: string; // JSON string of array
  allergies: string; // JSON string of array
  binding_code?: string;
  personal_notes?: string;
  interaction_count: number;
  created_at: string;
}

// ============ API 方法 ============

/** 聊天相關 */
export const chatApi = {
  getSessions: () => api.get<ChatSession[]>('/api/chat/sessions'),
  createSession: (title?: string) => api.post<ChatSession>('/api/chat/sessions', { title }),
  getMessages: (sessionId: string) => api.get<ChatMessage[]>(`/api/chat/sessions/${sessionId}/messages`),
  send: (message: string, sessionId?: string | null) =>
    api.post<ChatSendResponse>('/api/chat/send', { message, session_id: sessionId }),
};

/** 個人資料相關 */
export const profileApi = {
  get: () => api.get<ProfileData>('/api/profile/'),
  update: (data: Partial<ProfileData>) => api.put<ProfileData>('/api/profile/', data),
  search: (handle: string) => api.get<ProfileData[]>(`/api/profile/search?handle=${encodeURIComponent(handle)}`),
};

/** 健康總覽相關 */
export const healthApi = {
  getOverview: (accountId: string) => api.get<HealthOverview>(`/api/health-overview/${accountId}`),
  generateInsights: (accountId: string) =>
    api.post<{ insights: string | null; patterns_found?: number }>(`/api/health-overview/${accountId}/insights`),
};

/** 摘要相關 */
export interface PushNowResult {
  date: string;
  summary_type?: string;
  facts_count?: number;
  /** 實際成功寄達的 email 清單 */
  recipients?: string[];
  email_enabled?: boolean;
  /** 當天沒有紀錄可摘要時回傳說明訊息 */
  message?: string;
}

export const summaryApi = {
  /** 立即產生今日摘要並寄送通知（可重複觸發，供展示用） */
  pushNow: (accountId: string) =>
    api.post<PushNowResult>(`/api/summary/push-now/${accountId}`),
  generateDaily: (accountId: string) =>
    api.post<{ date: string; summary: string; summary_type: string; facts_count: number }>(`/api/summary/generate-daily/${accountId}`),
  generateWeekly: (accountId: string) =>
    api.post<{ date: string; summary: string; summary_type: string; date_range: string; source_count: number }>(`/api/summary/generate-weekly/${accountId}`),
  getDailySummaries: (accountId: string) => api.get<DailySummary[]>(`/api/summary/daily/${accountId}`),
};

/** 追蹤相關 */
export const followApi = {
  getMyFollowing: () => api.get<any[]>('/api/follow/my-following'),
  getMyFollowers: () => api.get<any[]>('/api/follow/my-followers'),
  getPendingRequests: () => api.get<any[]>('/api/follow/pending-requests'),
  approve: (followId: string) => api.post('/api/follow/approve', { follow_id: followId }),
  reject: (followId: string) => api.post('/api/follow/reject', { follow_id: followId }),
  remove: (followId: string) => api.post('/api/follow/remove', { follow_id: followId }),

  /** 取得對某位被追蹤者設定的每日摘要自動推播時間 */
  getSummarySchedule: (followeeId: string) =>
    api.get<SummarySchedule>(`/api/follow/summary-schedule/${followeeId}`),

  /** 設定每日摘要自動推播時間；傳 null 代表關閉 */
  setSummarySchedule: (followeeId: string, time: string | null) =>
    api.put<SummarySchedule>('/api/follow/summary-schedule', {
      followee_id: followeeId,
      daily_summary_time: time,
    }),
};

// ============ 照護者關懷事項 ============

export interface CareItem {
  fact_id: string;
  account_id: string;
  category: string;
  content: string;
  track: boolean;
  source: 'caregiver';
  source_account_id: string;
  source_display_name?: string;
  require_confirmation: boolean;
  updated_at: string;
}

/** 照護者關懷事項相關 */
export const careItemsApi = {
  /** 取得某位長輩的所有關懷事項 */
  getItems: (accountId: string) =>
    api.get<CareItem[]>(`/api/care-items/${accountId}`),

  /** 新增關懷事項 */
  addItem: (accountId: string, content: string, track: boolean) =>
    api.post<CareItem>(`/api/care-items/${accountId}`, { content, track }),

  /** 刪除關懷事項 */
  deleteItem: (accountId: string, factId: string) =>
    api.delete<{ fact_id: string; status: string }>(`/api/care-items/${accountId}/${factId}`),

  /** 更新追蹤狀態 */
  updateTrack: (accountId: string, factId: string, track: boolean) =>
    api.put<{ fact_id: string; track: boolean; updated_at: string }>(
      `/api/care-items/${accountId}/${factId}/track`, { track }
    ),
};
