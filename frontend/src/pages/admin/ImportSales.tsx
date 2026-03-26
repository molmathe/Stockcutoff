import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, X, FileUp, Trash2, Clock, Save } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import client from '../../api/client';
import type { ImportPreview, ImportPreviewRow } from '../../types';
import { BranchAutoInput, ItemAutoInput } from '../../components/AutocompleteInputs';

const PLATFORMS = [
  { id: 'CENTRAL', name: 'Central / Robinson' },
  { id: 'MBK', name: 'MBK / At First' },
  { id: 'PLAYHOUSE', name: 'Playhouse' },
];

type FilterTab = 'all' | 'matched' | 'unmatched';

const STATUS_LABEL: Record<ImportPreviewRow['status'], string> = {
  matched: 'จับคู่แล้ว',
  no_branch: 'ไม่พบสาขา',
  no_item: 'ไม่พบสินค้า',
  invalid: 'ข้อมูลผิดพลาด',
};

const STATUS_BADGE: Record<ImportPreviewRow['status'], string> = {
  matched: 'bg-green-100 text-green-700',
  no_branch: 'bg-orange-100 text-orange-700',
  no_item: 'bg-yellow-100 text-yellow-700',
  invalid: 'bg-red-100 text-red-700',
};

export default function ImportSales() {
  const [selectedPlatform, setSelectedPlatform] = useState(PLATFORMS[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [submitting, setSubmitting] = useState(false);
  const [resumingDraftId, setResumingDraftId] = useState<string | null>(null);
  const [dupConflict, setDupConflict] = useState<{ saleDate: string; branchName: string }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();
  const { data: drafts } = useQuery({
    queryKey: ['importDrafts'],
    queryFn: async () => {
      const { data } = await client.get('/reports/import/drafts');
      return data as { id: string; platform: string; fileName: string; createdAt: string; updatedAt: string }[];
    }
  });

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!selectedPlatform) { toast.error('กรุณาเลือกแพลตฟอร์ม'); return; }
    if (!file) { toast.error('กรุณาเลือกไฟล์ Excel'); return; }
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('platform', selectedPlatform);
      const { data } = await client.post('/reports/import/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data);
      setPreview({ ...data, fileName: file.name });
      setFilterTab('all');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'วิเคราะห์ไฟล์ไม่สำเร็จ');
    } finally { setPreviewing(false); }
  };

  const calculateStats = (rows: ImportPreviewRow[]) => {
    let matched = 0, totalQty = 0, totalRevenue = 0;
    for (const r of rows) {
      if (r.status === 'matched') {
        matched++;
        totalQty += r.qty;
        totalRevenue += r.qty * r.price;
      }
    }
    return {
      total: rows.length, matched, unmatched: rows.length - matched,
      totalQty, totalRevenue,
      truncated: preview?.stats.truncated || false,
      maxRows: preview?.stats.maxRows || 10000
    };
  };

  const handleRefreshRow = async (rowNum: number, field: 'rawBranch' | 'rawItem', value: string) => {
    if (!preview) return;
    const row = preview.rows.find(r => r.rowNum === rowNum);
    if (!row || row[field] === value) return; // Unchanged

    const originalRow = { ...row, [field]: value };
    try {
      const { data } = await client.post('/reports/import/match', originalRow);
      setPreview(prev => {
        if (!prev) return prev;
        const newRows = prev.rows.map(r => r.rowNum === rowNum ? data : r);
        return { ...prev, rows: newRows, stats: calculateStats(newRows) };
      });
    } catch {
      toast.error('อัพเดทข้อมูลใหม่ล้มเหลว');
    }
  };

  const handleDeleteRow = (rowNum: number) => {
    if (!confirm('ยืนยันที่จะลบสินค้ารายการนี้?')) return;
    setPreview(prev => {
      if (!prev) return prev;
      const newRows = prev.rows.filter(r => r.rowNum !== rowNum);
      return { ...prev, rows: newRows, stats: calculateStats(newRows) };
    });
  };

  const handleSaveDraft = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      const { data } = await client.post('/reports/import/draft', {
        draftId: (preview as any).draftId,
        platform: (preview as any).platform || selectedPlatform,
        fileName: (preview as any).fileName || 'Unsaved Draft',
        rows: preview.rows
      });
      toast.success('บันทึกฉบับร่างเรียบร้อย');
      queryClient.invalidateQueries({ queryKey: ['importDrafts'] });
      setPreview(null);
    } catch (err) {
      toast.error('บันทึกไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResumeDraft = async (id: string) => {
    setResumingDraftId(id);
    try {
      const { data } = await client.post(`/reports/import/draft/${id}/resume`);
      setPreview(data);
      setSelectedPlatform(data.platform);
      setFilterTab('all');
    } catch (err) {
      toast.error('ไม่สามารถเรียกคืนฉบับร่างได้');
    } finally {
      setResumingDraftId(null);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    if (!confirm('ลบฉบับร่างนี้ทิ้งอย่างถาวร?')) return;
    try {
      await client.delete(`/reports/import/draft/${id}`);
      queryClient.invalidateQueries({ queryKey: ['importDrafts'] });
      toast.success('ลบฉบับร่างเรียบร้อย');
    } catch (err) {
      toast.error('ลบไม่สำเร็จ');
    }
  };

  const doSubmit = async (force = false) => {
    if (!preview) return;
    const matchedRows = preview.rows.filter((r) => r.status === 'matched');
    const unmatchedRows = preview.rows.filter((r) => r.status !== 'matched');
    setSubmitting(true);
    try {
      const { data } = await client.post('/reports/import/submit', {
        rows: matchedRows,
        platform: selectedPlatform,
        unmatchedRows,
        fileName: (preview as any).fileName || file?.name,
        draftId: (preview as any).draftId,
        force,
      });
      toast.success(data.message || `นำเข้าเรียบร้อย`);
      setPreview(null);
      setFile(null);
      setDupConflict(null);
      if (fileRef.current) fileRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['importDrafts'] });
    } catch (err: any) {
      if (err.response?.status === 409) {
        setDupConflict(err.response.data.conflicts || []);
      } else {
        toast.error(err.response?.data?.error || 'นำเข้าไม่สำเร็จ');
      }
    } finally { setSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (!preview) return;
    const matchedRows = preview.rows.filter((r) => r.status === 'matched');
    if (matchedRows.length === 0) { toast.error('ไม่มีแถวที่จับคู่ได้'); return; }
    if (!confirm(`นำเข้าข้อมูล ${matchedRows.length} แถว ยืนยัน?`)) return;
    await doSubmit(false);
  };

  const filteredRows = preview?.rows.filter((r) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'matched') return r.status === 'matched';
    if (filterTab === 'unmatched') return r.status !== 'matched';
    return true;
  }) ?? [];

  const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileUp className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-800">นำเข้าข้อมูลการขาย</h1>
      </div>

      {drafts && drafts.length > 0 && (
        <div className="card space-y-4 border-orange-200">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Clock size={20} className="text-orange-500" /> ฉบับร่างที่บันทึกไว้
          </h2>
          <div className="divide-y divide-gray-100 border rounded-lg bg-white overflow-hidden">
            {drafts.map((d: any) => (
              <div key={d.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div>
                  <p className="font-semibold text-gray-800 truncate max-w-sm" title={d.fileName}>{d.fileName}</p>
                  <p className="text-xs text-gray-500 mt-1">
                     แพลตฟอร์ม: {PLATFORMS.find(p => p.id === d.platform)?.name || d.platform} • บันทึกเวลา: {new Date(d.updatedAt).toLocaleString('th-TH')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleDeleteDraft(d.id)} className="btn-secondary text-red-600 border-red-200 px-3 hover:bg-red-50 hover:border-red-300">ลบ</button>
                  <button onClick={() => handleResumeDraft(d.id)} disabled={resumingDraftId === d.id} className="btn-secondary px-4 border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300">
                    {resumingDraftId === d.id ? 'กำลังโหลด...' : 'ทำต่อ'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Card */}
      <div className="card space-y-4">
        <div>
          <label className="label">เลือกแพลตฟอร์ม / รูปแบบไฟล์ *</label>
          <select value={selectedPlatform} onChange={(e) => setSelectedPlatform(e.target.value)} className="input max-w-xs">
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">ไฟล์ Excel (.xlsx / .xls)</label>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileChange(f); }}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="text-green-600" size={28} />
                <div className="text-left">
                  <p className="font-medium text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleFileChange(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="ml-2 text-gray-400 hover:text-red-500"><X size={18} /></button>
              </div>
            ) : (
              <div className="text-gray-400">
                <Upload size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">คลิกหรือลากไฟล์มาวาง</p>
                <p className="text-xs mt-1 opacity-60">รองรับไฟล์ .xlsx และ .xls</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
        </div>

        <div>
          <button
            onClick={handlePreview}
            disabled={previewing || !file || !selectedPlatform}
            className="btn-primary flex items-center gap-2"
          >
            <FileSpreadsheet size={16} />
            {previewing ? 'กำลังวิเคราะห์...' : 'แสดงตัวอย่างข้อมูล'}
          </button>
        </div>
      </div>

      {/* Duplicate conflict modal */}
      {dupConflict && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-orange-600">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold">พบข้อมูลนำเข้าซ้ำ</h3>
            </div>
            <p className="text-sm text-gray-600">วันที่และสาขาต่อไปนี้มีข้อมูล IMPORT อยู่แล้วในระบบ:</p>
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y text-sm">
              {dupConflict.map((c, i) => (
                <div key={i} className="px-3 py-2 flex justify-between">
                  <span className="text-gray-700">{c.branchName}</span>
                  <span className="text-gray-500 font-mono">{c.saleDate}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">หากนำเข้าซ้ำ ยอดขายจะถูกบันทึกสองครั้ง</p>
            <div className="flex gap-3 justify-end pt-1">
              <button onClick={() => setDupConflict(null)} className="btn-secondary">ยกเลิก</button>
              <button
                onClick={() => doSubmit(true)}
                disabled={submitting}
                className="btn-primary bg-orange-600 hover:bg-orange-700 border-orange-600"
              >
                {submitting ? 'กำลังนำเข้า...' : 'นำเข้าซ้ำต่อไป'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Panel */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="text-blue-600" size={24} />
              <div>
                <h2 className="text-lg font-bold text-gray-800">ตัวอย่างข้อมูลนำเข้า</h2>
                <p className="text-xs text-gray-500">{(preview as any).fileName || file?.name || 'Draft'}</p>
              </div>
            </div>
            <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>

          {/* Stats Bar */}
          <div className="bg-white border-b px-6 py-3 shrink-0">
            <div className="flex gap-4 flex-wrap">
              {[
                { label: 'ทั้งหมด', value: preview.stats.total, color: 'text-gray-700' },
                { label: 'จับคู่สำเร็จ', value: preview.stats.matched, color: 'text-green-600' },
                { label: 'จับคู่ไม่ได้', value: preview.stats.unmatched, color: 'text-red-500' },
                { label: 'รวมจำนวน', value: preview.stats.totalQty.toLocaleString(), color: 'text-blue-600' },
                { label: 'รวมยอดขาย', value: `฿${fmt(preview.stats.totalRevenue)}`, color: 'text-blue-700' },
              ].map((s) => (
                <div key={s.label} className="flex items-baseline gap-1.5">
                  <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
                  <span className="text-xs text-gray-500">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="bg-white border-b px-6 pt-2 pb-0 shrink-0 flex gap-1">
            {([['all', 'ทั้งหมด', preview.stats.total], ['matched', 'จับคู่แล้ว', preview.stats.matched], ['unmatched', 'ยังไม่ได้จับคู่', preview.stats.unmatched]] as const).map(([tab, label, count]) => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab as FilterTab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${filterTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto bg-gray-50">
            <table className="w-full text-sm">
              <thead className="bg-white sticky top-0 shadow-sm">
                <tr>
                  <th className="table-header w-12">#</th>
                  <th className="table-header">วันที่ขาย</th>
                  <th className="table-header">สาขา</th>
                  <th className="table-header w-64">สินค้า</th>
                  <th className="table-header text-right">จำนวน</th>
                  <th className="table-header text-right">ราคา</th>
                  <th className="table-header text-center">สถานะ</th>
                  <th className="table-header">หมายเหตุ</th>
                  <th className="table-header w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
                ) : filteredRows.map((row) => (
                  <tr key={row.rowNum} className={row.status === 'matched' ? 'hover:bg-green-50/30' : 'bg-red-50/20 hover:bg-red-50/40'}>
                    <td className="table-cell text-gray-400 text-xs">{row.rowNum}</td>
                    <td className="table-cell text-xs">
                      {row.saleDate ? <span className="font-medium">{row.saleDate}</span> : <span className="text-orange-500">{row.rawDate || '—'}</span>}
                    </td>
                    <td className="table-cell">
                      {row.status === 'matched' ? (
                        row.branchId ? (
                          <span className="font-medium">{row.branchName}</span>
                        ) : (
                          <span className="text-orange-500">{row.rawBranch || '—'}</span>
                        )
                      ) : (
                        <BranchAutoInput
                          key={row.rowNum + '-branch'}
                          defaultValue={row.rawBranch}
                          onCommit={(val) => handleRefreshRow(row.rowNum, 'rawBranch', val)}
                        />
                      )}
                    </td>
                    <td className="table-cell">
                      {row.status === 'matched' ? (
                        <div>
                          <div className="font-medium text-xs truncate w-56" title={row.itemName}>{row.itemName}</div>
                          <div className="text-gray-400 text-xs font-mono">{row.itemSku || row.itemBarcode}</div>
                        </div>
                      ) : (
                        <ItemAutoInput
                          key={row.rowNum + '-item'}
                          defaultValue={row.rawItem}
                          onCommit={(val) => handleRefreshRow(row.rowNum, 'rawItem', val)}
                        />
                      )}
                    </td>
                    <td className="table-cell text-right font-mono">{row.qty}</td>
                    <td className="table-cell text-right font-mono">฿{row.price.toFixed(2)}</td>
                    <td className="table-cell text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[row.status]}`}>
                        {row.status === 'matched' ? <CheckCircle2 size={11} /> : row.status === 'invalid' ? <XCircle size={11} /> : <AlertCircle size={11} />}
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="table-cell text-xs text-gray-400">{row.errors.join(', ') || '—'}</td>
                    <td className="table-cell text-center">
                      <button onClick={() => handleDeleteRow(row.rowNum)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors" title="ลบข้อมูลแถวนี้">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="bg-white border-t px-6 py-4 flex items-center justify-between shrink-0">
            <p className="text-sm text-gray-500 shrink-0">
              จะนำเข้า <span className="font-bold text-green-600">{preview.stats.matched}</span> แถว
              {preview.stats.unmatched > 0 && (
                <span className="ml-2 text-orange-500 hidden sm:inline">• ข้าม {preview.stats.unmatched} แถวที่จับคู่ไม่ได้</span>
              )}
            </p>
            <div className="flex gap-2 sm:gap-3 flex-wrap justify-end">
              <button onClick={() => setPreview(null)} className="btn-secondary">ยกเลิก</button>
              <button 
                onClick={handleSaveDraft} 
                className="btn-secondary flex items-center gap-1.5 sm:gap-2 text-gray-700 bg-gray-50 hover:bg-gray-100 hover:border-gray-300"
                title="บันทึกข้อมูลเก็บไว้จัดการต่อภายหลัง"
              >
                <Save size={16} />
                <span className="hidden sm:inline">บันทึกร่าง</span>
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || preview.stats.matched === 0}
                className="btn-primary flex items-center gap-1.5 sm:gap-2"
              >
                <CheckCircle2 size={16} />
                {submitting ? 'กำลังนำเข้า...' : `นำเข้า ${preview.stats.matched} บิล`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
