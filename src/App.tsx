import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AICuratorView } from '@/src/components/AICuratorView';
import { AlbumView } from '@/src/components/AlbumView';
import { AudioSentinelModal } from '@/src/components/AudioSentinelModal';
import { DynamicIsland } from '@/src/components/DynamicIsland';
import { HomeView } from '@/src/components/HomeView';
import { LibraryOfflineView } from '@/src/components/LibraryOfflineView';
import { MiniPlayerWidget } from '@/src/components/MiniPlayerWidget';
import { PlayerBar } from '@/src/components/PlayerBar';
import { PlaylistModal } from '@/src/components/PlaylistModal';
import { QueueDrawer } from '@/src/components/QueueDrawer';
import { SearchView } from '@/src/components/SearchView';
import { ShortcutsModal } from '@/src/components/ShortcutsModal';
import { Sidebar } from '@/src/components/Sidebar';
import { StudioAudioModal } from '@/src/components/StudioAudioModal';
import { TopBar } from '@/src/components/TopBar';
import { WrappedView } from '@/src/components/WrappedView';
import { usePlaybackTime } from '@/src/context/PlaybackTimeContext';
import { PlayerProvider, usePlayer } from '@/src/context/PlayerContext';
import svaraHeroBackdropUrl from '@/src/assets/images/svara_hero_backdrop_1795430062090.jpg';
import type { DiscoverCollection, FeaturedArtistItem, Track, ViewTab } from '@/src/types/music';

