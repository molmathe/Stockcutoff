import React, { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const divId = 'qr-scanner-container';

  useEffect(() => {
    const scanner = new Html5Qrcode(divId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 120 } },
        (decodedText) => {
          onScan(decodedText);
          scanner.stop().then(onClose).catch(() => onClose());
        },
        undefined
      )
      .catch((err) => {
        console.error('Scanner start failed:', err);
        onClose();
      });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-xl p-4 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Scan Barcode</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div id={divId} className="w-full overflow-hidden rounded-lg" />
        <p className="text-xs text-gray-400 text-center mt-2">Point camera at barcode</p>
      </div>
    </div>
  );
}
