import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Download,
  Flame,
  Play,
  RefreshCw,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { TrackRow } from '@/src/components/TrackRow';
import { usePlayer } from '@/src/context/PlayerContext';
import type { DiscoverCollection, FeaturedArtistItem, Track } from '@/src/types/music';

interface HomeViewProps {
  collections: DiscoverCollection[];
  featuredArtists: FeaturedArtistItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenAI: () => void;
  onOpenWrapped: () => void;
  onArtistClick: (artistName: string) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
  onAddToPlaylist: (track: Track) => void;
  onOpenOfflineLibrary: () => void;
}

type MoodFilterId = 'all' | 'senang' | 'bersantai' | 'energi' | 'perjalanan' | 'gaming';

const MOOD_CHIPS: { id: MoodFilterId; label: string; colIds: string[]; keywords: RegExp }[] = [
  { id: 'all', label: 'Semua', colIds: [], keywords: /.*/ },
  {
    id: 'senang',
    label: 'Senang',
    colIds: ['col-pop-global', 'col-world-bestsellers'],
    keywords: /pop|dance|happy|espresso|levitating|summer|apt/i,
  },
  {
    id: 'bersantai',
    label: 'Bersantai',
    colIds: ['col-rnb-soul', 'col-indie-chill'],
    keywords: /r&b|soul|indie|acoustic|akustik|chill|tulus|hindia|bernadya|niki|laufey|sza/i,
  },
  {
    id: 'energi',
    label: 'Mengisi energi',
    colIds: ['col-rock-metal', 'col-electronic'],
    keywords: /rock|metal|electronic|edm|avenged|linkin|daft|weeknd/i,
  },
  {
    id: 'perjalanan',
    label: 'Perjalanan',
    colIds: ['col-world-bestsellers', 'col-indie-chill'],
    keywords: /pop|rock|coldplay|sheila|oasis|taylor|bruno/i,
  },
  {
    id: 'gaming',
    label: 'Gaming',
    colIds: ['col-gaming', 'col-electronic'],
    keywords: /gaming|edm|electronic|synth|faded|alone|spectre|alan walker/i,
  },
];

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

function getStreakStageTitle(days: number, isExtinguished: boolean): string {
  if (isExtinguished) return 'Api padam — putar lagu untuk mulai lagi';
  if (days <= 0) return 'Putar lagu hari ini untuk menyalakan';
  if (days <= 3) return 'Percikan';
  if (days <= 7) return 'Api Menyala';
  if (days <= 14) return 'Membara';
  return 'Legendaris';
}

