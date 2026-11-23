import type {
  DailyListeningLog,
  StreakState,
  Track,
  WeeklyWrappedSummary,
} from '@/src/types/music';

export const DEFAULT_STREAK_STATE: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
  activeDates: [],
};

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftLocalDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function diffCalendarDays(fromDateKey: string, toDateKey: string): number {
  const [y1, m1, d1] = fromDateKey.split('-').map(Number);
  const [y2, m2, d2] = toDateKey.split('-').map(Number);
  const utc1 = Date.UTC(y1, (m1 || 1) - 1, d1 || 1);
  const utc2 = Date.UTC(y2, (m2 || 1) - 1, d2 || 1);
  return Math.round((utc2 - utc1) / 86_400_000);
}

export interface EvaluatedStreak {
  status: 'lit_today' | 'pending_today' | 'extinguished' | 'inactive';
  displayStreak: number;
  longestStreak: number;
  isLitToday: boolean;
  isExtinguished: boolean;
  missedDays: number;
}

/**
 * Evaluates current streak status without mutating stored history:
 * - If played today -> lit_today (currentStreak)
 * - If played yesterday -> pending_today (still at yesterday's streak, play music today to add +1)
 * - If missed >= 1 full calendar day -> extinguished ("padam", next play resets back to 1!)
 */
export function evaluateStreakStatus(
  state: StreakState,
  todayKey: string = getLocalDateKey()
): EvaluatedStreak {
  if (!state.lastActiveDate || state.currentStreak <= 0) {
    return {
      status: 'inactive',
      displayStreak: 0,
      longestStreak: state.longestStreak || 0,
      isLitToday: false,
      isExtinguished: false,
      missedDays: 0,
    };
  }

  const gap = diffCalendarDays(state.lastActiveDate, todayKey);
  if (gap <= 0) {
    return {
      status: 'lit_today',
      displayStreak: state.currentStreak,
      longestStreak: Math.max(state.longestStreak, state.currentStreak),
      isLitToday: true,
      isExtinguished: false,
      missedDays: 0,
    };
  }

  if (gap === 1) {
    return {
      status: 'pending_today',
      displayStreak: state.currentStreak,
      longestStreak: Math.max(state.longestStreak, state.currentStreak),
      isLitToday: false,
      isExtinguished: false,
      missedDays: 0,
    };
  }

  return {
    status: 'extinguished',
    displayStreak: 0,
    longestStreak: state.longestStreak || state.currentStreak,
    isLitToday: false,
    isExtinguished: true,
    missedDays: gap - 1,
  };
}

/**
 * Called whenever the user opens Svara AND plays music:
 * - Same day -> maintains current streak
 * - Consecutive day -> currentStreak + 1 (1 hari -> 2 hari -> 3 hari...)
 * - After >= 1 missed day -> extinguished flame reignites back at 1!
 */
export function recordMusicPlayedForStreak(
  state: StreakState,
  todayKey: string = getLocalDateKey()
): { nextState: StreakState; event: 'started' | 'incremented' | 'reignited' | 'unchanged' } {
  const activeSet = new Set(state.activeDates || []);
  activeSet.add(todayKey);
  const sortedDates = Array.from(activeSet).sort().slice(-30);

  if (!state.lastActiveDate || state.currentStreak <= 0) {
    const nextState: StreakState = {
      currentStreak: 1,
      longestStreak: Math.max(1, state.longestStreak || 0),
      lastActiveDate: todayKey,
      activeDates: sortedDates,
    };
    return { nextState, event: 'started' };
  }

  const gap = diffCalendarDays(state.lastActiveDate, todayKey);
  if (gap <= 0) {
    if (state.activeDates.includes(todayKey)) {
      return { nextState: state, event: 'unchanged' };
    }
    return {
      nextState: { ...state, activeDates: sortedDates },
      event: 'unchanged',
    };
  }

  if (gap === 1) {
    const nextCount = state.currentStreak + 1;
    return {
      nextState: {
        currentStreak: nextCount,
        longestStreak: Math.max(state.longestStreak || 0, nextCount),
        lastActiveDate: todayKey,
        activeDates: sortedDates,
      },
      event: 'incremented',
    };
  }

  // Gap >= 2 calendar days: flame was extinguished and resets back to 1
  return {
    nextState: {
      currentStreak: 1,
      longestStreak: Math.max(state.longestStreak || 0, 1),
      lastActiveDate: todayKey,
      activeDates: sortedDates,
    },
    event: 'reignited',
  };
}

function emptyDailyLog(dateKey: string): DailyListeningLog {
  return {
    dateKey,
    secondsListened: 0,
    playsCount: 0,
    tracks: {},
    artistSeconds: {},
    genreSeconds: {},
    hourSeconds: {},
  };
}

