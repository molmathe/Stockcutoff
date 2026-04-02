import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, X } from 'lucide-react';
import client from '../api/client';

interface AutoInputProps {
  defaultValue: string;
  onCommit: (val: string) => void;
}

// ─── BranchCombobox ──────────────────────────────────────────────────────────
// ID-based searchable branch selector for forms and filters.

interface BranchComboboxProps {
  value: string;           // branch ID ('' = none selected)
  onChange: (id: string) => void;
  branches: { id: string; name: string; code: string }[];
  placeholder?: string;
  allLabel?: string;       // label for the "no selection" option, e.g. "ทุกสาขา"
}

export const BranchCombobox: React.FC<BranchComboboxProps> = ({
  value, onChange, branches, placeholder = '— เลือกสาขา —', allLabel,
}) => {
  const selected = branches.find(b => b.id === value) ?? null;
  const [query,  setQuery]  = useState('');
  const [open,   setOpen]   = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? branches.filter(b =>
        b.name.toLowerCase().includes(query.toLowerCase()) ||
        b.code.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : branches.slice(0, 8);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => (containerRef.current?.querySelector('input') as HTMLInputElement)?.focus(), 50); }}
        className="input w-full flex items-center justify-between text-left gap-2 pr-2"
      >
        <span className={`flex-1 truncate text-sm ${selected ? 'text-gray-800' : 'text-gray-400'}`}>
          {selected ? `${selected.name} (${selected.code})` : (allLabel ?? placeholder)}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span onMouseDown={clear} className="text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded">
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="พิมพ์ชื่อหรือรหัสสาขา..."
              className="w-full text-sm px-2.5 py-1.5 border border-gray-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              autoFocus
            />
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {/* All-branches option */}
            {allLabel && (
              <li
                onMouseDown={() => select('')}
                className={`px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 text-gray-500 ${value === '' ? 'bg-blue-50 font-medium text-blue-700' : ''}`}
              >
                {allLabel}
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-gray-400 text-center">ไม่พบสาขา</li>
            ) : (
              filtered.map(b => (
                <li
                  key={b.id}
                  onMouseDown={() => select(b.id)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 ${b.id === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'}`}
                >
                  <span className="truncate">{b.name}</span>
                  <span className="text-xs text-gray-400 ml-2 shrink-0">{b.code}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

// ─── BranchAutoInput ────────────────────────────────────────────────────────

export const BranchAutoInput: React.FC<AutoInputProps> = ({ defaultValue, onCommit }) => {
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
        placeholder="รหัส/ชื่อสาขา"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 top-full mt-0.5 w-full min-w-max bg-white border border-gray-200 rounded shadow-lg text-xs max-h-40 overflow-y-auto">
          {filtered.map((b: any) => (
            <li
              key={b.id}
              onMouseDown={(e) => {
                e.preventDefault();
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

export const ItemAutoInput: React.FC<AutoInputProps> = ({ defaultValue, onCommit }) => {
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
