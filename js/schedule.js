// Match schedules: parsing (typed, FTCScout, FTC Events API JSON) and the
// compact form sent to scouts by QR.
//
// Schedule object:
//   { ev: 'USTXHOQ1', lvl: 'Q' | 'P', v: 3, name: 'Event name',
//     matches: [{ k: 'Q12', label: 'Q12', t: [r1, r2, b1, b2], sur: [false, …] }] }
// Slots are schedule positions (Red 1 = first team listed for red), not field spots.

export const SLOTS = ['R1', 'R2', 'B1', 'B2'];
export const SLOT_NAMES = { R1: 'Red 1', R2: 'Red 2', B1: 'Blue 1', B2: 'Blue 2' };

const key = (lvl, i, label) => (lvl === 'Q' ? 'Q' + i : 'P' + i);

// ---- compact QR form ----------------------------------------------------
export function compact(s) {
  const T = [...new Set(s.matches.flatMap(m => m.t).filter(Boolean))].sort((a, b) => a - b);
  const idx = new Map(T.map((t, i) => [t, i + 1])); // 0 = empty slot
  let M = '';
  const S = [];
  s.matches.forEach((m, mi) => m.t.forEach((t, si) => {
    M += (t ? idx.get(t) : 0).toString(36).padStart(2, '0');
    if (m.sur && m.sur[si]) S.push([mi, si]);
  }));
  const out = { e: s.ev, l: s.lvl, v: s.v, T, M };
  if (s.lvl !== 'Q') out.L = s.matches.map(m => m.label);
  if (S.length) out.S = S;
  return out;
}

export function expand(c) {
  const n = c.M.length / 8, matches = [];
  for (let mi = 0; mi < n; mi++) {
    const t = [], sur = [false, false, false, false];
    for (let si = 0; si < 4; si++) {
      const i = parseInt(c.M.substr(mi * 8 + si * 2, 2), 36);
      t.push(i ? c.T[i - 1] : 0);
    }
    const k = key(c.l, mi + 1);
    matches.push({ k, label: c.L ? c.L[mi] : k, t, sur });
  }
  (c.S || []).forEach(([mi, si]) => matches[mi] && (matches[mi].sur[si] = true));
  return { ev: c.e, lvl: c.l, v: c.v, matches };
}

// True when two schedules list the same matches and teams.
export function sameMatches(a, b) {
  if (!a || !b || a.matches.length !== b.matches.length) return false;
  return JSON.stringify(compact({ ...a, v: 0 })) === JSON.stringify(compact({ ...b, ev: a.ev, v: 0 }));
}

// ---- typed / pasted text -----------------------------------------------
// One match per line: [label] red1 red2 blue1 blue2. Separators: space, comma, tab.
// A trailing '*' on a team number marks a surrogate. Lines starting with # are ignored.
export function parseTyped(text, ev, lvl) {
  const matches = [], errors = [];
  text.split(/\r?\n/).forEach((line, n) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    let teams = line.split(/[\s,;]+/).filter(Boolean), label = null;
    if (!/^\d+\*?$/.test(teams[0])) label = teams.shift();   // "M-3 …" or "Q12 …"
    else if (teams.length === 5) teams.shift();              // "12 r1 r2 b1 b2" (match number first)
    if (teams.length !== 4 || !teams.every(p => /^\d+\*?$/.test(p))) {
      errors.push(`Line ${n + 1}: need 4 team numbers`); return;
    }
    const i = matches.length + 1;
    matches.push({
      k: key(lvl, i), label: lvl === 'Q' ? 'Q' + i : label || 'P' + i,
      t: teams.map(p => parseInt(p, 10)), sur: teams.map(p => p.endsWith('*')),
    });
  });
  return { schedule: { ev, lvl, v: 0, matches }, errors };
}

export function toTyped(s) {
  return s.matches.map(m => [s.lvl === 'Q' ? '' : m.label, ...m.t.map((t, i) => t + (m.sur[i] ? '*' : ''))]
    .filter(Boolean).join(' ')).join('\n');
}

