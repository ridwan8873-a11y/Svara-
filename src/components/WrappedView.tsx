import React from 'react';
import {
  Calendar,
  Clock,
  Disc3,
  Download,
  Flame,
  Music2,
  Play,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { TrackRow } from '@/src/components/TrackRow';
import { usePlayer } from '@/src/context/PlayerContext';
import type { Track } from '@/src/types/music';

interface WrappedViewProps {
  onArtistClick: (artistName: string) => void;
  onAlbumClick?: (albumTitle: string, artistName: string) => void;
  onAddToPlaylist: (track: Track) => void;
  onNavigateExplore: () => void;
}

export const WrappedView: React.FC<WrappedViewProps> = ({
  onArtistClick,
  onAlbumClick,
  onAddToPlaylist,
  onNavigateExplore,
}) => {
  const {
    weeklyWrapped,
    evaluatedStreak,
    streakState,
    playTrackList,
    downloadPlaylist,
  } = usePlayer();

  const maxDayMinutes = Math.max(
    1,
    ...weeklyWrapped.dailyBreakdown.map((d) => d.minutes)
  );

  const activeDatesSet = new Set(streakState.activeDates || []);

  const formatMinutesText = (minutes: number) => {
    if (minutes >= 60) {
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hrs} jam ${mins} mnt`;
    }
    return `${minutes} menit`;
  };

  return (
    <div className="space-y-8 pb-12 svara-page-enter">
      {/* Hero Banner: Streak Api & Weekly Wrapped (Dark photographic backdrop keeps crisp white foreground) */}
      <section className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/[0.08] shadow-2xl bg-[#09090B]">
        <img
          src="/src/assets/images/svara_wrapped_backdrop_1795430063843.jpg"
          alt="Latar prisma kaca Svara Wrapped"
          className="absolute inset-0 w-full h-full object-cover opacity-55"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#09090B]/95 via-[#09090B]/85 to-[#09090B]/65"
        />

        <div className="relative p-6 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Sparkles size={13} />
              <span>Kilas Balik 1 Minggu · {weeklyWrapped.windowStartKey} s/d {weeklyWrapped.windowEndKey}</span>
            </p>
            <h1 className="font-display text-2xl sm:text-4xl font-bold text-white mt-2 leading-tight [text-wrap:balance]">
              {weeklyWrapped.vibeTitle}
            </h1>
            <p className="text-sm text-zinc-300 mt-2.5 max-w-xl leading-relaxed">
              {weeklyWrapped.vibeDescription}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {weeklyWrapped.mixTracks.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => void playTrackList(weeklyWrapped.mixTracks, 0)}
                    className="svara-press flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm shadow-lg cursor-pointer"
                  >
                    <Play size={16} className="fill-zinc-950" />
                    <span>Putar Mix Mingguan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadPlaylist(weeklyWrapped.mixTracks)}
                    className="svara-press flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 text-zinc-100 font-medium text-sm cursor-pointer"
                  >
                    <Download size={15} />
                    <span>Unduh Mix Offline</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onNavigateExplore}
                  className="svara-press flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm shadow-lg cursor-pointer"
                >
                  <Play size={16} className="fill-zinc-950" />
                  <span>Mulai Putar Musik</span>
                </button>
              )}
            </div>
          </div>

          {/* Streak Api Card */}
          <div
            className={`rounded-2xl p-5 border transition-colors backdrop-blur-md ${
              evaluatedStreak.isLitToday
                ? 'bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-zinc-950/90 border-amber-400/40 shadow-[0_0_30px_rgba(245,158,11,0.18)]'
                : evaluatedStreak.isExtinguished
                ? 'bg-zinc-950/85 border-rose-500/30'
                : 'bg-zinc-950/85 border-white/10'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Api Streak Harian
                </p>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span
                    className={`font-display text-3xl sm:text-4xl font-bold tabular-nums ${
                      evaluatedStreak.isLitToday
                        ? 'text-amber-300'
                        : evaluatedStreak.isExtinguished
                        ? 'text-zinc-400'
                        : 'text-white'
                    }`}
                  >
                    {evaluatedStreak.isExtinguished
                      ? 'Padam'
                      : `${evaluatedStreak.displayStreak} Hari`}
                  </span>
                  {evaluatedStreak.longestStreak > 0 && (
                    <span className="text-xs text-zinc-400 font-mono tabular-nums">
                      · Rekor {evaluatedStreak.longestStreak}h
                    </span>
                  )}
                </div>
              </div>

              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                  evaluatedStreak.isLitToday
                    ? 'bg-amber-500/25 border-amber-400/50 text-amber-400'
                    : evaluatedStreak.status === 'pending_today'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300/80'
                    : 'bg-zinc-900 border-white/10 text-zinc-500'
                }`}
              >
                <Flame
                  size={24}
                  className={evaluatedStreak.isLitToday ? 'fill-amber-400' : ''}
                />
              </div>
            </div>

            <p className="text-xs text-zinc-300 mt-3 leading-relaxed">
              {evaluatedStreak.isLitToday
                ? 'Api menyala hari ini! Terus buka Svara dan putar musik besok agar streak terus bertambah.'
                : evaluatedStreak.status === 'pending_today'
                ? `Putar satu lagu hari ini untuk menyalakan api dan menaikkan streak menjadi ${evaluatedStreak.displayStreak + 1} hari!`
                : evaluatedStreak.isExtinguished
                ? 'Kamu sempat melewatkan hari tanpa memutar musik sehingga api padam. Putar lagu hari ini untuk menyalakan kembali dari 1 hari.'
                : 'Putar lagu pertamamu hari ini untuk menyalakan api streak hari ke-1!'}
            </p>

            {/* 7-day flame dots */}
            <div className="grid grid-cols-7 gap-1.5 mt-4 pt-3.5 border-t border-white/10">
              {weeklyWrapped.dailyBreakdown.map((day) => {
                const lit = activeDatesSet.has(day.dateKey);
                return (
                  <div
                    key={day.dateKey}
                    className="flex flex-col items-center gap-1"
                    title={`${day.dateKey}: ${day.minutes} menit`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center border text-[11px] transition-colors ${
                        lit
                          ? 'bg-amber-500/25 border-amber-400/60 text-amber-300'
                          : day.isToday
                          ? 'bg-zinc-900 border-white/25 text-zinc-400'
                          : 'bg-zinc-900/60 border-white/[0.06] text-zinc-600'
                      }`}
                    >
                      <Flame size={13} className={lit ? 'fill-amber-400' : ''} />
                    </div>
                    <span
                      className={`text-[10px] font-medium ${
                        day.isToday ? 'text-white' : 'text-zinc-500'
                      }`}
                    >
                      {day.dayLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 4 Key Weekly Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="svara-card rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Waktu Mendengar</span>
            <Clock size={15} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mt-2 tabular-nums">
            {formatMinutesText(weeklyWrapped.totalMinutes)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">Akumulasi 7 hari terakhir</p>
        </div>

        <div className="svara-card rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Lagu Diputar</span>
            <Music2 size={15} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mt-2 tabular-nums">
            {weeklyWrapped.totalPlays} kali
          </p>
          <p className="text-[11px] text-zinc-500 mt-1 tabular-nums">
            {weeklyWrapped.uniqueTracksCount} judul berbeda
          </p>
        </div>

        <div className="svara-card rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Hari Aktif</span>
            <Calendar size={15} className="text-amber-600 dark:text-amber-400" />
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mt-2 tabular-nums">
            {weeklyWrapped.activeDaysCount} / 7 hari
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">Konsistensi mingguan</p>
        </div>

        <div className="svara-card rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400 text-xs">
            <span>Jam Paling Aktif</span>
            <Trophy size={15} className="text-rose-600 dark:text-rose-400" />
          </div>
          <p className="font-display text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mt-2">
            {weeklyWrapped.peakPeriodLabel}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            {weeklyWrapped.topGenres[0]?.genre || 'Belum ada genre dominan'}
          </p>
        </div>
      </section>

      {/* 7-Day Activity Bar Chart & Top Genres */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        <section className="svara-card rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white">
                Aktivitas 7 Hari Terakhir
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Durasi pemutaran musik harian dalam menit
              </p>
            </div>
            <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 tabular-nums font-medium">
              {weeklyWrapped.totalMinutes} mnt total
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2.5 items-end h-44 pt-4">
            {weeklyWrapped.dailyBreakdown.map((day) => {
              const heightPct = day.minutes > 0 ? Math.max(10, Math.round((day.minutes / maxDayMinutes) * 100)) : 4;
              return (
                <div key={day.dateKey} className="flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 opacity-85 tabular-nums">
                    {day.minutes > 0 ? `${day.minutes}m` : '0'}
                  </span>
                  <div className="w-full max-w-[38px] flex-1 flex items-end bg-zinc-100 dark:bg-zinc-900/80 rounded-xl p-1 border border-zinc-200 dark:border-white/[0.05]">
                    <div
                      className={`w-full rounded-lg transition-all duration-300 ${
                        day.isToday
                          ? 'bg-gradient-to-t from-emerald-500 to-emerald-400'
                          : day.minutes > 0
                          ? 'bg-gradient-to-t from-emerald-500/75 to-teal-400/80'
                          : 'bg-zinc-200 dark:bg-zinc-800/70'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={`text-[11px] font-medium ${day.isToday ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-zinc-500 dark:text-zinc-400'}`}>
                    {day.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top Genres & Artists Spotlight */}
        <section className="svara-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div>
            <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white">
              Artis Teratas Minggu Ini
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Musisi yang paling sering menemani harimu
            </p>

            {weeklyWrapped.topArtists.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">
                Belum ada riwayat putar minggu ini.
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {weeklyWrapped.topArtists.map((artist, idx) => (
                  <button
                    key={artist.name}
                    type="button"
                    onClick={() => onArtistClick(artist.name)}
                    className="svara-press w-full flex items-center gap-3 p-2 rounded-xl bg-zinc-100/80 dark:bg-zinc-900/60 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/90 border border-zinc-200 dark:border-white/[0.06] hover:border-emerald-500/40 text-left cursor-pointer"
                  >
                    <span className="font-mono text-xs text-zinc-500 w-5 text-center shrink-0">
                      #{idx + 1}
                    </span>
                    <TrackArtwork
                      src={artist.artworkUrl}
                      alt={artist.name}
                      className="w-10 h-10 rounded-full border border-zinc-200 dark:border-white/10"
                      iconSize={18}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{artist.name}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {artist.plays} putaran · {Math.max(1, Math.round(artist.seconds / 60))} mnt
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {weeklyWrapped.topGenres.length > 0 && (
            <div className="pt-4 border-t border-zinc-200 dark:border-white/[0.07] space-y-2">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Komposisi Genre</p>
              {weeklyWrapped.topGenres.map((g) => (
                <div key={g.genre} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-800 dark:text-zinc-200 truncate">{g.genre}</span>
                    <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">{g.percentage}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-900 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                      style={{ width: `${g.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Top 5 Tracks of the Week */}
      <section className="svara-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Disc3 size={20} />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white">
                Top 5 Lagu Minggu Ini
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Lagu yang paling sering kamu putar selama 7 hari terakhir
              </p>
            </div>
          </div>

          {weeklyWrapped.mixTracks.length > 0 && (
            <button
              type="button"
              onClick={() => void playTrackList(weeklyWrapped.mixTracks, 0)}
              className="svara-press flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold cursor-pointer self-start sm:self-auto shadow-sm"
            >
              <Play size={14} className="fill-zinc-950" />
              <span>Putar Top 5</span>
            </button>
          )}
        </div>

        {weeklyWrapped.topTracks.length === 0 ? (
          <p className="py-10 text-sm text-zinc-500 dark:text-zinc-400 text-center">
            Putar musik favoritmu untuk mengisi daftar lagu teratas mingguan di sini.
          </p>
        ) : (
          <div className="mt-3 space-y-0.5">
            {weeklyWrapped.topTracks.map((item, idx) => (
              <TrackRow
                key={item.track.id}
                track={item.track}
                index={idx}
                contextList={weeklyWrapped.mixTracks}
                subtitleOverride={`${item.plays}× diputar · ${Math.max(1, Math.round(item.seconds / 60))} menit`}
                onArtistClick={onArtistClick}
                onAlbumClick={onAlbumClick}
                onAddToPlaylistClick={onAddToPlaylist}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
