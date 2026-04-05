import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';
import type { Bill, Branch } from '../types';

interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'CASHIER';
  branchId: string | null;
  branch: Branch | null;
  posMode?: boolean;
}

interface PosLoginPreview {
  user: AuthUser;
  token: string;
  openBills: Bill[];
}

interface AuthCtx {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  posLoginPreview: (pincode: string) => Promise<PosLoginPreview>;
  posLoginCommit: (preview: PosLoginPreview) => void;
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

  // Standard username + password login (admin/cashier accounts)
  const login = async (username: string, password: string) => {
    const r = await client.post('/auth/login', { username, password });
    localStorage.setItem('token', r.data.token);
    setUser(r.data.user);
  };

  // Step 1 — verify PIN and return preview (does NOT set user/token yet)
  const posLoginPreview = async (pincode: string): Promise<PosLoginPreview> => {
    const r = await client.post('/auth/pos-login', { pincode });
    return { user: { ...r.data.user, posMode: true }, token: r.data.token, openBills: r.data.openBills ?? [] };
  };

  // Step 2 — commit after user confirms branch
  const posLoginCommit = ({ user: u, token }: PosLoginPreview) => {
    localStorage.setItem('token', token);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, posLoginPreview, posLoginCommit, logout, loading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
};
