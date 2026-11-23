import React, { useState } from 'react';
import {
  Download,
  ListPlus,
  Loader2,
  Play,
  Sparkles,
} from 'lucide-react';
import { TrackRow } from '@/src/components/TrackRow';
import { usePlayer } from '@/src/context/PlayerContext';
import curatorBackdropUrl from '@/src/assets/images/svara_curator_backdrop_1795430063576.jpg';
import type { AIRecommendationResult, Track } from '@/src/types/music';

interface AICuratorViewProps {
  onArtistClick: (artistName: string) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
  onAddToPlaylist: (track: Track) => void;
}

const MOOD_PRESETS = [
  {
    label: 'Begadang Ngoding & Hujan',
    prompt: 'Buatkan playlist santai bernuansa lo-fi, R&B, dan indie tenang untuk menemani begadang ngoding saat hujan.',
  },
  {
    label: 'Semangat Olahraga Pagi',
    prompt: 'Lagu-lagu upbeat berenergi tinggi dengan beat cepat untuk lari pagi dan latihan gym.',
  },
  {
    label: 'Galau Malam Akustik Indonesia',
    prompt: 'Rekomendasi lagu pop akustik dan indie Indonesia yang menyentuh hati untuk suasana malam tenang.',
  },
  {
    label: 'Fokus Kerja Jazz & Soul',
    prompt: 'Lagu jazz modern, neo-soul, dan vokal lembut yang tidak mengganggu konsentrasi bekerja.',
  },
  {
    label: 'Roadtrip Akhir Pekan',
    prompt: 'Playlist seru lintas dekade dari pop global hingga rock klasik Indonesia untuk perjalanan mobil.',
  },
  {
    label: '🎮 Gaming & Fokus Energi',
    prompt: 'Lagu EDM, synth-pop, dan beat penuh energi untuk menemani sesi gaming.',
  },
];

