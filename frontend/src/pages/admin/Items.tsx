import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Upload, Download, Search, Package, Images, X, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import client from '../../api/client';
import Modal from '../../components/Modal';
import type { Item, Category } from '../../types';

const EMPTY = {
  sku: '', barcode: '', name: '', description: '', defaultPrice: '', category: '', active: true,
};

const numericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (
    !/[\d.]/.test(e.key) &&
    !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key) &&
    !(e.ctrlKey || e.metaKey)
  ) {
    e.preventDefault();
  }
};

const CSV_HEADERS = ['sku', 'barcode', 'name', 'description', 'defaultPrice', 'category', 'active'];

const escapeCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
};

const exportCsv = (rows: Item[], filename: string) => {
  if (rows.length === 0) { return; }
  const lines = [
    CSV_HEADERS.join(','),
    ...rows.map((r) =>
      [r.sku, r.barcode, r.name, r.description ?? '', r.defaultPrice, r.category ?? '', r.active]
        .map(escapeCell).join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

const LIMIT = 50;

export default function Items() {
  const qc = useQueryClient();

  // Search: input vs committed param
  const [search, setSearch] = useState('');
  const [searchParam, setSearchParam] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imgDragOver, setImgDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [showBulkImage, setShowBulkImage] = useState(false);

  // Bulk image drag-drop state
  const [dragOver, setDragOver] = useState(false);
  const [bulkImages, setBulkImages] = useState<File[]>([]);
  const [bulkResult, setBulkResult] = useState<{
    matched: { barcode: string; name: string; imageUrl: string }[];
    unmatched: string[];
  } | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const bulkImageInputRef = useRef<HTMLInputElement>(null);
  const dragEnterCount = useRef(0);

  // Prevent browser from navigating to dropped files when dropped outside the drop zone
  React.useEffect(() => {
    if (!showBulkImage) return;
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, [showBulkImage]);

  // Items query with pagination
  const { data: pageData, isLoading: loading } = useQuery({
    queryKey: ['items', searchParam, filterCategory, filterActive, page],
    queryFn: () =>
      client.get('/items', {
        params: {
          page, limit: LIMIT,
          ...(searchParam ? { search: searchParam } : {}),
          ...(filterCategory ? { category: filterCategory } : {}),
          ...(filterActive !== '' ? { active: filterActive } : {}),
        },
      }).then((r) => r.data as { items: Item[]; total: number; page: number; limit: number; pages: number }),
    placeholderData: (prev) => prev,
  });

  const items: Item[] = pageData?.items ?? [];
  const totalPages = pageData?.pages ?? 1;
  const totalItems = pageData?.total ?? 0;

  // Categories query (shared cache with Categories page)
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => client.get('/categories').then((r) => r.data),
  });

  const handleSearch = () => { setPage(1); setSearchParam(search); };
  const handleFilterCategory = (v: string) => { setPage(1); setFilterCategory(v); };
  const handleFilterActive = (v: string) => { setPage(1); setFilterActive(v); };
  const handleClearFilters = () => { setSearch(''); setSearchParam(''); setFilterCategory(''); setFilterActive(''); setPage(1); };

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (fd: FormData) =>
      editing
        ? client.put(`/items/${editing.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        : client.post('/items', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      setShowModal(false);
      toast.success(editing ? 'อัพเดทสินค้าเรียบร้อย' : 'เพิ่มสินค้าเรียบร้อย');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.delete(`/items/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['items'] }); toast.success('ลบเรียบร้อย'); },
    onError: () => toast.error('ลบไม่สำเร็จ'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => client.delete('/items/bulk', { data: { ids } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      setSelected([]);
      toast.success('ลบเรียบร้อย');
    },
    onError: () => toast.error('ลบหลายรายการไม่สำเร็จ'),
  });

  const importPreviewMutation = useMutation({
    mutationFn: (fd: FormData) => client.post('/items/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    onSuccess: ({ data }) => {
      setImportPreview(data);
      toast.success('วิเคราะห์ไฟล์เรียบร้อย');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'วิเคราะห์ไฟล์ไม่สำเร็จ'),
  });

  const importMutation = useMutation({
    mutationFn: (rows: any[]) => client.post('/items/bulk-import', { items: rows }),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ['items'] });
      toast.success(data.message);
      setShowImport(false);
      setImportFile(null);
      setImportPreview([]);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'นำเข้าไม่สำเร็จ'),
  });

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY }); setImageFile(null); setShowModal(true); };
  const openEdit = (item: Item) => {
    setEditing(item);
    setForm({
      sku: item.sku, barcode: item.barcode, name: item.name,
      description: item.description || '', defaultPrice: String(item.defaultPrice),
      category: item.category || '', active: item.active,
    });
    setImageFile(null);
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => v !== undefined && fd.append(k, String(v)));
    if (imageFile) fd.append('image', imageFile);
    saveMutation.mutate(fd);
  };

  const handleDelete = (id: string) => {
    if (!confirm('ลบสินค้านี้?')) return;
    deleteMutation.mutate(id);
  };

  const handleBulkDelete = () => {
    if (!confirm(`ลบ ${selected.length} สินค้า?`)) return;
    bulkDeleteMutation.mutate(selected);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setImportFile(f);
      const fd = new FormData();
      fd.append('file', f);
      importPreviewMutation.mutate(fd);
    }
  };

  const handleImportSubmit = () => {
    if (importPreview.length === 0) return;
    importMutation.mutate(importPreview);
  };

  // Export all items (fetches without pagination for complete dataset)
  const handleExportAll = async () => {
    try {
      const { data } = await client.get('/items', { params: {
        ...(searchParam ? { search: searchParam } : {}),
        ...(filterCategory ? { category: filterCategory } : {}),
        ...(filterActive !== '' ? { active: filterActive } : {}),
      }});
      exportCsv(data, `สินค้า-ทั้งหมด-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { toast.error('ส่งออกไม่สำเร็จ'); }
  };

  const saving = saveMutation.isPending || importMutation.isPending;

  // Export all items (fetches without pagination for complete dataset)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCount.current += 1;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragEnterCount.current -= 1;
    if (dragEnterCount.current === 0) setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragEnterCount.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) { toast.error('กรุณาวางไฟล์รูปภาพเท่านั้น'); return; }
    setBulkImages(files);
    setBulkResult(null);
  }, []);

  const handleBulkImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setBulkImages(files);
    setBulkResult(null);
  };

  const handleBulkUpload = async () => {
    if (bulkImages.length === 0) return;
    setUploadingImages(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      bulkImages.forEach((f) => fd.append('images', f));
      const { data } = await client.post('/items/bulk-images', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          // cap at 95 — the remaining 5 % is server-side processing
          const pct = e.total ? Math.round((e.loaded / e.total) * 95) : 0;
          setUploadProgress(pct);
        },
      });
      setUploadProgress(100);
      setBulkResult(data);
      toast.success(`จับคู่สำเร็จ ${data.matched.length} รายการ`);
      if (data.matched.length > 0) qc.invalidateQueries({ queryKey: ['items'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'อัพโหลดรูปภาพไม่สำเร็จ');
    } finally {
      setUploadingImages(false);
      setUploadProgress(0);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelected(selected.length === items.length && items.length > 0 ? [] : items.map((i) => i.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Package className="text-blue-600" size={22} />
          <h1 className="text-xl font-bold text-gray-800">จัดการสินค้า</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.length > 0 && (
            <>
              <button
                onClick={() => exportCsv(items.filter((i) => selected.includes(i.id)), `สินค้า-เลือก-${selected.length}-รายการ.csv`)}
                className="btn-secondary flex items-center gap-1"
              >
                <FileDown size={16} /> ส่งออก ({selected.length})
              </button>
              <button onClick={handleBulkDelete} className="btn-danger flex items-center gap-1">
                <Trash2 size={16} /> ลบ ({selected.length})
              </button>
            </>
          )}
          <button
            onClick={handleExportAll}
            disabled={totalItems === 0}
            className="btn-secondary flex items-center gap-1"
          >
            <Download size={16} /> ส่งออก CSV
          </button>
          <button onClick={() => { setBulkImages([]); setBulkResult(null); setShowBulkImage(true); }}
            className="btn-secondary flex items-center gap-1">
            <Images size={16} /> อัพโหลดรูปภาพ
          </button>
          <button onClick={() => { setShowImport(true); setImportFile(null); setImportPreview([]); }} className="btn-secondary flex items-center gap-1">
            <Upload size={16} /> นำเข้าจาก Excel
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-1">
            <Plus size={16} /> เพิ่มสินค้า
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="card py-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="ค้นหาชื่อสินค้า, SKU หรือบาร์โค้ด…" className="input pl-9" />
          </div>
          <button onClick={handleSearch} className="btn-primary px-4">ค้นหา</button>
          <select value={filterCategory} onChange={(e) => handleFilterCategory(e.target.value)} className="input py-2 text-sm w-auto">
            <option value="">ทุกหมวดหมู่</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select value={filterActive} onChange={(e) => handleFilterActive(e.target.value)} className="input py-2 text-sm w-auto">
            <option value="">ทุกสถานะ</option>
            <option value="true">เปิดใช้งาน</option>
            <option value="false">ปิดใช้งาน</option>
          </select>
          {(searchParam || filterCategory || filterActive !== '') && (
            <button onClick={handleClearFilters} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
              <X size={13} /> ล้างตัวกรอง
            </button>
          )}
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
                <th className="table-header">รูปภาพ</th>
                <th className="table-header">SKU / บาร์โค้ด</th>
                <th className="table-header">ชื่อสินค้า</th>
                <th className="table-header">หมวดหมู่</th>
                <th className="table-header text-right">ราคา</th>
                <th className="table-header">สถานะ</th>
                <th className="table-header text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-400">ไม่พบสินค้า</td></tr>
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
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300">
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
                  <td className="table-cell text-right font-medium">
                    ฿{Number(item.defaultPrice).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${item.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => exportCsv([item], `${item.sku}-${item.barcode}.csv`)}
                        title="ส่งออก CSV"
                        className="text-gray-400 hover:text-green-600"
                      >
                        <FileDown size={16} />
                      </button>
                      <button onClick={() => openEdit(item)} className="text-blue-500 hover:text-blue-700"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t flex items-center justify-between text-xs text-gray-400">
          <span>{totalItems} สินค้า {searchParam && `(กรองแล้ว)`}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span>หน้า {page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={editing ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">รหัสสินค้า (SKU) *</label>
                <input required value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  className="input" placeholder="ITEM001" />
              </div>
              <div>
                <label className="label">บาร์โค้ด *</label>
                <input required value={form.barcode}
                  onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                  className="input" placeholder="8850001234567" />
              </div>
            </div>
            <div>
              <label className="label">ชื่อสินค้า *</label>
              <input required value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">รายละเอียด</label>
              <textarea value={form.description || ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input h-16 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">ราคาเริ่มต้น *</label>
                <input
                  required
                  type="text"
                  inputMode="decimal"
                  value={form.defaultPrice}
                  onKeyDown={numericKeyDown}
                  onChange={(e) => setForm((f) => ({ ...f, defaultPrice: e.target.value.replace(/[^\d.]/g, '') }))}
                  className="input"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="label">หมวดหมู่</label>
                <select value={form.category || ''}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="input">
                  <option value="">— ไม่ระบุ —</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">รูปภาพสินค้า</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                onDragLeave={() => setImgDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setImgDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f?.type.startsWith('image/')) setImageFile(f);
                }}
                onClick={() => imageInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                  imgDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }`}
              >
                {imageFile ? (
                  <img src={URL.createObjectURL(imageFile)} alt="preview" className="mx-auto w-24 h-24 object-cover rounded-lg" />
                ) : editing?.imageUrl ? (
                  <img src={editing.imageUrl} alt="current" className="mx-auto w-24 h-24 object-cover rounded-lg" />
                ) : (
                  <>
                    <Upload size={24} className="mx-auto mb-1.5 text-gray-400" />
                    <p className="text-xs text-gray-500">ลากวางรูป หรือแตะเพื่อเลือก / ถ่ายรูป</p>
                  </>
                )}
                <input ref={imageInputRef} type="file" accept="image/*"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="hidden" />
              </div>
              {imageFile && (
                <button type="button" onClick={() => setImageFile(null)}
                  className="text-xs text-red-400 hover:text-red-600 mt-1">
                  ยกเลิกรูปที่เลือก
                </button>
              )}
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active-toggle" checked={form.active ?? true}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                <label htmlFor="active-toggle" className="text-sm">เปิดใช้งาน</label>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">ยกเลิก</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bulk Image Upload Modal */}
      {showBulkImage && (
        <Modal title="อัพโหลดรูปภาพสินค้าหลายรายการ" onClose={() => setShowBulkImage(false)} size="lg">
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
              ชื่อไฟล์รูปภาพต้องตรงกับ <strong>บาร์โค้ด</strong> ของสินค้า เช่น{' '}
              <code className="bg-blue-100 px-1 rounded font-mono">8850001234567.jpg</code>{' '}
              — ไฟล์ที่ไม่ตรงกับบาร์โค้ดใดจะถูกข้ามโดยอัตโนมัติ
            </div>

            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => bulkImageInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors select-none ${
                dragOver
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <Images size={40} className="mx-auto mb-3 text-gray-400" />
              <p className="text-sm font-medium text-gray-600">วางรูปภาพที่นี่ หรือคลิกเพื่อเลือก</p>
              <p className="text-xs text-gray-400 mt-1">รองรับ JPG, PNG, WEBP (หลายไฟล์พร้อมกัน)</p>
              <input
                ref={bulkImageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleBulkImageSelect}
                className="hidden"
              />
            </div>

            {bulkImages.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-medium text-gray-700 mb-2">เลือกแล้ว {bulkImages.length} ไฟล์:</p>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {bulkImages.map((f) => (
                    <span key={f.name} className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 font-mono">
                      {f.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Upload progress bar */}
            {uploadingImages && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{uploadProgress < 100 ? `กำลังอัพโหลด... ${uploadProgress}%` : 'เซิร์ฟเวอร์กำลังประมวลผล...'}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${uploadProgress}%`,
                      background: uploadProgress < 100
                        ? 'linear-gradient(90deg, #3b82f6, #60a5fa)'
                        : 'linear-gradient(90deg, #10b981, #34d399)',
                    }}
                  />
                </div>
              </div>
            )}

            {bulkResult && (
              <div className="space-y-2">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-green-700 mb-1">
                    ✅ จับคู่สำเร็จ {bulkResult.matched.length} รายการ
                  </p>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {bulkResult.matched.map((b) => (
                      <span key={b.barcode} className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-mono">
                        {b.barcode} — {b.name}
                      </span>
                    ))}
                  </div>
                </div>
                {bulkResult.unmatched.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-sm font-semibold text-orange-700 mb-1">
                      ⚠️ ไม่พบบาร์โค้ดที่ตรงกัน {bulkResult.unmatched.length} รายการ
                    </p>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {bulkResult.unmatched.map((b) => (
                        <span key={b} className="text-xs bg-orange-100 text-orange-700 rounded px-1.5 py-0.5 font-mono">{b}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleBulkUpload}
                disabled={uploadingImages || bulkImages.length === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {uploadingImages
                  ? uploadProgress < 100
                    ? `กำลังอัพโหลด ${uploadProgress}%`
                    : 'กำลังประมวลผล...'
                  : `อัพโหลด ${bulkImages.length} รูปภาพ`}
              </button>
              <button onClick={() => setShowBulkImage(false)} className="btn-secondary flex-1">ปิด</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Import Excel Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b shrink-0">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Upload className="text-blue-600" /> นำเข้าสินค้าจาก Excel
              </h2>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:bg-gray-100 p-2 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-5">
              {!importFile ? (
                <div className="h-64 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  onClick={() => document.getElementById('excel-upload')?.click()}>
                  <Upload size={48} className="text-gray-400 mb-4" />
                  <p className="text-lg font-medium text-gray-700">คลิกเพื่อเลือกไฟล์ Excel</p>
                  <p className="text-sm text-gray-500 mt-2">รองรับไฟล์ .xlsx หรือ .xls</p>
                  <input id="excel-upload" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-medium text-blue-800">{importFile.name}</span>
                      <span className="text-xs bg-white px-2 py-0.5 rounded text-blue-600 border border-blue-200">
                        {importPreview.length} แถว
                      </span>
                    </div>
                    <button onClick={() => { setImportFile(null); setImportPreview([]); }} className="text-xs text-blue-600 hover:underline">
                      เปลี่ยนไฟล์
                    </button>
                  </div>

                  {importPreviewMutation.isPending ? (
                    <div className="py-12 text-center text-gray-500 animate-pulse">กำลังวิเคราะห์ไฟล์...</div>
                  ) : importPreview.length > 0 ? (
                    <div className="border rounded-xl overflow-hidden shadow-inner">
                      <div className="overflow-x-auto max-h-[50vh]">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                              <th className="p-3 text-left font-semibold text-gray-600 border-b w-12 text-center">แถว</th>
                              <th className="p-3 text-left font-semibold text-gray-600 border-b">SKU</th>
                              <th className="p-3 text-left font-semibold text-gray-600 border-b">บาร์โค้ด</th>
                              <th className="p-3 text-left font-semibold text-gray-600 border-b">ชื่อสินค้า</th>
                              <th className="p-3 text-left font-semibold text-gray-600 border-b">รายละเอียด</th>
                              <th className="p-3 text-left font-semibold text-gray-600 border-b">ราคา</th>
                              <th className="p-3 text-left font-semibold text-gray-600 border-b">หมวดหมู่</th>
                              <th className="p-3 text-left font-semibold text-gray-600 border-b">สถานะ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {importPreview.map((row, idx) => {
                              const updateRow = (field: string, val: any) => {
                                const newRows = [...importPreview];
                                newRows[idx] = { ...newRows[idx], [field]: val };
                                // Re-validate
                                const errs = [];
                                if (!newRows[idx].sku) errs.push('ระบุ SKU');
                                if (!newRows[idx].barcode) errs.push('ระบุ Barcode');
                                if (!newRows[idx].name) errs.push('ระบุชื่อสินค้า');
                                const priceNum = parseFloat(newRows[idx].defaultPrice);
                                if (isNaN(priceNum) || priceNum < 0) errs.push('ราคาไม่ถูกต้อง');
                                newRows[idx].errors = errs;
                                if (errs.length > 0) newRows[idx].status = 'invalid';
                                else if (newRows[idx].status === 'invalid') newRows[idx].status = 'new';
                                setImportPreview(newRows);
                              };

                              return (
                                <tr key={idx} className={row.status === 'invalid' ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                                  <td className="p-2 text-center text-gray-400 text-xs border-r">{row.rowNum}</td>
                                  <td className="p-1">
                                    <input value={row.sku} onChange={(e) => updateRow('sku', e.target.value)}
                                      className="w-full bg-transparent px-2 py-1.5 rounded focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="SKU..." />
                                  </td>
                                  <td className="p-1">
                                    <input value={row.barcode} onChange={(e) => updateRow('barcode', e.target.value)}
                                      className="w-full bg-transparent px-2 py-1.5 rounded focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="บาร์โค้ด..." />
                                  </td>
                                  <td className="p-1">
                                    <input value={row.name} onChange={(e) => updateRow('name', e.target.value)}
                                      className="w-full bg-transparent px-2 py-1.5 rounded focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="ชื่อสินค้า..." />
                                  </td>
                                  <td className="p-1">
                                    <input value={row.description} onChange={(e) => updateRow('description', e.target.value)}
                                      className="w-full text-xs text-gray-600 bg-transparent px-2 py-1.5 rounded focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="รายละเอียด..." />
                                  </td>
                                  <td className="p-1">
                                    <input value={row.defaultPrice} onChange={(e) => updateRow('defaultPrice', e.target.value)}
                                      className={`w-24 bg-transparent px-2 py-1.5 rounded focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none text-right ${isNaN(parseFloat(row.defaultPrice)) ? 'text-red-500 font-medium' : ''}`} placeholder="0.00" />
                                  </td>
                                  <td className="p-1">
                                    <input value={row.category} onChange={(e) => updateRow('category', e.target.value)}
                                      className="w-full bg-transparent px-2 py-1.5 rounded focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none text-xs" placeholder="หมวดหมู่..." />
                                  </td>
                                  <td className="p-2 text-xs">
                                    {row.status === 'new' && <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium whitespace-nowrap">🌟 สินค้าใหม่</span>}
                                    {row.status === 'update' && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium whitespace-nowrap">✏️ อัพเดท</span>}
                                    {row.status === 'invalid' && (
                                      <div className="text-red-600 font-medium tooltip group relative cursor-help">
                                        ❌ ข้อมูลไม่สมบูรณ์
                                        <div className="absolute hidden group-hover:block z-50 bg-red-800 text-white p-2 rounded shadow-lg bottom-full mb-1 w-48 text-left">
                                          {row.errors.map((e: string, i: number) => <div key={i}>• {e}</div>)}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t flex justify-end gap-3 shrink-0 bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowImport(false)} className="btn-secondary">ยกเลิก</button>
              <button 
                onClick={handleImportSubmit} 
                disabled={!importFile || importPreview.length === 0 || importMutation.isPending || importPreview.filter(r => r.status !== 'invalid').length === 0}
                className="btn-primary flex items-center gap-2"
              >
                {importMutation.isPending ? 'กำลังประมวลผล...' : `ยืนยันการนำเข้า ${importPreview.filter(r => r.status !== 'invalid').length} รายการ`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
