import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { TrendingUp, ShoppingBag, Users, Package } from 'lucide-react';
import client from '../../api/client';

interface DashboardData {
  todayRevenue: number;
  todayBills: number;
  todayItemsSold: number;
  revenueByDay: { date: string; revenue: number; bills: number }[];
  topItems: { name: string; sku: string; qty: number; revenue: number }[];
  branchSales: { branch: string; revenue: number; bills: number }[];
}

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/reports/dashboard')
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading dashboard…</div>;
  if (!data) return <div className="p-8 text-center text-red-400">Failed to load dashboard</div>;

  const stats = [
    { label: "Today's Revenue", value: `฿${fmt(data.todayRevenue)}`, icon: <TrendingUp size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
    { label: "Today's Bills", value: data.todayBills, icon: <ShoppingBag size={20} className="text-green-600" />, bg: 'bg-green-50' },
    { label: 'Items Sold Today', value: data.todayItemsSold, icon: <Package size={20} className="text-orange-600" />, bg: 'bg-orange-50' },
    { label: 'Top Item', value: data.topItems[0]?.name || 'N/A', icon: <Users size={20} className="text-purple-600" />, bg: 'bg-purple-50' },
  ];

  const chartData = data.revenueByDay.map((d) => ({
    ...d,
    date: new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-800">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>{s.icon}</div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-lg font-bold text-gray-800 truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Revenue trend */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">Revenue (Last 7 Days)</h2>
          {chartData.every((d) => d.revenue === 0) ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No submitted bills in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => [`฿${fmt(v)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top items */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">Top Items (Last 7 Days)</h2>
          {data.topItems.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.topItems.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(v: any) => [`฿${fmt(v)}`, 'Revenue']} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {data.topItems.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Branch comparison */}
      {data.branchSales.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4">Branch Revenue (Last 7 Days)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.branchSales} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="branch" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => [`฿${fmt(v)}`, 'Revenue']} />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {data.branchSales.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top items table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b">
          <h2 className="font-semibold text-gray-700">Top Items Detail</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">#</th>
                <th className="table-header">Item</th>
                <th className="table-header">SKU</th>
                <th className="table-header text-right">Qty Sold</th>
                <th className="table-header text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.topItems.slice(0, 10).map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="table-cell text-gray-400 font-medium">{i + 1}</td>
                  <td className="table-cell font-medium">{item.name}</td>
                  <td className="table-cell text-gray-400">{item.sku}</td>
                  <td className="table-cell text-right">{item.qty}</td>
                  <td className="table-cell text-right font-medium text-blue-600">฿{fmt(item.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.topItems.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">No sales data</div>
          )}
        </div>
      </div>
    </div>
  );
}
