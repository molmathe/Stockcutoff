import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import POSLogin from './pages/POSLogin';

const POS = lazy(() => import('./pages/POS'));
const Bills = lazy(() => import('./pages/Bills'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Items = lazy(() => import('./pages/admin/Items'));
const Branches = lazy(() => import('./pages/admin/Branches'));
const Users = lazy(() => import('./pages/admin/Users'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Categories = lazy(() => import('./pages/admin/Categories'));
// Removed ReportTemplates
const SalesManager = lazy(() => import('./pages/admin/SalesManager'));
const UnresolvedSales = lazy(() => import('./pages/admin/UnresolvedSales').then(m => ({ default: m.UnresolvedSales })));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const BlockedBarcodes = lazy(() => import('./pages/admin/BlockedBarcodes'));
const Database = lazy(() => import('./pages/admin/Database'));
const CalendarDashboard = lazy(() => import('./pages/admin/CalendarDashboard'));
const BranchKPI = lazy(() => import('./pages/admin/BranchKPI'));

const Loader = () => (
  <div className="flex h-full items-center justify-center text-gray-400 text-sm">กำลังโหลด...</div>
);

const Guard: React.FC<{ children: React.ReactNode; roles?: string[] }> = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
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
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pos-login" element={<POSLogin />} />
        <Route element={<Guard><Layout /></Guard>}>
          <Route index element={<Root />} />
          <Route path="pos" element={<Guard><POS /></Guard>} />
          <Route path="bills" element={<Guard><Bills /></Guard>} />
          <Route path="admin/dashboard" element={<Guard roles={['SUPER_ADMIN', 'BRANCH_ADMIN']}><Dashboard /></Guard>} />
          <Route path="admin/items" element={<Guard roles={['SUPER_ADMIN', 'BRANCH_ADMIN']}><Items /></Guard>} />
          <Route path="admin/branches" element={<Guard roles={['SUPER_ADMIN', 'BRANCH_ADMIN']}><Branches /></Guard>} />
          <Route path="admin/users" element={<Guard roles={['SUPER_ADMIN', 'BRANCH_ADMIN']}><Users /></Guard>} />
          <Route path="admin/reports" element={<Guard roles={['SUPER_ADMIN', 'BRANCH_ADMIN']}><Reports /></Guard>} />
          <Route path="admin/categories" element={<Guard roles={['SUPER_ADMIN', 'BRANCH_ADMIN']}><Categories /></Guard>} />
{/* Removed ReportTemplates Route */}
          <Route path="admin/import-sales" element={<Guard roles={['SUPER_ADMIN']}><SalesManager initialTab="import" /></Guard>} />
          <Route path="admin/dept-reconcile" element={<Guard roles={['SUPER_ADMIN']}><SalesManager initialTab="reconcile" /></Guard>} />
          <Route path="admin/unresolved-sales" element={<Guard roles={['SUPER_ADMIN']}><UnresolvedSales /></Guard>} />
          <Route path="admin/audit-logs" element={<Guard roles={['SUPER_ADMIN']}><AuditLogs /></Guard>} />
          <Route path="admin/blocked-barcodes" element={<Guard roles={['SUPER_ADMIN']}><BlockedBarcodes /></Guard>} />
          <Route path="admin/database" element={<Guard roles={['SUPER_ADMIN']}><Database /></Guard>} />
          <Route path="admin/calendar" element={<Guard roles={['SUPER_ADMIN', 'BRANCH_ADMIN']}><CalendarDashboard /></Guard>} />
          <Route path="admin/branch-kpi" element={<Guard roles={['SUPER_ADMIN', 'BRANCH_ADMIN']}><BranchKPI /></Guard>} />
        </Route>
      </Routes>
    </Suspense>
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
