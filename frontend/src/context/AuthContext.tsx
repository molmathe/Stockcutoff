import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';
import type { User, Branch } from '../types';

interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'CASHIER';
  branchId: string | null;
  branch: Branch | null;
}

interface AuthCtx {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      client.get('/auth/me')
        .then((r) => setUser(r.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const r = await client.post('/auth/login', { username, password });
    localStorage.setItem('token', r.data.token);
    setUser(r.data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout, loading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
};
