import React from 'react';
import {
  Cloud,
  Disc3,
  Flame,
  Heart,
  Home,
  Library,
  Plus,
  Search,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { usePlayer } from '@/src/context/PlayerContext';
import type { ViewTab } from '@/src/types/music';

interface SidebarProps {
  activeTab: ViewTab;
  selectedPlaylistId: string | null;
  onSelectTab: (tab: ViewTab) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onOpenCreatePlaylist: () => void;
}

const NAV_ITEMS: { id: ViewTab; label: string; shortLabel: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'home', label: 'Beranda', shortLabel: 'Beranda', icon: Home },
  { id: 'search', label: 'Jelajah & Cari', shortLabel: 'Cari', icon: Search },
  { id: 'wrapped', label: 'Wrapped & Api 🔥', shortLabel: 'Wrapped', icon: Flame },
  { id: 'ai', label: 'Kurator Musik', shortLabel: 'Kurator', icon: Sparkles },
  { id: 'library', label: 'Pustaka & Offline', shortLabel: 'Pustaka', icon: Library },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  selectedPlaylistId,
  onSelectTab,
  onSelectPlaylist,
  onOpenCreatePlaylist,
}) => {
  const {
    playlists,
    likedTracks,
    offlineRecords,
    offlineMode,
    setOfflineMode,
    evaluatedStreak,
    cloudUser,
  } = usePlayer();

  const streakLabel = evaluatedStreak.isExtinguished
    ? 'Api Padam — Putar Lagu!'
    : evaluatedStreak.displayStreak > 0
    ? `${evaluatedStreak.displayStreak} Hari Menyala`
    : 'Mulai Api Hari ke-1';

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white dark:bg-[#0B0B0E] border-r border-zinc-200 dark:border-white/[0.07] h-full select-none transition-colors">
        {/* Brand */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[rgba(var(--svara-accent-rgb),0.15)] border border-[rgba(var(--svara-accent-rgb),0.35)] flex items-center justify-center svara-accent-text transition-colors duration-500">
              <Disc3 size={18} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0">
              Svara
            </span>
          </div>
          {cloudUser && (
            <span
              title={`Tersinkron ke Google Cloud (${cloudUser.email || 'Aktif'})`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-medium text-emerald-600 dark:text-emerald-300 whitespace-nowrap"
            >
              <Cloud size={11} />
              <span>Aman</span>
            </span>
          )}
        </div>

        {/* Main Navigation */}
        <nav className="px-3 space-y-1" aria-label="Navigasi Utama">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id && !selectedPlaylistId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`svara-press w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-zinc-100 dark:bg-gradient-to-r dark:from-zinc-900 dark:to-zinc-900/60 text-zinc-950 dark:text-white border border-zinc-200 dark:border-white/[0.07] shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50 border border-transparent'
                }`}
              >
                <Icon
                  size={18}
                  className={
                    active
                      ? item.id === 'wrapped'
                        ? 'text-orange-500 dark:text-orange-400'
                        : 'svara-accent-text'
                      : item.id === 'wrapped' && evaluatedStreak.isLitToday
                      ? 'text-orange-500 dark:text-orange-400'
                      : ''
                  }
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Live Streak Api 🔥 Card */}
        <div className="px-3 mt-4 space-y-2">
          <button
            type="button"
            onClick={() => onSelectTab('wrapped')}
            className={`svara-press w-full text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${
              evaluatedStreak.isLitToday
                ? 'bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-orange-50 dark:to-zinc-900/80 border-orange-500/35'
                : evaluatedStreak.isExtinguished
                ? 'bg-rose-50/70 dark:bg-zinc-900/80 border-rose-500/25 hover:border-rose-500/40'
                : 'bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-white/[0.06] hover:border-orange-500/30'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-white whitespace-nowrap">
                <span aria-hidden="true">🔥</span>
                <span>Api Harian</span>
              </span>
              <span
                className={`font-mono text-[11px] font-bold tabular-nums ${
                  evaluatedStreak.isLitToday
                    ? 'text-orange-600 dark:text-orange-300'
                    : evaluatedStreak.isExtinguished
                    ? 'text-rose-600 dark:text-rose-300'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {evaluatedStreak.isExtinguished
                  ? 'PADAM'
                  : `${evaluatedStreak.displayStreak} hari`}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 truncate">{streakLabel}</p>
          </button>

          {/* Offline Mode Switch */}
          <button
            type="button"
            onClick={() => setOfflineMode(!offlineMode)}
            className={`svara-press w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-medium cursor-pointer ${
              offlineMode
                ? 'bg-amber-500/15 border-amber-500/35 text-amber-700 dark:text-amber-300'
                : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-white/[0.06] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              <WifiOff size={15} className={offlineMode ? 'text-amber-500 dark:text-amber-400' : ''} />
              Mode Offline
            </span>
            <span className="font-mono tabular-nums text-[11px]">
              {offlineMode ? 'AKTIF' : `${offlineRecords.length} lagu`}
            </span>
          </button>
        </div>

        <div className="mx-5 my-4 border-t border-zinc-200 dark:border-white/[0.07]" />

        {/* Personal Playlists Section */}
        <div className="px-5 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide">
            Playlist Personal
          </h2>
          <button
            type="button"
            onClick={onOpenCreatePlaylist}
            title="Buat playlist baru"
            aria-label="Buat playlist baru"
            className="svara-press w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="mt-2 px-3 flex-1 overflow-y-auto space-y-1 pb-4">
          <button
            type="button"
            onClick={() => onSelectTab('library')}
            className="svara-press w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-md bg-[rgba(var(--svara-accent-rgb),0.15)] flex items-center justify-center svara-accent-text shrink-0">
              <Heart size={14} className="fill-current" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-200 truncate">Lagu Disukai</p>
              <p className="text-xs text-zinc-500 tabular-nums">{likedTracks.length} lagu</p>
            </div>
          </button>

          {playlists.map((pl) => {
            const isSelected = activeTab === 'library' && selectedPlaylistId === pl.id;
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => onSelectPlaylist(pl.id)}
                className={`svara-press w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-950 dark:text-white border border-zinc-200 dark:border-white/[0.06]'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60 border border-transparent'
                }`}
              >
                <TrackArtwork
                  trackId={pl.tracks[0]?.id}
                  src={
                    pl.tracks[0]?.artworkUrl ||
                    (pl.coverUrl && !pl.coverUrl.startsWith('/src/assets/images/')
                      ? pl.coverUrl
                      : '')
                  }
                  alt={pl.name}
                  className="w-8 h-8 rounded-md"
                  iconSize={14}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{pl.name}</p>
                  <p className="text-xs text-zinc-500 tabular-nums">{pl.tracks.length} lagu</p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Mobile Floating Frosted-Glass Bottom Navigation Pill */}
      <nav
        aria-label="Navigasi Seluler"
        className="lg:hidden fixed bottom-3 left-3 right-3 z-40 h-16 rounded-[28px] bg-white/92 dark:bg-[#16161C]/88 backdrop-blur-xl border border-zinc-200 dark:border-white/[0.12] shadow-[0_16px_40px_rgba(0,0,0,0.22)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.75)] grid grid-cols-5 items-center px-1.5 transition-colors"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`svara-press flex flex-col items-center justify-center min-h-[46px] mx-0.5 rounded-2xl transition-colors ${
                active
                  ? item.id === 'wrapped'
                    ? 'bg-orange-500/15 text-orange-600 dark:text-orange-300'
                    : 'bg-zinc-900/10 dark:bg-white/[0.10] text-zinc-950 dark:text-white'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Icon size={19} />
              <span className="text-[10px] font-medium mt-0.5 whitespace-nowrap">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
