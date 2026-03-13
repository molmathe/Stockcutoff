import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const statusLabel: Record<string, string> = {
  OPEN: 'เปิด',
  SUBMITTED: 'ส่งแล้ว',
  CANCELLED: 'ยกเลิก',
};

export default function Bills() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultFilters = { startDate: today, endDate: today, status: '', branchId: '' };
  const [filters, setFilters] = useState(defaultFilters);
  const [searchParams, setSearchParams] = useState(defaultFilters);

  const isAdmin = user?.role !== 'CASHIER';

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => client.get('/branches').then((r) => r.data),
    enabled: isAdmin,
  });

  const { data: bills = [], isLoading: loading } = useQuery<Bill[]>({
    queryKey: ['bills', searchParams],
    queryFn: () => {
      const params: any = {};
      if (searchParams.startDate) params.startDate = searchParams.startDate;
      if (searchParams.endDate) params.endDate = searchParams.endDate;
      if (searchParams.status) params.status = searchParams.status;
      if (searchParams.branchId) params.branchId = searchParams.branchId;
      return client.get('/bills', { params }).then((r) => r.data);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => client.put(`/bills/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }); toast.success('ยกเลิกบิลเรียบร้อย'); },
    onError: () => toast.error('ยกเลิกบิลไม่สำเร็จ'),
  });

  const cancelBill = (id: string) => {
    if (!confirm('ยืนยันการยกเลิกบิลนี้?')) return;
    cancelMutation.mutate(id);
  };

  const totalRevenue = bills.filter((b) => b.status === 'SUBMITTED').reduce((s, b) => s + Number(b.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-800">รายการบิล</h1>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">ตั้งแต่วันที่</label>
            <input type="date" value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">ถึงวันที่</label>
            <input type="date" value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">สถานะ</label>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input">
              <option value="">ทั้งหมด</option>
              <option value="OPEN">เปิด</option>
              <option value="SUBMITTED">ส่งแล้ว</option>
              <option value="CANCELLED">ยกเลิก</option>
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="label">สาขา</label>
              <select value={filters.branchId} onChange={(e) => setFilters((f) => ({ ...f, branchId: e.target.value }))} className="input">
                <option value="">ทุกสาขา</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => setSearchParams({ ...filters })} className="btn-primary">ค้นหา</button>
          <button onClick={() => { setFilters(defaultFilters); setSearchParams(defaultFilters); }} className="btn-secondary">รีเซ็ต</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'บิลทั้งหมด', value: bills.length },
          { label: 'ส่งแล้ว', value: bills.filter((b) => b.status === 'SUBMITTED').length },
          { label: 'รายได้รวม', value: `฿${totalRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` },
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
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : bills.length === 0 ? (
          <div className="p-8 text-center text-gray-400">ไม่พบบิล</div>
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
                      <span className={statusBadge(bill.status)}>{statusLabel[bill.status] || bill.status}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {bill.branch.name} • {bill.user.name} • {format(new Date(bill.createdAt), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">฿{Number(bill.total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-400">{bill.items.length} รายการ</p>
                  </div>
                  {bill.status === 'OPEN' && (
                    <button onClick={(e) => { e.stopPropagation(); cancelBill(bill.id); }}
                      className="text-red-400 hover:text-red-600 shrink-0" title="ยกเลิกบิล">
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
                          <th className="text-left py-2">สินค้า</th>
                          <th className="text-right py-2">จำนวน</th>
                          <th className="text-right py-2">ราคา</th>
                          <th className="text-right py-2">ส่วนลด</th>
                          <th className="text-right py-2">รวม</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.items.map((bi) => (
                          <tr key={bi.id} className="border-b border-gray-100">
                            <td className="py-2">
                              <p className="font-medium">{bi.item?.name ?? '—'}</p>
                              <p className="text-[10px] text-gray-400 leading-tight">{bi.item?.sku ?? ''}{bi.item?.barcode ? ` / ${bi.item.barcode}` : ''}</p>
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
                          <td colSpan={4} className="text-right py-2 font-medium text-gray-500 pr-2">ยอดรวมก่อนหักส่วนลด</td>
                          <td className="text-right py-2 font-medium">฿{Number(bill.subtotal).toFixed(2)}</td>
                        </tr>
                        {Number(bill.discount) > 0 && (
                          <tr>
                            <td colSpan={4} className="text-right py-1 text-orange-600 pr-2">ส่วนลดบิล</td>
                            <td className="text-right py-1 text-orange-600">-฿{Number(bill.discount).toFixed(2)}</td>
                          </tr>
                        )}
                        <tr className="border-t">
                          <td colSpan={4} className="text-right py-2 font-bold pr-2">ยอดสุทธิ</td>
                          <td className="text-right py-2 font-bold text-blue-600">฿{Number(bill.total).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {bill.notes && <p className="text-xs text-gray-500 mt-2">หมายเหตุ: {bill.notes}</p>}
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
