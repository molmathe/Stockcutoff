import React, { useState, useRef, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Hash, Delete, ShoppingCart } from 'lucide-react';

export default function POSLogin() {
  const { user, posLogin } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (user) return <Navigate to="/" replace />;

  const handleKeyPress = (digit: string) => {
    if (pin.length < 4) setPin((p) => p + digit);
  };

  const handleDelete = () => setPin((p) => p.slice(0, -1));
  const handleClear = () => setPin('');

  const handleLogin = async () => {
    if (pin.length < 4) { toast.error('กรุณากรอกรหัส PIN 4 หลัก'); return; }
    setLoading(true);
    try {
      await posLogin(pin);
      navigate('/pos');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'รหัส PIN ไม่ถูกต้อง');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(val);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pin.length === 4) handleLogin();
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
            <Hash className="text-white" size={28} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">เข้าสู่ระบบ POS</h1>
          <p className="text-gray-500 text-sm mt-1">กรอกรหัส PIN 4 หลัก</p>
        </div>

        {/* PIN Display */}
        <div className="flex justify-center gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-all ${
                i < pin.length
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-gray-50 text-gray-300'
              }`}
            >
              {i < pin.length ? '●' : '○'}
            </div>
          ))}
        </div>

        {/* Hidden input for keyboard input on mobile */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          value={pin}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          className="sr-only"
          maxLength={4}
        />

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {digits.map((d) => (
            <button
              key={d}
              onClick={() => {
                if (d === '⌫') handleDelete();
                else if (d === 'C') handleClear();
                else handleKeyPress(d);
              }}
              className={`h-14 rounded-xl text-lg font-semibold transition-all active:scale-95 ${
                d === 'C'
                  ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-200'
                  : d === '⌫'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                  : 'bg-gray-50 text-gray-800 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-300'
              }`}
            >
              {d === '⌫' ? <Delete size={18} className="mx-auto" /> : d}
            </button>
          ))}
        </div>

        <button
          onClick={handleLogin}
          disabled={loading || pin.length < 4}
          className="btn-primary w-full py-3 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="flex items-center justify-center gap-2">
            <ShoppingCart size={18} />
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ POS'}
          </span>
        </button>
      </div>
    </div>
  );
}
