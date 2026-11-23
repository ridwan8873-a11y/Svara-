import type { SvaraVaultPayload } from '@/src/types/music';

const SYNC_CODE_STORAGE_KEY = 'svara_vault_sync_code_v1';

export function getOrCreateSyncCode(): string {
  try {
    const existing = localStorage.getItem(SYNC_CODE_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{6,64}$/.test(existing)) {
      return existing;
    }
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const rand2 = Math.random().toString(36).slice(2, 6).toUpperCase();
    const created = `SVARA-${rand}-${rand2}`;
    localStorage.setItem(SYNC_CODE_STORAGE_KEY, created);
    return created;
  } catch {
    return 'SVARA-VAULT-DEFAULT';
  }
}

export function setStoredSyncCode(code: string): string {
  const cleaned = code.trim().replace(/[^A-Za-z0-9_-]/g, '');
  if (cleaned.length >= 6) {
    try {
      localStorage.setItem(SYNC_CODE_STORAGE_KEY, cleaned);
    } catch {
      // Ignore storage error
    }
  }
  return cleaned;
}

export async function saveVaultToServer(syncKey: string, payload: SvaraVaultPayload): Promise<number> {
  const res = await fetch('/api/vault/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ syncKey, payload }),
  });
  const data = (await res.json()) as { ok?: boolean; savedAt?: number; error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Gagal menyimpan cadangan ke server');
  }
  return data.savedAt || Date.now();
}

export async function loadVaultFromServer(syncKey: string): Promise<{ savedAt: number; payload: SvaraVaultPayload }> {
  const res = await fetch(`/api/vault/load?syncKey=${encodeURIComponent(syncKey.trim())}`);
  const data = (await res.json()) as { savedAt?: number; payload?: SvaraVaultPayload; error?: string };
  if (!res.ok || !data.payload) {
    throw new Error(data.error || 'Cadangan tidak ditemukan');
  }
  return {
    savedAt: data.savedAt || Date.now(),
    payload: data.payload,
  };
}

export function exportVaultAsJsonFile(payload: SvaraVaultPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `svara-backup-${datePart}.svara.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseImportedVaultJson(rawText: string): SvaraVaultPayload {
  const parsed = JSON.parse(rawText) as Partial<SvaraVaultPayload>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.playlists)) {
    throw new Error('Format file cadangan Svara tidak valid.');
  }
  return {
    version: typeof parsed.version === 'number' ? parsed.version : 2,
    exportedAt: typeof parsed.exportedAt === 'number' ? parsed.exportedAt : Date.now(),
    playlists: parsed.playlists,
    likedTracks: Array.isArray(parsed.likedTracks) ? parsed.likedTracks : [],
    recentTracks: Array.isArray(parsed.recentTracks) ? parsed.recentTracks : [],
    playHistory: Array.isArray(parsed.playHistory) ? parsed.playHistory : [],
    trackRatings:
      parsed.trackRatings && typeof parsed.trackRatings === 'object' ? parsed.trackRatings : {},
    streak: parsed.streak || { currentStreak: 0, longestStreak: 0, lastActiveDate: null, activeDates: [] },
    dailyLogs: parsed.dailyLogs && typeof parsed.dailyLogs === 'object' ? parsed.dailyLogs : {},
    lyricOffsets: parsed.lyricOffsets && typeof parsed.lyricOffsets === 'object' ? parsed.lyricOffsets : {},
    settings: {
      quality: parsed.settings?.quality || 'hires',
      eqPreset: parsed.settings?.eqPreset || 'flat',
      eqGains: Array.isArray(parsed.settings?.eqGains) ? parsed.settings.eqGains : [0, 0, 0, 0, 0],
      volume: typeof parsed.settings?.volume === 'number' ? parsed.settings.volume : 0.85,
      lowRamMode: Boolean(parsed.settings?.lowRamMode),
      gapless: parsed.settings?.gapless !== undefined ? Boolean(parsed.settings.gapless) : true,
      crossfadeSec:
        typeof parsed.settings?.crossfadeSec === 'number' ? parsed.settings.crossfadeSec : 0,
      volumeNormalization:
        parsed.settings?.volumeNormalization !== undefined
          ? Boolean(parsed.settings.volumeNormalization)
          : true,
      themeMode: parsed.settings?.themeMode === 'light' ? 'light' : 'dark',
      accentTheme: parsed.settings?.accentTheme || 'auto',
      customAccentHex: parsed.settings?.customAccentHex || '#10B981',
    },
  };
}