export function pruneOldDailyLogs(
  logs: Record<string, DailyListeningLog>,
  todayKey: string = getLocalDateKey(),
  keepDays = 14
): Record<string, DailyListeningLog> {
  const cutoff = shiftLocalDateKey(todayKey, -(keepDays - 1));
  const out: Record<string, DailyListeningLog> = {};
  for (const [k, v] of Object.entries(logs)) {
    if (k >= cutoff && v && typeof v === 'object') {
      out[k] = v;
    }
  }
  return out;
}

export function addTrackPlayToLogs(
  logs: Record<string, DailyListeningLog>,
  track: Track,
  todayKey: string = getLocalDateKey()
): Record<string, DailyListeningLog> {
  const cur = logs[todayKey] ? { ...logs[todayKey] } : emptyDailyLog(todayKey);
  const existingTrack = cur.tracks[track.id];
  const primaryArtist = track.artist.split(/,|&|\bfeat\.?\b/i)[0].trim() || track.artist;

  const nextTracks = {
    ...cur.tracks,
    [track.id]: {
      track,
      plays: (existingTrack?.plays || 0) + 1,
      seconds: existingTrack?.seconds || 0,
    },
  };

  const existingArtist = cur.artistSeconds[primaryArtist];
  const nextArtists = {
    ...cur.artistSeconds,
    [primaryArtist]: {
      name: primaryArtist,
      plays: (existingArtist?.plays || 0) + 1,
      seconds: existingArtist?.seconds || 0,
      artworkUrl: existingArtist?.artworkUrl || track.artworkUrl,
    },
  };

  return pruneOldDailyLogs(
    {
      ...logs,
      [todayKey]: {
        ...cur,
        playsCount: (cur.playsCount || 0) + 1,
        tracks: nextTracks,
        artistSeconds: nextArtists,
      },
    },
    todayKey
  );
}

export function addListeningSecondsToLogs(
  logs: Record<string, DailyListeningLog>,
  track: Track,
  addedSeconds: number,
  now: Date = new Date()
): Record<string, DailyListeningLog> {
  if (!Number.isFinite(addedSeconds) || addedSeconds <= 0) return logs;
  const todayKey = getLocalDateKey(now);
  const cur = logs[todayKey] ? { ...logs[todayKey] } : emptyDailyLog(todayKey);
  const primaryArtist = track.artist.split(/,|&|\bfeat\.?\b/i)[0].trim() || track.artist;
  const genre = (track.genre || 'Musik').trim() || 'Musik';
  const hourKey = String(now.getHours());

  const existingTrack = cur.tracks[track.id];
  const nextTracks = {
    ...cur.tracks,
    [track.id]: {
      track,
      plays: existingTrack?.plays || 1,
      seconds: (existingTrack?.seconds || 0) + addedSeconds,
    },
  };

  const existingArtist = cur.artistSeconds[primaryArtist];
  const nextArtists = {
    ...cur.artistSeconds,
    [primaryArtist]: {
      name: primaryArtist,
      plays: existingArtist?.plays || 1,
      seconds: (existingArtist?.seconds || 0) + addedSeconds,
      artworkUrl: existingArtist?.artworkUrl || track.artworkUrl,
    },
  };

  return pruneOldDailyLogs(
    {
      ...logs,
      [todayKey]: {
        ...cur,
        secondsListened: (cur.secondsListened || 0) + addedSeconds,
        tracks: nextTracks,
        artistSeconds: nextArtists,
        genreSeconds: {
          ...cur.genreSeconds,
          [genre]: (cur.genreSeconds?.[genre] || 0) + addedSeconds,
        },
        hourSeconds: {
          ...cur.hourSeconds,
          [hourKey]: (cur.hourSeconds?.[hourKey] || 0) + addedSeconds,
        },
      },
    },
    todayKey
  );
}

const SHORT_WEEKDAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function getShortDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return SHORT_WEEKDAYS_ID[dt.getDay()] || dateKey.slice(5);
}

