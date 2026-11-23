import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  Download,
  Edit3,
  FileAudio,
  HardDrive,
  Heart,
  History,
  Loader2,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Shield,
  Star,
  Trash2,
  Upload,
  WifiOff,
  Zap,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { TrackRow } from '@/src/components/TrackRow';
import { usePlayer } from '@/src/context/PlayerContext';
import { formatBytes } from '@/src/lib/offlineDb';
import type { PlayHistoryEntry, Track } from '@/src/types/music';

interface LibraryOfflineViewProps {
  selectedPlaylistId: string | null;
  onSelectPlaylist: (id: string | null) => void;
  onOpenCreatePlaylist: () => void;
  onArtistClick: (artistName: string) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
  onAddToPlaylist: (track: Track) => void;
}

type LibrarySubTab = 'playlists' | 'liked' | 'history' | 'offline';

function getHistoryDayGroup(ts: number): 'Hari Ini' | 'Kemarin' | 'Sebelumnya' {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86400000;
  if (ts >= startToday) return 'Hari Ini';
  if (ts >= startYesterday) return 'Kemarin';
  return 'Sebelumnya';
}

export const LibraryOfflineView: React.FC<LibraryOfflineViewProps> = ({
  selectedPlaylistId,
  onSelectPlaylist,
  onOpenCreatePlaylist,
  onArtistClick,
  onAlbumClick,
  onAddToPlaylist,
}) => {
  const {
    playlists,
    likedTracks,
    trackRatings,
    playHistory,
    clearPlayHistory,
    offlineRecords,
    totalOfflineBytes,
    offlineMode,
    setOfflineMode,
    storageInfo,
    enablePermanentStorage,
    lowRamMode,
    setLowRamMode,
    playTrackList,
    downloadPlaylist,
    importLocalFiles,
    removeOffline,
    clearAllOffline,
    deletePlaylist,
    renamePlaylist,
    removeTrackFromPlaylist,
    cloudUser,
    cloudAuthReady,
    cloudSyncing,
    lastSyncedAt,
    signInCloud,
    signOutCloud,
    syncCloudNow,
    vaultSyncCode,
    saveVaultServer,
    restoreVaultServer,
    exportBackupJson,
    importBackupJson,
    showToast,
  } = usePlayer();

  const [subTab, setSubTab] = useState<LibrarySubTab>('playlists');
  const [likedFilter, setLikedFilter] = useState<'all' | 'top_rated'>('all');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [restoreCodeInput, setRestoreCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [importingLocal, setImportingLocal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const localAudioInputRef = useRef<HTMLInputElement | null>(null);

  const activePlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId]
  );

  const offlineTracks = useMemo(
    () => offlineRecords.map((r) => r.track),
    [offlineRecords]
  );

  // Pool all tracks rated >= 4 stars from liked, playlists, and play history
  const topRatedTracks = useMemo(() => {
    const map = new Map<string, Track>();
    const consider = (t: Track) => {
      if ((trackRatings[t.id] ?? 0) >= 4 && !map.has(t.id)) {
        map.set(t.id, t);
      }
    };
    likedTracks.forEach(consider);
    playlists.forEach((p) => p.tracks.forEach(consider));
    playHistory.forEach((h) => consider(h.track));
    return Array.from(map.values()).sort(
      (a, b) => (trackRatings[b.id] ?? 0) - (trackRatings[a.id] ?? 0)
    );
  }, [likedTracks, playHistory, playlists, trackRatings]);

  const displayedLikedTracks = likedFilter === 'top_rated' ? topRatedTracks : likedTracks;

  const groupedHistory = useMemo(() => {
    const groups: Record<'Hari Ini' | 'Kemarin' | 'Sebelumnya', PlayHistoryEntry[]> = {
      'Hari Ini': [],
      Kemarin: [],
      Sebelumnya: [],
    };
    for (const entry of playHistory) {
      groups[getHistoryDayGroup(entry.playedAt)].push(entry);
    }
    return groups;
  }, [playHistory]);

  const handleCopySyncCode = async () => {
    try {
      await navigator.clipboard.writeText(vaultSyncCode);
      setCopiedCode(true);
      showToast('Kode sinkronisasi disalin', 'success');
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      showToast(`Kode Anda: ${vaultSyncCode}`, 'info');
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        importBackupJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLocalAudioImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImportingLocal(true);
    await importLocalFiles(files);
    setImportingLocal(false);
    e.target.value = '';
  };

  // Specific Playlist Detail View
  if (activePlaylist) {
    return (
      <div className="space-y-6 pb-10 svara-page-enter">
        <button
          type="button"
          onClick={() => onSelectPlaylist(null)}
          className="svara-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
        >
          ← Semua Playlist Personal
        </button>

        <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.08] p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="flex items-center gap-5">
            <TrackArtwork
              trackId={activePlaylist.tracks[0]?.id}
              src={
                activePlaylist.tracks[0]?.artworkUrl ||
                (activePlaylist.coverUrl &&
                !activePlaylist.coverUrl.startsWith('/src/assets/images/')
                  ? activePlaylist.coverUrl
                  : '')
              }
              alt={activePlaylist.name}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border border-zinc-200 dark:border-white/10 shadow-xl"
              iconSize={32}
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold svara-accent-text">
                Playlist Personal · {activePlaylist.tracks.length} lagu
              </p>

              {editingPlaylistId === activePlaylist.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    renamePlaylist(activePlaylist.id, editName);
                    setEditingPlaylistId(null);
                  }}
                  className="mt-1 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="h-9 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-[var(--svara-accent)] text-base font-bold text-zinc-900 dark:text-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="svara-press px-3 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-xs font-semibold cursor-pointer"
                  >
                    Simpan
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white truncate">
                    {activePlaylist.name}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPlaylistId(activePlaylist.id);
                      setEditName(activePlaylist.name);
                    }}
                    aria-label="Ubah nama playlist"
                    className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>
              )}

              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {activePlaylist.description || 'Playlist pribadi yang tersimpan aman.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activePlaylist.tracks.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void downloadPlaylist(activePlaylist.tracks)}
                  className="svara-press flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
                >
                  <Download size={14} />
                  <span>Unduh Offline</span>
                </button>
                <button
                  type="button"
                  onClick={() => void playTrackList(activePlaylist.tracks, 0)}
                  className="svara-press flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  <Play size={14} className="fill-zinc-950" />
                  <span>Putar Semua</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                deletePlaylist(activePlaylist.id);
                onSelectPlaylist(null);
              }}
              aria-label="Hapus playlist"
              className="svara-press p-2.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-rose-500/15 border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-4 sm:p-6">
          {activePlaylist.tracks.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Playlist ini masih kosong. Tambahkan lagu dari Beranda, Pencarian, atau Kurator Musik menggunakan tombol <strong className="text-zinc-900 dark:text-zinc-200">+</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {activePlaylist.tracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  contextList={activePlaylist.tracks}
                  onArtistClick={onArtistClick}
                  onAlbumClick={onAlbumClick}
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => removeTrackFromPlaylist(activePlaylist.id, track.id)}
                      title="Keluarkan dari playlist"
                      aria-label="Keluarkan dari playlist"
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md text-zinc-400 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header + Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-200/80 dark:bg-zinc-900/90 border border-zinc-200 dark:border-white/[0.07] overflow-x-auto max-w-full self-start no-scrollbar">
          <button
            type="button"
            onClick={() => setSubTab('playlists')}
            className={`svara-press px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              subTab === 'playlists'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200'
            }`}
          >
            Playlist ({playlists.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('liked')}
            className={`svara-press px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              subTab === 'liked'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200'
            }`}
          >
            Disukai &amp; Rating ({likedTracks.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('history')}
            className={`svara-press px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              subTab === 'history'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200'
            }`}
          >
            Riwayat Putar ({playHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('offline')}
            className={`svara-press px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              subTab === 'offline'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-200'
            }`}
          >
            Mode Offline ({offlineRecords.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenCreatePlaylist}
          className="svara-press flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          <Plus size={15} />
          <span>Buat Playlist Baru</span>
        </button>
      </div>

      {/* Playlists Tab */}
      {subTab === 'playlists' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => onSelectPlaylist(pl.id)}
              className="svara-press svara-card group text-left p-4 rounded-2xl border border-zinc-200 dark:border-white/[0.07] hover:border-[var(--svara-accent)] flex items-center gap-4 cursor-pointer"
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
                className="w-16 h-16 rounded-xl"
                iconSize={22}
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-bold text-zinc-900 dark:text-white group-hover:svara-accent-text truncate transition-colors">
                  {pl.name}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                  {pl.description || 'Playlist pribadi'}
                </p>
                <p className="text-xs text-zinc-500 tabular-nums mt-1.5">
                  {pl.tracks.length} lagu
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Liked & Star-Rated Tracks Tab */}
      {subTab === 'liked' && (
        <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-white/[0.07]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[rgba(var(--svara-accent-rgb),0.15)] border border-[rgba(var(--svara-accent-rgb),0.3)] flex items-center justify-center svara-accent-text">
                {likedFilter === 'top_rated' ? (
                  <Star size={20} className="fill-amber-400 text-amber-400" />
                ) : (
                  <Heart size={20} className="fill-current" />
                )}
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
                  {likedFilter === 'top_rated' ? 'Lagu Rating 4–5 Bintang' : 'Lagu Disukai'}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {displayedLikedTracks.length} lagu
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setLikedFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    likedFilter === 'all'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  Disukai ({likedTracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setLikedFilter('top_rated')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    likedFilter === 'top_rated'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  Rating 4–5 ★ ({topRatedTracks.length})
                </button>
              </div>

              {displayedLikedTracks.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void downloadPlaylist(displayedLikedTracks)}
                    className="svara-press flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Unduh Semua</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void playTrackList(displayedLikedTracks, 0)}
                    className="svara-press flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold cursor-pointer"
                  >
                    <Play size={14} className="fill-zinc-950" />
                    <span>Putar Semua</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {displayedLikedTracks.length === 0 ? (
            <p className="py-10 text-sm text-zinc-500 dark:text-zinc-400 text-center">
              {likedFilter === 'top_rated'
                ? 'Belum ada lagu yang dinilai 4 atau 5 bintang. Klik ikon bintang di daftar lagu atau pemutar.'
                : 'Belum ada lagu yang disukai. Tekan ikon hati pada lagu mana pun untuk menyimpannya di sini.'}
            </p>
          ) : (
            <div className="mt-3 space-y-0.5">
              {displayedLikedTracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  contextList={displayedLikedTracks}
                  onArtistClick={onArtistClick}
                  onAlbumClick={onAlbumClick}
                  onAddToPlaylistClick={onAddToPlaylist}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full Play History Tab */}
      {subTab === 'history' && (
        <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-white/[0.07]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[rgba(var(--svara-accent-rgb),0.15)] border border-[rgba(var(--svara-accent-rgb),0.3)] flex items-center justify-center svara-accent-text">
                <History size={20} />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
                  Riwayat Putar Lengkap
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {playHistory.length} pemutaran terekam (maks. 200 entri terbaru)
                </p>
              </div>
            </div>

            {playHistory.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void playTrackList(playHistory.map((h) => h.track), 0)}
                  className="svara-press flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold cursor-pointer"
                >
                  <Play size={14} className="fill-zinc-950" />
                  <span>Putar Ulang Riwayat</span>
                </button>
                <button
                  type="button"
                  onClick={clearPlayHistory}
                  className="svara-press px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-rose-500/15 border border-zinc-200 dark:border-white/10 text-xs text-zinc-600 dark:text-zinc-400 hover:text-rose-500 dark:hover:text-rose-300 cursor-pointer"
                >
                  Bersihkan
                </button>
              </div>
            )}
          </div>

          {playHistory.length === 0 ? (
            <p className="py-10 text-sm text-zinc-500 dark:text-zinc-400 text-center">
              Belum ada riwayat pemutaran lagu. Putar lagu apa saja untuk mencatat jejak musikmu di sini.
            </p>
          ) : (
            <div className="space-y-6">
              {(['Hari Ini', 'Kemarin', 'Sebelumnya'] as const).map((groupLabel) => {
                const items = groupedHistory[groupLabel];
                if (items.length === 0) return null;
                return (
                  <div key={groupLabel} className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider svara-accent-text px-2">
                      {groupLabel} ({items.length})
                    </h3>
                    <div className="space-y-0.5">
                      {items.map((entry, idx) => (
                        <TrackRow
                          key={entry.id}
                          track={entry.track}
                          index={idx}
                          contextList={items.map((x) => x.track)}
                          onArtistClick={onArtistClick}
                          onAlbumClick={onAlbumClick}
                          onAddToPlaylistClick={onAddToPlaylist}
                          rightSlot={
                            <span className="hidden lg:inline font-mono text-[11px] text-zinc-500 tabular-nums mr-1">
                              {new Date(entry.playedAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Offline Storage, Local FLAC/ALAC Import & Device Protection Tab */}
      {subTab === 'offline' && (
        <div className="space-y-4">
          <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                <WifiOff size={16} className={offlineMode ? 'text-amber-500' : 'text-zinc-400'} />
                <span>Penyimpanan Mode Offline &amp; Audio Lossless Lokal</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                {offlineRecords.length} lagu + sampul + lirik tersimpan ({formatBytes(totalOfflineBytes)})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={importingLocal}
                onClick={() => localAudioInputRef.current?.click()}
                className="svara-press flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer"
              >
                {importingLocal ? (
                  <Loader2 size={14} className="animate-spin svara-accent-text" />
                ) : (
                  <FileAudio size={14} className="svara-accent-text" />
                )}
                <span>Impor FLAC / ALAC / MP3</span>
              </button>
              <input
                ref={localAudioInputRef}
                type="file"
                multiple
                accept=".flac,.alac,.m4a,.wav,.mp3,.aac,audio/*"
                onChange={(e) => void handleLocalAudioImport(e)}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => setOfflineMode(!offlineMode)}
                className={`svara-press px-4 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                  offlineMode
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {offlineMode ? 'Matikan Mode Offline' : 'Aktifkan Mode Offline'}
              </button>

              {offlineTracks.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => void playTrackList(offlineTracks, 0)}
                    className="svara-press flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold cursor-pointer"
                  >
                    <Play size={14} className="fill-zinc-950" />
                    <span>Putar Offline</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void clearAllOffline()}
                    className="svara-press px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-rose-500/15 border border-zinc-200 dark:border-white/10 text-xs text-zinc-500 dark:text-zinc-400 hover:text-rose-500 dark:hover:text-rose-300 cursor-pointer"
                  >
                    Hapus Semua
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Persistent Storage Lock & Low-RAM Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                  <HardDrive size={15} className="text-emerald-500 dark:text-emerald-400" />
                  <span>Kunci Penyimpanan Perangkat</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  {storageInfo.persisted
                    ? 'Status: Terkunci Permanen. Browser tidak akan menghapus unduhan lagu Anda otomatis.'
                    : 'Aktifkan izin penyimpanan permanen agar unduhan lagu offline tetap awet di perangkat.'}
                </p>
                {storageInfo.quotaBytes > 0 && (
                  <p className="text-[11px] font-mono text-zinc-500 mt-1.5 tabular-nums">
                    Terpakai {formatBytes(storageInfo.usageBytes)} dari {formatBytes(storageInfo.quotaBytes)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void enablePermanentStorage()}
                disabled={storageInfo.persisted}
                className={`svara-press px-3 py-2 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                  storageInfo.persisted
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 cursor-default'
                    : 'bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white'
                }`}
              >
                {storageInfo.persisted ? 'Terkunci' : 'Kunci Permanen'}
              </button>
            </div>

            <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                  <Zap size={15} className="text-sky-500 dark:text-sky-400" />
                  <span>Mode Performa Ringan (RAM Rendah)</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Mengurangi efek blur berat dan animasi visualizer agar pemutaran tetap mulus di perangkat ringan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLowRamMode(!lowRamMode)}
                className={`svara-press px-3 py-2 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
                  lowRamMode
                    ? 'bg-sky-500 text-zinc-950'
                    : 'bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200'
                }`}
              >
                {lowRamMode ? 'Aktif' : 'Nonaktif'}
              </button>
            </div>
          </div>

          <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-4 sm:p-6">
            {offlineRecords.length === 0 ? (
              <p className="py-10 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                Belum ada lagu yang diunduh atau diimpor. Unduh lagu atau impor file FLAC/ALAC/MP3 lokal Anda untuk mendengarkan offline.
              </p>
            ) : (
              <div className="space-y-0.5">
                {offlineRecords.map((rec, idx) => (
                  <TrackRow
                    key={rec.id}
                    track={rec.track}
                    index={idx}
                    contextList={offlineTracks}
                    onArtistClick={onArtistClick}
                    onAlbumClick={onAlbumClick}
                    onAddToPlaylistClick={onAddToPlaylist}
                    rightSlot={
                      <div className="flex items-center gap-2">
                        <span className="hidden sm:inline font-mono text-[11px] text-zinc-500 tabular-nums">
                          {formatBytes(rec.sizeBytes)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeOffline(rec.id)}
                          title="Hapus dari penyimpanan offline"
                          aria-label="Hapus dari penyimpanan offline"
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md text-zinc-400 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cache-Proof Safe Playlist Vault & Cloud Sync Section */}
      <section className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.08] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-white/[0.07]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Shield size={14} />
              <span>Brankas Playlist Aman (Anti-Hilang Saat Hapus Cache)</span>
            </div>
            <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
              Sinkronisasi Cloud &amp; Cadangan Brankas
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Simpan playlist, lagu disukai, rating, api streak, dan riwayat Wrapped agar tetap utuh meskipun cache dibersihkan.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Layer 1: Firebase Google Cloud Sync */}
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-white/[0.06] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                <Cloud size={16} className="text-emerald-500 dark:text-emerald-400" />
                <span>Sinkronisasi Akun Google</span>
              </div>
              {cloudUser && (
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  Tersambung
                </span>
              )}
            </div>

            {cloudUser ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-600 dark:text-zinc-300">
                  Masuk sebagai{' '}
                  <strong className="text-zinc-900 dark:text-white">
                    {cloudUser.displayName || cloudUser.email}
                  </strong>
                  {lastSyncedAt && (
                    <span className="text-zinc-500 block mt-0.5">
                      Sinkron terakhir: {new Date(lastSyncedAt).toLocaleTimeString('id-ID')}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void syncCloudNow()}
                    disabled={cloudSyncing}
                    className="svara-press flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {cloudSyncing ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    <span>Sinkronkan Sekarang</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOutCloud()}
                    className="svara-press flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
                  >
                    <LogOut size={13} />
                    <span>Keluar</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Masuk dengan Google untuk mencadangkan seluruh playlist pribadi &amp; statistik secara otomatis lintas perangkat.
                </p>
                <button
                  type="button"
                  onClick={() => void signInCloud()}
                  disabled={!cloudAuthReady || cloudSyncing}
                  className="svara-press flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 text-xs font-semibold cursor-pointer"
                >
                  <Cloud size={14} />
                  <span>Masuk &amp; Sinkronkan dengan Google</span>
                </button>
              </div>
            )}
          </div>

          {/* Layer 2 & 3: Server Disk Vault Code + JSON Backup */}
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-white/[0.06] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                Kode Brankas &amp; File Cadangan
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-emerald-600 dark:text-emerald-300">
                  {vaultSyncCode}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopySyncCode()}
                  title="Salin kode brankas"
                  aria-label="Salin kode brankas"
                  className="p-1.5 rounded-md bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-transparent text-zinc-600 dark:text-zinc-300 cursor-pointer"
                >
                  {copiedCode ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={vaultBusy}
                onClick={async () => {
                  setVaultBusy(true);
                  await saveVaultServer();
                  setVaultBusy(false);
                }}
                className="svara-press flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-900 dark:text-white cursor-pointer disabled:opacity-60"
              >
                <Shield size={13} className="text-emerald-500 dark:text-emerald-400" />
                <span>Simpan ke Brankas Server</span>
              </button>
              <button
                type="button"
                onClick={exportBackupJson}
                className="svara-press flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
              >
                <Download size={13} />
                <span>Ekspor .svara.json</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="svara-press flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
              >
                <Upload size={13} />
                <span>Impor File</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileImport}
                className="hidden"
              />
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!restoreCodeInput.trim()) return;
                setVaultBusy(true);
                await restoreVaultServer(restoreCodeInput);
                setVaultBusy(false);
              }}
              className="flex items-center gap-2 pt-1"
            >
              <input
                type="text"
                value={restoreCodeInput}
                onChange={(e) => setRestoreCodeInput(e.target.value.toUpperCase())}
                placeholder="Masukkan kode brankas (mis. SVARA-XXXX)"
                className="flex-1 h-9 px-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-xs font-mono text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
              />
              <button
                type="submit"
                disabled={vaultBusy || !restoreCodeInput.trim()}
                className="svara-press h-9 px-3.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
              >
                Pulihkan
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};
