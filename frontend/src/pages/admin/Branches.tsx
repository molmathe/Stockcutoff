import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Building2, KeyRound } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import type { Branch, BranchType } from '../../types';

const EMPTY = {
  name: '', code: '', address: '', phone: '', pincode: '', active: true,
  type: 'PERMANENT' as BranchType, reportBranchId: '', bigsellerBranchId: '',
};

export default function Branches() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(EMPTY);

  const { data: branches = [], isLoading: loading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => client.get('/branches').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editing
        ? client.put(`/branches/${editing.id}`, payload)
        : client.post('/branches', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      setShowModal(false);
      toast.success(editing ? 'อัพเดทสาขาเรียบร้อย' : 'เพิ่มสาขาเรียบร้อย');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.delete(`/branches/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); toast.success('ลบเรียบร้อย'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'ลบไม่สำเร็จ'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => client.delete('/branches/bulk', { data: { ids } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); setSelected([]); toast.success('ลบเรียบร้อย'); },
    onError: () => toast.error('ลบหลายรายการไม่สำเร็จ'),
  });

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({
      name: b.name, code: b.code, address: b.address || '', phone: b.phone || '',
      pincode: '', active: b.active, type: b.type || 'PERMANENT',
      reportBranchId: b.reportBranchId || '', bigsellerBranchId: b.bigsellerBranchId || '',
    });
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.pincode && !/^\d{4,6}$/.test(form.pincode)) {
      toast.error('รหัส PIN ต้องเป็นตัวเลข 4-6 หลักเท่านั้น');
      return;
    }
    const payload: any = {
      name: form.name, code: form.code, address: form.address, phone: form.phone,
      active: form.active, type: form.type,
      reportBranchId: form.reportBranchId || null,
      bigsellerBranchId: form.bigsellerBranchId || null,
    };
    if (form.pincode) payload.pincode = form.pincode;
    else if (editing) payload.pincode = '';
    saveMutation.mutate(payload);
  };

  const handleDelete = (id: string) => {
    if (!confirm('ลบสาขานี้? การลบจะล้มเหลวหากมีบิลหรือผู้ใช้ที่เชื่อมโยงอยู่')) return;
    deleteMutation.mutate(id);
  };

  const handleBulkDelete = () => {
    if (!confirm(`ลบ ${selected.length} สาขา?`)) return;
    bulkDeleteMutation.mutate(selected);
  };

  const saving = saveMutation.isPending;

  const toggleSelect = (id: string) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleAll = () => setSelected(selected.length === branches.length ? [] : branches.map((b) => b.id));

  const typeBadge = (type: BranchType) =>
    type === 'PERMANENT'
      ? <span className="inline-flex text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">ถาวร</span>
      : <span className="inline-flex text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">ชั่วคราว</span>;

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
                <th className="table-header">ประเภท</th>
                <th className="table-header">รหัสรายงาน / Bigseller</th>
                <th className="table-header">เบอร์โทร</th>
                <th className="table-header text-center">รหัส PIN</th>
                <th className="table-header">สถานะ</th>
                <th className="table-header text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : branches.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-400">ยังไม่มีสาขา</td></tr>
              ) : branches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggleSelect(b.id)} className="rounded" />
                  </td>
                  <td className="table-cell font-mono font-semibold text-blue-700">{b.code}</td>
                  <td className="table-cell font-medium">
                    <div>{b.name}</div>
                    {b.address && <div className="text-xs text-gray-400 truncate max-w-[180px]">{b.address}</div>}
                  </td>
                  <td className="table-cell">{typeBadge(b.type)}</td>
                  <td className="table-cell text-xs text-gray-500 space-y-0.5">
                    {b.reportBranchId && <div><span className="text-gray-400">RPT:</span> {b.reportBranchId}</div>}
                    {b.bigsellerBranchId && <div><span className="text-gray-400">BS:</span> {b.bigsellerBranchId}</div>}
                    {!b.reportBranchId && !b.bigsellerBranchId && <span className="text-gray-300">—</span>}
                  </td>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">ชื่อสาขา *</label>
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" placeholder="เช่น สาขาสยาม" />
              </div>
              <div>
                <label className="label">รหัสสาขา *</label>
                <input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="input font-mono" placeholder="เช่น HQ, BR01" />
              </div>
            </div>

            <div>
              <label className="label">ประเภทสาขา</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as BranchType }))} className="input">
                <option value="PERMANENT">ถาวร (Permanent)</option>
                <option value="TEMPORARY">ชั่วคราว (Temporary)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">รหัสสาขา (รายงาน)</label>
                <input value={form.reportBranchId} onChange={(e) => setForm((f) => ({ ...f, reportBranchId: e.target.value }))} className="input font-mono" placeholder="รหัสในไฟล์รายงาน" />
              </div>
              <div>
                <label className="label">รหัสสาขา (Bigseller)</label>
                <input value={form.bigsellerBranchId} onChange={(e) => setForm((f) => ({ ...f, bigsellerBranchId: e.target.value }))} className="input font-mono" placeholder="รหัสใน Bigseller" />
              </div>
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
