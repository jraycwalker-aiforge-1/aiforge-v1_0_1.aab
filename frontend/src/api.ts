import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = 'forgeai_token';

export async function saveToken(t: string) {
  await AsyncStorage.setItem(TOKEN_KEY, t);
}
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

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
  register: (body: { email: string; password: string; name: string }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  dashboard: () => request('/dashboard'),
  listAssets: (type?: 'image' | 'video' | 'model') =>
    request(`/assets${type ? `?asset_type=${type}` : ''}`),
  getAsset: (id: string) => request(`/assets/${id}`),
  deleteAsset: (id: string) => request(`/assets/${id}`, { method: 'DELETE' }),
  generateImage: (prompt: string) =>
    request('/generate/image', { method: 'POST', body: JSON.stringify({ prompt }) }),
  generateVideo: (body: { prompt: string; duration: number; size: string }) =>
    request('/generate/video', { method: 'POST', body: JSON.stringify(body) }),
  generateModel: (prompt: string) =>
    request('/generate/model', { method: 'POST', body: JSON.stringify({ prompt }) }),
  updateSlicer: (id: string, settings: any) =>
    request(`/assets/${id}/slicer`, { method: 'PATCH', body: JSON.stringify({ settings }) }),
  gcodePreview: (id: string) => request(`/assets/${id}/gcode-preview`),
};

export const COLORS = {
  bg: '#09090B',
  surface: '#18181B',
  surfaceElevated: '#27272A',
  border: '#27272A',
  text: '#FFFFFF',
  textDim: '#A1A1AA',
  textMuted: '#52525B',
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  accent: '#F97316',
  success: '#10B981',
  danger: '#EF4444',
};
