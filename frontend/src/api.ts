import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = 'aiforge_token';

export async function saveToken(t: string) { await AsyncStorage.setItem(TOKEN_KEY, t); }
export async function getToken() { return AsyncStorage.getItem(TOKEN_KEY); }
export async function clearToken() { await AsyncStorage.removeItem(TOKEN_KEY); }

async function request(path: string, opts: RequestInit = {}) {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data as any)?.detail || (data as any)?.message || res.statusText;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  register: (body: any) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  dashboard: () => request('/dashboard'),
  listAssets: (type?: string) => request(`/assets${type ? `?asset_type=${type}` : ''}`),
  getAsset: (id: string) => request(`/assets/${id}`),
  deleteAsset: (id: string) => request(`/assets/${id}`, { method: 'DELETE' }),
  generateImage: (prompt: string) => request('/generate/image', { method: 'POST', body: JSON.stringify({ prompt }) }),
  generateVideo: (body: any) => request('/generate/video', { method: 'POST', body: JSON.stringify(body) }),
  generateModel: (prompt: string) => request('/generate/model', { method: 'POST', body: JSON.stringify({ prompt }) }),
  job: (id: string) => request(`/jobs/${id}`),
  updateSlicer: (id: string, settings: any) => request(`/assets/${id}/slicer`, { method: 'PATCH', body: JSON.stringify({ settings }) }),
  gcodePreview: (id: string) => request(`/assets/${id}/gcode-preview`),
  chat: (message: string, session_id?: string) => request('/chat', { method: 'POST', body: JSON.stringify({ message, session_id }) }),
  packs: () => request('/billing/packs'),
  checkout: (pack: string, origin_url: string) => request('/billing/checkout', { method: 'POST', body: JSON.stringify({ pack, origin_url }) }),
  billingStatus: (session_id: string) => request(`/billing/status/${session_id}`),
  privacy: () => request('/legal/privacy'),
  terms: () => request('/legal/terms'),
  deleteAccount: () => request('/auth/account', { method: 'DELETE' }),
};

// Poll a job until done. Calls onProgress with the job state each tick.
export async function pollJob(jobId: string, onProgress?: (j: any) => void, intervalMs = 4000, maxMs = 15 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const j: any = await api.job(jobId);
    onProgress?.(j);
    if (j.status === 'done') return j;
    if (j.status === 'failed') throw new Error(j.error || 'Job failed');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Job timed out');
}

export const COLORS = {
  bg: '#05050A',
  surface: '#0F0F1A',
  surfaceElevated: '#1A1A2E',
  border: '#1F1F3A',
  borderGlow: '#2563EB',
  text: '#FFFFFF',
  textDim: '#A1A1AA',
  textMuted: '#52525B',
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  accent: '#F97316',
  energy: '#22D3EE',     // cyan electric
  energyAlt: '#A855F7',  // violet electric (used sparingly)
  green: '#22C55E',
  success: '#10B981',
  danger: '#EF4444',
};
