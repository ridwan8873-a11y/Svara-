import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-3.5 py-2 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download size={14} />
        <span>{compact ? 'Pasang App' : 'Pasang Aplikasi'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="svara-press flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Smartphone size={14} className="text-emerald-600 dark:text-emerald-400" />
        <span>{compact ? 'Mode App' : 'Pemutaran Latar'}</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
                  Pemutaran Latar Belakang &amp; Aplikasi
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Agar musik tetap menyala saat keluar dari website atau mengunci layar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Tutup panduan"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/5 p-3.5">
                <p className="font-semibold text-zinc-900 dark:text-white text-xs">1. Pindah Tab atau Kunci Layar</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Svara terhubung dengan kontrol Media Session OS. Audio terus berjalan saat Anda pindah aplikasi atau mengunci layar ponsel, dan dapat dikontrol dari layar kunci atau headset Bluetooth.
                </p>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/5 p-3.5">
                <p className="font-semibold text-zinc-900 dark:text-white text-xs">2. Pasang sebagai Aplikasi (PWA)</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {isIOS
                    ? 'Di Safari iPhone/iPad: tekan ikon Bagikan (Share), lalu pilih "Tambah ke Layar Utama" (Add to Home Screen).'
                    : 'Di Chrome/Edge/Android: buka menu browser lalu pilih "Pasang Svara" atau "Add to Home Screen" agar berjalan terpisah dari tab browser.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="svara-press mt-5 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-2.5 text-sm transition-colors cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};
