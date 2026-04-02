import React, { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import client from '../../api/client';
import toast from 'react-hot-toast';

interface KpiRow {
  branchId: string;
  branchName: string;
  branchCode: string;
  target: number;
  actual: number;
  achievement: number | null;
  submissionDays: number;
  activeDays: number;
  billCount: number;
}

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AchievementBadge = ({ pct }: { pct: number | null }) => {
  if (pct === null) return <span className="text-gray-400 text-xs">ไม่มีเป้า</span>;
  const color =
    pct >= 100 ? 'bg-green-100 text-green-700' :
    pct >= 70  ? 'bg-yellow-100 text-yellow-700' :
                 'bg-red-100 text-red-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {pct.toFixed(1)}%
    </span>
  );
};

export default function BranchKPI() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows]   = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(false);

  // inline edit state: branchId → draft string
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/branch-kpi', { params: { year, month } });
      setRows(res.data.data);
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const startEdit = (row: KpiRow) => {
    setEditing(prev => ({ ...prev, [row.branchId]: row.target > 0 ? String(row.target) : '' }));
  };
  const cancelEdit = (branchId: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[branchId]; return n; });
  };

  const saveTarget = async (branchId: string) => {
    const raw = editing[branchId];
    const value = parseFloat(raw);
    if (isNaN(value) || value < 0) { toast.error('กรุณากรอกเป้าหมายที่ถูกต้อง'); return; }
    try {
      await client.put(`/branch-kpi/${branchId}/target`, { year, month, target: value });
      toast.success('บันทึกเป้าหมายสำเร็จ');
      cancelEdit(branchId);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'บันทึกล้มเหลว');
    }
  };

  const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">KPI สาขา</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[110px] text-center font-semibold text-gray-800 text-sm">
            {MONTHS_TH[month - 1]} {year + 543}
          </span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลด...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">ไม่พบข้อมูลสาขา</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">สาขา</th>
                <th className="px-4 py-3 text-right">เป้าหมาย (฿)</th>
                <th className="px-4 py-3 text-right">ยอดจริง (฿)</th>
                <th className="px-4 py-3 text-center">ทำได้</th>
                <th className="px-4 py-3 text-center">วันส่งยอด / วันทั้งหมด</th>
                {isSuperAdmin && <th className="px-4 py-3 text-center">แก้ไขเป้า</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.branchId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {row.branchName}
                    <span className="ml-1.5 text-xs text-gray-400">{row.branchCode}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {isSuperAdmin && editing[row.branchId] !== undefined ? (
                      <input
                        autoFocus
                        type="number"
                        min="0"
                        step="0.01"
                        value={editing[row.branchId]}
                        onChange={e => setEditing(prev => ({ ...prev, [row.branchId]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveTarget(row.branchId);
                          if (e.key === 'Escape') cancelEdit(row.branchId);
                        }}
                        className="w-32 text-right border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    ) : (
                      row.target > 0 ? fmt(row.target) : <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(row.actual)}</td>
                  <td className="px-4 py-3 text-center">
                    <AchievementBadge pct={row.achievement} />
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {row.submissionDays} / {row.activeDays} วัน
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-center">
                      {editing[row.branchId] !== undefined ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => saveTarget(row.branchId)}
                            className="p-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => cancelEdit(row.branchId)}
                            className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(row)}
                          className="p-1 rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
