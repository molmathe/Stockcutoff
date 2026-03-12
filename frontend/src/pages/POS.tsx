import React, { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Camera, Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, X } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import BarcodeScanner from '../components/BarcodeScanner';
import type { Item, Branch } from '../types';

interface CartItem {
  itemId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  price: number;
  discount: number;
}

export default function POS() {
  const { user } = useAuth();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [notes, setNotes] = useState('');
  const [billDiscount, setBillDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(user?.branchId || '');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role !== 'CASHIER';

  useEffect(() => {
    if (isAdmin) {
      client.get('/branches').then((r) => setBranches(r.data)).catch(() => {});
    }
    inputRef.current?.focus();
  }, []);

  const lookupBarcode = useCallback(async (code: string) => {
    if (!code.trim()) return;
    try {
      const { data: item } = await client.get<Item>(`/items/barcode/${code.trim()}`);
      addToCart(item);
      setBarcodeInput('');
    } catch {
      toast.error(`Item not found: ${code}`);
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
        imageUrl: item.imageUrl,
        quantity: 1,
        price: parseFloat(item.defaultPrice),
        discount: 0,
      }];
    });
    toast.success(`Added: ${item.name}`, { duration: 1500, icon: '✅' });
  };

  const updateItem = (itemId: string, field: 'quantity' | 'price' | 'discount', value: number) => {
    setCartItems((prev) => prev.map((c) => {
      if (c.itemId !== itemId) return c;
      const updated = { ...c, [field]: Math.max(0, value) };
      if (field === 'quantity' && updated.quantity === 0) return c; // handled by remove
      return updated;
    }));
  };

  const removeItem = (itemId: string) => setCartItems((prev) => prev.filter((c) => c.itemId !== itemId));

  const subtotal = cartItems.reduce((s, c) => s + c.price * c.quantity - c.discount, 0);
  const total = Math.max(0, subtotal - billDiscount);

  const saveBill = async () => {
    if (cartItems.length === 0) { toast.error('Cart is empty'); return; }
    const branchId = selectedBranch || user?.branchId;
    if (!branchId) { toast.error('Please select a branch'); return; }
    setSaving(true);
    try {
      const { data } = await client.post('/bills', {
        branchId,
        discount: billDiscount,
        notes,
        items: cartItems.map((c) => ({ itemId: c.itemId, quantity: c.quantity, price: c.price, discount: c.discount })),
      });
      setLastSaved(data.billNumber);
      setCartItems([]);
      setBillDiscount(0);
      setNotes('');
      toast.success(`Bill saved: ${data.billNumber}`);
    } catch {
      toast.error('Failed to save bill');
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  const submitDay = async () => {
    const branchId = selectedBranch || user?.branchId;
    setSubmitting(true);
    try {
      const { data } = await client.post('/bills/submit-day', { branchId });
      toast.success(`${data.count} bills submitted for end of day!`);
    } catch {
      toast.error('Failed to submit bills');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {scanning && <BarcodeScanner onScan={lookupBarcode} onClose={() => { setScanning(false); inputRef.current?.focus(); }} />}

      {/* Left: Scanner + Info */}
      <div className="lg:w-1/2 space-y-4">
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <ShoppingCart size={18} /> Point of Sale
          </h2>

          {isAdmin && (
            <div className="mb-3">
              <label className="label">Branch</label>
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="input">
                <option value="">-- Select Branch --</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
          )}

          <label className="label">Scan / Enter Barcode</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupBarcode(barcodeInput); } }}
              className="input flex-1"
              placeholder="Scan barcode or type and press Enter…"
              autoComplete="off"
            />
            <button onClick={() => lookupBarcode(barcodeInput)} className="btn-primary px-3">
              <Search size={18} />
            </button>
            <button onClick={() => setScanning(true)} className="btn-secondary px-3" title="Camera Scan">
              <Camera size={18} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">USB scanner will auto-submit on Enter key</p>
        </div>

        {lastSaved && (
          <div className="card border-green-200 bg-green-50 flex items-center gap-3">
            <CheckCircle className="text-green-600 shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-green-700">Bill saved successfully</p>
              <p className="text-xs text-green-600">{lastSaved}</p>
            </div>
            <button onClick={() => setLastSaved(null)} className="ml-auto text-green-400 hover:text-green-600">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-700">Bill Options</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bill Discount</label>
              <input
                type="number"
                min="0"
                value={billDiscount}
                onChange={(e) => setBillDiscount(Number(e.target.value))}
                className="input"
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                placeholder="Optional notes"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="lg:w-1/2 flex flex-col">
        <div className="card flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">Cart ({cartItems.length} items)</h3>
            {cartItems.length > 0 && (
              <button onClick={() => setCartItems([])} className="text-xs text-red-500 hover:text-red-700">
                Clear all
              </button>
            )}
          </div>

          {cartItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-300">
              <div className="text-center">
                <ShoppingCart size={48} className="mx-auto mb-2" />
                <p className="text-sm">Scan items to add to cart</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {cartItems.map((item) => (
                <div key={item.itemId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-10 h-10 object-cover rounded-lg" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400">
                      {item.sku.slice(0, 3)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.sku}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => item.quantity > 1 ? updateItem(item.itemId, 'quantity', item.quantity - 1) : removeItem(item.itemId)}
                      className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center hover:bg-gray-300">
                      <Minus size={12} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.itemId, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-10 text-center text-sm border border-gray-300 rounded px-1 py-0.5"
                    />
                    <button onClick={() => updateItem(item.itemId, 'quantity', item.quantity + 1)}
                      className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center hover:bg-gray-300">
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="flex flex-col items-end gap-1 w-20">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => updateItem(item.itemId, 'price', parseFloat(e.target.value) || 0)}
                      className="w-full text-right text-sm border border-gray-300 rounded px-1 py-0.5"
                      title="Price"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.discount}
                      onChange={(e) => updateItem(item.itemId, 'discount', parseFloat(e.target.value) || 0)}
                      className="w-full text-right text-xs border border-orange-200 bg-orange-50 rounded px-1 py-0.5 text-orange-700"
                      title="Item Discount"
                    />
                  </div>
                  <p className="text-sm font-semibold w-16 text-right">
                    {(item.price * item.quantity - item.discount).toFixed(2)}
                  </p>
                  <button onClick={() => removeItem(item.itemId)} className="text-red-400 hover:text-red-600 shrink-0">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="border-t pt-3 mt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span><span>{subtotal.toFixed(2)}</span>
            </div>
            {billDiscount > 0 && (
              <div className="flex justify-between text-sm text-orange-600">
                <span>Bill Discount</span><span>-{billDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-1 border-t">
              <span>Total</span><span>{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button onClick={saveBill} disabled={saving || cartItems.length === 0} className="btn-primary flex-1 py-2.5">
              {saving ? 'Saving…' : '💾 Save Bill'}
            </button>
            <button onClick={submitDay} disabled={submitting} className="btn-success px-4 py-2.5" title="Submit all today's bills">
              {submitting ? '…' : '✅ End of Day'}
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center mt-1">
            "End of Day" submits all open bills for today
          </p>
        </div>
      </div>
    </div>
  );
}
