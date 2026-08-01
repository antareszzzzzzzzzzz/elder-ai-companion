import React, { useState, useEffect } from 'react';
import { useMockData } from '../store/MockDataContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit3, Save, Activity, Utensils, Pill, Brain, HeartPulse, User as UserIcon, RefreshCw, Key, Loader2, Plus, Trash2, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { profileApi, healthApi, api, type Fact, followApi } from '../services/api';
import type { MemoryCard } from '../store/MockDataContext';

interface Medication {
  name: string;
  dosage: string;
  timing: string;
}

function categoryToType(category: string): MemoryCard['type'] {
  switch (category) {
    case '飲食': return 'diet';
    case '用藥': return 'medication';
    case '活動': return 'activity';
    case '情緒': return 'mood';
    default: return 'activity';
  }
}

function categoryToTitle(category: string): string {
  switch (category) {
    case '飲食': return '飲食記憶卡';
    case '用藥': return '用藥記憶卡';
    case '活動': return '活動記憶卡';
    case '睡眠': return '睡眠記憶卡';
    case '身體': return '身體記憶卡';
    case '情緒': return '情緒記憶卡';
    default: return '生活記憶卡';
  }
}

function factToMemoryCard(fact: Fact): MemoryCard {
  return {
    id: fact.fact_id,
    type: categoryToType(fact.category),
    title: categoryToTitle(fact.category),
    content: fact.content,
    date: fact.updated_at ? fact.updated_at.split('T')[0] : '',
  };
}

const CHRONIC_OPTIONS = ['高血壓', '糖尿病', '心臟病', '骨質疏鬆', '關節炎', '失智症', '中風', '腎臟病', '其他'];