export function buildWeeklyWrappedSummary(
  logs: Record<string, DailyListeningLog>,
  todayKey: string = getLocalDateKey()
): WeeklyWrappedSummary {
  const windowKeys: string[] = [];
  for (let offset = -6; offset <= 0; offset++) {
    windowKeys.push(shiftLocalDateKey(todayKey, offset));
  }

  let totalSeconds = 0;
  let totalPlays = 0;
  let activeDaysCount = 0;
  const trackMap = new Map<string, { track: Track; plays: number; seconds: number }>();
  const artistMap = new Map<string, { name: string; plays: number; seconds: number; artworkUrl?: string }>();
  const genreMap = new Map<string, number>();
  const periodTotals = { pagi: 0, siang: 0, sore: 0, malam: 0 };

  const dailyBreakdown = windowKeys.map((key) => {
    const log = logs[key];
    const sec = log?.secondsListened || 0;
    const plays = log?.playsCount || 0;
    if (sec > 0 || plays > 0) activeDaysCount++;
    totalSeconds += sec;
    totalPlays += plays;

    if (log) {
      for (const [tid, tStat] of Object.entries(log.tracks || {})) {
        const prev = trackMap.get(tid);
        if (prev) {
          prev.plays += tStat.plays;
          prev.seconds += tStat.seconds;
        } else {
          trackMap.set(tid, { ...tStat });
        }
      }
      for (const [aname, aStat] of Object.entries(log.artistSeconds || {})) {
        const prev = artistMap.get(aname);
        if (prev) {
          prev.plays += aStat.plays;
          prev.seconds += aStat.seconds;
          if (!prev.artworkUrl && aStat.artworkUrl) prev.artworkUrl = aStat.artworkUrl;
        } else {
          artistMap.set(aname, { ...aStat });
        }
      }
      for (const [gname, gSec] of Object.entries(log.genreSeconds || {})) {
        genreMap.set(gname, (genreMap.get(gname) || 0) + gSec);
      }
      for (const [hrStr, hSec] of Object.entries(log.hourSeconds || {})) {
        const hr = Number(hrStr);
        if (hr >= 5 && hr < 11) periodTotals.pagi += hSec;
        else if (hr >= 11 && hr < 15) periodTotals.siang += hSec;
        else if (hr >= 15 && hr < 19) periodTotals.sore += hSec;
        else periodTotals.malam += hSec;
      }
    }

    return {
      dateKey: key,
      dayLabel: getShortDayLabel(key),
      minutes: Math.round(sec / 60),
      plays,
      isToday: key === todayKey,
    };
  });

  const topTracks = Array.from(trackMap.values())
    .sort((a, b) => b.seconds + b.plays * 35 - (a.seconds + a.plays * 35))
    .slice(0, 5);

  const topArtists = Array.from(artistMap.values())
    .sort((a, b) => b.seconds + b.plays * 35 - (a.seconds + a.plays * 35))
    .slice(0, 5);

  const totalGenreSec = Array.from(genreMap.values()).reduce((a, b) => a + b, 0);
  const topGenres = Array.from(genreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre, seconds]) => ({
      genre,
      seconds,
      percentage: totalGenreSec > 0 ? Math.max(1, Math.round((seconds / totalGenreSec) * 100)) : 0,
    }));

  const sortedPeriods = Object.entries(periodTotals).sort((a, b) => b[1] - a[1]);
  const peakKey = sortedPeriods[0]?.[0] || 'malam';
  const peakPeriodLabel =
    peakKey === 'pagi'
      ? 'Pagi Hari'
      : peakKey === 'siang'
      ? 'Siang Hari'
      : peakKey === 'sore'
      ? 'Senja & Sore'
      : 'Larut Malam';

  const leadGenre = topGenres[0]?.genre || 'Eksploratif';
  let vibeTitle = 'Pendengar Baru Svara';
  let vibeDescription = 'Putar musik favoritmu sepanjang minggu ini untuk membuka profil suara personalmu.';

  if (totalPlays > 0) {
    if (peakKey === 'malam') {
      vibeTitle = 'Kurator Larut Malam';
      vibeDescription = `Kamu paling banyak menikmati alunan ${leadGenre} di jam tenang malam hari.`;
    } else if (peakKey === 'pagi') {
      vibeTitle = 'Energi Pagi Studio';
      vibeDescription = `Ritme ${leadGenre} menemani langkah awalmu hampir setiap pagi minggu ini.`;
    } else if (peakKey === 'sore') {
      vibeTitle = 'Penikmat Senja';
      vibeDescription = `Perpaduan ${leadGenre} menjadi teman terbaikmu di penghujung hari.`;
    } else {
      vibeTitle = 'Fokus Produktif Siang';
      vibeDescription = `Nada ${leadGenre} menjaga konsistensi fokus dan energimu sepanjang siang.`;
    }
  }

  return {
    windowStartKey: windowKeys[0],
    windowEndKey: windowKeys[windowKeys.length - 1],
    totalSeconds,
    totalMinutes: Math.max(totalPlays > 0 && totalSeconds > 15 ? 1 : 0, Math.round(totalSeconds / 60)),
    totalPlays,
    uniqueTracksCount: trackMap.size,
    activeDaysCount,
    topTracks,
    topArtists,
    topGenres,
    dailyBreakdown,
    peakPeriodLabel,
    vibeTitle,
    vibeDescription,
    mixTracks: topTracks.map((item) => item.track),
  };
}
