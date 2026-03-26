import React, { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import client from '../api/client';

interface AutoInputProps {
  defaultValue: string;
  onCommit: (val: string) => void;
}

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
