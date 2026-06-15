import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, saveToken, clearToken, getToken } from './api';

type User = { id: string; email: string; name: string; role: string; credits?: number } | null;

type AuthCtx = {
  user: User;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (!t) { setLoading(false); return; }
      try { setUser((await api.me()) as User); }
      catch { await clearToken(); }
      finally { setLoading(false); }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r: any = await api.login({ email, password });
    await saveToken(r.access_token); setUser(r.user);
  };
  const register = async (email: string, password: string, name: string) => {
    const r: any = await api.register({ email, password, name });
    await saveToken(r.access_token); setUser(r.user);
  };
  const logout = async () => { await clearToken(); setUser(null); };
  const refresh = async () => { try { setUser((await api.me()) as User); } catch {} };

  return <Ctx.Provider value={{ user, loading, login, register, logout, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be inside AuthProvider');
  return c;
};
