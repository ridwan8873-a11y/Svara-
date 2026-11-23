import React from 'react';
import { Play, Trash2, X } from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { usePlayer } from '@/src/context/PlayerContext';

interface QueueDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ open, onClose }) => {
  const { currentTrack, queue, queueIndex, playTrackList, removeFromQueue } = usePlayer();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-[#0D0D10] border-l border-zinc-200 dark:border-white/10 h-full flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-white/[0.07] flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white">
              Antrean Pemutaran
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">{queue.length} lagu dalam antrean</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup antrean"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {queue.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
              Antrean kosong. Putar lagu atau playlist untuk mengisi antrean.
            </p>
          ) : (
            queue.map((track, idx) => {
              const isCurrent = idx === queueIndex && currentTrack?.id === track.id;
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                    isCurrent
                      ? 'bg-[rgba(var(--svara-accent-rgb),0.1)] border-[var(--svara-accent)]'
                      : 'bg-zinc-50 dark:bg-zinc-900/40 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void playTrackList(queue, idx)}
                    className="relative shrink-0 rounded-md overflow-hidden cursor-pointer"
                  >
                    <TrackArtwork
                      trackId={track.id}
                      src={track.artworkUrl}
                      alt={track.title}
                      className="w-10 h-10 rounded-md"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => void playTrackList(queue, idx)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <p
                      className={`text-sm font-medium leading-snug break-words ${
                        isCurrent ? 'svara-accent-text' : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{track.artist}</p>
                  </button>
                  {isCurrent ? (
                    <Play size={14} className="svara-accent-text fill-current shrink-0 mr-1" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeFromQueue(idx)}
                      aria-label="Hapus dari antrean"
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
