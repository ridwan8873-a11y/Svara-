import React from 'react';
import {
  Loader2,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Star,
  X,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { usePlaybackTime } from '@/src/context/PlaybackTimeContext';
import { usePlayer } from '@/src/context/PlayerContext';

interface MiniPlayerWidgetProps {
  onExpand: () => void;
  onArtistClick: (artist: string) => void;
}

export const MiniPlayerWidget: React.FC<MiniPlayerWidgetProps> = ({
  onExpand,
  onArtistClick,
}) => {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    trackAccent,
    trackRatings,
    rateTrack,
    miniPlayerOpen,
    setMiniPlayerOpen,
    togglePlay,
    nextTrack,
    prevTrack,
  } = usePlayer();

  const { currentTime, duration } = usePlaybackTime();

  if (!miniPlayerOpen || !currentTrack) return null;

  const effectiveDuration = duration > 0 ? duration : currentTrack.durationMs / 1000;
  const progressPct =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const rating = trackRatings[currentTrack.id] ?? 0;

  return (
    <aside
      aria-label="Mini-Player Mengambang"
      style={{
        borderColor: `rgba(${trackAccent.rgb}, 0.42)`,
        boxShadow: `0 22px 48px -12px rgba(0,0,0,0.45), 0 0 28px -12px rgba(${trackAccent.rgb}, 0.35)`,
      }}
      className="hidden lg:flex fixed bottom-24 right-6 z-40 w-[330px] flex-col rounded-2xl bg-white/95 dark:bg-[#131318]/95 backdrop-blur-xl border overflow-hidden svara-page-enter"
    >
      {/* Top Progress Hairline */}
      <div className="h-1 w-full bg-zinc-200 dark:bg-white/[0.08]">
        <div
          className="h-full transition-[width] duration-200"
          style={{ width: `${progressPct}%`, backgroundColor: trackAccent.hex }}
        />
      </div>

      <div className="p-3.5 flex items-center gap-3">
        <button
          type="button"
          onClick={onExpand}
          title="Buka tampilan studio penuh"
          className="svara-press relative shrink-0 w-12 h-12 rounded-full overflow-hidden border border-zinc-200 dark:border-white/15 shadow-md cursor-pointer"
        >
          <TrackArtwork
            trackId={currentTrack.id}
            src={currentTrack.artworkUrl}
            alt={currentTrack.title}
            className={`w-12 h-12 rounded-full svara-vinyl-spin ${isPlaying ? 'is-spinning' : ''}`}
            iconSize={18}
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-white dark:bg-[#131318] border border-zinc-300 dark:border-white/30"
          />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onExpand}
            className="block w-full text-left text-xs font-bold text-zinc-900 dark:text-white truncate hover:underline cursor-pointer"
          >
            {currentTrack.title}
          </button>
          <button
            type="button"
            onClick={() => onArtistClick(currentTrack.artist)}
            className="block w-full text-left text-[11px] text-zinc-500 dark:text-zinc-400 truncate hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
          >
            {currentTrack.artist}
          </button>

          {/* Compact 5-Star Quick Rating */}
          <div className="flex items-center gap-0.5 mt-1" aria-label="Beri rating lagu">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => rateTrack(currentTrack.id, star)}
                aria-label={`Nilai ${star} bintang`}
                className="p-0.5 cursor-pointer"
              >
                <Star
                  size={11}
                  className={
                    star <= rating
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-300'
                  }
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void prevTrack()}
            aria-label="Lagu sebelumnya"
            className="svara-press w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <SkipBack size={14} className="fill-current" />
          </button>
          <button
            type="button"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? 'Jeda' : 'Putar'}
            style={{ backgroundColor: trackAccent.hex }}
            className="svara-press w-8 h-8 rounded-full text-zinc-950 flex items-center justify-center shadow cursor-pointer"
          >
            {isBuffering ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={14} className="fill-zinc-950" />
            ) : (
              <Play size={14} className="fill-zinc-950 ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void nextTrack()}
            aria-label="Lagu berikutnya"
            className="svara-press w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 cursor-pointer"
          >
            <SkipForward size={14} className="fill-current" />
          </button>
        </div>
      </div>

      <div className="px-3.5 py-1.5 bg-zinc-100/80 dark:bg-black/30 border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          onClick={onExpand}
          className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
        >
          <Maximize2 size={11} />
          <span>Buka Studio</span>
        </button>
        <button
          type="button"
          onClick={() => setMiniPlayerOpen(false)}
          aria-label="Tutup mini-player"
          className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
        >
          <X size={12} />
          <span>Tutup</span>
        </button>
      </div>
    </aside>
  );
};
