// Hub mode: scan and merge scout records, keep the schedule, summarize teams.

import { h, clear, toast, modal, download, pickFile, fmtTime } from './ui.js';
import * as db from './db.js';
import { asciiJSON, makeFrames, showFrames, scanPanel, qrSize } from './qr.js';
import { SLOTS, SLOT_NAMES, compact, expand, sameMatches, parseTyped, toTyped, fetchFTCScout, fromFtcEventsJson } from './schedule.js';
import { config, fields, summarize, fmtMetric, matchOrder, toCSV, estimate } from './records.js';
import { resetDevice } from './reset.js';

let root, body, tab, records = [], sched = {}, teams = {}, meta, scanLog = [], activePanel;
let sortBy = config.defaultSort, sortDir = -1, search = '';

const TABS = [['scan', 'Scan'], ['cover', 'Coverage'], ['teams', 'Teams'], ['sched', 'Schedule'], ['data', 'Data']];

export async function mountHub(el) {
  root = el;
  await reload();
  meta = (await db.getKV('hub')) || { season: config.season, code: '' };
  tab = (await db.getKV('hubTab')) || 'scan';
  body = h('div', { class: 'page' });
  const nav = h('nav', { class: 'tabs' }, TABS.map(([id, label]) =>
    h('button', { class: 'tab' + (tab === id ? ' on' : ''), 'data-tab': id, onclick: () => show(id) }, label)));
  clear(root).append(h('header', { class: 'hub-head' },
    h('div', { class: 'big-title' }, 'Hub'),
    h('div', { class: 'sub', id: 'hub-sub' }),
    h('button', { class: 'btn small ghost', onclick: () => (location.hash = '#home') }, 'Home')), nav, body);
  show(tab);
}

async function reload() {
  records = await db.allRecords();
  sched = { Q: await db.getKV('sched:Q'), P: await db.getKV('sched:P') };
  teams = (await db.getKV('teams')) || {};
}

function subtitle() {
  const s = document.getElementById('hub-sub');
  if (s) s.textContent = `${(sched.Q || sched.P || {}).ev || meta.code || 'no event'} · ${records.length} records`;
}

function show(id) {
  if (activePanel) { activePanel.stop(); activePanel = null; }
  tab = id; db.setKV('hubTab', id);
  root.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
  clear(body);
  subtitle();
  ({ scan, cover, teams: teamsTab, sched: schedTab, data })[id]();
}

// ---- scan ----------------------------------------------------------------------
function scan() {
  const log = h('div', { class: 'list log' });
  const drawLog = () => clear(log).append(...scanLog.slice(0, 30).map(l => h('div', { class: 'list-row ' + l.cls }, l.text)));
  activePanel = scanPanel(async (kind, data) => {
    let obj;
    try { obj = JSON.parse(data); } catch (e) { return 'Bad QR data'; }
    if (kind === 'S') { const s = await saveSchedule(expand(obj)); return `Schedule ${s.ev} version ${s.v}`; }
    const list = Array.isArray(obj) ? obj : [obj];
    const counts = { new: 0, updated: 0, same: 0 };
    for (const r of list) {
      const res = await db.mergeRecord(r);
      counts[res]++;
      scanLog.unshift({ cls: res, text: `${r.m} · ${SLOT_NAMES[r.s] || r.s} · Team ${r.t} · ${r.sc || r.dev} — ${res === 'same' ? 'already had it' : res}` });
    }
    await reload(); drawLog(); subtitle();
    const msg = list.length === 1 ? scanLog[0].text : `${counts.new} new, ${counts.updated} updated, ${counts.same} already had`;
    toast(msg, 'ok');
    if (navigator.vibrate) navigator.vibrate(80);
    return msg;
  });
  drawLog();
  body.append(h('p', { class: 'muted' }, 'Scan record codes from scout devices. Scanning the same code twice is harmless; an edited record replaces the older copy.'),
    activePanel, h('h3', {}, 'Recent scans'), log);
}

