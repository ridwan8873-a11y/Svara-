export type AudioQuality = 'standard' | 'high' | 'hires' | 'flac' | 'alac';

export type RepeatMode = 'off' | 'all' | 'one';

export type EQPresetId = 'flat' | 'bass' | 'vocal' | 'acoustic' | 'electronic' | 'custom';

export type ViewTab = 'home' | 'search' | 'wrapped' | 'ai' | 'library';

export type ThemeMode = 'dark' | 'light';

export type AccentThemeId =
  | 'auto'
  | 'emerald'
  | 'indigo'
  | 'rose'
  | 'amber'
  | 'cyan'
  | 'violet'
  | 'custom';

export type SleepTimerMode = 'off' | 'minutes' | 'end_of_track';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  durationMs: number;
  artworkUrl: string;
  previewUrl: string;
  releaseYear?: string;
  explicit?: boolean;
  reason?: string;
  audioFormat?: 'MP3' | 'AAC' | 'FLAC' | 'ALAC' | 'WAV';
  isLocalFile?: boolean;
}

export interface AlbumSummary {
  title: string;
  artist: string;
  artworkUrl: string;
  year: string;
  genre?: string;
  trackCount?: number;
}

export interface AlbumDetail {
  title: string;
  artist: string;
  artworkUrl: string;
  year: string;
  genre: string;
  totalDurationMs: number;
  tracks: Track[];
}

export interface PlayHistoryEntry {
  id: string;
  track: Track;
  playedAt: number;
}

export interface DiscoverCollection {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  coverUrl: string;
  tracks: Track[];
}

export type SentinelTrackStatus = 'verified' | 'repaired' | 'warning_30s';

export interface SentinelScanItem {
  id: string;
  title: string;
  artist: string;
  status: SentinelTrackStatus;
  isFullLength: boolean;
  isOriginalArtist: boolean;
  audioSource: string;
  sizeBytes?: number;
  reason: string;
  repairedTrack?: Track;
}

export interface SentinelScanReport {
  results: SentinelScanItem[];
  summary: {
    total: number;
    verified: number;
    repaired: number;
    previewOnly: number;
    elapsedMs: number;
  };
  scannedAt: number;
}

export interface ArtistProfile {
  name: string;
  genre: string;
  artworkUrl: string;
  tracks: Track[];
  albums: {
    title: string;
    artworkUrl: string;
    year: string;
  }[];
}

export interface SearchArtistMatch {
  name: string;
  genre: string;
  artworkUrl: string;
  trackCount: number;
  fans?: number;
}

export interface FeaturedArtistItem {
  name: string;
  genre: string;
  artworkUrl: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
}

export interface OfflineTrackRecord {
  id: string;
  track: Track;
  audioBlob: Blob;
  artworkBlob?: Blob;
  lyrics?: TrackLyrics | null;
  downloadedAt: number;
  sizeBytes: number;
}

export interface AIRecommendationResult {
  playlistTitle: string;
  curatorNote: string;
  tracks: Track[];
}

export interface LyricLine {
  timeSec: number;
  text: string;
}

export interface TrackLyrics {
  synced: LyricLine[];
  plain: string;
  source: 'lrclib' | null;
}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null; // YYYY-MM-DD local calendar day
  activeDates: string[]; // Last 30 active YYYY-MM-DD dates
}

export interface DailyTrackPlayStat {
  track: Track;
  plays: number;
  seconds: number;
}

export interface DailyListeningLog {
  dateKey: string;
  secondsListened: number;
  playsCount: number;
  tracks: Record<string, DailyTrackPlayStat>;
  artistSeconds: Record<string, { name: string; seconds: number; plays: number; artworkUrl?: string }>;
  genreSeconds: Record<string, number>;
  hourSeconds: Record<string, number>;
}

export interface WeeklyWrappedSummary {
  windowStartKey: string;
  windowEndKey: string;
  totalSeconds: number;
  totalMinutes: number;
  totalPlays: number;
  uniqueTracksCount: number;
  activeDaysCount: number;
  topTracks: { track: Track; plays: number; seconds: number }[];
  topArtists: { name: string; plays: number; seconds: number; artworkUrl?: string }[];
  topGenres: { genre: string; seconds: number; percentage: number }[];
  dailyBreakdown: {
    dateKey: string;
    dayLabel: string;
    minutes: number;
    plays: number;
    isToday: boolean;
  }[];
  peakPeriodLabel: string;
  vibeTitle: string;
  vibeDescription: string;
  mixTracks: Track[];
}

export interface PersonalRecommendationsResponse {
  title: string;
  subtitle: string;
  tracks: Track[];
  generatedAt: number;
}

export interface SvaraVaultPayload {
  version: number;
  exportedAt: number;
  playlists: Playlist[];
  likedTracks: Track[];
  recentTracks: Track[];
  playHistory?: PlayHistoryEntry[];
  trackRatings?: Record<string, number>;
  streak: StreakState;
  dailyLogs: Record<string, DailyListeningLog>;
  lyricOffsets: Record<string, number>;
  settings: {
    quality: AudioQuality;
    eqPreset: EQPresetId;
    eqGains: number[];
    volume: number;
    lowRamMode: boolean;
    gapless?: boolean;
    crossfadeSec?: number;
    volumeNormalization?: boolean;
    themeMode?: ThemeMode;
    accentTheme?: AccentThemeId;
    customAccentHex?: string;
  };
}
