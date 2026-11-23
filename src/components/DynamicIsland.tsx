import React, { useEffect, useRef, useState } from 'react';
import {
  AlignLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { usePlaybackTime } from '@/src/context/PlaybackTimeContext';
import { usePlayer, useSyncedLyricsIndex } from '@/src/context/PlayerContext';
import { audioEngine } from '@/src/lib/audioEngine';

interface DynamicIslandProps {
  onOpenFullLyrics: () => void;
}

function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const whole = Math.floor(sec);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({ onOpenFullLyrics }) => {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    lowRamMode,
    trackAccent,
    lyrics,
    lyricsLoading,
    lyricOffsetSec,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
  } = usePlayer();

  const { currentTime, duration } = usePlaybackTime();
  const activeLyricIndex = useSyncedLyricsIndex();

  const [mode, setMode] = useState<'compact' | 'lyrics'>('compact');
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const updateBars = (values: number[]) => {
      for (let i = 0; i < 4; i++) {
        const el = barRefs.current[i];
        if (el) {
          el.style.transform = `scaleY(${values[i] ?? 0.22})`;
        }
      }
    };

    if (!isPlaying || lowRamMode) {
      updateBars([0.22, 0.22, 0.22, 0.22]);
      return;
    }

    const tick = () => {
      if (document.hidden) return;
      const freq = audioEngine.getFrequencyBars(4);
      updateBars(freq.map((v) => Math.max(0.22, v)));
    };

    const timer = window.setInterval(tick, 65);
    return () => window.clearInterval(timer);
  }, [isPlaying, lowRamMode, mode]);

  useEffect(() => {
    if (mode === 'lyrics' && activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [mode, activeLyricIndex]);

  if (!currentTrack) return null;

  const beginDrag = (clientX: number, clientY: number, target: EventTarget | null) => {
    if (target instanceof HTMLElement && target.closest('button, input')) return false;
    startXRef.current = clientX;
    startYRef.current = clientY;
    dragOffsetRef.current = 0;
    setIsDragging(true);
    return true;
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!isDragging || startXRef.current === null || startYRef.current === null) return;
    const dx = clientX - startXRef.current;
    const dy = clientY - startYRef.current;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 10) return;
    const clamped = Math.max(-85, Math.min(85, dx));
    dragOffsetRef.current = clamped;
    setDragOffsetX(clamped);
  };

  const endDrag = () => {
    if (!isDragging) return;
    const dx = dragOffsetRef.current;
    if (dx >= 30 && mode === 'compact') {
      setMode('lyrics');
    } else if (dx <= -30 && mode === 'lyrics') {
      setMode('compact');
    }
    dragOffsetRef.current = 0;
    setIsDragging(false);
    setDragOffsetX(0);
    startXRef.current = null;
    startYRef.current = null;
  };

  const syncedLines = lyrics?.synced ?? [];
  const hasSynced = syncedLines.length > 0;
  const activeIdx = activeLyricIndex >= 0 ? activeLyricIndex : 0;
  const effectiveDuration = duration > 0 ? duration : currentTrack.durationMs / 1000;
  const progressPct =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  return (
    <>
      <div className="w-full shrink-0 bg-transparent px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1 flex justify-center z-30">
        <div
          onPointerDown={(e) => {
            if (beginDrag(e.clientX, e.clientY, e.target)) {
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Ignore capture failures
              }
            }
          }}
          onPointerMove={(e) => moveDrag(e.clientX, e.clientY)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) beginDrag(t.clientX, t.clientY, e.target);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (t) moveDrag(t.clientX, t.clientY);
          }}
          onTouchEnd={endDrag}
          style={{
            transform: `translateX(${dragOffsetX * 0.4}px)`,
            transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 450ms ease, box-shadow 450ms ease',
            touchAction: 'pan-y',
            borderColor: isPlaying ? `rgba(${trackAccent.rgb}, 0.45)` : 'rgba(255,255,255,0.14)',
            boxShadow: isPlaying
              ? `0 8px 24px rgba(0,0,0,0.75), 0 0 18px -6px rgba(${trackAccent.rgb}, 0.35)`
              : '0 8px 22px rgba(0,0,0,0.7)',
          }}
          className="w-auto min-w-[210px] max-w-[330px] sm:max-w-[380px] rounded-full bg-[#050507] border pl-3.5 pr-1.5 py-1 flex items-center gap-2.5 select-none cursor-grab active:cursor-grabbing"
        >
          {!lowRamMode ? (
            <div className="flex items-center gap-[3px] h-4 shrink-0" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  ref={(el) => {
                    barRefs.current[i] = el;
                  }}
                  style={{
                    height: '13px',
                    transform: 'scaleY(0.24)',
                    backgroundColor: trackAccent.hex,
                  }}
                  className="w-[2.5px] rounded-full origin-center transition-transform duration-75"
                />
              ))}
            </div>
          ) : (
            <Music2
              size={13}
              className="shrink-0"
              style={{ color: trackAccent.hex }}
              aria-hidden="true"
            />
          )}

          <button
            type="button"
            onClick={() => setMode(mode === 'lyrics' ? 'compact' : 'lyrics')}
            title="Ketuk atau geser kanan untuk lirik"
            className="min-w-0 flex-1 text-left py-0.5 cursor-pointer"
          >
            <p className="text-[11px] sm:text-xs font-medium text-zinc-100 truncate">
              {dragOffsetX > 16 ? 'Lirik sinkron →' : currentTrack.title}
            </p>
          </button>

          <button
            type="button"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? 'Jeda lagu' : 'Putar lagu'}
            className="svara-press relative w-7 h-7 rounded-full overflow-hidden shrink-0 cursor-pointer group border border-white/15"
          >
            <TrackArtwork
              trackId={currentTrack.id}
              src={currentTrack.artworkUrl}
              alt={currentTrack.title}
              className={`w-7 h-7 rounded-full ${
                isPlaying && !lowRamMode ? 'svara-vinyl-spin' : ''
              }`}
              iconSize={13}
            />
            <span className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {isPlaying ? (
                <Pause size={12} className="text-white fill-white" />
              ) : (
                <Play size={12} className="text-white fill-white ml-0.5" />
              )}
            </span>
          </button>
        </div>
      </div>

      {mode === 'lyrics' && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex justify-center items-start pt-[max(0.65rem,env(safe-area-inset-top))] px-3"
          onClick={() => setMode('compact')}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              if (beginDrag(e.clientX, e.clientY, e.target)) {
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // Ignore capture failures
                }
              }
            }}
            onPointerMove={(e) => moveDrag(e.clientX, e.clientY)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (t) beginDrag(t.clientX, t.clientY, e.target);
            }}
            onTouchMove={(e) => {
              const t = e.touches[0];
              if (t) moveDrag(t.clientX, t.clientY);
            }}
            onTouchEnd={endDrag}
            style={{
              transform: `translateX(${dragOffsetX * 0.45}px)`,
              transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
              touchAction: 'pan-y',
              borderColor: `rgba(${trackAccent.rgb}, 0.4)`,
            }}
            className="w-full max-w-[460px] rounded-3xl bg-[#101015] border shadow-[0_24px_64px_rgba(0,0,0,0.85)] p-4 sm:p-5 space-y-3.5 select-none cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <TrackArtwork
                  trackId={currentTrack.id}
                  src={currentTrack.artworkUrl}
                  alt={currentTrack.title}
                  className="w-12 h-12 rounded-xl border border-white/10"
                  iconSize={20}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-snug break-words">
                    {currentTrack.title}
                  </p>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    {currentTrack.artist}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setMode('compact');
                    onOpenFullLyrics();
                  }}
                  title="Buka lirik layar penuh"
                  aria-label="Buka lirik layar penuh"
                  className="svara-press w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer"
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setMode('compact')}
                  title="Geser kiri atau klik untuk tutup"
                  aria-label="Kecilkan Dynamic Island"
                  className="svara-press h-8 px-2.5 rounded-full bg-white/5 hover:bg-white/15 flex items-center gap-1 text-xs text-zinc-200 hover:text-white whitespace-nowrap cursor-pointer"
                >
                  <ChevronLeft size={14} />
                  <span>Tutup</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-zinc-950/90 border border-white/[0.07] px-4 py-4 h-[210px] overflow-y-auto space-y-2">
              {lyricsLoading ? (
                <div className="h-full flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 size={16} className="animate-spin text-emerald-400" />
                  <span>Memuat lirik lagu...</span>
                </div>
              ) : hasSynced ? (
                syncedLines.map((line, idx) => {
                  const isActive = idx === activeIdx && activeLyricIndex >= 0;
                  const isPast = activeLyricIndex >= 0 && idx < activeIdx;
                  return (
                    <button
                      key={`${line.timeSec}-${idx}`}
                      ref={isActive ? activeLyricRef : null}
                      type="button"
                      onClick={() => seek(Math.max(0, line.timeSec - lyricOffsetSec))}
                      className={`block w-full text-center px-2 py-1 rounded-lg transition-colors cursor-pointer leading-snug ${
                        isActive
                          ? 'text-emerald-300 bg-emerald-500/10 font-bold text-sm sm:text-base'
                          : isPast
                          ? 'text-zinc-500 hover:text-zinc-300 text-xs sm:text-sm'
                          : 'text-zinc-300 hover:text-white text-xs sm:text-sm'
                      }`}
                    >
                      {line.text}
                    </button>
                  );
                })
              ) : lyrics?.plain ? (
                <p className="text-xs text-zinc-200 whitespace-pre-line leading-relaxed text-center">
                  {lyrics.plain}
                </p>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 text-zinc-500">
                  <AlignLeft size={20} />
                  <p className="text-xs">Lirik belum tersedia untuk lagu ini.</p>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={effectiveDuration || 30}
                step={0.1}
                value={Math.min(currentTime, effectiveDuration || 30)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Posisi pemutaran"
                style={{
                  background: `linear-gradient(to right, ${trackAccent.hex} ${progressPct}%, rgba(255,255,255,0.14) ${progressPct}%)`,
                }}
                className="svara-range w-full h-1 rounded-full"
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 tabular-nums">
                <span>{formatSec(currentTime)}</span>
                <span>{formatSec(effectiveDuration)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">
                ← Geser kiri untuk tutup
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void prevTrack()}
                  aria-label="Sebelumnya"
                  className="svara-press w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
                >
                  <SkipBack size={16} className="fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  aria-label={isPlaying ? 'Jeda' : 'Putar'}
                  className="svara-press w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 flex items-center justify-center cursor-pointer"
                >
                  {isBuffering ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : isPlaying ? (
                    <Pause size={16} className="fill-zinc-950" />
                  ) : (
                    <Play size={16} className="fill-zinc-950 ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void nextTrack()}
                  aria-label="Berikutnya"
                  className="svara-press w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
                >
                  <SkipForward size={16} className="fill-current" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
