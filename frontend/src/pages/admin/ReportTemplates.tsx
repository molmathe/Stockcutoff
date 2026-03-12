import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, FileSpreadsheet } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import type { ReportTemplate } from '../../types';

const BRANCH_MATCH_OPTIONS = [
  { value: 'name', label: 'ชื่อสาขา (name)' },
  { value: 'code', label: 'รหัสสาขา (code)' },
  { value: 'reportBranchId', label: 'รหัสรายงาน (reportBranchId)' },
  { value: 'bigsellerBranchId', label: 'รหัส Bigseller (bigsellerBranchId)' },
];

const ITEM_MATCH_OPTIONS = [
  { value: 'barcode', label: 'บาร์โค้ด (barcode)' },
  { value: 'sku', label: 'รหัสสินค้า (SKU)' },
];

const EMPTY = {
  name: '', description: '',
  columnDate: '', columnBarcode: '', columnSku: '',
  columnPrice: 'Price', columnQty: 'Qty',
  columnBranchId: '', columnBranchName: '',
  branchMatchBy: 'name', itemMatchBy: 'barcode',
};

export default function ReportTemplates() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ReportTemplate | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const { data } = await client.get('/report-templates'); setTemplates(data); }
    catch { toast.error('โหลดเทมเพลตไม่สำเร็จ'); }
    finally { setLoading(false); }
  };

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (t: ReportTemplate) => {
    setEditing(t);
    setForm({
      name: t.name, description: t.description || '',
      columnDate: t.columnDate || '', columnBarcode: t.columnBarcode || '',
      columnSku: t.columnSku || '', columnPrice: t.columnPrice,
      columnQty: t.columnQty, columnBranchId: t.columnBranchId || '',
      columnBranchName: t.columnBranchName || '',
      branchMatchBy: t.branchMatchBy, itemMatchBy: t.itemMatchBy,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) {
        await client.put(`/report-templates/${editing.id}`, payload);
        toast.success('อัพเดทเทมเพลตเรียบร้อย');
      } else {
        await client.post('/report-templates', payload);
        toast.success('เพิ่มเทมเพลตเรียบร้อย');
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ลบเทมเพลตนี้?')) return;
    try { await client.delete(`/report-templates/${id}`); toast.success('ลบเทมเพลตเรียบร้อย'); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'ลบไม่สำเร็จ'); }
  };

  const F = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">เทมเพลตรายงาน</h1>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1">
          <Plus size={16} /> เพิ่มเทมเพลต
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">ชื่อเทมเพลต</th>
                <th className="table-header">คอลัมน์ราคา / จำนวน</th>
                <th className="table-header">จับคู่สาขา</th>
                <th className="table-header">จับคู่สินค้า</th>
                <th className="table-header text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : templates.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">ยังไม่มีเทมเพลต</td></tr>
              ) : templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs text-gray-400">{t.description}</div>}
                  </td>
                  <td className="table-cell text-sm font-mono text-gray-600">
                    {t.columnPrice} / {t.columnQty}
                  </td>
                  <td className="table-cell text-sm text-gray-600">
                    {BRANCH_MATCH_OPTIONS.find((o) => o.value === t.branchMatchBy)?.label || t.branchMatchBy}
                  </td>
                  <td className="table-cell text-sm text-gray-600">
                    {ITEM_MATCH_OPTIONS.find((o) => o.value === t.itemMatchBy)?.label || t.itemMatchBy}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(t)} className="text-blue-500 hover:text-blue-700"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-400">{templates.length} เทมเพลต</div>
      </div>

      {showModal && (
        <Modal title={editing ? 'แก้ไขเทมเพลต' : 'เพิ่มเทมเพลต'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Basic Info */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">ข้อมูลพื้นฐาน</p>
              <div className="space-y-2">
                <div>
                  <label className="label">ชื่อเทมเพลต *</label>
                  <input required {...F('name')} className="input" placeholder="เช่น Bigseller Export Template" />
                </div>
                <div>
                  <label className="label">คำอธิบาย</label>
                  <textarea {...F('description')} className="input" rows={2} placeholder="คำอธิบายเพิ่มเติม..." />
                </div>
              </div>
            </div>

            {/* Column Mapping */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">ชื่อหัวคอลัมน์ใน Excel</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">คอลัมน์วันที่</label>
                  <input {...F('columnDate')} className="input font-mono text-sm" placeholder="เช่น Date, วันที่" />
                </div>
                <div>
                  <label className="label">คอลัมน์บาร์โค้ด</label>
                  <input {...F('columnBarcode')} className="input font-mono text-sm" placeholder="เช่น Barcode" />
                </div>
                <div>
                  <label className="label">คอลัมน์ SKU</label>
                  <input {...F('columnSku')} className="input font-mono text-sm" placeholder="เช่น SKU, Product Code" />
                </div>
                <div>
                  <label className="label">คอลัมน์ราคา *</label>
                  <input required {...F('columnPrice')} className="input font-mono text-sm" placeholder="Price" />
                </div>
                <div>
                  <label className="label">คอลัมน์จำนวน *</label>
                  <input required {...F('columnQty')} className="input font-mono text-sm" placeholder="Qty" />
                </div>
                <div>
                  <label className="label">คอลัมน์รหัสสาขา</label>
                  <input {...F('columnBranchId')} className="input font-mono text-sm" placeholder="เช่น Branch ID" />
                </div>
                <div>
                  <label className="label">คอลัมน์ชื่อสาขา</label>
                  <input {...F('columnBranchName')} className="input font-mono text-sm" placeholder="เช่น Branch, Shop" />
                </div>
              </div>
            </div>

            {/* Matching Settings */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">การจับคู่ข้อมูล</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">จับคู่สาขาด้วย</label>
                  <select {...F('branchMatchBy')} className="input">
                    {BRANCH_MATCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">จับคู่สินค้าด้วย</label>
                  <select {...F('itemMatchBy')} className="input">
                    {ITEM_MATCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">ยกเลิก</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