// ---- coverage -----------------------------------------------------------------
function cover() {
  const have = new Map(); // "Q12|B1" -> records
  for (const r of records) {
    const k = r.m + '|' + r.s;
    if (!have.has(k)) have.set(k, []);
    have.get(k).push(r);
  }
  let any = false;
  for (const lvl of ['Q', 'P']) {
    const s = sched[lvl];
    if (!s) continue;
    any = true;
    let got = 0;
    const rows = s.matches.map(m => h('tr', {}, h('th', {}, m.label), SLOTS.map((slot, si) => {
      const rs = have.get(m.k + '|' + slot) || [];
      if (rs.length) got++;
      const wrongTeam = rs.some(r => r.t !== m.t[si]);
      return h('td', {
        class: (rs.length ? 'have' : 'miss') + (wrongTeam ? ' warn' : ''),
        title: wrongTeam ? 'Team number differs from schedule' : '',
        onclick: rs.length ? () => recordSheet(rs) : null,
      }, m.t[si] || '–', rs.length > 1 ? h('sup', {}, '×' + rs.length) : null);
    })));
    body.append(h('h3', {}, `${lvl === 'Q' ? 'Qualification' : 'Playoff'} · ${got} / ${s.matches.length * 4} slots scouted`),
      h('div', { class: 'scroll-x' }, h('table', { class: 'grid' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Match'), SLOTS.map(s => h('th', { class: s[0] === 'R' ? 'red' : 'blue' }, SLOT_NAMES[s])))),
        h('tbody', {}, rows))));
  }
  const known = new Set(['Q', 'P'].flatMap(l => (sched[l] ? sched[l].matches.map(m => m.k) : [])));
  const extra = records.filter(r => !known.has(r.m));
  if (extra.length) body.append(h('h3', {}, `Records not in the schedule (${extra.length})`),
    h('div', { class: 'list' }, extra.map(r => h('div', { class: 'list-row', onclick: () => recordSheet([r]) }, `${r.ev} ${r.m} · ${SLOT_NAMES[r.s]} · Team ${r.t}`))));
  if (!any && !extra.length) body.append(h('p', { class: 'muted' }, 'Load a schedule (Schedule tab) to see coverage.'));
}

function recordSheet(rs) {
  modal(`${rs[0].m} · ${SLOT_NAMES[rs[0].s]}`, h('div', {}, rs.map(r => h('div', { class: 'card' },
    h('b', {}, `Team ${r.t}`), h('div', { class: 'muted' }, `${r.sc || '?'} · device ${r.dev} · ${fmtTime(r.u)} · est ${estimate(r.d).total} pts`),
    h('table', { class: 'kv' }, fields.filter(f => r.d[f.id] !== undefined).map(f =>
      h('tr', {}, h('th', {}, f.label), h('td', {}, fieldText(f, r.d[f.id])))))))));
}

const fieldText = (f, v) => f.type === 'choice' ? f.options[v || 0] : f.type === 'toggle' ? (v ? 'yes' : 'no') : (v ?? '');

// ---- teams / rankings ---------------------------------------------------------
function teamsTab() {
  const out = h('div', {});
  const draw = () => {
    let rows = summarize(records);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(r => String(r.team).includes(q) || (teams[r.team] || '').toLowerCase().includes(q) ||
      r.records.some(x => (x.d.nt || '').toLowerCase().includes(q)));
    const val = r => (sortBy === 'team' ? r.team : sortBy === 'n' ? r.n : r.m[sortBy] ?? -Infinity);
    rows.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sortDir);
    const th = (id, label) => h('th', { class: 'sort' + (sortBy === id ? ' on' : ''), onclick: () => {
      sortDir = sortBy === id ? -sortDir : -1; sortBy = id; draw();
    } }, label, sortBy === id ? (sortDir < 0 ? ' ▼' : ' ▲') : '');
    clear(out).append(rows.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'rank' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), th('team', 'Team'), th('n', 'Mt'), config.metrics.map(m => th(m.id, m.label)))),
      h('tbody', {}, rows.map((r, i) => h('tr', { onclick: () => teamSheet(r) },
        h('td', { class: 'muted' }, i + 1),
        h('td', {}, h('b', {}, r.team), teams[r.team] ? h('div', { class: 'tname' }, teams[r.team]) : null),
        h('td', {}, r.n), config.metrics.map(m => h('td', {}, fmtMetric(m, r.m[m.id])))))))) :
      h('p', { class: 'muted' }, records.length ? 'No match for that search.' : 'No records yet. Scan some on the Scan tab.'));
  };
  body.append(h('input', { type: 'search', class: 'search', placeholder: 'Search team number, name or notes', value: search,
    oninput: e => { search = e.target.value; draw(); } }), out,
    h('p', { class: 'muted small' }, `Est pts = this robot's LEAVE, PARK, TIPS, GARDEN and FLOWER points (${config.manual}). Tips are credited to the robot whose launch completed them; FLOWER points assume the alliance owned it. Tap a column to sort, a row for details.`));
  draw();
}

