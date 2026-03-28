import React, { useState } from 'react';
import { Database as DbIcon, Download, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function Database() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/database/export', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `stockcutoff_backup_${timestamp}.sql.gz`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMessage({ type: 'success', text: 'ส่งออกฐานข้อมูลสำเร็จ' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'เกิดข้อผิดพลาดในการส่งออก' });
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setShowConfirm(true);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setMessage(null);
    setShowConfirm(false);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/database/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Import failed');

      setMessage({ type: 'success', text: 'นำเข้าฐานข้อมูลสำเร็จ ระบบกำลังรีสตาร์ท (กรุณารอ 5-10 วินาทีแล้วรีเฟรชหน้าจอ)' });
      setSelectedFile(null);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'เกิดข้อผิดพลาดในการนำเข้า' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <DbIcon className="text-blue-600" />
          จัดการฐานข้อมูล
        </h1>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Card */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
              <Download size={24} />
            </div>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">ส่งออกฐานข้อมูล (Export)</h2>
          <p className="text-sm text-gray-500 mb-6">
            ดาวน์โหลดไฟล์สำรองข้อมูล (.sql.gz) ของระบบทั้งหมด เก็บไว้เพื่อความปลอดภัย
          </p>
          <button
            onClick={handleExport}
            disabled={exporting || importing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {exporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
            {exporting ? 'กำลังส่งออก...' : 'ดาวน์โหลดไฟล์สำรอง'}
          </button>
        </div>

        {/* Import Card */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
              <Upload size={24} />
            </div>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">นำเข้าฐานข้อมูล (Import)</h2>
          <p className="text-sm text-gray-500 mb-6">
            กู้คืนข้อมูลจากไฟล์สำรอง (.sql.gz) <span className="text-red-600 font-bold">คำเตือน: ข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด!</span>
          </p>
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              accept=".sql.gz,.sql"
              onChange={handleFileChange}
              disabled={exporting || importing}
            />
            <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border-2 border-dashed border-gray-300 text-gray-600 rounded-lg font-semibold hover:border-orange-400 hover:text-orange-600 disabled:opacity-50 transition-all">
              {importing ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
              {importing ? 'กำลังนำเข้า...' : 'เลือกไฟล์เพื่อกู้คืน'}
            </div>
          </label>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-3 text-orange-600 mb-4">
              <AlertTriangle size={32} />
              <h3 className="text-xl font-bold text-gray-900">ยืนยันการกู้คืนข้อมูล?</h3>
            </div>
            <p className="text-gray-600 mb-6 leading-relaxed">
              คุณกำลังจะกู้คืนฐานข้อมูลจากไฟล์ <span className="font-mono font-bold text-gray-900">{selectedFile?.name}</span>
              <br /><br />
              <span className="text-red-600 font-bold">
                ⚠️ การดำเนินการนี้ไม่สามารถย้อนกลับได้ ข้อมูลที่มีอยู่ในปัจจุบันทั้งหมดจะถูกลบและแทนที่ด้วยข้อมูลจากไฟล์นี้
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirm(false); setSelectedFile(null); }}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleImport}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                ยืนยันการกู้คืน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl">
        <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-2">
          <AlertTriangle size={18} />
          ข้อแนะนำการใช้งาน
        </h3>
        <ul className="text-sm text-blue-800 space-y-2 list-disc list-inside">
          <li>ควรส่งออก (Export) ข้อมูลเก็บไว้เป็นประจำทุกสัปดาห์</li>
          <li>ไฟล์สำรองข้อมูลมีความละเอียดอ่อน ห้ามเปิดเผยหรือส่งให้ผู้อื่นที่ไม่เกี่ยวข้อง</li>
          <li>การกู้คืนข้อมูล (Import) อาจใช้เวลา 10-60 วินาที ขึ้นอยู่กับขนาดไฟล์</li>
          <li>ระหว่างการกู้คืน ระบบจะหยุดทำงานชั่วคราวและผู้ใช้อาจถูกตัดการเชื่อมต่อ</li>
        </ul>
      </div>
    </div>
  );
}