/** 追蹤請求核准子組件 */
const PendingFollowRequests: React.FC = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => { loadRequests(); }, []);

  const loadRequests = async () => {
    try {
      const data = await followApi.getPendingRequests();
      setRequests(data);
    } catch {}
  };

  const handleApprove = async (followId: string) => {
    setLoadingId(followId);
    try {
      await followApi.approve(followId);
      setRequests(prev => prev.filter(r => r.follow_id !== followId));
    } catch (err) { console.error(err); }
    finally { setLoadingId(null); }
  };

  const handleReject = async (followId: string) => {
    setLoadingId(followId);
    try {
      await followApi.reject(followId);
      setRequests(prev => prev.filter(r => r.follow_id !== followId));
    } catch (err) { console.error(err); }
    finally { setLoadingId(null); }
  };

  if (requests.length === 0) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
      className="bg-white rounded-3xl p-8 shadow-sm border border-orange-100">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3 mb-4">
        <UserIcon className="w-7 h-7 text-orange-500" /> 追蹤請求
      </h2>
      <p className="text-slate-500 mb-4">以下家人想追蹤您的健康狀況，請確認是否允許。</p>
      <div className="space-y-3">
        {requests.map(req => (
          <div key={req.follow_id} className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-200">
            <div>
              <p className="font-bold text-slate-800">{req.display_name || '未知'}</p>
              <p className="text-sm text-slate-500">@{req.account_handle || '—'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleApprove(req.follow_id)} disabled={loadingId === req.follow_id}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg font-bold text-sm">
                核准
              </button>
              <button onClick={() => handleReject(req.follow_id)} disabled={loadingId === req.follow_id}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">
                拒絕
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
};

/** 我的追蹤者管理子組件 */
const MyFollowers: React.FC = () => {
  const [followers, setFollowers] = useState<any[]>([]);
  const [removeLoadingId, setRemoveLoadingId] = useState<string | null>(null);

  useEffect(() => { loadFollowers(); }, []);

  const loadFollowers = async () => {
    try {
      const data = await followApi.getMyFollowers();
      setFollowers(data);
    } catch {}
  };

  const handleRemove = async (followId: string) => {
    if (!confirm('確定要移除此追蹤者嗎？對方將無法再查看您的健康狀況。')) return;
    setRemoveLoadingId(followId);
    try {
      await followApi.remove(followId);
      setFollowers(prev => prev.filter(f => f.follow_id !== followId));
    } catch (err) { console.error(err); }
    finally { setRemoveLoadingId(null); }
  };

  if (followers.length === 0) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
      className="bg-white rounded-3xl p-8 shadow-sm border border-teal-100">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3 mb-4">
        <UserIcon className="w-7 h-7 text-teal-500" /> 我的追蹤者
      </h2>
      <p className="text-slate-500 mb-4">以下家人正在追蹤您的健康狀況。</p>
      <div className="space-y-3">
        {followers.map(f => (
          <div key={f.follow_id} className="flex items-center justify-between p-4 bg-teal-50 rounded-xl border border-teal-200">
            <div>
              <p className="font-bold text-slate-800">{f.display_name || '未知'}</p>
              <p className="text-sm text-slate-500">@{f.account_handle || '—'}</p>
            </div>
            <button onClick={() => handleRemove(f.follow_id)} disabled={removeLoadingId === f.follow_id}
              className="flex items-center gap-1 px-4 py-2 bg-red-50 hover:bg-red-100 disabled:bg-red-50/50 text-red-500 hover:text-red-600 rounded-lg font-bold text-sm border border-red-200 transition-colors">
              <Trash2 className="w-4 h-4" /> 移除
            </button>
          </div>
        ))}
      </div>
    </motion.section>
  );
};

const ElderProfilePage: React.FC = () => {
  const { user } = useMockData();
  const navigate = useNavigate();
  if (!user) return null;

  // 基本資料
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.name);
  const [accountHandle, setAccountHandle] = useState(user.username);
  const [birth, setBirth] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  // 健康資料
  const [chronicConditions, setChronicConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [allergies, setAllergies] = useState('');

  // 綁定碼
  const [bindingCode, setBindingCode] = useState('------');
  const [savingCode, setSavingCode] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [showCustomCodeInput, setShowCustomCodeInput] = useState(false);

  // 個人備註（顯示在記憶卡區）
  const [personalNotes, setPersonalNotes] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // 記憶卡片
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadFromApi(); }, []);

  const loadFromApi = async () => {
    setLoading(true);
    try {
      const pData = await profileApi.get();
      setDisplayName(pData.display_name || user.name);
      setAccountHandle(pData.account_handle || user.username);
      if ((pData as any).birth) setBirth((pData as any).birth);
      if ((pData as any).height) setHeight((pData as any).height);
      if ((pData as any).weight) setWeight((pData as any).weight);
      if ((pData as any).personal_notes) setPersonalNotes((pData as any).personal_notes);
      if ((pData as any).binding_code) {
        setBindingCode((pData as any).binding_code);
      } else {
        const codeData = await api.get<{ binding_code: string }>('/api/profile/binding-code');
        setBindingCode(codeData.binding_code);
      }
      // 解析健康資料
      try {
        const cc = JSON.parse(pData.chronic_conditions || '[]');
        if (Array.isArray(cc)) setChronicConditions(cc);
      } catch {}
      try {
        const meds = JSON.parse(pData.current_medications || '[]');
        if (Array.isArray(meds)) setMedications(meds);
      } catch {}
      if ((pData as any).allergies) {
        try {
          const al = JSON.parse((pData as any).allergies);
          setAllergies(Array.isArray(al) ? al.join('、') : (pData as any).allergies);
        } catch { setAllergies((pData as any).allergies); }
      }
      // 載入記憶卡片
      const overview = await healthApi.getOverview(pData.account_id);
      const allFacts = [
        ...(overview.medication_facts || []),
        ...(overview.body_facts || []),
        ...(overview.diet_facts || []),
        ...(overview.mood_facts || []),
        ...(overview.other_facts || []),
      ];
      if (allFacts.length > 0) setMemoryCards(allFacts.map(factToMemoryCard));
    } catch (err) {
      console.warn('API unavailable:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await profileApi.update({
        display_name: displayName,
        birth, height, weight,
        chronic_conditions: JSON.stringify(chronicConditions),
        current_medications: JSON.stringify(medications),
        allergies: JSON.stringify(allergies.split('、').filter(Boolean)),
      } as any);
    } catch {}
    setIsEditing(false);
  };

  const handleRegenerateCode = async () => {
    setSavingCode(true);
    try {
      const data = await api.put<any>('/api/profile/binding-code', {});
      setBindingCode(data.binding_code || bindingCode);
    } catch (err) { console.error(err); }
    finally { setSavingCode(false); }
  };

  const handleSetCustomCode = async () => {
    if (customCode.length !== 6 || !/^\d{6}$/.test(customCode)) { alert('綁定碼必須為 6 位數字'); return; }
    setSavingCode(true);
    try {
      const data = await api.put<any>('/api/profile/binding-code', { code: customCode });
      setBindingCode(data.binding_code || customCode);
      setShowCustomCodeInput(false); setCustomCode('');
    } catch (err: any) { alert(err.message || '設定失敗'); }
    finally { setSavingCode(false); }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try { await api.put('/api/profile/notes', { personal_notes: personalNotes }); }
    catch (err) { console.error(err); }
    finally { setSavingNotes(false); setEditingNotes(false); }
  };

  const toggleChronic = (c: string) => {
    setChronicConditions(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };
  const addMedication = () => setMedications(prev => [...prev, { name: '', dosage: '', timing: '' }]);
  const updateMedication = (i: number, field: keyof Medication, value: string) => {
    setMedications(prev => { const m = [...prev]; m[i] = { ...m[i], [field]: value }; return m; });
  };
  const removeMedication = (i: number) => setMedications(prev => prev.filter((_, idx) => idx !== i));

  const getIconForType = (type: string) => {
    switch (type) {
      case 'diet': return <Utensils className="w-6 h-6 text-amber-500" />;
      case 'medication': return <Pill className="w-6 h-6 text-rose-500" />;
      case 'activity': return <Activity className="w-6 h-6 text-emerald-500" />;
      case 'mood': return <Brain className="w-6 h-6 text-indigo-500" />;
      default: return <HeartPulse className="w-6 h-6 text-teal-500" />;
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

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-600 hover:text-emerald-600 font-semibold transition-colors">
            <ArrowLeft className="w-6 h-6" /> 返回首頁
          </button>
          <h1 className="text-2xl font-bold text-slate-800">個人資料設定</h1>
          <div className="w-24"></div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* ===== 基本資料 ===== */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <UserIcon className="w-7 h-7 text-emerald-500" /> 基本資料
            </h2>
            {isEditing ? (
              <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all shadow-md">
                <Save className="w-5 h-5" /> 儲存修改
              </button>
            ) : (
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all">
                <Edit3 className="w-5 h-5" /> 編輯資料
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xl">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">帳號代碼 (不可更改)</label>
              <input type="text" value={accountHandle} disabled className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-500" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">顯示名稱</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} disabled={!isEditing} className={`w-full border rounded-xl px-4 py-3 text-slate-800 transition-all ${isEditing ? 'border-emerald-400 bg-white focus:ring-4 focus:ring-emerald-100 outline-none' : 'border-slate-200 bg-slate-50'}`} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">出生年月日</label>
              <input type="date" value={birth} onChange={e => setBirth(e.target.value)} disabled={!isEditing} className={`w-full border rounded-xl px-4 py-3 text-slate-800 transition-all ${isEditing ? 'border-emerald-400 bg-white focus:ring-4 focus:ring-emerald-100 outline-none' : 'border-slate-200 bg-slate-50'}`} />
            </div>
            <div className="flex gap-4">
              <div className="space-y-2 flex-1">
                <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">身高 (cm)</label>
                <input type="number" value={height} onChange={e => setHeight(e.target.value)} disabled={!isEditing} className={`w-full border rounded-xl px-4 py-3 text-slate-800 transition-all ${isEditing ? 'border-emerald-400 bg-white focus:ring-4 focus:ring-emerald-100 outline-none' : 'border-slate-200 bg-slate-50'}`} />
              </div>
              <div className="space-y-2 flex-1">
                <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">體重 (kg)</label>
                <input type="number" value={weight} onChange={e => setWeight(e.target.value)} disabled={!isEditing} className={`w-full border rounded-xl px-4 py-3 text-slate-800 transition-all ${isEditing ? 'border-emerald-400 bg-white focus:ring-4 focus:ring-emerald-100 outline-none' : 'border-slate-200 bg-slate-50'}`} />
              </div>
            </div>

            {/* 慢性病 */}
            <div className="space-y-2 col-span-1 md:col-span-2 mt-4 pt-4 border-t border-slate-100">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">慢性病</label>
              {isEditing ? (
                <div className="flex flex-wrap gap-2">
                  {CHRONIC_OPTIONS.map(c => (
                    <button key={c} type="button" onClick={() => toggleChronic(c)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${chronicConditions.includes(c) ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'}`}
                    >{c}</button>
                  ))}
                </div>
              ) : (
                <p className="text-lg text-slate-700">{chronicConditions.length > 0 ? chronicConditions.join('、') : '未填寫'}</p>
              )}
            </div>

            {/* 用藥 */}
            <div className="space-y-3 col-span-1 md:col-span-2 mt-4 pt-4 border-t border-slate-100">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Pill className="w-4 h-4 text-rose-500" /> 目前用藥
              </label>
              {isEditing ? (
                <div className="space-y-3">
                  {medications.map((med, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input placeholder="藥名" value={med.name} onChange={e => updateMedication(i, 'name', e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:border-emerald-400" />
                        <input placeholder="劑量（如 5mg / 1顆）" value={med.dosage} onChange={e => updateMedication(i, 'dosage', e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:border-emerald-400" />
                        <input placeholder="服用時間（如 早上飯後）" value={med.timing} onChange={e => updateMedication(i, 'timing', e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:border-emerald-400" />
                      </div>
                      <button onClick={() => removeMedication(i)} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                        <Trash2 className="w-3 h-3" /> 移除此藥物
                      </button>
                    </div>
                  ))}
                  <button onClick={addMedication} className="text-sm text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1">
                    <Plus className="w-4 h-4" /> 新增藥物
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {medications.length > 0 ? medications.map((med, i) => (
                    <p key={i} className="text-lg text-slate-700">{med.name} {med.dosage} — {med.timing}</p>
                  )) : <p className="text-lg text-slate-400">未填寫</p>}
                </div>
              )}
            </div>

            {/* 過敏 */}
            <div className="space-y-2 col-span-1 md:col-span-2 mt-4 pt-4 border-t border-slate-100">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">過敏</label>
              {isEditing ? (
                <input type="text" value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="例如：海鮮、盤尼西林（多項用頓號分隔）"
                  className="w-full border border-emerald-400 rounded-xl px-4 py-3 text-slate-800 bg-white focus:ring-4 focus:ring-emerald-100 outline-none" />
              ) : (
                <p className="text-lg text-slate-700">{allergies || '未填寫'}</p>
              )}
            </div>

            {/* 綁定授權碼 */}
            <div className="space-y-2 col-span-1 md:col-span-2 mt-4 pt-4 border-t border-slate-100">
              <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500" /> 家人綁定授權碼
              </label>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-amber-50 border-2 border-amber-200 rounded-xl px-4 py-4 text-center">
                  <span className="text-3xl font-mono font-bold tracking-widest text-amber-600">{bindingCode}</span>
                </div>
                <button onClick={handleRegenerateCode} disabled={savingCode}
                  className="p-4 bg-white border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-600 text-slate-500 rounded-xl transition-all shadow-sm disabled:opacity-50"
                  title="隨機產生新的綁定碼">
                  <RefreshCw className={`w-6 h-6 ${savingCode ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {showCustomCodeInput ? (
                <div className="flex items-center gap-2 mt-3">
                  <input type="text" value={customCode} onChange={e => setCustomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="輸入 6 位數字" className="flex-1 border-2 border-amber-300 rounded-xl px-4 py-2 font-mono text-lg text-center focus:outline-none focus:ring-2 focus:ring-amber-200" maxLength={6} />
                  <button onClick={handleSetCustomCode} disabled={savingCode} className="px-4 py-2 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 disabled:opacity-50">確認</button>
                  <button onClick={() => { setShowCustomCodeInput(false); setCustomCode(''); }} className="px-4 py-2 bg-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-300">取消</button>
                </div>
              ) : (
                <button onClick={() => setShowCustomCodeInput(true)} className="text-sm text-amber-600 hover:text-amber-700 font-medium mt-2">想自己設定綁定碼？</button>
              )}
              <p className="text-sm text-slate-400 mt-2">請將此授權碼提供給您的家人，讓他們可以在照護者介面綁定您的帳號。</p>
            </div>
          </div>
        </motion.section>

        {/* ===== 追蹤請求核准 ===== */}
        <PendingFollowRequests />

        {/* ===== 我的追蹤者管理 ===== */}
        <MyFollowers />

        {/* ===== 記憶卡片 ===== */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              <Brain className="w-7 h-7 text-emerald-500" /> 專屬記憶卡片
            </h2>
            <p className="text-slate-500 mt-2">根據您平常與小安的互動，AI 為您整理的重點摘要。</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <span className="ml-3 text-slate-500">載入中...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* 手動填寫的個人備註卡片 */}
              {personalNotes.trim() && !editingNotes && (
                <motion.div whileHover={{ y: -4, scale: 1.01 }}
                  className="p-6 rounded-2xl border-2 bg-sky-50 border-sky-200 shadow-sm relative overflow-hidden cursor-pointer"
                  onClick={() => setEditingNotes(true)}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/60 rounded-xl backdrop-blur-sm shadow-sm">
                        <FileText className="w-6 h-6 text-sky-500" />
                      </div>
                      <h3 className="font-bold text-xl text-slate-800">我的備註</h3>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 bg-sky-100 rounded-full text-sky-600">手動填寫</span>
                  </div>
                  <p className="text-lg text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{personalNotes}</p>
                </motion.div>
              )}

              {/* 備註編輯模式 or 空白時的新增入口 */}
              {(editingNotes || !personalNotes.trim()) && (
                <div className="p-6 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-sky-500" />
                    <h3 className="font-bold text-slate-700">我的備註</h3>
                    <span className="text-xs bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full">手動填寫・小安會參考</span>
                  </div>
                  <textarea value={personalNotes} onChange={e => setPersonalNotes(e.target.value)} rows={3}
                    placeholder="寫下想讓小安知道的事，例如：我對海鮮過敏、每週三要去復健..."
                    className="w-full border border-sky-300 rounded-xl px-3 py-2 text-base focus:outline-none focus:border-sky-500 resize-none" />
                  <div className="flex justify-end gap-2 mt-2">
                    {editingNotes && <button onClick={() => setEditingNotes(false)} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">取消</button>}
                    <button onClick={handleSaveNotes} disabled={savingNotes}
                      className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white text-sm rounded-lg font-bold flex items-center gap-1">
                      <Save className="w-4 h-4" />{savingNotes ? '儲存中...' : '儲存'}
                    </button>
                  </div>
                </div>
              )}

              {/* AI 自動記憶卡 */}
              {memoryCards.map((card) => (
                <motion.div whileHover={{ y: -4, scale: 1.01 }} key={card.id}
                  className={`p-6 rounded-2xl border-2 ${getBgForType(card.type)} shadow-sm relative overflow-hidden`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/60 rounded-xl backdrop-blur-sm shadow-sm">{getIconForType(card.type)}</div>
                      <h3 className="font-bold text-xl text-slate-800">{card.title}</h3>
                    </div>
                    <span className="text-sm font-semibold px-3 py-1 bg-white/60 rounded-full text-slate-600">{card.date}</span>
                  </div>
                  <p className="text-lg text-slate-700 leading-relaxed font-medium">{card.content}</p>
                </motion.div>
              ))}

              {memoryCards.length === 0 && !personalNotes.trim() && (
                <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <Brain className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">目前還沒有記憶卡片，多跟小安聊天就會產生喔！</p>
                </div>
              )}
            </div>
          )}
        </motion.section>
      </main>
    </div>
  );
};

export default ElderProfilePage;
