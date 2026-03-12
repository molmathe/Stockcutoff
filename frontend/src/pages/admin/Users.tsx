import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Users as UsersIcon } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import type { User, Branch } from '../../types';

const ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER'];
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'ผู้ดูแลระบบสูงสุด',
  BRANCH_ADMIN: 'ผู้จัดการสาขา',
  CASHIER: 'แคชเชียร์',
};
const EMPTY = { username: '', password: '', name: '', role: 'CASHIER', branchId: '', active: true };

export default function Users() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });

  const { data: users = [], isLoading: loading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => client.get('/users').then((r) => r.data),
  });

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => client.get('/branches').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editing
        ? client.put(`/users/${editing.id}`, payload)
        : client.post('/users', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
      toast.success(editing ? 'อัพเดทผู้ใช้เรียบร้อย' : 'เพิ่มผู้ใช้เรียบร้อย');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.delete(`/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('ลบเรียบร้อย'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'ลบไม่สำเร็จ'),
  });

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); };
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ username: u.username, password: '', name: u.name, role: u.role, branchId: u.branchId || '', active: u.active });
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    if (!payload.password) delete payload.password;
    saveMutation.mutate(payload);
  };

  const handleDelete = (id: string) => {
    if (!confirm('ลบผู้ใช้นี้?')) return;
    deleteMutation.mutate(id);
  };

  const saving = saveMutation.isPending;

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      SUPER_ADMIN: 'bg-purple-100 text-purple-700',
      BRANCH_ADMIN: 'bg-blue-100 text-blue-700',
      CASHIER: 'bg-gray-100 text-gray-600',
    };
    return `badge ${map[role] || 'bg-gray-100 text-gray-500'}`;
  };

  // Filter out system POS users from display
  const displayUsers = users.filter((u) => !u.isSystem);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">จัดการผู้ใช้</h1>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1">
          <Plus size={16} /> เพิ่มผู้ใช้
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">ชื่อ</th>
                <th className="table-header">ชื่อล็อกอิน</th>
                <th className="table-header">บทบาท</th>
                <th className="table-header">สาขา</th>
                <th className="table-header">สถานะ</th>
                <th className="table-header text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : displayUsers.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">ยังไม่มีผู้ใช้</td></tr>
              ) : displayUsers.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{u.name}</td>
                  <td className="table-cell font-mono text-gray-500">{u.username}</td>
                  <td className="table-cell"><span className={roleBadge(u.role)}>{ROLE_LABELS[u.role] || u.role}</span></td>
                  <td className="table-cell text-gray-500">{u.branch?.name || '—'}</td>
                  <td className="table-cell">
                    <span className={`badge ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(u)} className="text-blue-500 hover:text-blue-700"><Pencil size={16} /></button>
                      {me?.role === 'SUPER_ADMIN' && u.id !== me.id && (
                        <button onClick={() => handleDelete(u.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-400">{displayUsers.length} ผู้ใช้</div>
      </div>

      {showModal && (
        <Modal title={editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">ชื่อ-นามสกุล *</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" placeholder="ชื่อผู้ใช้งาน" />
            </div>
            <div>
              <label className="label">ชื่อล็อกอิน *</label>
              <input required disabled={!!editing} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className="input disabled:bg-gray-50" placeholder="username" />
            </div>
            <div>
              <label className="label">{editing ? 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)' : 'รหัสผ่าน *'}</label>
              <input type="password" required={!editing} value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="input" placeholder="รหัสผ่าน" />
            </div>
            {me?.role === 'SUPER_ADMIN' && (
              <div>
                <label className="label">บทบาท</label>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">สาขา</label>
              <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} className="input">
                <option value="">— ไม่ระบุสาขา —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="user-active" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="user-active" className="text-sm">เปิดใช้งาน</label>
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
