// Scout mode: one device, one schedule slot. Fill the form, save, show the QR.

import { h, clear, toast, modal, download, fmtTime } from './ui.js';
import * as db from './db.js';
import { asciiJSON, makeFrames, showFrames, scanPanel, qrSize } from './qr.js';
import { SLOTS, SLOT_NAMES, expand } from './schedule.js';
import { config, fields, recordId, packData, estimate } from './records.js';
import { resetDevice } from './reset.js';

let root, st, dev, sched, cur, dirty = false;
let dual = false; // Hub + Scout device: records are already in the hub database

export async function mountScout(el) {
  root = el;
  dirty = false;
  dual = !!(await db.getKV('dual'));
  dev = await db.deviceId();
  st = (await db.getKV('scout')) || { name: '', slot: null, lvl: 'Q', idx: 0, ev: '', manualNum: 1 };
  sched = { Q: await db.getKV('sched:Q'), P: await db.getKV('sched:P') };
  if (!st.slot) return renderSetup();
  await loadMatch();
}

const save = () => db.setKV('scout', st);
const schedule = () => sched[st.lvl];

// Current match: from the schedule if loaded, otherwise typed by the scout.
function match() {
  const s = schedule();
  if (s && s.matches.length) {
    st.idx = Math.max(0, Math.min(st.idx, s.matches.length - 1));
    const m = s.matches[st.idx];
    const si = SLOTS.indexOf(st.slot);
    return { k: m.k, label: m.label, team: m.t[si] || 0, sur: m.sur[si], ev: s.ev, last: st.idx === s.matches.length - 1 };
  }
  const k = st.lvl + st.manualNum;
  return { k, label: k, team: 0, sur: false, ev: st.ev || 'EVENT', manual: true };
}

async function loadMatch() {
  const m = match();
  const rec = await db.getRecord(recordId(dev, m.ev, m.k, st.slot));
  cur = { m, rec, team: rec ? rec.t : m.team, d: rec ? { ...rec.d } : {} };
  dirty = false;
  render();
}

function step(delta) {
  if (dirty && !confirm('Discard unsaved changes to this match?')) return;
  const s = schedule();
  if (s && s.matches.length) st.idx = Math.max(0, Math.min(s.matches.length - 1, st.idx + delta));
  else st.manualNum = Math.max(1, st.manualNum + delta);
  save(); loadMatch();
}

// ---- setup -----------------------------------------------------------------
function renderSetup() {
  const name = h('input', { type: 'text', value: st.name, placeholder: 'Your name', maxlength: 24 });
  const ev = h('input', { type: 'text', value: st.ev, placeholder: 'Event code (only if no schedule)', maxlength: 16 });
  const pick = slot => {
    st.slot = slot; st.name = name.value.trim(); st.ev = ev.value.trim().toUpperCase();
    save(); loadMatch();
  };
  clear(root).append(h('div', { class: 'page' },
    h('h1', {}, 'Scout setup'),
    h('label', { class: 'lbl' }, 'Scout name', name),
    h('label', { class: 'lbl' }, 'Event', ev),
    h('p', { class: 'muted' }, 'Pick your schedule slot. Red 1 means the first red team listed for each match, not a spot on the field. Find your robot by its team number.'),
    h('div', { class: 'slot-grid' }, SLOTS.map(s =>
      h('button', { class: 'btn big slot ' + (s[0] === 'R' ? 'red' : 'blue') + (st.slot === s ? ' on' : ''), onclick: () => pick(s) }, SLOT_NAMES[s])))));
}

