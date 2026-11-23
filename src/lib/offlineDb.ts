import type { AudioQuality, OfflineTrackRecord, Track, TrackLyrics } from '@/src/types/music';

const DB_NAME = 'svara-offline-db';
const DB_VERSION = 2;
const STORE_NAME = 'tracks';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getFullAudioUrl(track: Track, quality: AudioQuality = 'hires'): string {
  const params = new URLSearchParams({
    id: track.id,
    title: track.title,
    artist: track.artist,
    durationMs: String(track.durationMs || 0),
    fallbackUrl: track.previewUrl || '',
    quality,
  });
  return `/api/music/full-audio?${params.toString()}`;
}

export interface StoragePersistenceInfo {
  supported: boolean;
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // Ignore unsupported environments
  }
  return false;
}

export async function getStoragePersistenceInfo(): Promise<StoragePersistenceInfo> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      const estimate = navigator.storage.estimate ? await navigator.storage.estimate() : {};
      return {
        supported: true,
        persisted,
        usageBytes: estimate.usage ?? 0,
        quotaBytes: estimate.quota ?? 0,
      };
    }
  } catch {
    // Ignore estimate failure
  }
  return {
    supported: false,
    persisted: false,
    usageBytes: 0,
    quotaBytes: 0,
  };
}

export async function saveTrackOffline(
  track: Track,
  quality: AudioQuality = 'hires'
): Promise<OfflineTrackRecord> {
  // Ask browser for permanent persistent device storage before writing large audio blobs
  void requestPersistentStorage();

  const audioProxyUrl = getFullAudioUrl(track, quality);
  const audioRes = await fetch(audioProxyUrl);
  if (!audioRes.ok) {
    throw new Error('Gagal mengunduh file audio untuk mode offline');
  }
  const audioBlob = await audioRes.blob();

  let artworkBlob: Blob | undefined;
  if (track.artworkUrl) {
    try {
      const artProxyUrl = `/api/music/artwork?url=${encodeURIComponent(track.artworkUrl)}`;
      const artRes = await fetch(artProxyUrl);
      if (artRes.ok) {
        artworkBlob = await artRes.blob();
      }
    } catch {
      // Artwork caching is optional if unavailable
    }
  }

  let lyrics: TrackLyrics | null = null;
  try {
    const lyrParams = new URLSearchParams({
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationMs: String(track.durationMs || 0),
    });
    const lyrRes = await fetch(`/api/music/lyrics?${lyrParams.toString()}`);
    if (lyrRes.ok) {
      const fetched = (await lyrRes.json()) as TrackLyrics;
      if (fetched.source) {
        lyrics = fetched;
      }
    }
  } catch {
    // Lyrics offline caching is optional if unavailable
  }

  const record: OfflineTrackRecord = {
    id: track.id,
    track,
    audioBlob,
    artworkBlob,
    lyrics,
    downloadedAt: Date.now(),
    sizeBytes: audioBlob.size + (artworkBlob?.size ?? 0),
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function getOfflineTrack(id: string): Promise<OfflineTrackRecord | null> {
  const db = await openDb();
  const record = await new Promise<OfflineTrackRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as OfflineTrackRecord | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record;
}

export async function getAllOfflineTracks(): Promise<OfflineTrackRecord[]> {
  const db = await openDb();
  const records = await new Promise<OfflineTrackRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as OfflineTrackRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return records.sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export async function removeTrackOffline(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearAllOfflineTracks(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function detectFormatFromFile(file: File): Track['audioFormat'] {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.flac') || file.type.includes('flac')) return 'FLAC';
  if (lower.endsWith('.alac') || lower.endsWith('.m4a') || file.type.includes('mp4')) return 'ALAC';
  if (lower.endsWith('.wav') || file.type.includes('wav')) return 'WAV';
  if (lower.endsWith('.aac')) return 'AAC';
  return 'MP3';
}

function measureAudioDurationMs(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    const done = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    const timer = window.setTimeout(() => done(180000), 4000);
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : 180000;
      done(dur);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      done(180000);
    };
    audio.src = url;
  });
}

export async function importLocalAudioFile(file: File): Promise<OfflineTrackRecord> {
  void requestPersistentStorage();
  const audioFormat = detectFormatFromFile(file);
  const rawBase = file.name.replace(/\.[^/.]+$/, '').trim();
  const split = rawBase.split(/\s+-\s+/);
  const artist = split.length >= 2 ? split[0].trim() : 'Koleksi Lokal';
  const title = split.length >= 2 ? split.slice(1).join(' - ').trim() : rawBase || 'Audio Lokal';
  const durationMs = await measureAudioDurationMs(file);

  const trackId = `local:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const track: Track = {
    id: trackId,
    title,
    artist,
    album: `File Lokal (${audioFormat})`,
    genre: audioFormat === 'FLAC' || audioFormat === 'ALAC' ? 'Lossless Audio' : 'Audio Lokal',
    durationMs,
    artworkUrl: '',
    previewUrl: '',
    audioFormat,
    isLocalFile: true,
  };

  const record: OfflineTrackRecord = {
    id: trackId,
    track,
    audioBlob: file,
    downloadedAt: Date.now(),
    sizeBytes: file.size,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

