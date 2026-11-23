import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface ITunesResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  primaryGenreName?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
  artworkUrl60?: string;
  previewUrl?: string;
  releaseDate?: string;
  trackExplicitness?: string;
  kind?: string;
}

export interface NormalizedTrack {
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
}

function normalizeITunesTrack(item: ITunesResult): NormalizedTrack | null {
  if (!item.trackId || !item.trackName || !item.artistName || !item.previewUrl) {
    return null;
  }
  const rawArt = item.artworkUrl100 || item.artworkUrl60 || '';
  const artworkUrl = rawArt
    ? rawArt.replace(/\/\d+x\d+bb\./, '/600x600bb.')
    : '';
  return {
    id: String(item.trackId),
    title: item.trackName,
    artist: item.artistName,
    album: item.collectionName || 'Single',
    genre: item.primaryGenreName || 'Musik',
    durationMs: item.trackTimeMillis || 30000,
    artworkUrl,
    previewUrl: item.previewUrl,
    releaseYear: item.releaseDate ? item.releaseDate.slice(0, 4) : undefined,
    explicit: item.trackExplicitness === 'explicit',
  };
}

async function searchITunes(term: string, limit = 20, country = 'ID'): Promise<NormalizedTrack[]> {
  const cleanTerm = term.trim();
  if (!cleanTerm) return [];
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTerm)}&media=music&entity=song&country=${country}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`iTunes API responded with ${res.status}`);
  }
  const data = (await res.json()) as { results?: ITunesResult[] };
  const results = Array.isArray(data.results) ? data.results : [];
  const normalized: NormalizedTrack[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    const track = normalizeITunesTrack(item);
    if (track && isAuthenticStudioTrack(track) && !seen.has(track.id)) {
      seen.add(track.id);
      normalized.push(track);
    }
  }
  if (normalized.length === 0 && country === 'ID') {
    return searchITunes(cleanTerm, limit, 'US');
  }
  return normalized;
}

const BAD_TRACK_RE =
  /\b(live|concert|session|unplugged|acoustic|akustik|karaoke|instrumental|remix|rmx|slowed|reverb|bootleg|mashup|mash-up|cover|covered|coveran|parody|tribute|vacation\s*version|tiny\s*desk|sped\s*up|speed\s*up|nightcore|acapella|a\s*cappella|sound\s*alike|soundalike|re-recorded|rerecorded|as\s*made\s*famous\s*by|in\s*the\s*style\s*of|tribute\s*band|karaoke\s*version|instrumental\s*version|studio\s*band|hit\s*makers|backup|vocal\s*only|piano\s*version|piano\s*cover|dubstep\s*piano|guitar\s*cover|violin\s*cover|lullaby|music\s*box|8-bit|chiptune|orchestral|string\s*quartet|bossa\s*nova)\b/i;

const KNOWN_COVER_ARTIST_RE =
  /\b(tribute|karaoke|cover|soundalike|sound\s*alike|hit\s*makers|studio\s*musicians|ensemble|ultimate|lullaby|music\s*box|piano\s*tribute|orchestra|quartet|glee\s*cast|kidz\s*bop|dimas\s*senopati|lunar\s*works|nada\s*semesta|norman\s*d[üu]ck|lena\s*hall|ameliavernanda|matt\s*alves)\b/i;

function normalizeTextClean(str: string): string {
  return str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function cleanTitleBase(raw: string): string {
  return raw
    .replace(/\(([^)]*(?:feat\.|with |from |remaster|single version|radio edit|album version|original version|main version|deluxe|bonus|expanded|anniversary|collector|special|cover|piano|acoustic|akustik|dubstep|live|instrumental|karaoke|remix|rmx)[^)]*)\)/gi, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\.{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPrimaryArtist(raw: string): string {
  return raw.split(/,|&|\bfeat\.?\b|\bft\.?\b|\bx\b/i)[0].trim() || raw.trim();
}

function isAuthenticStudioTrack(t: NormalizedTrack): boolean {
  const combined = normalizeTextClean(`${t.artist} ${t.title} ${t.album}`);
  if (BAD_TRACK_RE.test(combined)) {
    return false;
  }
  const artistNorm = normalizeTextClean(t.artist);
  if (KNOWN_COVER_ARTIST_RE.test(artistNorm)) {
    return false;
  }
  // Support epics up to 12 minutes (e.g. A Little Piece of Heaven = 480.7s)
  if (t.durationMs < 70000 || t.durationMs > 720000) {
    return false;
  }
  return true;
}

function pickBestStudioTrack(
  candidates: NormalizedTrack[],
  rawQuery: string,
  expectedArtist?: string
): NormalizedTrack | null {
  const validCandidates = candidates.filter(isAuthenticStudioTrack);
  let pool = validCandidates.length > 0 ? validCandidates : candidates;
  if (pool.length === 0) return null;

  if (expectedArtist) {
    const expWords = normalizeTextClean(expectedArtist)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
    const artistMatched = pool.filter((t) => {
      const aNorm = normalizeTextClean(t.artist);
      return expWords.every((w) => aNorm.includes(w));
    });
    if (artistMatched.length > 0) {
      pool = artistMatched;
    } else {
      const partialMatched = pool.filter((t) => {
        const aNorm = normalizeTextClean(t.artist);
        return expWords.some((w) => aNorm.includes(w));
      });
      if (partialMatched.length > 0) {
        pool = partialMatched;
      } else {
        return null;
      }
    }
  }

  const qNorm = normalizeTextClean(rawQuery);
  const qWords = qNorm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  let best: NormalizedTrack | null = null;
  let bestScore = -9999;

  for (const t of pool) {
    const tArtist = normalizeTextClean(t.artist);
    const tTitle = normalizeTextClean(t.title);
    const tAlbum = normalizeTextClean(t.album);
    const combined = `${tArtist} ${tTitle}`;
    let score = 0;

    for (const w of qWords) {
      if (tArtist.includes(w)) score += 22;
      if (tTitle.includes(w)) score += 18;
      if (!combined.includes(w)) score -= 12;
    }
    if (t.durationMs >= 120000 && t.durationMs <= 520000) score += 15;
    if (!/\b(deluxe|bonus|compilation|greatest\s*hits|now\s*that)/i.test(tAlbum)) {
      score += 12;
    }

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best || pool[0] || null;
}

async function searchArtistsBatch(
  queries: { term: string; artistHint?: string; titleHint?: string; country?: string; perQuery?: number }[],
  fallbackResolver?: (title: string, artistHint?: string) => Promise<NormalizedTrack | null>
): Promise<NormalizedTrack[]> {
  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      const country = q.country ?? 'ID';
      let hits = await searchITunes(q.term, Math.max(q.perQuery ?? 8, 8), country);
      let picked = pickBestStudioTrack(hits, q.term, q.artistHint);
      if (!picked && country === 'ID') {
        hits = await searchITunes(q.term, Math.max(q.perQuery ?? 10, 10), 'US');
        picked = pickBestStudioTrack(hits, q.term, q.artistHint);
      }
      if (picked && q.titleHint) {
        const thWords = normalizeTextClean(cleanTitleBase(q.titleHint))
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 1);
        const pickedT = normalizeTextClean(cleanTitleBase(picked.title));
        const hasTitleMatch = thWords.length > 0 && thWords.every((w) => pickedT.includes(w));
        if (!hasTitleMatch) {
          picked = null;
        }
      }
      if (!picked && fallbackResolver) {
        picked = await fallbackResolver(q.titleHint || q.term, q.artistHint);
      }
      return picked;
    })
  );
  const tracks: NormalizedTrack[] = [];
  const seen = new Set<string>();
  for (const res of settled) {
    if (res.status === 'fulfilled' && res.value) {
      const picked = res.value;
      const key = `${normalizeTextClean(cleanTitleBase(picked.title))}::${normalizeTextClean(extractPrimaryArtist(picked.artist))}`;
      if (!seen.has(picked.id) && !seen.has(key)) {
        seen.add(picked.id);
        seen.add(key);
        tracks.push(picked);
      }
    }
  }
  return tracks;
}

// Simple 15-minute cache for discover endpoint
let discoverCache: { timestamp: number; data: unknown } | null = null;
const DISCOVER_TTL_MS = 15 * 60 * 1000;

interface DeezerArtistHit {
  name?: string;
  nb_fan?: number;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
}

const artistPortraitCache = new Map<string, { name: string; artworkUrl: string; fans: number } | null>();

