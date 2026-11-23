import React, { useEffect, useRef } from 'react';
import {
  AlignLeft,
  Cast,
  Check,
  Download,
  Heart,
  ListMusic,
  Loader2,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { usePlaybackTime } from '@/src/context/PlaybackTimeContext';
import { usePlayer } from '@/src/context/PlayerContext';
import { audioEngine } from '@/src/lib/audioEngine';

interface PlayerBarProps {
  onOpenStudioAudio: () => void;
  onOpenLyrics: () => void;
  onOpenPlaybackSettings: () => void;
  onOpenQueue: () => void;
  onArtistClick: (artistName: string) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const whole = Math.floor(sec);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  onOpenStudioAudio,
  onOpenLyrics,
  onOpenPlaybackSettings,
  onOpenQueue,
  onArtistClick,
  onAlbumClick,
}) => {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    volume,
    isMuted,
    shuffle,
    repeatMode,
    audioQuality,
    lowRamMode,
    trackAccent,
    themeMode,
    sleepTimerMode,
    miniPlayerOpen,
    setMiniPlayerOpen,
    promptCast,
    offlineIds,
    downloadingIds,
    isLiked,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    downloadTrack,
    removeOffline,
  } = usePlayer();

  const { currentTime, duration } = usePlaybackTime();
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const updateBars = (values: number[]) => {
      for (let i = 0; i < 10; i++) {
        const el = barRefs.current[i];
        if (el) {
          el.style.transform = `scaleY(${values[i] ?? 0.14})`;
        }
      }
    };

    if (!isPlaying || lowRamMode) {
      updateBars(new Array(10).fill(0.14));
      return;
    }

    const tick = () => {
      if (document.hidden) return;
      const next = audioEngine.getFrequencyBars(10);
      updateBars(next.map((v) => Math.max(0.14, v)));
    };

    const timer = window.setInterval(tick, 65);
    return () => window.clearInterval(timer);
  }, [isPlaying, lowRamMode]);

  if (!currentTrack) {
    return null;
  }

  const effectiveDuration = duration > 0 ? duration : currentTrack.durationMs / 1000;
  const progressPct = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const liked = isLiked(currentTrack.id);
  const isOffline = offlineIds.has(currentTrack.id);
  const isDownloading = downloadingIds.has(currentTrack.id);

  const qualityLabel =
    audioQuality === 'flac'
      ? 'FLAC'
      : audioQuality === 'alac'
      ? 'ALAC'
      : audioQuality === 'hires'
      ? 'Hi-Res'
      : audioQuality === 'high'
      ? '256k'
      : '128k';

  const trackBgAlpha = themeMode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,27,0.14)';
  const mobileBarBg =
    themeMode === 'dark'
      ? `linear-gradient(90deg, rgba(${trackAccent.rgb}, 0.15) 0%, rgba(24, 24, 30, 0.90) 55%, rgba(22, 22, 27, 0.92) 100%)`
      : `linear-gradient(90deg, rgba(${trackAccent.rgb}, 0.14) 0%, rgba(255, 255, 255, 0.94) 55%, rgba(249, 250, 251, 0.96) 100%)`;
  const desktopBarBg =
    themeMode === 'dark'
      ? `linear-gradient(90deg, rgba(${trackAccent.rgb}, 0.09) 0%, rgba(13, 13, 16, 0.98) 45%, rgba(13, 13, 16, 0.98) 100%)`
      : `linear-gradient(90deg, rgba(${trackAccent.rgb}, 0.09) 0%, rgba(255, 255, 255, 0.97) 45%, rgba(255, 255, 255, 0.98) 100%)`;

  return (
    <>
      {/* Mobile Floating Frosted-Glass Mini-Player Pill */}
      <div
        style={{ background: mobileBarBg }}
        className="lg:hidden fixed bottom-[82px] left-3 right-3 z-30 rounded-[22px] backdrop-blur-xl border border-zinc-200 dark:border-white/[0.12] shadow-[0_14px_34px_rgba(0,0,0,0.20)] dark:shadow-[0_14px_34px_rgba(0,0,0,0.72)] px-3 py-2 flex items-center justify-between gap-2.5 overflow-hidden transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenStudioAudio}
            aria-label="Buka pemutar dan equalizer"
            className="svara-press relative shrink-0 rounded-full overflow-hidden cursor-pointer shadow-md border border-zinc-200 dark:border-white/15"
          >
            <TrackArtwork
              trackId={currentTrack.id}
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              className={`w-11 h-11 rounded-full svara-vinyl-spin ${isPlaying ? 'is-spinning' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={onOpenLyrics}
            className="min-w-0 flex-1 text-left cursor-pointer"
          >
            <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate leading-tight">
              {currentTrack.title}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              {currentTrack.artist}
            </p>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => toggleLike(currentTrack)}
            aria-label={liked ? 'Hapus suka' : 'Sukai lagu'}
            className={`svara-press min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full cursor-pointer ${
              liked
                ? 'text-emerald-500 dark:text-emerald-400'
                : 'text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Heart size={18} className={liked ? 'fill-current' : ''} />
          </button>

          <button
            type="button"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? 'Jeda' : 'Putar'}
            className="svara-press w-10 h-10 rounded-full bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 flex items-center justify-center shrink-0 shadow-md cursor-pointer"
          >
            {isBuffering ? (
              <Loader2 size={17} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={17} className="fill-current" />
            ) : (
              <Play size={17} className="fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void nextTrack()}
            aria-label="Lagu berikutnya"
            className="svara-press min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
          >
            <SkipForward size={18} className="fill-current" />
          </button>
        </div>

        {/* Hairline bottom progress bar */}
        <div className="absolute inset-x-4 bottom-0 h-[2px] bg-zinc-200 dark:bg-white/[0.08] rounded-full overflow-hidden pointer-events-none">
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${progressPct}%`, backgroundColor: trackAccent.hex }}
          />
        </div>
      </div>

      {/* Desktop Docked Full Studio Player Bar */}
      <div
        style={{ background: desktopBarBg }}
        className="hidden lg:flex static z-30 backdrop-blur-md border-t border-zinc-200 dark:border-white/[0.08] px-5 py-2 h-[84px] items-center justify-between gap-3 transition-colors duration-500 shadow-[0_-10px_28px_rgba(0,0,0,0.08)] dark:shadow-[0_-12px_32px_rgba(0,0,0,0.45)]"
      >
        {/* Left: Spinning Track Artwork & Info */}
        <div className="flex items-center gap-3 min-w-0 w-72 xl:w-88">
          <button
            type="button"
            onClick={onOpenStudioAudio}
            className="svara-press relative shrink-0 rounded-full overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shadow-lg border border-zinc-200 dark:border-white/15"
            aria-label="Buka tampilan pemutar dan equalizer"
          >
            <TrackArtwork
              trackId={currentTrack.id}
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              className={`w-12 h-12 rounded-full svara-vinyl-spin ${isPlaying ? 'is-spinning' : ''}`}
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-white dark:bg-[#0D0D10] border border-zinc-300 dark:border-white/30"
            />
          </button>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpenStudioAudio}
              title={currentTrack.title}
              className="block w-full text-left text-sm font-semibold text-zinc-900 dark:text-white leading-tight line-clamp-1 break-words hover:underline cursor-pointer"
            >
              {currentTrack.title}
            </button>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              <button
                type="button"
                onClick={() => onArtistClick(currentTrack.artist)}
                className="hover:text-zinc-900 dark:hover:text-zinc-200 truncate cursor-pointer"
              >
                {currentTrack.artist}
              </button>
              {onAlbumClick && currentTrack.album && !currentTrack.isLocalFile && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => onAlbumClick(currentTrack.album, currentTrack.artist)}
                    className="hover:text-zinc-900 dark:hover:text-zinc-200 hover:underline truncate cursor-pointer"
                  >
                    {currentTrack.album}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleLike(currentTrack)}
              aria-label={liked ? 'Hapus suka' : 'Sukai lagu'}
              className={`svara-press min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                liked
                  ? 'text-emerald-500 dark:text-emerald-400'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Heart size={16} className={liked ? 'fill-current' : ''} />
            </button>
            <button
              type="button"
              onClick={() =>
                isOffline ? void removeOffline(currentTrack.id) : void downloadTrack(currentTrack)
              }
              disabled={isDownloading}
              aria-label={isOffline ? 'Tersimpan offline' : 'Unduh offline'}
              className={`svara-press min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                isOffline
                  ? 'text-emerald-500 dark:text-emerald-400'
                  : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {isDownloading ? (
                <Loader2 size={15} className="animate-spin text-emerald-500" />
              ) : isOffline ? (
                <Check size={15} />
              ) : (
                <Download size={15} />
              )}
            </button>
          </div>
        </div>

        {/* Center: Transport & Scrubber */}
        <div className="flex flex-col items-center justify-center flex-1 max-w-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleShuffle}
              aria-label="Acak antrean"
              className={`svara-press flex min-w-[34px] min-h-[34px] items-center justify-center rounded-lg transition-colors cursor-pointer ${
                shuffle
                  ? 'svara-accent-text'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              <Shuffle size={15} />
            </button>

            <button
              type="button"
              onClick={() => void prevTrack()}
              aria-label="Lagu sebelumnya"
              className="svara-press min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              <SkipBack size={18} className="fill-current" />
            </button>

            <button
              type="button"
              onClick={() => void togglePlay()}
              aria-label={isPlaying ? 'Jeda' : 'Putar'}
              className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0 shadow-md"
            >
              {isBuffering ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={18} className="fill-current" />
              ) : (
                <Play size={18} className="fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void nextTrack()}
              aria-label="Lagu berikutnya"
              className="svara-press min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
            >
              <SkipForward size={18} className="fill-current" />
            </button>

            <button
              type="button"
              onClick={cycleRepeat}
              aria-label="Mode ulang"
              className={`svara-press flex min-w-[34px] min-h-[34px] items-center justify-center rounded-lg transition-colors cursor-pointer ${
                repeatMode !== 'off'
                  ? 'svara-accent-text'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={15} />}
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full mt-1">
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums w-9 text-right">
              {formatSec(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={effectiveDuration || 30}
              step={0.1}
              value={Math.min(currentTime, effectiveDuration || 30)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Posisi pemutaran"
              style={{
                background: `linear-gradient(to right, ${trackAccent.hex} ${progressPct}%, ${trackBgAlpha} ${progressPct}%)`,
              }}
              className="svara-range flex-1 h-1 rounded-full"
            />
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums w-9">
              {formatSec(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Right: Visualizer, Lyrics, Format/EQ, Cast, Sleep, MiniPlayer, Queue, Volume */}
        <div className="flex items-center justify-end gap-1.5 shrink-0">
          {!lowRamMode && (
            <div className="hidden 2xl:flex items-end gap-0.5 h-5 px-2" aria-hidden="true">
              {Array.from({ length: 10 }).map((_, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    barRefs.current[i] = el;
                  }}
                  style={{
                    height: '18px',
                    transform: 'scaleY(0.14)',
                    backgroundColor: trackAccent.hex,
                  }}
                  className="w-0.5 rounded-full opacity-85 transition-transform duration-75 origin-bottom"
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onOpenLyrics}
            className="svara-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.08] text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Lirik Lagu"
          >
            <AlignLeft size={13} className="svara-accent-text" />
            <span>Lirik</span>
          </button>

          <button
            type="button"
            onClick={onOpenStudioAudio}
            className="svara-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.08] text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Equalizer, Crossfade & Format Audio"
          >
            <SlidersHorizontal size={13} className="svara-accent-text" />
            <span className="font-mono text-[11px]">{qualityLabel}</span>
          </button>

          <button
            type="button"
            onClick={onOpenPlaybackSettings}
            aria-label="Pengatur waktu tidur dan tema"
            title="Pengatur Waktu Tidur & Tema"
            className={`svara-press min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
              sleepTimerMode !== 'off'
                ? 'text-indigo-500 dark:text-indigo-400 bg-indigo-500/10'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Timer size={16} />
          </button>

          <button
            type="button"
            onClick={() => void promptCast()}
            aria-label="Kirim ke Chromecast atau Speaker"
            title="Chromecast / Speaker Nirkabel"
            className="svara-press min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <Cast size={16} />
          </button>

          <button
            type="button"
            onClick={() => setMiniPlayerOpen(!miniPlayerOpen)}
            aria-label="Buka atau tutup Mini-Player mengambang"
            title="Mini-Player Mengambang"
            className={`svara-press min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
              miniPlayerOpen
                ? 'svara-accent-text bg-[rgba(var(--svara-accent-rgb),0.12)]'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <PictureInPicture2 size={16} />
          </button>

          <button
            type="button"
            onClick={onOpenQueue}
            aria-label="Buka antrean lagu"
            title="Antrean Pemutaran (Q)"
            className="svara-press min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <ListMusic size={17} />
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Bunyikan' : 'Bisukan'}
              className="svara-press min-w-[32px] min-h-[32px] flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              style={{
                background: `linear-gradient(to right, ${trackAccent.hex} ${(isMuted ? 0 : volume) * 100}%, ${trackBgAlpha} ${(isMuted ? 0 : volume) * 100}%)`,
              }}
              className="svara-range w-18 h-1 rounded-full"
            />
          </div>
        </div>
      </div>
    </>
  );
};
