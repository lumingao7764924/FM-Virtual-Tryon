import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { canEdit, type SessionInfo } from '@tryon/shared';
import { apiFetch } from '@/api';

type AuthContextValue = {
  loading: boolean;
  session: SessionInfo | null;
  canEdit: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  setSession: (session: SessionInfo | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSession(await apiFetch<SessionInfo>('/api/auth/me'));
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST', json: {} }).catch(() => undefined);
    window.google?.accounts.id.disableAutoSelect();
    setSession(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      canEdit: session ? canEdit(session.role) : false,
      isAdmin: session?.role === 'admin',
      refresh,
      setSession,
      logout,
    }),
    [loading, session, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