export const AICuratorView: React.FC<AICuratorViewProps> = ({
  onArtistClick,
  onAlbumClick,
  onAddToPlaylist,
}) => {
  const {
    likedTracks,
    recentTracks,
    playTrackList,
    createPlaylist,
    downloadPlaylist,
    personalRecs,
    refreshPersonalRecs,
    showToast,
  } = usePlayer();

  const [prompt, setPrompt] = useState('');
  const [useTasteHistory, setUseTasteHistory] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIRecommendationResult | null>(null);

  const generateRecommendations = async (customPrompt?: string) => {
    const activePrompt = (customPrompt ?? prompt).trim();
    if (!activePrompt && likedTracks.length === 0 && recentTracks.length === 0) {
      setError('Tulis suasana atau genre yang diinginkan, atau pilih salah satu preset di bawah.');
      return;
    }

    setLoading(true);
    setError(null);
    if (customPrompt) setPrompt(customPrompt);

    try {
      const res = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: activePrompt || 'Rekomendasikan lagu baru berdasarkan musik yang sering saya putar dan sukai.',
          likedTracks: useTasteHistory
            ? likedTracks.map((t) => ({ title: t.title, artist: t.artist }))
            : [],
          recentTracks: useTasteHistory
            ? recentTracks.map((t) => ({ title: t.title, artist: t.artist }))
            : [],
        }),
      });
      const data = (await res.json()) as AIRecommendationResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menghasilkan rekomendasi lagu.');
      }
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat menghubungi kurator musik.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsPlaylist = () => {
    if (!result || result.tracks.length === 0) return;
    createPlaylist(result.playlistTitle, result.curatorNote, result.tracks);
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header & Prompt Builder with Aesthetic Backdrop (dark scrim preserves readable white overlay text) */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.08] shadow-2xl bg-[#0D0E12] p-5 sm:p-7">
        <img
          src={curatorBackdropUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none select-none"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#09090B]/85 via-[#09090B]/92 to-[#09090B]/98 pointer-events-none"
        />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[rgba(var(--svara-accent-rgb),0.18)] border border-[rgba(var(--svara-accent-rgb),0.4)] flex items-center justify-center svara-accent-text shrink-0 shadow-lg">
                <Sparkles size={28} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold svara-accent-text">
                  Kurasi Musik Cerdas &amp; Personal
                </p>
                <h1 className="font-display text-2xl font-bold text-white mt-1 [text-wrap:balance]">
                  Kurasi Lagu Sesuai Mood &amp; Seleramu
                </h1>
                <p className="text-sm text-zinc-300 mt-1 max-w-2xl">
                  Ceritakan suasana hati, aktivitas, atau referensi artis Anda. Sistem merangkai playlist lintas artis yang langsung bisa diputar dan diunduh offline.
                </p>
              </div>
            </div>

            {personalRecs && personalRecs.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  void playTrackList(personalRecs.tracks, 0);
                  void refreshPersonalRecs(false);
                }}
                className="svara-press flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-[rgba(var(--svara-accent-rgb),0.35)] text-xs font-semibold text-white whitespace-nowrap shrink-0 self-start md:self-auto cursor-pointer"
              >
                <Play size={14} className="fill-current svara-accent-text" />
                <span>Mix Personal Harian</span>
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void generateRecommendations();
            }}
            className="mt-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Contoh: Lagu indie Indonesia & R&B yang adem untuk perjalanan malam..."
                className="flex-1 h-11 px-4 rounded-xl bg-zinc-950/90 border border-white/10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--svara-accent)] transition-colors"
              />
              <button
                type="submit"
                disabled={loading}
                className="svara-press h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-zinc-950 font-semibold text-sm flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Meracik Playlist...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Buat Rekomendasi</span>
                  </>
                )}
              </button>
            </div>

            {/* Mood presets */}
            <div className="flex flex-wrap items-center gap-2">
              {MOOD_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={loading}
                  onClick={() => void generateRecommendations(preset.prompt)}
                  className="svara-press px-3 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-white/[0.08] hover:border-[var(--svara-accent)] text-xs font-medium text-zinc-300 hover:text-white cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={useTasteHistory}
                onChange={(e) => setUseTasteHistory(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <span>
                Sesuaikan dengan selera saya ({likedTracks.length} lagu disukai · {recentTracks.length} riwayat putar)
              </span>
            </label>
          </form>

          {error && (
            <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-xs text-rose-300">
              {error}
            </div>
          )}
        </div>
      </section>

      {/* Loading skeleton */}
      {loading && (
        <div className="svara-card rounded-2xl p-6 space-y-3">
          <div className="h-6 w-64 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="h-4 w-96 max-w-full rounded bg-zinc-200/70 dark:bg-zinc-900 animate-pulse" />
          <div className="pt-4 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-zinc-200/60 dark:bg-zinc-900/70 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {!loading && result && (
        <section className="svara-card svara-page-enter rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-zinc-200 dark:border-white/[0.07]">
            <div>
              <p className="text-xs font-medium svara-accent-text">
                Hasil Kurasi Musik · {result.tracks.length} lagu ditemukan
              </p>
              <h2 className="font-display text-xl font-bold text-zinc-900 dark:text-white mt-1">
                {result.playlistTitle}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 max-w-2xl">
                {result.curatorNote}
              </p>
            </div>

            {result.tracks.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveAsPlaylist}
                  className="svara-press flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
                >
                  <ListPlus size={14} />
                  <span>Simpan Playlist</span>
                </button>
                <button
                  type="button"
                  onClick={() => void downloadPlaylist(result.tracks)}
                  className="svara-press flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
                >
                  <Download size={14} />
                  <span>Unduh Offline</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void playTrackList(result.tracks, 0);
                    showToast(`Memutar "${result.playlistTitle}"`, 'info');
                  }}
                  className="svara-press flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold whitespace-nowrap cursor-pointer shadow-sm"
                >
                  <Play size={14} className="fill-zinc-950" />
                  <span>Putar Semua</span>
                </button>
              </div>
            )}
          </div>

          {result.tracks.length === 0 ? (
            <p className="py-8 text-sm text-zinc-500 dark:text-zinc-400 text-center">
              Lagu rekomendasi belum tersedia di katalog. Coba ubah deskripsi permintaan Anda.
            </p>
          ) : (
            <div className="mt-3 space-y-0.5">
              {result.tracks.map((track, idx) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={idx}
                  contextList={result.tracks}
                  subtitleOverride={track.reason || track.album}
                  onArtistClick={onArtistClick}
                  onAlbumClick={onAlbumClick}
                  onAddToPlaylistClick={onAddToPlaylist}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
