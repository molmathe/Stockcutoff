import React, { useState } from 'react';
import pkg from '../../package.json';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ShoppingCart, FileText, LayoutDashboard, Package,
  Building2, Users, BarChart3, LogOut, Menu, X, Tag,
  FileSpreadsheet, FileUp, FileWarning, ClipboardList, GitMerge, ShieldBan, Database, CalendarDays
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isAdmin = user?.role !== 'CASHIER';

  const nav = [
    ...(isAdmin ? [{ to: '/admin/dashboard', icon: <LayoutDashboard size={18} />, label: 'แดชบอร์ด' }] : []),
    { to: '/pos', icon: <ShoppingCart size={18} />, label: 'หน้าขาย (POS)' },
    { to: '/bills', icon: <FileText size={18} />, label: 'รายการบิล' },
    ...(isAdmin ? [
      { to: '/admin/items', icon: <Package size={18} />, label: 'จัดการสินค้า' },
      ...(user?.role === 'SUPER_ADMIN' ? [
        { to: '/admin/blocked-barcodes', icon: <ShieldBan size={16} />, label: 'บาร์โค้ดต้องห้าม', indent: true },
      ] : []),
      { to: '/admin/categories', icon: <Tag size={18} />, label: 'จัดการหมวดหมู่' },
      { to: '/admin/branches', icon: <Building2 size={18} />, label: 'จัดการสาขา' },
      { to: '/admin/branch-kpi', icon: <BarChart3 size={16} />, label: 'KPI สาขา', indent: true },
      { to: '/admin/users', icon: <Users size={18} />, label: 'จัดการผู้ใช้' },
      { to: '/admin/reports', icon: <BarChart3 size={18} />, label: 'รายงานยอดขาย' },
      { to: '/admin/calendar', icon: <CalendarDays size={18} />, label: 'ปฏิทินการส่งยอด' },
      ...(user?.role === 'SUPER_ADMIN' ? [
        { to: '/admin/import-sales',   icon: <FileUp size={18} />,      label: 'นำเข้าข้อมูลการขาย',         indent: false },
        { to: '/admin/dept-reconcile', icon: <GitMerge size={16} />,    label: 'คัดแยกยอดขายหน้าร้าน',       indent: true  },
        { to: '/admin/unresolved-sales', icon: <FileWarning size={18} />, label: 'ยอดขายตกหล่น' },
        { to: '/admin/audit-logs',     icon: <ClipboardList size={18} />, label: 'ประวัติการใช้งาน' },
        { to: '/admin/database',       icon: <Database size={18} />,      label: 'จัดการฐานข้อมูล' },
      ] : []),
    ] : []),
  ];

  const handleLogout = () => { logout(); navigate(user?.posMode ? '/pos-login' : '/login'); };

  const roleLabel = () => {
    if (user?.branch?.name) return user.branch.name;
    if (user?.role === 'SUPER_ADMIN') return 'ผู้ดูแลระบบสูงสุด';
    if (user?.role === 'BRANCH_ADMIN') return 'ผู้จัดการสาขา';
    return 'แคชเชียร์';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Sidebar — clean white theme */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'} md:static md:translate-x-0`}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 h-14 px-4 border-b border-gray-200 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-xs font-bold text-white">SC</div>
          <div className="leading-tight">
            <p className="font-bold text-sm text-gray-900">Fonney StockCutoff</p>
            <p className="text-[10px] text-gray-400">POS &amp; Inventory</p>
            <p className="text-[9px] text-gray-300">v{pkg.version}</p>
          </div>
          <button className="ml-auto md:hidden text-gray-400 hover:text-gray-700" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* User info */}
        <div className="px-3 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5 bg-gray-50 rounded-lg p-2">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name}</p>
              <p className="text-xs text-blue-600 truncate">{roleLabel()}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg text-sm transition-all mb-0.5 ${
                  (item as any).indent ? 'ml-3 px-3 py-2 text-xs' : 'px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold border-l-[3px] border-blue-600 pl-[10px]'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-200 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0">
          <button className="md:hidden text-gray-500 hover:text-gray-700" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            {user?.posMode ? (
              <span className="text-sm font-semibold text-blue-700">🏪 โหมด POS — {user.branch?.name}</span>
            ) : (
              <span className="text-sm text-gray-500 hidden md:block">{user?.name} · {roleLabel()}</span>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
