import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { BarChart3, Download, RefreshCw, Database } from 'lucide-react';
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
  const [exportingMaster, setExportingMaster] = useState(false);

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
      toast.error('โหลดรายงานไม่สำเร็จ');
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
      a.download = `รายงานยอดขาย-${filters.startDate}-${filters.endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดรายงานเรียบร้อย');
    } catch {
      toast.error('ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setDownloading(false);
    }
  };

  const handleExportMaster = async () => {
    setExportingMaster(true);
    try {
      const res = await client.get('/reports/export-master', {
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
      a.download = `ข้อมูลหลัก-${filters.startDate}-${filters.endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดข้อมูลหลักเรียบร้อย');
    } catch {
      toast.error('ดาวน์โหลดข้อมูลหลักไม่สำเร็จ');
    } finally { setExportingMaster(false); }
  };

  const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-800">รายงานยอดขาย</h1>
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
          {user?.role === 'SUPER_ADMIN' && (
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
          <button onClick={loadReport} className="btn-primary flex items-center gap-1">
            <RefreshCw size={15} /> ดึงรายงาน
          </button>
          <button onClick={handleDownload} disabled={downloading || bills.length === 0} className="btn-success flex items-center gap-1">
            <Download size={15} /> {downloading ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด Excel'}
          </button>
          <button onClick={handleExportMaster} disabled={exportingMaster} className="btn-secondary flex items-center gap-1">
            <Database size={15} /> {exportingMaster ? 'กำลังส่งออก...' : 'ส่งออกข้อมูลหลัก'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'รายได้รวม', value: `฿${fmt(summary.totalRevenue)}` },
            { label: 'จำนวนบิล', value: summary.totalBills },
            { label: 'รายการสินค้า', value: summary.items.length },
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
          <div className="px-5 py-3 border-b">
            <h2 className="font-semibold text-gray-700">สรุปยอดขายตามสินค้า</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">#</th>
                  <th className="table-header">SKU</th>
                  <th className="table-header">ชื่อสินค้า</th>
                  <th className="table-header text-right">จำนวนที่ขาย</th>
                  <th className="table-header text-right">รายได้</th>
                  <th className="table-header text-right">% ของรวม</th>
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
          <h2 className="font-semibold text-gray-700">รายการบิล ({bills.length} รายการ)</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : bills.length === 0 ? (
          <div className="p-8 text-center text-gray-400">ไม่พบบิลที่ส่งแล้วในช่วงเวลานี้</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">เลขที่บิล</th>
                  <th className="table-header">สาขา</th>
                  <th className="table-header">แคชเชียร์</th>
                  <th className="table-header">วันที่</th>
                  <th className="table-header text-right">รายการ</th>
                  <th className="table-header text-right">ยอดรวม</th>
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
                  <td colSpan={5} className="table-cell font-bold text-right">รายได้รวมทั้งหมด</td>
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
