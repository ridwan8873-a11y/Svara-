import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { PlaybackTimeProvider, usePlaybackTime } from '@/src/context/PlaybackTimeContext';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { audioEngine, EQ_PRESETS } from '@/src/lib/audioEngine';
import {
  auth,
  deletePlaylistFromCloud,
  loadCloudLibrary,
  signInWithGoogleCloud,
  signOutGoogleCloud,
  syncPlaylistToCloud,
  syncVaultMetaToCloud,
  testFirestoreConnection,
} from '@/src/lib/firebase';
import {
  clearAllOfflineTracks,
  getAllOfflineTracks,
  getFullAudioUrl,
  getOfflineTrack,
  getStoragePersistenceInfo,
  importLocalAudioFile,
  removeTrackOffline,
  requestPersistentStorage,
  saveTrackOffline,
  type StoragePersistenceInfo,
} from '@/src/lib/offlineDb';
import { getTrackAccentPalette, type TrackAccentPalette } from '@/src/lib/trackTheme';
import {
  exportVaultAsJsonFile,
  getOrCreateSyncCode,
  loadVaultFromServer,
  parseImportedVaultJson,
  saveVaultToServer,
  setStoredSyncCode,
} from '@/src/lib/vaultBackup';
import {
  addListeningSecondsToLogs,
  addTrackPlayToLogs,
  buildWeeklyWrappedSummary,
  DEFAULT_STREAK_STATE,
  evaluateStreakStatus,
  getLocalDateKey,
  recordMusicPlayedForStreak,
  type EvaluatedStreak,
} from '@/src/lib/wrappedAndStreak';
import type {
  AccentThemeId,
  AudioQuality,
  DailyListeningLog,
  EQPresetId,
  OfflineTrackRecord,
  PersonalRecommendationsResponse,
  PlayHistoryEntry,
  Playlist,
  RepeatMode,
  SentinelScanReport,
  SleepTimerMode,
  StreakState,
  SvaraVaultPayload,
  ThemeMode,
  Track,
  TrackLyrics,
  WeeklyWrappedSummary,
} from '@/src/types/music';

export interface SentinelRepairEntry {
  oldTitle: string;
  oldArtist: string;
  newTitle: string;
  newArtist: string;
  ts: number;
}

const STORAGE_PLAYLISTS_KEY = 'svara_playlists_v1';
const STORAGE_LIKED_KEY = 'svara_liked_v1';
const STORAGE_RECENT_KEY = 'svara_recent_v1';
const STORAGE_HISTORY_KEY = 'svara_play_history_v1';
const STORAGE_RATINGS_KEY = 'svara_track_ratings_v1';
const STORAGE_SETTINGS_KEY = 'svara_audio_settings_v1';
const STORAGE_SESSION_KEY = 'svara_playback_session_v1';
const STORAGE_LYRICS_CACHE_KEY = 'svara_lyrics_cache_v2';
const STORAGE_STREAK_KEY = 'svara_streak_v1';
const STORAGE_LOGS_KEY = 'svara_daily_logs_v1';
const STORAGE_LYRIC_OFFSETS_KEY = 'svara_lyric_offsets_v1';

const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-favorit-malam',
    name: 'Malam & Fokus',
    description: 'Pilihan nada tenang untuk bekerja atau berkendara malam.',
    coverUrl: '',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
    tracks: [],
  },
  {
    id: 'pl-nusantara-kini',
    name: 'Pilihan Favorit',
    description: 'Koleksi lagu favorit pribadi lintas artis.',
    coverUrl: '',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
    tracks: [],
  },
];

interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

interface PlayerContextValue {
  currentTrack: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  queue: Track[];
  queueIndex: number;
  recentTracks: Track[];
  playHistory: PlayHistoryEntry[];
  clearPlayHistory: () => void;
  trackRatings: Record<string, number>;
  rateTrack: (trackId: string, rating: number) => void;
  trackAccent: TrackAccentPalette;

  audioQuality: AudioQuality;
  eqPreset: EQPresetId;
  eqGains: number[];
  lowRamMode: boolean;
  gaplessEnabled: boolean;
  crossfadeSec: number;
  volumeNormalization: boolean;
  setAudioQuality: (q: AudioQuality) => void;
  setEQPreset: (preset: EQPresetId) => void;
  setCustomEQBand: (index: number, gain: number) => void;
  setLowRamMode: (val: boolean) => void;
  setGaplessEnabled: (val: boolean) => void;
  setCrossfadeSec: (sec: number) => void;
  setVolumeNormalization: (val: boolean) => void;

  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  accentTheme: AccentThemeId;
  setAccentTheme: (theme: AccentThemeId) => void;
  customAccentHex: string;
  setCustomAccentHex: (hex: string) => void;

  sleepTimerMode: SleepTimerMode;
  sleepTimerRemainingSec: number | null;
  setSleepTimerMinutes: (minutes: number) => void;
  setSleepTimerEndOfTrack: () => void;
  cancelSleepTimer: () => void;

  miniPlayerOpen: boolean;
  setMiniPlayerOpen: (open: boolean) => void;
  castSupported: boolean;
  promptCast: () => Promise<void>;

  isOnline: boolean;
  offlineMode: boolean;
  setOfflineMode: (val: boolean) => void;
  offlineRecords: OfflineTrackRecord[];
  offlineIds: Set<string>;
  offlineArtworkMap: Record<string, string>;
  downloadingIds: Set<string>;
  totalOfflineBytes: number;
  storageInfo: StoragePersistenceInfo;
  enablePermanentStorage: () => Promise<boolean>;
  downloadTrack: (track: Track) => Promise<void>;
  downloadPlaylist: (tracks: Track[]) => Promise<void>;
  importLocalFiles: (files: FileList | File[]) => Promise<void>;
  removeOffline: (trackId: string) => Promise<void>;
  clearAllOffline: () => Promise<void>;

  playlists: Playlist[];
  likedTracks: Track[];
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => void;
  createPlaylist: (name: string, description?: string, initialTracks?: Track[]) => Playlist;
  renamePlaylist: (id: string, name: string, description?: string) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;

  playTrack: (track: Track, contextList?: Track[]) => Promise<void>;
  playTrackList: (tracks: Track[], startIndex?: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  seek: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: Track) => void;
  playNextInQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;

  lyrics: TrackLyrics | null;
  lyricsLoading: boolean;
  lyricOffsetSec: number;
  adjustLyricOffset: (deltaSec: number) => void;
  resetLyricOffset: () => void;

  sentinelReport: SentinelScanReport | null;
  isScanningSentinel: boolean;
  sentinelRepairLog: SentinelRepairEntry[];
  runSentinelScan: (extraTracks?: Track[]) => Promise<SentinelScanReport | null>;
  registerDiscoverTracks: (tracks: Track[]) => void;

  streakState: StreakState;
  evaluatedStreak: EvaluatedStreak;
  dailyLogs: Record<string, DailyListeningLog>;
  weeklyWrapped: WeeklyWrappedSummary;

  personalRecs: PersonalRecommendationsResponse | null;
  personalRecsLoading: boolean;
  refreshPersonalRecs: (force?: boolean) => Promise<void>;

  cloudUser: User | null;
  cloudAuthReady: boolean;
  cloudSyncing: boolean;
  lastSyncedAt: number | null;
  signInCloud: () => Promise<void>;
  signOutCloud: () => Promise<void>;
  syncCloudNow: () => Promise<void>;

  vaultSyncCode: string;
  saveVaultServer: (customCode?: string) => Promise<void>;
  restoreVaultServer: (code: string) => Promise<void>;
  exportBackupJson: () => void;
  importBackupJson: (rawText: string) => void;

  toasts: ToastMessage[];
  showToast: (text: string, tone?: 'info' | 'success' | 'error') => void;
  dismissToast: (id: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOnline = useOnlineStatus();

  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    loadJSON<Playlist[]>(STORAGE_PLAYLISTS_KEY, DEFAULT_PLAYLISTS).map((pl) => ({
      ...pl,
      coverUrl:
        pl.coverUrl && pl.coverUrl.startsWith('/src/assets/images/')
          ? pl.tracks?.[0]?.artworkUrl || ''
          : pl.coverUrl || '',
    }))
  );
  const [likedTracks, setLikedTracks] = useState<Track[]>(() =>
    loadJSON<Track[]>(STORAGE_LIKED_KEY, [])
  );
  const [recentTracks, setRecentTracks] = useState<Track[]>(() =>
    loadJSON<Track[]>(STORAGE_RECENT_KEY, [])
  );
  const [playHistory, setPlayHistory] = useState<PlayHistoryEntry[]>(() =>
    loadJSON<PlayHistoryEntry[]>(STORAGE_HISTORY_KEY, [])
  );
  const [trackRatings, setTrackRatings] = useState<Record<string, number>>(() =>
    loadJSON<Record<string, number>>(STORAGE_RATINGS_KEY, {})
  );

