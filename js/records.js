// Scouting records: shape, point estimates, team summaries, CSV.
//
// Record: { id, ev, m: 'Q12', s: 'B1', t: 14523, sc: 'scout name', dev, u: editedMs,
//           c: config id, d: { fieldId: value } }
// id = device + event + match + slot, so re-saving a match replaces the old copy
// and the hub keeps whichever copy has the newer `u`.

import config from './config/biobuzz-2026.js';
export { config };

export const fields = config.sections.flatMap(s => s.fields.map(f => ({ ...f, section: s.id })));

export function recordId(dev, ev, m, s) { return [dev, ev, m, s].join('-'); }

// Drop zero / empty values so QR codes stay small.
export function packData(d) {
  const out = {};
  for (const f of fields) {
    const v = d[f.id];
    if (v === undefined || v === null || v === '' || v === 0 || v === false) continue;
    out[f.id] = f.type === 'toggle' ? 1 : v;
  }
  return out;
}

export function estimate(d) {
  const e = { total: 0, foul: 0 };
  for (const s of config.sections) e[s.id] = 0;
  for (const f of fields) {
    const v = d[f.id];
    if (!v) continue;
    const n = f.type === 'toggle' ? 1 : +v;
    if (f.pts) { e[f.section] += n * f.pts; e.total += n * f.pts; }
    if (f.foul) e.foul += n * f.foul;
  }
  return e;
}

// Group records by team and compute config.metrics for each.
export function summarize(records) {
  const byTeam = new Map();
  for (const r of records) {
    if (!byTeam.has(r.t)) byTeam.set(r.t, []);
    byTeam.get(r.t).push(r);
  }
  const out = [];
  for (const [team, rs] of byTeam) {
    rs.sort((a, b) => matchOrder(a.m) - matchOrder(b.m));
    const m = {};
    for (const met of config.metrics) {
      const vals = rs.map(r => met.fn(r.d || {}, estimate(r.d || {}))).filter(v => v !== null && v !== undefined);
      if (!vals.length) { m[met.id] = null; continue; }
      const nums = vals.map(Number);
      if (met.agg === 'sum') m[met.id] = nums.reduce((a, b) => a + b, 0);
      else if (met.agg === 'max') m[met.id] = Math.max(...nums);
      else m[met.id] = nums.reduce((a, b) => a + b, 0) / nums.length; // avg and pct
    }
    out.push({ team, n: rs.length, m, records: rs });
  }
  return out;
}

export function fmtMetric(met, v) {
  if (v === null || v === undefined) return '–';
  if (met.agg === 'pct' || met.pct) return Math.round(v * 100) + '%';
  if (met.agg === 'sum' || Number.isInteger(v)) return String(v);
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
}

// Q before P, then by number: Q2 < Q10 < P1.
export function matchOrder(k) {
  const n = parseInt(String(k).slice(1), 10) || 0;
  return (String(k)[0] === 'P' ? 100000 : 0) + n;
}

export function toCSV(records) {
  const cols = ['event', 'match', 'slot', 'team', 'scout', 'edited', ...fields.map(f => f.id),
    ...config.metrics.map(m => 'm_' + m.id)];
  const esc = v => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = records.slice().sort((a, b) => matchOrder(a.m) - matchOrder(b.m)).map(r => {
    const d = r.d || {}, e = estimate(d);
    return [r.ev, r.m, r.s, r.t, r.sc, new Date(r.u).toISOString(),
      ...fields.map(f => f.type === 'choice' ? (f.options[d[f.id] - 1] ?? '') : (d[f.id] ?? 0)),
      ...config.metrics.map(m => { const v = m.fn(d, e); return typeof v === 'boolean' ? +v : v; })].map(esc).join(',');
  });
  return [cols.join(','), ...rows].join('\n');
}
