import React from 'react';
import {
  Disc3,
  Keyboard,
  Loader2,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Timer,
  WifiOff,
  Zap,
} from 'lucide-react';
import { PWAInstallButton } from '@/src/components/PWAInstallButton';
import { usePlayer } from '@/src/context/PlayerContext';
import type { ViewTab } from '@/src/types/music';

interface TopBarProps {
  activeTab: ViewTab;
  searchQuery: string;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (q: string) => void;
  onNavigateSearch: () => void;
  onOpenSentinel: () => void;
  onOpenWrapped: () => void;
  onOpenShortcuts: () => void;
  onOpenSleepSettings: () => void;
}

const TAB_TITLES: Record<ViewTab, string> = {
  home: 'Temukan Musik',
  search: 'Pencarian & Jelajah',
  wrapped: 'Wrapped Mingguan & Api Streak',
  ai: 'Kurator Musik',
  library: 'Pustaka, Riwayat & Offline',
};

function formatTimerShort(sec: number | null, mode: string): string {
  if (mode === 'end_of_track') return 'Akhir Lagu';
  if (sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  searchQuery,
  searchInputRef,
  onSearchChange,
  onNavigateSearch,
  onOpenSentinel,
  onOpenWrapped,
  onOpenShortcuts,
  onOpenSleepSettings,
}) => {
  const {
    isOnline,
    offlineMode,
    setOfflineMode,
    sentinelReport,
    isScanningSentinel,
    evaluatedStreak,
    lowRamMode,
    setLowRamMode,
    themeMode,
    toggleThemeMode,
    sleepTimerMode,
    sleepTimerRemainingSec,
  } = usePlayer();

  return (
    <header className="lg:sticky lg:top-0 z-30 h-12 lg:h-16 px-4 lg:px-8 bg-transparent lg:bg-white/85 lg:dark:bg-[#09090B]/85 lg:backdrop-blur-md lg:border-b lg:border-zinc-200 lg:dark:border-white/[0.07] flex items-center justify-between gap-2.5 lg:gap-5 shrink-0 transition-colors">
      {/* Zone 1: Brand / Section Title */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="lg:hidden w-7 h-7 rounded-lg bg-[rgba(var(--svara-accent-rgb),0.15)] border border-[rgba(var(--svara-accent-rgb),0.35)] flex items-center justify-center svara-accent-text">
          <Disc3 size={15} />
        </div>
        <span className="font-display text-base font-bold text-zinc-900 dark:text-white whitespace-nowrap">
          <span className="lg:hidden">Svara</span>
          <span className="hidden lg:inline">{TAB_TITLES[activeTab]}</span>
        </span>
      </div>

      {/* Zone 2: Desktop Search Input */}
      <div className="hidden lg:block flex-1 max-w-md min-w-0">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 pointer-events-none"
          />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onFocus={onNavigateSearch}
            onChange={(e) => {
              onNavigateSearch();
              onSearchChange(e.target.value);
            }}
            placeholder="Cari artis, lagu, atau album... (tekan /)"
            aria-label="Cari artis, lagu, atau album"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200 dark:border-white/[0.08] text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-[var(--svara-accent)] transition-colors"
          />
        </div>
      </div>

      {/* Zone 3: Quick Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onNavigateSearch}
          aria-label="Cari lagu atau artis"
          className="lg:hidden svara-press w-9 h-9 rounded-full bg-white/80 dark:bg-white/[0.06] border border-zinc-200 dark:border-white/[0.08] flex items-center justify-center text-zinc-700 dark:text-zinc-300 cursor-pointer"
        >
          <Search size={15} />
        </button>

        {/* Active Sleep Timer badge */}
        {sleepTimerMode !== 'off' && (
          <button
            type="button"
            onClick={onOpenSleepSettings}
            title="Pengatur waktu tidur aktif"
            className="svara-press flex items-center gap-1 rounded-full lg:rounded-lg bg-indigo-500/15 border border-indigo-500/35 px-2.5 py-1.5 text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-300 whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
          >
            <Timer size={13} />
            <span>{formatTimerShort(sleepTimerRemainingSec, sleepTimerMode)}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenWrapped}
          title={
            evaluatedStreak.isExtinguished
              ? 'Api streak padam — putar musik untuk mulai dari hari ke-1'
              : `Streak aktif ${evaluatedStreak.displayStreak} hari — buka Wrapped 1 Minggu`
          }
          className={`svara-press flex items-center gap-1.5 rounded-full lg:rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
            evaluatedStreak.isLitToday
              ? 'bg-orange-500/15 border-orange-500/35 text-orange-600 dark:text-orange-300 hover:bg-orange-500/20'
              : evaluatedStreak.isExtinguished
              ? 'bg-white dark:bg-zinc-900 border-rose-500/30 text-rose-600 dark:text-rose-300'
              : 'bg-white/80 dark:bg-zinc-900 border-zinc-200 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300 hover:border-orange-500/35'
          }`}
        >
          <span aria-hidden="true">🔥</span>
          <span className="font-mono tabular-nums">
            {evaluatedStreak.isExtinguished
              ? 'Padam'
              : evaluatedStreak.displayStreak > 0
              ? `${evaluatedStreak.displayStreak}`
              : '0'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSentinel}
          title="Audio Guard — Pemindai 30 Detik & Keaslian Vokal Artis"
          className="svara-press flex items-center gap-1.5 rounded-full lg:rounded-lg bg-white/80 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.08] hover:border-emerald-500/40 px-2.5 py-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isScanningSentinel ? (
            <Loader2 size={13} className="animate-spin text-emerald-500 dark:text-emerald-400" />
          ) : (
            <ShieldCheck size={13} className="text-emerald-500 dark:text-emerald-400" />
          )}
          <span className="hidden sm:inline">Audio Guard</span>
          {sentinelReport && !isScanningSentinel && (
            <span className="hidden md:inline font-mono text-[11px] text-emerald-600 dark:text-emerald-400 tabular-nums">
              {sentinelReport.summary.verified + sentinelReport.summary.repaired}/{sentinelReport.summary.total}
            </span>
          )}
        </button>

        {/* Manual Dark / Light Theme Toggle */}
        <button
          type="button"
          onClick={toggleThemeMode}
          title={themeMode === 'dark' ? 'Beralih ke Mode Terang (T)' : 'Beralih ke Mode Gelap (T)'}
          aria-label={themeMode === 'dark' ? 'Aktifkan Mode Terang' : 'Aktifkan Mode Gelap'}
          className="svara-press w-9 h-9 lg:w-auto lg:h-auto lg:px-2.5 lg:py-1.5 rounded-full lg:rounded-lg bg-white/80 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.08] flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer shrink-0"
        >
          {themeMode === 'dark' ? (
            <Sun size={14} className="text-amber-400" />
          ) : (
            <Moon size={14} className="text-indigo-500" />
          )}
          <span className="hidden xl:inline">{themeMode === 'dark' ? 'Terang' : 'Gelap'}</span>
        </button>

        {/* Keyboard Shortcuts Button */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          title="Pintasan Keyboard (?)"
          aria-label="Buka Pintasan Keyboard"
          className="svara-press hidden lg:flex items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 cursor-pointer shrink-0"
        >
          <Keyboard size={14} />
        </button>

        <button
          type="button"
          onClick={() => setLowRamMode(!lowRamMode)}
          title={lowRamMode ? 'Mode Hemat RAM Aktif' : 'Aktifkan Mode Hemat RAM'}
          aria-label="Mode Hemat RAM"
          className={`svara-press hidden xl:flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
            lowRamMode
              ? 'bg-sky-500/15 border-sky-500/35 text-sky-600 dark:text-sky-300'
              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/[0.08] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Zap size={13} />
          <span>{lowRamMode ? 'Hemat RAM' : 'Ringan'}</span>
        </button>

        {(!isOnline || offlineMode) && (
          <button
            type="button"
            onClick={() => setOfflineMode(!offlineMode)}
            className="svara-press flex items-center gap-1.5 rounded-full lg:rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <WifiOff size={13} />
            <span className="hidden sm:inline">
              {!isOnline ? 'Offline' : 'Mode Offline'}
            </span>
          </button>
        )}
        <PWAInstallButton compact />
      </div>
    </header>
  );
};
