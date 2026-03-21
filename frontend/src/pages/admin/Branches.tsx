import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Building2, KeyRound, Link2, Copy, Check, FileUp, FileSpreadsheet, X, Upload } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

  // Import State
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = React.useRef<HTMLInputElement>(null);

  const posLoginUrl = `${window.location.origin}/pos-login`;

  const copyPosLink = () => {
    navigator.clipboard.writeText(posLoginUrl).then(() => {
      setCopied(true);
      toast.success('คัดลอกลิงก์ POS แล้ว');
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
    if (form.pincode && !/^\d{4}$/.test(form.pincode)) {
      toast.error('รหัส PIN ต้องเป็นตัวเลข 4 หลักเท่านั้น');
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

  // Import Logic
  const handleImportFileChange = (f: File | null) => {
    setImportFile(f);
    setImportPreview([]);
  };

  const handlePreviewImport = async () => {
    if (!importFile) return;
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const { data } = await client.post('/branches/import/preview', fd);
      setImportPreview(data);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'วิเคราะห์ไฟล์ไม่สำเร็จ');
    } finally {
      setPreviewing(false);
    }
  };

  const handleImportRowChange = (index: number, field: string, value: string) => {
    const newPreview = [...importPreview];
    newPreview[index] = { ...newPreview[index], [field]: value };
    
    // Quick re-validation
    const row = newPreview[index];
    const errors = [];
    if (!row.code) errors.push('ระบุรหัสสาขา');
    if (!row.name) errors.push('ระบุชื่อสาขา');
    row.errors = errors;
    
    if (errors.length === 0 && row.status === 'invalid') {
       row.status = 'new'; // Let backend handle exact UPSERT
    } else if (errors.length > 0) {
       row.status = 'invalid';
    }
    setImportPreview(newPreview);
  };

  const submitImport = async () => {
    const validRows = importPreview.filter(r => r.status !== 'invalid' && r.code && r.name);
    if (validRows.length === 0) return toast.error('ไม่มีข้อมูลที่ถูกต้องให้นำเข้า');
    setImporting(true);
    try {
      const { data } = await client.post('/branches/import/submit', { rows: validRows });
      toast.success(data.message);
      setShowImport(false);
      setImportFile(null);
      setImportPreview([]);
      qc.invalidateQueries({ queryKey: ['branches'] });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'นำเข้าไม่สำเร็จ');
    } finally {
      setImporting(false);
    }
  };

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
        <div className="flex gap-2 flex-wrap items-center">
          {/* POS Login Link for sending to employees */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
            <Link2 size={14} className="text-blue-500 shrink-0" />
            <span className="text-xs text-blue-700 font-mono hidden sm:block max-w-[220px] truncate">{posLoginUrl}</span>
            <button
              onClick={copyPosLink}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors shrink-0"
              title="คัดลอกลิงก์ POS สำหรับส่งให้พนักงาน"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</span>
            </button>
          </div>
          {selected.length > 0 && (
            <button onClick={handleBulkDelete} className="btn-danger flex items-center gap-1">
              <Trash2 size={16} /> ลบ ({selected.length})
            </button>
          )}
          <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-1">
            <FileUp size={16} /> นำเข้าจาก Excel
          </button>
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
                รหัส PIN สำหรับ POS (4 หลัก)
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={form.pincode}
                onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                className="input text-sm"
                placeholder={editing ? 'ใส่ PIN ใหม่ หรือเว้นว่างเพื่อล้าง' : 'เช่น 1234'}
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

      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col p-4 md:p-8">
          <div className="bg-white rounded-xl shadow-xl flex-1 flex flex-col overflow-hidden max-w-6xl mx-auto w-full relative">
            
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileUp className="text-blue-600" size={24} />
                <h2 className="text-lg font-bold text-gray-800">นำเข้าสาขา (Excel)</h2>
              </div>
              <button onClick={() => { setShowImport(false); setImportPreview([]); setImportFile(null); }} className="text-gray-400 hover:text-gray-700 p-1"><X size={22} /></button>
            </div>

            <div className="p-6 shrink-0 flex items-end gap-4 border-b bg-gray-50/50">
              <div className="flex-1">
                <label className="label">ไฟล์ Excel (branch.xlsx)</label>
                <div
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors flex items-center justify-center gap-3 ${importFile ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-blue-400 bg-white'}`}
                  onClick={() => importFileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImportFileChange(f); }}
                >
                  {importFile ? (
                    <>
                      <FileSpreadsheet className="text-green-600 shrink-0" size={24} />
                      <div className="text-left flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{importFile.name}</p>
                        <p className="text-xs text-green-600">{(importFile.size / 1024).toFixed(1)} KB - พร้อมแสดงตัวอย่าง</p>
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleImportFileChange(null); if (importFileRef.current) importFileRef.current.value = ''; }}
                        className="p-1 hover:bg-green-100 rounded text-gray-500 hover:text-red-500"><X size={18} /></button>
                    </>
                  ) : (
                    <>
                      <Upload className="text-gray-400 shrink-0" size={24} />
                      <div className="text-left text-gray-500">
                        <p className="font-medium text-sm">คลิกหรือลากไฟล์แม่แบบสาขามาวางที่นี่</p>
                        <p className="text-xs mt-0.5 opacity-80 cursor-pointer text-blue-500 hover:underline">ดาวน์โหลดแม่แบบ branch.xlsx</p>
                      </div>
                    </>
                  )}
                </div>
                <input ref={importFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => handleImportFileChange(e.target.files?.[0] ?? null)} />
              </div>
              <button onClick={handlePreviewImport} disabled={previewing || !importFile} className="btn-secondary h-[72px] px-6">
                {previewing ? 'กำลังอ่าน...' : 'อ่านข้อมูล'}
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-gray-50 p-6">
              {importPreview.length > 0 ? (
                <div className="card p-0 overflow-hidden shadow-sm border border-gray-200">
                  <div className="bg-white px-4 py-3 border-b flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-gray-800">ตัวอย่างข้อมูล และแก้ไขข้อมูลก่อนส่ง</h3>
                      <p className="text-xs text-gray-500">แก้ไขข้อมูลที่ผิดพลาดได้โดยตรงในตารางด้านล่าง</p>
                    </div>
                    <div className="text-sm font-medium">พบ {importPreview.length} รายการ</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="py-2 px-3 text-left font-medium w-12 border-b">#</th>
                          <th className="py-2 px-3 text-left font-medium border-b w-32">รหัสสาขา*</th>
                          <th className="py-2 px-3 text-left font-medium border-b min-w-[150px]">ชื่อสาขา*</th>
                          <th className="py-2 px-3 text-left font-medium border-b w-32">ประเภท</th>
                          <th className="py-2 px-3 text-left font-medium border-b w-40">ที่อยู่ / จังหวัด</th>
                          <th className="py-2 px-3 text-left font-medium border-b w-32">รหัส Store</th>
                          <th className="py-2 px-3 text-left font-medium border-b w-28 text-center">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {importPreview.map((r, i) => (
                          <tr key={r.rowNum} className="hover:bg-blue-50/30">
                            <td className="py-2 px-3 text-gray-400 text-xs">{r.rowNum}</td>
                            <td className="py-2 px-3">
                              <input value={r.code} onChange={(e) => handleImportRowChange(i, 'code', e.target.value)} className={`w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition-all ${!r.code ? 'bg-red-50 border-red-300 placeholder-red-300' : ''}`} placeholder="รหัส" />
                            </td>
                            <td className="py-2 px-3">
                              <input value={r.name} onChange={(e) => handleImportRowChange(i, 'name', e.target.value)} className={`w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition-all ${!r.name ? 'bg-red-50 border-red-300 placeholder-red-300' : ''}`} placeholder="ชื่อ" />
                            </td>
                            <td className="py-2 px-3">
                              <select value={r.type} onChange={(e) => handleImportRowChange(i, 'type', e.target.value)} className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded cursor-pointer">
                                <option value="PERMANENT">ถาวร</option>
                                <option value="TEMPORARY">ชั่วคราว</option>
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <input value={r.address} onChange={(e) => handleImportRowChange(i, 'address', e.target.value)} className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded transition-all" placeholder="จังหวัด..." />
                            </td>
                            <td className="py-2 px-3">
                              <input value={r.reportBranchId} onChange={(e) => handleImportRowChange(i, 'reportBranchId', e.target.value)} className="w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none px-1 py-0.5 rounded font-mono transition-all" placeholder="RPT..." />
                            </td>
                            <td className="py-2 px-3 text-center">
                              {r.status === 'new' && <span className="inline-block px-2 text-[10px] font-bold tracking-wide uppercase bg-green-100 text-green-700 rounded-full">สาขาใหม่</span>}
                              {r.status === 'update' && <span className="inline-block px-2 text-[10px] font-bold tracking-wide uppercase bg-blue-100 text-blue-700 rounded-full">อัพเดท</span>}
                              {r.status === 'invalid' && <span className="inline-block px-2 text-[10px] font-bold tracking-wide uppercase bg-red-100 text-red-700 rounded-full" title={r.errors.join(', ')}>ไม่สมบูรณ์</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                  <FileSpreadsheet size={48} className="mb-4 text-gray-300" />
                  <p className="font-medium text-gray-500">ยังไม่มีข้อมูลที่จะแสดง</p>
                  <p className="text-sm mt-1 max-w-sm">กรุณาเลือกไฟล์ Excel และกดปุ่มอ่านข้อมูล เพื่อดูตัวอย่างและแก้ไขข้อมูลก่อนนำเข้าสู่ระบบ</p>
                </div>
              )}
            </div>

            <div className="bg-white border-t px-6 py-4 shrink-0 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                พร้อมนำเข้า: <span className="font-bold text-gray-700">{importPreview.filter(r => r.status !== 'invalid').length}</span> รายการ
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowImport(false)} className="btn-secondary">ยกเลิก</button>
                <button onClick={submitImport} disabled={importing || importPreview.length === 0} className="btn-primary flex items-center gap-2">
                  <Check size={16} />
                  {importing ? 'กำลังบันทึก...' : 'ยีนยันการนำเข้า'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
