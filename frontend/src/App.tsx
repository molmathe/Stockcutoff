import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import POS from './pages/POS';
import Bills from './pages/Bills';
import Dashboard from './pages/admin/Dashboard';
import Items from './pages/admin/Items';
import Branches from './pages/admin/Branches';
import Users from './pages/admin/Users';
import Reports from './pages/admin/Reports';

const Guard: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-gray-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const Root = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'CASHIER' ? '/pos' : '/admin/dashboard'} replace />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={<Root />} />
        <Route path="pos" element={<Guard><POS /></Guard>} />
        <Route path="bills" element={<Guard><Bills /></Guard>} />
        <Route path="admin/dashboard" element={<Guard roles={['SUPER_ADMIN','BRANCH_ADMIN']}><Dashboard /></Guard>} />
        <Route path="admin/items" element={<Guard roles={['SUPER_ADMIN','BRANCH_ADMIN']}><Items /></Guard>} />
        <Route path="admin/branches" element={<Guard roles={['SUPER_ADMIN','BRANCH_ADMIN']}><Branches /></Guard>} />
        <Route path="admin/users" element={<Guard roles={['SUPER_ADMIN','BRANCH_ADMIN']}><Users /></Guard>} />
        <Route path="admin/reports" element={<Guard roles={['SUPER_ADMIN','BRANCH_ADMIN']}><Reports /></Guard>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
