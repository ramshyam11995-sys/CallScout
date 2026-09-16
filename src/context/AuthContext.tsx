import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { UserProfile } from '../types.js';
import { apiLogin, apiRegister, apiGetMe } from '../lib/api.js';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  getToken: () => Promise<string | null>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_TOKEN_KEY = 'callscout_auth_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Restore authenticated session on initial mount
  useEffect(() => {
    async function restoreSession() {
      const savedToken = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
      if (savedToken) {
        try {
          const res = await apiGetMe(savedToken);
          if (res && res.user) {
            setUser(res.user);
            setToken(savedToken);
          } else {
            localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
            setUser(null);
            setToken(null);
          }
        } catch (err) {
          console.warn('[auth] Stored token expired or invalid:', err);
          localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
          setUser(null);
          setToken(null);
        }
      }
      setLoading(false);
    }

    restoreSession();
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    return token || localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
  }, [token]);

  const signInWithEmail = async (email: string, pass: string) => {
    const res = await apiLogin({ email, password: pass });
    if (res && res.token && res.user) {
      localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, res.token);
      setToken(res.token);
      setUser(res.user);
    }
  };

  const registerWithEmail = async (email: string, pass: string, name?: string) => {
    const res = await apiRegister({ email, password: pass, name });
    if (res && res.token && res.user) {
      localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, res.token);
      setToken(res.token);
      setUser(res.user);
    }
  };

  const logout = async () => {
    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      getToken,
      signInWithEmail,
      registerWithEmail,
      logout
    }),
    [user, loading, getToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
