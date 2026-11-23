import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { usePlayer } from '@/src/context/PlayerContext';
import type { Track } from '@/src/types/music';

interface PlaylistModalProps {
  open: boolean;
  trackToAdd: Track | null;
  onClose: () => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  open,
  trackToAdd,
  onClose,
}) => {
  const { playlists, createPlaylist, addTrackToPlaylist } = usePlayer();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  if (!open) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createPlaylist(name, description, trackToAdd ? [trackToAdd] : []);
    setName('');
    setDescription('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0D0D10] border border-zinc-200 dark:border-white/10 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
              {trackToAdd ? 'Tambahkan ke Playlist' : 'Buat Playlist Personal'}
            </h2>
            {trackToAdd && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 truncate max-w-xs">
                {trackToAdd.title} · {trackToAdd.artist}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal playlist"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pick existing playlist if adding a track */}
        {trackToAdd && playlists.length > 0 && (
          <div className="mt-4 space-y-1.5 max-h-48 overflow-y-auto pr-1">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              Pilih Playlist Tersedia
            </p>
            {playlists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => {
                  addTrackToPlaylist(pl.id, trackToAdd);
                  onClose();
                }}
                className="svara-press w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06] text-left transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{pl.name}</p>
                  <p className="text-xs text-zinc-500 tabular-nums">{pl.tracks.length} lagu</p>
                </div>
                <Plus size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Create new playlist form */}
        <form onSubmit={handleCreate} className="mt-5 pt-4 border-t border-zinc-200 dark:border-white/[0.07] space-y-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {trackToAdd ? 'Atau buat playlist baru' : 'Detail playlist baru'}
          </p>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama playlist (mis. Senja di Jakarta)"
            className="w-full h-10 px-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deskripsi singkat (opsional)"
            className="w-full h-10 px-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
          />
          <button
            type="submit"
            className="svara-press w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors cursor-pointer"
          >
            {trackToAdd ? 'Buat & Simpan Lagu' : 'Buat Playlist'}
          </button>
        </form>
      </div>
    </div>
  );
};
