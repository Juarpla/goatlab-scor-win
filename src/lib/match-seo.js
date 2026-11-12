const dateFormat = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' });
const formatXg = value => value.toFixed(2).replace('.', ',');

export function matchDateLabel(kickoff) {
  const time = Date.parse(kickoff);
  return Number.isFinite(time) ? dateFormat.format(time) : '';
}

export function describeMatch({ home, away, competition, kickoff, form, xg, finalScore }) {
  const date = matchDateLabel(kickoff);
  const fixture = `${home} vs. ${away}${competition ? ` · ${competition}` : ''}${date ? ` · ${date}` : ''}.`;
  if (form?.home?.played && form?.away?.played) {
    const wins = ({ wins, played }) => `${wins} ${wins === 1 ? 'victoria' : 'victorias'} en ${played}`;
    return `${fixture} Forma previa: ${wins(form.home)} del local y ${wins(form.away)} del visitante.`;
  }
  if (Number.isFinite(xg?.home) && Number.isFinite(xg?.away)) {
    return `${fixture} xG estimado: ${formatXg(xg.home)} para el local y ${formatXg(xg.away)} para el visitante.`;
  }
  if (finalScore) return `${fixture} Marcador final: ${finalScore.home}–${finalScore.away}.`;
  return `${fixture} Calendario y contexto del encuentro.`;
}

export function formSnapshot(homeForm, awayForm) {
  const count = form => form?.played ? { played: form.played, wins: form.form.filter(value => value === 'G').length } : null;
  return { home: count(homeForm), away: count(awayForm) };
}
