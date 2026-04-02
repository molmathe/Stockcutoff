import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { FileText, ChevronDown, ChevronUp, X, Pencil, Plus, Trash2 } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { Bill, Branch } from '../types';

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    OPEN: 'badge bg-yellow-100 text-yellow-700',
    SUBMITTED: 'badge bg-green-100 text-green-700',
    CANCELLED: 'badge bg-red-100 text-red-700',
  };
  return map[s] || 'badge bg-gray-100 text-gray-600';
};

const statusLabel: Record<string, string> = {
  OPEN: 'เปิด',
  SUBMITTED: 'ส่งแล้ว',
  CANCELLED: 'ยกเลิก',
};

interface EditItem {
  itemId: string;
  barcode: string;
  sku: string;
  name: string;
  quantity: number;
  price: number;
  discount: number;
}

interface EditState {
  billId: string;
  billNumber: string;
  notes: string;
  discount: number;
  items: EditItem[];
}

export default function Bills() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [barcodeSearching, setBarcodeSearching] = useState<Record<number, boolean>>({});

  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultFilters = { startDate: today, endDate: today, status: '', branchId: '' };
  const [filters, setFilters] = useState(defaultFilters);
  const [searchParams, setSearchParams] = useState(defaultFilters);

  const isAdmin = user?.role !== 'CASHIER';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => client.get('/branches').then((r) => r.data),
    enabled: isAdmin,
  });

  const { data: bills = [], isLoading: loading } = useQuery<Bill[]>({
    queryKey: ['bills', searchParams],
    queryFn: () => {
      const params: any = {};
      if (searchParams.startDate) params.startDate = searchParams.startDate;
      if (searchParams.endDate) params.endDate = searchParams.endDate;
      if (searchParams.status) params.status = searchParams.status;
      if (searchParams.branchId) params.branchId = searchParams.branchId;
      return client.get('/bills', { params }).then((r) => r.data);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => client.put(`/bills/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }); toast.success('ยกเลิกบิลเรียบร้อย'); },
    onError: () => toast.error('ยกเลิกบิลไม่สำเร็จ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.delete(`/bills/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }); toast.success('ลบบิลเรียบร้อย'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'ลบบิลไม่สำเร็จ'),
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; items: any[]; notes: string; discount: number }) =>
      client.put(`/bills/${data.id}`, { items: data.items, notes: data.notes, discount: data.discount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bills'] });
      toast.success('บันทึกการแก้ไขเรียบร้อย');
      setEditState(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'แก้ไขบิลไม่สำเร็จ'),
  });


  const openEditModal = (bill: Bill) => {
    setEditState({
      billId: bill.id,
      billNumber: bill.billNumber,
      notes: bill.notes || '',
      discount: Number(bill.discount),
      items: bill.items.map((bi) => ({
        itemId: bi.item?.id ?? bi.itemId,
        barcode: bi.item?.barcode ?? '',
        sku: bi.item?.sku ?? '',
        name: bi.item?.name ?? '',
        quantity: bi.quantity,
        price: Number(bi.price),
        discount: Number(bi.discount),
      })),
    });
  };

  const lookupBarcode = async (idx: number, barcode: string) => {
    if (!barcode.trim()) return;
    setBarcodeSearching((s) => ({ ...s, [idx]: true }));
    try {
      const r = await client.get(`/items/barcode/${encodeURIComponent(barcode.trim())}`);
      const item = r.data;
      setEditState((prev) => {
        if (!prev) return prev;
        const items = [...prev.items];
        items[idx] = { ...items[idx], itemId: item.id, barcode: item.barcode, sku: item.sku, name: item.name, price: Number(item.defaultPrice) };
        return { ...prev, items };
      });
    } catch {
      toast.error('ไม่พบสินค้า');
    } finally {
      setBarcodeSearching((s) => ({ ...s, [idx]: false }));
    }
  };

  const updateItem = (idx: number, field: keyof EditItem, value: any) => {
    setEditState((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  };

  const addItem = () => {
    setEditState((prev) => {
      if (!prev) return prev;
      return { ...prev, items: [...prev.items, { itemId: '', barcode: '', sku: '', name: '', quantity: 1, price: 0, discount: 0 }] };
    });
  };

  const removeItem = (idx: number) => {
    setEditState((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter((_, i) => i !== idx) };
    });
  };

  const saveEdit = () => {
    if (!editState) return;
    const invalid = editState.items.some((it) => !it.itemId);
    if (invalid) { toast.error('กรุณาค้นหาสินค้าให้ครบทุกรายการ'); return; }
    editMutation.mutate({
      id: editState.billId,
      items: editState.items.map((it) => ({ itemId: it.itemId, quantity: it.quantity, price: it.price, discount: it.discount })),
      notes: editState.notes,
      discount: editState.discount,
    });
  };

  const editSubtotal = editState?.items.reduce((s, it) => s + it.price * it.quantity - it.discount, 0) ?? 0;
  const editTotal = Math.max(0, editSubtotal - (editState?.discount ?? 0));

  const totalRevenue = bills.filter((b) => b.status === 'SUBMITTED').reduce((s, b) => s + Number(b.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-800">รายการบิล</h1>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">ตั้งแต่วันที่</label>
            <input type="date" value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">ถึงวันที่</label>
            <input type="date" value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">สถานะ</label>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="input">
              <option value="">ทั้งหมด</option>
              <option value="OPEN">เปิด</option>
              <option value="SUBMITTED">ส่งแล้ว</option>
              <option value="CANCELLED">ยกเลิก</option>
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="label">สาขา</label>
              <select value={filters.branchId} onChange={(e) => setFilters((f) => ({ ...f, branchId: e.target.value }))} className="input">
                <option value="">ทุกสาขา</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => setSearchParams({ ...filters })} className="btn-primary">ค้นหา</button>
          <button onClick={() => { setFilters(defaultFilters); setSearchParams(defaultFilters); }} className="btn-secondary">รีเซ็ต</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'บิลทั้งหมด', value: bills.length },
          { label: 'ส่งแล้ว', value: bills.filter((b) => b.status === 'SUBMITTED').length },
          { label: 'รายได้รวม', value: `฿${totalRevenue.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` },
        ].map((s) => (
          <div key={s.label} className="card text-center py-3">
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Bills list */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : bills.length === 0 ? (
          <div className="p-8 text-center text-gray-400">ไม่พบบิล</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {bills.map((bill) => (
              <div key={bill.id}>
                <div
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === bill.id ? null : bill.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{bill.billNumber}</span>
                      <span className={statusBadge(bill.status)}>{statusLabel[bill.status] || bill.status}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {bill.branch.name} • {bill.user.name} • {format(new Date(bill.createdAt), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">฿{Number(bill.total).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                    <p className="text-xs text-gray-400">{bill.items.length} รายการ</p>
                  </div>
                  {(bill.status === 'OPEN' || (isSuperAdmin && bill.status === 'SUBMITTED')) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm(`ยืนยันการยกเลิกบิล ${bill.billNumber}?\n\nบิลจะถูกบันทึกเป็น "ยกเลิก" และไม่สามารถย้อนกลับได้`)) return;
                        cancelMutation.mutate(bill.id);
                      }}
                      className="text-red-400 hover:text-red-600 shrink-0" title="ยกเลิกบิล">
                      <X size={16} />
                    </button>
                  )}
                  {isSuperAdmin && (bill.status === 'OPEN' || bill.status === 'SUBMITTED') && (
                    <button onClick={(e) => { e.stopPropagation(); openEditModal(bill); }}
                      className="text-blue-400 hover:text-blue-600 shrink-0" title="แก้ไขบิล">
                      <Pencil size={15} />
                    </button>
                  )}
                  {isSuperAdmin && (bill.status === 'SUBMITTED' || bill.status === 'CANCELLED') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm(`ยืนยันการลบบิล ${bill.billNumber}?\n\nบิลจะถูกลบถาวรและไม่สามารถกู้คืนได้`)) return;
                        deleteMutation.mutate(bill.id);
                      }}
                      className="text-red-500 hover:text-red-700 shrink-0" title="ลบบิลถาวร">
                      <Trash2 size={15} />
                    </button>
                  )}
                  {expanded === bill.id ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
                </div>

                {expanded === bill.id && (
                  <div className="px-4 pb-4 bg-gray-50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b">
                          <th className="text-left py-2">สินค้า</th>
                          <th className="text-right py-2">จำนวน</th>
                          <th className="text-right py-2">ราคา/หน่วย</th>
                          <th className="text-right py-2">ส่วนลดรายการ</th>
                          {Number(bill.discountPct) > 0 && <th className="text-right py-2">ส่วนลดบิล ({Number(bill.discountPct).toFixed(0)}%)</th>}
                          <th className="text-right py-2">ราคาสุทธิ/หน่วย</th>
                          <th className="text-right py-2">รวม</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bill.items.map((bi) => {
                          const globalDisc = Number(bi.globalDiscount ?? 0);
                          const manualDisc = Number(bi.discount);
                          const netUnitPrice = bi.quantity > 0
                            ? Math.round((Number(bi.subtotal) / bi.quantity) * 100) / 100
                            : 0;
                          return (
                          <tr key={bi.id} className="border-b border-gray-100">
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                {bi.item?.imageUrl ? (
                                  <img src={bi.item.imageUrl} alt={bi.item.name} className="w-8 h-8 object-cover rounded shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center text-[9px] text-gray-400 shrink-0">
                                    {(bi.item?.sku ?? '?').slice(0, 3)}
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium">{bi.item?.name ?? '—'}</p>
                                  <p className="text-[10px] text-gray-400 leading-tight">{bi.item?.sku ?? ''}{bi.item?.barcode ? ` / ${bi.item.barcode}` : ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="text-right py-2">{bi.quantity}</td>
                            <td className="text-right py-2">฿{Number(bi.price).toFixed(2)}</td>
                            <td className="text-right py-2 text-orange-600">{manualDisc > 0 ? `-฿${manualDisc.toFixed(2)}` : '-'}</td>
                            {Number(bill.discountPct) > 0 && (
                              <td className="text-right py-2 text-purple-600">{globalDisc > 0 ? `-฿${globalDisc.toFixed(2)}` : '-'}</td>
                            )}
                            <td className="text-right py-2 text-blue-700 font-medium">฿{netUnitPrice.toFixed(2)}</td>
                            <td className="text-right py-2 font-medium">฿{Number(bi.subtotal).toFixed(2)}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={Number(bill.discountPct) > 0 ? 6 : 5} className="text-right py-2 font-medium text-gray-500 pr-2">ยอดรวมก่อนหักส่วนลดบิล</td>
                          <td className="text-right py-2 font-medium">฿{Number(bill.subtotal).toFixed(2)}</td>
                        </tr>
                        {Number(bill.discount) > 0 && (
                          <tr>
                            <td colSpan={Number(bill.discountPct) > 0 ? 6 : 5} className="text-right py-1 text-purple-600 pr-2">
                              ส่วนลดบิลรวม{Number(bill.discountPct) > 0 ? ` (${Number(bill.discountPct).toFixed(0)}% กระจายแล้ว)` : ''}
                            </td>
                            <td className="text-right py-1 text-purple-600">-฿{Number(bill.discount).toFixed(2)}</td>
                          </tr>
                        )}
                        <tr className="border-t">
                          <td colSpan={Number(bill.discountPct) > 0 ? 6 : 5} className="text-right py-2 font-bold pr-2">ยอดสุทธิ</td>
                          <td className="text-right py-2 font-bold text-blue-600">฿{Number(bill.total).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {bill.notes && <p className="text-xs text-gray-500 mt-2">หมายเหตุ: {bill.notes}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Bill Modal */}
      {editState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-800">แก้ไขบิล</h2>
                <p className="text-xs text-gray-400">{editState.billNumber}</p>
              </div>
              <button onClick={() => setEditState(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">รายการสินค้า</p>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                    <Plus size={13} /> เพิ่มรายการ
                  </button>
                </div>
                <div className="space-y-2">
                  {editState.items.map((it, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="grid grid-cols-12 gap-2 items-start">
                        {/* Barcode */}
                        <div className="col-span-12 sm:col-span-4">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">บาร์โค้ด / SKU</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={it.barcode}
                              onChange={(e) => updateItem(idx, 'barcode', e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') lookupBarcode(idx, it.barcode); }}
                              placeholder="สแกนหรือพิมพ์บาร์โค้ด"
                              className="input text-xs flex-1 min-w-0"
                            />
                            <button
                              onClick={() => lookupBarcode(idx, it.barcode)}
                              disabled={barcodeSearching[idx]}
                              className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 shrink-0"
                            >
                              {barcodeSearching[idx] ? '...' : 'ค้น'}
                            </button>
                          </div>
                          {it.name && <p className="text-[10px] text-green-600 mt-0.5 truncate">{it.name} {it.sku ? `(${it.sku})` : ''}</p>}
                          {!it.name && it.itemId === '' && <p className="text-[10px] text-red-400 mt-0.5">ยังไม่ได้เลือกสินค้า</p>}
                        </div>
                        {/* Qty */}
                        <div className="col-span-4 sm:col-span-2">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">จำนวน</label>
                          <input type="number" min={1} value={it.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            className="input text-xs" />
                        </div>
                        {/* Price */}
                        <div className="col-span-4 sm:col-span-3">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">ราคา (฿)</label>
                          <input type="number" min={0} step="0.01" value={it.price}
                            onChange={(e) => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                            className="input text-xs" />
                        </div>
                        {/* Discount */}
                        <div className="col-span-3 sm:col-span-2">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">ส่วนลด (฿)</label>
                          <input type="number" min={0} step="0.01" value={it.discount}
                            onChange={(e) => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)}
                            className="input text-xs" />
                        </div>
                        {/* Remove */}
                        <div className="col-span-1 flex items-end pb-1">
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500 mt-1">
                        รวม: <span className="font-medium text-gray-800">฿{(it.price * it.quantity - it.discount).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bill discount & notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ส่วนลดบิล (฿)</label>
                  <input type="number" min={0} step="0.01" value={editState.discount}
                    onChange={(e) => setEditState((s) => s ? { ...s, discount: parseFloat(e.target.value) || 0 } : s)}
                    className="input" />
                </div>
                <div>
                  <label className="label">หมายเหตุ</label>
                  <input type="text" value={editState.notes}
                    onChange={(e) => setEditState((s) => s ? { ...s, notes: e.target.value } : s)}
                    className="input" />
                </div>
              </div>

              {/* Total summary */}
              <div className="bg-blue-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>ยอดรวมสินค้า</span><span>฿{editSubtotal.toFixed(2)}</span>
                </div>
                {editState.discount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>ส่วนลดบิล</span><span>-฿{editState.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-blue-700 text-base mt-1 pt-1 border-t border-blue-200">
                  <span>ยอดสุทธิ</span><span>฿{editTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
              <button onClick={() => setEditState(null)} className="btn-secondary">ยกเลิก</button>
              <button onClick={saveEdit} disabled={editMutation.isPending} className="btn-primary">
                {editMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
