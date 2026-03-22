import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ClipboardList, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import client from '../../api/client';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail?: Record<string, any>;
  ip?: string;
  createdAt: string;
  user: { id: string; name: string; username: string; role: string };
}

interface BillItemSnapshot {
  name: string;
  sku: string;
  barcode: string;
  quantity: number;
  price: number;
  discount: number;
  subtotal: number;
}

const actionLabel: Record<string, string> = {
  CREATE_BILL: 'สร้างบิล',
  EDIT_BILL: 'แก้ไขบิล',
  CANCEL_BILL: 'ยกเลิกบิล',
  SUBMIT_DAY: 'ปิดวัน',
  LOGIN: 'เข้าสู่ระบบ',
  POS_LOGIN: 'เข้าสู่ระบบ POS',
};

const actionColor: Record<string, string> = {
  CREATE_BILL: 'bg-blue-100 text-blue-700',
  EDIT_BILL: 'bg-yellow-100 text-yellow-700',
  CANCEL_BILL: 'bg-red-100 text-red-700',
  SUBMIT_DAY: 'bg-green-100 text-green-700',
  LOGIN: 'bg-gray-100 text-gray-600',
  POS_LOGIN: 'bg-purple-100 text-purple-700',
};

const fmt = (n: number) => `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

function ItemsTable({ items, title, color }: { items: BillItemSnapshot[]; title: string; color: string }) {
  return (
    <div>
      <p className={`text-xs font-semibold mb-1 ${color}`}>{title}</p>
      <table className="w-full text-xs border border-gray-200 rounded overflow-hidden">
        <thead className="bg-gray-100">
          <tr>
            <th className="text-left px-2 py-1 text-gray-500">สินค้า</th>
            <th className="text-left px-2 py-1 text-gray-500">SKU / บาร์โค้ด</th>
            <th className="text-right px-2 py-1 text-gray-500">จำนวน</th>
            <th className="text-right px-2 py-1 text-gray-500">ราคา</th>
            <th className="text-right px-2 py-1 text-gray-500">ส่วนลด</th>
            <th className="text-right px-2 py-1 text-gray-500">รวม</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {items.map((it, i) => (
            <tr key={i}>
              <td className="px-2 py-1 font-medium">{it.name || '—'}</td>
              <td className="px-2 py-1 text-gray-400">{it.sku}{it.barcode ? ` / ${it.barcode}` : ''}</td>
              <td className="px-2 py-1 text-right">{it.quantity}</td>
              <td className="px-2 py-1 text-right">{fmt(it.price)}</td>
              <td className="px-2 py-1 text-right text-orange-500">{it.discount > 0 ? `-${fmt(it.discount)}` : '—'}</td>
              <td className="px-2 py-1 text-right font-medium">{fmt(it.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({ log }: { log: AuditLog }) {
  const d = log.detail;
  if (!d) return <p className="text-xs text-gray-400">ไม่มีรายละเอียด</p>;

  if (log.action === 'EDIT_BILL' && d.before && d.after) {
    const before = d.before;
    const after = d.after;
    const changedTotal = before.total !== after.total;
    const changedNotes = before.notes !== after.notes;
    const changedDiscount = before.discount !== after.discount;
    return (
      <div className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-gray-50 rounded p-2">
            <p className="text-gray-400 mb-0.5">บิล</p>
            <p className="font-semibold">{d.billNumber}</p>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <p className="text-gray-400 mb-0.5">สถานะก่อน</p>
            <p className="font-semibold">{before.status}</p>
          </div>
          <div className={`rounded p-2 ${changedTotal ? 'bg-yellow-50' : 'bg-gray-50'}`}>
            <p className="text-gray-400 mb-0.5">ยอดสุทธิ</p>
            <p className="font-semibold flex items-center gap-1">
              {changedTotal ? (
                <><span className="line-through text-gray-400">{fmt(before.total)}</span><ArrowRight size={10} /><span className="text-yellow-700">{fmt(after.total)}</span></>
              ) : fmt(before.total)}
            </p>
          </div>
        </div>
        {(changedDiscount || changedNotes) && (
          <div className="grid grid-cols-2 gap-3 text-xs">
            {changedDiscount && (
              <div className="bg-yellow-50 rounded p-2">
                <p className="text-gray-400 mb-0.5">ส่วนลดบิล</p>
                <p className="flex items-center gap-1">
                  <span className="line-through text-gray-400">{fmt(before.discount)}</span>
                  <ArrowRight size={10} />
                  <span className="text-yellow-700 font-medium">{fmt(after.discount)}</span>
                </p>
              </div>
            )}
            {changedNotes && (
              <div className="bg-yellow-50 rounded p-2">
                <p className="text-gray-400 mb-0.5">หมายเหตุ</p>
                <p className="flex items-center gap-1">
                  <span className="line-through text-gray-400">{before.notes || '—'}</span>
                  <ArrowRight size={10} />
                  <span className="text-yellow-700 font-medium">{after.notes || '—'}</span>
                </p>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ItemsTable items={before.items} title="ก่อนแก้ไข" color="text-red-500" />
          <ItemsTable items={after.items} title="หลังแก้ไข" color="text-green-600" />
        </div>
      </div>
    );
  }

  if (log.action === 'CREATE_BILL') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {[
          { label: 'บิล', value: d.billNumber },
          { label: 'จำนวนรายการ', value: `${d.itemCount} รายการ` },
          { label: 'ยอดก่อนส่วนลด', value: fmt(d.subtotal) },
          { label: 'ส่วนลด', value: fmt(d.discount) },
          { label: 'ยอดสุทธิ', value: fmt(d.total) },
        ].map((r) => (
          <div key={r.label} className="bg-gray-50 rounded p-2">
            <p className="text-gray-400">{r.label}</p>
            <p className="font-semibold mt-0.5">{r.value ?? '—'}</p>
          </div>
        ))}
      </div>
    );
  }

  if (log.action === 'CANCEL_BILL') {
    return (
      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          { label: 'บิล', value: d.billNumber },
          { label: 'สถานะเดิม', value: d.status },
          { label: 'ยอดสุทธิ', value: fmt(d.total) },
        ].map((r) => (
          <div key={r.label} className="bg-red-50 rounded p-2">
            <p className="text-gray-400">{r.label}</p>
            <p className="font-semibold mt-0.5 text-red-700">{r.value ?? '—'}</p>
          </div>
        ))}
      </div>
    );
  }

  if (log.action === 'SUBMIT_DAY') {
    return (
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          { label: 'จำนวนบิล', value: `${d.count} บิล` },
          { label: 'สาขา', value: d.branchId || '—' },
        ].map((r) => (
          <div key={r.label} className="bg-green-50 rounded p-2">
            <p className="text-gray-400">{r.label}</p>
            <p className="font-semibold mt-0.5 text-green-700">{r.value}</p>
          </div>
        ))}
      </div>
    );
  }

  // Fallback: raw JSON
  return (
    <pre className="text-[11px] text-gray-500 bg-gray-50 rounded p-3 overflow-x-auto whitespace-pre-wrap">
      {JSON.stringify(d, null, 2)}
    </pre>
  );
}

const todayStr = format(new Date(), 'yyyy-MM-dd');

export default function AuditLogs() {
  const [filters, setFilters] = useState({ startDate: todayStr, endDate: todayStr, action: '', userId: '' });
  const [searchParams, setSearchParams] = useState({ startDate: todayStr, endDate: todayStr, action: '', userId: '' });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ total: number; page: number; limit: number; logs: AuditLog[] }>({
    queryKey: ['audit-logs', searchParams, page],
    queryFn: () => {
      const params: any = { page, limit: 50 };
      if (searchParams.startDate) params.startDate = searchParams.startDate;
      if (searchParams.endDate) params.endDate = searchParams.endDate;
      if (searchParams.action) params.action = searchParams.action;
      if (searchParams.userId) params.userId = searchParams.userId;
      return client.get('/audit-logs', { params }).then((r) => r.data);
    },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const handleSearch = () => { setSearchParams({ ...filters }); setPage(1); setExpanded(null); };
  const handleReset = () => {
    const d = { startDate: todayStr, endDate: todayStr, action: '', userId: '' };
    setFilters(d); setSearchParams(d); setPage(1); setExpanded(null);
  };

  const toggle = (id: string) => setExpanded((prev) => prev === id ? null : id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold text-gray-800">ประวัติการใช้งาน (Audit Log)</h1>
        <span className="text-xs text-gray-400 ml-1">เก็บข้อมูลนาน 1,000 วัน</span>
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
            <label className="label">การกระทำ</label>
            <select value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))} className="input">
              <option value="">ทั้งหมด</option>
              <option value="CREATE_BILL">สร้างบิล</option>
              <option value="EDIT_BILL">แก้ไขบิล</option>
              <option value="CANCEL_BILL">ยกเลิกบิล</option>
              <option value="SUBMIT_DAY">ปิดวัน</option>
              <option value="LOGIN">เข้าสู่ระบบ</option>
              <option value="POS_LOGIN">เข้าสู่ระบบ POS</option>
            </select>
          </div>
          <div>
            <label className="label">User ID</label>
            <input type="text" value={filters.userId} placeholder="ระบุ User ID..."
              onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} className="input" />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSearch} className="btn-primary">ค้นหา</button>
          <button onClick={handleReset} className="btn-secondary">รีเซ็ต</button>
        </div>
      </div>

      {/* Summary + pagination */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>พบ {total.toLocaleString()} รายการ</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span>หน้า {page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="card p-0 overflow-hidden divide-y divide-gray-100">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">ไม่พบรายการ</div>
        ) : logs.map((log) => (
          <div key={log.id}>
            {/* Row */}
            <div
              onClick={() => toggle(log.id)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer select-none"
            >
              {/* Time */}
              <div className="w-28 shrink-0">
                <p className="text-xs font-medium text-gray-700">{format(new Date(log.createdAt), 'dd/MM/yy')}</p>
                <p className="text-xs text-gray-400">{format(new Date(log.createdAt), 'HH:mm:ss')}</p>
              </div>
              {/* User */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{log.user.name}</p>
                <p className="text-[10px] text-gray-400">{log.user.username} · {log.user.role}</p>
              </div>
              {/* Action badge */}
              <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium ${actionColor[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                {actionLabel[log.action] ?? log.action}
              </span>
              {/* Entity */}
              <div className="hidden md:block w-28 shrink-0 text-xs text-gray-500 truncate">
                {log.detail?.billNumber ?? log.entityId?.slice(0, 10) ?? log.entity}
              </div>
              {/* IP */}
              <div className="hidden lg:block w-24 shrink-0 text-xs text-gray-400">{log.ip || '—'}</div>
              {/* Chevron */}
              <span className="shrink-0 text-gray-400">
                {expanded === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </div>

            {/* Expanded detail */}
            {expanded === log.id && (
              <div className="px-4 pb-4 pt-2 bg-blue-50/40 border-t border-blue-100">
                {/* Header info */}
                <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-3">
                  <span><span className="font-medium text-gray-700">เวลา:</span> {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm:ss')}</span>
                  <span><span className="font-medium text-gray-700">ผู้ใช้:</span> {log.user.name} ({log.user.username})</span>
                  <span><span className="font-medium text-gray-700">บทบาท:</span> {log.user.role}</span>
                  <span><span className="font-medium text-gray-700">IP:</span> {log.ip || '—'}</span>
                  {log.entityId && <span><span className="font-medium text-gray-700">Entity ID:</span> {log.entityId}</span>}
                </div>
                <DetailPanel log={log} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary py-1.5 px-3 text-sm">
            <ChevronLeft size={14} className="inline" /> ก่อนหน้า
          </button>
          <span className="flex items-center text-sm text-gray-500">หน้า {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary py-1.5 px-3 text-sm">
            ถัดไป <ChevronRight size={14} className="inline" />
          </button>
        </div>
      )}
    </div>
  );
}
