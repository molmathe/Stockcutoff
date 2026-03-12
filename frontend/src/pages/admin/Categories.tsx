import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import type { Category } from '../../types';

export default function Categories() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => client.get('/categories').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (trimmedName: string) =>
      editing
        ? client.put(`/categories/${editing.id}`, { name: trimmedName })
        : client.post('/categories', { name: trimmedName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      setShowModal(false);
      toast.success(editing ? 'อัพเดทหมวดหมู่เรียบร้อย — ชื่อสินค้าที่ใช้หมวดหมู่นี้ถูกซิงค์แล้ว' : 'เพิ่มหมวดหมู่เรียบร้อย');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.delete(`/categories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast.success('ลบเรียบร้อย'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'ลบไม่สำเร็จ'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => client.delete('/categories/bulk', { data: { ids } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setSelected([]); toast.success('ลบเรียบร้อย'); },
    onError: () => toast.error('ลบหลายรายการไม่สำเร็จ'),
  });

  const openAdd = () => { setEditing(null); setName(''); setShowModal(true); };
  const openEdit = (c: Category) => { setEditing(c); setName(c.name); setShowModal(true); };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    saveMutation.mutate(name.trim());
  };

  const handleDelete = (id: string, catName: string) => {
    if (!confirm(`ลบหมวดหมู่ "${catName}"? สินค้าที่ใช้หมวดหมู่นี้จะถูกเปลี่ยนเป็นไม่มีหมวดหมู่`)) return;
    deleteMutation.mutate(id);
  };

  const handleBulkDelete = () => {
    if (!confirm(`ลบ ${selected.length} หมวดหมู่? สินค้าที่ใช้หมวดหมู่เหล่านี้จะถูกเปลี่ยนเป็นไม่มีหมวดหมู่`)) return;
    bulkDeleteMutation.mutate(selected);
  };

  const loading = isLoading;
  const saving = saveMutation.isPending;

  const toggleSelect = (id: string) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleAll = () => setSelected(selected.length === categories.length ? [] : categories.map((c) => c.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Tag className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">จัดการหมวดหมู่</h1>
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button onClick={handleBulkDelete} className="btn-danger flex items-center gap-1">
              <Trash2 size={16} /> ลบ ({selected.length})
            </button>
          )}
          <button onClick={openAdd} className="btn-primary flex items-center gap-1">
            <Plus size={16} /> เพิ่มหมวดหมู่
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header w-10">
                  <input type="checkbox" checked={selected.length === categories.length && categories.length > 0} onChange={toggleAll} className="rounded" />
                </th>
                <th className="table-header">ชื่อหมวดหมู่</th>
                <th className="table-header text-gray-400">วันที่สร้าง</th>
                <th className="table-header text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : categories.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">ยังไม่มีหมวดหมู่ — กดเพิ่มหมวดหมู่เพื่อเริ่มต้น</td></tr>
              ) : categories.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="table-cell text-gray-400 text-sm">
                    {new Date(c.createdAt).toLocaleDateString('th-TH')}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(c)} className="text-blue-500 hover:text-blue-700"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(c.id, c.name)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-400">{categories.length} หมวดหมู่</div>
      </div>

      {showModal && (
        <Modal title={editing ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">ชื่อหมวดหมู่ *</label>
              <input
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="เช่น อิเล็กทรอนิกส์, เครื่องดื่ม"
              />
              {editing && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ การเปลี่ยนชื่อจะอัพเดทสินค้าทุกรายการที่ใช้หมวดหมู่นี้โดยอัตโนมัติ
                </p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">ยกเลิก</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
