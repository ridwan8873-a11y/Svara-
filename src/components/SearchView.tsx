import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Disc3,
  Download,
  Loader2,
  Play,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { TrackRow } from '@/src/components/TrackRow';
import { usePlayer } from '@/src/context/PlayerContext';
import type {
  AlbumSummary,
  ArtistProfile,
  FeaturedArtistItem,
  SearchArtistMatch,
  SentinelScanReport,
  Track,
} from '@/src/types/music';

interface SearchViewProps {
  query: string;
  onQueryChange: (q: string) => void;
  selectedArtistName: string | null;
  onSelectArtist: (name: string | null) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
  onAddToPlaylist: (track: Track) => void;
  featuredArtists?: FeaturedArtistItem[];
}

const FEATURED_ARTISTS = [
  { name: 'Tulus', genre: 'Pop Indonesia' },
  { name: 'Avenged Sevenfold', genre: 'Heavy Metal / Rock' },
  { name: 'Hindia', genre: 'Indie Alternatif' },
  { name: 'Bernadya', genre: 'Pop Akustik' },
  { name: 'NIKI', genre: 'R&B / Indie' },
  { name: 'The Weeknd', genre: 'Synth-Pop / R&B' },
  { name: 'Billie Eilish', genre: 'Alt-Pop' },
  { name: 'Bruno Mars', genre: 'Pop / Funk' },
  { name: 'Taylor Swift', genre: 'Pop' },
  { name: 'Coldplay', genre: 'Alternative Rock' },
  { name: 'SZA', genre: 'R&B / Soul' },
  { name: 'Daft Punk', genre: 'Electronic' },
  { name: 'Sheila On 7', genre: 'Pop Rock' },
  { name: 'Frank Ocean', genre: 'Neo-Soul' },
  { name: 'Joji', genre: 'Lo-Fi / R&B' },
  { name: 'Laufey', genre: 'Jazz Pop' },
];

type SearchTypeFilter = 'all' | 'tracks' | 'artists' | 'albums';
type SortOrder = 'relevance' | 'duration_desc' | 'title_asc';

const GENRE_FILTERS: { id: string; label: string; regex: RegExp | null }[] = [
  { id: 'all', label: 'Semua Genre', regex: null },
  { id: 'pop', label: 'Pop', regex: /pop/i },
  { id: 'rock', label: 'Rock / Metal', regex: /rock|metal|punk|alt/i },
  { id: 'indie', label: 'Indie / Akustik', regex: /indie|acoustic|akustik|folk/i },
  { id: 'rnb', label: 'R&B / Soul', regex: /r&b|soul|jazz/i },
  { id: 'electronic', label: 'Electronic', regex: /electronic|dance|edm/i },
];

const RECENT_SEARCH_KEY = 'svara_recent_searches_v1';

