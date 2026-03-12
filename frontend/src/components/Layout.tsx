import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ShoppingCart, FileText, LayoutDashboard, Package,
  Building2, Users, BarChart3, LogOut, Menu, X, ChevronRight,
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isAdmin = user?.role !== 'CASHIER';

  const nav = [
    ...(isAdmin ? [{ to: '/admin/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' }] : []),
    { to: '/pos', icon: <ShoppingCart size={18} />, label: 'POS' },
    { to: '/bills', icon: <FileText size={18} />, label: 'Bills' },
    ...(isAdmin ? [
      { to: '/admin/items', icon: <Package size={18} />, label: 'Items' },
      { to: '/admin/branches', icon: <Building2 size={18} />, label: 'Branches' },
      { to: '/admin/users', icon: <Users size={18} />, label: 'Users' },
      { to: '/admin/reports', icon: <BarChart3 size={18} />, label: 'Reports' },
    ] : []),
  ];

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-gray-900 text-white flex flex-col transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'} md:static md:translate-x-0`}>
        <div className="flex items-center gap-2 h-14 px-4 bg-gray-800 shrink-0">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center text-xs font-bold">SC</div>
          <span className="font-semibold text-sm">StockCutoff</span>
          <button className="ml-auto md:hidden text-gray-400 hover:text-white" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-700 shrink-0">
          <p className="text-xs text-gray-400">Signed in as</p>
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-blue-400">{user?.branch?.name || user?.role.replace('_', ' ')}</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-700 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-red-600 hover:text-white rounded-lg transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0">
          <button className="md:hidden text-gray-500 hover:text-gray-700" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <ChevronRight size={16} className="hidden md:block text-gray-300" />
          <span className="text-sm font-medium text-gray-600">{user?.name}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
