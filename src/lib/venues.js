/**
 * Catálogo curado de sedes para el mapa de la portada.
 * Cada entrada apunta al estadio de localía del club: ciudad (clave de agrupación
 * del pin), país, zona horaria IANA, coordenadas equirectangulares y capacidad
 * declarada. Lo no verificado queda en null y la interfaz lo omite; los
 * encuentros sin sede resuelta se listan debajo del mapa, nunca se inventan.
 * Coordenadas aproximadas a ±0.01°; capacidades de fuentes públicas.
 * El orden del arreglo es el orden de resolución de alias (primero exactos).
 */
import { normalize } from './teams.js';

export const CLUBS = [
  // Premier League
  { aliases: ['brentford', 'brentford fc'], city: 'Londres', country: 'Inglaterra', stadium: 'Gtech Community Stadium', tz: 'Europe/London', lat: 51.5074, lng: -0.2920, capacity: 17250 },
  { aliases: ['brighton', 'brighton & hove albion', 'brighton hove albion'], city: 'Brighton', country: 'Inglaterra', stadium: 'American Express Stadium', tz: 'Europe/London', lat: 50.8609, lng: -0.0801, capacity: 31876 },
  { aliases: ['everton', 'everton fc'], city: 'Liverpool', country: 'Inglaterra', stadium: 'Hill Dickinson Stadium', tz: 'Europe/London', lat: 53.2094, lng: -2.9946, capacity: 52888 },
  { aliases: ['leeds', 'leeds united', 'leeds united fc'], city: 'Leeds', country: 'Inglaterra', stadium: 'Elland Road', tz: 'Europe/London', lat: 53.7999, lng: -1.7732, capacity: 37890 },
  { aliases: ['newcastle', 'newcastle united', 'newcastle united fc'], city: 'Newcastle upon Tyne', country: 'Inglaterra', stadium: "St. James' Park", tz: 'Europe/London', lat: 54.9756, lng: -1.6227, capacity: 52305 },
  { aliases: ['nottingham forest'], city: 'Nottingham', country: 'Inglaterra', stadium: 'The City Ground', tz: 'Europe/London', lat: 52.9403, lng: -1.2038, capacity: 30445 },
  { aliases: ['tottenham', 'tottenham hotspur', 'tottenham hotspur fc'], city: 'Londres', country: 'Inglaterra', stadium: 'Tottenham Hotspur Stadium', tz: 'Europe/London', lat: 51.6043, lng: -0.0662, capacity: 62850 },
  { aliases: ['arsenal', 'arsenal fc'], city: 'Londres', country: 'Inglaterra', stadium: 'Emirates Stadium', tz: 'Europe/London', lat: 51.5549, lng: -0.1084, capacity: 60704 },
  { aliases: ['liverpool', 'liverpool fc'], city: 'Liverpool', country: 'Inglaterra', stadium: 'Anfield', tz: 'Europe/London', lat: 53.4308, lng: -2.9608, capacity: 61276 },
  { aliases: ['manchester city'], city: 'Mánchester', country: 'Inglaterra', stadium: 'Etihad Stadium', tz: 'Europe/London', lat: 53.4832, lng: -2.2004, capacity: 53400 },
  { aliases: ['manchester united'], city: 'Mánchester', country: 'Inglaterra', stadium: 'Old Trafford', tz: 'Europe/London', lat: 53.4631, lng: -2.2913, capacity: 74310 },
  { aliases: ['chelsea', 'chelsea fc'], city: 'Londres', country: 'Inglaterra', stadium: 'Stamford Bridge', tz: 'Europe/London', lat: 51.4817, lng: -0.1910, capacity: 40341 },
  { aliases: ['aston villa', 'aston villa fc'], city: 'Birmingham', country: 'Inglaterra', stadium: 'Villa Park', tz: 'Europe/London', lat: 52.5092, lng: -1.8847, capacity: 42640 },
  { aliases: ['west ham', 'west ham united', 'west ham united fc'], city: 'Londres', country: 'Inglaterra', stadium: 'London Stadium', tz: 'Europe/London', lat: 51.5322, lng: -0.0167, capacity: 62500 },
  { aliases: ['wolverhampton', 'wolverhampton wanderers', 'wolves'], city: 'Wolverhampton', country: 'Inglaterra', stadium: 'Molineux Stadium', tz: 'Europe/London', lat: 52.5906, lng: -2.1303, capacity: 32050 },
  { aliases: ['bournemouth', 'afc bournemouth'], city: 'Bournemouth', country: 'Inglaterra', stadium: 'Vitality Stadium', tz: 'Europe/London', lat: 50.7364, lng: -1.8383, capacity: 11364 },
  { aliases: ['fulham', 'fulham fc'], city: 'Londres', country: 'Inglaterra', stadium: 'Craven Cottage', tz: 'Europe/London', lat: 51.4751, lng: -0.2216, capacity: 29589 },
  { aliases: ['crystal palace', 'crystal palace fc'], city: 'Londres', country: 'Inglaterra', stadium: 'Selhurst Park', tz: 'Europe/London', lat: 51.3983, lng: -0.0855, capacity: 25486 },
  { aliases: ['burnley', 'burnley fc'], city: 'Burnley', country: 'Inglaterra', stadium: 'Turf Moor', tz: 'Europe/London', lat: 53.7890, lng: -2.2596, capacity: 21944 },
  { aliases: ['sunderland', 'sunderland afc'], city: 'Sunderland', country: 'Inglaterra', stadium: 'Stadium of Light', tz: 'Europe/London', lat: 54.9070, lng: -1.3890, capacity: 49000 },
  // LaLiga
  { aliases: ['barcelona', 'fc barcelona'], city: 'Barcelona', country: 'España', stadium: 'Camp Nou', tz: 'Europe/Madrid', lat: 41.3809, lng: 2.1228, capacity: null },
  { aliases: ['real madrid', 'real madrid cf'], city: 'Madrid', country: 'España', stadium: 'Santiago Bernabéu', tz: 'Europe/Madrid', lat: 40.4531, lng: -3.6884, capacity: 83186 },
  { aliases: ['atletico de madrid', 'club atletico de madrid', 'atletico madrid'], city: 'Madrid', country: 'España', stadium: 'Riyadh Air Metropolitano', tz: 'Europe/Madrid', lat: 40.4319, lng: -3.6990, capacity: 70460 },
  { aliases: ['athletic club', 'athletic bilbao'], city: 'Bilbao', country: 'España', stadium: 'San Mamés', tz: 'Europe/Madrid', lat: 43.2640, lng: -2.9493, capacity: 53289 },
  { aliases: ['sevilla', 'sevilla fc'], city: 'Sevilla', country: 'España', stadium: 'Ramón Sánchez-Pizjuán', tz: 'Europe/Madrid', lat: 37.3835, lng: -5.9707, capacity: 43883 },
  { aliases: ['real betis', 'real betis balompie', 'real betis balompié'], city: 'Sevilla', country: 'España', stadium: 'Benito Villamarín', tz: 'Europe/Madrid', lat: 37.3542, lng: -5.9815, capacity: 60721 },
  { aliases: ['villarreal', 'villarreal cf'], city: 'Vila-real', country: 'España', stadium: 'Estadio de la Cerámica', tz: 'Europe/Madrid', lat: 39.9438, lng: -0.1098, capacity: 23000 },
  { aliases: ['celta', 'rc celta de vigo', 'real celta'], city: 'Vigo', country: 'España', stadium: 'Abanca Balaídos', tz: 'Europe/Madrid', lat: 42.2118, lng: -8.7377, capacity: 29000 },
  { aliases: ['valencia', 'valencia cf'], city: 'Valencia', country: 'España', stadium: 'Mestalla', tz: 'Europe/Madrid', lat: 39.4749, lng: -0.3589, capacity: 49430 },
  { aliases: ['osasuna', 'ca osasuna'], city: 'Pamplona', country: 'España', stadium: 'El Sadar', tz: 'Europe/Madrid', lat: 42.7997, lng: -1.6237, capacity: 23576 },
  { aliases: ['alaves', 'deportivo alaves', 'deportivo alavés'], city: 'Vitoria-Gasteiz', country: 'España', stadium: 'Mendizorroza', tz: 'Europe/Madrid', lat: 42.8461, lng: -2.6778, capacity: 19840 },
  { aliases: ['girona', 'girona fc'], city: 'Girona', country: 'España', stadium: 'Montilivi', tz: 'Europe/Madrid', lat: 41.9663, lng: 2.8280, capacity: 14624 },
  { aliases: ['getafe', 'getafe cf'], city: 'Getafe', country: 'España', stadium: 'Coliseum', tz: 'Europe/Madrid', lat: 40.3810, lng: -3.6980, capacity: 17393 },
  { aliases: ['mallorca', 'rcd mallorca'], city: 'Palma', country: 'España', stadium: 'Son Moix', tz: 'Europe/Madrid', lat: 39.5942, lng: 2.6789, capacity: 23142 },
  { aliases: ['rayo vallecano'], city: 'Madrid', country: 'España', stadium: 'Campo de Vallecas', tz: 'Europe/Madrid', lat: 40.3910, lng: -3.6600, capacity: 14708 },
  { aliases: ['espanyol', 'rcd espanyol de barcelona', 'espanyol de barcelona'], city: "Cornellà de Llobregat", country: 'España', stadium: 'RCDE Stadium', tz: 'Europe/Madrid', lat: 41.3483, lng: 2.0918, capacity: 40000 },
  { aliases: ['elche', 'elche cf'], city: 'Elche', country: 'España', stadium: 'Manuel Martínez Valero', tz: 'Europe/Madrid', lat: 38.2700, lng: -0.6480, capacity: 31177 },
  { aliases: ['levante', 'levante ud'], city: 'Valencia', country: 'España', stadium: 'Ciutat de València', tz: 'Europe/Madrid', lat: 39.4850, lng: -0.3530, capacity: 26354 },
  { aliases: ['malaga', 'malaga cf', 'málaga'], city: 'Málaga', country: 'España', stadium: 'La Rosaleda', tz: 'Europe/Madrid', lat: 36.7210, lng: -4.4280, capacity: 30044 },
  { aliases: ['rc deportivo la coruna', 'deportivo la coruna', 'deportivo la coruña', 'rc deportivo la coruña'], city: 'A Coruña', country: 'España', stadium: 'Abanca Riazor', tz: 'Europe/Madrid', lat: 43.3724, lng: -8.4046, capacity: 32490 },
  { aliases: ['real sociedad'], city: 'San Sebastián', country: 'España', stadium: 'Reale Arena', tz: 'Europe/Madrid', lat: 43.3011, lng: -2.0081, capacity: 39500 },
  // Libertadores
  { aliases: ['flamengo', 'cr flamengo', 'flamengo'], city: 'Río de Janeiro', country: 'Brasil', stadium: 'Maracaná', tz: 'America/Sao_Paulo', lat: -22.9122, lng: -43.2302, capacity: 78838 },
  { aliases: ['fluminense', 'fluminense fc'], city: 'Río de Janeiro', country: 'Brasil', stadium: 'Maracaná', tz: 'America/Sao_Paulo', lat: -22.9122, lng: -43.2302, capacity: 78838 },
  { aliases: ['corinthians', 'sc corinthians paulista'], city: 'São Paulo', country: 'Brasil', stadium: 'Neo Química Arena', tz: 'America/Sao_Paulo', lat: -23.5453, lng: -46.5744, capacity: 47217 },
  { aliases: ['palmeiras', 'se palmeiras'], city: 'São Paulo', country: 'Brasil', stadium: 'Allianz Parque', tz: 'America/Sao_Paulo', lat: -23.5275, lng: -46.6105, capacity: 43713 },
  { aliases: ['sao paulo', 'sao paulo fc'], city: 'São Paulo', country: 'Brasil', stadium: 'Morumbis', tz: 'America/Sao_Paulo', lat: -23.5980, lng: -46.6070, capacity: 66795 },
  { aliases: ['cruzeiro', 'cruzeiro ec'], city: 'Belo Horizonte', country: 'Brasil', stadium: 'Mineirão', tz: 'America/Sao_Paulo', lat: -19.8560, lng: -43.9470, capacity: 61846 },
  { aliases: ['mirassol', 'mirassol fc'], city: 'Mirassol', country: 'Brasil', stadium: null, tz: 'America/Sao_Paulo', lat: -20.8180, lng: -49.5260, capacity: null },
  { aliases: ['boca juniors', 'ca boca juniors'], city: 'Buenos Aires', country: 'Argentina', stadium: 'La Bombonera', tz: 'America/Argentina/Buenos_Aires', lat: -34.6351, lng: -58.3657, capacity: 54000 },
  { aliases: ['river plate', 'ca river plate'], city: 'Buenos Aires', country: 'Argentina', stadium: 'Mâs Monumental', tz: 'America/Argentina/Buenos_Aires', lat: -34.5453, lng: -58.4693, capacity: 83189 },
  { aliases: ['racing club'], city: 'Avellaneda', country: 'Argentina', stadium: 'Presidente Perón', tz: 'America/Argentina/Buenos_Aires', lat: -34.6706, lng: -58.3699, capacity: 51389 },
  { aliases: ['estudiantes', 'estudiantes de la plata'], city: 'La Plata', country: 'Argentina', stadium: 'Jorge Luis Hirschi', tz: 'America/Argentina/Buenos_Aires', lat: -34.9028, lng: -57.9690, capacity: 30000 },
  { aliases: ['lanus', 'ca lanus', 'lanús'], city: 'Lanús', country: 'Argentina', stadium: 'La Fortaleza', tz: 'America/Argentina/Buenos_Aires', lat: -34.7530, lng: -58.3600, capacity: null },
  { aliases: ['platense', 'ca platense'], city: 'Vicente López', country: 'Argentina', stadium: 'Ciudad de Vicente López', tz: 'America/Argentina/Buenos_Aires', lat: -34.5350, lng: -58.4850, capacity: null },
  { aliases: ['rosario central', 'ca rosario central'], city: 'Rosario', country: 'Argentina', stadium: 'Gigante de Arroyito', tz: 'America/Argentina/Buenos_Aires', lat: -32.9280, lng: -60.6900, capacity: 41465 },
  { aliases: ['velez sarsfield', 'velez', 'vélez'], city: 'Buenos Aires', country: 'Argentina', stadium: 'José Amalfitani', tz: 'America/Argentina/Buenos_Aires', lat: -34.7065, lng: -58.4430, capacity: 49540 },
  { aliases: ['independiente rivadavia', 'cs independiente rivadavia'], city: 'Mendoza', country: 'Argentina', stadium: null, tz: 'America/Argentina/Mendoza', lat: -32.8900, lng: -68.8400, capacity: null },
  { aliases: ['penarol', 'ca penarol', 'peñarol'], city: 'Montevideo', country: 'Uruguay', stadium: 'Campeón del Siglo', tz: 'America/Montevideo', lat: -34.8280, lng: -56.0600, capacity: 40000 },
  { aliases: ['nacional', 'club nacional de football'], city: 'Montevideo', country: 'Uruguay', stadium: 'Gran Parque Central', tz: 'America/Montevideo', lat: -34.8170, lng: -56.1400, capacity: 34000 },
  { aliases: ['cerro porteno', 'club cerro porteno'], city: 'Asunción', country: 'Paraguay', stadium: 'La Nueva Olla', tz: 'America/Asuncion', lat: -25.2760, lng: -57.5470, capacity: 45350 },
  { aliases: ['libertad', 'club libertad asuncion'], city: 'Asunción', country: 'Paraguay', stadium: 'Nicolás Leoz', tz: 'America/Asuncion', lat: -25.2790, lng: -57.5530, capacity: null },
  { aliases: ['olimpia'], city: 'Asunción', country: 'Paraguay', stadium: 'Defensores del Chaco', tz: 'America/Asuncion', lat: -25.2640, lng: -57.5210, capacity: 42354 },
  { aliases: ['bolivar', 'club bolivar'], city: 'La Paz', country: 'Bolivia', stadium: 'Hernando Siles', tz: 'America/La_Paz', lat: -16.5030, lng: -68.1030, capacity: 41143 },
  { aliases: ['always ready', 'club always ready'], city: 'El Alto', country: 'Bolivia', stadium: 'Municipal de El Alto', tz: 'America/La_Paz', lat: -16.4940, lng: -68.1550, capacity: null },
  { aliases: ['universitario', 'club universitario de deportes'], city: 'Lima', country: 'Perú', stadium: 'Monumental', tz: 'America/Lima', lat: -12.0760, lng: -76.9360, capacity: 80093 },
  { aliases: ['sporting cristal', 'cs cristal'], city: 'Lima', country: 'Perú', stadium: null, tz: 'America/Lima', lat: -12.0760, lng: -77.0240, capacity: null },
  { aliases: ['cusco fc'], city: 'Cusco', country: 'Perú', stadium: 'Garcilaso', tz: 'America/Lima', lat: -13.5300, lng: -71.9500, capacity: null },
  { aliases: ['santa fe', 'independiente santa fe'], city: 'Bogotá', country: 'Colombia', stadium: 'Nemesio Camacho El Campín', tz: 'America/Bogota', lat: 4.6460, lng: -74.1000, capacity: 36343 },
  { aliases: ['independiente medellin', 'cd independiente medellin'], city: 'Medellín', country: 'Colombia', stadium: 'Atanasio Girardot', tz: 'America/Bogota', lat: 6.2560, lng: -75.5900, capacity: null },
  { aliases: ['tolima', 'cd tolima'], city: 'Ibagué', country: 'Colombia', stadium: 'Murillo Toro', tz: 'America/Bogota', lat: 4.4430, lng: -75.2300, capacity: null },
  { aliases: ['junior', 'cdp junior fc', 'atletico junior'], city: 'Barranquilla', country: 'Colombia', stadium: 'Metropolitano', tz: 'America/Bogota', lat: 10.9060, lng: -74.9700, capacity: null },
  { aliases: ['ldu de quito', 'ldu quito'], city: 'Quito', country: 'Ecuador', stadium: 'Rodrigo Paz Delgado', tz: 'America/Guayaquil', lat: -0.2240, lng: -78.4940, capacity: 41583 },
  { aliases: ['independiente del valle', 'car independiente del valle'], city: 'Sangolquí', country: 'Ecuador', stadium: 'Banco Guayaquil', tz: 'America/Guayaquil', lat: -0.3130, lng: -78.4400, capacity: null },
  { aliases: ['barcelona sc'], city: 'Guayaquil', country: 'Ecuador', stadium: 'Monumental Banco Pichincha', tz: 'America/Guayaquil', lat: -2.1480, lng: -79.9130, capacity: 57267 },
  { aliases: ['universidad catolica', 'cd universidad catolica'], city: 'Quito', country: 'Ecuador', stadium: 'Olímpico Atahualpa', tz: 'America/Guayaquil', lat: -0.1700, lng: -78.4900, capacity: null },
  { aliases: ['universidad central de venezuela', 'universidad central'], city: 'Caracas', country: 'Venezuela', stadium: 'Olímpico de la UCV', tz: 'America/Caracas', lat: 10.4980, lng: -66.8870, capacity: null },
  { aliases: ['deportivo la guaira', 'deportivo la guaira fc'], city: 'Caracas', country: 'Venezuela', stadium: 'Olímpico de la UCV', tz: 'America/Caracas', lat: 10.4980, lng: -66.8870, capacity: null },
  { aliases: ['coquimbo unido', 'cd coquimbo unido'], city: 'Coquimbo', country: 'Chile', stadium: 'Francisco Sánchez Rumoroso', tz: 'America/Santiago', lat: -29.9530, lng: -71.3390, capacity: null },
  // Champions y Europa (clubes recurrentes; los demás caen a la fila «sin sede»)
  { aliases: ['paris saint germain', 'paris saint-germain'], city: 'París', country: 'Francia', stadium: 'Parc des Princes', tz: 'Europe/Paris', lat: 48.8414, lng: 2.2530, capacity: 47929 },
  { aliases: ['borussia dortmund'], city: 'Dortmund', country: 'Alemania', stadium: 'Signal Iduna Park', tz: 'Europe/Berlin', lat: 51.4926, lng: 7.4461, capacity: 81365 },
  { aliases: ['bayern munich', 'fc bayern munich'], city: 'Múnich', country: 'Alemania', stadium: 'Allianz Arena', tz: 'Europe/Berlin', lat: 48.2188, lng: 11.6247, capacity: 75000 },
  { aliases: ['bayer leverkusen'], city: 'Leverkusen', country: 'Alemania', stadium: 'BayArena', tz: 'Europe/Berlin', lat: 51.0378, lng: 7.0010, capacity: 30210 },
  { aliases: ['inter', 'internazionale'], city: 'Milán', country: 'Italia', stadium: 'Giuseppe Meazza', tz: 'Europe/Rome', lat: 45.4784, lng: 9.2050, capacity: 75923 },
  { aliases: ['napoli', 'ssc napoli'], city: 'Nápoles', country: 'Italia', stadium: 'Diego Armando Maradona', tz: 'Europe/Rome', lat: 40.8280, lng: 14.1930, capacity: 54726 },
  { aliases: ['juventus'], city: 'Turín', country: 'Italia', stadium: 'Allianz Stadium', tz: 'Europe/Rome', lat: 45.1097, lng: 7.6410, capacity: 41507 },
  { aliases: ['benfica', 'sl benfica'], city: 'Lisboa', country: 'Portugal', stadium: 'Estádio da Luz', tz: 'Europe/Lisbon', lat: 38.7528, lng: -9.1847, capacity: 64642 },
  { aliases: ['porto', 'fc porto'], city: 'Oporto', country: 'Portugal', stadium: 'Estádio do Dragão', tz: 'Europe/Lisbon', lat: 41.1617, lng: -8.5837, capacity: 50033 },
  { aliases: ['sporting cp'], city: 'Lisboa', country: 'Portugal', stadium: 'José Alvalade', tz: 'Europe/Lisbon', lat: 38.7610, lng: -9.1600, capacity: 50095 },
  { aliases: ['ajax'], city: 'Ámsterdam', country: 'Países Bajos', stadium: 'Johan Cruijff ArenA', tz: 'Europe/Amsterdam', lat: 52.3142, lng: 4.9410, capacity: 55500 },
  { aliases: ['psv', 'psv eindhoven'], city: 'Eindhoven', country: 'Países Bajos', stadium: 'Philips Stadion', tz: 'Europe/Amsterdam', lat: 51.4415, lng: 5.4675, capacity: 35000 },
  { aliases: ['galatasaray'], city: 'Estambul', country: 'Turquía', stadium: 'RAMS Park', tz: 'Europe/Istanbul', lat: 41.0270, lng: 28.9940, capacity: 52223 },
];