export const SearchView: React.FC<SearchViewProps> = ({
  query,
  onQueryChange,
  selectedArtistName,
  onSelectArtist,
  onAlbumClick,
  onAddToPlaylist,
  featuredArtists = [],
}) => {
  const { playTrackList, downloadPlaylist } = usePlayer();
  const [results, setResults] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [topArtist, setTopArtist] = useState<SearchArtistMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<SearchTypeFilter>('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('relevance');
  const [fullDurationOnly, setFullDurationOnly] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCH_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistError, setArtistError] = useState<string | null>(null);
  const [searchVerifiedCount, setSearchVerifiedCount] = useState<number | null>(null);
  const [searchScanMs, setSearchScanMs] = useState<number | null>(null);

  const pushRecentSearch = (term: string) => {
    const cleaned = term.trim();
    if (cleaned.length < 2) return;
    setRecentSearches((prev) => {
      const next = [cleaned, ...prev.filter((x) => x.toLowerCase() !== cleaned.toLowerCase())].slice(
        0,
        8
      );
      try {
        localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  // Debounced live catalog search + fast background Sentinel auto-check & repair
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setAlbums([]);
      setTopArtist(null);
      setSearchError(null);
      setSearchVerifiedCount(null);
      setSearchScanMs(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      setSearchVerifiedCount(null);
      setSearchScanMs(null);
      try {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(trimmed)}&limit=30`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Gagal mencari lagu di katalog');
        const data = (await res.json()) as {
          tracks?: Track[];
          albums?: AlbumSummary[];
          topArtist?: SearchArtistMatch | null;
        };
        const initialTracks = data.tracks ?? [];
        setResults(initialTracks);
        setAlbums(data.albums ?? []);
        setTopArtist(data.topArtist ?? null);
        setLoading(false);
        pushRecentSearch(trimmed);

        if (initialTracks.length > 0) {
          fetch('/api/music/sentinel/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: initialTracks.slice(0, 12) }),
            signal: controller.signal,
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((report: SentinelScanReport | null) => {
              if (!report) return;
              const repairs = new Map<string, Track>();
              for (const item of report.results) {
                if (item.repairedTrack) repairs.set(item.id, item.repairedTrack);
              }
              if (repairs.size > 0) {
                setResults((prev) => {
                  const seenIds = new Set<string>();
                  const updated: Track[] = [];
                  for (const t of prev) {
                    const nextT = repairs.get(t.id) || t;
                    if (!seenIds.has(nextT.id)) {
                      seenIds.add(nextT.id);
                      updated.push(nextT);
                    }
                  }
                  return updated;
                });
              }
              setSearchVerifiedCount(report.summary.verified + report.summary.repaired);
              setSearchScanMs(report.summary.elapsedMs);
            })
            .catch(() => {
              // Ignore background scan cancellation
            });
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setSearchError('Tidak dapat terhubung ke katalog musik. Periksa koneksi Anda.');
          setLoading(false);
        }
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Fetch artist profile when selected
  useEffect(() => {
    if (!selectedArtistName) {
      setArtistProfile(null);
      return;
    }
    const controller = new AbortController();
    setArtistLoading(true);
    setArtistError(null);
    fetch(`/api/music/artist?name=${encodeURIComponent(selectedArtistName)}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error('Gagal memuat profil artis');
        return r.json();
      })
      .then((data: { artist?: ArtistProfile }) => {
        setArtistProfile(data.artist ?? null);
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          setArtistError('Profil artis tidak dapat dimuat saat ini.');
        }
      })
      .finally(() => setArtistLoading(false));

    return () => controller.abort();
  }, [selectedArtistName]);

  const filteredTracks = useMemo(() => {
    const genreObj = GENRE_FILTERS.find((g) => g.id === genreFilter);
    let list = results.filter((t) => {
      if (fullDurationOnly && t.durationMs > 0 && t.durationMs < 75_000) {
        return false;
      }
      if (genreObj?.regex && !genreObj.regex.test(`${t.genre} ${t.artist}`)) {
        return false;
      }
      return true;
    });
    if (sortOrder === 'duration_desc') {
      list = [...list].sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
    } else if (sortOrder === 'title_asc') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [fullDurationOnly, genreFilter, results, sortOrder]);

  if (selectedArtistName) {
    return (
      <div key={`artist-${selectedArtistName}`} className="space-y-6 pb-10 svara-page-enter">
        <button
          type="button"
          onClick={() => onSelectArtist(null)}
          className="svara-press inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.06] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft size={15} />
          <span>Kembali ke Pencarian</span>
        </button>

        {artistLoading ? (
          <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-8 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 size={18} className="animate-spin svara-accent-text" />
            <span>Memuat diskografi {selectedArtistName}...</span>
          </div>
        ) : artistError || !artistProfile ? (
          <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-6 text-sm text-zinc-500 dark:text-zinc-400">
            {artistError || 'Artis tidak ditemukan.'}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="svara-card relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.08] p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(var(--svara-accent-rgb),0.15),transparent_60%)] pointer-events-none"
              />
              <div className="relative z-10 flex items-center gap-5">
                <TrackArtwork
                  src={artistProfile.artworkUrl}
                  alt={artistProfile.name}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl border border-zinc-200 dark:border-white/15 shadow-xl"
                  iconSize={36}
                />
                <div>
                  <p className="text-xs font-semibold svara-accent-text">
                    Artis · {artistProfile.genre}
                  </p>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                    {artistProfile.name}
                  </h1>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
                    {artistProfile.tracks.length} lagu populer · {artistProfile.albums.length} rilis
                  </p>
                </div>
              </div>

              <div className="relative z-10 flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void downloadPlaylist(artistProfile.tracks)}
                  className="svara-press flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
                >
                  <Download size={14} />
                  <span>Unduh Semua</span>
                </button>
                <button
                  type="button"
                  onClick={() => void playTrackList(artistProfile.tracks, 0)}
                  className="svara-press flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold whitespace-nowrap cursor-pointer"
                >
                  <Play size={14} className="fill-zinc-950" />
                  <span>Putar Artis</span>
                </button>
              </div>
            </div>

            <div className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-4 sm:p-6">
              <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white mb-3">
                Lagu Terpopuler
              </h2>
              <div className="space-y-0.5">
                {artistProfile.tracks.map((track, idx) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={idx}
                    contextList={artistProfile.tracks}
                    onAlbumClick={onAlbumClick}
                    onAddToPlaylistClick={onAddToPlaylist}
                  />
                ))}
              </div>
            </div>

            {artistProfile.albums.length > 0 && (
              <div>
                <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white mb-3">
                  Album &amp; Single (Klik untuk Buka Halaman Album)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {artistProfile.albums.map((alb) => (
                    <button
                      key={alb.title}
                      type="button"
                      onClick={() => onAlbumClick?.(alb.title, artistProfile.name)}
                      className="svara-press svara-card group p-3 rounded-xl border border-zinc-200 dark:border-white/[0.06] hover:border-[var(--svara-accent)] text-left cursor-pointer"
                    >
                      <TrackArtwork
                        src={alb.artworkUrl}
                        alt={alb.title}
                        className="w-full aspect-square rounded-lg mb-2.5 transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:svara-accent-text truncate">
                        {alb.title}
                      </p>
                      <p className="text-xs text-zinc-500 tabular-nums mt-0.5">{alb.year}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-7 pb-10">
      {/* Search Bar & Advanced Filter Controls */}
      <section className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">
              Pencarian Canggih &amp; Katalog Artis
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Temukan lagu penuh, diskografi artis, dan halaman album lengkap dengan filter presisi
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`svara-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium self-start cursor-pointer ${
              showAdvanced
                ? 'bg-[rgba(var(--svara-accent-rgb),0.14)] border-[var(--svara-accent)] svara-accent-text'
                : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <SlidersHorizontal size={13} />
            <span>Filter Canggih</span>
          </button>
        </div>

        <div className="relative">
          <Search
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Contoh: Tulus, Hindia, The Weeknd, Coldplay, Bernadya, NIKI..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-[var(--svara-accent)] transition-colors"
          />
        </div>

        {/* Advanced Filter Panel */}
        {showAdvanced && (
          <div className="pt-3 border-t border-zinc-200 dark:border-white/[0.07] space-y-3 svara-page-enter">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'all', label: 'Semua Hasil' },
                  { id: 'tracks', label: 'Hanya Lagu' },
                  { id: 'artists', label: 'Artis' },
                  { id: 'albums', label: 'Album' },
                ] as { id: SearchTypeFilter; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTypeFilter(t.id)}
                  className={`svara-press px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                    typeFilter === t.id
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-transparent font-semibold'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-white/10'
                  }`}
                >
                  {t.label}
                </button>
              ))}

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                aria-label="Urutkan hasil"
                className="h-8 px-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="relevance">Urut: Paling Relevan</option>
                <option value="duration_desc">Urut: Durasi Terpanjang</option>
                <option value="title_asc">Urut: Judul A–Z</option>
              </select>

              <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={fullDurationOnly}
                  onChange={(e) => setFullDurationOnly(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-500"
                />
                <span>Hanya durasi penuh (&gt; 1:15)</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {GENRE_FILTERS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGenreFilter(g.id)}
                  className={`svara-press px-2.5 py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                    genreFilter === g.id
                      ? 'border-[var(--svara-accent)] bg-[rgba(var(--svara-accent-rgb),0.14)] svara-accent-text font-semibold'
                      : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent Searches */}
        {!query.trim() && recentSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <Clock size={12} />
              <span>Terakhir dicari:</span>
            </span>
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onQueryChange(term)}
                className="svara-press px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/[0.07] text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                {term}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setRecentSearches([]);
                localStorage.removeItem(RECENT_SEARCH_KEY);
              }}
              aria-label="Hapus riwayat pencarian"
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </section>

      {/* Search Results */}
      {query.trim() ? (
        <div className="space-y-6 svara-page-enter">
          {/* Top Artist Match Card */}
          {!loading &&
            !searchError &&
            topArtist &&
            (typeFilter === 'all' || typeFilter === 'artists') && (
              <section className="svara-card rounded-2xl border border-[rgba(var(--svara-accent-rgb),0.32)] p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => onSelectArtist(topArtist.name)}
                    className="svara-press flex items-center gap-4 text-left group cursor-pointer min-w-0"
                  >
                    <TrackArtwork
                      src={topArtist.artworkUrl}
                      alt={topArtist.name}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-[rgba(var(--svara-accent-rgb),0.45)] group-hover:scale-105 transition-transform shadow-xl"
                      iconSize={34}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider svara-accent-text">
                        Artis
                      </p>
                      <h2 className="font-display text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white group-hover:svara-accent-text transition-colors mt-0.5 break-words">
                        {topArtist.name}
                      </h2>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        {topArtist.genre}
                        {topArtist.trackCount > 0 ? ` · ${topArtist.trackCount} lagu teratas` : ''}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const artistTracks = results.filter((t) =>
                          t.artist.toLowerCase().includes(topArtist.name.toLowerCase())
                        );
                        void playTrackList(artistTracks.length > 0 ? artistTracks : results, 0);
                      }}
                      className="svara-press flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      <Play size={14} className="fill-zinc-950" />
                      <span>Putar Artis</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectArtist(topArtist.name)}
                      className="svara-press flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap cursor-pointer"
                    >
                      <span>Lihat Profil</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </section>
            )}

          {/* Matching Albums Carousel */}
          {!loading &&
            !searchError &&
            albums.length > 0 &&
            (typeFilter === 'all' || typeFilter === 'albums') && (
              <section>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Disc3 size={16} className="svara-accent-text" />
                    <span>Album Relevan</span>
                  </h2>
                  <span className="text-xs text-zinc-500">Klik album untuk melihat semua lagu</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {albums.map((alb) => (
                    <button
                      key={`${alb.title}-${alb.artist}`}
                      type="button"
                      onClick={() => onAlbumClick?.(alb.title, alb.artist)}
                      className="svara-press svara-card group p-3 rounded-xl border border-zinc-200 dark:border-white/[0.07] hover:border-[var(--svara-accent)] text-left cursor-pointer"
                    >
                      <TrackArtwork
                        src={alb.artworkUrl}
                        alt={alb.title}
                        className="w-full aspect-square rounded-lg mb-2 transition-transform duration-300 group-hover:scale-[1.03]"
                        iconSize={26}
                      />
                      <p className="text-xs font-semibold text-zinc-900 dark:text-white group-hover:svara-accent-text truncate">
                        {alb.title}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {alb.artist}
                        {alb.year ? ` · ${alb.year}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            )}

          {/* Track Matches */}
          {(typeFilter === 'all' || typeFilter === 'tracks') && (
            <section className="svara-card rounded-2xl border border-zinc-200 dark:border-white/[0.07] p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white">
                    Hasil Lagu untuk &ldquo;{query.trim()}&rdquo;
                  </h2>
                  {searchVerifiedCount !== null && filteredTracks.length > 0 && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5 font-mono">
                      <ShieldCheck size={12} />
                      <span>
                        Audio Guard: {searchVerifiedCount} terverifikasi penuh &amp; asli ({searchScanMs ?? 0} ms)
                      </span>
                    </p>
                  )}
                </div>
                {filteredTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void playTrackList(filteredTracks, 0)}
                    className="svara-press flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold cursor-pointer"
                  >
                    <Play size={13} className="fill-zinc-950" />
                    <span>Putar Semua</span>
                  </button>
                )}
              </div>

              {loading ? (
                <div className="py-10 flex items-center justify-center gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
                  <Loader2 size={18} className="animate-spin svara-accent-text" />
                  <span>Mencari artis, album, dan lagu di katalog...</span>
                </div>
              ) : searchError ? (
                <p className="py-6 text-sm text-rose-500 dark:text-rose-400">{searchError}</p>
              ) : filteredTracks.length === 0 ? (
                <p className="py-8 text-sm text-zinc-500 dark:text-zinc-400 text-center">
                  Tidak ditemukan lagu sesuai filter. Coba ubah kata kunci atau reset filter genre.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {filteredTracks.map((track, idx) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={idx}
                      contextList={filteredTracks}
                      onArtistClick={(name) => onSelectArtist(name)}
                      onAlbumClick={onAlbumClick}
                      onAddToPlaylistClick={onAddToPlaylist}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        /* Featured Artists Directory with Interactive Hover & Ring Glow */
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
              Jelajahi Berbagai Artis
            </h2>
            <span className="text-xs text-zinc-500">
              Klik artis untuk melihat lagu dan album
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {FEATURED_ARTISTS.map((artist) => {
              const matchedPortrait = featuredArtists.find(
                (fa) => fa.name.toLowerCase() === artist.name.toLowerCase()
              )?.artworkUrl;
              return (
                <button
                  key={artist.name}
                  type="button"
                  onClick={() => onSelectArtist(artist.name)}
                  className="svara-press svara-card group flex items-center gap-3 p-3.5 rounded-2xl border border-zinc-200 dark:border-white/[0.07] hover:border-[var(--svara-accent)] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_rgba(var(--svara-accent-rgb),0.45)] text-left transition-all duration-200 cursor-pointer"
                >
                  {matchedPortrait ? (
                    <TrackArtwork
                      src={matchedPortrait}
                      alt={artist.name}
                      className="w-12 h-12 rounded-full border border-zinc-200 dark:border-white/15 group-hover:border-[var(--svara-accent)] group-hover:scale-105 transition-all"
                      iconSize={20}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-white/10 group-hover:border-[var(--svara-accent)] flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0 transition-colors">
                      <User size={18} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white group-hover:svara-accent-text truncate transition-colors">
                      {artist.name}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{artist.genre}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
