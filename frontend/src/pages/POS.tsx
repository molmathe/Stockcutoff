import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Camera, Search, Plus, Minus, Trash2, ShoppingCart,
  CheckCircle, X, BarChart3, RefreshCw, Pencil, Lock,
  AlertTriangle, ShieldAlert,
} from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import BarcodeScanner from '../components/BarcodeScanner';
import type { Item, Branch, TodaySummary, Bill } from '../types';

interface CartItem {
  itemId: string;
  name: string;
  sku: string;
  barcode: string;
  imageUrl: string | null;
  quantity: number;
  price: number;
  discount: number;
  discountStr: string;
}

const numericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (
    !/[\d.]/.test(e.key) &&
    !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key) &&
    !(e.ctrlKey || e.metaKey)
  ) {
    e.preventDefault();
  }
};

export default function POS() {
  const { user } = useAuth();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [notes, setNotes] = useState('');
  const [billDiscountPctStr, setBillDiscountPctStr] = useState('');
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(user?.branchId || '');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [closingDay, setClosingDay] = useState(false);

  // Suggestion state
  const [suggestions, setSuggestions] = useState<Item[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyTimeRef = useRef<number>(0);

  // Modal states
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [blockedBarcode, setBlockedBarcode] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role !== 'CASHIER';
  const billDiscountPct = Math.min(99, Math.max(0, parseInt(billDiscountPctStr) || 0));
  const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

  useEffect(() => {
    if (isAdmin) {
      client.get('/branches').then((r) => setBranches(r.data)).catch(() => {});
    }
    loadSummary();
    inputRef.current?.focus();
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestRef.current && !suggestRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    try {
      const { data } = await client.get('/items', { params: { search: query, active: 'true', page: 1, limit: 8 } });
      const items: Item[] = Array.isArray(data) ? data : (data.items ?? []);
      setSuggestions(items.slice(0, 8));
      setShowSuggestions(items.length > 0);
      setSelectedSuggestion(-1);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  const loadSummary = async () => {
    setLoadingSummary(true);
    try {
      const branchId = selectedBranch || user?.branchId;
      const { data } = await client.get('/bills/today-summary', {
        params: branchId ? { branchId } : {},
      });
      setSummary(data);
    } catch { /* silent */ }
    finally { setLoadingSummary(false); }
  };

  const lookupBarcode = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setShowSuggestions(false);
    setSuggestions([]);
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    try {
      const { data: item } = await client.get<Item>(`/items/barcode/${encodeURIComponent(code.trim())}`);
      addToCart(item);
      setBarcodeInput('');
    } catch (err: any) {
      setBarcodeInput('');
      if (err.response?.status === 403 && err.response?.data?.blocked) {
        setBlockedBarcode(code.trim());
      } else {
        setNotFoundBarcode(code.trim());
      }
    }
    inputRef.current?.focus();
  }, []);

  const addToCart = (item: Item) => {
    setCartItems((prev) => {
      const existing = prev.find((c) => c.itemId === item.id);
      if (existing) {
        return prev.map((c) => c.itemId === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        itemId: item.id,
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        imageUrl: item.imageUrl,
        quantity: 1,
        price: parseFloat(String(item.defaultPrice)),
        discount: 0,
        discountStr: '0',
      }];
    });
    toast.success(`เพิ่ม: ${item.name}`, { duration: 1500, icon: '✅' });
  };

  const handleBarcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBarcodeInput(val);

    const now = Date.now();
    const timeSinceLastKey = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    // If typing fast (< 50ms gap = likely scanner), don't show suggestions
    if (timeSinceLastKey < 50 && val.length > 1) return;

    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (val.trim().length >= 2) {
      suggestDebounceRef.current = setTimeout(() => fetchSuggestions(val.trim()), 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        setSelectedSuggestion(-1);
        return;
      }
      if (e.key === 'Enter' && selectedSuggestion >= 0) {
        e.preventDefault();
        const item = suggestions[selectedSuggestion];
        addToCart(item);
        setBarcodeInput('');
        setShowSuggestions(false);
        setSuggestions([]);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      lookupBarcode(barcodeInput);
    }
  };

  const updateQty = (itemId: string, qty: number) => {
    if (qty <= 0) { removeItem(itemId); return; }
    setCartItems((prev) => prev.map((c) => c.itemId === itemId ? { ...c, quantity: qty } : c));
  };

  const updatePrice = (itemId: string, priceStr: string) => {
    const price = parseFloat(priceStr.replace(/[^\d.]/g, '')) || 0;
    setCartItems((prev) => prev.map((c) => c.itemId === itemId ? { ...c, price } : c));
  };

  const updateDiscount = (itemId: string, discountStr: string) => {
    const clean = discountStr.replace(/[^\d.]/g, '');
    const discount = parseFloat(clean) || 0;
    setCartItems((prev) => prev.map((c) => c.itemId === itemId ? { ...c, discount, discountStr: clean } : c));
  };

  const removeItem = (itemId: string) => setCartItems((prev) => prev.filter((c) => c.itemId !== itemId));

  const clearCart = () => {
    setCartItems([]);
    setBillDiscountPctStr('');
    setNotes('');
    setEditingBillId(null);
    setLastSaved(null);
  };

  const grossSubtotal = Math.round(cartItems.reduce((s, c) => s + c.price * c.quantity, 0) * 100) / 100;
  const totalItemDiscounts = Math.round(cartItems.reduce((s, c) => s + c.discount, 0) * 100) / 100;
  const subtotal = Math.round((grossSubtotal - totalItemDiscounts) * 100) / 100;
  const billDiscountAmt = Math.round(subtotal * billDiscountPct) / 100;
  const totalDiscount = totalItemDiscounts + billDiscountAmt;
  const total = Math.max(0, subtotal - billDiscountAmt);

  const saveBill = async () => {
    if (cartItems.length === 0) { toast.error('ตะกร้าว่างเปล่า'); return; }
    const branchId = selectedBranch || user?.branchId;
    if (!branchId) { toast.error('กรุณาเลือกสาขา'); return; }
    setSaving(true);
    try {
      const payload = {
        branchId,
        discount: billDiscountAmt,
        notes,
        items: cartItems.map((c) => ({
          itemId: c.itemId,
          quantity: c.quantity,
          price: c.price,
          discount: c.discount,
        })),
      };
      let billNumber: string;
      if (editingBillId) {
        const { data } = await client.put(`/bills/${editingBillId}`, payload);
        billNumber = data.billNumber;
        toast.success(`แก้ไขบิล ${billNumber} เรียบร้อย`);
      } else {
        const { data } = await client.post('/bills', payload);
        billNumber = data.billNumber;
        toast.success(`บันทึกบิล: ${billNumber}`);
      }
      setLastSaved(billNumber);
      clearCart();
      loadSummary();
    } catch {
      toast.error('บันทึกบิลไม่สำเร็จ');
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  const loadBillForEdit = (bill: Bill) => {
    setEditingBillId(bill.id);
    setNotes(bill.notes || '');
    const billItems = bill.items.map((bi) => ({
      itemId: bi.itemId,
      name: bi.item?.name || `สินค้า (${bi.itemId.slice(0, 8)})`,
      sku: bi.item?.sku || '',
      barcode: bi.item?.barcode || '',
      imageUrl: bi.item?.imageUrl || null,
      quantity: bi.quantity,
      price: parseFloat(String(bi.price)),
      discount: parseFloat(String(bi.discount || 0)),
      discountStr: String(bi.discount || '0'),
    }));
    const billSub = billItems.reduce((s, c) => s + c.price * c.quantity - c.discount, 0);
    const storedDiscount = parseFloat(String(bill.discount || 0));
    const pct = billSub > 0 && storedDiscount > 0 ? Math.round(storedDiscount / billSub * 100) : 0;
    setBillDiscountPctStr(pct > 0 ? String(pct) : '');
    setCartItems(billItems);
    setShowSummary(false);
    toast(`แก้ไขบิล ${bill.billNumber}`, { icon: '✏️' });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const closeDay = async () => {
    if (!confirm('ปิดวันนี้?\n\nบิลที่เปิดอยู่ทั้งหมดจะถูกส่ง และไม่สามารถแก้ไขได้อีก')) return;
    const branchId = selectedBranch || user?.branchId;
    setClosingDay(true);
    try {
      const { data } = await client.post('/bills/submit-day', { branchId });
      toast.success(`ปิดวัน: ส่งบิล ${data.count} รายการเรียบร้อย`);
      loadSummary();
    } catch {
      toast.error('ปิดวันไม่สำเร็จ');
    } finally {
      setClosingDay(false);
    }
  };

  const openBills = summary?.bills.filter((b) => b.status === 'OPEN') ?? [];

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {scanning && (
        <BarcodeScanner
          onScan={lookupBarcode}
          onClose={() => { setScanning(false); inputRef.current?.focus(); }}
        />
      )}

      {/* ===== Not Found Modal ===== */}
      {notFoundBarcode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-2xl mx-auto flex items-center justify-center mb-4">
              <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">ไม่พบสินค้า</h2>
            <p className="text-sm text-gray-500 mb-3">ไม่พบสินค้าสำหรับบาร์โค้ด</p>
            <div className="bg-gray-100 rounded-lg px-4 py-2 mb-5 font-mono text-gray-700 text-sm break-all">
              {notFoundBarcode}
            </div>
            <p className="text-sm text-red-600 font-medium mb-6">กรุณาติดต่อผู้ดูแลระบบ</p>
            <button
              onClick={() => { setNotFoundBarcode(null); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="w-full py-3 rounded-xl bg-gray-800 text-white font-semibold hover:bg-gray-900 transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      {/* ===== Blocked Barcode Modal ===== */}
      {blockedBarcode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 bg-orange-100 rounded-2xl mx-auto flex items-center justify-center mb-4">
              <ShieldAlert className="text-orange-500" size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">บาร์โค้ดไม่ถูกต้อง</h2>
            <p className="text-sm text-gray-500 mb-3">บาร์โค้ดนี้ถูกระงับการใช้งาน</p>
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 mb-5 font-mono text-orange-700 text-sm break-all">
              {blockedBarcode}
            </div>
            <p className="text-base font-semibold text-orange-600 mb-6">
              กรุณาสแกนบาร์โค้ดสินค้าอีกครั้ง
            </p>
            <button
              onClick={() => { setBlockedBarcode(null); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}

      {/* ===== Left panel ===== */}
      <div className="lg:w-1/2 space-y-4">

        {/* Scanner card */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <ShoppingCart size={18} /> หน้าขาย (POS)
            {editingBillId && (
              <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Pencil size={11} /> กำลังแก้ไขบิล
              </span>
            )}
          </h2>

          {isAdmin && (
            <div className="mb-3">
              <label className="label">สาขา</label>
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="input">
                <option value="">— เลือกสาขา —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
          )}

          <label className="label">สแกน / กรอกบาร์โค้ด</label>
          <div className="relative">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={barcodeInput}
                onChange={handleBarcodeChange}
                onKeyDown={handleBarcodeKeyDown}
                onFocus={() => barcodeInput.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
                className="input flex-1"
                placeholder="สแกนบาร์โค้ดหรือพิมพ์แล้วกด Enter…"
                autoComplete="off"
              />
              <button onClick={() => lookupBarcode(barcodeInput)} className="btn-primary px-3">
                <Search size={18} />
              </button>
              <button onClick={() => setScanning(true)} className="btn-secondary px-3" title="สแกนด้วยกล้อง">
                <Camera size={18} />
              </button>
            </div>

            {/* Suggestion dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestRef}
                className="absolute top-full left-0 right-12 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden"
              >
                {suggestions.map((item, idx) => (
                  <button
                    key={item.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addToCart(item);
                      setBarcodeInput('');
                      setShowSuggestions(false);
                      setSuggestions([]);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 ${
                      idx === selectedSuggestion ? 'bg-blue-50' : ''
                    }`}
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-[9px] text-gray-400 shrink-0 font-mono">
                        {item.sku.slice(0, 4)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{item.sku} · {item.barcode}</p>
                    </div>
                    <span className="text-sm font-semibold text-blue-700 shrink-0">
                      ฿{parseFloat(String(item.defaultPrice)).toLocaleString('th-TH')}
                    </span>
                  </button>
                ))}
                <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100">
                  <p className="text-[11px] text-gray-400">↑↓ เลือก · Enter ยืนยัน · Esc ปิด</p>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">เครื่องสแกน USB จะส่งข้อมูลอัตโนมัติเมื่อกด Enter</p>
        </div>

        {/* Last saved notification */}
        {lastSaved && (
          <div className="card border-green-200 bg-green-50 flex items-center gap-3">
            <CheckCircle className="text-green-600 shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-green-700">บันทึกบิลเรียบร้อย</p>
              <p className="text-xs text-green-600">{lastSaved}</p>
            </div>
            <button onClick={() => setLastSaved(null)} className="ml-auto text-green-400 hover:text-green-600">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Bill options */}
        <div className="card">
          <h3 className="font-medium text-gray-700 mb-2">ตัวเลือกบิล</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">ส่วนลดบิล (%)</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={billDiscountPctStr}
                  maxLength={2}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    const n = parseInt(v) || 0;
                    setBillDiscountPctStr(n > 99 ? '99' : v);
                  }}
                  className="input pr-8"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">%</span>
              </div>
              {billDiscountPct > 0 && (
                <p className="text-xs text-orange-600 mt-0.5">= -฿{fmt(billDiscountAmt)}</p>
              )}
            </div>
            <div>
              <label className="label">หมายเหตุ</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                placeholder="หมายเหตุ (ถ้ามี)"
              />
            </div>
          </div>
        </div>

        {/* Daily Summary (collapsible) */}
        <div className="card p-0 overflow-hidden">
          <button
            onClick={() => { setShowSummary(!showSummary); if (!showSummary) loadSummary(); }}
            className="w-full px-4 py-3 flex items-center gap-2 hover:bg-gray-50 transition-colors text-left"
          >
            <BarChart3 size={16} className="text-blue-600 shrink-0" />
            <span className="font-medium text-gray-700 text-sm">สรุปยอดขายวันนี้</span>
            {summary && !loadingSummary && (
              <span className="ml-auto text-xs text-gray-500 shrink-0">
                {summary.totalBills} บิล · ฿{fmt(summary.totalRevenue)}
              </span>
            )}
            {loadingSummary && <RefreshCw size={13} className="ml-auto animate-spin text-gray-400" />}
            <span className="text-gray-400 text-xs ml-1">{showSummary ? '▲' : '▼'}</span>
          </button>

          {showSummary && (
            <div className="border-t px-4 pb-4 space-y-3">
              {/* Stats row */}
              <div className="flex items-center gap-3 pt-3">
                <div className="grid grid-cols-3 gap-3 flex-1">
                  <div className="text-center bg-gray-50 rounded-lg py-2">
                    <p className="text-xl font-bold text-gray-800">{summary?.totalBills ?? 0}</p>
                    <p className="text-xs text-gray-500">บิลทั้งหมด</p>
                  </div>
                  <div className="text-center bg-orange-50 rounded-lg py-2">
                    <p className="text-xl font-bold text-orange-600">{summary?.openBills ?? 0}</p>
                    <p className="text-xs text-gray-500">บิลเปิด</p>
                  </div>
                  <div className="text-center bg-blue-50 rounded-lg py-2">
                    <p className="text-lg font-bold text-blue-700">฿{fmt(summary?.totalRevenue ?? 0)}</p>
                    <p className="text-xs text-gray-500">รายได้รวม</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={loadSummary}
                  disabled={loadingSummary}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 border border-gray-200 rounded px-2 py-1"
                >
                  <RefreshCw size={13} className={loadingSummary ? 'animate-spin' : ''} />
                  รีเฟรช
                </button>
                <button
                  onClick={closeDay}
                  disabled={closingDay || !summary?.openBills}
                  className="btn-danger text-xs flex items-center gap-1 py-1 px-3 ml-auto"
                >
                  <Lock size={13} />
                  {closingDay ? 'กำลังปิดวัน...' : 'ปิดวัน'}
                </button>
              </div>

              {/* Open bills list (editable) */}
              {openBills.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">บิลที่เปิดอยู่ (กดแก้ไขเพื่อโหลดเข้าตะกร้า)</p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {openBills.map((bill) => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2"
                      >
                        <div>
                          <p className="text-xs font-mono font-semibold text-gray-700">{bill.billNumber}</p>
                          <p className="text-xs text-gray-500">
                            {bill.items.length} รายการ · ฿{fmt(parseFloat(String(bill.total)))}
                          </p>
                        </div>
                        <button
                          onClick={() => loadBillForEdit(bill)}
                          className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 rounded px-2.5 py-1 flex items-center gap-1 transition-colors"
                        >
                          <Pencil size={12} /> แก้ไข
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : summary && (
                <p className="text-xs text-gray-400 text-center py-2 bg-gray-50 rounded-lg">
                  ไม่มีบิลที่เปิดอยู่ในวันนี้
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Right: Cart ===== */}
      <div className="lg:w-1/2 flex flex-col">
        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">
              ตะกร้าสินค้า ({cartItems.length} รายการ)
            </h3>
            {cartItems.length > 0 && (
              <button onClick={clearCart} className="text-xs text-red-500 hover:text-red-700">ล้างตะกร้า</button>
            )}
          </div>

          {cartItems.length === 0 ? (
            <div className="flex items-center justify-center text-gray-300 py-12">
              <div className="text-center">
                <ShoppingCart size={48} className="mx-auto mb-2" />
                <p className="text-sm">สแกนสินค้าเพื่อเพิ่มในตะกร้า</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {cartItems.map((item) => (
                <div
                  key={item.itemId}
                  className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 space-y-2"
                >
                  {/* Row 1: Image + Name/SKU + Delete */}
                  <div className="flex items-center gap-2">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-9 h-9 object-cover rounded-lg shrink-0" />
                    ) : (
                      <div className="w-9 h-9 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400 shrink-0">
                        {item.sku.slice(0, 3)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400 leading-tight truncate">{item.sku} / {item.barcode}</p>
                    </div>
                    <button
                      onClick={() => removeItem(item.itemId)}
                      className="text-red-400 hover:text-red-600 shrink-0 p-1 -mr-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Row 2: Qty | Price | Discount | Total */}
                  <div className="flex items-end gap-2">
                    {/* Quantity controls */}
                    <div className="shrink-0">
                      <p className="text-[10px] text-gray-400 mb-1">จำนวน</p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(item.itemId, item.quantity - 1)}
                          className="w-7 h-7 rounded bg-gray-200 flex items-center justify-center hover:bg-gray-300 active:bg-gray-400"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.quantity}
                          onChange={(e) => {
                            const v = parseInt(e.target.value.replace(/\D/g, '')) || 1;
                            updateQty(item.itemId, v);
                          }}
                          className="w-9 text-center text-sm border border-gray-300 rounded px-1 py-1"
                        />
                        <button
                          onClick={() => updateQty(item.itemId, item.quantity + 1)}
                          className="w-7 h-7 rounded bg-gray-200 flex items-center justify-center hover:bg-gray-300 active:bg-gray-400"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-gray-400 mb-1">ราคา (฿)</p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.price}
                        onKeyDown={numericKeyDown}
                        onChange={(e) => updatePrice(item.itemId, e.target.value)}
                        className="w-full text-right text-sm border border-gray-300 rounded px-2 py-1"
                        title="ราคา"
                      />
                    </div>

                    {/* Discount */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-gray-400 mb-1">ส่วนลด (฿)</p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.discountStr}
                        onKeyDown={numericKeyDown}
                        onChange={(e) => updateDiscount(item.itemId, e.target.value)}
                        className="w-full text-right text-sm border border-orange-200 bg-orange-50 rounded px-2 py-1 text-orange-700"
                        placeholder="0"
                      />
                    </div>

                    {/* Line total */}
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] text-gray-400 mb-1">รวม</p>
                      <p className="text-sm font-bold text-gray-900 py-1">
                        ฿{fmt(item.price * item.quantity - item.discount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="border-t pt-3 mt-3 space-y-1">
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>ยอดรวม (ก่อนส่วนลด)</span>
                <span>฿{fmt(grossSubtotal)}</span>
              </div>
            )}
            {totalItemDiscounts > 0 && (
              <div className="flex justify-between text-sm text-orange-500">
                <span>ส่วนลดรายการ</span>
                <span>-฿{fmt(totalItemDiscounts)}</span>
              </div>
            )}
            {billDiscountPct > 0 && (
              <div className="flex justify-between text-sm text-orange-600">
                <span>ส่วนลดบิล {billDiscountPct}%</span>
                <span>-฿{fmt(billDiscountAmt)}</span>
              </div>
            )}
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm font-semibold text-red-600 bg-red-50 rounded px-2 py-1">
                <span>รวมส่วนลดทั้งหมด</span>
                <span>-฿{fmt(totalDiscount)}</span>
              </div>
            )}
            {totalDiscount === 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>ยอดรวมย่อย</span>
                <span>฿{fmt(subtotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-1 border-t">
              <span>ยอดสุทธิ</span>
              <span>฿{fmt(total)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={saveBill}
              disabled={saving || cartItems.length === 0}
              className="btn-primary flex-1 py-2.5"
            >
              {saving ? 'กำลังบันทึก...' : editingBillId ? '💾 อัพเดทบิล' : '💾 บันทึกบิล'}
            </button>
            {editingBillId && (
              <button onClick={clearCart} className="btn-secondary px-4 py-2.5" title="ยกเลิกการแก้ไข">
                <X size={16} />
              </button>
            )}
          </div>

          {editingBillId && (
            <p className="text-xs text-orange-600 text-center mt-1">
              กำลังแก้ไขบิลที่มีอยู่ · กด X เพื่อยกเลิกและล้างตะกร้า
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