async function fetchArtistPortrait(
  artistName: string
): Promise<{ name: string; artworkUrl: string; fans: number } | null> {
  const clean = artistName.trim();
  if (!clean) return null;
  const key = clean.toLowerCase();
  if (artistPortraitCache.has(key)) {
    return artistPortraitCache.get(key) ?? null;
  }

  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(clean)}&limit=8`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: DeezerArtistHit[] };
    const list = Array.isArray(json.data) ? json.data : [];

    // Filter to name matches and valid non-default portraits, then sort by fan count
    const exactMatches = list.filter(
      (a) =>
        a.name &&
        (a.name.toLowerCase() === key ||
          a.name.toLowerCase().includes(key) ||
          key.includes(a.name.toLowerCase()))
    );
    const pool = exactMatches.length > 0 ? exactMatches : list;
    const sorted = [...pool].sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0));
    const best = sorted.find((a) => a.picture_xl || a.picture_big || a.picture_medium);
    const pic = best?.picture_xl || best?.picture_big || best?.picture_medium || '';

    const result =
      best?.name && pic && !pic.includes('/artist//')
        ? { name: best.name, artworkUrl: pic, fans: best.nb_fan ?? 0 }
        : null;

    if (artistPortraitCache.size > 200) {
      const oldest = artistPortraitCache.keys().next().value;
      if (oldest) artistPortraitCache.delete(oldest);
    }
    artistPortraitCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

function isAllowedMediaHost(rawUrl: string, kind: 'audio' | 'artwork'): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (kind === 'audio') {
      if (
        host.endsWith('.itunes.apple.com') ||
        host.endsWith('.mzstatic.com') ||
        host.endsWith('.apple.com')
      ) {
        return parsed;
      }
    } else {
      if (host.endsWith('.mzstatic.com') || host.endsWith('.dzcdn.net') || host.endsWith('.music.126.net')) {
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Global paced concurrency limiter + retry client for GDStudio API to prevent 503 throttling during parallel scans
  let gdActiveCount = 0;
  let lastGdDispatchAt = 0;
  const gdWaitQueue: (() => void)[] = [];
  const GD_MAX_CONCURRENT = 3;
  const GD_MIN_STAGGER_MS = 85;

  async function withGdLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (gdActiveCount >= GD_MAX_CONCURRENT) {
      await new Promise<void>((resolve) => gdWaitQueue.push(resolve));
    }
    gdActiveCount++;
    try {
      const now = Date.now();
      const waitMs = Math.max(0, lastGdDispatchAt + GD_MIN_STAGGER_MS - now);
      lastGdDispatchAt = now + waitMs;
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      return await fn();
    } finally {
      gdActiveCount--;
      const next = gdWaitQueue.shift();
      if (next) next();
    }
  }

  async function gdFetchJson<T>(url: string, timeoutMs = 7000, maxAttempts = 3): Promise<T | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await withGdLimit(() =>
          fetch(url, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: AbortSignal.timeout(timeoutMs),
          })
        );
        if (res.status === 503 || res.status === 429 || res.status === 502) {
          await new Promise((r) => setTimeout(r, 320 + attempt * 280 + Math.floor(Math.random() * 180)));
          continue;
        }
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 250 + attempt * 200));
        }
      }
    }
    return null;
  }

  interface PopularityHint {
    titleNorm: string;
    artistNorm: string;
    artistRaw: string;
    rankScore: number;
  }

  async function fetchPopularityHints(query: string): Promise<PopularityHint[]> {
    const hints: PopularityHint[] = [];
    const [deezerRes, gdRes] = await Promise.allSettled([
      fetch(`https://api.deezer.com/search/track?q=${encodeURIComponent(query)}&limit=10`, {
        signal: AbortSignal.timeout(2500),
      }).then((r) => (r.ok ? r.json() : null)),
      gdFetchJson<{ name?: string; artist?: string[] }[]>(
        `https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=${encodeURIComponent(query)}&count=10&pages=1`,
        5500,
        2
      ),
    ]);

    if (deezerRes.status === 'fulfilled' && deezerRes.value && Array.isArray((deezerRes.value as { data?: unknown[] }).data)) {
      const list = (deezerRes.value as { data: { title?: string; artist?: { name?: string }; rank?: number }[] }).data;
      list.forEach((item, idx) => {
        if (!item.title || !item.artist?.name) return;
        const tNorm = normalizeTextClean(cleanTitleBase(item.title));
        const artistRaw = extractPrimaryArtist(item.artist.name);
        const aNorm = normalizeTextClean(artistRaw);
        if (!BAD_TRACK_RE.test(`${tNorm} ${aNorm}`) && !KNOWN_COVER_ARTIST_RE.test(aNorm)) {
          hints.push({
            titleNorm: tNorm,
            artistNorm: aNorm,
            artistRaw,
            rankScore: Math.max(30, 175 - idx * 12 + Math.min(60, Math.floor((item.rank || 0) / 15000))),
          });
        }
      });
    }

    if (gdRes.status === 'fulfilled' && Array.isArray(gdRes.value)) {
      gdRes.value.forEach((item, idx) => {
        if (!item.name || !Array.isArray(item.artist) || item.artist.length === 0) return;
        const tNorm = normalizeTextClean(cleanTitleBase(item.name));
        const artistRaw = extractPrimaryArtist(item.artist[0] || '');
        const aNorm = normalizeTextClean(artistRaw);
        if (!BAD_TRACK_RE.test(`${tNorm} ${aNorm}`) && !KNOWN_COVER_ARTIST_RE.test(aNorm)) {
          hints.push({
            titleNorm: tNorm,
            artistNorm: aNorm,
            artistRaw,
            rankScore: Math.max(25, 165 - idx * 12),
          });
        }
      });
    }

    return hints;
  }

  function stripLeadingArticle(s: string): string {
    return s.replace(/^(a|an|the)\s+/i, '').trim();
  }

  function scoreAndDeduplicateSearchTracks(
    rawTracks: NormalizedTrack[],
    query: string,
    hints: PopularityHint[],
    limit: number
  ): NormalizedTrack[] {
    const qNorm = normalizeTextClean(cleanTitleBase(query));
    const qNoArt = stripLeadingArticle(qNorm);
    const qWords = qNorm.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);

    const earliestYearByTitle = new Map<string, number>();
    for (const t of rawTracks) {
      const tKey = normalizeTextClean(cleanTitleBase(t.title)).replace(/[^a-z0-9]/g, '');
      const yr = Number(t.releaseYear) || 9999;
      const cur = earliestYearByTitle.get(tKey) ?? 9999;
      if (yr < cur) earliestYearByTitle.set(tKey, yr);
    }

    const scored = rawTracks.map((t, origIdx) => {
      const cleanT = normalizeTextClean(cleanTitleBase(t.title));
      const cleanTNoArt = stripLeadingArticle(cleanT);
      const cleanA = normalizeTextClean(extractPrimaryArtist(t.artist));
      const fullA = normalizeTextClean(t.artist);
      const albumNorm = normalizeTextClean(t.album);
      const titleAlpha = cleanT.replace(/[^a-z0-9]/g, '');
      const queryAlpha = qNorm.replace(/[^a-z0-9]/g, '');

      let score = Math.max(0, 40 - origIdx);

      if (cleanT === qNorm || (queryAlpha.length >= 3 && titleAlpha === queryAlpha)) {
        score += 85;
      } else if (cleanTNoArt === qNoArt && qNoArt.length >= 4) {
        score += 85;
      } else if (cleanT.includes(qNorm) && qNorm.length >= 3) {
        score += 45;
      }
      if (t.durationMs >= 120000) {
        score += 14;
      } else if (t.durationMs < 95000) {
        score -= 25;
      }
      if (cleanA === qNorm || fullA.includes(qNorm)) {
        score += 75;
      }

      for (const w of qWords) {
        if (cleanT.includes(w)) score += 16;
        if (fullA.includes(w)) score += 16;
      }

      for (const h of hints) {
        const hNoArt = stripLeadingArticle(h.titleNorm);
        const titleOverlap =
          h.titleNorm === cleanT ||
          hNoArt === cleanTNoArt ||
          (h.titleNorm.length >= 3 && (cleanT.includes(h.titleNorm) || h.titleNorm.includes(cleanT)));
        const artistOverlap =
          h.artistNorm === cleanA ||
          (h.artistNorm.length >= 2 && (fullA.includes(h.artistNorm) || h.artistNorm.includes(cleanA)));
        if (titleOverlap && artistOverlap) {
          score += h.rankScore;
        }
      }

      if (/\b(deluxe|bonus\s*track|expanded|anniversary|collector|greatest\s*hits|best\s*of|compilation|now\s*that|platinum)\b/i.test(albumNorm)) {
        score -= 22;
      }
      if (/\b(deluxe|bonus|remaster|single\s*version|radio\s*edit)\b/i.test(t.title)) {
        score -= 10;
      }

      const yr = Number(t.releaseYear) || 9999;
      const earliest = earliestYearByTitle.get(titleAlpha) ?? 9999;
      if (yr === earliest && yr < 9999) {
        score += 18;
      }

      return { track: t, score, cleanT, cleanA, titleAlpha, noArtAlpha: cleanTNoArt.replace(/[^a-z0-9]/g, '') };
    });

    scored.sort((a, b) => b.score - a.score);

    const byCreatorSong = new Map<string, typeof scored[number]>();
    for (const item of scored) {
      const key = `${item.titleAlpha || item.cleanT}::${item.cleanA}`;
      if (!byCreatorSong.has(key)) {
        byCreatorSong.set(key, item);
      }
    }

    // Always collapse identical song titles across results so 1 song title shows 1 canonical creator release
    const seenTitleKeys = new Set<string>();
    const finalResults: NormalizedTrack[] = [];
    for (const item of byCreatorSong.values()) {
      const tKey = item.noArtAlpha || item.titleAlpha || item.cleanT;
      if (seenTitleKeys.has(tKey)) continue;
      seenTitleKeys.add(tKey);
      finalResults.push(item.track);
      if (finalResults.length >= limit) break;
    }

    return finalResults;
  }

  // Search music catalog across global & Indonesian artists + Top Artist spotlight
  app.get('/api/music/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 50);
      if (!q) {
        res.json({ tracks: [], topArtist: null });
        return;
      }
      const [idResults, usResults, hintsRes, portraitHint] = await Promise.allSettled([
        searchITunes(q, 35, 'ID'),
        searchITunes(q, 30, 'US'),
        fetchPopularityHints(q),
        fetchArtistPortrait(q),
      ]);
      const merged: NormalizedTrack[] = [];
      const seen = new Set<string>();
      for (const batch of [idResults, usResults]) {
        if (batch.status === 'fulfilled') {
          for (const t of batch.value) {
            if (!seen.has(t.id)) {
              seen.add(t.id);
              merged.push(t);
            }
          }
        }
      }
      const hints = hintsRes.status === 'fulfilled' ? hintsRes.value : [];

      // If the canonical original creator from popularity hints isn't in generic iTunes page results
      // (e.g., searching "Creep" missing "Radiohead - Creep" studio), fetch targeted creator track directly
      const qCleanNorm = normalizeTextClean(cleanTitleBase(q));
      const topMatchingHints = hints.filter(
        (h) =>
          h.titleNorm === qCleanNorm ||
          stripLeadingArticle(h.titleNorm) === stripLeadingArticle(qCleanNorm) ||
          (qCleanNorm.length >= 4 && h.titleNorm.includes(qCleanNorm))
      );
      const missingHintArtists: string[] = [];
      for (const h of topMatchingHints.slice(0, 2)) {
        const alreadyPresent = merged.some(
          (t) =>
            normalizeTextClean(t.artist).includes(h.artistNorm) &&
            normalizeTextClean(cleanTitleBase(t.title)).includes(qCleanNorm)
        );
        if (!alreadyPresent && h.artistRaw && !missingHintArtists.includes(h.artistRaw)) {
          missingHintArtists.push(h.artistRaw);
        }
      }
      if (missingHintArtists.length > 0) {
        const extraBatches = await Promise.allSettled(
          missingHintArtists.map((artistName) => searchITunes(`${artistName} ${cleanTitleBase(q)}`, 8, 'US'))
        );
        for (const batch of extraBatches) {
          if (batch.status === 'fulfilled') {
            for (const t of batch.value) {
              if (!seen.has(t.id)) {
                seen.add(t.id);
                merged.push(t);
              }
            }
          }
        }
      }

      // If iTunes completely omits an explicit studio classic (e.g., Radiohead - Creep, Skrillex - Bangarang),
      // synthesize the canonical track directly from NetEase catalog + artwork
      if (topMatchingHints.length > 0 && qCleanNorm.length >= 3) {
        const leadHint = topMatchingHints[0];
        const hasLeadCreator = merged.some(
          (t) =>
            normalizeTextClean(t.artist).includes(leadHint.artistNorm) &&
            normalizeTextClean(cleanTitleBase(t.title)).includes(qCleanNorm)
        );
        if (!hasLeadCreator && leadHint.artistRaw) {
          const gdTrack = await buildGDStudioCanonicalTrack(cleanTitleBase(q), leadHint.artistRaw);
          if (gdTrack && !seen.has(gdTrack.id)) {
            seen.add(gdTrack.id);
            merged.unshift(gdTrack);
          }
        }
      }

      const finalTracks = scoreAndDeduplicateSearchTracks(merged, q, hints, limit);

      const qLower = q.toLowerCase();
      let topArtist: {
        name: string;
        genre: string;
        artworkUrl: string;
        trackCount: number;
        fans?: number;
      } | null = null;

      if (finalTracks.length > 0) {
        const artistStats = new Map<
          string,
          { name: string; count: number; genre: string; fallbackArt: string }
        >();
        for (const t of finalTracks) {
          const primary = extractPrimaryArtist(t.artist);
          const k = primary.toLowerCase();
          const cur = artistStats.get(k);
          if (cur) {
            cur.count += 1;
          } else {
            artistStats.set(k, {
              name: primary,
              count: 1,
              genre: t.genre,
              fallbackArt: t.artworkUrl,
            });
          }
        }

        let chosen = Array.from(artistStats.values()).find(
          (a) =>
            a.name.toLowerCase() === qLower ||
            a.name.toLowerCase().includes(qLower) ||
            qLower.includes(a.name.toLowerCase())
        );

        if (!chosen) {
          const sortedArtists = Array.from(artistStats.values()).sort((a, b) => b.count - a.count);
          if (sortedArtists[0] && sortedArtists[0].count >= 2) {
            chosen = sortedArtists[0];
          }
        }

        if (chosen) {
          const portrait =
            portraitHint.status === 'fulfilled' &&
            portraitHint.value &&
            (portraitHint.value.name.toLowerCase().includes(chosen.name.toLowerCase()) ||
              chosen.name.toLowerCase().includes(portraitHint.value.name.toLowerCase()))
              ? portraitHint.value
              : await fetchArtistPortrait(chosen.name);

          topArtist = {
            name: chosen.name,
            genre: chosen.genre,
            artworkUrl: portrait?.artworkUrl || chosen.fallbackArt,
            trackCount: finalTracks.filter((t) =>
              t.artist.toLowerCase().includes(chosen.name.toLowerCase())
            ).length,
            fans: portrait?.fans,
          };
        }
      }

      const albumSummaryMap = new Map<
        string,
        { title: string; artist: string; artworkUrl: string; year: string; genre?: string; trackCount: number }
      >();
      for (const t of finalTracks) {
        if (!t.album || t.album === 'Single') continue;
        const key = `${t.album.toLowerCase()}::${extractPrimaryArtist(t.artist).toLowerCase()}`;
        const existing = albumSummaryMap.get(key);
        if (existing) {
          existing.trackCount += 1;
        } else {
          albumSummaryMap.set(key, {
            title: t.album,
            artist: extractPrimaryArtist(t.artist),
            artworkUrl: t.artworkUrl,
            year: t.releaseYear || '—',
            genre: t.genre,
            trackCount: 1,
          });
        }
      }

      res.json({
        tracks: finalTracks,
        topArtist,
        albums: Array.from(albumSummaryMap.values()).slice(0, 8),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mencari lagu';
      res.status(502).json({ error: message });
    }
  });

  // Curated Discover Collections from diverse artists (clean studio originals)
  app.get('/api/music/discover', async (_req: Request, res: Response) => {
    try {
      if (discoverCache && Date.now() - discoverCache.timestamp < DISCOVER_TTL_MS) {
        res.json(discoverCache.data);
        return;
      }

      const FEATURED_ARTIST_SEEDS = [
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
        { name: 'Sheila On 7', genre: 'Pop Rock' },
      ];

      const [
        worldBestTracks,
        popGlobalTracks,
        rockMetalTracks,
        rnbTracks,
        indieRockTracks,
        electronicTracks,
        gamingTracks,
        artistPortraitHits,
      ] = await Promise.all([
        searchArtistsBatch([
          { term: 'Lady Gaga Bruno Mars Die With A Smile', artistHint: 'Lady Gaga', titleHint: 'Die With A Smile', country: 'US' },
          { term: 'Billie Eilish BIRDS OF A FEATHER', artistHint: 'Billie Eilish', titleHint: 'BIRDS OF A FEATHER', country: 'US' },
          { term: 'The Weeknd Blinding Lights', artistHint: 'The Weeknd', titleHint: 'Blinding Lights', country: 'US' },
          { term: 'ROSE Bruno Mars APT.', artistHint: 'Bruno Mars', titleHint: 'APT.', country: 'US' },
          { term: 'Sabrina Carpenter Espresso', artistHint: 'Sabrina Carpenter', titleHint: 'Espresso', country: 'US' },
          { term: 'Taylor Swift Cruel Summer', artistHint: 'Taylor Swift', titleHint: 'Cruel Summer', country: 'US' },
          { term: 'Ed Sheeran Shape of You', artistHint: 'Ed Sheeran', titleHint: 'Shape of You', country: 'US' },
          { term: 'Harry Styles As It Was', artistHint: 'Harry Styles', titleHint: 'As It Was', country: 'US' },
          { term: 'Adele Rolling in the Deep', artistHint: 'Adele', titleHint: 'Rolling in the Deep', country: 'US' },
          { term: 'Coldplay Viva La Vida', artistHint: 'Coldplay', titleHint: 'Viva La Vida', country: 'US' },
          { term: 'SZA Kill Bill', artistHint: 'SZA', titleHint: 'Kill Bill', country: 'US' },
          { term: 'Tulus Hati-Hati di Jalan', artistHint: 'Tulus', titleHint: 'Hati-Hati di Jalan', country: 'ID' },
        ], buildGDStudioCanonicalTrack),
        searchArtistsBatch([
          { term: 'The Weeknd Blinding Lights', artistHint: 'The Weeknd', titleHint: 'Blinding Lights', country: 'US' },
          { term: 'Billie Eilish Birds of a Feather', artistHint: 'Billie Eilish', titleHint: 'Birds of a Feather', country: 'US' },
          { term: 'Lady Gaga Bruno Mars Die With A Smile', artistHint: 'Lady Gaga', titleHint: 'Die With A Smile', country: 'US' },
          { term: 'Taylor Swift Cruel Summer', artistHint: 'Taylor Swift', titleHint: 'Cruel Summer', country: 'US' },
          { term: 'Sabrina Carpenter Espresso', artistHint: 'Sabrina Carpenter', titleHint: 'Espresso', country: 'US' },
          { term: 'Dua Lipa Levitating', artistHint: 'Dua Lipa', titleHint: 'Levitating', country: 'US' },
        ], buildGDStudioCanonicalTrack),
        searchArtistsBatch([
          { term: 'Avenged Sevenfold A Little Piece of Heaven', artistHint: 'Avenged Sevenfold', titleHint: 'A Little Piece of Heaven', country: 'US' },
          { term: 'Avenged Sevenfold Gunslinger', artistHint: 'Avenged Sevenfold', titleHint: 'Gunslinger', country: 'US' },
          { term: 'Avenged Sevenfold Dear God', artistHint: 'Avenged Sevenfold', titleHint: 'Dear God', country: 'US' },
          { term: 'Linkin Park Numb', artistHint: 'Linkin Park', titleHint: 'Numb', country: 'US' },
          { term: 'Bring Me The Horizon Can You Feel My Heart', artistHint: 'Bring Me The Horizon', titleHint: 'Can You Feel My Heart', country: 'US' },
          { term: 'My Chemical Romance Welcome to the Black Parade', artistHint: 'My Chemical Romance', titleHint: 'Welcome to the Black Parade', country: 'US' },
        ], buildGDStudioCanonicalTrack),
        searchArtistsBatch([
          { term: 'SZA Kill Bill', artistHint: 'SZA', titleHint: 'Kill Bill', country: 'US' },
          { term: 'Frank Ocean Pink + White', artistHint: 'Frank Ocean', titleHint: 'Pink + White', country: 'US' },
          { term: 'Daniel Caesar Best Part', artistHint: 'Daniel Caesar', titleHint: 'Best Part', country: 'US' },
          { term: 'Kendrick Lamar luther', artistHint: 'Kendrick Lamar', titleHint: 'luther', country: 'US' },
          { term: 'Rex Orange County Pluto Projector', artistHint: 'Rex Orange County', titleHint: 'Pluto Projector', country: 'US' },
        ], buildGDStudioCanonicalTrack),
        searchArtistsBatch([
          { term: 'Coldplay Yellow', artistHint: 'Coldplay', titleHint: 'Yellow', country: 'US' },
          { term: 'Arctic Monkeys 505', artistHint: 'Arctic Monkeys', titleHint: '505', country: 'US' },
          { term: 'Sheila On 7 Dan', artistHint: 'Sheila On 7', titleHint: 'Dan', country: 'ID' },
          { term: 'Radiohead Creep', artistHint: 'Radiohead', titleHint: 'Creep', country: 'US' },
          { term: 'Noah Separuh Aku', artistHint: 'Noah', titleHint: 'Separuh Aku', country: 'ID' },
        ], buildGDStudioCanonicalTrack),
        searchArtistsBatch([
          { term: 'Daft Punk Instant Crush', artistHint: 'Daft Punk', titleHint: 'Instant Crush', country: 'US' },
          { term: 'Joji Glimpse of Us', artistHint: 'Joji', titleHint: 'Glimpse of Us', country: 'US' },
          { term: 'Laufey From The Start', artistHint: 'Laufey', titleHint: 'From The Start', country: 'US' },
          { term: 'Fred again Delilah', artistHint: 'Fred again', titleHint: 'Delilah', country: 'US' },
          { term: 'Disclosure Latch', artistHint: 'Disclosure', titleHint: 'Latch', country: 'US' },
        ], buildGDStudioCanonicalTrack),
        searchArtistsBatch([
          { term: 'Alan Walker Faded', artistHint: 'Alan Walker', titleHint: 'Faded', country: 'US' },
          { term: 'Skrillex Bangarang', artistHint: 'Skrillex', titleHint: 'Bangarang', country: 'US' },
          { term: 'Daft Punk One More Time', artistHint: 'Daft Punk', titleHint: 'One More Time', country: 'US' },
          { term: 'Zedd The Middle', artistHint: 'Zedd', titleHint: 'The Middle', country: 'US' },
          { term: 'Marshmello Alone', artistHint: 'Marshmello', titleHint: 'Alone', country: 'US' },
        ], buildGDStudioCanonicalTrack),
        Promise.allSettled(
          FEATURED_ARTIST_SEEDS.map((seed) => fetchArtistPortrait(seed.name))
        ),
      ]);

      const featuredArtists = FEATURED_ARTIST_SEEDS.map((seed, idx) => {
        const hit = artistPortraitHits[idx];
        const artworkUrl =
          hit && hit.status === 'fulfilled' && hit.value?.artworkUrl
            ? hit.value.artworkUrl
            : '';
        return {
          name: seed.name,
          genre: seed.genre,
          artworkUrl,
        };
      });

      const collections = [
        {
          id: 'col-world-bestsellers',
          title: 'Lagu Terlaris di Dunia',
          subtitle: 'Deretan lagu paling populer dan terlaris sepanjang masa dari berbagai penjuru dunia',
          category: 'Global Hits',
          coverUrl: worldBestTracks[0]?.artworkUrl || '',
          tracks: worldBestTracks,
        },
        {
          id: 'col-rock-metal',
          title: 'Rock & Metal Anthem',
          subtitle: 'Avenged Sevenfold (A Little Piece of Heaven, Gunslinger), Linkin Park, & My Chemical Romance',
          category: 'Rock & Metal',
          coverUrl: rockMetalTracks[0]?.artworkUrl || '',
          tracks: rockMetalTracks,
        },
        {
          id: 'col-global',
          title: 'Tangga Lagu Global',
          subtitle: 'The Weeknd, Billie Eilish, Bruno Mars, hingga Taylor Swift',
          category: 'Pop Global',
          coverUrl: popGlobalTracks[0]?.artworkUrl || '',
          tracks: popGlobalTracks,
        },
        {
          id: 'col-rnb',
          title: 'Velvet R&B & Soul',
          subtitle: 'SZA, Frank Ocean, Daniel Caesar, dan alunan vokal hangat',
          category: 'R&B & Soul',
          coverUrl: rnbTracks[0]?.artworkUrl || '',
          tracks: rnbTracks,
        },
        {
          id: 'col-indie',
          title: 'Anthem Indie & Alternatif',
          subtitle: 'Coldplay, Arctic Monkeys, Sheila on 7, Radiohead, dan Noah',
          category: 'Indie & Rock',
          coverUrl: indieRockTracks[0]?.artworkUrl || '',
          tracks: indieRockTracks,
        },
        {
          id: 'col-electronic',
          title: 'Elektronik, Jazz & Fokus Malam',
          subtitle: 'Daft Punk, Joji, Laufey, Fred again.. untuk sesi larut malam',
          category: 'Elektronik & Lo-Fi',
          coverUrl: electronicTracks[0]?.artworkUrl || '',
          tracks: electronicTracks,
        },
        {
          id: 'col-gaming',
          title: 'Gaming & Energi Tinggi',
          subtitle: 'Alan Walker, Skrillex, Daft Punk, dan beat EDM untuk sesi gaming',
          category: 'Gaming',
          coverUrl: gamingTracks[0]?.artworkUrl || '',
          tracks: gamingTracks,
        },
      ];

      const payload = { collections, featuredArtists };
      discoverCache = { timestamp: Date.now(), data: payload };
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat katalog';
      res.status(502).json({ error: message });
    }
  });

  // Artist profile & top tracks
  app.get('/api/music/artist', async (req: Request, res: Response) => {
    try {
      const name = String(req.query.name || '').trim();
      if (!name) {
        res.status(400).json({ error: 'Nama artis diperlukan' });
        return;
      }
      const [idTracks, usTracks, hints, portrait] = await Promise.all([
        searchITunes(name, 30, 'ID'),
        searchITunes(name, 25, 'US'),
        fetchPopularityHints(name),
        fetchArtistPortrait(name),
      ]);
      const combined: NormalizedTrack[] = [];
      const seenIds = new Set<string>();
      for (const t of [...idTracks, ...usTracks]) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          combined.push(t);
        }
      }
      const nameNorm = normalizeTextClean(name);
      const artistOnly = combined.filter(
        (t) =>
          normalizeTextClean(t.artist).includes(nameNorm) ||
          nameNorm.includes(normalizeTextClean(extractPrimaryArtist(t.artist)))
      );
      const pool = artistOnly.length >= 3 ? artistOnly : combined;
      const list = scoreAndDeduplicateSearchTracks(pool, name, hints, 20);
      const primaryName = list[0]?.artist || name;

      const albumMap = new Map<string, { title: string; artworkUrl: string; year: string }>();
      for (const t of list) {
        if (!albumMap.has(t.album)) {
          albumMap.set(t.album, {
            title: t.album,
            artworkUrl: t.artworkUrl,
            year: t.releaseYear || '—',
          });
        }
      }

      res.json({
        artist: {
          name: primaryName,
          genre: list[0]?.genre || 'Musik',
          artworkUrl: portrait?.artworkUrl || list[0]?.artworkUrl || '',
          tracks: list.slice(0, 15),
          albums: Array.from(albumMap.values()).slice(0, 8),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat profil artis';
      res.status(502).json({ error: message });
    }
  });

  // Full Album Detail & Ordered Tracklist
  app.get('/api/music/album', async (req: Request, res: Response) => {
    try {
      const title = String(req.query.title || '').trim();
      const artist = String(req.query.artist || '').trim();
      if (!title) {
        res.status(400).json({ error: 'Judul album diperlukan' });
        return;
      }

      const searchQ = `${artist} ${title}`.trim();
      let albumTracks: NormalizedTrack[] = [];

      // Step 1: Look up exact collectionId via iTunes album search, then lookup ordered songs
      for (const country of ['ID', 'US']) {
        try {
          const albRes = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(searchQ)}&entity=album&limit=8&country=${country}`,
            { signal: AbortSignal.timeout(7000) }
          );
          if (!albRes.ok) continue;
          const albJson = (await albRes.json()) as {
            results?: {
              collectionId?: number;
              collectionName?: string;
              artistName?: string;
              artworkUrl100?: string;
              releaseDate?: string;
              primaryGenreName?: string;
            }[];
          };
          const titleClean = normalizeTextClean(cleanTitleBase(title));
          const artistClean = normalizeTextClean(extractPrimaryArtist(artist));
          const matchedAlbum = (albJson.results || []).find((a) => {
            if (!a.collectionId || !a.collectionName) return false;
            const cName = normalizeTextClean(cleanTitleBase(a.collectionName));
            const aName = normalizeTextClean(a.artistName || '');
            const titleMatch = cName.includes(titleClean) || titleClean.includes(cName);
            const artistMatch = !artistClean || aName.includes(artistClean) || artistClean.includes(aName);
            return titleMatch && artistMatch;
          });

          if (matchedAlbum?.collectionId) {
            const lookupRes = await fetch(
              `https://itunes.apple.com/lookup?id=${matchedAlbum.collectionId}&entity=song&country=${country}`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (lookupRes.ok) {
              const lookupJson = (await lookupRes.json()) as {
                results?: (ITunesResult & { wrapperType?: string })[];
              };
              const rawSongs = (lookupJson.results || []).filter(
                (r) => r.wrapperType === 'track' && r.trackId && r.trackName && r.artistName
              );
              const normalized = rawSongs
                .map((r) => normalizeITunesTrack(r))
                .filter((t): t is NormalizedTrack => Boolean(t));
              if (normalized.length > 0) {
                albumTracks = normalized;
                break;
              }
            }
          }
        } catch {
          // Try next storefront
        }
      }

      // Step 2: Fallback song search filtered cleanly by album title
      if (albumTracks.length === 0) {
        const [idHits, usHits] = await Promise.all([
          searchITunes(searchQ, 25, 'ID'),
          searchITunes(searchQ, 25, 'US'),
        ]);
        const titleClean = normalizeTextClean(cleanTitleBase(title));
        const seen = new Set<string>();
        const filtered: NormalizedTrack[] = [];
        for (const t of [...idHits, ...usHits]) {
          if (seen.has(t.id)) continue;
          const tAlbumClean = normalizeTextClean(cleanTitleBase(t.album));
          if (tAlbumClean.includes(titleClean) || titleClean.includes(tAlbumClean)) {
            seen.add(t.id);
            filtered.push(t);
          }
        }
        albumTracks = filtered.length > 0 ? filtered : [...idHits, ...usHits].slice(0, 12);
      }

      const first = albumTracks[0];
      const totalDurationMs = albumTracks.reduce((sum, t) => sum + (t.durationMs || 0), 0);

      res.json({
        album: {
          title: first?.album || title,
          artist: first?.artist || artist || 'Berbagai Artis',
          artworkUrl: first?.artworkUrl || '',
          year: first?.releaseYear || '—',
          genre: first?.genre || 'Musik',
          totalDurationMs,
          tracks: albumTracks,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat detail album';
      res.status(502).json({ error: message });
    }
  });

  // Dynamic SoundCloud client_id cache + full-length audio resolver
  let cachedScClientId = 'glXhJxvYKPM87la70dG2G1bJ03AdA3hN';
  let cachedScClientIdTs = 0;

  async function getSoundCloudClientId(forceRefresh = false): Promise<string> {
    if (!forceRefresh && cachedScClientId && Date.now() - cachedScClientIdTs < 6 * 60 * 60 * 1000) {
      return cachedScClientId;
    }
    try {
      const homeRes = await fetch('https://soundcloud.com/', { signal: AbortSignal.timeout(6000) });
      const html = await homeRes.text();
      const scriptMatches = [...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(
        (m) => m[1]
      );
      for (const scriptUrl of scriptMatches.slice(-4)) {
        const js = await fetch(scriptUrl, { signal: AbortSignal.timeout(6000) }).then((r) => r.text());
        const match = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (match?.[1]) {
          cachedScClientId = match[1];
          cachedScClientIdTs = Date.now();
          return cachedScClientId;
        }
      }
    } catch {
      // Keep fallback client_id
    }
    return cachedScClientId;
  }

  interface CachedAudio {
    buffer: Buffer;
    mimeType: string;
    ts: number;
    diffMs?: number;
    source?: 'netease' | 'kuwo' | 'audius' | 'soundcloud' | 'fallback';
  }
  const FULL_AUDIO_CACHE_MAX = 25;
  const fullAudioCache = new Map<string, CachedAudio>();
  const inFlightAudio = new Map<string, Promise<CachedAudio>>();

  function putAudioCache(key: string, entry: CachedAudio) {
    if (fullAudioCache.has(key)) fullAudioCache.delete(key);
    fullAudioCache.set(key, entry);
    while (fullAudioCache.size > FULL_AUDIO_CACHE_MAX) {
      const oldestKey = fullAudioCache.keys().next().value;
      if (oldestKey) fullAudioCache.delete(oldestKey);
      else break;
    }
  }

  function normalizeClean(str: string): string {
    return str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  const NON_ORIGINAL_RE =
    /\b(slowed|reverb|reverbed|nightcore|daycore|karaoke|instrumental|8d|16d|3d\s*audio|sped\s*up|speed\s*up|speedup|tik\s*tok|tiktok|vt|remix|rmx|bootleg|mashup|mash-up|koplo|pop\s*punk|ai\s*cover|cover|covered|coveran|ngecover|female\s*cover|cewe|lofi|lo-fi|remake|edit|circuit|dj|1\s*hour|loop|bass\s*boost|bassboosted|acoustic|akustik|piano|violin|guitar|tiny\s*desk|flip|parody|tribute|live\s*at|concert|session|unplugged|live|konser|panggung|penonton|live\s*version|live\s*performance|acapella|a\s*cappella|a\s*capella|acappella|vocal\s*only|vocals\s*only|isolated\s*vocal|vocal\s*track|backing\s*track|medium\s*quality|low\s*quality|bad\s*quality|pitch|pitched|rework|re-work|fan\s*made|fan-made|voc\s*:|vocal\s*:|vokal\s*:|voc\s+by|vocal\s+by|vokal\s+by|vocalist|sing\s+by|sung\s+by|nyanyi|choir|paduan\s*suara|audisi|rising\s*star|indonesian\s*idol|x\s*factor|the\s*voice|lomba|kontes|dubstep\s*piano|lullaby|music\s*box)\b/i;

  const ASIAN_COVER_RE = /(翻唱|伴奏|钢琴|吉他|现场|合唱|女声|男声|纯音乐|remix|rmx|cover)/i;

  const MAX_STUDIO_DURATION_DIFF_MS = 5000; // 5.0 seconds max tolerance from official studio duration

  function cleanTrackTitle(raw: string): string {
    return cleanTitleBase(raw);
  }

  function primaryArtistName(raw: string): string {
    return extractPrimaryArtist(raw);
  }

  function tokenizeWords(input: string): string[] {
    return normalizeClean(input)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  interface GDStudioTrackItem {
    id?: string | number;
    name?: string;
    artist?: string[];
    album?: string;
    pic_id?: string;
    source?: string;
  }

  interface GDStudioScoredCandidate {
    item: GDStudioTrackItem;
    score: number;
    source: 'netease' | 'kuwo';
  }

  interface GDStudioUrlInfo {
    url?: string;
    br?: number;
    size?: number;
  }

  const gdCandidateCache = new Map<string, { ts: number; data: GDStudioScoredCandidate[] }>();
  const gdUrlCache = new Map<string, { ts: number; data: GDStudioUrlInfo }>();
  const GD_META_TTL_MS = 20 * 60 * 1000;

  async function fetchGDStudioUrlInfo(
    source: 'netease' | 'kuwo',
    id: string | number,
    bitrate: 128 | 192 | 320 | 999 = 320
  ): Promise<GDStudioUrlInfo | null> {
    const key = `${source}:${id}:${bitrate}`;
    const cached = gdUrlCache.get(key);
    if (cached && Date.now() - cached.ts < GD_META_TTL_MS) {
      return cached.data;
    }
    const urlApi = `https://music-api.gdstudio.xyz/api.php?types=url&source=${source}&id=${encodeURIComponent(String(id))}&br=${bitrate}`;
    const urlJson = await gdFetchJson<GDStudioUrlInfo>(urlApi, 7500, 3);
    if (urlJson?.url) {
      if (gdUrlCache.size > 400) {
        const oldest = gdUrlCache.keys().next().value;
        if (oldest) gdUrlCache.delete(oldest);
      }
      gdUrlCache.set(key, { ts: Date.now(), data: urlJson });
      return urlJson;
    }
    return null;
  }

  async function buildGDStudioCanonicalTrack(
    titleQuery: string,
    expectedArtist?: string
  ): Promise<NormalizedTrack | null> {
    try {
      const cleanedTitle = cleanTrackTitle(titleQuery);
      const q = expectedArtist ? `${extractPrimaryArtist(expectedArtist)} ${cleanedTitle}`.trim() : cleanedTitle;
      const items = await gdFetchJson<GDStudioTrackItem[]>(
        `https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=${encodeURIComponent(q)}&count=8&pages=1`,
        7000,
        3
      );
      if (!Array.isArray(items) || items.length === 0) return null;

      const expWords = expectedArtist
        ? tokenizeWords(extractPrimaryArtist(expectedArtist))
        : [];
      const titleNorm = normalizeTextClean(cleanedTitle);

      const picked = items.find((item) => {
        if (!item.id || !item.name || !Array.isArray(item.artist) || item.artist.length === 0) return false;
        const itemNameNorm = normalizeClean(item.name);
        const itemArtistsNorm = item.artist.map((a) => normalizeClean(a)).join(' ');
        if (
          NON_ORIGINAL_RE.test(itemNameNorm) ||
          NON_ORIGINAL_RE.test(itemArtistsNorm) ||
          ASIAN_COVER_RE.test(item.name) ||
          ASIAN_COVER_RE.test(item.artist.join(' ')) ||
          KNOWN_COVER_ARTIST_RE.test(itemArtistsNorm)
        ) {
          return false;
        }
        if (expWords.length > 0 && !expWords.every((w) => itemArtistsNorm.includes(w))) {
          return false;
        }
        return normalizeTextClean(cleanTitleBase(item.name)).includes(titleNorm) || titleNorm.includes(normalizeTextClean(cleanTitleBase(item.name)));
      });

      if (!picked?.id || !picked.name || !picked.artist) return null;

      const [urlJson, picRes] = await Promise.all([
        fetchGDStudioUrlInfo('netease', picked.id),
        picked.pic_id
          ? gdFetchJson<{ url?: string }>(
              `https://music-api.gdstudio.xyz/api.php?types=pic&source=netease&id=${encodeURIComponent(picked.pic_id)}&size=500`,
              5000,
              2
            )
          : Promise.resolve(null),
      ]);

      const br = urlJson?.br || 320;
      const bytesPerSec = (br * 1000) / 8;
      const estDurationMs =
        urlJson?.size && urlJson.size > 1_000_000
          ? Math.round((urlJson.size / bytesPerSec) * 1000)
          : 215000;

      return {
        id: `gd:netease:${picked.id}`,
        title: picked.name,
        artist: picked.artist.join(', '),
        album: picked.album || 'Single',
        genre: 'Musik',
        durationMs: estDurationMs,
        artworkUrl: picRes?.url || '',
        previewUrl: '',
      };
    } catch {
      return null;
    }
  }

  async function findGDStudioCandidates(
    title: string,
    artist: string
  ): Promise<GDStudioScoredCandidate[]> {
    const cleanedTitle = cleanTrackTitle(title);
    const baseArtist = primaryArtistName(artist);
    const cacheKey = `${normalizeClean(baseArtist)}::${normalizeClean(cleanedTitle)}`;
    const cached = gdCandidateCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GD_META_TTL_MS) {
      return cached.data;
    }

    const targetTitleNorm = normalizeClean(cleanedTitle);
    const titleWords = tokenizeWords(cleanedTitle);
    const artistWords = tokenizeWords(baseArtist);
    const allArtistWords = tokenizeWords(artist);
    const allowSpecialInTitle = NON_ORIGINAL_RE.test(normalizeClean(title));

    const searchSources: ('netease' | 'kuwo')[] = ['netease', 'kuwo'];
    const scored: GDStudioScoredCandidate[] = [];

    for (const src of searchSources) {
      try {
        const queries = [
          `${baseArtist} ${cleanedTitle}`.trim(),
          cleanedTitle,
        ];
        for (const q of queries) {
          const url = `https://music-api.gdstudio.xyz/api.php?types=search&source=${src}&name=${encodeURIComponent(q)}&count=10&pages=1`;
          const items = await gdFetchJson<GDStudioTrackItem[]>(url, 7000, 3);
          if (!Array.isArray(items) || items.length === 0) continue;

          for (const item of items) {
            if (!item.id || !item.name || !Array.isArray(item.artist) || item.artist.length === 0) continue;
            const itemNameNorm = normalizeClean(item.name);
            const itemTitleClean = normalizeClean(cleanTrackTitle(item.name));
            const itemArtistsNorm = item.artist.map((a) => normalizeClean(a)).join(' ');
            const itemAlbumNorm = normalizeClean(item.album || '');

            if (!allowSpecialInTitle) {
              if (
                NON_ORIGINAL_RE.test(itemNameNorm) ||
                NON_ORIGINAL_RE.test(itemArtistsNorm) ||
                NON_ORIGINAL_RE.test(itemAlbumNorm) ||
                ASIAN_COVER_RE.test(item.name) ||
                ASIAN_COVER_RE.test(item.artist.join(' '))
              ) {
                continue;
              }
            }

            const primaryMatches =
              artistWords.length > 0 && artistWords.every((w) => itemArtistsNorm.includes(w));
            const anyArtistMatches =
              allArtistWords.length > 0 &&
              allArtistWords.filter((w) => itemArtistsNorm.includes(w)).length >=
                Math.min(artistWords.length, 2);

            if (!primaryMatches && !anyArtistMatches) continue;

            const matchedTitle = titleWords.filter((w) => itemTitleClean.includes(w));
            if (titleWords.length > 0 && matchedTitle.length < Math.max(1, Math.ceil(titleWords.length * 0.65))) {
              continue;
            }

            let score = 0;
            if (itemTitleClean === targetTitleNorm) score += 60;
            else score += matchedTitle.length * 16;

            if (primaryMatches) score += 50;
            else score += 20;

            if (src === 'netease') score += 10;
            if (!/\b(deluxe|live|remix|cover|dj|mix|edit)\b/i.test(itemNameNorm)) score += 15;

            scored.push({ item, score, source: src });
          }

          if (scored.some((s) => s.score >= 95)) break;
        }
        if (scored.length > 0) break;
      } catch {
        // Try next source
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const seenIds = new Set<string>();
    const deduped = scored.filter((c) => {
      const k = `${c.source}:${c.item.id}`;
      if (seenIds.has(k)) return false;
      seenIds.add(k);
      return true;
    });

    if (deduped.length > 0) {
      if (gdCandidateCache.size > 400) {
        const oldest = gdCandidateCache.keys().next().value;
        if (oldest) gdCandidateCache.delete(oldest);
      }
      gdCandidateCache.set(cacheKey, { ts: Date.now(), data: deduped });
    }
    return deduped;
  }

  function isLikelyFullLengthBytes(bytes: number, expectedMs: number, bitrateKbps: number): boolean {
    if (bytes <= 50000) return false;
    if (expectedMs <= 65000) return bytes > 400_000;
    const sec = expectedMs / 1000;
    const br = bitrateKbps > 0 ? bitrateKbps : 128;
    const threshold = Math.max(1_450_000, Math.floor(sec * ((br * 1000) / 8) * 0.55));
    return bytes >= threshold;
  }

  async function resolveFromGDStudio(
    title: string,
    artist: string,
    expectedMs: number,
    bitrate: 128 | 192 | 320 | 999 = 320
  ): Promise<CachedAudio | null> {
    try {
      const candidates = await findGDStudioCandidates(title, artist);
      if (candidates.length === 0) return null;

      for (const cand of candidates.slice(0, 3)) {
        try {
          if (!cand.item.id) continue;
          let urlJson = await fetchGDStudioUrlInfo(cand.source, cand.item.id, bitrate);
          if ((!urlJson || !urlJson.url) && bitrate === 999) {
            urlJson = await fetchGDStudioUrlInfo(cand.source, cand.item.id, 320);
          }
          if (!urlJson?.url) continue;

          if (urlJson.size && !isLikelyFullLengthBytes(urlJson.size, expectedMs, urlJson.br || bitrate)) {
            continue;
          }

          const audioRes = await fetch(urlJson.url, { signal: AbortSignal.timeout(25000) });
          if (!audioRes.ok) continue;
          const arr = await audioRes.arrayBuffer();
          const buf = Buffer.from(arr);

          if (!isLikelyFullLengthBytes(buf.length, expectedMs, urlJson.br || bitrate)) {
            continue;
          }

          return {
            buffer: buf,
            mimeType: audioRes.headers.get('content-type') || 'audio/mpeg',
            ts: Date.now(),
            diffMs: 0,
            source: cand.source,
          };
        } catch {
          // Try next candidate
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  interface SCTranscoding {
    url?: string;
    format?: { protocol?: string; mime_type?: string };
  }
  interface SCTrackItem {
    title?: string;
    description?: string;
    tag_list?: string;
    duration?: number;
    likes_count?: number;
    playback_count?: number;
    policy?: string;
    publisher_metadata?: { artist?: string };
    user?: { username?: string; verified?: boolean };
    media?: { transcodings?: SCTranscoding[] };
  }

  async function resolveFromSoundCloud(title: string, artist: string, expectedMs: number): Promise<CachedAudio | null> {
    let cid = await getSoundCloudClientId(false);
    const cleanedTitle = cleanTrackTitle(title);
    const baseArtist = primaryArtistName(artist);
    const queriesToTry = [
      `${baseArtist} ${cleanedTitle}`.trim(),
      artist !== baseArtist ? `${artist} ${cleanedTitle}`.trim() : '',
    ].filter(Boolean);

    const candidateMap = new Map<string, SCTrackItem>();
    for (const q of queriesToTry) {
      let srRes = await fetch(
        `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=35`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (srRes.status === 401 || srRes.status === 403) {
        cid = await getSoundCloudClientId(true);
        srRes = await fetch(
          `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=35`,
          { signal: AbortSignal.timeout(8000) }
        );
      }
      if (!srRes.ok) continue;
      const srJson = (await srRes.json()) as { collection?: SCTrackItem[] };
      for (const item of srJson.collection || []) {
        if (
          (item.duration ?? 0) > 65000 &&
          (item.duration ?? 0) < 750000 &&
          item.policy !== 'SNIP' &&
          (item.media?.transcodings?.length ?? 0) > 0
        ) {
          const dedupKey = `${item.user?.username || ''}::${item.title || ''}::${item.duration || 0}`;
          if (!candidateMap.has(dedupKey)) {
            candidateMap.set(dedupKey, item);
          }
        }
      }
      if (candidateMap.size >= 25) break;
    }

    const candidates = Array.from(candidateMap.values());
    if (candidates.length === 0) return null;

    const titleWords = tokenizeWords(cleanedTitle);
    const artistWords = tokenizeWords(baseArtist);

    let best: SCTrackItem | null = null;
    let bestScore = -9999;

    for (const item of candidates) {
      const scTitle = item.title || '';
      const scTitleNorm = normalizeClean(scTitle);
      const scUserNorm = normalizeClean(item.user?.username || '');
      const scTagsNorm = normalizeClean(item.tag_list || '');
      const scDescNorm = normalizeClean((item.description || '').slice(0, 220));
      const pubArtistNorm = normalizeClean(item.publisher_metadata?.artist || '');
      const combined = `${scTitleNorm} ${scUserNorm} ${pubArtistNorm}`;

      if (
        NON_ORIGINAL_RE.test(scTitleNorm) ||
        NON_ORIGINAL_RE.test(scUserNorm) ||
        NON_ORIGINAL_RE.test(scTagsNorm) ||
        /\b(cover\s*by|female\s*cover|vocal\s*cover|my\s*cover)\b/i.test(scDescNorm)
      ) {
        continue;
      }

      if (pubArtistNorm && pubArtistNorm.length > 1) {
        const pubMatchesArtist = artistWords.some((w) => pubArtistNorm.includes(w));
        if (!pubMatchesArtist) {
          continue;
        }
      }

      if (!scTitleNorm.includes(' - ') && !scTitleNorm.includes(' ~ ') && !scTitleNorm.includes(' : ')) {
        const endsWithArtistInParen = new RegExp(`\\(${artistWords.join('|')}[^)]*\\)$`, 'i');
        if (endsWithArtistInParen.test(scTitleNorm)) {
          continue;
        }
      }

      const coverChannelRe = /\b(cover|karaoke|akustik|acoustic|tribute|parodi|remix|dj|slowed|reverb|fan|channel|accoustic|instrumental)\b/i;
      if (coverChannelRe.test(scUserNorm) && !scUserNorm.includes(normalizeClean(baseArtist))) {
        continue;
      }
      const uploaderMatchesArtist =
        scUserNorm.includes(normalizeClean(baseArtist)) ||
        pubArtistNorm.includes(normalizeClean(baseArtist));
      const titleCreditsArtist = scTitleNorm.includes(normalizeClean(baseArtist));
      if (!uploaderMatchesArtist && !titleCreditsArtist) {
        continue;
      }

      const likes = item.likes_count ?? 0;
      const plays = item.playback_count ?? 0;
      const isPopularUpload = plays >= 80000 && likes >= 500;
      const maxDiff = isPopularUpload ? 9500 : MAX_STUDIO_DURATION_DIFF_MS;

      if (expectedMs > 65000 && item.duration) {
        const diffMs = Math.abs(item.duration - expectedMs);
        if (diffMs > maxDiff) continue;
      }

      const matchedTitleWords = titleWords.filter((w) => scTitleNorm.includes(w));
      const matchedArtistWords = artistWords.filter((w) => combined.includes(w));
      if (titleWords.length > 0 && matchedTitleWords.length === 0) continue;
      if (artistWords.length > 0 && matchedArtistWords.length === 0) continue;

      let score = 0;
      score += matchedTitleWords.length * 15;
      score += matchedArtistWords.length * 12;

      const startsWithArtist = artistWords.some((w) => scTitleNorm.startsWith(w));
      if (startsWithArtist && (scTitleNorm.includes(' - ') || scTitleNorm.includes(' ~ ') || scTitleNorm.includes(' : '))) {
        score += 45;
      }

      if (pubArtistNorm && artistWords.some((w) => pubArtistNorm.includes(w))) {
        score += 35;
      }

      if (/\b(official|lyric\s*video|official\s*audio|original\s*audio)\b/i.test(scTitleNorm)) {
        score += 25;
      }

      if (item.user?.verified && artistWords.some((w) => scUserNorm.includes(w))) {
        score += 30;
      }

      score += Math.min(35, Math.floor(Math.log10(likes + 1) * 8 + Math.log10(plays + 1) * 3));
      if (likes < 250 && plays < 60000 && !item.user?.verified && !pubArtistNorm) {
        score -= 30;
      }

      const dashIdx = scTitleNorm.indexOf(' - ');
      if (dashIdx > 0) {
        const leftSide = scTitleNorm.slice(0, dashIdx);
        const rightSide = scTitleNorm.slice(dashIdx + 3);
        const leftHasArtist = artistWords.some((w) => leftSide.includes(w));
        const rightHasArtist = artistWords.some((w) => rightSide.includes(w));
        if (!leftHasArtist && !rightHasArtist) {
          score -= 35;
        }
      }

      if (expectedMs > 65000 && item.duration) {
        const diffSec = Math.abs(item.duration - expectedMs) / 1000;
        if (diffSec <= 1) score += 20;
        else if (diffSec <= 2.5) score += 15;
        else if (diffSec <= 5.0) score += 10;
      }

      const trans = item.media?.transcodings || [];
      if (
        trans.some(
          (tr) =>
            tr.format?.protocol === 'progressive' ||
            tr.format?.mime_type?.includes('audio/mp4')
        )
      ) {
        score += 8;
      }

      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (!best || bestScore < 55) return null;
    const transcodings = best.media?.transcodings || [];
    const progressive = transcodings.find(
      (tr) => tr.format?.protocol === 'progressive' && tr.url
    );
    const fmp4Hls = transcodings.find(
      (tr) => tr.format?.protocol === 'hls' && tr.format?.mime_type?.includes('audio/mp4') && tr.url
    );
    const chosen = progressive || fmp4Hls;
    if (!chosen?.url) return null;

    const infoRes = await fetch(`${chosen.url}?client_id=${cid}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!infoRes.ok) return null;
    const infoJson = (await infoRes.json()) as { url?: string };
    if (!infoJson.url) return null;

    if (chosen.format?.protocol === 'progressive') {
      const audioRes = await fetch(infoJson.url, { signal: AbortSignal.timeout(25000) });
      if (!audioRes.ok) return null;
      const arr = await audioRes.arrayBuffer();
      const buf = Buffer.from(arr);
      if (expectedMs > 65000 && buf.length < 1_200_000) return null;
      return {
        buffer: buf,
        mimeType: audioRes.headers.get('content-type') || 'audio/mpeg',
        ts: Date.now(),
        diffMs: best.duration ? Math.abs(best.duration - expectedMs) : undefined,
        source: 'soundcloud',
      };
    }

    const m3u8Text = await fetch(infoJson.url, { signal: AbortSignal.timeout(8000) }).then((r) =>
      r.text()
    );
    const mapMatch = m3u8Text.match(/#EXT-X-MAP:URI="([^"]+)"/);
    const segUrls = m3u8Text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (segUrls.length === 0) return null;

    const allParts = mapMatch?.[1] ? [mapMatch[1], ...segUrls] : segUrls;
    const buffers = await Promise.all(
      allParts.map(async (segUrl) => {
        const segRes = await fetch(segUrl, { signal: AbortSignal.timeout(20000) });
        if (!segRes.ok) throw new Error(`Segment ${segRes.status}`);
        return Buffer.from(await segRes.arrayBuffer());
      })
    );
    const combinedBuf = Buffer.concat(buffers);
    if (expectedMs > 65000 && combinedBuf.length < 1_200_000) return null;
    return {
      buffer: combinedBuf,
      mimeType: 'audio/mp4',
      ts: Date.now(),
      diffMs: best.duration ? Math.abs(best.duration - expectedMs) : undefined,
      source: 'soundcloud',
    };
  }

  async function resolveFromAudius(title: string, artist: string, expectedMs: number): Promise<CachedAudio | null> {
    try {
      const cleanedTitle = cleanTrackTitle(title);
      const q = `${artist} ${cleanedTitle}`.trim();
      const res = await fetch(
        `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=Svara`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as {
        data?: { id?: string; title?: string; duration?: number; user?: { name?: string } }[];
      };
      const titleWords = tokenizeWords(cleanedTitle);
      const artistWords = tokenizeWords(artist);
      const coverChannelRe = /\b(cover|karaoke|akustik|acoustic|tribute|parodi|remix|dj|slowed|reverb|fan|channel|accoustic|instrumental)\b/i;

      const validList = (json.data || []).filter((t) => {
        if (!t.id || (t.duration ?? 0) <= 65) return false;
        const tTitleNorm = normalizeClean(t.title || '');
        const tUserNorm = normalizeClean(t.user?.name || '');
        if (NON_ORIGINAL_RE.test(tTitleNorm) || NON_ORIGINAL_RE.test(tUserNorm)) return false;
        if (coverChannelRe.test(tUserNorm) && !tUserNorm.includes(normalizeClean(artist))) return false;
        if (expectedMs > 65000 && Math.abs((t.duration || 0) * 1000 - expectedMs) > MAX_STUDIO_DURATION_DIFF_MS) return false;
        const hasTitle = titleWords.every((w) => tTitleNorm.includes(w));
        const hasArtist = artistWords.some((w) => `${tTitleNorm} ${tUserNorm}`.includes(w));
        return hasTitle && hasArtist;
      });

      if (validList.length === 0) return null;
      validList.sort((a, b) => {
        const diffA = Math.abs((a.duration || 0) * 1000 - expectedMs);
        const diffB = Math.abs((b.duration || 0) * 1000 - expectedMs);
        return diffA - diffB;
      });

      for (const match of validList.slice(0, 3)) {
        if (!match?.id) continue;
        try {
          const streamRes = await fetch(
            `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(match.id)}/stream?app_name=Svara`,
            { signal: AbortSignal.timeout(20000) }
          );
          if (!streamRes.ok) continue;
          const arr = await streamRes.arrayBuffer();
          const buf = Buffer.from(arr);
          if (expectedMs > 65000 && buf.length < 1_200_000) continue;
          return {
            buffer: buf,
            mimeType: streamRes.headers.get('content-type') || 'audio/mpeg',
            ts: Date.now(),
            diffMs: match.duration ? Math.abs(match.duration * 1000 - expectedMs) : undefined,
            source: 'audius',
          };
        } catch {
          // Try next candidate
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async function resolveFullAudio(
    cacheKey: string,
    title: string,
    artist: string,
    expectedMs: number,
    fallbackUrl: string,
    bitrate: 128 | 192 | 320 | 999 = 320
  ): Promise<CachedAudio> {
    const cached = fullAudioCache.get(cacheKey);
    if (cached) return cached;

    const existingFlight = inFlightAudio.get(cacheKey);
    if (existingFlight) return existingFlight;

    const promise = (async (): Promise<CachedAudio> => {
      try {
        if (title && artist) {
          const gdAudio = await resolveFromGDStudio(title, artist, expectedMs, bitrate);
          if (gdAudio && gdAudio.buffer.length > 50000) {
            putAudioCache(cacheKey, gdAudio);
            return gdAudio;
          }

          const [audiusRes, scRes] = await Promise.allSettled([
            resolveFromAudius(title, artist, expectedMs),
            resolveFromSoundCloud(title, artist, expectedMs),
          ]);
          const audiusAudio = audiusRes.status === 'fulfilled' ? audiusRes.value : null;
          const scAudio = scRes.status === 'fulfilled' ? scRes.value : null;

          let picked: CachedAudio | null = null;
          if (audiusAudio && scAudio) {
            picked = (audiusAudio.diffMs ?? 99999) <= (scAudio.diffMs ?? 99999) ? audiusAudio : scAudio;
          } else {
            picked = audiusAudio || scAudio;
          }

          if (picked && picked.buffer.length > 50000) {
            putAudioCache(cacheKey, picked);
            return picked;
          }
        }

        const parsedFallback = isAllowedMediaHost(fallbackUrl, 'audio');
        if (!parsedFallback) {
          throw new Error('Tidak ada sumber audio yang valid');
        }
        const fbRes = await fetch(parsedFallback.toString(), {
          signal: AbortSignal.timeout(15000),
        });
        if (!fbRes.ok) {
          throw new Error(`Upstream fallback ${fbRes.status}`);
        }
        const entry: CachedAudio = {
          buffer: Buffer.from(await fbRes.arrayBuffer()),
          mimeType: fbRes.headers.get('content-type') || 'audio/mp4',
          ts: Date.now(),
          diffMs: 0,
          source: 'fallback',
        };
        putAudioCache(cacheKey, entry);
        return entry;
      } finally {
        inFlightAudio.delete(cacheKey);
      }
    })();

    inFlightAudio.set(cacheKey, promise);
    return promise;
  }

  function sendBufferWithRange(req: Request, res: Response, buffer: Buffer, mimeType: string) {
    const total = buffer.length;
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const match = String(rangeHeader).match(/bytes=(\d*)-(\d*)/);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
        if (start >= total || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
          return;
        }
        const chunk = buffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(chunk.length));
        res.send(chunk);
        return;
      }
    }

    res.status(200);
    res.setHeader('Content-Length', String(total));
    res.send(buffer);
  }

  // Full-Length CORS-safe Audio Stream Endpoint (with Quality Bitrate, Range seeking & Offline download support)
  app.get('/api/music/full-audio', async (req: Request, res: Response) => {
    const id = String(req.query.id || '').trim();
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    const durationMs = Number(req.query.durationMs) || 0;
    const fallbackUrl = String(req.query.fallbackUrl || '').trim();
    const quality = String(req.query.quality || 'hires').trim().toLowerCase();
    const bitrate: 128 | 192 | 320 | 999 =
      quality === 'standard'
        ? 128
        : quality === 'high'
        ? 192
        : quality === 'flac' || quality === 'alac'
        ? 999
        : 320;

    if (!title && !fallbackUrl) {
      res.status(400).json({ error: 'Parameter lagu tidak lengkap' });
      return;
    }

    const cacheKey = `v8:${bitrate}:${id || `${artist}::${title}`}`;
    try {
      const entry = await resolveFullAudio(cacheKey, title, artist, durationMs, fallbackUrl, bitrate);
      const isFlacStream = entry.mimeType.toLowerCase().includes('flac');
      const formatHeader =
        isFlacStream || quality === 'flac'
          ? 'FLAC'
          : quality === 'alac'
          ? 'ALAC'
          : bitrate === 320
          ? 'MP3 320k'
          : `${bitrate}k`;
      res.setHeader('X-Svara-Audio-Source', entry.source || 'unknown');
      res.setHeader('X-Svara-Format', formatHeader);
      res.setHeader('X-Svara-Bitrate', bitrate === 999 ? 'Lossless/320kbps' : `${bitrate}kbps`);
      res.setHeader('X-Svara-Audio-Bytes', String(entry.buffer.length));
      sendBufferWithRange(req, res, entry.buffer, entry.mimeType);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat audio lengkap';
      res.status(502).json({ error: message });
    }
  });

  // High-Speed Parallel Audio Sentinel Engine (verifies full-length streams + creator vocal authenticity & auto-repairs)
  interface SentinelProbeResult {
    id: string;
    title: string;
    artist: string;
    status: 'verified' | 'repaired' | 'warning_30s';
    isFullLength: boolean;
    isOriginalArtist: boolean;
    audioSource: string;
    sizeBytes?: number;
    reason: string;
    repairedTrack?: NormalizedTrack;
  }

  const sentinelCache = new Map<string, { ts: number; data: SentinelProbeResult }>();
  const SENTINEL_CACHE_TTL_MS = 15 * 60 * 1000;

  async function findCanonicalRepairTrack(badTrack: NormalizedTrack, forceByTitle = false): Promise<NormalizedTrack | null> {
    try {
      const cleanT = cleanTitleBase(badTrack.title);
      const cleanTNorm = normalizeTextClean(cleanT);
      const isDubiousArtist =
        forceByTitle ||
        !isAuthenticStudioTrack(badTrack) ||
        KNOWN_COVER_ARTIST_RE.test(normalizeTextClean(badTrack.artist)) ||
        badTrack.durationMs < 70000;

      const searchTerm = isDubiousArtist ? cleanT : `${extractPrimaryArtist(badTrack.artist)} ${cleanT}`;
      const [idHits, usHits, hints] = await Promise.all([
        searchITunes(searchTerm, 30, 'ID'),
        searchITunes(searchTerm, 30, 'US'),
        fetchPopularityHints(cleanT),
      ]);
      const combined: NormalizedTrack[] = [];
      const seen = new Set<string>();
      for (const t of [...idHits, ...usHits]) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          combined.push(t);
        }
      }

      // If hints know the exact original creator (e.g. "Radiohead" for "Creep", "Skrillex" for "Bangarang")
      // and iTunes generic title search missed their non-acoustic studio version, query `${artist} ${cleanT}` directly
      const topCreatorHints = hints.filter(
        (h) =>
          h.titleNorm === cleanTNorm ||
          stripLeadingArticle(h.titleNorm) === stripLeadingArticle(cleanTNorm) ||
          (cleanTNorm.length >= 4 && h.titleNorm.includes(cleanTNorm))
      );
      const missingCreatorArtists: string[] = [];
      for (const h of topCreatorHints.slice(0, 2)) {
        const hasAuthenticFromCreator = combined.some(
          (t) =>
            isAuthenticStudioTrack(t) &&
            normalizeTextClean(t.artist).includes(h.artistNorm) &&
            normalizeTextClean(cleanTitleBase(t.title)).includes(cleanTNorm)
        );
        if (!hasAuthenticFromCreator && h.artistRaw && !missingCreatorArtists.includes(h.artistRaw)) {
          missingCreatorArtists.push(h.artistRaw);
        }
      }
      if (missingCreatorArtists.length > 0) {
        const targeted = await Promise.allSettled(
          missingCreatorArtists.flatMap((artistName) => [
            searchITunes(`${artistName} ${cleanT}`, 8, 'ID'),
            searchITunes(`${artistName} ${cleanT}`, 8, 'US'),
          ])
        );
        for (const res of targeted) {
          if (res.status === 'fulfilled') {
            for (const t of res.value) {
              if (!seen.has(t.id)) {
                seen.add(t.id);
                combined.push(t);
              }
            }
          }
        }
      }

      // If iTunes completely omits the #1 canonical studio creator track (e.g. Radiohead Creep, Skrillex Bangarang),
      // resolve canonical metadata + full 320kbps track directly from NetEase catalog
      if (topCreatorHints.length > 0) {
        const leadHint = topCreatorHints[0];
        const hasLeadCreator = combined.some(
          (t) =>
            isAuthenticStudioTrack(t) &&
            normalizeTextClean(t.artist).includes(leadHint.artistNorm) &&
            normalizeTextClean(cleanTitleBase(t.title)).includes(cleanTNorm)
        );
        if (!hasLeadCreator && leadHint.artistRaw) {
          const gdFallback = await buildGDStudioCanonicalTrack(cleanT, leadHint.artistRaw);
          if (gdFallback && !seen.has(gdFallback.id)) {
            seen.add(gdFallback.id);
            combined.unshift(gdFallback);
          }
        }
      }

      const ranked = scoreAndDeduplicateSearchTracks(combined, cleanT, hints, 8);
      const candidate =
        ranked.find(
          (c) =>
            c.durationMs >= 70000 &&
            isAuthenticStudioTrack(c) &&
            normalizeTextClean(cleanTitleBase(c.title)) === cleanTNorm
        ) ||
        ranked.find((c) => c.durationMs >= 70000 && isAuthenticStudioTrack(c)) ||
        ranked[0];

      return candidate && candidate.id !== badTrack.id ? candidate : candidate || null;
    } catch {
      return null;
    }
  }

  async function fastProbeTrackSentinel(track: NormalizedTrack): Promise<SentinelProbeResult> {
    const cacheKey = `v3:${track.id}:${normalizeTextClean(track.title)}:${normalizeTextClean(track.artist)}`;
    const cached = sentinelCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SENTINEL_CACHE_TTL_MS) {
      return cached.data;
    }

    const audioCacheKey = `v7:${track.id || `${track.artist}::${track.title}`}`;
    const alreadyCachedAudio = fullAudioCache.get(audioCacheKey);

    let activeTrack = track;
    let repairedTrack: NormalizedTrack | undefined;
    let isOriginalArtist = isAuthenticStudioTrack(track);
    const reasons: string[] = [];

    // Extra guard: if an obscure artist (<15k fans) has the exact title of a mega-hit, auto-repair to creator
    if (isOriginalArtist) {
      const portrait = await fetchArtistPortrait(extractPrimaryArtist(track.artist));
      if (portrait && portrait.fans < 15000) {
        const candidate = await findCanonicalRepairTrack(track, true);
        if (
          candidate &&
          normalizeTextClean(extractPrimaryArtist(candidate.artist)) !==
            normalizeTextClean(extractPrimaryArtist(track.artist))
        ) {
          const candPortrait = await fetchArtistPortrait(extractPrimaryArtist(candidate.artist));
          if (candPortrait && candPortrait.fans >= 150000) {
            isOriginalArtist = false;
            activeTrack = candidate;
            repairedTrack = candidate;
            reasons.push(`Terdeteksi cover non-artis (${track.artist}) · Diperbarui ke pencipta asli ${candidate.artist}`);
          }
        }
      }
    }

    if (!isOriginalArtist && !repairedTrack) {
      reasons.push('Terdeteksi versi non-studio/cover/durasi tidak standar');
      const replacement = await findCanonicalRepairTrack(track, true);
      if (replacement) {
        activeTrack = replacement;
        repairedTrack = replacement;
        isOriginalArtist = true;
        reasons.push(`Diperbarui otomatis ke versi asli ${replacement.artist}`);
      }
    }

    let isFullLength = false;
    let audioSource = 'preview-30s';
    let sizeBytes: number | undefined;

    if (alreadyCachedAudio && isLikelyFullLengthBytes(alreadyCachedAudio.buffer.length, activeTrack.durationMs, 192)) {
      isFullLength = alreadyCachedAudio.source !== 'fallback';
      audioSource = alreadyCachedAudio.source || 'cache';
      sizeBytes = alreadyCachedAudio.buffer.length;
    } else {
      const gdProbePromise = (async () => {
        const candidates = await findGDStudioCandidates(activeTrack.title, activeTrack.artist);
        for (const cand of candidates.slice(0, 2)) {
          try {
            if (!cand.item.id) continue;
            const urlJson = await fetchGDStudioUrlInfo(cand.source, cand.item.id);
            if (!urlJson?.url) continue;

            if (urlJson.size && isLikelyFullLengthBytes(urlJson.size, activeTrack.durationMs, urlJson.br || 320)) {
              return { ok: true, source: cand.source, size: urlJson.size };
            }
            const headRes = await fetch(urlJson.url, {
              method: 'HEAD',
              signal: AbortSignal.timeout(6000),
            });
            let cl = Number(headRes.headers.get('content-length') || 0);
            if (!headRes.ok || cl === 0) {
              const rangeRes = await fetch(urlJson.url, {
                headers: { Range: 'bytes=0-0' },
                signal: AbortSignal.timeout(6000),
              });
              const cr = rangeRes.headers.get('content-range') || '';
              const m = cr.match(/\/(\d+)$/);
              if (m?.[1]) cl = Number(m[1]);
            }
            if (isLikelyFullLengthBytes(cl, activeTrack.durationMs, urlJson.br || 320)) {
              return { ok: true, source: cand.source, size: cl };
            }
          } catch {
            // Try next candidate
          }
        }
        return null;
      })();

      const gdProbe = await gdProbePromise;
      if (gdProbe?.ok) {
        isFullLength = true;
        audioSource = `${gdProbe.source}-320kbps`;
        sizeBytes = gdProbe.size;
      } else {
        const [scOk, audiusOk] = await Promise.allSettled([
          (async () => {
            const cid = await getSoundCloudClientId(false);
            const q = `${primaryArtistName(activeTrack.artist)} ${cleanTitleBase(activeTrack.title)}`.trim();
            const r = await fetch(
              `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${cid}&limit=10`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (!r.ok) return false;
            const j = (await r.json()) as { collection?: SCTrackItem[] };
            return (j.collection || []).some(
              (item) =>
                item.policy !== 'SNIP' &&
                (item.duration ?? 0) > 65000 &&
                !NON_ORIGINAL_RE.test(normalizeClean(item.title || '')) &&
                Math.abs((item.duration || 0) - activeTrack.durationMs) <= 9500
            );
          })(),
          (async () => {
            const q = `${activeTrack.artist} ${cleanTitleBase(activeTrack.title)}`.trim();
            const r = await fetch(
              `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=Svara`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (!r.ok) return false;
            const j = (await r.json()) as { data?: { duration?: number; title?: string }[] };
            return (j.data || []).some(
              (t) =>
                (t.duration ?? 0) > 65 &&
                !NON_ORIGINAL_RE.test(normalizeClean(t.title || '')) &&
                Math.abs((t.duration || 0) * 1000 - activeTrack.durationMs) <= 6000
            );
          })(),
        ]);

        if (scOk.status === 'fulfilled' && scOk.value) {
          isFullLength = true;
          audioSource = 'soundcloud-full';
        } else if (audiusOk.status === 'fulfilled' && audiusOk.value) {
          isFullLength = true;
          audioSource = 'audius-full';
        }
      }
    }

    const status: SentinelProbeResult['status'] = repairedTrack
      ? 'repaired'
      : isFullLength && isOriginalArtist
      ? 'verified'
      : 'warning_30s';

    if (status === 'verified') {
      reasons.push('Master studio penuh & vokal artis asli terverifikasi');
    } else if (!isFullLength) {
      reasons.push('Sumber penuh belum ditemukan (berisiko preview 30 detik)');
    }

    const result: SentinelProbeResult = {
      id: track.id,
      title: activeTrack.title,
      artist: activeTrack.artist,
      status,
      isFullLength,
      isOriginalArtist,
      audioSource,
      sizeBytes,
      reason: reasons.join(' · '),
      repairedTrack,
    };

    // Only cache confirmed verified/repaired probes so transient upstream timeouts can self-heal
    if (status === 'verified' || status === 'repaired') {
      if (sentinelCache.size > 400) {
        const oldest = sentinelCache.keys().next().value;
        if (oldest) sentinelCache.delete(oldest);
      }
      sentinelCache.set(cacheKey, { ts: Date.now(), data: result });
    }
    return result;
  }

  app.post('/api/music/sentinel/scan', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const body = req.body as { tracks?: NormalizedTrack[] };
      const rawList = Array.isArray(body?.tracks) ? body.tracks : [];
      const validTracks = rawList
        .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.artist === 'string')
        .slice(0, 50);

      if (validTracks.length === 0) {
        res.json({
          results: [],
          summary: { total: 0, verified: 0, repaired: 0, previewOnly: 0, elapsedMs: 0 },
          scannedAt: Date.now(),
        });
        return;
      }

      const results = await Promise.all(validTracks.map((track) => fastProbeTrackSentinel(track)));
      const verified = results.filter((r) => r.status === 'verified').length;
      const repaired = results.filter((r) => r.status === 'repaired').length;
      const previewOnly = results.filter((r) => r.status === 'warning_30s').length;

      res.json({
        results,
        summary: {
          total: results.length,
          verified,
          repaired,
          previewOnly,
          elapsedMs: Date.now() - startedAt,
        },
        scannedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menjalankan pemindai audio';
      res.status(502).json({ error: message });
    }
  });

  // Legacy direct CORS-safe Audio Proxy (kept for backward compatibility)
  app.get('/api/music/audio', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '');
    const parsed = isAllowedMediaHost(rawUrl, 'audio');
    if (!parsed) {
      res.status(400).json({ error: 'URL audio tidak valid' });
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (req.headers.range) {
        headers['Range'] = String(req.headers.range);
      }
      const upstream = await fetch(parsed.toString(), {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).end();
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'audio/mp4';
      const contentLength = upstream.headers.get('content-length');
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);

      const arrayBuffer = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat stream audio';
      res.status(502).json({ error: message });
    }
  });

  // CORS-safe Artwork Proxy for Offline Blob Caching
  app.get('/api/music/artwork', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '');
    const parsed = isAllowedMediaHost(rawUrl, 'artwork');
    if (!parsed) {
      res.status(400).json({ error: 'URL sampul tidak valid' });
      return;
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        signal: AbortSignal.timeout(10000),
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      const arrayBuffer = await upstream.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(502).end();
    }
  });

  // Synced & Plain Lyrics Endpoint powered by LRCLIB
  interface LrcLibRecord {
    id?: number;
    trackName?: string;
    artistName?: string;
    albumName?: string;
    duration?: number;
    instrumental?: boolean;
    plainLyrics?: string | null;
    syncedLyrics?: string | null;
  }

  const lyricsCache = new Map<string, { synced: { timeSec: number; text: string }[]; plain: string; source: 'lrclib' | null }>();

  function parseLrc(lrc: string): { timeSec: number; text: string }[] {
    const lines: { timeSec: number; text: string }[] = [];
    for (const rawLine of lrc.split('\n')) {
      const matches = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
      if (matches.length === 0) continue;
      const text = rawLine.replace(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g, '').trim();
      for (const m of matches) {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const msRaw = m[3] || '0';
        const frac = parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10) / 1000;
        const timeSec = min * 60 + sec + frac;
        lines.push({ timeSec, text: text || '♪' });
      }
    }
    return lines.sort((a, b) => a.timeSec - b.timeSec);
  }

  app.get('/api/music/lyrics', async (req: Request, res: Response) => {
    const rawTitle = String(req.query.title || '').trim();
    const title = cleanTrackTitle(rawTitle);
    const artist = String(req.query.artist || '').trim();
    const baseArtist = primaryArtistName(artist);
    const durationSec = Math.round((Number(req.query.durationMs) || 0) / 1000);

    if (!title || !artist) {
      res.status(400).json({ error: 'Judul dan artis diperlukan' });
      return;
    }

    const cacheKey = `v3:${baseArtist.toLowerCase()}::${title.toLowerCase()}::${durationSec}`;
    const cached = lyricsCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      let record: LrcLibRecord | null = null;

      // 1. Precise direct lookup with candidate studio durations (exact ±1s)
      if (durationSec > 0) {
        const durationCandidates = [durationSec, durationSec - 1, durationSec + 1];
        const artistCandidates = [artist, ...(baseArtist !== artist ? [baseArtist] : [])];

        for (const art of artistCandidates) {
          for (const d of durationCandidates) {
            try {
              const directRes = await fetch(
                `https://lrclib.net/api/get?artist_name=${encodeURIComponent(art)}&track_name=${encodeURIComponent(title)}&duration=${d}`,
                {
                  headers: { 'User-Agent': 'SvaraMusic/1.0' },
                  signal: AbortSignal.timeout(4000),
                }
              );
              if (directRes.ok) {
                const fetched = (await directRes.json()) as LrcLibRecord;
                if (fetched.syncedLyrics || fetched.plainLyrics) {
                  record = fetched;
                  break;
                }
              }
            } catch {
              // Try next candidate
            }
          }
          if (record) break;
        }
      }

      // 2. Direct lookup without duration constraint (accept only if duration diff <= 4.5s)
      if (!record) {
        try {
          const directNoDurRes = await fetch(
            `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
            {
              headers: { 'User-Agent': 'SvaraMusic/1.0' },
              signal: AbortSignal.timeout(4000),
            }
          );
          if (directNoDurRes.ok) {
            const fetched = (await directNoDurRes.json()) as LrcLibRecord;
            const diff = durationSec > 0 && fetched.duration ? Math.abs(fetched.duration - durationSec) : 0;
            if (diff <= 4.5 && (fetched.syncedLyrics || fetched.plainLyrics)) {
              record = fetched;
            }
          }
        } catch {
          // Fall through to search
        }
      }

      // 3. Search endpoint with strict ranking: reject non-original covers/remixes/live and rank by closest studio duration
      if (!record) {
        const searchQueries = [
          `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`,
          `https://lrclib.net/api/search?q=${encodeURIComponent(`${baseArtist} ${title}`)}`,
        ];

        for (const url of searchQueries) {
          try {
            const searchRes = await fetch(url, {
              headers: { 'User-Agent': 'SvaraMusic/1.0' },
              signal: AbortSignal.timeout(5000),
            });
            if (searchRes.ok) {
              const list = (await searchRes.json()) as LrcLibRecord[];
              const nonOriginalRe = /\b(remix|rmx|acoustic|akustik|live|concert|konser|instrumental|karaoke|cover|parody|orchestral|restrung|sped\s*up|slowed)\b/i;
              const titleAllowsSpecial = nonOriginalRe.test(rawTitle);

              const valid = list.filter((item) => {
                if (item.instrumental) return false;
                if (!titleAllowsSpecial && nonOriginalRe.test(item.trackName || '')) return false;
                return Boolean(item.syncedLyrics || item.plainLyrics);
              });

              if (valid.length > 0) {
                valid.sort((a, b) => {
                  const aHasSync = a.syncedLyrics ? 1 : 0;
                  const bHasSync = b.syncedLyrics ? 1 : 0;
                  if (aHasSync !== bHasSync) return bHasSync - aHasSync;
                  if (durationSec > 0) {
                    const diffA = Math.abs((a.duration || 0) - durationSec);
                    const diffB = Math.abs((b.duration || 0) - durationSec);
                    return diffA - diffB;
                  }
                  return 0;
                });
                const best = valid[0];
                const diff = durationSec > 0 && best.duration ? Math.abs(best.duration - durationSec) : 0;
                if (diff <= 6 || !durationSec) {
                  record = best;
                  break;
                }
              }
            }
          } catch {
            // Try next search query
          }
        }
      }

      const synced = record?.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
      const plain = (record?.plainLyrics || '').trim();
      const payload = {
        synced,
        plain,
        source: synced.length > 0 || plain ? ('lrclib' as const) : null,
      };

      if (lyricsCache.size > 200) {
        const firstKey = lyricsCache.keys().next().value;
        if (firstKey) lyricsCache.delete(firstKey);
      }
      lyricsCache.set(cacheKey, payload);
      res.json(payload);
    } catch {
      res.json({ synced: [], plain: '', source: null });
    }
  });

  // AI Music Recommendation Endpoint (Gemini 4 Hydrogen)
  app.post('/api/ai/recommend', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: 'GEMINI_API_KEY belum terkonfigurasi di server. Periksa panel Settings > Secrets.',
      });
      return;
    }

    const { prompt, likedTracks = [], recentTracks = [] } = req.body as {
      prompt?: string;
      likedTracks?: { title: string; artist: string }[];
      recentTracks?: { title: string; artist: string }[];
    };

    const userPrompt = (prompt || '').trim() || 'Rekomendasikan lagu terbaik yang cocok dengan selera musik saya saat ini.';
    const tasteContext = [
      likedTracks.length > 0
        ? `Lagu yang disukai pengguna: ${likedTracks.slice(0, 12).map((t) => `"${t.title}" - ${t.artist}`).join(', ')}.`
        : '',
      recentTracks.length > 0
        ? `Baru saja didengarkan: ${recentTracks.slice(0, 8).map((t) => `"${t.title}" - ${t.artist}`).join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Permintaan pengguna: "${userPrompt}"\n${tasteContext}\nBuat kurasi playlist berisi 10 lagu nyata dan populer dari berbagai artis (gabungkan artis internasional dan Indonesia jika relevan dengan suasana) yang benar-benar ada di katalog musik global.`,
        config: {
          systemInstruction:
            'Kamu adalah kurator musik profesional di Svara. Berikan rekomendasi lagu nyata yang akurat (judul lagu asli dan nama artis asli) agar mudah ditemukan di katalog streaming musik. Gunakan Bahasa Indonesia yang natural, hangat, dan tidak kaku untuk judul playlist, catatan kurator, dan alasan pemilihan tiap lagu.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              playlistTitle: {
                type: Type.STRING,
                description: 'Judul playlist yang ringkas dan menggugah suasana dalam Bahasa Indonesia.',
              },
              curatorNote: {
                type: Type.STRING,
                description: 'Penjelasan singkat 1-2 kalimat mengenai nuansa dan alur playlist ini.',
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: 'Judul lagu asli.' },
                    artist: { type: Type.STRING, description: 'Nama artis utama asli.' },
                    reason: {
                      type: Type.STRING,
                      description: 'Alasan singkat 1 kalimat kenapa lagu ini cocok dengan permintaan.',
                    },
                  },
                  required: ['title', 'artist', 'reason'],
                },
              },
            },
            required: ['playlistTitle', 'curatorNote', 'recommendations'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        playlistTitle?: string;
        curatorNote?: string;
        recommendations?: { title: string; artist: string; reason: string }[];
      };

      const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      const resolvedSettled = await Promise.allSettled(
        recs.slice(0, 12).map(async (rec) => {
          const query = `${rec.title} ${rec.artist}`;
          const hits = await searchITunes(query, 5, 'ID');
          const match =
            hits.find(
              (h) =>
                h.artist.toLowerCase().includes(rec.artist.toLowerCase()) ||
                rec.artist.toLowerCase().includes(h.artist.toLowerCase())
            ) || hits[0];
          if (!match) return null;
          return {
            ...match,
            reason: rec.reason,
          };
        })
      );

      const tracks: (NormalizedTrack & { reason?: string })[] = [];
      const seenIds = new Set<string>();
      for (const item of resolvedSettled) {
        if (item.status === 'fulfilled' && item.value && !seenIds.has(item.value.id)) {
          seenIds.add(item.value.id);
          tracks.push(item.value);
        }
      }

      res.json({
        playlistTitle: parsed.playlistTitle || 'Kurasi Spesial Svara',
        curatorNote:
          parsed.curatorNote ||
          'Daftar lagu pilihan yang dirangkai khusus sesuai suasana dan riwayat mendengarmu.',
        tracks,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat rekomendasi AI';
      res.status(502).json({ error: `Kurator AI gagal merespons: ${message}` });
    }
  });

  // Personalized Automatic Recommendations Endpoint (driven by taste history & genres)
  app.post('/api/music/recommendations/personal', async (req: Request, res: Response) => {
    try {
      const { likedTracks = [], recentTracks = [], topArtists = [] } = req.body as {
        likedTracks?: { id?: string; title: string; artist: string; genre?: string }[];
        recentTracks?: { id?: string; title: string; artist: string; genre?: string }[];
        topArtists?: string[];
      };

      const artistWeights = new Map<string, number>();
      const genreWeights = new Map<string, number>();
      const excludeIds = new Set<string>();
      const excludeTitleKeys = new Set<string>();

      for (const t of likedTracks.slice(0, 20)) {
        if (!t?.artist) continue;
        const primary = extractPrimaryArtist(t.artist);
        artistWeights.set(primary, (artistWeights.get(primary) || 0) + 3);
        if (t.genre) genreWeights.set(t.genre, (genreWeights.get(t.genre) || 0) + 2);
      }

      for (const t of recentTracks.slice(0, 15)) {
        if (!t?.artist) continue;
        const primary = extractPrimaryArtist(t.artist);
        artistWeights.set(primary, (artistWeights.get(primary) || 0) + 2);
        if (t.genre) genreWeights.set(t.genre, (genreWeights.get(t.genre) || 0) + 1);
        if (t.id) excludeIds.add(t.id);
        if (t.title) excludeTitleKeys.add(normalizeTextClean(cleanTitleBase(t.title)));
      }

      for (const a of topArtists.slice(0, 5)) {
        if (a) artistWeights.set(a, (artistWeights.get(a) || 0) + 2);
      }

      const sortedArtists = Array.from(artistWeights.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);

      const sortedGenres = Array.from(genreWeights.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([g]) => g);

      const hasHistory = sortedArtists.length > 0;
      const seedArtists = hasHistory
        ? sortedArtists.slice(0, 4)
        : ['Tulus', 'The Weeknd', 'Avenged Sevenfold', 'Hindia'];

      const searchBatches = await Promise.allSettled([
        ...seedArtists.map((artist) => searchITunes(artist, 12, 'ID')),
        ...(sortedGenres[0] ? [searchITunes(sortedGenres[0], 12, 'ID')] : [searchITunes('Pop Indonesia hits', 10, 'ID')]),
      ]);

      const pool: NormalizedTrack[] = [];
      const seenIds = new Set<string>();
      const seenTitleArtist = new Set<string>();

      for (const batch of searchBatches) {
        if (batch.status !== 'fulfilled') continue;
        for (const t of batch.value) {
          const titleKey = normalizeTextClean(cleanTitleBase(t.title));
          const artistKey = normalizeTextClean(extractPrimaryArtist(t.artist));
          const combo = `${titleKey}::${artistKey}`;
          if (seenIds.has(t.id) || seenTitleArtist.has(combo)) continue;
          if (excludeIds.has(t.id) && recentTracks.length >= 6) continue;
          if (excludeTitleKeys.has(titleKey) && recentTracks.length >= 6) continue;
          seenIds.add(t.id);
          seenTitleArtist.add(combo);
          pool.push(t);
        }
      }

      // Interleave artists cleanly so one artist doesn't dominate all slots
      const byArtist = new Map<string, NormalizedTrack[]>();
      for (const t of pool) {
        const k = extractPrimaryArtist(t.artist);
        const list = byArtist.get(k) || [];
        list.push(t);
        byArtist.set(k, list);
      }
      const mixed: NormalizedTrack[] = [];
      let round = 0;
      while (mixed.length < 12 && round < 6) {
        for (const list of byArtist.values()) {
          if (list[round] && mixed.length < 12) {
            mixed.push(list[round]);
          }
        }
        round++;
      }

      // Fallback to cached discover tracks if upstream search is temporarily throttled
      if (mixed.length === 0 && discoverCache && typeof discoverCache.data === 'object' && discoverCache.data !== null) {
        const cachedData = discoverCache.data as { collections?: { tracks?: NormalizedTrack[] }[] };
        const fallbackTracks = (cachedData.collections || []).flatMap((c) => c.tracks || []);
        for (const t of fallbackTracks) {
          if (mixed.length >= 12) break;
          if (!seenIds.has(t.id) && !excludeIds.has(t.id)) {
            seenIds.add(t.id);
            mixed.push(t);
          }
        }
      }

      const enriched = mixed.map((t) => ({
        ...t,
        reason: sortedArtists.some((a) => normalizeTextClean(t.artist).includes(normalizeTextClean(a)))
          ? `Sesuai artis favoritmu · ${t.artist}`
          : sortedGenres[0]
          ? `Selaras dengan nuansa ${sortedGenres[0]}`
          : `Pilihan untukmu · ${t.genre}`,
      }));

      const leadNames = seedArtists.slice(0, 2).join(' & ');
      res.json({
        title: hasHistory ? 'Rekomendasi Personal Untukmu' : 'Pilihan Editor Untuk Memulai',
        subtitle: hasHistory
          ? `Dirangkai otomatis dari seleramu pada ${leadNames}${sortedGenres[0] ? ` · Nuansa ${sortedGenres[0]}` : ''}`
          : 'Putar atau sukai beberapa lagu agar racikan harian semakin sesuai seleramu.',
        tracks: enriched,
        generatedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat rekomendasi personal';
      res.status(502).json({ error: message });
    }
  });

  // Persistent Server Disk Vault (Survives Browser Cache Clearing even without Cloud Sign-In)
  const VAULT_DIR = path.resolve(__dirname, '.svara-vault');
  const VAULT_KEY_RE = /^[A-Za-z0-9_-]{6,64}$/;

  app.post('/api/vault/save', (req: Request, res: Response) => {
    try {
      const { syncKey, payload } = req.body as { syncKey?: string; payload?: unknown };
      const cleanKey = String(syncKey || '').trim();
      if (!VAULT_KEY_RE.test(cleanKey) || !payload || typeof payload !== 'object') {
        res.status(400).json({ error: 'Kode sinkronisasi tidak valid (minimal 6 karakter alfanumerik).' });
        return;
      }
      if (!fs.existsSync(VAULT_DIR)) {
        fs.mkdirSync(VAULT_DIR, { recursive: true });
      }
      const targetFile = path.join(VAULT_DIR, `${cleanKey}.json`);
      const serialized = JSON.stringify({
        savedAt: Date.now(),
        payload,
      });
      if (serialized.length > 900_000) {
        res.status(413).json({ error: 'Ukuran cadangan melebihi batas.' });
        return;
      }
      fs.writeFileSync(targetFile, serialized, 'utf-8');
      res.json({ ok: true, savedAt: Date.now() });
    } catch {
      res.status(500).json({ error: 'Gagal menyimpan cadangan ke brankas server.' });
    }
  });

  app.get('/api/vault/load', (req: Request, res: Response) => {
    try {
      const cleanKey = String(req.query.syncKey || '').trim();
      if (!VAULT_KEY_RE.test(cleanKey)) {
        res.status(400).json({ error: 'Kode sinkronisasi tidak valid.' });
        return;
      }
      const targetFile = path.join(VAULT_DIR, `${cleanKey}.json`);
      if (!fs.existsSync(targetFile)) {
        res.status(404).json({ error: 'Cadangan dengan kode tersebut belum ditemukan.' });
        return;
      }
      const raw = fs.readFileSync(targetFile, 'utf-8');
      const parsed = JSON.parse(raw) as { savedAt: number; payload: unknown };
      res.json({ ok: true, savedAt: parsed.savedAt, payload: parsed.payload });
    } catch {
      res.status(500).json({ error: 'Gagal memulihkan cadangan dari brankas server.' });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    // HMR is disabled in this environment; serve a clean no-WebSocket client shim
    // so CSS injection and module hot-context APIs work without failed WebSocket errors.
    app.get('/@vite/client', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay extends HTMLElement {}
`);
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Svara server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Svara server:', err);
  process.exit(1);
});