// ---- FTCScout (api.ftcscout.org) — public, no key, browser-friendly --------
const FTCSCOUT = 'https://api.ftcscout.org/graphql';

export async function fetchFTCScout(season, code) {
  const query = `query($s:Int!,$c:String!){eventByCode(season:$s,code:$c){name code
    teams{teamNumber team{name}}
    matches{tournamentLevel series matchNum description teams{teamNumber alliance station surrogate}}}}`;
  const res = await fetch(FTCSCOUT, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { s: +season, c: code.toUpperCase() } }),
  });
  if (!res.ok) throw new Error('FTCScout HTTP ' + res.status);
  const j = await res.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join('; '));
  const e = j.data.eventByCode;
  if (!e) throw new Error(`No event ${code} in season ${season}`);
  const teams = {};
  e.teams.forEach(t => (teams[t.teamNumber] = t.team ? t.team.name : ''));
  const toRows = list => list.map(m => {
    const t = [0, 0, 0, 0], sur = [false, false, false, false];
    m.teams.forEach(x => {
      const si = (x.alliance === 'Blue' ? 2 : 0) + (x.station === 'Two' ? 1 : x.station === 'One' ? 0 : -9);
      if (si >= 0) { t[si] = x.teamNumber; sur[si] = !!x.surrogate; }
    });
    return { t, sur, label: m.description, order: [m.series, m.matchNum] };
  });
  const quals = toRows(e.matches.filter(m => m.tournamentLevel === 'Quals'))
    .sort((a, b) => a.order[1] - b.order[1]);
  const plays = toRows(e.matches.filter(m => m.tournamentLevel !== 'Quals'))
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]);
  return { name: e.name, ev: e.code, teams, ...build(e.code, quals, plays) };
}

function build(ev, quals, plays) {
  const mk = (lvl, rows) => rows.length ? {
    ev, lvl, v: 0,
    matches: rows.map((r, i) => ({ k: key(lvl, i + 1), label: lvl === 'Q' ? 'Q' + (i + 1) : r.label || 'P' + (i + 1), t: r.t, sur: r.sur })),
  } : null;
  return { Q: mk('Q', quals), P: mk('P', plays) };
}

// ---- FTC Events API JSON (from tools/fetch-ftc-api.py, or a saved API response) --
// Accepts { schedule: [...] } from /v2.0/{season}/schedule/{code}, or the script's
// { event, name, teams, qual: {schedule}, playoff: {schedule} } bundle.
export function fromFtcEventsJson(obj, evGuess) {
  const ev = (obj.event || evGuess || 'EVENT').toUpperCase();
  const rows = list => (list || []).map(m => {
    const t = [0, 0, 0, 0], sur = [false, false, false, false];
    (m.teams || []).forEach(x => {
      const si = SLOTS.indexOf(String(x.station || '').replace(/^Red/i, 'R').replace(/^Blue/i, 'B').toUpperCase());
      if (si >= 0) { t[si] = x.teamNumber; sur[si] = !!x.surrogate; }
    });
    return { t, sur, label: m.description, lvl: String(m.tournamentLevel || ''), order: [m.series || 0, m.matchNumber || 0] };
  });
  let all = [];
  if (obj.schedule) all = rows(obj.schedule);
  if (obj.qual) all = all.concat(rows(obj.qual.schedule));
  if (obj.playoff) all = all.concat(rows(obj.playoff.schedule));
  const isQ = r => /QUAL/i.test(r.lvl);
  const quals = all.filter(isQ).sort((a, b) => a.order[1] - b.order[1]);
  const plays = all.filter(r => !isQ(r)).sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1]);
  const teams = {};
  (obj.teams || []).forEach(t => (teams[t.teamNumber] = t.nameShort || t.name || ''));
  return { name: obj.name || '', ev, teams, ...build(ev, quals, plays) };
}