// ---- main form ---------------------------------------------------------------
function render() {
  const m = cur.m;
  const red = st.slot[0] === 'R';
  const teamIn = h('input', { type: 'number', inputmode: 'numeric', class: 'team-in', value: cur.team || '', placeholder: 'Team #',
    oninput: e => { cur.team = parseInt(e.target.value, 10) || 0; dirty = true; badge(); } });
  const over = h('span', { class: 'badge warn' }, 'override');
  const badge = () => (over.style.display = !m.manual && cur.team !== m.team ? '' : 'none');
  badge();

  const s = schedule();
  const head = h('header', { class: 'scout-head ' + (red ? 'red' : 'blue') },
    h('button', { class: 'btn nav', onclick: () => step(-1), 'aria-label': 'Previous match' }, '◀'),
    h('div', { class: 'title' },
      h('div', { class: 'big-title' }, `${m.label} · ${SLOT_NAMES[st.slot]} · Team ${cur.team || '?'}`),
      h('div', { class: 'sub' }, m.ev, m.sur ? ' · surrogate' : '', cur.rec ? ` · saved ${fmtTime(cur.rec.u)}` : '',
        !s ? ' · no schedule loaded' : '')),
    h('button', { class: 'btn nav', onclick: () => step(1), 'aria-label': 'Next match' }, '▶'));

  const tools = h('div', { class: 'row wrap tools' },
    sched.P ? h('div', { class: 'seg' }, ['Q', 'P'].map(l => h('button', {
      class: 'btn small' + (st.lvl === l ? ' on' : ''),
      onclick: () => { if (st.lvl !== l) { st.lvl = l; st.idx = 0; save(); loadMatch(); } },
    }, l === 'Q' ? 'Quals' : 'Playoffs'))) : null,
    m.manual ? h('label', { class: 'inline' }, 'Match ', h('input', { type: 'number', class: 'num-in', value: st.manualNum,
      onchange: e => { st.manualNum = Math.max(1, parseInt(e.target.value, 10) || 1); save(); loadMatch(); } })) : null,
    h('label', { class: 'inline' }, 'Team ', teamIn, over),
    h('span', { class: 'grow' }),
    // On a Hub + Scout device the schedule comes from the hub itself.
    dual ? null : h('button', { class: 'btn small', onclick: openSchedule }, 'Schedule'),
    h('button', { class: 'btn small', onclick: openSaved }, 'Saved'),
    h('button', { class: 'btn small', onclick: openSettings }, '⚙'),
    dual ? h('button', { class: 'btn small primary', onclick: goHub }, 'Hub ▶') : null);

  const est = h('div', { class: 'est' });
  const updEst = () => { est.textContent = `Est. ${estimate(cur.d).total} pts`; };
  const changed = () => { dirty = true; updEst(); };
  updEst();

  const form = h('div', { class: 'form' }, config.sections.map(sec =>
    h('section', { class: 'card' },
      h('h2', {}, sec.title, sec.sub ? h('span', { class: 'muted' }, ' ', sec.sub) : null),
      sec.fields.map(f => fieldEl(f, cur.d, changed)))));

  const saveBtn = h('button', { class: 'btn primary big wide', onclick: doSave }, cur.rec ? 'Save changes & show QR' : 'Save & show QR');
  clear(root).append(head, h('div', { class: 'page' }, tools, form, h('div', { class: 'save-bar' }, est, saveBtn)));
  window.scrollTo(0, 0);
}

