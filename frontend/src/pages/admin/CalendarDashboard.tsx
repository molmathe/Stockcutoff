import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle, Download, BarChart2, X, TrendingUp, Package, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import client from '../../api/client';
import Modal from '../../components/Modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DaySummary {
  date: string;
  activeBranches: number;
  submittedBranches: number;
  percentage: number | null;
  totalRevenue: number;
}

interface MonthlySummary {
  year: number;
  month: number;
  days: DaySummary[];
}

interface BranchDetail {
  id: string;
  name: string;
  code: string;
  submitted: boolean;
  totalAmount: number;
  billCount: number;
  currentlyActive: boolean;
  currentlyDeleted: boolean;
}

interface DayDetail {
  date: string;
  branches: BranchDetail[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchInsight {
  branch: { id: string; name: string; code: string };
  date: string;
  dailySummary: {
    total: number;
    billCount: number;
    avgTransaction: number;
    itemsSold: number;
    firstSubmission: string | null;
    lastSubmission: string | null;
  };
  topItems: { id: string; name: string; sku: string; qty: number; revenue: number }[];
  monthlyKpi: {
    year: number;
    month: number;
    target: number;
    actual: number;
    achievement: number | null;
    submissionDays: number;
    activeDays: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 });

const thaiMonths = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const thaiDays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// Dot colour based on submission percentage
const dotColor = (pct: number | null): string => {
  if (pct === null) return 'bg-gray-200';
  if (pct >= 95) return 'bg-green-500';
  if (pct >= 80) return 'bg-yellow-400';
  if (pct >= 60) return 'bg-orange-400';
  return 'bg-red-500';
};

// Cell background tint based on submission percentage
const cellTint = (pct: number | null, isToday: boolean): string => {
  if (isToday) return 'ring-2 ring-blue-400 ring-inset';
  return '';
};

const todayStr = (): string => {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().split('T')[0];
};

// ─── Day Cell ────────────────────────────────────────────────────────────────

interface DayCellProps {
  day: number;
  summary?: DaySummary;
  isToday: boolean;
  isFuture: boolean;
  onClick: () => void;
}

const DayCell: React.FC<DayCellProps> = ({ day, summary, isToday, isFuture, onClick }) => {
  const pct = summary?.percentage ?? null;

  return (
    <button
      onClick={onClick}
      disabled={isFuture && !summary}
      className={`
        relative flex flex-col gap-0.5 p-1.5 rounded-lg border text-left transition-all min-h-[72px]
        ${isFuture ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-default' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer'}
        ${isToday ? 'border-blue-400 shadow-sm' : ''}
        ${cellTint(pct, isToday)}
      `}
    >
      {/* Date number */}
      <span className={`text-xs font-semibold ${isToday ? 'text-blue-600' : isFuture ? 'text-gray-300' : 'text-gray-700'}`}>
        {day}
      </span>

      {summary && !isFuture && (
        <>
          {/* Submission ratio text */}
          <span className="text-[10px] text-gray-500 leading-tight">
            {summary.submittedBranches}/{summary.activeBranches} สาขา
          </span>

          {/* Revenue (show only if there's data) */}
          {summary.totalRevenue > 0 && (
            <span className="text-[10px] text-gray-400 leading-tight truncate">
              ฿{summary.totalRevenue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
            </span>
          )}

          {/* Coloured dot */}
          <div className="absolute bottom-1.5 right-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${dotColor(pct)}`} />
          </div>
        </>
      )}
    </button>
  );
};

// ─── Legend ───────────────────────────────────────────────────────────────────

const Legend = () => (
  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
    {[
      { color: 'bg-green-500',  label: '≥ 95%' },
      { color: 'bg-yellow-400', label: '80–94%' },
      { color: 'bg-orange-400', label: '60–79%' },
      { color: 'bg-red-500',    label: '< 60%' },
      { color: 'bg-gray-200',   label: 'ไม่มีข้อมูล' },
    ].map(({ color, label }) => (
      <span key={label} className="flex items-center gap-1">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
        {label}
      </span>
    ))}
  </div>
);

// ─── Branch Deep Insight Modal ────────────────────────────────────────────────
// Rendered at z-[60] so it stacks cleanly on top of the DayDetailModal (z-50).

interface BranchDeepInsightModalProps {
  branchId: string;
  branchName: string;
  dateStr: string;
  onClose: () => void;
}

const BranchDeepInsightModal: React.FC<BranchDeepInsightModalProps> = ({
  branchId, branchName, dateStr, onClose,
}) => {
  const { data, isLoading, isError } = useQuery<BranchInsight>({
    queryKey: ['branch-insight', branchId, dateStr],
    queryFn: () =>
      client.get('/calendar/branch-insight', { params: { branchId, date: dateStr } }).then(r => r.data),
    staleTime: 60_000,
  });

  const [year, month, day] = dateStr.split('-').map(Number);
  const titleDate = `${day} ${thaiMonths[month - 1]} ${year + 543}`;

  const kpi = data?.monthlyKpi;
  const achievementPct = kpi?.achievement ?? 0;
  const barWidth = Math.min(100, Math.max(0, achievementPct));
  const barColor =
    achievementPct >= 95 ? 'bg-green-500' :
    achievementPct >= 80 ? 'bg-yellow-400' :
    achievementPct >= 60 ? 'bg-orange-400' : 'bg-red-400';

  const toThaiTime = (isoStr: string | null) => {
    if (!isoStr) return '—';
    // isoStr is already shifted to Thai time on backend
    const d = new Date(isoStr);
    return d.toISOString().split('T')[1].substring(0, 5);
  };

  return (
    // z-[60] — sits above the day-detail modal (z-50)
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Deep Insight — {branchName}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{titleDate}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {isLoading && (
            <p className="text-center text-gray-400 py-10">กำลังโหลด...</p>
          )}
          {isError && (
            <p className="text-center text-red-400 py-10">โหลดข้อมูลไม่สำเร็จ</p>
          )}

          {data && (
            <>
              {/* ── Daily Summary ── */}
              <section>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  <TrendingUp size={13} />
                  ยอดขายประจำวัน
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">ยอดรวม</p>
                    <p className="text-lg font-bold text-blue-700">฿{fmt(data.dailySummary.total)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">จำนวนบิล</p>
                    <p className="text-lg font-bold text-gray-800">{data.dailySummary.billCount} บิล</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">เฉลี่ยต่อบิล</p>
                    <p className="text-base font-semibold text-gray-700">฿{fmt(data.dailySummary.avgTransaction)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">จำนวนชิ้น</p>
                    <p className="text-base font-semibold text-gray-700">{data.dailySummary.itemsSold} ชิ้น</p>
                  </div>
                </div>
                {/* Submission time window */}
                {data.dailySummary.billCount > 0 && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-500">
                    <Clock size={13} className="shrink-0" />
                    บิลแรก {toThaiTime(data.dailySummary.firstSubmission)}
                    {data.dailySummary.firstSubmission !== data.dailySummary.lastSubmission && (
                      <> · บิลสุดท้าย {toThaiTime(data.dailySummary.lastSubmission)}</>
                    )}
                    {' '}น.
                  </div>
                )}
              </section>

              {/* ── Monthly KPI ── */}
              <section>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  <BarChart2 size={13} />
                  KPI รายเดือน — {thaiMonths[month - 1]} {year + 543}
                </h3>
                {kpi && kpi.target > 0 ? (
                  <div className="space-y-2">
                    {/* Progress bar */}
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>ทำได้ {kpi.achievement?.toFixed(1) ?? 0}% ของเป้า</span>
                      <span>฿{kpi.actual.toLocaleString('th-TH', { maximumFractionDigits: 0 })} / ฿{kpi.target.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      ส่งยอดแล้ว {kpi.submissionDays}/{kpi.activeDays} วัน ในเดือนนี้
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">ยังไม่ได้ตั้งเป้าสำหรับเดือนนี้</p>
                )}
              </section>

              {/* ── Top Items ── */}
              {data.topItems.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    <Package size={13} />
                    สินค้าขายดี 5 อันดับ (วันนี้)
                  </h3>
                  <ul className="space-y-1.5">
                    {data.topItems.map((item, idx) => (
                      <li key={item.id} className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 rounded-lg">
                        <span className="text-xs font-bold text-gray-400 w-4 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                          {item.sku && <p className="text-[10px] text-gray-400">{item.sku}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-gray-700">฿{fmt(item.revenue)}</p>
                          <p className="text-[10px] text-gray-400">{item.qty} ชิ้น</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.dailySummary.billCount === 0 && (
                <div className="flex flex-col items-center gap-2 py-6 text-gray-400">
                  <AlertCircle size={28} />
                  <p className="text-sm">ไม่มีข้อมูลการขายในวันนี้</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Day Detail Modal ─────────────────────────────────────────────────────────

interface DayDetailModalProps {
  dateStr: string;
  onClose: () => void;
}

const DayDetailModal: React.FC<DayDetailModalProps> = ({ dateStr, onClose }) => {
  const { data, isLoading, isError } = useQuery<DayDetail>({
    queryKey: ['calendar-day-detail', dateStr],
    queryFn: () => client.get('/calendar/day-detail', { params: { date: dateStr } }).then(r => r.data),
    staleTime: 30_000,
  });

  const [insightBranch, setInsightBranch] = useState<{ id: string; name: string } | null>(null);

  const [year, month, day] = dateStr.split('-').map(Number);
  const titleDate = `${day} ${thaiMonths[month - 1]} ${year + 543}`;

  const submitted   = data?.branches.filter(b => b.submitted)  ?? [];
  const notSubmitted = data?.branches.filter(b => !b.submitted) ?? [];

  return (
    <Modal title={`รายงานการส่งยอดขาย — ${titleDate}`} onClose={onClose} size="lg">
      {isLoading && (
        <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
      )}
      {isError && (
        <p className="text-center text-red-400 py-8">โหลดข้อมูลไม่สำเร็จ</p>
      )}
      {data && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg text-sm">
            <span className="text-gray-600">
              ส่งยอดแล้ว <span className="font-bold text-green-600">{submitted.length}</span> /
              <span className="font-semibold text-gray-700"> {data.branches.length} สาขา</span>
            </span>
            {submitted.length > 0 && (
              <span className="text-gray-600 ml-auto">
                รวมยอด <span className="font-bold text-gray-800">
                  ฿{fmt(submitted.reduce((s, b) => s + b.totalAmount, 0))}
                </span>
              </span>
            )}
          </div>

          {/* Submitted */}
          {submitted.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                ส่งยอดแล้ว ({submitted.length})
              </h3>
              <ul className="space-y-1.5">
                {submitted.map(b => (
                  <li key={b.id} className="flex items-center gap-3 p-2.5 bg-green-50 border border-green-100 rounded-lg">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">{b.name}</span>
                      <span className="text-xs text-gray-400 ml-1.5">[{b.code}]</span>
                      {!b.currentlyActive && (
                        <span className="ml-1.5 text-[10px] text-orange-500 font-medium">ปิดแล้ว</span>
                      )}
                      {b.currentlyDeleted && (
                        <span className="ml-1.5 text-[10px] text-red-400 font-medium">ลบแล้ว</span>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">฿{fmt(b.totalAmount)}</p>
                        <p className="text-[10px] text-gray-400">{b.billCount} บิล</p>
                      </div>
                      <button
                        onClick={() => setInsightBranch({ id: b.id, name: b.name })}
                        title="Deep Insight"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <BarChart2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Not submitted */}
          {notSubmitted.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                ยังไม่ส่งยอด ({notSubmitted.length})
              </h3>
              <ul className="space-y-1.5">
                {notSubmitted.map(b => (
                  <li key={b.id} className="flex items-center gap-3 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                    <XCircle size={16} className="text-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-700">{b.name}</span>
                      <span className="text-xs text-gray-400 ml-1.5">[{b.code}]</span>
                      {!b.currentlyActive && (
                        <span className="ml-1.5 text-[10px] text-orange-500 font-medium">ปิดแล้ว</span>
                      )}
                      {b.currentlyDeleted && (
                        <span className="ml-1.5 text-[10px] text-red-400 font-medium">ลบแล้ว</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">ไม่มีข้อมูล</span>
                      <button
                        onClick={() => setInsightBranch({ id: b.id, name: b.name })}
                        title="Deep Insight"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <BarChart2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.branches.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
              <AlertCircle size={32} />
              <p className="text-sm">ไม่มีสาขาที่ active ในวันนี้</p>
            </div>
          )}
        </div>
      )}
      {/* Deep Insight modal — z-[60] renders above this modal (z-50) */}
      {insightBranch && (
        <BranchDeepInsightModal
          branchId={insightBranch.id}
          branchName={insightBranch.name}
          dateStr={dateStr}
          onClose={() => setInsightBranch(null)}
        />
      )}
    </Modal>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CalendarDashboard() {
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000); // Thai time
  const [year,  setYear]  = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth() + 1); // 1–12
  const [selectedDate,  setSelectedDate]  = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError } = useQuery<MonthlySummary>({
    queryKey: ['calendar-monthly', year, month],
    queryFn: () =>
      client.get('/calendar/monthly-summary', { params: { year, month } }).then(r => r.data),
    staleTime: 60_000,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await client.get('/calendar/export', {
        params: { year, month },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `รายงานการส่งยอด-${thaiMonths[month - 1]}-${year + 543}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('ดาวน์โหลดรายงานเรียบร้อย');
    } catch {
      toast.error('ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  // Build the calendar grid — find the weekday of the 1st (0=Sun)
  const firstDayOfMonth = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`);
  const startPad = firstDayOfMonth.getUTCDay(); // 0=Sun, matches thaiDays array
  const daysInMonth = new Date(year, month, 0).getDate();

  const dayMap = new Map<string, DaySummary>();
  data?.days.forEach(d => dayMap.set(d.date, d));

  const currentTodayStr = todayStr();

  // Stats for the header
  const daysWithData  = data?.days.filter(d => d.activeBranches > 0 && !isFutureDate(d.date, currentTodayStr)) ?? [];
  const perfectDays   = daysWithData.filter(d => (d.percentage ?? 0) >= 95).length;
  const totalSubmitted = data?.days.reduce((s, d) => s + d.totalRevenue, 0) ?? 0;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-800">ปฏิทินการส่งยอดขายรายวัน</h1>

      {/* Month navigation */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="text-center">
            <h2 className="text-lg font-bold text-gray-800">
              {thaiMonths[month - 1]} {year + 543}
            </h2>
            {!isLoading && data && daysWithData.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                สมบูรณ์ {perfectDays}/{daysWithData.length} วัน · รวมยอด ฿{totalSubmitted.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleExport}
              disabled={exporting || isLoading}
              title="ส่งออก Excel สำหรับ HR"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              <Download size={14} />
              {exporting ? 'กำลังส่งออก...' : 'Excel (HR)'}
            </button>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <Legend />

        {isLoading && (
          <div className="mt-6 text-center text-gray-400 py-12">กำลังโหลด...</div>
        )}
        {isError && (
          <div className="mt-6 text-center text-red-400 py-12">โหลดข้อมูลไม่สำเร็จ</div>
        )}

        {!isLoading && !isError && (
          <div className="mt-4">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 mb-1">
              {thaiDays.map(d => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Leading empty cells */}
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day     = i + 1;
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const summary = dayMap.get(dateStr);
                const isToday  = dateStr === currentTodayStr;
                const isFuture = dateStr > currentTodayStr;

                return (
                  <DayCell
                    key={dateStr}
                    day={day}
                    summary={summary}
                    isToday={isToday}
                    isFuture={isFuture}
                    onClick={() => !isFuture && setSelectedDate(dateStr)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Day detail modal */}
      {selectedDate && (
        <DayDetailModal
          dateStr={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}

// Helper — outside component to avoid re-creation
function isFutureDate(dateStr: string, todayStr: string): boolean {
  return dateStr > todayStr;
}