export const MAP_CROP = { latTop: 78, latBottom: -58, rows: 68 };

/* ---- Zoom por estadio (página de partido) ---- */

/**
 * Ventana del recorte: un cuadro prudente alrededor del estadio — suficiente
 * para leer la región, no para distraer del encuentro. La retícula es más fina
 * que la del mapa de portada y el PNG se genera con scripts/generate-venue-zooms.mjs.
 */
export const VENUE_ZOOM = { lngSpan: 20, latSpan: 12.5, step: 0.35, pitch: 9 };

const ZOOM_COLS = Math.round(VENUE_ZOOM.lngSpan / VENUE_ZOOM.step);
const ZOOM_ROWS = Math.round(VENUE_ZOOM.latSpan / VENUE_ZOOM.step);
const ZOOM_SPAN_LNG = ZOOM_COLS * VENUE_ZOOM.step;
const ZOOM_SPAN_LAT = ZOOM_ROWS * VENUE_ZOOM.step;

/** Slug estable por club (suffix numérico solo ante colisión). */
const CLUB_SLUGS = new Map();
for (const [index, club] of CLUBS.entries()) {
  const base = normalize(club.aliases[0]).replace(/ /g, '-');
  const taken = new Set(CLUB_SLUGS.values());
  CLUB_SLUGS.set(club, taken.has(base) ? `${base}-${index + 1}` : base);
}