  const [streakState, setStreakState] = useState<StreakState>(() =>
    loadJSON<StreakState>(STORAGE_STREAK_KEY, DEFAULT_STREAK_STATE)
  );
  const [dailyLogs, setDailyLogs] = useState<Record<string, DailyListeningLog>>(() =>
    loadJSON<Record<string, DailyListeningLog>>(STORAGE_LOGS_KEY, {})
  );
  const [lyricOffsets, setLyricOffsets] = useState<Record<string, number>>(() =>
    loadJSON<Record<string, number>>(STORAGE_LYRIC_OFFSETS_KEY, {})
  );

  const initialSettings = useMemo(
    () =>
      loadJSON<{
        quality: AudioQuality;
        eqPreset: EQPresetId;
        eqGains: number[];
        volume: number;
        offlineMode: boolean;
        lowRamMode?: boolean;
        gapless?: boolean;
        crossfadeSec?: number;
        volumeNormalization?: boolean;
        themeMode?: ThemeMode;
        accentTheme?: AccentThemeId;
        customAccentHex?: string;
      }>(STORAGE_SETTINGS_KEY, {
        quality: 'hires',
        eqPreset: 'flat',
        eqGains: [0, 0, 0, 0, 0],
        volume: 0.85,
        offlineMode: false,
        lowRamMode: false,
        gapless: true,
        crossfadeSec: 0,
        volumeNormalization: true,
        themeMode: 'dark',
        accentTheme: 'auto',
        customAccentHex: '#10B981',
      }),
    []
  );

