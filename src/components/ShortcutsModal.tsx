import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS: {
  title: string;
  items: { keys: string[]; desc: string }[];
}[] = [
  {
    title: 'Kontrol Pemutaran',
    items: [
      { keys: ['Spasi', 'K'], desc: 'Putar / Jeda lagu saat ini' },
      { keys: ['←', '→'], desc: 'Mundur atau maju 5 detik' },
      { keys: ['J', 'L'], desc: 'Mundur atau maju 10 detik' },
      { keys: ['Shift + ←', 'P'], desc: 'Lagu sebelumnya' },
      { keys: ['Shift + →', 'N'], desc: 'Lagu berikutnya' },
      { keys: ['↑', '↓'], desc: 'Naikkan atau turunkan volume' },
      { keys: ['M'], desc: 'Bisukan / bunyikan audio' },
    ],
  },
  {
    title: 'Antrean & Pustaka',
    items: [
      { keys: ['S'], desc: 'Acak antrean (Shuffle)' },
      { keys: ['R'], desc: 'Ganti mode ulang (Repeat)' },
      { keys: ['F'], desc: 'Sukai / hapus suka lagu aktif' },
      { keys: ['Q'], desc: 'Buka atau tutup laci antrean' },
    ],
  },
  {
    title: 'Studio, Navigasi & Tema',
    items: [
      { keys: ['/'], desc: 'Lompat ke pencarian cepat' },
      { keys: ['E'], desc: 'Buka modal Lirik, EQ & Studio' },
      { keys: ['T'], desc: 'Ganti Mode Gelap / Terang' },
      { keys: ['?'], desc: 'Tampilkan daftar pintasan ini' },
    ],
  },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pintasan Keyboard Svara"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#111115] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden svara-page-enter"
      >
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[rgba(var(--svara-accent-rgb),0.15)] flex items-center justify-center svara-accent-text">
              <Keyboard size={18} />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white">
                Pintasan Keyboard Lengkap
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Kendalikan pemutar musik lebih cepat tanpa mouse
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pintasan"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider svara-accent-text">
                {group.title}
              </h3>
              <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-zinc-950/60">
                {group.items.map((item) => (
                  <div
                    key={item.desc}
                    className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300">{item.desc}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-white/15 font-mono text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 shadow-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
