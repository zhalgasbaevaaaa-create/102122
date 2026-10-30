import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, tokenStore, ApiError } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  role: 'student' | 'teacher' | 'admin';
  group: string | null;
  school: string | null;
  xp: number;
  totalScore: number;
  correct: number;
  wrong: number;
  streakBest: number;
  playSeconds: number;
  sessions: number;
  createdAt: string;
  lastActivity: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; group?: string; school?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: User | null }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/api/auth/login', { method: 'POST', json: { email, password } });
    tokenStore.set(res.token);
    setUser(res.user);
  };

  const register = async (data: { name: string; email: string; password: string; group?: string; school?: string }) => {
    const res = await api<{ token: string; user: User }>('/api/auth/register', { method: 'POST', json: data });
    tokenStore.set(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
    tokenStore.clear();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
