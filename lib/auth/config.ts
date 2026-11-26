export const SESSION_COOKIE = 'ns_session';
export const THEME_COOKIE = 'ns_theme';

export const sessionTtlMs = () => 1000 * 60 * 60 * 24 * 30; // 30 jours

export const THEMES = [
  {
    id: 'nuit',
    label: 'Nuit électrique',
    swatch: ['#38e1e6', '#0b1220'],
    description: 'Le thème signature : cyan sur bleu nuit.',
  },
  {
    id: 'aurore',
    label: 'Aurore',
    swatch: ['#a479ff', '#ff79c6'],
    description: 'Violet magnétique, ambiance néon.',
  },
  {
    id: 'carbone',
    label: 'Carbone',
    swatch: ['#46e6a0', '#0a0f14'],
    description: 'Contraste maximal, vert phosphore.',
  },
  {
    id: 'labo',
    label: 'Labo clair',
    swatch: ['#0e949e', '#f4f7fb'],
    description: 'Feuille de laboratoire, pour la projection en cours.',
  },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export const isTheme = (value: string): value is ThemeId =>
  THEMES.some((t) => t.id === value);

export const MIN_PASSWORD = 8;

export const AVATAR_OPTIONS = [
  'circuit',
  'bolt',
  'oscillo',
  'resistor',
  'magnet',
  'chip',
  'photon',
  'wave',
] as const;
export type AvatarId = (typeof AVATAR_OPTIONS)[number];
export const isAvatar = (value: string): value is AvatarId =>
  (AVATAR_OPTIONS as readonly string[]).includes(value);