function fieldEl(f, d, changed) {
  const lab = h('div', { class: 'f-label' }, f.label, f.hint ? h('small', {}, f.hint) : null);
  if (f.type === 'counter') {
    const val = h('span', { class: 'count' }, d[f.id] || 0);
    const set = v => { d[f.id] = Math.max(0, v); val.textContent = d[f.id]; changed(); };
    return h('div', { class: 'field counter' }, lab,
      h('button', { class: 'btn pm', onclick: () => set((d[f.id] || 0) - 1), 'aria-label': 'minus' }, '−'), val,
      h('button', { class: 'btn pm plus', onclick: () => set((d[f.id] || 0) + 1), 'aria-label': 'plus' }, '+'));
  }
  if (f.type === 'toggle') {
    const b = h('button', { class: 'btn toggle' + (d[f.id] ? ' on' : ''), onclick: () => {
      d[f.id] = d[f.id] ? 0 : 1; b.classList.toggle('on', !!d[f.id]); changed();
    } }, h('span', {}, f.label), f.hint ? h('small', {}, f.hint) : null);
    return h('div', { class: 'field' }, b);
  }
  if (f.type === 'choice' || f.type === 'rating') {
    const opts = f.type === 'choice' ? f.options : Array.from({ length: f.max }, (_, i) => String(i + 1));
    const base = f.type === 'choice' ? 0 : 1;
    const btns = opts.map((o, i) => h('button', { class: 'btn' + ((d[f.id] || 0) === i + base && (f.type === 'choice' || d[f.id]) ? ' on' : ''),
      onclick: () => {
        const v = i + base;
        d[f.id] = f.type === 'rating' && d[f.id] === v ? 0 : v; // tap again to clear a rating
        btns.forEach((b, j) => b.classList.toggle('on', d[f.id] === j + base));
        changed();
      } }, o));
    return h('div', { class: 'field' }, lab, h('div', { class: 'seg fill' }, btns));
  }
  if (f.type === 'text') {
    return h('div', { class: 'field col' }, lab, h('textarea', { maxlength: f.max || 200, rows: 3,
      oninput: e => { d[f.id] = e.target.value; changed(); } }, d[f.id] || ''));
  }
  return h('div', {}, 'Unknown field type ' + f.type);
}

async function doSave() {
  const m = cur.m;
  if (!cur.team) { toast('Enter the team number first', 'err'); return; }
  const rec = {
    id: recordId(dev, m.ev, m.k, st.slot), ev: m.ev, m: m.k, s: st.slot, t: cur.team,
    sc: st.name, dev, u: Date.now(), c: config.id, d: packData(cur.d),
  };
  await db.putRecord(rec);
  cur.rec = rec; dirty = false;
  if (dual) savedToHub(rec, m);
  else showRecordQR([rec], `${m.label} · Team ${rec.t}`, !m.last);
}

function goHub() {
  if (dirty && !confirm('This match has unsaved changes. Leave without saving?')) return;
  dirty = false;
  location.hash = '#hub';
}

// Hub + Scout: no QR needed, the record is already in this device's hub data.
function savedToHub(rec, m) {
  const close = modal(`${m.label} · Team ${rec.t}`, h('div', {},
    h('p', { class: 'center big-ok' }, '✓ Saved to the hub'),
    h('p', { class: 'muted center' }, `Est. ${estimate(rec.d).total} pts. Edit it any time from Saved or with ◀.`)),
  {
    onClose: () => render(),
    actions: [
      h('button', { class: 'btn big', onclick: () => { close(); goHub(); } }, 'Go to Hub'),
      m.last ? null : h('button', { class: 'btn primary big grow', onclick: () => { close(); step(1); } }, 'Next match ▶'),
    ],
  });
}

function showRecordQR(recs, title, offerNext = false) {
  const box = h('div', { class: 'qr-box' });
  let stop;
  const close = modal(title, h('div', {},
    h('p', { class: 'muted center' }, 'Show this to the hub to scan. You can show it again later from Saved.'), box),
  {
    onClose: () => { stop && stop(); render(); },
    actions: offerNext ? [h('button', { class: 'btn primary big wide', onclick: () => { stop && stop(); close(); step(1); } }, 'Next match ▶')] : [],
  });
  stop = showFrames(box, makeFrames('R', asciiJSON(recs.length === 1 ? recs[0] : recs)), qrSize());
}

// ---- saved records -----------------------------------------------------------
async function openSaved() {
  const recs = (await db.allRecords()).filter(r => r.dev === dev).sort((a, b) => b.u - a.u);
  const list = h('div', { class: 'list' }, recs.length ? recs.map(r => h('div', { class: 'list-row' },
    h('div', { class: 'grow' }, h('b', {}, `${r.m} · ${SLOT_NAMES[r.s]} · Team ${r.t}`), h('div', { class: 'muted' }, `${r.ev} · ${fmtTime(r.u)}`)),
    h('button', { class: 'btn small', onclick: () => { close(); showRecordQR([r], `${r.m} · Team ${r.t}`); } }, 'QR'),
    h('button', { class: 'btn small', onclick: () => { close(); goTo(r); } }, 'Edit'))) : h('p', { class: 'muted' }, 'Nothing saved yet.'));
  const close = modal(`Saved on this device (${recs.length})`, list, {
    actions: recs.length ? [h('button', { class: 'btn', onclick: () => { close(); showRecordQR(recs, `All ${recs.length} records`); } }, 'Show all as one code')] : [],
  });
}

