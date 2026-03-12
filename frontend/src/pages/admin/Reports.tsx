import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import client from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Bill, Branch } from '../../types';

interface Summary {
  totalRevenue: number;
  totalBills: number;
  items: { itemId: string; name: string; sku: string; qty: number; revenue: number }[];
}

export default function Reports() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const [filters, setFilters] = useState({ branchId: '', startDate: today, endDate: today });

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      client.get('/branches').then((r) => setBranches(r.data)).catch(() => {});
    }
    loadReport();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/reports/sales', {
        params: {
          ...(filters.branchId && { branchId: filters.branchId }),
          ...(filters.startDate && { startDate: filters.startDate }),
          ...(filters.endDate && { endDate: filters.endDate }),
        },
      });
      setBills(data.bills);
      setSummary(data.summary);
    } catch {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await client.get('/reports/download', {
        params: {
          ...(filters.branchId && { branchId: filters.branchId }),
          ...(filters.startDate && { startDate: filters.startDate }),
          ...(filters.endDate && { endDate: filters.endDate }),
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-report-${filters.startDate}-${filters.endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-800">Sales Report</h1>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} className="input" />
          </div>
          {user?.role === 'SUPER_ADMIN' && (
            <div>
              <label className="label">Branch</label>
              <select value={filters.branchId} onChange={(e) => setFilters((f) => ({ ...f, branchId: e.target.value }))} className="input">
                <option value="">All Branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={loadReport} className="btn-primary flex items-center gap-1">
            <RefreshCw size={15} /> Generate
          </button>
          <button onClick={handleDownload} disabled={downloading || bills.length === 0} className="btn-success flex items-center gap-1">
            <Download size={15} /> {downloading ? 'Downloading…' : 'Download Excel'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Revenue', value: `฿${fmt(summary.totalRevenue)}` },
            { label: 'Total Bills', value: summary.totalBills },
            { label: 'Unique Items', value: summary.items.length },
          ].map((s) => (
            <div key={s.label} className="card text-center py-3">
              <p className="text-2xl font-bold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Item Summary */}
      {summary && summary.items.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">Item Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">SKU</th>
                  <th className="table-header">Item Name</th>
                  <th className="table-header text-right">Qty Sold</th>
                  <th className="table-header text-right">Revenue</th>
                  <th className="table-header text-right">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.items.map((item, i) => (
                  <tr key={item.itemId} className="hover:bg-gray-50">
                    <td className="table-cell text-gray-400">{i + 1}</td>
                    <td className="table-cell font-mono text-xs">{item.sku}</td>
                    <td className="table-cell font-medium">{item.name}</td>
                    <td className="table-cell text-right">{item.qty}</td>
                    <td className="table-cell text-right font-medium text-blue-600">฿{fmt(item.revenue)}</td>
                    <td className="table-cell text-right text-gray-500">
                      {summary.totalRevenue > 0 ? ((item.revenue / summary.totalRevenue) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bills table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b">
          <h2 className="font-semibold text-gray-700">Bills ({bills.length})</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : bills.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No submitted bills in this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Bill Number</th>
                  <th className="table-header">Branch</th>
                  <th className="table-header">Cashier</th>
                  <th className="table-header">Date</th>
                  <th className="table-header text-right">Items</th>
                  <th className="table-header text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50">
                    <td className="table-cell font-mono text-xs font-medium">{bill.billNumber}</td>
                    <td className="table-cell">{bill.branch.name}</td>
                    <td className="table-cell text-gray-500">{bill.user.name}</td>
                    <td className="table-cell text-gray-500 text-xs">{format(new Date(bill.createdAt), 'dd/MM/yyyy HH:mm')}</td>
                    <td className="table-cell text-right">{bill.items.length}</td>
                    <td className="table-cell text-right font-medium text-blue-600">฿{fmt(Number(bill.total))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2">
                <tr className="bg-blue-50">
                  <td colSpan={5} className="table-cell font-bold text-right">Total Revenue</td>
                  <td className="table-cell text-right font-bold text-blue-700">฿{fmt(summary?.totalRevenue || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
