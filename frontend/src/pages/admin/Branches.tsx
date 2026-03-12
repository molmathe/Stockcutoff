import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Building2, KeyRound } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import type { Branch } from '../../types';

const EMPTY = { name: '', code: '', address: '', phone: '', pincode: '', active: true };

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const { data } = await client.get('/branches'); setBranches(data); }
    catch { toast.error('โหลดข้อมูลสาขาไม่สำเร็จ'); }
    finally { setLoading(false); }
  };

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({ name: b.name, code: b.code, address: b.address || '', phone: b.phone || '', pincode: '', active: b.active });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate pincode format
    if (form.pincode && !/^\d{4,6}$/.test(form.pincode)) {
      toast.error('รหัส PIN ต้องเป็นตัวเลข 4-6 หลักเท่านั้น');
      return;
    }
    setSaving(true);
    try {
      const payload: any = { name: form.name, code: form.code, address: form.address, phone: form.phone, active: form.active };
      if (form.pincode) payload.pincode = form.pincode;
      else if (editing) payload.pincode = ''; // clear pincode

      if (editing) { await client.put(`/branches/${editing.id}`, payload); toast.success('อัพเดทสาขาเรียบร้อย'); }
      else { await client.post('/branches', payload); toast.success('เพิ่มสาขาเรียบร้อย'); }
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ลบสาขานี้? การลบจะล้มเหลวหากมีบิลหรือผู้ใช้ที่เชื่อมโยงอยู่')) return;
    try { await client.delete(`/branches/${id}`); toast.success('ลบเรียบร้อย'); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'ลบไม่สำเร็จ'); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`ลบ ${selected.length} สาขา?`)) return;
    try { await client.delete('/branches/bulk', { data: { ids: selected } }); toast.success('ลบเรียบร้อย'); setSelected([]); load(); }
    catch { toast.error('ลบหลายรายการไม่สำเร็จ'); }
  };

  const toggleSelect = (id: string) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleAll = () => setSelected(selected.length === branches.length ? [] : branches.map((b) => b.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">จัดการสาขา</h1>
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button onClick={handleBulkDelete} className="btn-danger flex items-center gap-1">
              <Trash2 size={16} /> ลบ ({selected.length})
            </button>
          )}
          <button onClick={openAdd} className="btn-primary flex items-center gap-1">
            <Plus size={16} /> เพิ่มสาขา
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header w-10">
                  <input type="checkbox" checked={selected.length === branches.length && branches.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                <th className="table-header">รหัสสาขา</th>
                <th className="table-header">ชื่อสาขา</th>
                <th className="table-header">ที่อยู่</th>
                <th className="table-header">เบอร์โทร</th>
                <th className="table-header text-center">รหัส PIN</th>
                <th className="table-header">สถานะ</th>
                <th className="table-header text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : branches.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">ยังไม่มีสาขา</td></tr>
              ) : branches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggleSelect(b.id)} className="rounded" />
                  </td>
                  <td className="table-cell font-mono font-semibold text-blue-700">{b.code}</td>
                  <td className="table-cell font-medium">{b.name}</td>
                  <td className="table-cell text-gray-500 text-sm">{b.address || '—'}</td>
                  <td className="table-cell text-gray-500 text-sm">{b.phone || '—'}</td>
                  <td className="table-cell text-center">
                    {b.hasPincode ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <KeyRound size={11} /> ตั้งค่าแล้ว
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${b.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {b.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(b)} className="text-blue-500 hover:text-blue-700"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-400">{branches.length} สาขา</div>
      </div>

      {showModal && (
        <Modal title={editing ? 'แก้ไขสาขา' : 'เพิ่มสาขา'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">ชื่อสาขา *</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" placeholder="เช่น สาขาสยาม" />
            </div>
            <div>
              <label className="label">รหัสสาขา *</label>
              <input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="input font-mono" placeholder="เช่น HQ, BR01" />
            </div>
            <div>
              <label className="label">ที่อยู่</label>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="input" placeholder="ที่อยู่สาขา" />
            </div>
            <div>
              <label className="label">เบอร์โทร</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input" placeholder="02-xxx-xxxx" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <KeyRound size={14} className="text-blue-500" />
                รหัส PIN สำหรับ POS (4-6 หลัก)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={form.pincode}
                onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className="input font-mono tracking-widest text-lg"
                placeholder={editing ? 'กรอกใหม่เพื่อเปลี่ยน PIN (เว้นว่างเพื่อล้าง)' : 'เช่น 1234'}
              />
              <p className="text-xs text-gray-400 mt-1">ใช้สำหรับเข้าสู่ระบบ POS ด้วย PIN โดยไม่ต้องใช้รหัสผ่าน</p>
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active-b" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="active-b" className="text-sm">เปิดใช้งาน</label>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">ยกเลิก</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