  const initialSession = useMemo(() => {
    const raw = loadJSON<{
      currentTrack: Track | null;
      queue: Track[];
      queueIndex: number;
      currentTime: number;
    }>(STORAGE_SESSION_KEY, {
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      currentTime: 0,
    });
    const validTrack =
      raw?.currentTrack && typeof raw.currentTrack.id === 'string' && typeof raw.currentTrack.title === 'string'
        ? raw.currentTrack
        : null;
    const validQueue = Array.isArray(raw?.queue)
      ? raw.queue.filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string')
      : [];
    return {
      currentTrack: validTrack,
      queue: validQueue,
      queueIndex: typeof raw?.queueIndex === 'number' ? raw.queueIndex : -1,
      currentTime: typeof raw?.currentTime === 'number' && Number.isFinite(raw.currentTime) ? raw.currentTime : 0,
    };
  }, []);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(initialSession.currentTrack);
  const [queue, setQueue] = useState<Track[]>(initialSession.queue);
  const [queueIndex, setQueueIndex] = useState<number>(initialSession.queueIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [volume, setVolumeState] = useState(initialSettings.volume);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');

  const [audioQuality, setAudioQualityState] = useState<AudioQuality>(initialSettings.quality);
  const [eqPreset, setEQPresetState] = useState<EQPresetId>(initialSettings.eqPreset);
  const [eqGains, setEQGains] = useState<number[]>(initialSettings.eqGains);
  const [offlineMode, setOfflineMode] = useState<boolean>(initialSettings.offlineMode);
  const [lowRamMode, setLowRamModeState] = useState<boolean>(Boolean(initialSettings.lowRamMode));

  const [gaplessEnabled, setGaplessEnabledState] = useState<boolean>(
    initialSettings.gapless !== undefined ? Boolean(initialSettings.gapless) : true
  );
  const [crossfadeSec, setCrossfadeSecState] = useState<number>(
    typeof initialSettings.crossfadeSec === 'number' ? initialSettings.crossfadeSec : 0
  );
  const [volumeNormalization, setVolumeNormalizationState] = useState<boolean>(
    initialSettings.volumeNormalization !== undefined
      ? Boolean(initialSettings.volumeNormalization)
      : true
  );

  const [themeMode, setThemeModeState] = useState<ThemeMode>(
    initialSettings.themeMode === 'light' ? 'light' : 'dark'
  );
  const [accentTheme, setAccentThemeState] = useState<AccentThemeId>(
    initialSettings.accentTheme || 'auto'
  );
  const [customAccentHex, setCustomAccentHexState] = useState<string>(
    initialSettings.customAccentHex || '#10B981'
  );

  const [sleepTimerMode, setSleepTimerMode] = useState<SleepTimerMode>('off');
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState<number | null>(null);
  const [miniPlayerOpen, setMiniPlayerOpen] = useState(false);
  const castSupported = useMemo(() => audioEngine.isCastSupported(), []);

  const [offlineRecords, setOfflineRecords] = useState<OfflineTrackRecord[]>([]);
  const [offlineArtworkMap, setOfflineArtworkMap] = useState<Record<string, string>>({});
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [storageInfo, setStorageInfo] = useState<StoragePersistenceInfo>({
    supported: false,
    persisted: false,
    usageBytes: 0,
    quotaBytes: 0,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [personalRecs, setPersonalRecs] = useState<PersonalRecommendationsResponse | null>(null);
  const [personalRecsLoading, setPersonalRecsLoading] = useState(false);

  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudAuthReady, setCloudAuthReady] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [vaultSyncCode, setVaultSyncCode] = useState<string>(() => getOrCreateSyncCode());

  const tabIdRef = useRef<string>(Math.random().toString(36).slice(2));
  const channelRef = useRef<BroadcastChannel | null>(null);
  const currentTrackRef = useRef<Track | null>(currentTrack);
  const queueRef = useRef<Track[]>(queue);
  const queueIndexRef = useRef<number>(queueIndex);
  const shuffleRef = useRef<boolean>(shuffle);
  const repeatRef = useRef<RepeatMode>(repeatMode);
  const offlineModeRef = useRef<boolean>(offlineMode);
  const isOnlineRef = useRef<boolean>(isOnline);
  const audioQualityRef = useRef<AudioQuality>(audioQuality);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const gaplessRef = useRef<boolean>(gaplessEnabled);
  const crossfadeRef = useRef<number>(crossfadeSec);
  const sleepModeRef = useRef<SleepTimerMode>(sleepTimerMode);
  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);

  currentTrackRef.current = currentTrack;
  queueRef.current = queue;
  queueIndexRef.current = queueIndex;
  shuffleRef.current = shuffle;
  repeatRef.current = repeatMode;
  offlineModeRef.current = offlineMode;
  isOnlineRef.current = isOnline;
  audioQualityRef.current = audioQuality;
  isPlayingRef.current = isPlaying;
  gaplessRef.current = gaplessEnabled;
  crossfadeRef.current = crossfadeSec;
  sleepModeRef.current = sleepTimerMode;
  volumeRef.current = volume;
  isMutedRef.current = isMuted;

  const preloadedNextRef = useRef<{
    forTrackId: string;
    nextTrack: Track;
    nextIndex: number;
    srcUrl: string;
    artUrl: string;
  } | null>(null);
  const transitioningRef = useRef(false);

  const [lyrics, setLyrics] = useState<TrackLyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  const [sentinelReport, setSentinelReport] = useState<SentinelScanReport | null>(null);
  const [isScanningSentinel, setIsScanningSentinel] = useState(false);
  const [sentinelRepairLog, setSentinelRepairLog] = useState<SentinelRepairEntry[]>([]);
  const discoverPoolRef = useRef<Track[]>([]);
  const hasAutoScannedRef = useRef(false);
  const hasLoadedPersonalRef = useRef(false);

  const showToast = useCallback((text: string, tone: 'info' | 'success' | 'error' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Apply Dark / Light Theme to <html> and <meta name="theme-color">
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', themeMode === 'dark');
    root.style.colorScheme = themeMode;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', themeMode === 'dark' ? '#09090B' : '#F4F5F7');
    }
  }, [themeMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      showToast(`Tampilan ${next === 'dark' ? 'Mode Gelap' : 'Mode Terang'} aktif`, 'info');
      return next;
    });
  }, [showToast]);

  const setAccentTheme = useCallback(
    (theme: AccentThemeId) => {
      setAccentThemeState(theme);
      showToast(
        theme === 'auto'
          ? 'Warna aksen otomatis mengikuti lagu yang diputar'
          : 'Warna aksen tema diperbarui',
        'info'
      );
    },
    [showToast]
  );

  const setCustomAccentHex = useCallback((hex: string) => {
    setCustomAccentHexState(hex);
    setAccentThemeState('custom');
  }, []);

  // Apply Low-RAM class on root HTML & AudioEngine
  useEffect(() => {
    document.documentElement.classList.toggle('low-ram', lowRamMode);
    audioEngine.setLowRamMode(lowRamMode);
  }, [lowRamMode]);

  const setLowRamMode = useCallback(
    (val: boolean) => {
      setLowRamModeState(val);
      showToast(
        val
          ? 'Mode Performa Ringan aktif (hemat RAM & baterai)'
          : 'Mode Visual Studio penuh diaktifkan',
        'info'
      );
    },
    [showToast]
  );

  const setGaplessEnabled = useCallback(
    (val: boolean) => {
      setGaplessEnabledState(val);
      showToast(
        val
          ? 'Pemutaran berkelanjutan tanpa jeda (Gapless) aktif'
          : 'Pemutaran Gapless dimatikan',
        'info'
      );
    },
    [showToast]
  );

  const setCrossfadeSec = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(12, Math.round(sec)));
    setCrossfadeSecState(clamped);
  }, []);

  const setVolumeNormalization = useCallback(
    (val: boolean) => {
      setVolumeNormalizationState(val);
      audioEngine.setVolumeNormalization(val);
      showToast(
        val
          ? 'Penyeragam volume otomatis (Loudness Normalization) aktif'
          : 'Penyeragam volume dimatikan',
        'info'
      );
    },
    [showToast]
  );

  // Dynamic accent color palette reacting smoothly to playing track or user customization
  const trackAccent = useMemo(
    () => getTrackAccentPalette(currentTrack, isPlaying, accentTheme, customAccentHex),
    [currentTrack, isPlaying, accentTheme, customAccentHex]
  );

  useEffect(() => {
    document.documentElement.style.setProperty('--svara-accent', trackAccent.hex);
    document.documentElement.style.setProperty('--svara-accent-rgb', trackAccent.rgb);
  }, [trackAccent]);

  // Keep daily date key synced so streak & wrapped roll over cleanly across midnight
  const [todayKey, setTodayKey] = useState(() => getLocalDateKey());
  useEffect(() => {
    const checkDate = () => {
      const next = getLocalDateKey();
      setTodayKey((prev) => (prev === next ? prev : next));
    };
    const timer = window.setInterval(checkDate, 60_000);
    window.addEventListener('focus', checkDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkDate);
    };
  }, []);

  const evaluatedStreak = useMemo(
    () => evaluateStreakStatus(streakState, todayKey),
    [streakState, todayKey]
  );

  const weeklyWrapped = useMemo(
    () => buildWeeklyWrappedSummary(dailyLogs, todayKey),
    [dailyLogs, todayKey]
  );

  // Record history entry & trigger streak increment/reignition
  const recordHistoryAndStreak = useCallback(
    (track: Track) => {
      const dayKey = getLocalDateKey();
      setDailyLogs((prev) => addTrackPlayToLogs(prev, track, dayKey));
      setPlayHistory((prev) => {
        const entry: PlayHistoryEntry = {
          id: `${track.id}-${Date.now()}`,
          track,
          playedAt: Date.now(),
        };
        return [entry, ...prev].slice(0, 200);
      });
      setStreakState((prev) => {
        const { nextState, event } = recordMusicPlayedForStreak(prev, dayKey);
        if (event === 'incremented') {
          showToast(`🔥 Api Streak naik ke ${nextState.currentStreak} hari berturut-turut!`, 'success');
        } else if (event === 'reignited') {
          showToast('🔥 Api Streak menyala kembali dari 1 hari!', 'info');
        } else if (event === 'started') {
          showToast('🔥 Api Streak hari ke-1 menyala!', 'success');
        }
        return nextState;
      });
    },
    [showToast]
  );

  const clearPlayHistory = useCallback(() => {
    setPlayHistory([]);
    showToast('Riwayat putar dibersihkan', 'info');
  }, [showToast]);

  const rateTrack = useCallback(
    (trackId: string, rating: number) => {
      const clamped = Math.max(0, Math.min(5, Math.round(rating)));
      setTrackRatings((prev) => {
        const next = { ...prev };
        if (clamped === 0 || prev[trackId] === clamped) {
          delete next[trackId];
          showToast('Penilaian bintang dihapus', 'info');
        } else {
          next[trackId] = clamped;
          showToast(`Dinilai ${clamped} ★`, 'success');
        }
        return next;
      });
    },
    [showToast]
  );

  // Sleep Timer countdown & smooth fade-out pause
  const setSleepTimerMinutes = useCallback(
    (minutes: number) => {
      const sec = Math.max(60, Math.round(minutes * 60));
      setSleepTimerMode('minutes');
      setSleepTimerRemainingSec(sec);
      showToast(`Pengatur waktu tidur: ${minutes} menit`, 'info');
    },
    [showToast]
  );

  const setSleepTimerEndOfTrack = useCallback(() => {
    setSleepTimerMode('end_of_track');
    setSleepTimerRemainingSec(null);
    showToast('Musik akan berhenti setelah lagu ini selesai', 'info');
  }, [showToast]);

  const cancelSleepTimer = useCallback(() => {
    setSleepTimerMode('off');
    setSleepTimerRemainingSec(null);
    audioEngine.setVolume(volumeRef.current, isMutedRef.current);
    showToast('Pengatur waktu tidur dibatalkan', 'info');
  }, [showToast]);

  useEffect(() => {
    if (sleepTimerMode !== 'minutes') return;
    const timer = window.setInterval(() => {
      setSleepTimerRemainingSec((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          audioEngine.pause();
          audioEngine.setVolume(volumeRef.current, isMutedRef.current);
          setIsPlaying(false);
          setSleepTimerMode('off');
          showToast('Waktu tidur selesai · Pemutaran dijeda', 'info');
          return null;
        }
        if (prev <= 4 && !isMutedRef.current) {
          const factor = (prev - 1) / 4;
          audioEngine.setVolume(volumeRef.current * factor, false);
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepTimerMode, showToast]);

  const promptCast = useCallback(async () => {
    const status = await audioEngine.promptCastDevice();
    if (status === 'connected') {
      showToast('Dialog perangkat Cast / speaker nirkabel dibuka', 'success');
    } else if (status === 'unsupported') {
      showToast(
        'Browser ini tidak mengekspos tombol Cast langsung. Gunakan menu Chrome → Cast, Bagikan, & Simpan untuk mengirim audio ke TV/Chromecast.',
        'info'
      );
    }
  }, [showToast]);

  // Track real listening seconds every 5 seconds while audio is actively playing
  useEffect(() => {
    if (!isPlaying || !currentTrack) return;
    const interval = window.setInterval(() => {
      const el = audioEngine.getElement();
      if (!el.paused && currentTrackRef.current) {
        setDailyLogs((prev) =>
          addListeningSecondsToLogs(prev, currentTrackRef.current!, 5, new Date())
        );
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isPlaying, currentTrack]);

  // Storage persistence info for Offline Mode
  const refreshStorageInfo = useCallback(async () => {
    const info = await getStoragePersistenceInfo();
    setStorageInfo(info);
  }, []);

  const enablePermanentStorage = useCallback(async () => {
    const granted = await requestPersistentStorage();
    await refreshStorageInfo();
    showToast(
      granted
        ? 'Penyimpanan permanen perangkat aktif untuk unduhan offline'
        : 'Browser menyimpan file di IndexedDB lokal perangkat',
      granted ? 'success' : 'info'
    );
    return granted;
  }, [refreshStorageInfo, showToast]);

  const applySentinelRepairs = useCallback(
    (repairMap: Map<string, Track>, originalMap: Map<string, Track>) => {
      if (repairMap.size === 0) return;
      const swap = (t: Track): Track => repairMap.get(t.id) || t;

      setPlaylists((prev) =>
        prev.map((pl) => {
          let changed = false;
          const nextTracks = pl.tracks.map((t) => {
            const rep = repairMap.get(t.id);
            if (rep) {
              changed = true;
              return rep;
            }
            return t;
          });
          return changed ? { ...pl, tracks: nextTracks, updatedAt: Date.now() } : pl;
        })
      );
      setLikedTracks((prev) => prev.map(swap));
      setRecentTracks((prev) => prev.map(swap));
      setQueue((prev) => prev.map(swap));
      setCurrentTrack((prev) => (prev ? swap(prev) : prev));

      const logEntries: SentinelRepairEntry[] = [];
      repairMap.forEach((newTrack, oldId) => {
        const oldTrack = originalMap.get(oldId);
        if (oldTrack) {
          logEntries.push({
            oldTitle: oldTrack.title,
            oldArtist: oldTrack.artist,
            newTitle: newTrack.title,
            newArtist: newTrack.artist,
            ts: Date.now(),
          });
        }
      });
      if (logEntries.length > 0) {
        setSentinelRepairLog((prev) => [...logEntries, ...prev].slice(0, 20));
        showToast(
          `Audio Guard memperbarui otomatis ${logEntries.length} lagu ke versi studio asli`,
          'success'
        );
      }
    },
    [showToast]
  );

  const runSentinelScan = useCallback(
    async (extraTracks: Track[] = []): Promise<SentinelScanReport | null> => {
      if (!isOnlineRef.current) return null;
      const candidateMap = new Map<string, Track>();
      const addAll = (list: Track[]) => {
        for (const t of list) {
          if (t && t.id && !candidateMap.has(t.id)) {
            candidateMap.set(t.id, t);
          }
        }
      };

      addAll(extraTracks);
      if (currentTrackRef.current) addAll([currentTrackRef.current]);
      addAll(queueRef.current);
      addAll(likedTracks);
      addAll(recentTracks);
      for (const pl of playlists) {
        addAll(pl.tracks);
      }
      addAll(discoverPoolRef.current);

      const batch = Array.from(candidateMap.values()).slice(0, 45);
      if (batch.length === 0) return null;

      setIsScanningSentinel(true);
      try {
        const res = await fetch('/api/music/sentinel/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: batch }),
        });
        if (!res.ok) return null;
        const report = (await res.json()) as SentinelScanReport;
        setSentinelReport(report);

        const repairMap = new Map<string, Track>();
        for (const item of report.results) {
          if (item.repairedTrack) {
            repairMap.set(item.id, item.repairedTrack);
          }
        }
        if (repairMap.size > 0) {
          applySentinelRepairs(repairMap, candidateMap);
        }
        return report;
      } catch {
        return null;
      } finally {
        setIsScanningSentinel(false);
      }
    },
    [applySentinelRepairs, likedTracks, playlists, recentTracks]
  );

  const registerDiscoverTracks = useCallback(
    (tracks: Track[]) => {
      discoverPoolRef.current = tracks;
      if (!hasAutoScannedRef.current && tracks.length > 0 && isOnlineRef.current) {
        hasAutoScannedRef.current = true;
        void runSentinelScan(tracks);
      }
    },
    [runSentinelScan]
  );

  // Personalized recommendations feed
  const refreshPersonalRecs = useCallback(
    async (force = false) => {
      if (!isOnlineRef.current) return;
      if (!force && hasLoadedPersonalRef.current && personalRecs) return;
      hasLoadedPersonalRef.current = true;
      setPersonalRecsLoading(true);
      try {
        const res = await fetch('/api/music/recommendations/personal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            likedTracks: likedTracks.slice(0, 15).map((t) => ({
              id: t.id,
              title: t.title,
              artist: t.artist,
              genre: t.genre,
            })),
            recentTracks: recentTracks.slice(0, 12).map((t) => ({
              id: t.id,
              title: t.title,
              artist: t.artist,
              genre: t.genre,
            })),
            topArtists: weeklyWrapped.topArtists.slice(0, 4).map((a) => a.name),
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as PersonalRecommendationsResponse;
          setPersonalRecs(data);
        }
      } catch {
        // Ignore recommendation network failure silently
      } finally {
        setPersonalRecsLoading(false);
      }
    },
    [likedTracks, personalRecs, recentTracks, weeklyWrapped.topArtists]
  );

  useEffect(() => {
    if (isOnline && !hasLoadedPersonalRef.current) {
      void refreshPersonalRecs(false);
    }
  }, [isOnline, refreshPersonalRecs]);

  // Fetch & cache synced/plain lyrics (checking Offline IndexedDB first!)
  useEffect(() => {
    if (!currentTrack) {
      setLyrics(null);
      setLyricsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const loadLyrics = async () => {
      try {
        const offlineRec = await getOfflineTrack(currentTrack.id);
        if (!cancelled && offlineRec?.lyrics && (offlineRec.lyrics.synced.length > 0 || offlineRec.lyrics.plain)) {
          setLyrics(offlineRec.lyrics);
          setLyricsLoading(false);
          return;
        }
      } catch {
        // Ignore IndexedDB read errors
      }

      const cacheMap = loadJSON<Record<string, TrackLyrics>>(STORAGE_LYRICS_CACHE_KEY, {});
      const cached = cacheMap[currentTrack.id];
      if (!cancelled && cached) {
        setLyrics(cached);
        setLyricsLoading(false);
        return;
      }

      if (!isOnlineRef.current) {
        if (!cancelled) {
          setLyrics({ synced: [], plain: '', source: null });
          setLyricsLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLyricsLoading(true);
        setLyrics(null);
      }

      const params = new URLSearchParams({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        durationMs: String(currentTrack.durationMs || 0),
      });

      try {
        const r = await fetch(`/api/music/lyrics?${params.toString()}`, {
          signal: controller.signal,
        });
        const data: TrackLyrics = r.ok ? await r.json() : { synced: [], plain: '', source: null };
        if (cancelled) return;
        setLyrics(data);
        if (data.source) {
          try {
            const latestMap = loadJSON<Record<string, TrackLyrics>>(STORAGE_LYRICS_CACHE_KEY, {});
            const keys = Object.keys(latestMap);
            if (keys.length > 50) {
              delete latestMap[keys[0]];
            }
            latestMap[currentTrack.id] = data;
            localStorage.setItem(STORAGE_LYRICS_CACHE_KEY, JSON.stringify(latestMap));
          } catch {
            // Ignore localStorage quota
          }
        }
      } catch (err) {
        if (!cancelled && (err as Error).name !== 'AbortError') {
          setLyrics({ synced: [], plain: '', source: null });
        }
      } finally {
        if (!cancelled) setLyricsLoading(false);
      }
    };

    void loadLyrics();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentTrack]);

  const lyricOffsetSec = currentTrack ? lyricOffsets[currentTrack.id] ?? 0 : 0;

  const adjustLyricOffset = useCallback((deltaSec: number) => {
    if (!currentTrackRef.current) return;
    const tid = currentTrackRef.current.id;
    setLyricOffsets((prev) => {
      const cur = prev[tid] ?? 0;
      const next = Math.max(-4, Math.min(4, Math.round((cur + deltaSec) * 10) / 10));
      return { ...prev, [tid]: next };
    });
  }, []);

  const resetLyricOffset = useCallback(() => {
    if (!currentTrackRef.current) return;
    const tid = currentTrackRef.current.id;
    setLyricOffsets((prev) => {
      const copy = { ...prev };
      delete copy[tid];
      return copy;
    });
  }, []);

  // Load offline tracks from IndexedDB
  const refreshOfflineRecords = useCallback(async () => {
    try {
      const [records, info] = await Promise.all([
        getAllOfflineTracks(),
        getStoragePersistenceInfo(),
      ]);
      setStorageInfo(info);
      setOfflineRecords(records);
      setOfflineArtworkMap((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        const next: Record<string, string> = {};
        for (const rec of records) {
          if (rec.artworkBlob) {
            next[rec.id] = URL.createObjectURL(rec.artworkBlob);
          }
        }
        return next;
      });
    } catch {
      // IndexedDB unavailable
    }
  }, []);

  useEffect(() => {
    void refreshOfflineRecords();
    return () => {
      setOfflineArtworkMap((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
    };
  }, [refreshOfflineRecords]);

  // Persist user data locally
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PLAYLISTS_KEY, JSON.stringify(playlists));
    } catch {
      // Ignore quota errors
    }
  }, [playlists]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LIKED_KEY, JSON.stringify(likedTracks));
    } catch {
      // Ignore quota errors
    }
  }, [likedTracks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_RECENT_KEY, JSON.stringify(recentTracks));
    } catch {
      // Ignore quota errors
    }
  }, [recentTracks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(playHistory));
    } catch {
      // Ignore quota errors
    }
  }, [playHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_RATINGS_KEY, JSON.stringify(trackRatings));
    } catch {
      // Ignore quota errors
    }
  }, [trackRatings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STREAK_KEY, JSON.stringify(streakState));
    } catch {
      // Ignore quota
    }
  }, [streakState]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(dailyLogs));
    } catch {
      // Ignore quota
    }
  }, [dailyLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LYRIC_OFFSETS_KEY, JSON.stringify(lyricOffsets));
    } catch {
      // Ignore quota
    }
  }, [lyricOffsets]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_SETTINGS_KEY,
        JSON.stringify({
          quality: audioQuality,
          eqPreset,
          eqGains,
          volume,
          offlineMode,
          lowRamMode,
          gapless: gaplessEnabled,
          crossfadeSec,
          volumeNormalization,
          themeMode,
          accentTheme,
          customAccentHex,
        })
      );
    } catch {
      // Ignore
    }
  }, [
    audioQuality,
    eqPreset,
    eqGains,
    volume,
    offlineMode,
    lowRamMode,
    gaplessEnabled,
    crossfadeSec,
    volumeNormalization,
    themeMode,
    accentTheme,
    customAccentHex,
  ]);

  // Build full vault payload for Cloud Sync, Server Disk Vault, & JSON File Export
  const buildVaultPayload = useCallback(
    (): SvaraVaultPayload => ({
      version: 2,
      exportedAt: Date.now(),
      playlists,
      likedTracks,
      recentTracks,
      playHistory,
      trackRatings,
      streak: streakState,
      dailyLogs,
      lyricOffsets,
      settings: {
        quality: audioQuality,
        eqPreset,
        eqGains,
        volume,
        lowRamMode,
        gapless: gaplessEnabled,
        crossfadeSec,
        volumeNormalization,
        themeMode,
        accentTheme,
        customAccentHex,
      },
    }),
    [
      accentTheme,
      audioQuality,
      crossfadeSec,
      customAccentHex,
      dailyLogs,
      eqGains,
      eqPreset,
      gaplessEnabled,
      likedTracks,
      lowRamMode,
      lyricOffsets,
      playHistory,
      playlists,
      recentTracks,
      streakState,
      themeMode,
      trackRatings,
      volume,
      volumeNormalization,
    ]
  );

  const applyImportedVaultPayload = useCallback((payload: SvaraVaultPayload) => {
    if (Array.isArray(payload.playlists)) {
      setPlaylists(payload.playlists);
    }
    if (Array.isArray(payload.likedTracks)) {
      setLikedTracks(payload.likedTracks);
    }
    if (Array.isArray(payload.recentTracks)) {
      setRecentTracks(payload.recentTracks);
    }
    if (Array.isArray(payload.playHistory)) {
      setPlayHistory(payload.playHistory);
    }
    if (payload.trackRatings && typeof payload.trackRatings === 'object') {
      setTrackRatings(payload.trackRatings);
    }
    if (payload.streak) {
      setStreakState(payload.streak);
    }
    if (payload.dailyLogs) {
      setDailyLogs(payload.dailyLogs);
    }
    if (payload.lyricOffsets) {
      setLyricOffsets(payload.lyricOffsets);
    }
    if (payload.settings) {
      setAudioQualityState(payload.settings.quality || 'hires');
      setEQPresetState(payload.settings.eqPreset || 'flat');
      setEQGains(payload.settings.eqGains || [0, 0, 0, 0, 0]);
      setVolumeState(payload.settings.volume ?? 0.85);
      setLowRamModeState(Boolean(payload.settings.lowRamMode));
      if (payload.settings.gapless !== undefined) {
        setGaplessEnabledState(Boolean(payload.settings.gapless));
      }
      if (typeof payload.settings.crossfadeSec === 'number') {
        setCrossfadeSecState(payload.settings.crossfadeSec);
      }
      if (payload.settings.volumeNormalization !== undefined) {
        setVolumeNormalizationState(Boolean(payload.settings.volumeNormalization));
      }
      if (payload.settings.themeMode === 'light' || payload.settings.themeMode === 'dark') {
        setThemeModeState(payload.settings.themeMode);
      }
      if (payload.settings.accentTheme) {
        setAccentThemeState(payload.settings.accentTheme);
      }
      if (payload.settings.customAccentHex) {
        setCustomAccentHexState(payload.settings.customAccentHex);
      }
    }
  }, []);

  // Firebase Auth initialization & Cloud Sync
  const hasHydratedCloudRef = useRef(false);

  useEffect(() => {
    void testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCloudUser(user);
      setCloudAuthReady(true);
      if (user && !hasHydratedCloudRef.current) {
        hasHydratedCloudRef.current = true;
        setCloudSyncing(true);
        try {
          const snap = await loadCloudLibrary(user.uid);
          if (snap) {
            if (snap.playlists.length > 0) {
              setPlaylists((prev) => {
                const map = new Map<string, Playlist>();
                for (const p of snap.playlists) map.set(p.id, p);
                for (const p of prev) {
                  const existingCloud = map.get(p.id);
                  if (!existingCloud && p.tracks.length > 0) {
                    map.set(p.id, p);
                  } else if (existingCloud && p.tracks.length > existingCloud.tracks.length) {
                    map.set(p.id, { ...p, createdAt: existingCloud.createdAt });
                  }
                }
                return Array.from(map.values());
              });
            }
            if (snap.likedTracks.length > 0) {
              setLikedTracks((prev) => {
                const map = new Map<string, Track>();
                for (const t of snap.likedTracks) map.set(t.id, t);
                for (const t of prev) map.set(t.id, t);
                return Array.from(map.values()).slice(0, 200);
              });
            }
            if (snap.streak && (snap.streak.currentStreak > 0 || snap.streak.longestStreak > 0)) {
              setStreakState((prev) =>
                snap.streak!.currentStreak >= prev.currentStreak ? snap.streak! : prev
              );
            }
            if (snap.dailyLogs) {
              setDailyLogs((prev) => ({ ...snap.dailyLogs, ...prev }));
            }
            if (snap.lyricOffsets) {
              setLyricOffsets((prev) => ({ ...snap.lyricOffsets, ...prev }));
            }
            setLastSyncedAt(Date.now());
          }
        } catch {
          // Non-fatal initial hydration error
        } finally {
          setCloudSyncing(false);
        }
      } else if (!user) {
        hasHydratedCloudRef.current = false;
      }
    });
    return () => unsub();
  }, []);

  const syncCloudNow = useCallback(async () => {
    if (!cloudUser) return;
    setCloudSyncing(true);
    try {
      await Promise.all([
        syncVaultMetaToCloud(cloudUser.uid, {
          likedTracks,
          recentTracks,
          streak: streakState,
          dailyLogs,
          lyricOffsets,
          audioQuality,
          eqPreset,
          eqGains,
          lowRamMode,
        }),
        ...playlists.map((pl) => syncPlaylistToCloud(cloudUser.uid, pl)),
      ]);
      setLastSyncedAt(Date.now());
    } catch {
      // Handled gracefully
    } finally {
      setCloudSyncing(false);
    }
  }, [
    audioQuality,
    cloudUser,
    dailyLogs,
    eqGains,
    eqPreset,
    likedTracks,
    lowRamMode,
    lyricOffsets,
    playlists,
    recentTracks,
    streakState,
  ]);

  // Debounced auto-sync to Cloud + Server Disk Vault whenever user library changes
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isOnlineRef.current) {
        const payload = buildVaultPayload();
        void saveVaultToServer(vaultSyncCode, payload).catch(() => {});
        if (cloudUser) {
          void syncCloudNow();
        }
      }
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [buildVaultPayload, cloudUser, syncCloudNow, vaultSyncCode]);

  const signInCloud = useCallback(async () => {
    try {
      const user = await signInWithGoogleCloud();
      showToast(`Masuk sebagai ${user.displayName || user.email} · Sinkronisasi cloud aktif`, 'success');
    } catch {
      showToast('Gagal masuk dengan akun Google', 'error');
    }
  }, [showToast]);

  const signOutCloud = useCallback(async () => {
    await signOutGoogleCloud();
    showToast('Keluar dari sinkronisasi Google', 'info');
  }, [showToast]);

  const saveVaultServer = useCallback(
    async (customCode?: string) => {
      const activeCode = customCode ? setStoredSyncCode(customCode) : vaultSyncCode;
      if (activeCode.length < 6) {
        showToast('Kode cadangan minimal 6 karakter (huruf/angka/-)', 'error');
        return;
      }
      setVaultSyncCode(activeCode);
      const savedAt = await saveVaultToServer(activeCode, buildVaultPayload());
      setLastSyncedAt(savedAt);
      showToast(`Playlist & data aman dicadangkan dengan kode ${activeCode}`, 'success');
    },
    [buildVaultPayload, showToast, vaultSyncCode]
  );

  const restoreVaultServer = useCallback(
    async (code: string) => {
      const clean = setStoredSyncCode(code);
      if (clean.length < 6) {
        showToast('Masukkan kode pemulihan minimal 6 karakter', 'error');
        return;
      }
      setVaultSyncCode(clean);
      const res = await loadVaultFromServer(clean);
      applyImportedVaultPayload(res.payload);
      setLastSyncedAt(res.savedAt);
      showToast(`Berhasil memulihkan ${res.payload.playlists.length} playlist dari kode ${clean}`, 'success');
    },
    [applyImportedVaultPayload, showToast]
  );

  const exportBackupJson = useCallback(() => {
    exportVaultAsJsonFile(buildVaultPayload());
    showToast('File cadangan .svara.json berhasil diunduh', 'success');
  }, [buildVaultPayload, showToast]);

  const importBackupJson = useCallback(
    (rawText: string) => {
      try {
        const parsed = parseImportedVaultJson(rawText);
        applyImportedVaultPayload(parsed);
        showToast(`Berhasil memulihkan ${parsed.playlists.length} playlist dari file cadangan`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'File cadangan tidak valid';
        showToast(msg, 'error');
      }
    },
    [applyImportedVaultPayload, showToast]
  );

  // Sync audio engine settings
  useEffect(() => {
    audioEngine.setQuality(audioQuality);
    audioEngine.setEQGains(eqGains);
    audioEngine.setVolume(volume, isMuted);
    audioEngine.setVolumeNormalization(volumeNormalization);
  }, [audioQuality, eqGains, volume, isMuted, volumeNormalization]);

  // BroadcastChannel to coordinate across tabs
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel('svara-playback-sync');
    channelRef.current = ch;
    ch.onmessage = (event) => {
      const msg = event.data as { type?: string; sender?: string };
      if (msg?.type === 'PLAY_STARTED' && msg.sender !== tabIdRef.current) {
        audioEngine.pause();
        setIsPlaying(false);
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  // Save session checkpoint periodically
  useEffect(() => {
    const saveSession = () => {
      if (!currentTrackRef.current) return;
      try {
        localStorage.setItem(
          STORAGE_SESSION_KEY,
          JSON.stringify({
            currentTrack: currentTrackRef.current,
            queue: queueRef.current.slice(0, 40),
            queueIndex: queueIndexRef.current,
            currentTime: audioEngine.getElement().currentTime || 0,
          })
        );
      } catch {
        // Ignore
      }
    };
    const timer = window.setInterval(saveSession, 4000);
    window.addEventListener('beforeunload', saveSession);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', saveSession);
    };
  }, []);

  const offlineIds = useMemo(
    () => new Set(offlineRecords.map((r) => r.id)),
    [offlineRecords]
  );

  const totalOfflineBytes = useMemo(
    () => offlineRecords.reduce((acc, r) => acc + r.sizeBytes, 0),
    [offlineRecords]
  );

  const resolvePlayableSource = useCallback(
    async (track: Track): Promise<{ srcUrl: string; artUrl: string; offlineMissing: boolean }> => {
      const offlineRecord = await getOfflineTrack(track.id);
      if (offlineRecord) {
        return {
          srcUrl: URL.createObjectURL(offlineRecord.audioBlob),
          artUrl: offlineArtworkMap[track.id] || track.artworkUrl,
          offlineMissing: false,
        };
      }
      if (offlineModeRef.current || !isOnlineRef.current) {
        return { srcUrl: '', artUrl: track.artworkUrl, offlineMissing: true };
      }
      return {
        srcUrl: getFullAudioUrl(track, audioQualityRef.current),
        artUrl: track.artworkUrl,
        offlineMissing: false,
      };
    },
    [offlineArtworkMap]
  );

  const bindMediaSessionForTrack = useCallback((track: Track, artUrl: string) => {
    audioEngine.updateMediaSession(track, artUrl, {
      onPlay: () => {
        void audioEngine.play().then(() => setIsPlaying(true));
      },
      onPause: () => {
        audioEngine.pause();
        setIsPlaying(false);
      },
      onStop: () => {
        audioEngine.pause();
        audioEngine.seek(0);
        setIsPlaying(false);
      },
      onNext: () => {
        void nextTrackRef.current();
      },
      onPrev: () => {
        void prevTrackRef.current();
      },
      onSeek: (time) => {
        audioEngine.seek(time);
      },
    });
    audioEngine.updateMediaSessionPlaybackState(true);
  }, []);

  const startPlaybackForTrack = useCallback(
    async (track: Track, resumeSec = 0) => {
      setIsBuffering(true);
      preloadedNextRef.current = null;
      try {
        const resolved = await resolvePlayableSource(track);
        if (resolved.offlineMissing || !resolved.srcUrl) {
          setIsBuffering(false);
          setIsPlaying(false);
          showToast(`"${track.title}" belum diunduh untuk Mode Offline`, 'error');
          return false;
        }

        await audioEngine.loadAndPlay(resolved.srcUrl, resumeSec);
        channelRef.current?.postMessage({ type: 'PLAY_STARTED', sender: tabIdRef.current });

        setRecentTracks((prev) => {
          const filtered = prev.filter((t) => t.id !== track.id);
          return [track, ...filtered].slice(0, 20);
        });

        recordHistoryAndStreak(track);
        bindMediaSessionForTrack(track, resolved.artUrl);
        setIsBuffering(false);
        setIsPlaying(true);
        return true;
      } catch {
        setIsBuffering(false);
        setIsPlaying(false);
        showToast(`Gagal memutar "${track.title}". Periksa koneksi atau unduh offline.`, 'error');
        return false;
      }
    },
    [bindMediaSessionForTrack, recordHistoryAndStreak, resolvePlayableSource, showToast]
  );

  const computeNextQueueCandidate = useCallback((): { track: Track; index: number } | null => {
    const q = queueRef.current;
    if (q.length === 0) return null;
    if (repeatRef.current === 'one' && currentTrackRef.current) {
      return { track: currentTrackRef.current, index: Math.max(0, queueIndexRef.current) };
    }
    if (shuffleRef.current && q.length > 1) {
      let idx = queueIndexRef.current;
      for (let attempt = 0; attempt < 5 && idx === queueIndexRef.current; attempt++) {
        idx = Math.floor(Math.random() * q.length);
      }
      return { track: q[idx] || q[0], index: idx };
    }
    const nextIdx = queueIndexRef.current + 1;
    if (nextIdx < q.length) {
      return { track: q[nextIdx], index: nextIdx };
    }
    if (repeatRef.current === 'all') {
      return { track: q[0], index: 0 };
    }
    return null;
  }, []);

  const executePreloadedTransition = useCallback(async () => {
    const pre = preloadedNextRef.current;
    if (!pre || transitioningRef.current) return false;
    transitioningRef.current = true;
    preloadedNextRef.current = null;
    try {
      const ok = await audioEngine.transitionToPreloaded(pre.srcUrl, crossfadeRef.current);
      if (ok) {
        setCurrentTrack(pre.nextTrack);
        setQueueIndex(pre.nextIndex);
        channelRef.current?.postMessage({ type: 'PLAY_STARTED', sender: tabIdRef.current });
        setRecentTracks((prev) => {
          const filtered = prev.filter((t) => t.id !== pre.nextTrack.id);
          return [pre.nextTrack, ...filtered].slice(0, 20);
        });
        recordHistoryAndStreak(pre.nextTrack);
        bindMediaSessionForTrack(pre.nextTrack, pre.artUrl);
        setIsPlaying(true);
        setIsBuffering(false);
      }
      return ok;
    } catch {
      return false;
    } finally {
      transitioningRef.current = false;
    }
  }, [bindMediaSessionForTrack, recordHistoryAndStreak]);

  const nextTrack = useCallback(async () => {
    let q = queueRef.current;
    if (q.length === 0) return;

    if (repeatRef.current === 'one' && currentTrackRef.current) {
      await startPlaybackForTrack(currentTrackRef.current, 0);
      return;
    }

    let nextIdx: number;
    if (shuffleRef.current && q.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * q.length);
      } while (nextIdx === queueIndexRef.current);
    } else {
      nextIdx = queueIndexRef.current + 1;
      if (nextIdx >= q.length) {
        const curTrack = currentTrackRef.current;
        if (curTrack && isOnlineRef.current) {
          try {
            const query = curTrack.artist || curTrack.genre || 'Pop';
            const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}&limit=15`);
            if (res.ok) {
              const data = (await res.json()) as { tracks?: Track[] };
              const fetchedTracks = data.tracks ?? [];
              const existingIds = new Set(q.map((t) => t.id));
              const brandNew = fetchedTracks.filter((t) => !existingIds.has(t.id));
              if (brandNew.length > 0) {
                const updatedQueue = [...q, ...brandNew];
                setQueue(updatedQueue);
                q = updatedQueue;
              }
            }
          } catch {
            // Ignore fetch errors and fallback to looping queue
          }
        }

        if (nextIdx >= q.length) {
          nextIdx = 0;
        }
      }
    }

    const next = q[nextIdx] || q[0];
    if (next) {
      setCurrentTrack(next);
      setQueueIndex(nextIdx);
      await startPlaybackForTrack(next, 0);
    }
  }, [startPlaybackForTrack]);

  const prevTrack = useCallback(async () => {
    const el = audioEngine.getElement();
    if (el.currentTime > 3 && currentTrackRef.current) {
      audioEngine.seek(0);
      return;
    }
    const q = queueRef.current;
    if (q.length === 0) return;
    const prevIdx = queueIndexRef.current <= 0 ? q.length - 1 : queueIndexRef.current - 1;
    const prev = q[prevIdx];
    if (prev) {
      setCurrentTrack(prev);
      setQueueIndex(prevIdx);
      await startPlaybackForTrack(prev, 0);
    }
  }, [startPlaybackForTrack]);

  const nextTrackRef = useRef(nextTrack);
  const prevTrackRef = useRef(prevTrack);
  nextTrackRef.current = nextTrack;
  prevTrackRef.current = prevTrack;

  // Subscribe to active deck events via audioEngine.subscribe (handles deck swaps cleanly!)
  useEffect(() => {
    const unsubPlay = audioEngine.subscribe('play', () => {
      setIsPlaying(true);
      setIsBuffering(false);
      audioEngine.updateMediaSessionPlaybackState(true);
    });
    const unsubPause = audioEngine.subscribe('pause', () => {
      setIsPlaying(false);
      audioEngine.updateMediaSessionPlaybackState(false);
    });
    const unsubWaiting = audioEngine.subscribe('waiting', () => setIsBuffering(true));
    const unsubCanPlay = audioEngine.subscribe('canplay', () => setIsBuffering(false));
    const unsubEnded = audioEngine.subscribe('ended', () => {
      if (sleepModeRef.current === 'end_of_track') {
        setSleepTimerMode('off');
        setSleepTimerRemainingSec(null);
        setIsPlaying(false);
        showToast('Lagu selesai · Pengatur waktu tidur dijeda', 'info');
        return;
      }
      const pre = preloadedNextRef.current;
      if (gaplessRef.current && pre && pre.forTrackId === currentTrackRef.current?.id) {
        void executePreloadedTransition().then((handled) => {
          if (!handled) void nextTrackRef.current();
        });
        return;
      }
      void nextTrackRef.current();
    });

    return () => {
      unsubPlay();
      unsubPause();
      unsubWaiting();
      unsubCanPlay();
      unsubEnded();
    };
  }, [executePreloadedTransition, showToast]);

  // Lookahead scheduler for Gapless preload + smooth Crossfade overlap
  useEffect(() => {
    if (!isPlaying || !currentTrack) return;
    const timer = window.setInterval(() => {
      if (!gaplessRef.current && crossfadeRef.current <= 0) return;
      if (sleepModeRef.current === 'end_of_track') return;
      if (repeatRef.current === 'one') return;

      const el = audioEngine.getElement();
      const dur = el.duration;
      const cur = el.currentTime;
      if (!Number.isFinite(dur) || dur <= 12) return;
      const remaining = dur - cur;

      const preloadWindow = Math.max(12, crossfadeRef.current + 6);
      const curId = currentTrackRef.current?.id;
      if (!curId) return;

      if (
        remaining <= preloadWindow &&
        remaining > 1 &&
        preloadedNextRef.current?.forTrackId !== curId
      ) {
        const cand = computeNextQueueCandidate();
        if (cand && cand.track.id !== curId) {
          void resolvePlayableSource(cand.track).then((res) => {
            if (!res.offlineMissing && res.srcUrl && currentTrackRef.current?.id === curId) {
              preloadedNextRef.current = {
                forTrackId: curId,
                nextTrack: cand.track,
                nextIndex: cand.index,
                srcUrl: res.srcUrl,
                artUrl: res.artUrl,
              };
              audioEngine.preloadNext(res.srcUrl);
            }
          });
        }
      }

      const cf = crossfadeRef.current;
      const pre = preloadedNextRef.current;
      if (
        cf > 0 &&
        remaining <= cf &&
        remaining > 0.3 &&
        pre &&
        pre.forTrackId === curId &&
        audioEngine.isNextPreloaded(pre.srcUrl)
      ) {
        void executePreloadedTransition();
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [
    computeNextQueueCandidate,
    currentTrack,
    executePreloadedTransition,
    isPlaying,
    resolvePlayableSource,
  ]);

  const playTrack = useCallback(
    async (track: Track, contextList?: Track[]) => {
      if (contextList && contextList.length > 0) {
        const idx = contextList.findIndex((t) => t.id === track.id);
        setQueue(contextList);
        setQueueIndex(idx >= 0 ? idx : 0);
      } else {
        const existingIdx = queueRef.current.findIndex((t) => t.id === track.id);
        if (existingIdx >= 0) {
          setQueueIndex(existingIdx);
        } else {
          const nextQueue = [...queueRef.current, track];
          setQueue(nextQueue);
          setQueueIndex(nextQueue.length - 1);
        }
      }
      setCurrentTrack(track);
      await startPlaybackForTrack(track, 0);
    },
    [startPlaybackForTrack]
  );

  const playTrackList = useCallback(
    async (tracks: Track[], startIndex = 0) => {
      if (tracks.length === 0) return;
      const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
      const target = tracks[safeIndex];
      setQueue(tracks);
      setQueueIndex(safeIndex);
      setCurrentTrack(target);
      await startPlaybackForTrack(target, 0);
    },
    [startPlaybackForTrack]
  );

  const togglePlay = useCallback(async () => {
    const el = audioEngine.getElement();
    if (!currentTrackRef.current) return;

    if (!el.src) {
      await startPlaybackForTrack(currentTrackRef.current, initialSession.currentTime || 0);
      return;
    }

    if (el.paused) {
      try {
        await audioEngine.play();
        channelRef.current?.postMessage({ type: 'PLAY_STARTED', sender: tabIdRef.current });
      } catch {
        await startPlaybackForTrack(currentTrackRef.current, el.currentTime || 0);
      }
    } else {
      audioEngine.pause();
    }
  }, [initialSession.currentTime, startPlaybackForTrack]);

  const seek = useCallback((seconds: number) => {
    audioEngine.seek(seconds);
  }, []);

  const setVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      setVolumeState(clamped);
      if (clamped > 0 && isMuted) setIsMuted(false);
      audioEngine.setVolume(clamped, clamped === 0);
    },
    [isMuted]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      audioEngine.setVolume(volume, next);
      return next;
    });
  }, [volume]);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const addToQueue = useCallback(
    (track: Track) => {
      setQueue((prev) => [...prev, track]);
      showToast(`"${track.title}" ditambahkan ke antrean`, 'success');
    },
    [showToast]
  );

  const playNextInQueue = useCallback(
    (track: Track) => {
      setQueue((prev) => {
        const insertAt = Math.max(0, queueIndexRef.current + 1);
        const copy = [...prev];
        copy.splice(insertAt, 0, track);
        return copy;
      });
      showToast(`"${track.title}" akan diputar berikutnya`, 'success');
    },
    [showToast]
  );

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, idx) => idx !== index));
    if (index < queueIndexRef.current) {
      setQueueIndex((idx) => Math.max(0, idx - 1));
    }
  }, []);

  const setAudioQuality = useCallback(
    (q: AudioQuality) => {
      setAudioQualityState(q);
      audioQualityRef.current = q;
      audioEngine.setQuality(q);
      const label =
        q === 'flac'
          ? 'Lossless FLAC (Studio Master)'
          : q === 'alac'
          ? 'Lossless ALAC (Apple Lossless)'
          : q === 'hires'
          ? 'Hi-Res Studio (320 kbps)'
          : q === 'high'
          ? 'Tinggi (192-256 kbps)'
          : 'Standar (128 kbps)';
      showToast(`Kualitas audio: ${label}`, 'info');

      // Reload active online stream cleanly at exact timestamp with new bitrate
      const cur = currentTrackRef.current;
      const el = audioEngine.getElement();
      if (cur && isPlayingRef.current && !el.src.startsWith('blob:') && isOnlineRef.current) {
        const resumeAt = el.currentTime || 0;
        void startPlaybackForTrack(cur, resumeAt);
      }
    },
    [showToast, startPlaybackForTrack]
  );

  const setEQPreset = useCallback((preset: EQPresetId) => {
    setEQPresetState(preset);
    if (preset !== 'custom') {
      const gains = [...EQ_PRESETS[preset].gains];
      setEQGains(gains);
      audioEngine.setEQGains(gains);
    }
  }, []);

  const setCustomEQBand = useCallback((index: number, gain: number) => {
    setEQPresetState('custom');
    setEQGains((prev) => {
      const next = [...prev];
      next[index] = gain;
      audioEngine.setEQGains(next);
      return next;
    });
  }, []);

  // Likes
  const isLiked = useCallback(
    (trackId: string) => likedTracks.some((t) => t.id === trackId),
    [likedTracks]
  );

  const toggleLike = useCallback(
    (track: Track) => {
      setLikedTracks((prev) => {
        const exists = prev.some((t) => t.id === track.id);
        if (exists) {
          showToast(`"${track.title}" dihapus dari Lagu Disukai`, 'info');
          return prev.filter((t) => t.id !== track.id);
        }
        showToast(`"${track.title}" disimpan ke Lagu Disukai`, 'success');
        return [track, ...prev];
      });
    },
    [showToast]
  );

  // Playlists
  const createPlaylist = useCallback(
    (name: string, description = '', initialTracks: Track[] = []) => {
      const created: Playlist = {
        id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim() || 'Playlist Baru',
        description: description.trim(),
        coverUrl: initialTracks[0]?.artworkUrl || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tracks: initialTracks,
      };
      setPlaylists((prev) => [created, ...prev]);
      if (cloudUser) {
        void syncPlaylistToCloud(cloudUser.uid, created).catch(() => {});
      }
      showToast(`Playlist "${created.name}" dibuat`, 'success');
      return created;
    },
    [cloudUser, showToast]
  );

  const renamePlaylist = useCallback((id: string, name: string, description?: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === id
          ? {
              ...pl,
              name: name.trim() || pl.name,
              description: description !== undefined ? description : pl.description,
              updatedAt: Date.now(),
            }
          : pl
      )
    );
  }, []);

  const deletePlaylist = useCallback(
    (id: string) => {
      setPlaylists((prev) => prev.filter((pl) => pl.id !== id));
      if (cloudUser) {
        void deletePlaylistFromCloud(cloudUser.uid, id).catch(() => {});
      }
      showToast('Playlist dihapus', 'info');
    },
    [cloudUser, showToast]
  );

  const addTrackToPlaylist = useCallback(
    (playlistId: string, track: Track) => {
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== playlistId) return pl;
          if (pl.tracks.some((t) => t.id === track.id)) {
            showToast(`Lagu sudah ada di "${pl.name}"`, 'info');
            return pl;
          }
          showToast(`Ditambahkan ke "${pl.name}"`, 'success');
          return {
            ...pl,
            coverUrl: pl.tracks.length === 0 && track.artworkUrl ? track.artworkUrl : pl.coverUrl,
            updatedAt: Date.now(),
            tracks: [...pl.tracks, track],
          };
        })
      );
    },
    [showToast]
  );

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? {
              ...pl,
              updatedAt: Date.now(),
              tracks: pl.tracks.filter((t) => t.id !== trackId),
            }
          : pl
      )
    );
  }, []);

  // Offline downloads & Local FLAC/ALAC imports
  const downloadTrack = useCallback(
    async (track: Track) => {
      if (offlineIds.has(track.id) || downloadingIds.has(track.id)) return;
      setDownloadingIds((prev) => new Set(prev).add(track.id));
      try {
        const targetQuality: AudioQuality =
          audioQualityRef.current === 'flac' || audioQualityRef.current === 'alac'
            ? audioQualityRef.current
            : 'hires';
        await saveTrackOffline(track, targetQuality);
        await refreshOfflineRecords();
        showToast(`"${track.title}" tersimpan permanen untuk Mode Offline`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal mengunduh lagu';
        showToast(msg, 'error');
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(track.id);
          return next;
        });
      }
    },
    [downloadingIds, offlineIds, refreshOfflineRecords, showToast]
  );

  const downloadPlaylist = useCallback(
    async (tracks: Track[]) => {
      const pending = tracks.filter((t) => !offlineIds.has(t.id));
      if (pending.length === 0) {
        showToast('Semua lagu sudah tersimpan offline', 'info');
        return;
      }
      showToast(`Mengunduh ${pending.length} lagu ke penyimpanan perangkat...`, 'info');
      let successCount = 0;
      const targetQuality: AudioQuality =
        audioQualityRef.current === 'flac' || audioQualityRef.current === 'alac'
          ? audioQualityRef.current
          : 'hires';
      for (const track of pending) {
        setDownloadingIds((prev) => new Set(prev).add(track.id));
        try {
          await saveTrackOffline(track, targetQuality);
          successCount++;
        } catch {
          // Continue remaining tracks
        } finally {
          setDownloadingIds((prev) => {
            const next = new Set(prev);
            next.delete(track.id);
            return next;
          });
        }
      }
      await refreshOfflineRecords();
      showToast(`${successCount} lagu berhasil disimpan permanen di perangkat`, 'success');
    },
    [offlineIds, refreshOfflineRecords, showToast]
  );

  const importLocalFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      let count = 0;
      for (const file of list) {
        try {
          await importLocalAudioFile(file);
          count++;
        } catch {
          // Skip invalid audio file
        }
      }
      await refreshOfflineRecords();
      if (count > 0) {
        showToast(`${count} file audio lokal (FLAC/ALAC/MP3) tersimpan di koleksi offline`, 'success');
      } else {
        showToast('Tidak ada file audio yang berhasil diimpor', 'error');
      }
    },
    [refreshOfflineRecords, showToast]
  );

  const removeOffline = useCallback(
    async (trackId: string) => {
      await removeTrackOffline(trackId);
      await refreshOfflineRecords();
      showToast('Lagu dihapus dari penyimpanan offline', 'info');
    },
    [refreshOfflineRecords, showToast]
  );

  const clearAllOffline = useCallback(async () => {
    await clearAllOfflineTracks();
    await refreshOfflineRecords();
    showToast('Semua cache offline dibersihkan', 'info');
  }, [refreshOfflineRecords, showToast]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentTrack,
      isPlaying,
      isBuffering,
      volume,
      isMuted,
      shuffle,
      repeatMode,
      queue,
      queueIndex,
      recentTracks,
      playHistory,
      clearPlayHistory,
      trackRatings,
      rateTrack,
      trackAccent,

      audioQuality,
      eqPreset,
      eqGains,
      lowRamMode,
      gaplessEnabled,
      crossfadeSec,
      volumeNormalization,
      setAudioQuality,
      setEQPreset,
      setCustomEQBand,
      setLowRamMode,
      setGaplessEnabled,
      setCrossfadeSec,
      setVolumeNormalization,

      themeMode,
      setThemeMode,
      toggleThemeMode,
      accentTheme,
      setAccentTheme,
      customAccentHex,
      setCustomAccentHex,

      sleepTimerMode,
      sleepTimerRemainingSec,
      setSleepTimerMinutes,
      setSleepTimerEndOfTrack,
      cancelSleepTimer,

      miniPlayerOpen,
      setMiniPlayerOpen,
      castSupported,
      promptCast,

      isOnline,
      offlineMode,
      setOfflineMode,
      offlineRecords,
      offlineIds,
      offlineArtworkMap,
      downloadingIds,
      totalOfflineBytes,
      storageInfo,
      enablePermanentStorage,
      downloadTrack,
      downloadPlaylist,
      importLocalFiles,
      removeOffline,
      clearAllOffline,

      playlists,
      likedTracks,
      isLiked,
      toggleLike,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,

      playTrack,
      playTrackList,
      togglePlay,
      nextTrack,
      prevTrack,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      addToQueue,
      playNextInQueue,
      removeFromQueue,

      lyrics,
      lyricsLoading,
      lyricOffsetSec,
      adjustLyricOffset,
      resetLyricOffset,

      sentinelReport,
      isScanningSentinel,
      sentinelRepairLog,
      runSentinelScan,
      registerDiscoverTracks,

      streakState,
      evaluatedStreak,
      dailyLogs,
      weeklyWrapped,

      personalRecs,
      personalRecsLoading,
      refreshPersonalRecs,

      cloudUser,
      cloudAuthReady,
      cloudSyncing,
      lastSyncedAt,
      signInCloud,
      signOutCloud,
      syncCloudNow,

      vaultSyncCode,
      saveVaultServer,
      restoreVaultServer,
      exportBackupJson,
      importBackupJson,

      toasts,
      showToast,
      dismissToast,
    }),
    [
      accentTheme,
      addToQueue,
      addTrackToPlaylist,
      adjustLyricOffset,
      audioQuality,
      cancelSleepTimer,
      castSupported,
      clearAllOffline,
      clearPlayHistory,
      cloudAuthReady,
      cloudSyncing,
      cloudUser,
      createPlaylist,
      crossfadeSec,
      currentTrack,
      customAccentHex,
      cycleRepeat,
      dailyLogs,
      deletePlaylist,
      dismissToast,
      downloadPlaylist,
      downloadTrack,
      downloadingIds,
      enablePermanentStorage,
      eqGains,
      eqPreset,
      evaluatedStreak,
      exportBackupJson,
      gaplessEnabled,
      importBackupJson,
      importLocalFiles,
      isBuffering,
      isLiked,
      isMuted,
      isOnline,
      isPlaying,
      isScanningSentinel,
      lastSyncedAt,
      likedTracks,
      lowRamMode,
      lyricOffsetSec,
      lyrics,
      lyricsLoading,
      miniPlayerOpen,
      nextTrack,
      offlineArtworkMap,
      offlineIds,
      offlineMode,
      offlineRecords,
      personalRecs,
      personalRecsLoading,
      playHistory,
      playNextInQueue,
      playTrack,
      playTrackList,
      playlists,
      prevTrack,
      promptCast,
      rateTrack,
      recentTracks,
      refreshPersonalRecs,
      registerDiscoverTracks,
      removeFromQueue,
      removeOffline,
      removeTrackFromPlaylist,
      renamePlaylist,
      repeatMode,
      resetLyricOffset,
      restoreVaultServer,
      runSentinelScan,
      saveVaultServer,
      seek,
      sentinelRepairLog,
      sentinelReport,
      setAccentTheme,
      setAudioQuality,
      setCrossfadeSec,
      setCustomAccentHex,
      setCustomEQBand,
      setEQPreset,
      setGaplessEnabled,
      setLowRamMode,
      setSleepTimerEndOfTrack,
      setSleepTimerMinutes,
      setThemeMode,
      setVolume,
      setVolumeNormalization,
      showToast,
      shuffle,
      signInCloud,
      signOutCloud,
      sleepTimerMode,
      sleepTimerRemainingSec,
      storageInfo,
      streakState,
      syncCloudNow,
      themeMode,
      toasts,
      toggleLike,
      toggleMute,
      togglePlay,
      toggleShuffle,
      toggleThemeMode,
      totalOfflineBytes,
      trackAccent,
      trackRatings,
      vaultSyncCode,
      volume,
      volumeNormalization,
      weeklyWrapped,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlaybackTimeProvider initialTime={initialSession.currentTime}>
        {children}
      </PlaybackTimeProvider>
    </PlayerContext.Provider>
  );
};

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

export function useSyncedLyricsIndex(): number {
  const { lyrics, lyricOffsetSec } = usePlayer();
  const { currentTime } = usePlaybackTime();

  return useMemo(() => {
    if (!lyrics || lyrics.synced.length === 0) return -1;
    const adjustedTime = currentTime + lyricOffsetSec + 0.18;
    let idx = -1;
    for (let i = 0; i < lyrics.synced.length; i++) {
      if (lyrics.synced[i].timeSec <= adjustedTime) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyrics, lyricOffsetSec, currentTime]);
}
