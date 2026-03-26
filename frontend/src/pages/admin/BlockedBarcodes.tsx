import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ShieldBan, Upload, X, Search, CheckSquare, Square, Download } from 'lucide-react';
import client from '../../api/client';
import type { BlockedBarcode } from '../../types';

const EMPTY = { barcode: '', reason: '' };

export default function BlockedBarcodes() {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: rows = [], isLoading } = useQuery<BlockedBarcode[]>({
    queryKey: ['blocked-barcodes'],
    queryFn: () => client.get('/blocked-barcodes').then((r) => r.data),
  });

  const filtered = rows.filter((r) =>
    !search || r.barcode.toLowerCase().includes(search.toLowerCase()) ||
    (r.reason ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      editId
        ? client.put(`/blocked-barcodes/${editId}`, form)
        : client.post('/blocked-barcodes', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocked-barcodes'] });
      toast.success(editId ? 'แก้ไขเรียบร้อย' : 'เพิ่มเรียบร้อย');
      closeModal();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.delete(`/blocked-barcodes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocked-barcodes'] });
      toast.success('ลบเรียบร้อย');
      setDeleteId(null);
    },
    onError: () => toast.error('ลบไม่สำเร็จ'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => client.delete('/blocked-barcodes/bulk', { data: { ids } }),
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ['blocked-barcodes'] });
      toast.success(`ลบ ${ids.length} รายการเรียบร้อย`);
      setSelected(new Set());
    },
    onError: () => toast.error('ลบไม่สำเร็จ'),
  });

  const openAdd = () => { setForm(EMPTY); setEditId(null); setShowModal(true); };
  const openEdit = (row: BlockedBarcode) => { setForm({ barcode: row.barcode, reason: row.reason ?? '' }); setEditId(row.id); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setForm(EMPTY); setEditId(null); };

  const toggleSelect = (id: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const toggleAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id)));

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await client.post('/blocked-barcodes/import', fd);
      qc.invalidateQueries({ queryKey: ['blocked-barcodes'] });
      toast.success(data.message);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'นำเข้าไม่สำเร็จ');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const bom = '\uFEFF';
    const csv = bom + 'barcode,reason\n8850999123456,บาร์โค้ดหีบห่อ\n8851234567890,\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blocked_barcodes_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldBan size={20} className="text-red-500" /> บาร์โค้ดต้องห้าม
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            บาร์โค้ดในรายการนี้จะแสดงคำเตือนเมื่อพนักงานสแกน
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.size > 0 && (
            <button
              onClick={() => bulkDeleteMutation.mutate([...selected])}
              disabled={bulkDeleteMutation.isPending}
              className="btn-danger flex items-center gap-2 text-sm px-3 py-2"
            >
              <Trash2 size={15} />
              ลบที่เลือก ({selected.size})
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <button
            onClick={downloadTemplate}
            className="btn-secondary flex items-center gap-2 text-sm px-3 py-2"
            title="ดาวน์โหลดไฟล์ตัวอย่าง"
          >
            <Download size={15} />
            ดาวน์โหลด Template
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="btn-secondary flex items-center gap-2 text-sm px-3 py-2"
          >
            <Upload size={15} />
            {importing ? 'กำลังนำเข้า...' : 'นำเข้า Excel'}
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm px-3 py-2">
            <Plus size={15} /> เพิ่มบาร์โค้ด
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาบาร์โค้ด / เหตุผล…"
          className="input pl-8"
        />
      </div>

      {/* Import hint */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
        <strong>รูปแบบไฟล์:</strong> Excel (.xlsx, .xls) เท่านั้น · คอลัมน์ <code className="bg-blue-100 px-1 rounded">barcode</code> (จำเป็น) และ <code className="bg-blue-100 px-1 rounded">reason</code> (ไม่บังคับ) · แถวแรกเป็น header · Template ดาวน์โหลดเป็น CSV — เปิดใน Excel แล้ว <strong>บันทึกเป็น .xlsx</strong> ก่อนนำเข้า
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">กำลังโหลด…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {search ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีบาร์โค้ดต้องห้าม'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-3 w-10">
                  <button onClick={toggleAll}>
                    {selected.size === filtered.length && filtered.length > 0
                      ? <CheckSquare size={16} className="text-blue-600" />
                      : <Square size={16} />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left">บาร์โค้ด</th>
                <th className="px-4 py-3 text-left">เหตุผล</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">เพิ่มโดย</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">วันที่เพิ่ม</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row) => (
                <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${selected.has(row.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleSelect(row.id)}>
                      {selected.has(row.id)
                        ? <CheckSquare size={16} className="text-blue-600" />
                        : <Square size={16} className="text-gray-300" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded text-xs">
                      {row.barcode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.reason || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{row.createdBy || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{fmtDate(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(row)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteId(row.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">{filtered.length} รายการ{search ? ` (กรองจาก ${rows.length})` : ''}</p>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <ShieldBan size={18} className="text-red-500" />
                {editId ? 'แก้ไขบาร์โค้ดต้องห้าม' : 'เพิ่มบาร์โค้ดต้องห้าม'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">บาร์โค้ด <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  type="text"
                  value={form.barcode}
                  onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                  className="input font-mono"
                  placeholder="กรอกหรือสแกนบาร์โค้ด"
                  disabled={!!editId}
                />
                {editId && <p className="text-xs text-gray-400 mt-1">ไม่สามารถแก้ไขบาร์โค้ดได้ ลบแล้วเพิ่มใหม่</p>}
              </div>
              <div>
                <label className="label">เหตุผล (ไม่บังคับ)</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="input"
                  placeholder="เช่น บาร์โค้ดหีบห่อ, บาร์โค้ดราคา"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="btn-secondary flex-1">ยกเลิก</button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.barcode.trim()}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-500" size={22} />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">ลบบาร์โค้ดนี้?</h3>
            <p className="text-sm text-gray-500 mb-6">บาร์โค้ดจะถูกถอดออกจากรายการต้องห้าม</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">ยกเลิก</button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="btn-danger flex-1"
              >
                {deleteMutation.isPending ? 'กำลังลบ...' : 'ลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
