import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FileUp, GitMerge } from 'lucide-react';
import ImportSales from './ImportSales';
import DeptReconcile from './DeptReconcile';

type Tab = 'import' | 'reconcile';

interface Props {
  initialTab?: Tab;
}

export default function SalesManager({ initialTab }: Props) {
  const location = useLocation();

  const derived: Tab = initialTab
    ?? (location.pathname.includes('dept-reconcile') ? 'reconcile' : 'import');

  const [tab, setTab] = useState<Tab>(derived);

  // If route changes (e.g. user navigates via sidebar), sync tab
  React.useEffect(() => {
    if (location.pathname.includes('dept-reconcile')) setTab('reconcile');
    else if (location.pathname.includes('import-sales')) setTab('import');
  }, [location.pathname]);

  return (
    <div className="space-y-0">
      {/* Tab switcher */}
      <div className="flex gap-0 border-b border-gray-200 mb-4 -mt-2">
        <button
          onClick={() => setTab('import')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'import'
              ? 'border-blue-600 text-blue-700 bg-blue-50/40'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <FileUp size={16} />
          นำเข้าข้อมูลการขาย
        </button>
        <button
          onClick={() => setTab('reconcile')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'reconcile'
              ? 'border-indigo-600 text-indigo-700 bg-indigo-50/40'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <GitMerge size={16} />
          คัดแยกยอดขายหน้าร้าน
        </button>
      </div>

      {tab === 'import'    && <ImportSales />}
      {tab === 'reconcile' && <DeptReconcile />}
    </div>
  );
}