async function goTo(r) {
  st.lvl = r.m[0] === 'P' ? 'P' : 'Q';
  const s = schedule();
  if (s) {
    const i = s.matches.findIndex(m => m.k === r.m);
    if (i >= 0) st.idx = i;
  } else st.manualNum = parseInt(r.m.slice(1), 10) || 1;
  if (r.s !== st.slot && confirm(`That record is for ${SLOT_NAMES[r.s]}. Switch this device to ${SLOT_NAMES[r.s]}?`)) st.slot = r.s;
  await save(); loadMatch();
}

// ---- schedule ------------------------------------------------------------------
function openSchedule() {
  const info = () => ['Q', 'P'].map(l => sched[l]
    ? h('div', {}, h('b', {}, l === 'Q' ? 'Quals' : 'Playoffs'), ` ${sched[l].ev} · version ${sched[l].v} · ${sched[l].matches.length} matches`)
    : h('div', { class: 'muted' }, (l === 'Q' ? 'Quals' : 'Playoffs') + ': not loaded'));
  const infoBox = h('div', { class: 'card' }, info());
  // A complete schedule read ends the scan: camera off, popup closes, and the
  // toast says what happened. Wrong codes leave it open to try again.
  const finish = (msg, kind = 'ok') => {
    panel.stop();
    toast(msg, kind);
    setTimeout(close, 700); // long enough to see the ✓ in the popup
    return msg;
  };
  const panel = scanPanel(async (kind, data) => {
    if (kind !== 'S') throw new Error('That is a record code, not a schedule. Scan the hub’s schedule code.');
    const s = expand(JSON.parse(data));
    const old = sched[s.lvl];
    const what = s.lvl === 'Q' ? 'quals' : 'playoffs';
    if (old && old.ev === s.ev && old.v >= s.v) return finish(`Already have ${s.ev} ${what} version ${old.v}, nothing new`, '');
    if (old && old.ev !== s.ev) { // new event: drop the other level too
      for (const l of ['Q', 'P']) { sched[l] = null; await db.delKV('sched:' + l); }
    }
    sched[s.lvl] = s;
    await db.setKV('sched:' + s.lvl, s);
    clear(infoBox).append(...info());
    return finish(`Loaded ${s.ev} ${what} version ${s.v}: ${s.matches.length} matches`);
  });
  const close = modal('Schedule', h('div', {}, infoBox, h('p', { class: 'muted' }, 'Scan the schedule QR on the hub. Rescan whenever the hub reissues it.'), panel),
    { onClose: () => { panel.stop(); loadMatch(); } });
}

// ---- settings --------------------------------------------------------------------
function openSettings() {
  const name = h('input', { type: 'text', value: st.name, maxlength: 24 });
  const close = modal('Settings', h('div', {},
    h('label', { class: 'lbl' }, 'Scout name', name),
    h('p', {}, `Slot: ${SLOT_NAMES[st.slot]} · device ${dev}`),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: () => { st.slot = null; save(); close(); renderSetup(); } }, 'Change slot / event'),
      h('button', { class: 'btn', onclick: async () => {
        download(`scout-${dev}-${new Date().toISOString().slice(0, 10)}.json`,
          JSON.stringify({ app: 'ftc-scout', kind: 'backup', records: (await db.allRecords()).filter(r => r.dev === dev) }));
      } }, 'Download backup'),
      h('button', { class: 'btn', onclick: () => { location.hash = '#home'; } }, 'Switch to hub / home'),
      h('button', { class: 'btn danger', onclick: () => { close(); resetDevice(); } }, 'Reset this device'))),
  { onClose: () => { st.name = name.value.trim(); save(); } });
}
