import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GitMerge, Upload, FileSpreadsheet, X, CheckCircle2,
  ChevronDown, ChevronUp, Clock, Save, Trash2, AlertCircle, Download,
} from 'lucide-react';
import client from '../../api/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeptStoreSaleRow {
  date: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  itemBarcode: string;
  consolidatedQty: number;
  consolidatedAmount: number;
  boothQty: number;
  boothAmount: number;
  storeQty: number;
  storeAmount: number;
  unitPrice: number;
}

interface ReviewRow extends Omit<DeptStoreSaleRow, 'unitPrice'> {
  issue: 'NEGATIVE_QTY' | 'NEGATIVE_AMOUNT' | 'NEGATIVE_BOTH';
}

type BoothCoveredRow = Omit<DeptStoreSaleRow, 'unitPrice'>;

interface ErrorRow {
  date: string;
  rawBranch: string;
  rawItem: string;
  qty: number;
  amount: number;
  issue: 'UNKNOWN_BRANCH' | 'UNKNOWN_ITEM' | 'ORPHANED_BOOTH' | 'INVALID_DATA';
  detail: string;
  rowNum: number | null;
}

interface ReconcilePreview {
  platform: string;
  stats: {
    consolidatedRows: number;
    deptStoreRows: number;
    boothCoveredRows: number;
    reviewRows: number;
    errorRows: number;
    totalConsolidatedQty: number;
    totalConsolidatedAmount: number;
    totalBoothQty: number;
    totalBoothAmount: number;
    totalDeptQty: number;
    totalDeptAmount: number;
  };
  deptStoreSales: DeptStoreSaleRow[];
  boothCovered: BoothCoveredRow[];
  reviewNeeded: ReviewRow[];
  errorLogs: ErrorRow[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: 'CENTRAL',   name: 'Central / Robinson' },
  { id: 'MBK',       name: 'MBK / At First' },
  { id: 'PLAYHOUSE', name: 'Playhouse' },
];

const ISSUE_LABEL: Record<string, string> = {
  NEGATIVE_QTY:    'จำนวนติดลบ',
  NEGATIVE_AMOUNT: 'ยอดเงินติดลบ',
  NEGATIVE_BOTH:   'จำนวน+ยอดติดลบ',
  UNKNOWN_BRANCH:  'ไม่พบสาขา',
  UNKNOWN_ITEM:    'ไม่พบสินค้า',
  ORPHANED_BOOTH:  'บูธสแกนแต่ไม่มีในรายงาน',
  INVALID_DATA:    'ข้อมูลไม่ครบ',
};

const ISSUE_COLOR: Record<string, string> = {
  NEGATIVE_QTY:    'bg-orange-100 text-orange-700',
  NEGATIVE_AMOUNT: 'bg-orange-100 text-orange-700',
  NEGATIVE_BOTH:   'bg-red-100 text-red-700',
  UNKNOWN_BRANCH:  'bg-red-100 text-red-700',
  UNKNOWN_ITEM:    'bg-yellow-100 text-yellow-700',
  ORPHANED_BOOTH:  'bg-purple-100 text-purple-700',
  INVALID_DATA:    'bg-gray-100 text-gray-600',
};

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

type TabId = 'all' | 'sales' | 'booth' | 'review' | 'errors';

// ─── Sub-components ───────────────────────────────────────────────────────────

