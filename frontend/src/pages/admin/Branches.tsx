import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import type { Branch } from '../../types';

const EMPTY = { name: '', code: '', address: '', phone: '', active: true };

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
    catch { toast.error('Failed to load branches'); }
    finally { setLoading(false); }
  };

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true); };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({ name: b.name, code: b.code, address: b.address || '', phone: b.phone || '', active: b.active });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await client.put(`/branches/${editing.id}`, form); toast.success('Branch updated'); }
      else { await client.post('/branches', form); toast.success('Branch created'); }
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this branch? This will fail if there are bills or users assigned.')) return;
    try { await client.delete(`/branches/${id}`); toast.success('Deleted'); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Delete failed'); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.length} branches?`)) return;
    try { await client.delete('/branches/bulk', { data: { ids: selected } }); toast.success('Deleted'); setSelected([]); load(); }
    catch { toast.error('Bulk delete failed'); }
  };

  const toggleSelect = (id: string) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleAll = () => setSelected(selected.length === branches.length ? [] : branches.map((b) => b.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">Branches</h1>
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button onClick={handleBulkDelete} className="btn-danger flex items-center gap-1">
              <Trash2 size={16} /> Delete ({selected.length})
            </button>
          )}
          <button onClick={openAdd} className="btn-primary flex items-center gap-1">
            <Plus size={16} /> Add Branch
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
                <th className="table-header">Code</th>
                <th className="table-header">Name</th>
                <th className="table-header">Address</th>
                <th className="table-header">Phone</th>
                <th className="table-header">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">Loading…</td></tr>
              ) : branches.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">No branches</td></tr>
              ) : branches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggleSelect(b.id)} className="rounded" />
                  </td>
                  <td className="table-cell font-mono font-medium">{b.code}</td>
                  <td className="table-cell font-medium">{b.name}</td>
                  <td className="table-cell text-gray-500">{b.address || '—'}</td>
                  <td className="table-cell text-gray-500">{b.phone || '—'}</td>
                  <td className="table-cell">
                    <span className={`badge ${b.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {b.active ? 'Active' : 'Inactive'}
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
        <div className="px-4 py-2 border-t text-xs text-gray-400">{branches.length} branches</div>
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Branch' : 'Add Branch'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="label">Branch Name *</label><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" /></div>
            <div><label className="label">Code *</label><input required value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="input font-mono" placeholder="HQ" /></div>
            <div><label className="label">Address</label><input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="input" /></div>
            <div><label className="label">Phone</label><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input" /></div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active-b" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="active-b" className="text-sm">Active</label>
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
