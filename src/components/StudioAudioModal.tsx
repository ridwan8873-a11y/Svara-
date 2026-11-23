import React, { useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  Cast,
  Check,
  Cpu,
  Download,
  Heart,
  Loader2,
  Minus,
  Moon,
  Palette,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Star,
  Sun,
  Timer,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { usePlaybackTime } from '@/src/context/PlaybackTimeContext';
import { usePlayer, useSyncedLyricsIndex } from '@/src/context/PlayerContext';
import { audioEngine, EQ_FREQUENCIES, EQ_PRESETS } from '@/src/lib/audioEngine';
import { ACCENT_THEMES } from '@/src/lib/trackTheme';
import type { AccentThemeId, AudioQuality, EQPresetId } from '@/src/types/music';

interface StudioAudioModalProps {
  open: boolean;
  initialTab?: 'lyrics' | 'eq' | 'playback';
  onClose: () => void;
  onArtistClick?: (artistName: string) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
}

const QUALITY_OPTIONS: { id: AudioQuality; title: string; detail: string }[] = [
  { id: 'standard', title: 'Standar', detail: '128 kbps · Hemat kuota' },
  { id: 'high', title: 'Tinggi', detail: '256 kbps · Jernih' },
  { id: 'hires', title: 'Hi-Res Studio', detail: '320 kbps + DSP & EQ' },
  { id: 'flac', title: 'Lossless FLAC', detail: 'Master 999k + Air Shelf' },
  { id: 'alac', title: 'Lossless ALAC', detail: 'Apple Lossless Master' },
];

const BAND_LABELS = ['60 Hz', '230 Hz', '910 Hz', '3.6 kHz', '14 kHz'];

const SLEEP_PRESETS = [15, 30, 45, 60];

function formatSleepCountdown(sec: number | null): string {
  if (sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const StudioAudioModal: React.FC<StudioAudioModalProps> = ({
  open,
  initialTab = 'lyrics',
  onClose,
  onArtistClick,
  onAlbumClick,
}) => {
  const {
    currentTrack,
    isPlaying,
    audioQuality,
    eqPreset,
    eqGains,
    lowRamMode,
    gaplessEnabled,
    crossfadeSec,
    volumeNormalization,
    themeMode,
    setThemeMode,
    accentTheme,
    setAccentTheme,
    customAccentHex,
    setCustomAccentHex,
    sleepTimerMode,
    sleepTimerRemainingSec,
    setSleepTimerMinutes,
    setSleepTimerEndOfTrack,
    cancelSleepTimer,
    promptCast,
    trackRatings,
    rateTrack,
    trackAccent,
    offlineIds,
    lyrics,
    lyricsLoading,
    lyricOffsetSec,
    isLiked,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setAudioQuality,
    setEQPreset,
    setCustomEQBand,
    setLowRamMode,
    setGaplessEnabled,
    setCrossfadeSec,
    setVolumeNormalization,
    adjustLyricOffset,
    resetLyricOffset,
    toggleLike,
    downloadTrack,
  } = usePlayer();

  const { currentTime, duration } = usePlaybackTime();
  const activeLyricIndex = useSyncedLyricsIndex();

  const [tab, setTab] = useState<'lyrics' | 'eq' | 'playback'>(initialTab);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    const updateBars = (values: number[]) => {
      for (let i = 0; i < 28; i++) {
        const el = barRefs.current[i];
        if (el) {
          el.style.transform = `scaleY(${values[i] ?? 0.08})`;
        }
      }
    };

    if (!open || !isPlaying || lowRamMode) {
      updateBars(new Array(28).fill(0.08));
      return;
    }

    const tick = () => {
      if (document.hidden) return;
      updateBars(audioEngine.getFrequencyBars(28).map((v) => Math.max(0.08, v)));
    };

    const timer = window.setInterval(tick, 65);
    return () => window.clearInterval(timer);
  }, [open, isPlaying, lowRamMode]);

  useEffect(() => {
    if (open && tab === 'lyrics' && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [open, tab, activeLyricIndex]);

  if (!open) return null;

  const effectiveDuration =
    duration > 0 ? duration : currentTrack ? currentTrack.durationMs / 1000 : 30;
  const progressPct =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const currentRating = currentTrack ? trackRatings[currentTrack.id] ?? 0 : 0;
  const trackBgAlpha = themeMode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(24,24,27,0.14)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 lg:backdrop-blur-md p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:
            themeMode === 'dark'
              ? `radial-gradient(circle at top left, rgba(${trackAccent.rgb}, 0.14), transparent 45%), #0D0D10`
              : `radial-gradient(circle at top left, rgba(${trackAccent.rgb}, 0.10), transparent 45%), #FFFFFF`,
        }}
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-white/10 shadow-2xl transition-all duration-500"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-zinc-200 dark:border-white/[0.07]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Radio size={17} className="svara-accent-text shrink-0" />
            <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white truncate">
              Pemutar, Studio Audio &amp; Tema
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => setTab('lyrics')}
                className={`svara-press flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  tab === 'lyrics'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <AlignLeft size={13} />
                <span>Lirik</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('eq')}
                className={`svara-press flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  tab === 'eq'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <SlidersHorizontal size={13} />
                <span>EQ &amp; Format</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('playback')}
                className={`svara-press flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  tab === 'playback'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Palette size={13} />
                <span>Tidur &amp; Tema</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup studio audio"
              className="svara-press min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200 dark:divide-white/[0.07]">
          {/* Left: Now Playing Spinning Disc + 5-Star Rating + Live Spectrum */}
          <div className="p-6 flex flex-col items-center justify-between gap-4">
            {currentTrack ? (
              <>
                <div className="relative flex items-center justify-center">
                  {/* Soft colored halo */}
                  <div
                    aria-hidden="true"
                    style={{
                      background: `radial-gradient(circle, rgba(${trackAccent.rgb}, 0.32), transparent 70%)`,
                    }}
                    className={`absolute -inset-4 rounded-full blur-xl transition-opacity duration-700 ${
                      isPlaying ? 'opacity-100' : 'opacity-40'
                    }`}
                  />
                  <div className="relative p-2 rounded-full bg-zinc-900 dark:bg-black/70 border border-zinc-300 dark:border-white/15 shadow-2xl">
                    <TrackArtwork
                      trackId={currentTrack.id}
                      src={currentTrack.artworkUrl}
                      alt={currentTrack.title}
                      className={`w-44 h-44 sm:w-52 sm:h-52 rounded-full svara-vinyl-spin ${
                        isPlaying ? 'is-spinning' : ''
                      }`}
                      iconSize={48}
                    />
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 m-auto w-7 h-7 rounded-full bg-zinc-100 dark:bg-[#0D0D10] border-2 border-[var(--svara-accent)] shadow-inner"
                    />
                  </div>
                </div>

                <div className="w-full text-center space-y-1">
                  <h3 className="font-display text-xl font-bold text-zinc-900 dark:text-white leading-snug break-words">
                    {currentTrack.title}
                  </h3>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {onArtistClick ? (
                      <button
                        type="button"
                        onClick={() => {
                          onArtistClick(currentTrack.artist);
                          onClose();
                        }}
                        className="hover:text-zinc-900 dark:hover:text-white hover:underline cursor-pointer"
                      >
                        {currentTrack.artist}
                      </button>
                    ) : (
                      <span>{currentTrack.artist}</span>
                    )}
                    {currentTrack.album && (
                      <>
                        <span aria-hidden="true">·</span>
                        {onAlbumClick && !currentTrack.isLocalFile ? (
                          <button
                            type="button"
                            onClick={() => {
                              onAlbumClick(currentTrack.album, currentTrack.artist);
                              onClose();
                            }}
                            className="hover:text-zinc-900 dark:hover:text-white hover:underline cursor-pointer"
                          >
                            {currentTrack.album}
                          </button>
                        ) : (
                          <span>{currentTrack.album}</span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Interactive 5-Star Rating */}
                  <div className="flex items-center justify-center gap-1.5 pt-1.5" aria-label="Beri nilai lagu">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => rateTrack(currentTrack.id, star)}
                        aria-label={`Nilai ${star} bintang`}
                        className="svara-press p-1 rounded-md hover:scale-110 cursor-pointer"
                      >
                        <Star
                          size={16}
                          className={
                            star <= currentRating
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-300'
                          }
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live 28-Band Spectrum */}
                {!lowRamMode && (
                  <div
                    className="w-full h-11 flex items-end justify-center gap-1 px-2"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 28 }).map((_, idx) => (
                      <div
                        key={idx}
                        ref={(el) => {
                          barRefs.current[idx] = el;
                        }}
                        className="flex-1 max-w-[8px] rounded-full origin-bottom transition-transform duration-75"
                        style={{
                          height: '40px',
                          transform: 'scaleY(0.08)',
                          backgroundColor: trackAccent.hex,
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Scrubber */}
                <div className="w-full space-y-1.5">
                  <input
                    type="range"
                    min={0}
                    max={effectiveDuration || 30}
                    step={0.1}
                    value={Math.min(currentTime, effectiveDuration || 30)}
                    onChange={(e) => seek(Number(e.target.value))}
                    style={{
                      background: `linear-gradient(to right, ${trackAccent.hex} ${progressPct}%, ${trackBgAlpha} ${progressPct}%)`,
                    }}
                    className="svara-range w-full h-1 rounded-full"
                  />
                  <div className="flex items-center justify-between text-xs font-mono text-zinc-500 tabular-nums">
                    <span>
                      {Math.floor(currentTime / 60)}:
                      {Math.floor(currentTime % 60)
                        .toString()
                        .padStart(2, '0')}
                    </span>
                    <span>
                      {Math.floor(effectiveDuration / 60)}:
                      {Math.floor(effectiveDuration % 60)
                        .toString()
                        .padStart(2, '0')}
                    </span>
                  </div>
                </div>

                {/* Transport */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => toggleLike(currentTrack)}
                    aria-label="Sukai lagu"
                    className={`svara-press min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 cursor-pointer ${
                      isLiked(currentTrack.id)
                        ? 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <Heart
                      size={18}
                      className={isLiked(currentTrack.id) ? 'fill-current' : ''}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => void prevTrack()}
                    aria-label="Sebelumnya"
                    className="svara-press min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
                  >
                    <SkipBack size={20} className="fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void togglePlay()}
                    aria-label={isPlaying ? 'Jeda' : 'Putar'}
                    className="svara-press w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center cursor-pointer shadow-lg"
                  >
                    {isPlaying ? (
                      <Pause size={20} className="fill-zinc-950" />
                    ) : (
                      <Play size={20} className="fill-zinc-950 ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void nextTrack()}
                    aria-label="Berikutnya"
                    className="svara-press min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
                  >
                    <SkipForward size={20} className="fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void downloadTrack(currentTrack)}
                    aria-label="Unduh offline"
                    className={`svara-press min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 cursor-pointer ${
                      offlineIds.has(currentTrack.id)
                        ? 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10'
                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    {offlineIds.has(currentTrack.id) ? (
                      <Check size={18} />
                    ) : (
                      <Download size={18} />
                    )}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 py-20 text-center">
                Putar lagu apa saja untuk melihat lirik, visualisasi, dan kontrol studio.
              </p>
            )}
          </div>

          {/* Right Column: Tabbed Lyrics | EQ & Format | Sleep Timer & Theme */}
          {tab === 'lyrics' ? (
            <div className="p-6 flex flex-col h-[460px] lg:h-[560px]">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-white/[0.07] shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Lirik Lagu</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {lyrics?.synced.length
                      ? 'Tersinkronisasi · Klik baris lirik untuk melompat'
                      : 'Lirik lengkap lagu'}
                  </p>
                </div>

                {currentTrack && lyrics && lyrics.synced.length > 0 && (
                  <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/[0.08] p-1">
                    <button
                      type="button"
                      onClick={() => adjustLyricOffset(-0.2)}
                      title="Perlambat lirik 0.2 detik"
                      aria-label="Mundurkan sinkronisasi lirik"
                      className="svara-press w-7 h-7 rounded-md flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <Minus size={13} />
                    </button>
                    <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-300 px-1.5 tabular-nums">
                      {lyricOffsetSec > 0 ? `+${lyricOffsetSec.toFixed(1)}s` : `${lyricOffsetSec.toFixed(1)}s`}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustLyricOffset(0.2)}
                      title="Percepat lirik 0.2 detik"
                      aria-label="Majukan sinkronisasi lirik"
                      className="svara-press w-7 h-7 rounded-md flex items-center justify-center text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      <Plus size={13} />
                    </button>
                    {lyricOffsetSec !== 0 && (
                      <button
                        type="button"
                        onClick={resetLyricOffset}
                        title="Reset timing lirik"
                        aria-label="Reset sinkronisasi lirik"
                        className="svara-press w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto pt-4 pr-2 space-y-2">
                {!currentTrack ? (
                  <p className="text-sm text-zinc-500 text-center py-16">
                    Pilih lagu terlebih dahulu untuk menampilkan lirik.
                  </p>
                ) : lyricsLoading ? (
                  <div className="flex items-center justify-center gap-2.5 text-sm text-zinc-500 dark:text-zinc-400 py-16">
                    <Loader2 size={18} className="animate-spin text-emerald-500" />
                    <span>Mencari lirik lagu...</span>
                  </div>
                ) : lyrics && lyrics.synced.length > 0 ? (
                  lyrics.synced.map((line, idx) => {
                    const isActive = idx === activeLyricIndex;
                    const isPast = idx < activeLyricIndex;
                    return (
                      <button
                        key={`${line.timeSec}-${idx}`}
                        ref={isActive ? activeLineRef : null}
                        type="button"
                        onClick={() => seek(Math.max(0, line.timeSec - lyricOffsetSec))}
                        className={`block w-full text-left px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                          isActive
                            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 font-semibold text-base sm:text-lg'
                            : isPast
                            ? 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-sm sm:text-base'
                            : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white text-sm sm:text-base'
                        }`}
                      >
                        {line.text}
                      </button>
                    );
                  })
                ) : lyrics?.plain ? (
                  <p className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-line leading-7">
                    {lyrics.plain}
                  </p>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-16 gap-2 text-zinc-500">
                    <AlignLeft size={24} />
                    <p className="text-sm">Lirik belum tersedia untuk lagu ini.</p>
                  </div>
                )}
              </div>
            </div>
          ) : tab === 'eq' ? (
            <div className="p-6 space-y-5 overflow-y-auto max-h-[560px]">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Kualitas &amp; Format Audio (Hi-Res, FLAC, ALAC)
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Pilih bitrate streaming server dan profil pemrosesan DSP Web Audio
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAudioQuality(opt.id)}
                      className={`svara-press p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        audioQuality === opt.id
                          ? 'bg-emerald-500/12 border-emerald-500/50 text-zinc-950 dark:text-white'
                          : 'bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-white/[0.07] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <p className="text-xs font-semibold">{opt.title}</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{opt.detail}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Gapless, Crossfade & Volume Normalization */}
              <div className="border-t border-zinc-200 dark:border-white/[0.07] pt-4 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Waves size={15} className="svara-accent-text shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                        Pemutaran Berkelanjutan Tanpa Jeda (Gapless)
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Menyiapkan lagu berikutnya sebelum lagu selesai agar transisi mulus
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGaplessEnabled(!gaplessEnabled)}
                    className={`svara-press px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer shrink-0 ${
                      gaplessEnabled
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/10'
                    }`}
                  >
                    {gaplessEnabled ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      Crossfade Transisi Halus
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {crossfadeSec === 0 ? 'Mati (0 dtk)' : `${crossfadeSec} detik`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={1}
                    value={crossfadeSec}
                    onChange={(e) => setCrossfadeSec(Number(e.target.value))}
                    style={{
                      background: `linear-gradient(to right, ${trackAccent.hex} ${(crossfadeSec / 12) * 100}%, ${trackBgAlpha} ${(crossfadeSec / 12) * 100}%)`,
                    }}
                    className="svara-range w-full h-1 rounded-full"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Volume2 size={15} className="svara-accent-text shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                        Penyeragam Volume Otomatis
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Menjaga kenyaringan konsisten antar lagu dan album berbeda
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVolumeNormalization(!volumeNormalization)}
                    className={`svara-press px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer shrink-0 ${
                      volumeNormalization
                        ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/10'
                    }`}
                  >
                    {volumeNormalization ? 'Aktif' : 'Nonaktif'}
                  </button>
                </div>
              </div>

              {/* 5-Band EQ */}
              <div className="border-t border-zinc-200 dark:border-white/[0.07] pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Equalizer Studio 5-Band
                  </h3>
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {EQ_PRESETS[eqPreset].label}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(Object.keys(EQ_PRESETS) as EQPresetId[]).map((presetKey) => (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => setEQPreset(presetKey)}
                      className={`svara-press px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        eqPreset === presetKey
                          ? 'bg-emerald-500 text-zinc-950 font-semibold'
                          : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06]'
                      }`}
                    >
                      {EQ_PRESETS[presetKey].label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  {EQ_FREQUENCIES.map((_, idx) => {
                    const gain = eqGains[idx] ?? 0;
                    const pct = ((gain + 12) / 24) * 100;
                    return (
                      <div key={BAND_LABELS[idx]} className="flex items-center gap-3">
                        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 w-14 shrink-0">
                          {BAND_LABELS[idx]}
                        </span>
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          step={0.5}
                          value={gain}
                          onChange={(e) => setCustomEQBand(idx, Number(e.target.value))}
                          style={{
                            background: `linear-gradient(to right, ${trackAccent.hex} ${pct}%, ${trackBgAlpha} ${pct}%)`,
                          }}
                          className="svara-range flex-1 h-1 rounded-full"
                        />
                        <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 tabular-nums w-14 text-right shrink-0">
                          {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)} dB
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Tab 3: Sleep Timer, Chromecast, Light/Dark Theme, Custom Accent Color, Low-RAM */
            <div className="p-6 space-y-5 overflow-y-auto max-h-[560px]">
              {/* Sleep Timer */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Timer size={16} className="svara-accent-text" />
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                      Pengatur Waktu Tidur
                    </h3>
                  </div>
                  {sleepTimerMode !== 'off' && (
                    <span className="font-mono text-xs text-indigo-600 dark:text-indigo-300 tabular-nums">
                      {sleepTimerMode === 'end_of_track'
                        ? 'Berhenti akhir lagu'
                        : `Sisa ${formatSleepCountdown(sleepTimerRemainingSec)}`}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={cancelSleepTimer}
                    className={`svara-press px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      sleepTimerMode === 'off'
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-transparent font-semibold'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10'
                    }`}
                  >
                    Mati
                  </button>
                  {SLEEP_PRESETS.map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setSleepTimerMinutes(min)}
                      className="svara-press px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 cursor-pointer"
                    >
                      {min} mnt
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={setSleepTimerEndOfTrack}
                    className={`svara-press px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      sleepTimerMode === 'end_of_track'
                        ? 'bg-indigo-500 text-white border-indigo-400 font-semibold'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10'
                    }`}
                  >
                    Akhir Lagu Ini
                  </button>
                </div>
              </div>

              {/* Chromecast & Wireless Playback */}
              <div className="border-t border-zinc-200 dark:border-white/[0.07] pt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center svara-accent-text shrink-0">
                    <Cast size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                      Chromecast &amp; Speaker Nirkabel
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Kirim audio ke TV, Chromecast, atau perangkat AirPlay terdekat
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void promptCast()}
                  className="svara-press px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Pilih Perangkat
                </button>
              </div>

              {/* Manual Light / Dark Theme Mode */}
              <div className="border-t border-zinc-200 dark:border-white/[0.07] pt-4 space-y-2.5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Mode Tampilan (Gelap / Terang)
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setThemeMode('dark')}
                    className={`svara-press flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                      themeMode === 'dark'
                        ? 'bg-zinc-900 text-white border-[var(--svara-accent)]'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200'
                    }`}
                  >
                    <Moon size={15} />
                    <span>Mode Gelap</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeMode('light')}
                    className={`svara-press flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                      themeMode === 'light'
                        ? 'bg-white text-zinc-950 border-[var(--svara-accent)] shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 border-white/10 hover:bg-zinc-800'
                    }`}
                  >
                    <Sun size={15} className="text-amber-500" />
                    <span>Mode Terang</span>
                  </button>
                </div>
              </div>

              {/* Additional Accent Color Theme Customization */}
              <div className="border-t border-zinc-200 dark:border-white/[0.07] pt-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                    Kustomisasi Warna Tema
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Pilih aksen warna favoritmu atau ikuti suasana lagu secara otomatis
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAccentTheme('auto')}
                    className={`svara-press px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      accentTheme === 'auto'
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-transparent font-semibold'
                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10'
                    }`}
                  >
                    Otomatis Ikuti Lagu
                  </button>

                  {ACCENT_THEMES.map((swatch) => {
                    const selected = accentTheme === swatch.name;
                    return (
                      <button
                        key={swatch.name}
                        type="button"
                        onClick={() => setAccentTheme(swatch.name as AccentThemeId)}
                        className={`svara-press flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                          selected
                            ? 'border-zinc-900 dark:border-white bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-semibold'
                            : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/70 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <span>{swatch.label}</span>
                      </button>
                    );
                  })}

                  <label className="svara-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/70 text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input
                      type="color"
                      value={customAccentHex}
                      onChange={(e) => setCustomAccentHex(e.target.value)}
                      aria-label="Pilih warna kustom"
                      className="w-4 h-4 rounded border-0 bg-transparent p-0 cursor-pointer"
                    />
                    <span>Kustom</span>
                  </label>
                </div>
              </div>

              {/* Low-RAM Performance Toggle */}
              <div className="border-t border-zinc-200 dark:border-white/[0.07] pt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0">
                    <Cpu size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                      Mode Performa Ringan (RAM Rendah)
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Matikan spektrum &amp; animasi putar agar tetap mulus di perangkat ringan
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setLowRamMode(!lowRamMode)}
                  className={`svara-press px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 cursor-pointer ${
                    lowRamMode
                      ? 'bg-emerald-500 text-zinc-950 border-emerald-400'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-white/10'
                  }`}
                >
                  {lowRamMode ? 'Aktif' : 'Standar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
