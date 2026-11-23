import React from 'react';
import {
  Check,
  Download,
  Heart,
  ListPlus,
  Loader2,
  Pause,
  Play,
  Plus,
  Star,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { usePlayer } from '@/src/context/PlayerContext';
import type { Track } from '@/src/types/music';

interface TrackRowProps {
  track: Track;
  index?: number;
  contextList?: Track[];
  onArtistClick?: (artistName: string) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
  onAddToPlaylistClick?: (track: Track) => void;
  rightSlot?: React.ReactNode;
  subtitleOverride?: string;
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

const TrackRowInner: React.FC<TrackRowProps> = ({
  track,
  index,
  contextList,
  onArtistClick,
  onAlbumClick,
  onAddToPlaylistClick,
  rightSlot,
  subtitleOverride,
}) => {
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    isLiked,
    toggleLike,
    trackRatings,
    rateTrack,
    offlineIds,
    downloadingIds,
    downloadTrack,
    removeOffline,
    playNextInQueue,
  } = usePlayer();

  const isCurrent = currentTrack?.id === track.id;
  const isOffline = offlineIds.has(track.id);
  const isDownloading = downloadingIds.has(track.id);
  const liked = isLiked(track.id);
  const rating = trackRatings[track.id] ?? 0;

  const handleRowPlay = () => {
    if (isCurrent) {
      void togglePlay();
    } else {
      void playTrack(track, contextList);
    }
  };

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 border ${
        isCurrent
          ? 'bg-zinc-100 dark:bg-zinc-900/95 border-[rgba(var(--svara-accent-rgb),0.45)] shadow-[0_8px_24px_-12px_rgba(var(--svara-accent-rgb),0.28)]'
          : 'border-transparent hover:bg-zinc-100/80 dark:hover:bg-zinc-900/70 hover:border-zinc-200 dark:hover:border-white/[0.06]'
      }`}
    >
      {/* Index / Play button */}
      <button
        type="button"
        onClick={handleRowPlay}
        aria-label={isCurrent && isPlaying ? `Jeda ${track.title}` : `Putar ${track.title}`}
        className="svara-press w-8 h-10 flex items-center justify-center shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded cursor-pointer"
      >
        {isCurrent && isPlaying ? (
          <Pause size={15} className="svara-accent-text fill-current" />
        ) : isCurrent ? (
          <Play size={15} className="svara-accent-text fill-current" />
        ) : (
          <>
            <span className="group-hover:hidden font-mono text-xs text-zinc-500">
              {index !== undefined ? index + 1 : '•'}
            </span>
            <Play size={15} className="hidden group-hover:block text-zinc-900 dark:text-white fill-current" />
          </>
        )}
      </button>

      {/* Artwork + Title & Artist & Clickable Album */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={handleRowPlay}
          className="svara-press relative shrink-0 rounded-lg overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
        >
          <TrackArtwork
            trackId={track.id}
            src={track.artworkUrl}
            alt={track.title}
            className="w-11 h-11 rounded-lg"
          />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={handleRowPlay}
            title={track.title}
            className={`block w-full text-left text-sm font-medium leading-snug break-words transition-colors cursor-pointer ${
              isCurrent
                ? 'svara-accent-text font-semibold'
                : 'text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white'
            }`}
          >
            {track.title}
          </button>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
            {onArtistClick ? (
              <button
                type="button"
                onClick={() => onArtistClick(track.artist)}
                className="hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline truncate text-left cursor-pointer"
              >
                {track.artist}
              </button>
            ) : (
              <span className="truncate">{track.artist}</span>
            )}
            <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-600">·</span>
            {onAlbumClick && track.album && !subtitleOverride && !track.isLocalFile ? (
              <button
                type="button"
                onClick={() => onAlbumClick(track.album, track.artist)}
                className="truncate text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:underline text-left cursor-pointer"
              >
                {track.album}
              </button>
            ) : (
              <span className="truncate text-zinc-500">
                {subtitleOverride || track.album}
              </span>
            )}
            {track.audioFormat && (
              <>
                <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-600">·</span>
                <span className="font-mono text-[10px] font-semibold svara-accent-text shrink-0">
                  {track.audioFormat}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Star Rating (compact interactive rating on desktop / visible when rated) */}
      <div
        className={`hidden sm:flex items-center gap-0.5 shrink-0 transition-opacity ${
          rating > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
        }`}
        aria-label="Penilaian lagu"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => rateTrack(track.id, star)}
            title={`Beri ${star} bintang`}
            aria-label={`Nilai ${star} bintang`}
            className="p-0.5 rounded hover:scale-110 transition-transform cursor-pointer"
          >
            <Star
              size={13}
              className={
                star <= rating
                  ? 'text-amber-400 fill-amber-400'
                  : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-300'
              }
            />
          </button>
        ))}
      </div>

      {/* Genre & Year on wide screens */}
      <div className="hidden xl:flex items-center gap-2 text-xs text-zinc-500 w-36 truncate shrink-0">
        <span className="truncate">{track.genre}</span>
        {track.releaseYear && (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums shrink-0">{track.releaseYear}</span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => toggleLike(track)}
          aria-label={liked ? 'Hapus dari Lagu Disukai' : 'Sukai lagu'}
          className={`svara-press min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
            liked
              ? 'text-emerald-500 dark:text-emerald-400'
              : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <Heart size={16} className={liked ? 'fill-current' : ''} />
        </button>

        <button
          type="button"
          onClick={() => (isOffline ? void removeOffline(track.id) : void downloadTrack(track))}
          disabled={isDownloading}
          title={isOffline ? 'Tersimpan offline (klik untuk hapus)' : 'Unduh permanen untuk Mode Offline'}
          aria-label={isOffline ? 'Hapus unduhan offline' : 'Unduh offline'}
          className={`svara-press min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
            isOffline
              ? 'text-emerald-500 dark:text-emerald-400 hover:text-amber-500'
              : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          {isDownloading ? (
            <Loader2 size={16} className="animate-spin text-emerald-500" />
          ) : isOffline ? (
            <Check size={16} />
          ) : (
            <Download size={16} />
          )}
        </button>

        <button
          type="button"
          onClick={() => playNextInQueue(track)}
          title="Putar berikutnya"
          aria-label="Putar berikutnya"
          className="svara-press hidden sm:flex min-w-[38px] min-h-[38px] items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
        >
          <ListPlus size={16} />
        </button>

        {onAddToPlaylistClick && (
          <button
            type="button"
            onClick={() => onAddToPlaylistClick(track)}
            title="Tambahkan ke playlist"
            aria-label="Tambahkan ke playlist"
            className="svara-press min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <Plus size={16} />
          </button>
        )}

        {rightSlot}

        <span className="hidden md:inline-block w-12 text-right font-mono text-xs text-zinc-500 tabular-nums">
          {formatDurationMs(track.durationMs)}
        </span>
      </div>
    </div>
  );
};

export const TrackRow = React.memo(TrackRowInner);
