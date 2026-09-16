/**
 * Colores curados de camiseta por club (estimación visual, no oficial).
 * Claves normalizadas; la resolución usa la misma tolerancia que sameClub.
 * Lo no curado cae en una camiseta neutra: nunca se inventa un color.
 * primary = color dominante del torso · secondary = cuello, puños y detalles.
 */
import { normalize, sameClub } from './teams.js';

const COLORS = {
  // Premier League
  liverpool: { primary: '#c8102e', secondary: '#00b2a9' },
  'manchester city': { primary: '#6cabdd', secondary: '#1c2c5b' },
  'manchester united': { primary: '#da291c', secondary: '#fbe122' },
  arsenal: { primary: '#ef0107', secondary: '#063672' },
  chelsea: { primary: '#034694', secondary: '#dba111' },
  tottenham: { primary: '#132257', secondary: '#ffffff' },
  newcastle: { primary: '#241f20', secondary: '#ffffff', pattern: 'stripes' },
  'west ham': { primary: '#7a263a', secondary: '#1bb1e7' },
  everton: { primary: '#003399', secondary: '#ffffff' },
  'aston villa': { primary: '#670e36', secondary: '#94bee0' },
  wolverhampton: { primary: '#fdb913', secondary: '#231f20' },
  bournemouth: { primary: '#da291c', secondary: '#231f20', pattern: 'stripes' },
  fulham: { primary: '#2b2b2b', secondary: '#ffffff' },
  'crystal palace': { primary: '#1b458f', secondary: '#c4122e' },
  brentford: { primary: '#e30613', secondary: '#ffffff' },
  brighton: { primary: '#0057b8', secondary: '#ffffff' },
  'nottingham forest': { primary: '#dd0000', secondary: '#ffffff' },
  leeds: { primary: '#f5f6f7', secondary: '#1d428a' },
  burnley: { primary: '#6c1d45', secondary: '#99d6ea' },
  sunderland: { primary: '#eb172b', secondary: '#ffffff' },
  // LaLiga
  barcelona: { primary: '#a50044', secondary: '#004d98' },
  'real madrid': { primary: '#f5f6f7', secondary: '#00529f', pattern: 'sash' },
  'atletico de madrid': { primary: '#cb3524', secondary: '#ffffff', pattern: 'stripes' },
  'athletic club': { primary: '#ee2523', secondary: '#ffffff' },
  sevilla: { primary: '#d8112b', secondary: '#ffffff' },
  'real betis': { primary: '#00954c', secondary: '#ffffff', pattern: 'stripes' },
  villarreal: { primary: '#ffe667', secondary: '#005187' },
  celta: { primary: '#8ac3ee', secondary: '#ffffff' },
  valencia: { primary: '#f5f6f7', secondary: '#f5a100' },
  osasuna: { primary: '#d91a21', secondary: '#0a346f' },
  alaves: { primary: '#0761af', secondary: '#ffffff' },
  girona: { primary: '#cd2534', secondary: '#ffffff' },
  getafe: { primary: '#005999', secondary: '#ffffff' },
  mallorca: { primary: '#e20613', secondary: '#2b2b2b' },
  'rayo vallecano': { primary: '#f5f6f7', secondary: '#e53027', pattern: 'sash' },
  espanyol: { primary: '#0072bc', secondary: '#ffffff' },
  elche: { primary: '#f5f6f7', secondary: '#00953b', pattern: 'stripes' },
  levante: { primary: '#004b97', secondary: '#c8102e', pattern: 'stripes' },
  malaga: { primary: '#0066b2', secondary: '#ffffff' },
  'rc deportivo la coruna': { primary: '#0060a9', secondary: '#ffffff', pattern: 'stripes' },
  'real sociedad': { primary: '#0067b1', secondary: '#ffffff', pattern: 'stripes' },
  // Libertadores
  flamengo: { primary: '#e5261f', secondary: '#231f20', pattern: 'stripes' },
  fluminense: { primary: '#7a1e33', secondary: '#006437', pattern: 'stripes' },
  corinthians: { primary: '#2b2b2b', secondary: '#ffffff' },
  palmeiras: { primary: '#006437', secondary: '#ffffff' },
  'sao paulo': { primary: '#f5f6f7', secondary: '#e4032e', pattern: 'sash' },
  cruzeiro: { primary: '#0033a0', secondary: '#ffffff' },
  mirassol: { primary: '#f7d241', secondary: '#00693e' },
  'boca juniors': { primary: '#005ca9', secondary: '#ffc400' },
  'river plate': { primary: '#f5f6f7', secondary: '#e1121c', pattern: 'sash' },
  'racing club': { primary: '#6cace4', secondary: '#ffffff' },
  estudiantes: { primary: '#e30613', secondary: '#ffffff' },
  lanus: { primary: '#9e1b32', secondary: '#ffffff' },
  platense: { primary: '#5b3a29', secondary: '#ffffff' },
  'rosario central': { primary: '#fbc90d', secondary: '#0055a5', pattern: 'stripes' },
  'velez sarsfield': { primary: '#f5f6f7', secondary: '#1d4e9e' },
  'independiente rivadavia': { primary: '#0f8a4c', secondary: '#ffffff' },
  penarol: { primary: '#f5d000', secondary: '#231f20', pattern: 'stripes' },
  nacional: { primary: '#f5f6f7', secondary: '#003da5' },
  'cerro porteno': { primary: '#e30613', secondary: '#0033a0', pattern: 'stripes' },
  libertad: { primary: '#ffd200', secondary: '#231f20', pattern: 'stripes' },
  olimpia: { primary: '#f5f6f7', secondary: '#2b2b2b' },
  bolivar: { primary: '#00a3e0', secondary: '#ffffff' },
  'always ready': { primary: '#4fa3d1', secondary: '#ffffff' },
  universitario: { primary: '#e3c97d', secondary: '#f5f6f7' },
  'sporting cristal': { primary: '#5ec3e8', secondary: '#ffffff' },
  'cusco fc': { primary: '#e4032e', secondary: '#f5f6f7' },
  'santa fe': { primary: '#e30613', secondary: '#ffffff' },
  'independiente medellin': { primary: '#e30613', secondary: '#2b2b2b' },
  tolima: { primary: '#9e1b32', secondary: '#ffffff' },
  junior: { primary: '#f5f6f7', secondary: '#e3a613', pattern: 'stripes' },
  'ldu de quito': { primary: '#f5f6f7', secondary: '#0033a0' },
  'independiente del valle': { primary: '#231f20', secondary: '#4fa3d1' },
  'barcelona sc': { primary: '#ffd100', secondary: '#231f20' },
  'universidad catolica': { primary: '#c8102e', secondary: '#4fa3d1' },
  'universidad central de venezuela': { primary: '#1b458f', secondary: '#ffffff' },
  'deportivo la guaira': { primary: '#f47b20', secondary: '#ffffff' },
  'coquimbo unido': { primary: '#f5a100', secondary: '#231f20' },
  // Champions / Europa
  'paris saint germain': { primary: '#004170', secondary: '#e30613' },
  'borussia dortmund': { primary: '#fde100', secondary: '#231f20' },
  'bayern munich': { primary: '#dc052d', secondary: '#0066b2' },
  'bayer leverkusen': { primary: '#e32219', secondary: '#231f20' },
  inter: { primary: '#0068a8', secondary: '#231f20', pattern: 'stripes' },
  napoli: { primary: '#12a0d7', secondary: '#ffffff' },
  juventus: { primary: '#f5f6f7', secondary: '#231f20', pattern: 'stripes' },
  benfica: { primary: '#e30613', secondary: '#ffffff' },
  porto: { primary: '#00428c', secondary: '#ffffff' },
  'sporting cp': { primary: '#008057', secondary: '#ffffff' },
  ajax: { primary: '#d2122e', secondary: '#ffffff' },
  psv: { primary: '#ed1c24', secondary: '#f5f6f7' },
  galatasaray: { primary: '#fdb912', secondary: '#a32638' },
};

export const NEUTRAL_KIT = { primary: '#3a453c', secondary: '#a4aea3' };

/** Camiseta de un equipo por nombre tolerante; neutral si no está curado. */
export function teamColors(name) {
  const key = normalize(name);
  if (COLORS[key]) return COLORS[key];
  for (const [candidate, value] of Object.entries(COLORS)) {
    if (sameClub(candidate, name)) return value;
  }
  return NEUTRAL_KIT;
}
