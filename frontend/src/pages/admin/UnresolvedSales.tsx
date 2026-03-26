import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileWarning, Trash2, CheckCircle2, RefreshCw, CheckCircle, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';

// ─── BranchAutoInput ────────────────────────────────────────────────────────

const BranchAutoInput = ({
  defaultValue,
  onCommit,
}: {
  defaultValue: string;
  onCommit: (val: string) => void;
}) => {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  const { data: branches = [] } = useQuery<any[]>({
    queryKey: ['branches'],
    queryFn: async () => { const { data } = await client.get('/branches'); return data; },
    staleTime: 60_000,
  });

  const filtered = value.trim().length > 0
    ? branches
        .filter((b: any) =>
          b.name.toLowerCase().includes(value.toLowerCase()) ||
          b.code.toLowerCase().includes(value.toLowerCase())
        )
        .slice(0, 6)
    : [];

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full text-xs font-mono border rounded px-2 py-1.5 focus:ring-1 outline-none border-orange-200 focus:border-orange-400 bg-white"
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 150); onCommit(value); }}
        placeholder="รหัสสาขา"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 top-full mt-0.5 w-full min-w-max bg-white border border-gray-200 rounded shadow-lg text-xs max-h-40 overflow-y-auto">
          {filtered.map((b: any) => (
            <li
              key={b.id}
              onMouseDown={(e) => {
                e.preventDefault(); // keep input focused so onBlur doesn't fire yet
                setValue(b.name);
                setOpen(false);
                onCommit(b.name);
              }}
              className="px-2 py-1.5 cursor-pointer hover:bg-blue-50 flex justify-between gap-3"
            >
              <span className="font-medium text-gray-800 truncate">{b.name}</span>
              <span className="text-gray-400 shrink-0">{b.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ─── ItemAutoInput ───────────────────────────────────────────────────────────

const ItemAutoInput = ({
  defaultValue,
  onCommit,
}: {
  defaultValue: string;
  onCommit: (val: string) => void;
}) => {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (!q.trim()) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await client.get('/items', { params: { search: q, page: 1, limit: 6 } });
        setSuggestions(Array.isArray(data) ? data.slice(0, 6) : (data.items ?? []).slice(0, 6));
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full text-xs font-mono border rounded px-2 py-1.5 focus:ring-1 outline-none border-red-200 focus:border-red-400 bg-white"
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); search(e.target.value); }}
        onFocus={() => { setOpen(true); search(value); }}
        onBlur={() => { setTimeout(() => setOpen(false), 150); onCommit(value); }}
        placeholder="รหัส/บาร์โค้ด"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 top-full mt-0.5 w-56 bg-white border border-gray-200 rounded shadow-lg text-xs max-h-48 overflow-y-auto">
          {suggestions.map((item: any) => (
            <li
              key={item.id}
              onMouseDown={(e) => {
                e.preventDefault();
                setValue(item.barcode);
                setSuggestions([]);
                setOpen(false);
                onCommit(item.barcode);
              }}
              className="px-2 py-1.5 cursor-pointer hover:bg-blue-50"
            >
              <div className="font-medium text-gray-800 truncate">{item.name}</div>
              <div className="text-gray-400 font-mono">{item.barcode}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ─── UnresolvedSales ─────────────────────────────────────────────────────────

export const UnresolvedSales = () => {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // tracks which matched fields are in edit mode: `${id}-branch` | `${id}-item`
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());

  const startEdit = (key: string) => setEditingFields((s) => new Set(s).add(key));
  const stopEdit  = (key: string) => setEditingFields((s) => { const n = new Set(s); n.delete(key); return n; });

  const { data: records = [], isLoading, isRefetching } = useQuery({
    queryKey: ['unresolvedSales'],
    queryFn: async () => {
      const { data } = await client.post('/reports/unresolved-sales/auto-match');
      return data;
    }
  });

  const updateRawMutation = useMutation({
    mutationFn: async ({ id, rawBranch, rawItem }: { id: string; rawBranch?: string; rawItem?: string }) => {
      await client.put(`/reports/unresolved-sales/${id}`, { rawBranch, rawItem });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['unresolvedSales'] }),
    onError: () => toast.error('อัพเดทข้อมูลไม่สำเร็จ')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => client.delete(`/reports/unresolved-sales/${id}`),
    onSuccess: () => {
      toast.success('ลบข้อมูลทิ้งแล้ว');
      queryClient.invalidateQueries({ queryKey: ['unresolvedSales'] });
    }
  });

  const resolveMutation = useMutation({
    mutationFn: async (resolves: {id: string, branchId: string, itemId: string}[]) => {
      const { data } = await client.post('/reports/unresolved-sales/resolve', { resolves });
      return data;
    },
    onSuccess: (data) => {
      toast.success(`นำเข้าสำเร็จ ${data.imported} รายการ`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['unresolvedSales'] });
    },
    onError: () => toast.error('นำเข้าไม่สำเร็จ')
  });

  const readyRecords = records.filter((r: any) => r.match?.status === 'matched');
  const allReadyIds = readyRecords.map((r: any) => r.id);

  const toggleSelectAll = () => {
    if (selectedIds.size === readyRecords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allReadyIds));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleResolveSelected = () => {
    const resolves = records
      .filter((r: any) => selectedIds.has(r.id) && r.match?.status === 'matched')
      .map((r: any) => ({
        id: r.id,
        branchId: r.match.branchId,
        itemId: r.match.itemId
      }));
    if (resolves.length === 0) return;
    resolveMutation.mutate(resolves);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileWarning className="text-orange-600" size={24} />
          <h1 className="text-xl font-bold text-gray-800">ยอดขายตกหล่น (รอจัดการ)</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['unresolvedSales'] })}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={16} className={isRefetching ? 'animate-spin' : ''} /> รีเฟรชสถานะ
          </button>
          <button
            onClick={handleResolveSelected}
            disabled={selectedIds.size === 0 || resolveMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <CheckCircle2 size={16} /> นำเข้าช่องที่เลือก ({selectedIds.size})
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-gray-400 animate-pulse gap-3">
            <RefreshCw size={32} className="animate-spin text-blue-400" />
            <p>กำลังโหลดข้อมูล...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center text-green-500 mb-4 shadow-sm border border-green-100">
              <CheckCircle size={40} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">ยอดเยี่ยมมาก! ไม่มีข้อมูลตกหล่น</h3>
            <p className="text-gray-500 max-w-sm">
              ข้อมูลยอดขายทั้งหมดของคุณถูกจับคู่และนำเข้าเข้าระบบเรียบร้อยแล้ว ไม่มีรายการใดที่ต้องจัดการเพิ่มเติมในขณะนี้
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/80 border-b text-gray-700">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 pointer"
                      checked={readyRecords.length > 0 && selectedIds.size === readyRecords.length}
                      onChange={toggleSelectAll}
                      disabled={readyRecords.length === 0}
                    />
                  </th>
                  <th className="p-3">วันที่ / ไฟล์</th>
                  <th className="p-3">สาขา</th>
                  <th className="p-3 w-64">สินค้า (รหัส/บาร์โค้ด)</th>
                  <th className="p-3 text-right">จำนวน : ราคา</th>
                  <th className="p-3">สถานะ</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r: any) => {
                  const isReady = r.match?.status === 'matched';
                  return (
                    <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${isReady ? 'bg-green-50/30' : ''}`}>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          disabled={!isReady}
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{r.saleDate || r.rawDate || 'ไม่ระบุ'}</div>
                        <div className="text-xs text-gray-500 truncate w-32" title={r.fileName}>{r.fileName}</div>
                      </td>
                      <td className="p-3">
                        {isReady && r.match.branchId && !editingFields.has(r.id + '-branch') ? (
                          <div className="flex items-center gap-1 group">
                            <span className="font-medium text-green-700">{r.match.branchName}</span>
                            <button
                              onClick={() => startEdit(r.id + '-branch')}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-opacity p-0.5"
                              title="แก้ไข"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        ) : (
                          <BranchAutoInput
                            key={r.id + '-branch-' + (editingFields.has(r.id + '-branch') ? 'edit' : 'new')}
                            defaultValue={r.rawBranch}
                            onCommit={(val) => {
                              stopEdit(r.id + '-branch');
                              if (val !== r.rawBranch) {
                                updateRawMutation.mutate({ id: r.id, rawBranch: val });
                              }
                            }}
                          />
                        )}
                      </td>
                      <td className="p-3">
                        {isReady && r.match.itemId && !editingFields.has(r.id + '-item') ? (
                          <div className="flex items-start gap-1 group">
                            <div>
                              <div className="font-medium text-xs text-green-700 truncate w-52" title={r.match.itemName}>{r.match.itemName}</div>
                              <div className="text-gray-400 text-xs font-mono">{r.match.itemSku || r.match.itemBarcode}</div>
                            </div>
                            <button
                              onClick={() => startEdit(r.id + '-item')}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-opacity p-0.5 mt-0.5 shrink-0"
                              title="แก้ไข"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        ) : (
                          <ItemAutoInput
                            key={r.id + '-item-' + (editingFields.has(r.id + '-item') ? 'edit' : 'new')}
                            defaultValue={r.rawItem}
                            onCommit={(val) => {
                              stopEdit(r.id + '-item');
                              if (val !== r.rawItem) {
                                updateRawMutation.mutate({ id: r.id, rawItem: val });
                              }
                            }}
                          />
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <span className="font-bold">{r.qty}</span> <span className="text-gray-400 mx-1">x</span> {r.price}
                      </td>
                      <td className="p-3">
                        {isReady ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                            <CheckCircle2 size={14} /> พร้อมนำเข้า
                          </span>
                        ) : (
                          <div className="text-xs text-red-500 flex flex-col gap-0.5">
                            {r.match?.errors?.map((err: string, i: number) => (
                              <span key={i}>• {err}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => {
                            if (confirm('คุณต้องการลบข้อมูลตกหล่นรายการนี้ทิ้งถาวรหรือไม่?')) {
                              deleteMutation.mutate(r.id);
                            }
                          }}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="ลบทิ้ง"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
