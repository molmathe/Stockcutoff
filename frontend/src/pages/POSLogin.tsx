import React, { useState, useRef, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Hash, Delete, ShoppingCart, Building2, CheckCircle, XCircle, AlertTriangle, FileText, CheckSquare } from 'lucide-react';
import client from '../api/client';
import type { Bill } from '../types';

export default function POSLogin() {
  const { user, posLoginPreview, posLoginCommit } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof posLoginPreview>> | null>(null);
  const [showOpenBillsAlert, setShowOpenBillsAlert] = useState(false);
  const [openBills, setOpenBills] = useState<Bill[]>([]);
  const [closingBillId, setClosingBillId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (user) return <Navigate to="/" replace />;

  const handleKeyPress = (digit: string) => {
    if (pin.length < 4) setPin((p) => p + digit);
  };

  const handleDelete = () => setPin((p) => p.slice(0, -1));
  const handleClear = () => setPin('');

  const handleLogin = async () => {
    if (pin.length < 4) { toast.error('กรุณากรอกรหัส PIN 4 หลัก'); return; }
    setLoading(true);
    try {
      const result = await posLoginPreview(pin);
      setPreview(result);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'รหัส PIN ไม่ถูกต้อง');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    posLoginCommit(preview);
    if (preview.openBills.length > 0) {
      setOpenBills(preview.openBills);
      setPreview(null);
      setShowOpenBillsAlert(true);
    } else {
      navigate('/pos');
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setPin('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCloseBill = async (billId: string) => {
    setClosingBillId(billId);
    try {
      await client.post(`/bills/${billId}/submit`);
      setOpenBills((prev) => prev.filter((b) => b.id !== billId));
      toast.success('ปิดบิลเรียบร้อย');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'ไม่สามารถปิดบิลได้');
    } finally {
      setClosingBillId(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(val);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pin.length === 4) handleLogin();
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatTotal = (total: string) => {
    return Number(total).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
            <Hash className="text-white" size={28} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">เข้าสู่ระบบ POS</h1>
          <p className="text-gray-500 text-sm mt-1">กรอกรหัส PIN 4 หลัก</p>
        </div>

        {/* PIN Display */}
        <div className="flex justify-center gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-all ${
                i < pin.length
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-gray-50 text-gray-300'
              }`}
            >
              {i < pin.length ? '●' : '○'}
            </div>
          ))}
        </div>

        {/* Hidden input for keyboard input on mobile */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          value={pin}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          className="sr-only"
          maxLength={4}
        />

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {digits.map((d) => (
            <button
              key={d}
              onClick={() => {
                if (d === '⌫') handleDelete();
                else if (d === 'C') handleClear();
                else handleKeyPress(d);
              }}
              className={`h-14 rounded-xl text-lg font-semibold transition-all active:scale-95 ${
                d === 'C'
                  ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                  : d === '⌫'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                  : 'bg-gray-50 text-gray-800 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-300'
              }`}
            >
              {d === '⌫' ? <Delete size={18} className="mx-auto" /> : d}
            </button>
          ))}
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || pin.length < 4}
          className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-2">
            <ShoppingCart size={18} />
            {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ POS'}
          </span>
        </button>
      </div>

      {/* Branch confirmation popup */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-green-100 rounded-2xl mx-auto flex items-center justify-center mb-4">
              <Building2 className="text-green-600" size={30} />
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-1">ยืนยันการเข้าสู่ระบบ</h2>
            <p className="text-gray-500 text-sm mb-6">
              กรุณาตรวจสอบข้อมูลสาขาให้ถูกต้องก่อนดำเนินการต่อ
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-2">
              <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-1">สาขา</p>
              <p className="text-2xl font-bold text-blue-700">{preview.user.branch?.name ?? '—'}</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-6">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">พนักงาน</p>
              <p className="text-base font-semibold text-gray-700">{preview.user.name}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 hover:border-gray-300 transition-colors"
              >
                <XCircle size={18} />
                ไม่ใช่สาขานี้
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors shadow-sm"
              >
                <CheckCircle size={18} />
                ถูกต้อง เข้าใช้งาน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open bills alert popup */}
      {showOpenBillsAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="text-orange-500" size={24} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">มีรายการบิลยังเปิดอยู่</h2>
                  <p className="text-sm text-gray-500">
                    พบ {openBills.length} บิลที่ยังไม่ปิดใน 7 วันที่ผ่านมา
                  </p>
                </div>
              </div>
            </div>

            {/* Bill list */}
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {openBills.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <CheckSquare size={32} className="mx-auto mb-2 text-green-400" />
                  <p className="text-sm">ปิดบิลทั้งหมดแล้ว</p>
                </div>
              ) : (
                openBills.map((bill) => (
                  <div key={bill.id} className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl p-3">
                    <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText size={16} className="text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{bill.billNumber}</p>
                      <p className="text-xs text-gray-500">{formatDate(bill.createdAt)}</p>
                      <p className="text-xs text-orange-600 font-medium">฿{formatTotal(bill.total)}</p>
                    </div>
                    <button
                      onClick={() => handleCloseBill(bill.id)}
                      disabled={closingBillId === bill.id}
                      className="flex-shrink-0 px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {closingBillId === bill.id ? 'กำลังปิด...' : 'ปิดบิล'}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 pt-3 border-t border-gray-100">
              <button
                onClick={() => navigate('/pos')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-sm"
              >
                <ShoppingCart size={18} />
                เข้าสู่ระบบ POS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
