import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { FileText, ChevronDown, ChevronUp, X } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Bill, Branch } from '../types';

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    OPEN: 'badge bg-yellow-100 text-yellow-700',
    SUBMITTED: 'badge bg-green-100 text-green-700',
    CANCELLED: 'badge bg-red-100 text-red-700',
  };
  return map[s] || 'badge bg-gray-100 text-gray-600';
};

export default function Bills() {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const [filters, setFilters] = useState({ startDate: today, endDate: today, status: '', branchId: '' });

  const isAdmin = user?.role !== 'CASHIER';

  useEffect(() => {
    if (isAdmin) client.get('/branches').then((r) => setBranches(r.data)).catch(() => {});
    loadBills();
  }, []);

  const loadBills = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.status) params.status = filters.status;
      if (filters.branchId) params.branchId = filters.branchId;
      const { data } = await client.get('/bills', { params });
      setBills(data);
    } catch {
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  const cancelBill = async (id: string) => {
    if (!confirm('Cancel this bill?')) return;
    try {
      await client.put(`/bills/${id}/cancel`);
      toast.success('Bill cancelled');
      loadBills();
    } catch {
      toast.error('Failed to cancel bill');
    }
  };

  const totalRevenue = bills.filter((b) => b.status === 'SUBMITTED').reduce((s, b) => s + Number(b.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-800">Bills</h1>
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
          <div>
            <label className="label">Status</label>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input">
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {isAdmin && (
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
          <button onClick={loadBills} className="btn-primary">Search</button>
          <button onClick={() => { setFilters({ startDate: today, endDate: today, status: '', branchId: '' }); }} className="btn-secondary">Reset</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Bills', value: bills.length },
          { label: 'Submitted', value: bills.filter((b) => b.status === 'SUBMITTED').length },
          { label: 'Revenue', value: `฿${totalRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` },
        ].map((s) => (
          <div key={s.label} className="card text-center py-3">
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Bills list */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : bills.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No bills found</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {bills.map((bill) => (
              <div key={bill.id}>
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === bill.id ? null : bill.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{bill.billNumber}</span>
                      <span className={statusBadge(bill.status)}>{bill.status}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {bill.branch.name} • {bill.user.name} • {format(new Date(bill.createdAt), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">฿{Number(bill.total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-400">{bill.items.length} items</p>
                  </div>
                  {bill.status === 'OPEN' && (
                    <button onClick={(e) => { e.stopPropagation(); cancelBill(bill.id); }}
                      className="text-red-400 hover:text-red-600 shrink-0" title="Cancel">
                      <X size={16} />
                    </button>
                  )}
                  {expanded === bill.id ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                </div>

                {expanded === bill.id && (
                  <div className="px-4 pb-4 bg-gray-50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b">
                          <th className="text-left py-2">Item</th>
                          <th className="text-right py-2">Qty</th>
                          <th className="text-right py-2">Price</th>
                          <th className="text-right py-2">Disc</th>
                          <th className="text-right py-2">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.items.map((bi) => (
                          <tr key={bi.id} className="border-b border-gray-100">
                            <td className="py-2">
                              <p className="font-medium">{bi.item.name}</p>
                              <p className="text-xs text-gray-400">{bi.item.sku}</p>
                            </td>
                            <td className="text-right py-2">{bi.quantity}</td>
                            <td className="text-right py-2">฿{Number(bi.price).toFixed(2)}</td>
                            <td className="text-right py-2 text-orange-600">{Number(bi.discount) > 0 ? `-฿${Number(bi.discount).toFixed(2)}` : '-'}</td>
                            <td className="text-right py-2 font-medium">฿{Number(bi.subtotal).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} className="text-right py-2 font-medium text-gray-500 pr-2">Subtotal</td>
                          <td className="text-right py-2 font-medium">฿{Number(bill.subtotal).toFixed(2)}</td>
                        </tr>
                        {Number(bill.discount) > 0 && (
                          <tr>
                            <td colSpan={4} className="text-right py-1 text-orange-600 pr-2">Discount</td>
                            <td className="text-right py-1 text-orange-600">-฿{Number(bill.discount).toFixed(2)}</td>
                          </tr>
                        )}
                        <tr className="border-t">
                          <td colSpan={4} className="text-right py-2 font-bold pr-2">Total</td>
                          <td className="text-right py-2 font-bold text-blue-600">฿{Number(bill.total).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {bill.notes && <p className="text-xs text-gray-500 mt-2">Notes: {bill.notes}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
