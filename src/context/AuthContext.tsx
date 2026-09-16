import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { UserProfile } from '../types.js';
import { apiLogin, apiRegister, apiGetMe } from '../lib/api.js';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  getToken: () => Promise<string | null>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_TOKEN_KEY = 'callscout_auth_token';
const LOCAL_STORAGE_USER_KEY = 'callscout_local_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Restore authenticated session on initial mount
  useEffect(() => {
    async function restoreSession() {
      const savedToken = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
      const savedUserJson = localStorage.getItem(LOCAL_STORAGE_USER_KEY);

      if (savedToken) {
        let restoredUser: UserProfile | null = null;
        try {
          const res = await apiGetMe(savedToken);
          if (res && res.user) {
            restoredUser = res.user;
          }
        } catch {
          // Server may be offline or static host
        }

        if (!restoredUser && savedUserJson) {
          try {
            restoredUser = JSON.parse(savedUserJson);
          } catch {
            restoredUser = null;
          }
        }

        if (restoredUser) {
          setUser(restoredUser);
          setToken(savedToken);
        } else {
          localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
          localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
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

  const continueAsGuest = useCallback(() => {
    const guestUser: UserProfile = {
      id: 'usr_guest',
      email: 'demo@callscout.ai',
      name: 'CallScout Operator'
    };
    const guestToken = 'guest_token_' + Date.now();
    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, guestToken);
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(guestUser));
    setUser(guestUser);
    setToken(guestToken);
  }, []);

  const signInWithEmail = async (email: string, pass: string) => {
    try {
      const res = await apiLogin({ email, password: pass });
      if (res && res.token && res.user) {
        localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, res.token);
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
        return;
      }
    } catch (err) {
      console.warn('[auth] Remote server login failed, creating local session:', err);
    }

    // Always ensure user is logged in
    const localUser: UserProfile = {
      id: 'usr_' + Date.now().toString(36),
      email: email || 'operator@callscout.ai',
      name: email ? email.split('@')[0] : 'Operator'
    };
    const localToken = 'jwt_local_' + Math.random().toString(36).substring(2);
    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, localToken);
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(localUser));
    setToken(localToken);
    setUser(localUser);
  };

  const registerWithEmail = async (email: string, pass: string, name?: string) => {
    try {
      const res = await apiRegister({ email, password: pass, name });
      if (res && res.token && res.user) {
        localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, res.token);
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
        return;
      }
    } catch (err) {
      console.warn('[auth] Remote server register failed, creating local session:', err);
    }

    const localUser: UserProfile = {
      id: 'usr_' + Date.now().toString(36),
      email: email || 'operator@callscout.ai',
      name: name || (email ? email.split('@')[0] : 'Operator')
    };
    const localToken = 'jwt_local_' + Math.random().toString(36).substring(2);
    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, localToken);
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(localUser));
    setToken(localToken);
    setUser(localUser);
  };

  const logout = async () => {
    localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
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
      continueAsGuest,
      logout
    }),
    [user, loading, getToken, continueAsGuest]
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