function teamSheet(r) {
  const shown = fields.filter(f => f.type !== 'text');
  modal(`Team ${r.team}${teams[r.team] ? ' · ' + teams[r.team] : ''}`, h('div', {},
    h('div', { class: 'stats' }, config.metrics.map(m => h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, fmtMetric(m, r.m[m.id])), h('div', { class: 'muted' }, m.label)))),
    h('div', { class: 'scroll-x' }, h('table', { class: 'rank small' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Match'), h('th', {}, 'Pts'), shown.map(f => h('th', { title: f.label }, f.id)))),
      h('tbody', {}, r.records.map(x => h('tr', {}, h('td', {}, x.m), h('td', {}, estimate(x.d).total),
        shown.map(f => h('td', {}, f.type === 'toggle' ? (x.d[f.id] ? '✓' : '') : f.type === 'choice' ? f.options[x.d[f.id] || 0][0] : (x.d[f.id] || '')))))))),
    h('p', { class: 'muted small' }, shown.map(f => `${f.id} = ${f.label}`).join(' · ')),
    h('h3', {}, 'Notes'),
    h('div', { class: 'list' }, r.records.filter(x => x.d.nt).map(x => h('div', { class: 'list-row' }, h('b', {}, x.m + ' '), x.d.nt)))));
}

// ---- schedule -------------------------------------------------------------------
async function saveSchedule(s) {
  const old = sched[s.lvl];
  if (old && old.ev === s.ev && sameMatches(old, s)) { toast(`${s.lvl === 'Q' ? 'Quals' : 'Playoffs'} unchanged (v${old.v})`); return old; }
  s.v = Math.max(s.v || 0, old && old.ev === s.ev ? old.v + 1 : 1);
  sched[s.lvl] = s;
  await db.setKV('sched:' + s.lvl, s);
  toast(`${s.lvl === 'Q' ? 'Quals' : 'Playoffs'} saved as version ${s.v} (${s.matches.length} matches). Reissue the QR to scouts.`, 'ok');
  subtitle();
  return s;
}

async function saveImported(res) {
  if (res.teams && Object.keys(res.teams).length) { teams = { ...teams, ...res.teams }; await db.setKV('teams', teams); }
  if (res.name) { meta.name = res.name; await db.setKV('hub', meta); }
  const got = [];
  for (const l of ['Q', 'P']) if (res[l]) { await saveSchedule(res[l]); got.push(`${res[l].matches.length} ${l === 'Q' ? 'quals' : 'playoff'}`); }
  return got;
}

function schedQR(s) {
  const box = h('div', { class: 'qr-box' });
  const stop = showFrames(box, makeFrames('S', asciiJSON(compact(s))), qrSize());
  modal(`${s.ev} ${s.lvl === 'Q' ? 'quals' : 'playoffs'} · v${s.v}`,
    h('div', {}, h('p', { class: 'muted center' }, `${s.matches.length} matches. Scouts: Schedule → Start camera.`), box), { onClose: stop });
}

function schedTab() {
  const season = h('input', { type: 'number', value: meta.season, class: 'num-in' });
  const code = h('input', { type: 'text', value: meta.code, placeholder: 'e.g. USTXHOQ1', class: 'code-in' });
  const status = h('div', { class: 'muted' });
  const dl = h('button', { class: 'btn primary', onclick: async () => {
    meta.season = +season.value; meta.code = code.value.trim().toUpperCase(); await db.setKV('hub', meta);
    if (!meta.code) { toast('Enter an event code', 'err'); return; }
    status.textContent = 'Downloading…'; dl.disabled = true;
    try {
      const res = await fetchFTCScout(meta.season, meta.code);
      const got = await saveImported(res);
      status.textContent = got.length ? `${res.name}: ${got.join(', ')}.` : `${res.name}: no schedule published yet (${Object.keys(res.teams).length} teams listed).`;
      redraw();
    } catch (e) { status.textContent = 'Download failed: ' + e.message + ' (needs internet; do this before the event)'; }
    dl.disabled = false;
  } }, 'Download from FTCScout');

  const lvl = h('select', {}, h('option', { value: 'Q' }, 'Qualification'), h('option', { value: 'P' }, 'Playoff'));
  const ta = h('textarea', { rows: 8, class: 'mono', placeholder: '1 14523 9876 5432 1111\n2 …\n\nOne match per line: red1 red2 blue1 blue2 (match number or label first is optional). Add * after a surrogate.' });
  const typedSave = h('button', { class: 'btn primary', onclick: async () => {
    const ev = (code.value.trim() || meta.code || (sched.Q || {}).ev || 'EVENT').toUpperCase();
    const { schedule, errors } = parseTyped(ta.value, ev, lvl.value);
    if (errors.length) { toast(errors.slice(0, 3).join('; '), 'err'); return; }
    if (!schedule.matches.length) { toast('No matches entered', 'err'); return; }
    await saveSchedule(schedule); redraw();
  } }, 'Save typed schedule');
  const fileBtn = h('button', { class: 'btn', onclick: async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const got = await saveImported(fromFtcEventsJson(JSON.parse(await f.text()), code.value.trim() || meta.code));
      status.textContent = got.length ? `Imported ${got.join(', ')} from ${f.name}.` : 'No matches found in that file.';
      redraw();
    } catch (e) { toast('Import failed: ' + e.message, 'err'); }
  } }, 'Import FTC API JSON file');

  const current = h('div', {});
  const redraw = () => clear(current).append(...['Q', 'P'].map(l => {
    const s = sched[l];
    if (!s) return h('div', { class: 'card muted' }, `${l === 'Q' ? 'Qualification' : 'Playoff'} schedule: not loaded`);
    return h('div', { class: 'card row wrap' },
      h('div', { class: 'grow' }, h('b', {}, `${l === 'Q' ? 'Qualification' : 'Playoff'} · ${s.ev}`), h('div', { class: 'muted' }, `version ${s.v} · ${s.matches.length} matches`)),
      h('button', { class: 'btn primary', onclick: () => schedQR(s) }, 'Show QR'),
      h('button', { class: 'btn', onclick: () => { lvl.value = l; ta.value = toTyped(s); ta.scrollIntoView({ behavior: 'smooth' }); } }, 'Edit'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm(`Delete the ${l === 'Q' ? 'qualification' : 'playoff'} schedule?`)) return;
        sched[l] = null; await db.delKV('sched:' + l); redraw();
      } }, 'Delete'));
  }));
  redraw();

  body.append(h('h3', {}, 'Current schedules'), current,
    h('section', { class: 'card' }, h('h3', {}, 'Download (needs internet)'),
      h('div', { class: 'row wrap' }, h('label', { class: 'inline' }, 'Season ', season), h('label', { class: 'inline' }, 'Event ', code), dl),
      status,
      h('p', { class: 'muted small' }, 'Uses the public FTCScout API (no key). Season is the kickoff year: BIOBUZZ = 2026. Quals appear once the event publishes them; download again for playoffs. A changed schedule gets a new version number.')),
    h('section', { class: 'card' }, h('h3', {}, 'Type or paste'), h('label', { class: 'inline' }, 'Level ', lvl), ta,
      h('div', { class: 'row wrap' }, typedSave, fileBtn)));
}

