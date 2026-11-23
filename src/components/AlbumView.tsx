import React, { useEffect, useState } from 'react';
import { ArrowLeft, Disc3, Download, Loader2, Play, Shuffle } from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { TrackRow } from '@/src/components/TrackRow';
import { usePlayer } from '@/src/context/PlayerContext';
import type { AlbumDetail, Track } from '@/src/types/music';

interface AlbumViewProps {
  albumTitle: string;
  artistName?: string;
  onBack: () => void;
  onArtistClick: (artistName: string) => void;
  onAddToPlaylist: (track: Track) => void;
}

function formatTotalDuration(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h} jam ${m} mnt`;
  }
  return `${totalMin} menit`;
}

export const AlbumView: React.FC<AlbumViewProps> = ({
  albumTitle,
  artistName = '',
  onBack,
  onArtistClick,
  onAddToPlaylist,
}) => {
  const { currentTrack, isPlaying, playTrackList, downloadPlaylist } = usePlayer();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ title: albumTitle });
    if (artistName) params.set('artist', artistName);

    fetch(`/api/music/album?${params.toString()}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Album tidak ditemukan di katalog');
        return r.json();
      })
      .then((data: { album?: AlbumDetail }) => {
        setAlbum(data.album ?? null);
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          setError('Gagal memuat halaman album lengkap. Periksa koneksi Anda.');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [albumTitle, artistName]);

  const isAlbumPlaying =
    Boolean(isPlaying && currentTrack && album?.tracks.some((t) => t.id === currentTrack.id));

  const handleShufflePlay = () => {
    if (!album || album.tracks.length === 0) return;
    const shuffled = [...album.tracks].sort(() => Math.random() - 0.5);
    void playTrackList(shuffled, 0);
  };

  return (
    <div className="space-y-6 pb-10 svara-page-enter">
      <button
        type="button"
        onClick={onBack}
        className="svara-press inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
      >
        <ArrowLeft size={15} />
        <span>Kembali</span>
      </button>

      {loading ? (
        <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-8 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 size={18} className="animate-spin svara-accent-text" />
          <span>Memuat halaman album lengkap &ldquo;{albumTitle}&rdquo;...</span>
        </div>
      ) : error || !album ? (
        <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-8 text-center space-y-3">
          <Disc3 size={28} className="mx-auto text-zinc-400" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {error || 'Album tidak ditemukan.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Album Hero */}
          <div className="svara-card relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.08] p-6 sm:p-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(var(--svara-accent-rgb),0.16),transparent_62%)] pointer-events-none"
            />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="relative shrink-0 self-start">
                <div
                  aria-hidden="true"
                  className={`hidden sm:flex items-center justify-center absolute top-2 -right-7 w-28 h-28 rounded-full bg-zinc-900 border border-white/10 shadow-xl svara-vinyl-spin ${
                    isAlbumPlaying ? 'is-spinning' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-zinc-800 border-2 border-[var(--svara-accent)]" />
                </div>
                <TrackArtwork
                  src={album.artworkUrl}
                  alt={album.title}
                  className="relative z-10 w-32 h-32 sm:w-36 sm:h-36 rounded-2xl border border-zinc-200 dark:border-white/15 shadow-2xl"
                  iconSize={42}
                />
              </div>

              <div className="min-w-0 sm:pl-4">
                <p className="text-xs font-semibold uppercase tracking-wider svara-accent-text">
                  Album Lengkap · {album.genre}
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white mt-1 leading-tight">
                  {album.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 mt-2">
                  <button
                    type="button"
                    onClick={() => onArtistClick(album.artist)}
                    className="font-semibold text-zinc-900 dark:text-zinc-200 hover:underline cursor-pointer"
                  >
                    {album.artist}
                  </button>
                  {album.year && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{album.year}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{album.tracks.length} lagu</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{formatTotalDuration(album.totalDurationMs)}</span>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => void downloadPlaylist(album.tracks)}
                className="svara-press flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
              >
                <Download size={14} />
                <span>Unduh Album</span>
              </button>
              <button
                type="button"
                onClick={handleShufflePlay}
                className="svara-press flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
              >
                <Shuffle size={14} />
                <span>Acak</span>
              </button>
              <button
                type="button"
                onClick={() => void playTrackList(album.tracks, 0)}
                className="svara-press flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold whitespace-nowrap cursor-pointer shadow-md"
              >
                <Play size={14} className="fill-zinc-950" />
                <span>Putar Album</span>
              </button>
            </div>
          </div>

          {/* Album Tracklist */}
          <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-4 sm:p-6">
            <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white mb-3">
              Daftar Lagu Album
            </h2>
            {album.tracks.length === 0 ? (
              <p className="py-8 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                Daftar lagu album tidak tersedia.
              </p>
            ) : (
              <div className="space-y-0.5">
                {album.tracks.map((track, idx) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={idx}
                    contextList={album.tracks}
                    onArtistClick={onArtistClick}
                    onAddToPlaylistClick={onAddToPlaylist}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