export const HomeView: React.FC<HomeViewProps> = ({
  collections,
  featuredArtists,
  loading,
  error,
  onRetry,
  onOpenAI,
  onOpenWrapped,
  onArtistClick,
  onAlbumClick,
  onAddToPlaylist,
  onOpenOfflineLibrary,
}) => {
  const {
    playTrackList,
    downloadPlaylist,
    recentTracks,
    likedTracks,
    offlineMode,
    isOnline,
    offlineRecords,
    evaluatedStreak,
    weeklyWrapped,
    personalRecs,
    personalRecsLoading,
    refreshPersonalRecs,
    currentTrack,
    isPlaying,
    lowRamMode,
  } = usePlayer();

  const [activeMood, setActiveMood] = useState<MoodFilterId>('all');
  const [selectedColId, setSelectedColId] = useState<string>('col-world-bestsellers');

  const greeting = useMemo(() => getTimeGreeting(), []);

  const offlineTracks = useMemo(
    () => offlineRecords.map((r) => r.track),
    [offlineRecords]
  );

  // Pool all available tracks cleanly for quick-picks & mood filtering
  const allCatalogTracks = useMemo(() => {
    const map = new Map<string, Track>();
    for (const t of [...recentTracks, ...likedTracks, ...(personalRecs?.tracks ?? [])]) {
      if (!map.has(t.id)) map.set(t.id, t);
    }
    for (const col of collections) {
      for (const t of col.tracks) {
        if (!map.has(t.id)) map.set(t.id, t);
      }
    }
    return Array.from(map.values());
  }, [recentTracks, likedTracks, personalRecs, collections]);

  // 6 Quick-Pick rectangular cards matching the reference screenshot
  const quickPickTracks = useMemo(() => {
    if (activeMood === 'all') {
      return allCatalogTracks.slice(0, 6);
    }
    const chip = MOOD_CHIPS.find((m) => m.id === activeMood);
    if (!chip) return allCatalogTracks.slice(0, 6);

    const byCol = collections
      .filter((c) => chip.colIds.includes(c.id))
      .flatMap((c) => c.tracks);
    const byKeyword = allCatalogTracks.filter((t) =>
      chip.keywords.test(`${t.genre} ${t.artist} ${t.title}`)
    );

    const seen = new Set<string>();
    const combined: Track[] = [];
    for (const t of [...byCol, ...byKeyword]) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        combined.push(t);
      }
      if (combined.length >= 6) break;
    }
    return combined.length > 0 ? combined : allCatalogTracks.slice(0, 6);
  }, [activeMood, allCatalogTracks, collections]);

  // "Lanjutkan" editorial large cards (recent tracks + featured artists)
  const continueItems = useMemo(() => {
    const items: {
      key: string;
      title: string;
      subtitle: string;
      artworkUrl: string;
      trackId?: string;
      onClick: () => void;
    }[] = [];

    const usedTitles = new Set<string>();
    for (const artist of featuredArtists.slice(0, 8)) {
      usedTitles.add(artist.name.toLowerCase());
      items.push({
        key: `artist-${artist.name}`,
        title: artist.name,
        subtitle: artist.genre,
        artworkUrl: artist.artworkUrl,
        onClick: () => onArtistClick(artist.name),
      });
    }

    for (const t of recentTracks.slice(0, 6)) {
      if (usedTitles.has(t.title.toLowerCase())) continue;
      usedTitles.add(t.title.toLowerCase());
      items.unshift({
        key: `recent-${t.id}`,
        title: t.title,
        subtitle: t.artist,
        artworkUrl: t.artworkUrl,
        trackId: t.id,
        onClick: () =>
          void playTrackList(
            recentTracks,
            recentTracks.findIndex((x) => x.id === t.id)
          ),
      });
    }

    return items.slice(0, 10);
  }, [featuredArtists, recentTracks, onArtistClick, playTrackList]);

  const activeCol = useMemo(() => {
    if (collections.length === 0) return null;
    if (activeMood !== 'all') {
      const chip = MOOD_CHIPS.find((m) => m.id === activeMood);
      if (chip) {
        const matched = collections.find((c) => chip.colIds.includes(c.id));
        if (matched) return matched;
      }
    }
    return collections.find((c) => c.id === selectedColId) || collections[0] || null;
  }, [collections, selectedColId, activeMood]);

  const streakTitleText = evaluatedStreak.isExtinguished
    ? 'Api padam'
    : evaluatedStreak.displayStreak > 0
    ? `${evaluatedStreak.displayStreak} hari berturut-turut`
    : 'Nyalakan api hari ke-1';

  const streakSubText = getStreakStageTitle(
    evaluatedStreak.displayStreak,
    evaluatedStreak.isExtinguished
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Offline mode priority banner */}
      {(offlineMode || !isOnline) && (
        <section className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-semibold">
              <WifiOff size={15} />
              <span>{!isOnline ? 'Koneksi Terputus — Mode Offline Aktif' : 'Mode Offline Aktif'}</span>
            </div>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5">
              {offlineTracks.length} lagu tersimpan permanen di perangkat siap diputar tanpa internet.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {offlineTracks.length > 0 && (
              <button
                type="button"
                onClick={() => void playTrackList(offlineTracks, 0)}
                className="svara-press px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold whitespace-nowrap cursor-pointer shadow-sm"
              >
                Putar Offline
              </button>
            )}
            <button
              type="button"
              onClick={onOpenOfflineLibrary}
              className="svara-press px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200 text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              Kelola
            </button>
          </div>
        </section>
      )}

      {/* Clean Modern Header Greeting */}
      <section className="flex items-end justify-between gap-4 pt-1">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-zinc-900 dark:text-white tracking-tight">
            {greeting}
          </h1>
          {currentTrack && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 truncate max-w-md">
              Sedang diputar ·{' '}
              <span className="text-zinc-900 dark:text-zinc-200 font-medium">
                {currentTrack.title}
              </span>{' '}
              — {currentTrack.artist}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenAI}
          className="svara-press hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-white/[0.06] hover:bg-zinc-100 dark:hover:bg-white/[0.11] border border-zinc-200 dark:border-white/[0.08] text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
        >
          <Sparkles size={14} className="svara-accent-text" />
          <span>Kurator Musik</span>
        </button>
      </section>

      {/* 6-Item Quick-Pick Grid (2 cols on mobile, 3 cols on desktop) */}
      {loading && quickPickTracks.length === 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-14 rounded-xl bg-zinc-200 dark:bg-zinc-900/70 animate-pulse" />
          ))}
        </div>
      ) : quickPickTracks.length > 0 ? (
        <section aria-label="Pilihan Cepat">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            {quickPickTracks.map((track, idx) => {
              const active = currentTrack?.id === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => void playTrackList(quickPickTracks, idx)}
                  style={
                    active
                      ? {
                          boxShadow: '0 8px 24px -10px rgba(var(--svara-accent-rgb), 0.35)',
                        }
                      : undefined
                  }
                  className={`svara-press group flex items-center gap-3 rounded-xl overflow-hidden text-left border transition-all cursor-pointer min-h-[56px] pr-2.5 ${
                    active
                      ? 'bg-[rgba(var(--svara-accent-rgb),0.12)] border-[var(--svara-accent)]'
                      : 'bg-white/95 dark:bg-[#18181D]/90 hover:bg-zinc-100 dark:hover:bg-[#23232A] border-zinc-200/90 dark:border-white/[0.06] shadow-xs'
                  }`}
                >
                  <div className="relative w-14 h-14 shrink-0 overflow-hidden bg-zinc-200 dark:bg-zinc-900">
                    <TrackArtwork
                      trackId={track.id}
                      src={track.artworkUrl}
                      alt={track.title}
                      className={`w-14 h-14 rounded-none transition-transform duration-500 ${
                        active && isPlaying && !lowRamMode ? 'scale-105' : ''
                      }`}
                      iconSize={20}
                    />
                  </div>
                  <span
                    className={`text-xs sm:text-sm font-semibold leading-snug line-clamp-2 break-words flex-1 ${
                      active ? 'svara-accent-text' : 'text-zinc-900 dark:text-white'
                    }`}
                  >
                    {track.title}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Sleek Streak Api 🔥 Card */}
      <section>
        <button
          type="button"
          onClick={onOpenWrapped}
          className="svara-press w-full text-left rounded-2xl bg-white/95 dark:bg-[#16161B]/95 hover:bg-zinc-50 dark:hover:bg-[#1D1D24] border border-zinc-200 dark:border-white/[0.06] px-5 py-4 flex items-center justify-between gap-4 transition-colors group cursor-pointer shadow-sm"
        >
          <div className="flex items-center gap-4 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                evaluatedStreak.isExtinguished
                  ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'
                  : 'bg-gradient-to-br from-orange-500/20 to-amber-500/15 text-orange-500 dark:text-orange-400'
              }`}
            >
              <Flame
                size={26}
                className={
                  evaluatedStreak.isExtinguished
                    ? 'text-zinc-500 dark:text-zinc-600'
                    : 'text-orange-500 dark:text-orange-400 fill-orange-400/90 drop-shadow-[0_0_12px_rgba(251,146,60,0.45)]'
                }
              />
            </div>

            <div className="min-w-0">
              <p className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white leading-tight truncate tabular-nums">
                {streakTitleText}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                {streakSubText}
                {weeklyWrapped.totalMinutes > 0 ? ` · ${weeklyWrapped.totalMinutes} mnt minggu ini` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white shrink-0">
            <span className="hidden sm:inline">Wrapped</span>
            <ChevronRight size={16} />
          </div>
        </button>
      </section>

      {/* Horizontal Mood Filter Chips */}
      <section aria-label="Filter Suasana Musik">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {MOOD_CHIPS.map((chip) => {
            const active = activeMood === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveMood(chip.id)}
                className={`svara-press px-4 py-2.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white font-semibold shadow-sm'
                    : 'bg-white dark:bg-[#19191F] hover:bg-zinc-100 dark:hover:bg-[#23232B] text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-white/[0.06]'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* "Lanjutkan" Large Portrait / Square Editorial Carousel */}
      {continueItems.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Lanjutkan
            </h2>
            <span className="text-xs text-zinc-500">Artis &amp; Putar Terakhir</span>
          </div>

          <div className="flex items-stretch gap-3.5 overflow-x-auto pb-2 pt-0.5">
            {continueItems.map((item) => {
              const isActiveTrack = item.trackId && currentTrack?.id === item.trackId;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className={`svara-press group relative w-44 sm:w-48 aspect-[4/5] shrink-0 rounded-2xl overflow-hidden border bg-zinc-900 text-left transition-all duration-200 cursor-pointer shadow-lg ${
                    isActiveTrack
                      ? 'border-[var(--svara-accent)] shadow-[0_12px_28px_-10px_rgba(var(--svara-accent-rgb),0.45)]'
                      : 'border-zinc-200 dark:border-white/[0.07] hover:border-[var(--svara-accent)]'
                  }`}
                >
                  <TrackArtwork
                    trackId={item.trackId}
                    src={item.artworkUrl}
                    alt={item.title}
                    className="w-full h-full rounded-none transition-transform duration-300 group-hover:scale-105"
                    iconSize={40}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <p className="text-sm font-bold text-white truncate leading-tight">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-zinc-300 truncate mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* "Andalanmu" Personalized Mix Section */}
      {(personalRecs || personalRecsLoading) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold svara-accent-text uppercase tracking-wider">Kurasi Algoritma Cerdas</p>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
                Andalanmu
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {personalRecs?.subtitle || 'Racikan personal menyesuaikan selera & riwayat putar musikmu secara real-time.'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void refreshPersonalRecs(true)}
                disabled={personalRecsLoading}
                aria-label="Segarkan rekomendasi personal"
                className="svara-press min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-white dark:bg-[#19191F] hover:bg-zinc-100 dark:hover:bg-[#23232B] border border-zinc-200 dark:border-white/[0.07] text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <RefreshCw size={14} className={personalRecsLoading ? 'animate-spin' : ''} />
              </button>
              {personalRecs && personalRecs.tracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => void playTrackList(personalRecs.tracks, 0)}
                  className="svara-press flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold whitespace-nowrap cursor-pointer shadow-sm"
                >
                  <Play size={13} className="fill-current" />
                  <span>Putar Mix</span>
                </button>
              )}
            </div>
          </div>

          {personalRecsLoading && !personalRecs ? (
            <div className="flex gap-3 overflow-x-auto">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="w-40 aspect-square shrink-0 rounded-2xl bg-zinc-200 dark:bg-zinc-900/70 animate-pulse" />
              ))}
            </div>
          ) : personalRecs && personalRecs.tracks.length > 0 ? (
            <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
              {personalRecs.tracks.slice(0, 8).map((track, idx) => {
                const isActive = currentTrack?.id === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => void playTrackList(personalRecs.tracks, idx)}
                    className={`svara-press group w-36 sm:w-44 shrink-0 text-left rounded-2xl p-2.5 border transition-all cursor-pointer shadow-xs ${
                      isActive
                        ? 'bg-[rgba(var(--svara-accent-rgb),0.1)] border-[var(--svara-accent)]'
                        : 'bg-white/95 dark:bg-[#141419] hover:bg-zinc-50 dark:hover:bg-[#1B1B22] border-zinc-200 dark:border-white/[0.06] hover:border-[var(--svara-accent)]'
                    }`}
                  >
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden mb-2">
                      <TrackArtwork
                        trackId={track.id}
                        src={track.artworkUrl}
                        alt={track.title}
                        className="w-full h-full rounded-xl transition-transform duration-300 group-hover:scale-105"
                        iconSize={26}
                      />
                      <div className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white text-zinc-950 flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all shadow-lg">
                        <Play size={14} className="fill-zinc-950 ml-0.5" />
                      </div>
                    </div>
                    <p
                      className={`text-xs sm:text-sm font-semibold truncate leading-snug ${
                        isActive ? 'svara-accent-text' : 'text-zinc-900 dark:text-white'
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {track.artist}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      )}

      {/* Dynamic "Mirip dengan [Artist]" Editorial Sections (Matching User Screenshot Request) */}
      <section className="space-y-7 pt-4">
        {/* Section 1: Mirip dengan Tulus */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onArtistClick('Tulus')}
              className="group flex items-center gap-1.5 text-left cursor-pointer"
            >
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Mirip dengan</p>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors flex items-center gap-1.5">
                  <span>Tulus</span>
                  <ChevronRight size={20} className="transition-transform group-hover:translate-x-1" />
                </h2>
              </div>
            </button>
          </div>

          <div className="flex items-stretch gap-3.5 overflow-x-auto pb-2">
            {allCatalogTracks
              .filter((t) => /tulus|bernadya|hindia|rizky febian|sofia|rahasia hati/i.test(`${t.artist} ${t.title} ${t.genre}`))
              .slice(0, 5)
              .map((track, idx, arr) => (
                <button
                  key={`tulus-like-${track.id}`}
                  type="button"
                  onClick={() => void playTrackList(arr, idx)}
                  className="svara-press group relative w-40 sm:w-48 aspect-[4/5] shrink-0 rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/[0.07] hover:border-[var(--svara-accent)] bg-zinc-900 text-left transition-all duration-200 cursor-pointer shadow-lg"
                >
                  <TrackArtwork
                    trackId={track.id}
                    src={track.artworkUrl}
                    alt={track.title}
                    className="w-full h-full rounded-none transition-transform duration-300 group-hover:scale-105"
                    iconSize={36}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <p className="text-sm font-bold text-white truncate leading-tight">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-zinc-300 truncate mt-0.5">
                      {track.artist}
                    </p>
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Section 2: Mirip dengan Hoobastank */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onArtistClick('Hoobastank')}
              className="group flex items-center gap-1.5 text-left cursor-pointer"
            >
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Mirip dengan</p>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors flex items-center gap-1.5">
                  <span>Hoobastank</span>
                  <ChevronRight size={20} className="transition-transform group-hover:translate-x-1" />
                </h2>
              </div>
            </button>
          </div>

          <div className="flex items-stretch gap-3.5 overflow-x-auto pb-2">
            {allCatalogTracks
              .filter((t) => /hoobastank|reason|avenged|linkin|sheila|dewa|rock|metal/i.test(`${t.artist} ${t.title} ${t.genre}`))
              .slice(0, 5)
              .map((track, idx, arr) => (
                <button
                  key={`hooba-like-${track.id}`}
                  type="button"
                  onClick={() => void playTrackList(arr, idx)}
                  className="svara-press group relative w-40 sm:w-48 aspect-[4/5] shrink-0 rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/[0.07] hover:border-[var(--svara-accent)] bg-zinc-900 text-left transition-all duration-200 cursor-pointer shadow-lg"
                >
                  <TrackArtwork
                    trackId={track.id}
                    src={track.artworkUrl}
                    alt={track.title}
                    className="w-full h-full rounded-none transition-transform duration-300 group-hover:scale-105"
                    iconSize={36}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <p className="text-sm font-bold text-white truncate leading-tight">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-zinc-300 truncate mt-0.5">
                      {track.artist}
                    </p>
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Section 3: Mirip dengan One Direction */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onArtistClick('One Direction')}
              className="group flex items-center gap-1.5 text-left cursor-pointer"
            >
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Mirip dengan</p>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors flex items-center gap-1.5">
                  <span>One Direction</span>
                  <ChevronRight size={20} className="transition-transform group-hover:translate-x-1" />
                </h2>
              </div>
            </button>
          </div>

          <div className="flex items-stretch gap-3.5 overflow-x-auto pb-2">
            {allCatalogTracks
              .filter((t) => /one direction|taylor|bruno|pop|global|hit/i.test(`${t.artist} ${t.title} ${t.genre}`))
              .slice(0, 5)
              .map((track, idx, arr) => (
                <button
                  key={`1d-like-${track.id}`}
                  type="button"
                  onClick={() => void playTrackList(arr, idx)}
                  className="svara-press group relative w-40 sm:w-48 aspect-[4/5] shrink-0 rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/[0.07] hover:border-[var(--svara-accent)] bg-zinc-900 text-left transition-all duration-200 cursor-pointer shadow-lg"
                >
                  <TrackArtwork
                    trackId={track.id}
                    src={track.artworkUrl}
                    alt={track.title}
                    className="w-full h-full rounded-none transition-transform duration-300 group-hover:scale-105"
                    iconSize={36}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <p className="text-sm font-bold text-white truncate leading-tight">
                      {track.title}
                    </p>
                    <p className="text-[11px] text-zinc-300 truncate mt-0.5">
                      {track.artist}
                    </p>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </section>

      {/* Curated Collections & Full Tracklist */}
      <section className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
              Koleksi Pilihan
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Putar penuh, simpan ke playlist, atau unduh untuk mode offline
            </p>
          </div>

          {collections.length > 0 && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#16161B] border border-zinc-200 dark:border-white/[0.07] overflow-x-auto max-w-full">
              {collections.map((col) => {
                const isSelected = activeCol?.id === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => {
                      setActiveMood('all');
                      setSelectedColId(col.id);
                    }}
                    className={`svara-press px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-white dark:bg-white text-zinc-950 font-semibold shadow-sm'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {col.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {loading && collections.length === 0 ? (
          <div className="h-64 rounded-2xl bg-zinc-200/70 dark:bg-zinc-900/40 border border-zinc-200 dark:border-white/[0.05] animate-pulse" />
        ) : error && collections.length === 0 ? (
          <div className="svara-card rounded-2xl p-6 text-center">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="svara-press mt-3 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 text-xs font-semibold cursor-pointer"
            >
              Muat Ulang Katalog
            </button>
          </div>
        ) : activeCol ? (
          <div className="svara-card rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-white/[0.06]">
              <div>
                <p className="text-xs font-medium svara-accent-text">
                  {activeCol.category} · {activeCol.tracks.length} lagu
                </p>
                <h3 className="font-display text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
                  {activeCol.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void downloadPlaylist(activeCol.tracks)}
                  className="svara-press flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-[#1B1B22] hover:bg-zinc-200 dark:hover:bg-[#24242D] border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
                >
                  <Download size={14} />
                  <span>Unduh Semua</span>
                </button>
                <button
                  type="button"
                  onClick={() => void playTrackList(activeCol.tracks, 0)}
                  className="svara-press flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold whitespace-nowrap cursor-pointer shadow-sm"
                >
                  <Play size={14} className="fill-zinc-950" />
                  <span>Putar Semua</span>
                </button>
              </div>
            </div>

            <div className="mt-2.5 space-y-0.5">
              {activeCol.tracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  contextList={activeCol.tracks}
                  onArtistClick={onArtistClick}
                  onAlbumClick={onAlbumClick}
                  onAddToPlaylistClick={onAddToPlaylist}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
};