// ---- data -------------------------------------------------------------------------
function data() {
  const persisted = h('span', {}, '…');
  db.persist().then(p => (persisted.textContent = p ? 'yes' : 'not granted — back up often'));
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  body.append(
    h('section', { class: 'card' },
      h('div', {}, `${records.length} records · ${new Set(records.map(r => r.t)).size} teams · from ${new Set(records.map(r => r.dev)).size} devices`),
      h('div', { class: 'muted' }, 'Storage protected from eviction: ', persisted),
      h('p', { class: 'muted small' }, 'iPads can clear web-app data after a while without use. Download a backup after each session and keep it on another device.')),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: () => download(`ftc-scout-backup-${stamp()}.json`,
        JSON.stringify({ app: 'ftc-scout', kind: 'backup', exported: Date.now(), config: config.id, sched, teams, records })) }, 'Download backup (JSON)'),
      h('button', { class: 'btn', onclick: () => download(`ftc-scout-${stamp()}.csv`, '﻿' + toCSV(records), 'text/csv') }, 'Download CSV'),
      h('button', { class: 'btn', onclick: async () => {
        const f = await pickFile('.json,application/json');
        if (!f) return;
        try {
          const b = JSON.parse(await f.text());
          const c = { new: 0, updated: 0, same: 0 };
          for (const r of b.records || []) c[await db.mergeRecord(r)]++;
          if (b.teams) await db.setKV('teams', { ...teams, ...b.teams });
          for (const l of ['Q', 'P']) {
            const s = b.sched && b.sched[l];
            if (s && (!sched[l] || sched[l].ev !== s.ev || sched[l].v < s.v)) await db.setKV('sched:' + l, s);
          }
          await reload(); show('data');
          toast(`Backup merged: ${c.new} new, ${c.updated} updated, ${c.same} unchanged`, 'ok');
        } catch (e) { toast('Import failed: ' + e.message, 'err'); }
      } }, 'Merge a backup file')),
    h('section', { class: 'card' }, h('h3', {}, 'Danger zone'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm(`Delete all ${records.length} records on this hub? Download a backup first.`)) return;
        if (!confirm('Really delete them? This cannot be undone.')) return;
        await db.clearRecords(); await reload(); show('data');
      } }, 'Delete all records'), ' ',
      h('button', { class: 'btn danger', onclick: () => { if (activePanel) activePanel.stop(); resetDevice(); } }, 'Reset this device'),
      h('p', { class: 'muted small' }, 'Reset also erases schedules, team names and settings, and returns to the Scout / Hub choice.')));
}
