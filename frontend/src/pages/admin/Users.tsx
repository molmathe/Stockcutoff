import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Users as UsersIcon } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import type { User, Branch } from '../../types';

const ROLES = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER'];
const EMPTY = { username: '', password: '', name: '', role: 'CASHIER', branchId: '', active: true };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); loadBranches(); }, []);

  const load = async () => {
    setLoading(true);
    try { const { data } = await client.get('/users'); setUsers(data); }
    catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  const loadBranches = async () => {
    try { const { data } = await client.get('/branches'); setBranches(data); } catch {}
  };

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY }); setShowModal(true); };
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ username: u.username, password: '', name: u.name, role: u.role, branchId: u.branchId || '', active: u.active });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.password) delete payload.password;
      if (editing) { await client.put(`/users/${editing.id}`, payload); toast.success('User updated'); }
      else { await client.post('/users', payload); toast.success('User created'); }
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    try { await client.delete(`/users/${id}`); toast.success('Deleted'); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Delete failed'); }
  };

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      SUPER_ADMIN: 'bg-purple-100 text-purple-700',
      BRANCH_ADMIN: 'bg-blue-100 text-blue-700',
      CASHIER: 'bg-gray-100 text-gray-600',
    };
    return `badge ${map[role] || 'bg-gray-100 text-gray-500'}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">Users</h1>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1">
          <Plus size={16} /> Add User
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Username</th>
                <th className="table-header">Role</th>
                <th className="table-header">Branch</th>
                <th className="table-header">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-400">No users</td></tr>
              ) : users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{u.name}</td>
                  <td className="table-cell font-mono text-gray-500">{u.username}</td>
                  <td className="table-cell"><span className={roleBadge(u.role)}>{u.role.replace('_', ' ')}</span></td>
                  <td className="table-cell text-gray-500">{u.branch?.name || '—'}</td>
                  <td className="table-cell">
                    <span className={`badge ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.active ? 'Active' : 'Inactive'}
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
        <div className="px-4 py-2 border-t text-xs text-gray-400">{users.length} users</div>
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit User' : 'Add User'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="label">Full Name *</label><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" /></div>
            <div><label className="label">Username *</label><input required disabled={!!editing} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className="input disabled:bg-gray-50" /></div>
            <div>
              <label className="label">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label>
              <input type="password" required={!editing} value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="input" />
            </div>
            {me?.role === 'SUPER_ADMIN' && (
              <div><label className="label">Role</label>
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="input">
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            )}
            <div><label className="label">Branch</label>
              <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} className="input">
                <option value="">— No Branch —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="user-active" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="user-active" className="text-sm">Active</label>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
