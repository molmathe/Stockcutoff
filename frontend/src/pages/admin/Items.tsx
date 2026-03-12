import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Upload, Download, Search, Package } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import type { Item } from '../../types';

const EMPTY: Partial<Item> & { defaultPrice: string; password?: string } = {
  sku: '', barcode: '', name: '', description: '', defaultPrice: '', category: '', active: true,
};

export default function Items() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadItems(); loadCategories(); }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/items', { params: search ? { search } : {} });
      setItems(data);
    } catch { toast.error('Failed to load items'); }
    finally { setLoading(false); }
  };

  const loadCategories = async () => {
    try { const { data } = await client.get('/items/categories'); setCategories(data); } catch {}
  };

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY }); setImageFile(null); setShowModal(true); };
  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({ sku: item.sku, barcode: item.barcode, name: item.name, description: item.description || '',
      defaultPrice: item.defaultPrice, category: item.category || '', active: item.active });
    setImageFile(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v !== undefined && fd.append(k, String(v)));
      if (imageFile) fd.append('image', imageFile);
      if (editing) {
        await client.put(`/items/${editing.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Item updated');
      } else {
        await client.post('/items', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Item created');
      }
      setShowModal(false);
      loadItems();
      loadCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try { await client.delete(`/items/${id}`); toast.success('Deleted'); loadItems(); }
    catch { toast.error('Delete failed'); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.length} items?`)) return;
    try { await client.delete('/items/bulk', { data: { ids: selected } }); toast.success('Deleted'); setSelected([]); loadItems(); }
    catch { toast.error('Bulk delete failed'); }
  };

  const handleImport = async () => {
    const lines = importText.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const vals = line.split(',');
      const obj: any = {};
      headers.forEach((h, i) => obj[h] = vals[i]?.trim() || '');
      return obj;
    }).filter((r) => r.sku);

    if (rows.length === 0) { toast.error('No valid rows found'); return; }
    setSaving(true);
    try {
      const { data } = await client.post('/items/bulk-import', { items: rows });
      toast.success(data.message);
      setShowImport(false);
      setImportText('');
      loadItems();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally { setSaving(false); }
  };

  const downloadTemplate = () => {
    const csv = 'sku,barcode,name,description,defaultPrice,category\nITEM001,1234567890001,Sample Item,Description,99.00,Category';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'items-template.csv'; a.click();
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const toggleAll = () => setSelected(selected.length === items.length ? [] : items.map((i) => i.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Package className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">Items</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.length > 0 && (
            <button onClick={handleBulkDelete} className="btn-danger flex items-center gap-1">
              <Trash2 size={16} /> Delete ({selected.length})
            </button>
          )}
          <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-1">
            <Upload size={16} /> Import CSV
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-1">
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card py-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadItems()}
              placeholder="Search by name, SKU or barcode…" className="input pl-9" />
          </div>
          <button onClick={loadItems} className="btn-primary">Search</button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header w-10">
                  <input type="checkbox" checked={selected.length === items.length && items.length > 0}
                    onChange={toggleAll} className="rounded" />
                </th>
                <th className="table-header">Image</th>
                <th className="table-header">SKU / Barcode</th>
                <th className="table-header">Name</th>
                <th className="table-header">Category</th>
                <th className="table-header text-right">Price</th>
                <th className="table-header">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">No items found</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <input type="checkbox" checked={selected.includes(item.id)}
                      onChange={() => toggleSelect(item.id)} className="rounded" />
                  </td>
                  <td className="table-cell">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-10 h-10 object-cover rounded-lg" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-300">
                        <Package size={16} />
                      </div>
                    )}
                  </td>
                  <td className="table-cell">
                    <p className="font-mono text-xs font-medium">{item.sku}</p>
                    <p className="font-mono text-xs text-gray-400">{item.barcode}</p>
                  </td>
                  <td className="table-cell">
                    <p className="font-medium">{item.name}</p>
                    {item.description && <p className="text-xs text-gray-400 truncate max-w-xs">{item.description}</p>}
                  </td>
                  <td className="table-cell">
                    {item.category && <span className="badge bg-blue-50 text-blue-700">{item.category}</span>}
                  </td>
                  <td className="table-cell text-right font-medium">฿{Number(item.defaultPrice).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                  <td className="table-cell">
                    <span className={`badge ${item.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(item)} className="text-blue-500 hover:text-blue-700"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t text-xs text-gray-400">{items.length} items</div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editing ? 'Edit Item' : 'Add Item'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">SKU *</label><input required value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} className="input" placeholder="ITEM001" /></div>
              <div><label className="label">Barcode *</label><input required value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} className="input" placeholder="1234567890001" /></div>
            </div>
            <div><label className="label">Name *</label><input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" /></div>
            <div><label className="label">Description</label><textarea value={form.description || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input h-16 resize-none" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Default Price *</label><input required type="number" step="0.01" min="0" value={form.defaultPrice} onChange={(e) => setForm((f) => ({ ...f, defaultPrice: e.target.value }))} className="input" /></div>
              <div><label className="label">Category</label>
                <input list="cat-list" value={form.category || ''} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="input" placeholder="Electronics" />
                <datalist id="cat-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            </div>
            <div>
              <label className="label">Product Image</label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="input" />
              {editing?.imageUrl && !imageFile && (
                <img src={editing.imageUrl} alt="current" className="mt-2 w-20 h-20 object-cover rounded-lg" />
              )}
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active-toggle" checked={form.active ?? true}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="active-toggle" className="text-sm">Active</label>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Import Modal */}
      {showImport && (
        <Modal title="Bulk Import Items (CSV)" onClose={() => setShowImport(false)} size="lg">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Paste CSV data below (header row required)</p>
              <button onClick={downloadTemplate} className="btn-secondary text-xs flex items-center gap-1">
                <Download size={14} /> Template
              </button>
            </div>
            <div className="font-mono text-xs bg-gray-50 p-2 rounded border">
              sku,barcode,name,description,defaultPrice,category
            </div>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="input h-48 font-mono text-xs resize-none"
              placeholder="sku,barcode,name,description,defaultPrice,category&#10;ITEM001,8850001234567,My Product,Description,99.00,Category"
            />
            <div className="flex gap-2">
              <button onClick={handleImport} disabled={saving || !importText.trim()} className="btn-primary flex-1">
                {saving ? 'Importing…' : 'Import'}
              </button>
              <button onClick={() => setShowImport(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