export function venueZoomSrc(club) {
  const slug = CLUB_SLUGS.get(club);
  return slug ? `/img/venue-zoom/${slug}.png` : null;
}

/** Layout del recorte: archivo, tamaño y pin en % dentro del marco. */
export function venueZoomLayout(club) {
  const src = venueZoomSrc(club);
  if (!src) return null;
  const left = club.lng - ZOOM_SPAN_LNG / 2;
  const top = club.lat + ZOOM_SPAN_LAT / 2;
  return {
    src,
    width: ZOOM_COLS * VENUE_ZOOM.pitch,
    height: ZOOM_ROWS * VENUE_ZOOM.pitch,
    pinX: ((club.lng - left) / ZOOM_SPAN_LNG) * 100,
    pinY: ((top - club.lat) / ZOOM_SPAN_LAT) * 100,
  };
}

function toLocation(club, match) {
  return {
    city: club.city, country: club.country, tz: club.tz,
    lat: club.lat, lng: club.lng,
    stadium: club.stadium ?? match.venue ?? null,
    capacity: club.capacity ?? null,
    zoom: venueZoomLayout(club),
  };
}

/** Sede de localía de un encuentro, por alias tolerante del club local. */
export function locateMatch(match) {
  const norm = normalize(match?.home);
  if (!norm) return null;
  const exact = CLUBS.find(club => club.aliases.includes(norm));
  if (exact) return toLocation(exact, match);
  let best = null;
  let bestLen = 0;
  for (const club of CLUBS) {
    for (const alias of club.aliases) {
      const common = Math.min(alias.length, norm.length);
      if (!(alias.startsWith(norm) || norm.startsWith(alias))) continue;
      if (common > bestLen) { best = club; bestLen = common; }
    }
  }
  return best ? toLocation(best, match) : null;
}
