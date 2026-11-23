import type { AccentThemeId, Track } from '@/src/types/music';

export interface TrackAccentPalette {
  name: string;
  label: string;
  hex: string;
  rgb: string; // e.g. "16, 185, 129"
  softHex: string;
}

export const ACCENT_THEMES: TrackAccentPalette[] = [
  { name: 'emerald', label: 'Zamrud', hex: '#10B981', rgb: '16, 185, 129', softHex: '#6EE7B7' },
  { name: 'indigo', label: 'Indigo', hex: '#6366F1', rgb: '99, 102, 241', softHex: '#C7D2FE' },
  { name: 'amber', label: 'Amber', hex: '#F59E0B', rgb: '245, 158, 11', softHex: '#FDE68A' },
  { name: 'rose', label: 'Mawar', hex: '#F43F5E', rgb: '244, 63, 94', softHex: '#FECDD3' },
  { name: 'cyan', label: 'Sian', hex: '#06B6D4', rgb: '6, 182, 212', softHex: '#A5F3FC' },
  { name: 'violet', label: 'Violet', hex: '#8B5CF6', rgb: '139, 92, 246', softHex: '#DDD6FE' },
];

export function hexToRgbString(hex: string): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return '16, 185, 129';
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function getTrackAccentPalette(
  track: Track | null,
  isPlaying: boolean,
  accentTheme: AccentThemeId = 'auto',
  customAccentHex = '#10B981'
): TrackAccentPalette {
  if (accentTheme === 'custom') {
    const validHex = /^#[0-9a-fA-F]{6}$/.test(customAccentHex) ? customAccentHex : '#10B981';
    return {
      name: 'custom',
      label: 'Kustom',
      hex: validHex,
      rgb: hexToRgbString(validHex),
      softHex: validHex,
    };
  }

  if (accentTheme !== 'auto') {
    const preset = ACCENT_THEMES.find((p) => p.name === accentTheme);
    if (preset) return preset;
  }

  if (!track || !isPlaying) {
    return ACCENT_THEMES[0];
  }

  const genre = (track.genre || '').toLowerCase();
  if (genre.includes('metal') || genre.includes('rock') || genre.includes('punk')) {
    return ACCENT_THEMES[3]; // Crimson rose
  }
  if (genre.includes('r&b') || genre.includes('soul') || genre.includes('jazz') || genre.includes('indie')) {
    return ACCENT_THEMES[2]; // Warm amber gold
  }
  if (genre.includes('electronic') || genre.includes('dance') || genre.includes('edm')) {
    return ACCENT_THEMES[4]; // Electric cyan
  }

  let hash = 0;
  const seed = `${track.artist}::${track.title}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ACCENT_THEMES[hash % ACCENT_THEMES.length] || ACCENT_THEMES[0];
}