const SvaraShell: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    lowRamMode,
    volume,
    setVolume,
    seek,
    togglePlay,
    nextTrack,
    prevTrack,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    toggleThemeMode,
    toasts,
    dismissToast,
    registerDiscoverTracks,
    sentinelReport,
  } = usePlayer();
  const { currentTime } = usePlaybackTime();

  const [activeTab, setActiveTab] = useState<ViewTab>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<{ title: string; artist: string } | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const [collections, setCollections] = useState<DiscoverCollection[]>([]);
  const [featuredArtists, setFeaturedArtists] = useState<FeaturedArtistItem[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [studioAudioOpen, setStudioAudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<'lyrics' | 'eq' | 'playback'>('lyrics');
  const [queueOpen, setQueueOpen] = useState(false);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [sentinelOpen, setSentinelOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trackForPlaylist, setTrackForPlaylist] = useState<Track | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const fetchDiscover = useCallback(async () => {
    setDiscoverLoading(true);
    setDiscoverError(null);
    try {
      const res = await fetch('/api/music/discover');
      if (!res.ok) throw new Error('Gagal memuat katalog musik');
      const data = (await res.json()) as {
        collections?: DiscoverCollection[];
        featuredArtists?: FeaturedArtistItem[];
      };
      const cols = data.collections ?? [];
      setCollections(cols);
      setFeaturedArtists(data.featuredArtists ?? []);
      const allDiscoverTracks = cols.flatMap((c) => c.tracks);
      registerDiscoverTracks(allDiscoverTracks);
    } catch {
      setDiscoverError('Katalog musik online sedang tidak dapat diakses. Anda tetap dapat memutar lagu dari Koleksi Offline.');
    } finally {
      setDiscoverLoading(false);
    }
  }, [registerDiscoverTracks]);

  useEffect(() => {
    void fetchDiscover();
  }, [fetchDiscover]);

  // Apply any Sentinel auto-repaired tracks seamlessly into Discover collections
  useEffect(() => {
    if (!sentinelReport) return;
    const repairs = new Map<string, Track>();
    for (const item of sentinelReport.results) {
      if (item.repairedTrack) {
        repairs.set(item.id, item.repairedTrack);
      }
    }
    if (repairs.size === 0) return;
    setCollections((prev) =>
      prev.map((col) => {
        let changed = false;
        const nextTracks = col.tracks.map((t) => {
          const rep = repairs.get(t.id);
          if (rep) {
            changed = true;
            return rep;
          }
          return t;
        });
        return changed ? { ...col, tracks: nextTracks } : col;
      })
    );
  }, [sentinelReport]);

  const handleSelectTab = (tab: ViewTab) => {
    setSelectedAlbum(null);
    setActiveTab(tab);
    if (tab !== 'library') {
      setSelectedPlaylistId(null);
    }
    if (tab !== 'search') {
      setSelectedArtistName(null);
    }
  };

  const handleOpenArtist = (artistName: string) => {
    setSelectedAlbum(null);
    setSelectedArtistName(artistName);
    setActiveTab('search');
  };

  const handleOpenAlbum = (albumTitle: string, artistName: string) => {
    if (!albumTitle.trim()) return;
    setSelectedArtistName(null);
    setSelectedAlbum({ title: albumTitle, artist: artistName });
  };

  const handleOpenPlaylist = (playlistId: string) => {
    setSelectedAlbum(null);
    setSelectedPlaylistId(playlistId);
    setActiveTab('library');
  };

  const handleOpenAddToPlaylist = (track: Track) => {
    setTrackForPlaylist(track);
    setPlaylistModalOpen(true);
  };

  const handleOpenCreatePlaylist = () => {
    setTrackForPlaylist(null);
    setPlaylistModalOpen(true);
  };

  const openStudioLyrics = () => {
    setStudioTab('lyrics');
    setStudioAudioOpen(true);
  };

  const openStudioEQ = () => {
    setStudioTab('eq');
    setStudioAudioOpen(true);
  };

  const openStudioPlayback = () => {
    setStudioTab('playback');
    setStudioAudioOpen(true);
  };

  // Comprehensive Global Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable
      ) {
        if (e.key === 'Escape') {
          target?.blur();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;
      const lower = key.toLowerCase();

      if (key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (studioAudioOpen) setStudioAudioOpen(false);
        else if (queueOpen) setQueueOpen(false);
        else if (playlistModalOpen) setPlaylistModalOpen(false);
        else if (sentinelOpen) setSentinelOpen(false);
        return;
      }

      if (key === ' ' || lower === 'k') {
        e.preventDefault();
        void togglePlay();
        return;
      }

      if (key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) void prevTrack();
        else seek(Math.max(0, currentTime - 5));
        return;
      }

      if (key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) void nextTrack();
        else seek(currentTime + 5);
        return;
      }

      if (lower === 'j') {
        e.preventDefault();
        seek(Math.max(0, currentTime - 10));
        return;
      }

      if (lower === 'l') {
        e.preventDefault();
        seek(currentTime + 10);
        return;
      }

      if (lower === 'n') {
        e.preventDefault();
        void nextTrack();
        return;
      }

      if (lower === 'p') {
        e.preventDefault();
        void prevTrack();
        return;
      }

      if (key === 'ArrowUp') {
        e.preventDefault();
        setVolume(Math.min(1, Number((volume + 0.05).toFixed(2))));
        return;
      }

      if (key === 'ArrowDown') {
        e.preventDefault();
        setVolume(Math.max(0, Number((volume - 0.05).toFixed(2))));
        return;
      }

      if (lower === 'm') {
        e.preventDefault();
        toggleMute();
        return;
      }

      if (lower === 's') {
        e.preventDefault();
        toggleShuffle();
        return;
      }

      if (lower === 'r') {
        e.preventDefault();
        cycleRepeat();
        return;
      }

      if (lower === 'f' && currentTrack) {
        e.preventDefault();
        toggleLike(currentTrack);
        return;
      }

      if (key === '/') {
        e.preventDefault();
        setSelectedAlbum(null);
        setSelectedArtistName(null);
        setActiveTab('search');
        window.setTimeout(() => searchInputRef.current?.focus(), 40);
        return;
      }

      if (lower === 'e') {
        e.preventDefault();
        setStudioAudioOpen((prev) => !prev);
        return;
      }

      if (lower === 'q') {
        e.preventDefault();
        setQueueOpen((prev) => !prev);
        return;
      }

      if (lower === 't') {
        e.preventDefault();
        toggleThemeMode();
        return;
      }

      if (key === '?') {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    currentTime,
    currentTrack,
    cycleRepeat,
    nextTrack,
    playlistModalOpen,
    prevTrack,
    queueOpen,
    seek,
    sentinelOpen,
    setVolume,
    shortcutsOpen,
    studioAudioOpen,
    toggleLike,
    toggleMute,
    togglePlay,
    toggleShuffle,
    toggleThemeMode,
    volume,
  ]);

  return (
    <div className="relative h-screen w-full flex flex-col bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 overflow-hidden transition-colors duration-300">
      {/* Aesthetic studio backdrop & warm ambient radial glow */}
      {!lowRamMode && (
        <>
          <img
            src={svaraHeroBackdropUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 w-full h-full object-cover opacity-[0.04] dark:opacity-[0.08] z-0 select-none"
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none fixed inset-0 z-0 transition-opacity duration-700 bg-[radial-gradient(ellipse_at_top_left,rgba(var(--svara-accent-rgb),0.14),transparent_55%)] ${
              isPlaying ? 'opacity-100' : 'opacity-65'
            }`}
          />
        </>
      )}

      <div className="relative z-10 flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          selectedPlaylistId={selectedPlaylistId}
          onSelectTab={handleSelectTab}
          onSelectPlaylist={handleOpenPlaylist}
          onOpenCreatePlaylist={handleOpenCreatePlaylist}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <DynamicIsland onOpenFullLyrics={openStudioLyrics} />
          <TopBar
            activeTab={activeTab}
            searchQuery={searchQuery}
            searchInputRef={searchInputRef}
            onSearchChange={(q) => {
              setSelectedAlbum(null);
              setSearchQuery(q);
            }}
            onNavigateSearch={() => {
              setSelectedAlbum(null);
              if (activeTab !== 'search') {
                setSelectedArtistName(null);
                setActiveTab('search');
              }
            }}
            onOpenSentinel={() => setSentinelOpen(true)}
            onOpenWrapped={() => handleSelectTab('wrapped')}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSleepSettings={openStudioPlayback}
          />

          <main
            className={`flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-5 ${
              currentTrack ? 'pb-44 lg:pb-8' : 'pb-24 lg:pb-8'
            }`}
          >
            <div
              key={selectedAlbum ? `album-${selectedAlbum.title}` : activeTab}
              className="max-w-7xl mx-auto svara-page-enter"
            >
              {selectedAlbum ? (
                <AlbumView
                  albumTitle={selectedAlbum.title}
                  artistName={selectedAlbum.artist}
                  onBack={() => setSelectedAlbum(null)}
                  onArtistClick={handleOpenArtist}
                  onAddToPlaylist={handleOpenAddToPlaylist}
                />
              ) : (
                <>
                  {activeTab === 'home' && (
                    <HomeView
                      collections={collections}
                      featuredArtists={featuredArtists}
                      loading={discoverLoading}
                      error={discoverError}
                      onRetry={() => void fetchDiscover()}
                      onOpenAI={() => handleSelectTab('ai')}
                      onOpenWrapped={() => handleSelectTab('wrapped')}
                      onArtistClick={handleOpenArtist}
                      onAlbumClick={handleOpenAlbum}
                      onAddToPlaylist={handleOpenAddToPlaylist}
                      onOpenOfflineLibrary={() => handleSelectTab('library')}
                    />
                  )}

                  {activeTab === 'search' && (
                    <SearchView
                      query={searchQuery}
                      onQueryChange={setSearchQuery}
                      selectedArtistName={selectedArtistName}
                      onSelectArtist={setSelectedArtistName}
                      onAlbumClick={handleOpenAlbum}
                      onAddToPlaylist={handleOpenAddToPlaylist}
                      featuredArtists={featuredArtists}
                    />
                  )}

                  {activeTab === 'wrapped' && (
                    <WrappedView
                      onArtistClick={handleOpenArtist}
                      onAlbumClick={handleOpenAlbum}
                      onAddToPlaylist={handleOpenAddToPlaylist}
                      onNavigateExplore={() => handleSelectTab('home')}
                    />
                  )}

                  {activeTab === 'ai' && (
                    <AICuratorView
                      onArtistClick={handleOpenArtist}
                      onAlbumClick={handleOpenAlbum}
                      onAddToPlaylist={handleOpenAddToPlaylist}
                    />
                  )}

                  {activeTab === 'library' && (
                    <LibraryOfflineView
                      selectedPlaylistId={selectedPlaylistId}
                      onSelectPlaylist={setSelectedPlaylistId}
                      onOpenCreatePlaylist={handleOpenCreatePlaylist}
                      onArtistClick={handleOpenArtist}
                      onAlbumClick={handleOpenAlbum}
                      onAddToPlaylist={handleOpenAddToPlaylist}
                    />
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Persistent Docked Player Bar */}
      <PlayerBar
        onOpenStudioAudio={openStudioEQ}
        onOpenLyrics={openStudioLyrics}
        onOpenPlaybackSettings={openStudioPlayback}
        onOpenQueue={() => setQueueOpen(true)}
        onArtistClick={handleOpenArtist}
        onAlbumClick={handleOpenAlbum}
      />

      {/* Floating Compact Mini-Player */}
      <MiniPlayerWidget
        onExpand={openStudioLyrics}
        onArtistClick={handleOpenArtist}
      />

      {/* Modals & Drawers */}
      <StudioAudioModal
        open={studioAudioOpen}
        initialTab={studioTab}
        onClose={() => setStudioAudioOpen(false)}
        onArtistClick={handleOpenArtist}
        onAlbumClick={handleOpenAlbum}
      />

      <QueueDrawer
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
      />

      <PlaylistModal
        open={playlistModalOpen}
        trackToAdd={trackForPlaylist}
        onClose={() => setPlaylistModalOpen(false)}
      />

      <AudioSentinelModal
        open={sentinelOpen}
        onClose={() => setSentinelOpen(false)}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Non-intrusive Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-40 lg:bottom-24 right-4 z-50 flex flex-col gap-2 max-w-sm"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium shadow-xl backdrop-blur-md ${
                t.tone === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-200'
                  : t.tone === 'success'
                  ? 'bg-emerald-50 dark:bg-zinc-900/95 border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-200'
                  : 'bg-white dark:bg-zinc-900/95 border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-200'
              }`}
            >
              <span>{t.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Tutup notifikasi"
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white shrink-0 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-white/10 p-6 text-center space-y-4 shadow-xl">
            <h1 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
              Svara Perlu Dimuat Ulang
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Terjadi gangguan sementara pada tampilan pemutar. Tekan tombol di bawah untuk memulihkan aplikasi.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem('svara_playback_session_v1');
                } catch {
                  // Ignore storage errors
                }
                window.location.reload();
              }}
              className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold cursor-pointer"
            >
              Muat Ulang Svara
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <PlayerProvider>
        <SvaraShell />
      </PlayerProvider>
    </AppErrorBoundary>
  );
}