function RowBreakdown({ row, showBooth }: { row: DeptStoreSaleRow | ReviewRow; showBooth: boolean }) {
  return showBooth ? (
    <div className="grid grid-cols-3 gap-1 text-[10px] mt-0.5">
      <span className="text-gray-400">รวม: <span className="font-medium text-gray-600">{row.consolidatedQty} / ฿{fmt(row.consolidatedAmount)}</span></span>
      <span className="text-blue-400">บูธ: <span className="font-medium text-blue-600">-{row.boothQty} / -฿{fmt(row.boothAmount)}</span></span>
      <span className="text-green-500 font-semibold">ร้าน: {row.storeQty} / ฿{fmt(row.storeAmount)}</span>
    </div>
  ) : null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Draft {
  id: string;
  platform: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
}

export default function DeptReconcile() {
  const qc = useQueryClient();
  const [platform, setPlatform]     = useState('CENTRAL');
  const [file, setFile]             = useState<File | null>(null);
  const [analyzing, setAnalyzing]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [preview, setPreview]       = useState<ReconcilePreview | null>(null);
  const [activeTab, setActiveTab]   = useState<TabId>('sales');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [dupConflict, setDupConflict] = useState<{ saleDate: string; branchName: string }[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: drafts = [] } = useQuery<Draft[]>({
    queryKey: ['reconcile-drafts'],
    queryFn: () => client.get('/dept-reconcile/drafts').then(r => r.data),
  });

  const handleFileChange = (f: File | null) => { setFile(f); setPreview(null); };

  const toggleRow = (key: string) =>
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleSaveDraft = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const { data } = await client.post('/dept-reconcile/draft', {
        draftId: (preview as any).draftId ?? null,
        platform: preview.platform,
        fileName: (preview as any)._fileName || 'Untitled',
        previewData: {
          platform: preview.platform,
          stats: preview.stats,
          deptStoreSales: preview.deptStoreSales,
          reviewNeeded: preview.reviewNeeded,
          errorLogs: preview.errorLogs,
          _fileName: (preview as any)._fileName,
        },
      });
      setPreview(p => p ? { ...p, draftId: data.draftId } as any : p);
      qc.invalidateQueries({ queryKey: ['reconcile-drafts'] });
      toast.success('บันทึกฉบับร่างเรียบร้อย');
    } catch {
      toast.error('บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const handleResumeDraft = async (id: string) => {
    setResumingId(id);
    try {
      const { data } = await client.post(`/dept-reconcile/draft/${id}/resume`);
      setPreview(data);
      setPlatform(data.platform || 'CENTRAL');
      setActiveTab('all');
      setExpandedRows(new Set());
    } catch {
      toast.error('ไม่สามารถเรียกคืนฉบับร่างได้');
    } finally { setResumingId(null); }
  };

  const handleDeleteDraft = async (id: string) => {
    if (!confirm('ลบฉบับร่างนี้ถาวร?')) return;
    try {
      await client.delete(`/dept-reconcile/draft/${id}`);
      qc.invalidateQueries({ queryKey: ['reconcile-drafts'] });
      toast.success('ลบฉบับร่างเรียบร้อย');
    } catch {
      toast.error('ลบไม่สำเร็จ');
    }
  };

  const handleAnalyze = async () => {
    if (!file) { toast.error('กรุณาเลือกไฟล์ Excel'); return; }
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('platform', platform);
      const { data } = await client.post('/dept-reconcile/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview({ ...data, _fileName: file.name });
      setActiveTab('all');
      setExpandedRows(new Set());
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'วิเคราะห์ไฟล์ไม่สำเร็จ');
    } finally { setAnalyzing(false); }
  };

  const doSubmit = async (force = false) => {
    if (!preview) return;
    setSubmitting(true);
    try {
      const { data } = await client.post('/dept-reconcile/submit', {
        platform: preview.platform,
        deptStoreSales: preview.deptStoreSales,
        reviewNeeded: preview.reviewNeeded,
        fileName: (preview as any)._fileName || file?.name,
        draftId: (preview as any).draftId ?? null,
        force,
      });
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ['reconcile-drafts'] });
      setPreview(null);
      setFile(null);
      setDupConflict(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      if (err.response?.status === 409) {
        setDupConflict(err.response.data.conflicts || []);
      } else {
        toast.error(err.response?.data?.error || 'นำเข้าไม่สำเร็จ');
      }
    } finally { setSubmitting(false); }
  };

  const handleExport = async () => {
    if (!preview) return;
    setExporting(true);
    try {
      const res = await client.post('/dept-reconcile/export', {
        platform: preview.platform,
        deptStoreSales: preview.deptStoreSales,
        boothCovered: preview.boothCovered,
        reviewNeeded: preview.reviewNeeded,
        stats: preview.stats,
        fileName: (preview as any)._fileName || file?.name,
      }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `reconcile-${preview.platform}-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('ดาวน์โหลดไม่สำเร็จ');
    } finally { setExporting(false); }
  };

  const handleSubmit = async () => {
    if (!preview) return;
    if (preview.stats.deptStoreRows === 0) { toast.error('ไม่มีข้อมูลที่พร้อมนำเข้า'); return; }
    if (!confirm(`นำเข้าข้อมูลยอดขายหน้าร้าน ${preview.stats.deptStoreRows} รายการ ยืนยัน?`)) return;
    await doSubmit(false);
  };

  const { stats } = preview ?? { stats: null };

  return (
    <div className="space-y-4">

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

      {/* Header */}
      <div className="flex items-center gap-2">
        <GitMerge className="text-indigo-600" size={22} />
        <div>
          <h1 className="text-xl font-bold text-gray-800">การคัดแยกยอดขายหน้าร้าน</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            หักยอดขายบูธออกจากรายงานรวม เพื่อคำนวณยอดขายของหน้าร้าน
          </p>
        </div>
      </div>

      {/* Saved Drafts */}
      {drafts.length > 0 && (
        <div className="card border-orange-200 space-y-3">
          <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Clock size={16} className="text-orange-500" /> ฉบับร่างที่บันทึกไว้
          </h2>
          <div className="divide-y divide-gray-100 border rounded-lg bg-white overflow-hidden">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-800 truncate max-w-xs">{d.fileName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {PLATFORMS.find(p => `RECONCILE_${p.id}` === d.platform || p.id === d.platform.replace('RECONCILE_', ''))?.name || d.platform.replace('RECONCILE_', '')}
                    {' · '}บันทึกเมื่อ {new Date(d.updatedAt).toLocaleString('th-TH')}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleDeleteDraft(d.id)}
                    className="btn-secondary text-red-600 border-red-200 px-3 text-xs hover:bg-red-50">
                    <Trash2 size={13} className="inline mr-1" />ลบ
                  </button>
                  <button onClick={() => handleResumeDraft(d.id)} disabled={resumingId === d.id}
                    className="btn-secondary px-4 text-xs border-orange-200 text-orange-700 hover:bg-orange-50">
                    {resumingId === d.id ? 'กำลังโหลด...' : 'ทำต่อ'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Card */}
      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">แพลตฟอร์ม / รูปแบบรายงาน</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input">
              {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">
              ระบบจะจับคู่สาขาจาก <span className="font-medium">reportBranchId</span> ของสาขาประเภท PERMANENT
            </p>
          </div>
          <div>
            <label className="label">ไฟล์ Consolidated Report (.xlsx / .xls)</label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFileChange(e.dataTransfer.files[0] ?? null); }}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="text-green-600 shrink-0" size={22} />
                  <span className="text-sm font-medium text-gray-800 truncate">{file.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleFileChange(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="text-gray-400 hover:text-red-500 shrink-0"><X size={16} /></button>
                </div>
              ) : (
                <div className="text-gray-400 py-2">
                  <Upload size={24} className="mx-auto mb-1 opacity-50" />
                  <p className="text-xs">คลิกหรือลากไฟล์มาวาง</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={analyzing || !file}
          className="btn-primary flex items-center gap-2"
        >
          <GitMerge size={16} />
          {analyzing ? 'กำลังวิเคราะห์...' : 'วิเคราะห์และคำนวณ'}
        </button>
      </div>

      {/* How it works */}
      {!preview && (
        <div className="card bg-indigo-50/50 border-indigo-100">
          <p className="text-xs font-semibold text-indigo-700 mb-2">วิธีการทำงาน</p>
          <ol className="text-xs text-indigo-600 space-y-1 list-decimal list-inside">
            <li>อ่านไฟล์ Consolidated Report (รวมยอดบูธ + ร้านค้า)</li>
            <li>ดึงบิลขายจากบูธ (POS · SUBMITTED) ที่ตรงกับวันที่และสาขาจากระบบ</li>
            <li>หักยอดบูธออก → ได้ยอดขายของหน้าร้าน</li>
            <li>แถวที่ติดลบหรือมีข้อผิดพลาดจะถูกแยกออกเพื่อตรวจสอบ</li>
          </ol>
        </div>
      )}

      {/* Preview Panel */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b px-5 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <GitMerge className="text-indigo-600" size={20} />
              <div>
                <h2 className="text-base font-bold text-gray-800">ผลการคัดแยกยอดขายหน้าร้าน</h2>
                <p className="text-xs text-gray-400">{(preview as any)._fileName || file?.name} · {PLATFORMS.find(p => p.id === preview.platform)?.name}</p>
              </div>
            </div>
            <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
          </div>

          {/* Stats Bar — Reconciliation Formula */}
          <div className="bg-white border-b px-5 py-3 shrink-0 space-y-2">
            {/* Formula: Consolidated - Booth = Net */}
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <div className="flex flex-col items-center px-3 py-1.5 bg-gray-50 rounded-lg border">
                <span className="text-xs text-gray-400">รายงานรวม</span>
                <span className="font-bold text-gray-700">{(stats!.totalConsolidatedQty ?? 0).toLocaleString()} ชิ้น</span>
                <span className="text-xs text-gray-500">฿{fmt(stats!.totalConsolidatedAmount ?? 0)}</span>
              </div>
              <span className="text-xl font-bold text-gray-400">−</span>
              <div className="flex flex-col items-center px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                <span className="text-xs text-blue-400">บูธ POS</span>
                <span className="font-bold text-blue-600">{(stats!.totalBoothQty ?? 0).toLocaleString()} ชิ้น</span>
                <span className="text-xs text-blue-500">฿{fmt(stats!.totalBoothAmount ?? 0)}</span>
              </div>
              <span className="text-xl font-bold text-gray-400">=</span>
              <div className="flex flex-col items-center px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
                <span className="text-xs text-green-500">ยอดหน้าร้าน (Net)</span>
                <span className="font-bold text-green-700">{stats!.totalDeptQty.toLocaleString()} ชิ้น</span>
                <span className="text-xs text-green-600 font-semibold">฿{fmt(stats!.totalDeptAmount)}</span>
              </div>
              <div className="ml-auto flex gap-4 text-xs flex-wrap">
                <span className="text-gray-400">{stats!.consolidatedRows} แถวรายงาน</span>
                <span className="text-blue-500">{stats!.boothCoveredRows ?? 0} บูธขายครบ ✓</span>
                <span className="text-orange-500">{stats!.reviewRows} ต้องตรวจสอบ</span>
                <span className="text-red-500">{stats!.errorRows} ข้อผิดพลาด</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white border-b px-5 shrink-0 flex gap-0 overflow-x-auto">
            {([
              ['all',    `📋 สรุปทั้งหมด (${stats!.deptStoreRows + (stats!.boothCoveredRows ?? 0)})`, 'border-indigo-500 text-indigo-700'],
              ['sales',  `✅ ยอดขายหน้าร้าน (${stats!.deptStoreRows})`,                              'border-green-500 text-green-700'],
              ['booth',  `🔵 บูธขายครบ (${stats!.boothCoveredRows ?? 0})`,                            'border-blue-500 text-blue-700'],
              ['review', `⚠️ ต้องตรวจสอบ (${stats!.reviewRows})`,                                    'border-orange-500 text-orange-700'],
              ['errors', `🔴 ข้อผิดพลาด (${stats!.errorRows})`,                                      'border-red-500 text-red-600'],
            ] as const).map(([tab, label, activeClass]) => (
              <button key={tab} onClick={() => setActiveTab(tab as TabId)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${activeTab === tab ? activeClass : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto bg-gray-50">
            {activeTab === 'all' && (() => {
              const allMatched = [
                ...preview.deptStoreSales.map(r => ({ ...r, _type: 'store' as const })),
                ...(preview.boothCovered ?? []).map(r => ({ ...r, _type: 'booth' as const, unitPrice: 0 })),
              ].sort((a, b) => a.date.localeCompare(b.date) || a.branchName.localeCompare(b.branchName) || a.itemName.localeCompare(b.itemName));
              return (
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 shadow-sm">
                    <tr>
                      <th className="table-header w-8"></th>
                      <th className="table-header">วันที่</th>
                      <th className="table-header">สาขา</th>
                      <th className="table-header">สินค้า</th>
                      <th className="table-header text-right">รายงานรวม</th>
                      <th className="table-header text-right">บูธ POS (หัก)</th>
                      <th className="table-header text-right">ยอดหน้าร้าน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allMatched.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
                    ) : allMatched.map((row, i) => {
                      const isBooth = row._type === 'booth';
                      return (
                        <tr key={i} className={isBooth ? 'bg-blue-50/30 hover:bg-blue-50/50' : 'hover:bg-green-50/20'}>
                          <td className="table-cell text-center">
                            {isBooth
                              ? <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">บูธ</span>
                              : <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">ร้าน</span>}
                          </td>
                          <td className="table-cell text-xs font-mono">{row.date}</td>
                          <td className="table-cell text-xs">
                            <p className="font-medium">{row.branchName}</p>
                            <p className="text-gray-400 text-[10px]">{row.branchCode}</p>
                          </td>
                          <td className="table-cell text-xs">
                            <p className="font-medium truncate max-w-[160px]" title={row.itemName}>{row.itemName}</p>
                            <p className="text-gray-400 font-mono text-[10px]">{row.itemSku} / {row.itemBarcode}</p>
                          </td>
                          <td className="table-cell text-right text-xs text-gray-500">
                            <p>{row.consolidatedQty}</p>
                            <p>฿{fmt(row.consolidatedAmount)}</p>
                          </td>
                          <td className="table-cell text-right text-xs text-blue-500">
                            {row.boothQty > 0 ? (
                              <>
                                <p>-{row.boothQty}</p>
                                <p>-฿{fmt(row.boothAmount)}</p>
                              </>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="table-cell text-right text-xs">
                            {isBooth ? (
                              <span className="text-blue-600 font-medium">บูธขายครบ ✓</span>
                            ) : (
                              <>
                                <p className="font-bold text-green-700">{row.storeQty} ชิ้น</p>
                                <p className="font-bold text-green-600">฿{fmt(row.storeAmount)}</p>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}

            {activeTab === 'sales' && (
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 shadow-sm">
                  <tr>
                    <th className="table-header">วันที่</th>
                    <th className="table-header">สาขา</th>
                    <th className="table-header">สินค้า</th>
                    <th className="table-header text-right">รายงานรวม</th>
                    <th className="table-header text-right">บูธ (หัก)</th>
                    <th className="table-header text-right">ยอดหน้าร้าน</th>
                    <th className="table-header text-right">ราคา/หน่วย</th>
                    <th className="table-header w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.deptStoreSales.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-gray-400">ไม่มีข้อมูล</td></tr>
                  ) : preview.deptStoreSales.map((row, i) => {
                    const key = `s-${i}`;
                    const expanded = expandedRows.has(key);
                    return (
                      <React.Fragment key={key}>
                        <tr className="hover:bg-green-50/30 cursor-pointer" onClick={() => toggleRow(key)}>
                          <td className="table-cell text-xs font-mono">{row.date}</td>
                          <td className="table-cell">
                            <p className="font-medium text-xs">{row.branchName}</p>
                            <p className="text-[10px] text-gray-400">{row.branchCode}</p>
                          </td>
                          <td className="table-cell">
                            <p className="font-medium text-xs truncate max-w-[160px]" title={row.itemName}>{row.itemName}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{row.itemSku} / {row.itemBarcode}</p>
                          </td>
                          <td className="table-cell text-right text-xs text-gray-500">
                            <p>{row.consolidatedQty}</p>
                            <p>฿{fmt(row.consolidatedAmount)}</p>
                          </td>
                          <td className="table-cell text-right text-xs text-blue-500">
                            {row.boothQty > 0 ? (
                              <>
                                <p>-{row.boothQty}</p>
                                <p>-฿{fmt(row.boothAmount)}</p>
                              </>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="table-cell text-right text-xs">
                            <p className="font-bold text-green-700">{row.storeQty} ชิ้น</p>
                            <p className="font-bold text-green-600">฿{fmt(row.storeAmount)}</p>
                          </td>
                          <td className="table-cell text-right text-xs text-gray-500 font-mono">
                            {row.unitPrice > 0 ? `฿${fmt(row.unitPrice)}` : '—'}
                          </td>
                          <td className="table-cell text-gray-400">
                            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-green-50/40">
                            <td colSpan={8} className="px-4 py-2">
                              <div className="grid grid-cols-3 gap-4 text-xs">
                                <div className="bg-white rounded p-2 border border-gray-100">
                                  <p className="text-gray-400 mb-1 font-medium">Consolidated Report</p>
                                  <p>จำนวน: <span className="font-semibold">{row.consolidatedQty}</span></p>
                                  <p>ยอด: <span className="font-semibold">฿{fmt(row.consolidatedAmount)}</span></p>
                                </div>
                                <div className="bg-blue-50 rounded p-2 border border-blue-100">
                                  <p className="text-blue-500 mb-1 font-medium">หักยอดบูธ (POS)</p>
                                  <p>จำนวน: <span className="font-semibold text-blue-600">-{row.boothQty}</span></p>
                                  <p>ยอด: <span className="font-semibold text-blue-600">-฿{fmt(row.boothAmount)}</span></p>
                                </div>
                                <div className="bg-green-50 rounded p-2 border border-green-100">
                                  <p className="text-green-600 mb-1 font-medium">ยอดขายหน้าร้าน</p>
                                  <p>จำนวน: <span className="font-bold text-green-700">{row.storeQty}</span></p>
                                  <p>ยอด: <span className="font-bold text-green-700">฿{fmt(row.storeAmount)}</span></p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {activeTab === 'booth' && (
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 shadow-sm">
                  <tr>
                    <th className="table-header">วันที่</th>
                    <th className="table-header">สาขา</th>
                    <th className="table-header">สินค้า</th>
                    <th className="table-header text-right">รายงานรวม</th>
                    <th className="table-header text-right">บูธ POS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(preview.boothCovered ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">ไม่มีรายการ</td></tr>
                  ) : (preview.boothCovered ?? []).map((row, i) => (
                    <tr key={i} className="hover:bg-blue-50/20">
                      <td className="table-cell text-xs font-mono">{row.date}</td>
                      <td className="table-cell text-xs">
                        <p className="font-medium">{row.branchName}</p>
                        <p className="text-gray-400">{row.branchCode}</p>
                      </td>
                      <td className="table-cell text-xs">
                        <p className="font-medium truncate max-w-[160px]">{row.itemName}</p>
                        <p className="text-gray-400 font-mono">{row.itemBarcode}</p>
                      </td>
                      <td className="table-cell text-right text-xs text-gray-500">
                        <p>{row.consolidatedQty}</p>
                        <p>฿{fmt(row.consolidatedAmount)}</p>
                      </td>
                      <td className="table-cell text-right text-xs text-blue-600 font-medium">
                        <p>{row.boothQty} ชิ้น ✓</p>
                        <p>฿{fmt(row.boothAmount)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'review' && (
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 shadow-sm">
                  <tr>
                    <th className="table-header">ปัญหา</th>
                    <th className="table-header">วันที่</th>
                    <th className="table-header">สาขา</th>
                    <th className="table-header">สินค้า</th>
                    <th className="table-header text-right">Consolidated</th>
                    <th className="table-header text-right">บูธ</th>
                    <th className="table-header text-right">คำนวณได้ (ติดลบ)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.reviewNeeded.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">ไม่มีรายการ</td></tr>
                  ) : preview.reviewNeeded.map((row, i) => (
                    <tr key={i} className="bg-orange-50/30 hover:bg-orange-50/60">
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ISSUE_COLOR[row.issue] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ISSUE_LABEL[row.issue] ?? row.issue}
                        </span>
                      </td>
                      <td className="table-cell text-xs font-mono">{row.date}</td>
                      <td className="table-cell text-xs">
                        <p className="font-medium">{row.branchName}</p>
                        <p className="text-gray-400">{row.branchCode}</p>
                      </td>
                      <td className="table-cell text-xs">
                        <p className="font-medium truncate max-w-[140px]">{row.itemName}</p>
                        <p className="text-gray-400 font-mono">{row.itemBarcode}</p>
                      </td>
                      <td className="table-cell text-right text-xs">
                        <p>{row.consolidatedQty}</p>
                        <p>฿{fmt(row.consolidatedAmount)}</p>
                      </td>
                      <td className="table-cell text-right text-xs text-blue-600">
                        <p>{row.boothQty}</p>
                        <p>฿{fmt(row.boothAmount)}</p>
                      </td>
                      <td className="table-cell text-right text-xs text-red-600 font-bold">
                        <p>{row.storeQty}</p>
                        <p>฿{fmt(row.storeAmount)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'errors' && (
              <table className="w-full text-sm">
                <thead className="bg-white sticky top-0 shadow-sm">
                  <tr>
                    <th className="table-header">ประเภทข้อผิดพลาด</th>
                    <th className="table-header">วันที่</th>
                    <th className="table-header">รหัสสาขา</th>
                    <th className="table-header">รหัสสินค้า</th>
                    <th className="table-header text-right">จำนวน</th>
                    <th className="table-header text-right">ยอด</th>
                    <th className="table-header">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.errorLogs.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">ไม่มีข้อผิดพลาด</td></tr>
                  ) : preview.errorLogs.map((row, i) => (
                    <tr key={i} className="bg-red-50/20 hover:bg-red-50/40">
                      <td className="table-cell">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ISSUE_COLOR[row.issue] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ISSUE_LABEL[row.issue] ?? row.issue}
                        </span>
                      </td>
                      <td className="table-cell text-xs font-mono">{row.date || '—'}</td>
                      <td className="table-cell text-xs font-mono">{row.rawBranch || '—'}</td>
                      <td className="table-cell text-xs font-mono">{row.rawItem || '—'}</td>
                      <td className="table-cell text-right text-xs">{row.qty}</td>
                      <td className="table-cell text-right text-xs">฿{fmt(row.amount)}</td>
                      <td className="table-cell text-xs text-gray-500">{row.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="bg-white border-t px-5 py-3 flex items-center justify-between shrink-0">
            <div className="text-sm text-gray-500">
              {stats!.deptStoreRows > 0 ? (
                <span>ยอดขายหน้าร้าน <span className="font-bold text-green-600">{stats!.deptStoreRows}</span> รายการ · ยอดรวม <span className="font-bold text-indigo-600">฿{fmt(stats!.totalDeptAmount)}</span></span>
              ) : (
                <span className="text-orange-500">ไม่มีรายการที่พร้อมนำเข้า</span>
              )}
              {stats!.reviewRows > 0 && (
                <span className="ml-3 text-orange-500">⚠️ {stats!.reviewRows} รายการส่งไป Unresolved</span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button onClick={() => setPreview(null)} className="btn-secondary">ปิด</button>
              <button onClick={handleExport} disabled={exporting}
                className="btn-secondary flex items-center gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                <Download size={14} />
                {exporting ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด Excel'}
              </button>
              <button onClick={handleSaveDraft} disabled={saving}
                className="btn-secondary flex items-center gap-1.5 text-gray-700 hover:bg-gray-100">
                <Save size={14} />
                {saving ? 'กำลังบันทึก...' : (preview as any).draftId ? 'อัปเดตร่าง' : 'บันทึกร่าง'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || stats!.deptStoreRows === 0}
                className="btn-primary flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                {submitting ? 'กำลังนำเข้า...' : `นำเข้า ${stats!.deptStoreRows} รายการ`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
