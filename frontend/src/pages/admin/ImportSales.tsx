import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, X, FileUp } from 'lucide-react';
import client from '../../api/client';
import type { ReportTemplate, ImportPreview, ImportPreviewRow } from '../../types';

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
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    client.get('/report-templates').then((r) => {
      setTemplates(r.data);
      if (r.data.length > 0) setSelectedTemplateId(r.data[0].id);
    }).catch(() => toast.error('โหลดเทมเพลตไม่สำเร็จ'));
  }, []);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!selectedTemplateId) { toast.error('กรุณาเลือกเทมเพลต'); return; }
    if (!file) { toast.error('กรุณาเลือกไฟล์ Excel'); return; }
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('templateId', selectedTemplateId);
      const { data } = await client.post('/reports/import/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(data);
      setFilterTab('all');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'วิเคราะห์ไฟล์ไม่สำเร็จ');
    } finally { setPreviewing(false); }
  };

  const handleSubmit = async () => {
    if (!preview) return;
    const matchedRows = preview.rows.filter((r) => r.status === 'matched');
    if (matchedRows.length === 0) { toast.error('ไม่มีแถวที่จับคู่ได้'); return; }
    if (!confirm(`นำเข้าข้อมูล ${matchedRows.length} แถว ยืนยัน?`)) return;
    setSubmitting(true);
    try {
      const { data } = await client.post('/reports/import/submit', { rows: matchedRows });
      toast.success(data.message || `นำเข้า ${data.count} บิลเรียบร้อย`);
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'นำเข้าไม่สำเร็จ');
    } finally { setSubmitting(false); }
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

      {/* Upload Card */}
      <div className="card space-y-4">
        <div>
          <label className="label">เลือกเทมเพลต *</label>
          {templates.length === 0 ? (
            <p className="text-sm text-orange-500">ยังไม่มีเทมเพลต กรุณาสร้างเทมเพลตก่อน</p>
          ) : (
            <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className="input max-w-xs">
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
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
            disabled={previewing || !file || !selectedTemplateId}
            className="btn-primary flex items-center gap-2"
          >
            <FileSpreadsheet size={16} />
            {previewing ? 'กำลังวิเคราะห์...' : 'แสดงตัวอย่างข้อมูล'}
          </button>
        </div>
      </div>

      {/* Preview Panel */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="text-blue-600" size={24} />
              <div>
                <h2 className="text-lg font-bold text-gray-800">ตัวอย่างข้อมูลนำเข้า</h2>
                <p className="text-xs text-gray-500">{file?.name}</p>
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
                  <th className="table-header">สินค้า</th>
                  <th className="table-header text-right">จำนวน</th>
                  <th className="table-header text-right">ราคา</th>
                  <th className="table-header text-center">สถานะ</th>
                  <th className="table-header">หมายเหตุ</th>
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
                      {row.branchId ? (
                        <span className="font-medium">{row.branchName}</span>
                      ) : (
                        <span className="text-orange-500">{row.rawBranch || '—'}</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {row.itemId ? (
                        <div>
                          <div className="font-medium text-xs">{row.itemName}</div>
                          <div className="text-gray-400 text-xs font-mono">{row.itemSku || row.itemBarcode}</div>
                        </div>
                      ) : (
                        <span className="text-yellow-600">{row.rawItem || '—'}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="bg-white border-t px-6 py-4 flex items-center justify-between shrink-0">
            <p className="text-sm text-gray-500">
              จะนำเข้า <span className="font-bold text-green-600">{preview.stats.matched}</span> แถว
              {preview.stats.unmatched > 0 && (
                <span className="ml-2 text-orange-500">• ข้าม {preview.stats.unmatched} แถวที่จับคู่ไม่ได้</span>
              )}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPreview(null)} className="btn-secondary">ยกเลิก</button>
              <button
                onClick={handleSubmit}
                disabled={submitting || preview.stats.matched === 0}
                className="btn-primary flex items-center gap-2"
              >
                <CheckCircle2 size={16} />
                {submitting ? 'กำลังนำเข้า...' : `นำเข้า ${preview.stats.matched} แถว`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
