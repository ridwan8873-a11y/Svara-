import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { usePlayer } from '@/src/context/PlayerContext';

interface AudioSentinelModalProps {
  open: boolean;
  onClose: () => void;
}

function formatBytesMB(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Stream Penuh';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AudioSentinelModal: React.FC<AudioSentinelModalProps> = ({ open, onClose }) => {
  const {
    sentinelReport,
    isScanningSentinel,
    sentinelRepairLog,
    runSentinelScan,
  } = usePlayer();

  const sortedResults = useMemo(() => {
    if (!sentinelReport) return [];
    const order = { repaired: 0, warning_30s: 1, verified: 2 };
    return [...sentinelReport.results].sort((a, b) => order[a.status] - order[b.status]);
  }, [sentinelReport]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Audio Guard — Pemindai & Pembaruan Otomatis"
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-white/[0.07] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>Audio Guard · Pemindai &amp; Pembaruan Otomatis</span>
                {sentinelReport && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                    <Zap size={11} />
                    {sentinelReport.summary.elapsedMs} ms
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Mendeteksi lagu 30 detik &amp; vokal cover/non-artis secara paralel, lalu memperbarui otomatis ke master studio asli.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Audio Guard"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary Metrics & Action Bar */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                Terverifikasi Penuh
              </p>
              <p className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                {sentinelReport?.summary.verified ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                Diperbarui Otomatis
              </p>
              <p className="font-display text-xl font-bold text-sky-600 dark:text-sky-400 tabular-nums mt-0.5">
                {sentinelReport?.summary.repaired ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                Risiko 30 Detik
              </p>
              <p className="font-display text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                {sentinelReport?.summary.previewOnly ?? 0}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void runSentinelScan()}
            disabled={isScanningSentinel}
            className="svara-press flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shrink-0"
          >
            {isScanningSentinel ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Memindai Katalog...</span>
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                <span>Pindai &amp; Perbaiki Sekarang</span>
              </>
            )}
          </button>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {sentinelRepairLog.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                <Wrench size={13} />
                <span>Riwayat Pembaruan Lagu Otomatis</span>
              </h3>
              <div className="space-y-1.5">
                {sentinelRepairLog.slice(0, 6).map((entry, i) => (
                  <div
                    key={`${entry.oldTitle}-${i}`}
                    className="rounded-xl bg-sky-500/10 border border-sky-500/20 px-3.5 py-2.5 text-xs text-zinc-700 dark:text-zinc-200 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="line-through text-zinc-500">
                          {entry.oldTitle} — {entry.oldArtist}
                        </span>
                        <span className="mx-2 text-sky-500 dark:text-sky-400">→</span>
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          {entry.newTitle} — {entry.newArtist}
                        </span>
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-sky-600 dark:text-sky-300 shrink-0">
                      Diperbarui
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Status Audit Master Audio ({sortedResults.length} Lagu)
              </h3>
              {sentinelReport && (
                <span className="text-[11px] text-zinc-500 font-mono">
                  Terakhir: {new Date(sentinelReport.scannedAt).toLocaleTimeString('id-ID')}
                </span>
              )}
            </div>

            {isScanningSentinel && sortedResults.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                <Loader2 size={24} className="animate-spin text-emerald-500 dark:text-emerald-400" />
                <span>Menjalankan pemindaian paralel berkecepatan tinggi...</span>
              </div>
            ) : sortedResults.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-500">
                Belum ada lagu dipindai. Tekan tombol &ldquo;Pindai &amp; Perbaiki Sekarang&rdquo; di atas.
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-white/[0.05] rounded-xl border border-zinc-200 dark:border-white/[0.07] bg-zinc-50 dark:bg-zinc-950/40">
                {sortedResults.map((item) => (
                  <div
                    key={`${item.id}-${item.title}`}
                    className="px-4 py-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.status === 'verified' ? (
                        <CheckCircle2 size={17} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : item.status === 'repaired' ? (
                        <Sparkles size={17} className="text-sky-600 dark:text-sky-400 shrink-0" />
                      ) : (
                        <AlertTriangle size={17} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {item.artist} · {item.reason}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-xs font-mono font-semibold ${
                          item.status === 'verified'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : item.status === 'repaired'
                            ? 'text-sky-600 dark:text-sky-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {item.status === 'verified'
                          ? 'Penuh 100%'
                          : item.status === 'repaired'
                          ? 'Diperbarui'
                          : 'Terbatas 30s'}
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                        {item.audioSource} · {formatBytesMB(item.sizeBytes)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
