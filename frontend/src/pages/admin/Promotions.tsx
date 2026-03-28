import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Trash2, Plus, Tag } from 'lucide-react';
import client from '../../api/client';

interface Promotion {
  id: string;
  name: string;
  buyQty: number;
  freeQty: number;
  active: boolean;
  createdAt: string;
}

export default function Promotions() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [name, setName] = useState('');
  const [buyQty, setBuyQty] = useState('1');
  const [freeQty, setFreeQty] = useState('1');
  const [active, setActive] = useState(true);

  const { data: promotions = [], isLoading } = useQuery<Promotion[]>({
    queryKey: ['promotions'],
    queryFn: () => client.get('/promotions').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (body: object) =>
      editing
        ? client.put(`/promotions/${editing.id}`, body)
        : client.post('/promotions', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] });
      setShowModal(false);
      toast.success(editing ? 'อัพเดทโปรโมชั่นเรียบร้อย' : 'เพิ่มโปรโมชั่นเรียบร้อย');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'บันทึกไม่สำเร็จ'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => client.delete(`/promotions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promotions'] }); toast.success('ลบเรียบร้อย'); },
    onError: () => toast.error('ลบไม่สำเร็จ'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      client.put(`/promotions/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
    onError: () => toast.error('อัพเดทไม่สำเร็จ'),
  });

  const openAdd = () => {
    setEditing(null);
    setName('');
    setBuyQty('1');
    setFreeQty('1');
    setActive(true);
    setShowModal(true);
  };

  const openEdit = (p: Promotion) => {
    setEditing(p);
    setName(p.name);
    setBuyQty(String(p.buyQty));
    setFreeQty(String(p.freeQty));
    setActive(p.active);
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ name, buyQty: parseInt(buyQty), freeQty: parseInt(freeQty), active });
  };

  const handleDelete = (p: Promotion) => {
    if (!confirm(`ลบโปรโมชั่น "${p.name}"?`)) return;
    deleteMutation.mutate(p.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-800">จัดการโปรโมชั่น</h1>
        <button onClick={openAdd} className="btn-primary flex items-center gap-1.5">
          <Plus size={16} /> เพิ่มโปรโมชั่น
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">ชื่อโปรโมชั่น</th>
              <th className="table-header text-center">ซื้อ (ชิ้น)</th>
              <th className="table-header text-center">ฟรี (ชิ้น)</th>
              <th className="table-header text-center">ตัวอย่าง</th>
              <th className="table-header text-center">สถานะ</th>
              <th className="table-header text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>
            ) : promotions.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">ยังไม่มีโปรโมชั่น</td></tr>
            ) : promotions.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="table-cell font-medium flex items-center gap-2">
                  <Tag size={14} className="text-green-600 shrink-0" />
                  {p.name}
                </td>
                <td className="table-cell text-center font-bold text-blue-700">{p.buyQty}</td>
                <td className="table-cell text-center font-bold text-green-600">{p.freeQty}</td>
                <td className="table-cell text-center text-sm text-gray-500">
                  ซื้อ {p.buyQty} แถม {p.freeQty} · ทุก {p.buyQty + p.freeQty} ชิ้น
                </td>
                <td className="table-cell text-center">
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: p.id, active: !p.active })}
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                      p.active
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {p.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                  </button>
                </td>
                <td className="table-cell text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(p)} className="text-blue-500 hover:text-blue-700 p-1">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(p)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {editing ? 'แก้ไขโปรโมชั่น' : 'เพิ่มโปรโมชั่น'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="label">ชื่อโปรโมชั่น *</label>
                <input
                  required autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="เช่น ซื้อ 3 แถม 1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ซื้อ (ชิ้น) *</label>
                  <input
                    required type="number" min="1"
                    value={buyQty}
                    onChange={(e) => setBuyQty(e.target.value)}
                    className="input text-center"
                  />
                </div>
                <div>
                  <label className="label">แถมฟรี (ชิ้น) *</label>
                  <input
                    required type="number" min="1"
                    value={freeQty}
                    onChange={(e) => setFreeQty(e.target.value)}
                    className="input text-center"
                  />
                </div>
              </div>
              {buyQty && freeQty && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                  ซื้อ {buyQty} ชิ้น แถม {freeQty} ชิ้นฟรี · ทุก {parseInt(buyQty) + parseInt(freeQty)} ชิ้น
                </div>
              )}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox" id="active-toggle"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="active-toggle" className="text-sm text-gray-700">เปิดใช้งาน</label>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary flex-1">
                  {saveMutation.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
