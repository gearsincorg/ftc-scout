// Entry point: home screen (pick mode), routing, offline service worker.
//
// Roles: Scout, Hub, or Hub + Scout ("dual"). A dual device is a hub whose
// operator also scouts one slot: its scout records go straight into the hub
// database, and a button in each screen switches to the other.

import { h, clear } from './ui.js';
import * as db from './db.js';
import { mountScout } from './scout.js';
import { mountHub, unmountHub } from './hub.js';
import { config } from './records.js';

const app = document.getElementById('app');
let firstRoute = true;

async function choose(role) {
  await db.setKV('dual', role === 'dual');
  location.hash = role === 'hub' ? '#hub' : '#scout';
}

async function route() {
  unmountHub(); // stop the hub camera if we're leaving the hub
  document.querySelectorAll('.modal').forEach(m => m.remove());
  let mode = location.hash.slice(1);
  if (!mode) {
    // Only a fresh launch reopens the remembered mode. Going Back to the bare
    // address means "home". replaceState records the mode without adding a
    // history entry, so Back from it leaves the app as usual.
    mode = firstRoute ? ((await db.getKV('mode')) || 'home') : 'home';
    if (mode !== 'home') history.replaceState(null, '', '#' + mode);
  }
  firstRoute = false;
  if (mode === 'scout') { await db.setKV('mode', 'scout'); return mountScout(app); }
  if (mode === 'hub') { await db.setKV('mode', 'hub'); return mountHub(app); }
  await db.setKV('mode', 'home');
  clear(app).append(h('div', { class: 'page home' },
    h('h1', {}, 'G-SCOUT'),
    h('p', { class: 'muted' }, `${config.game} · works offline · data moves by QR code`),
    h('div', { class: 'home-grid' },
      h('button', { class: 'btn big home-btn', onclick: () => choose('scout') }, h('b', {}, 'Scout'), h('small', {}, 'Watch one robot per match and fill in the form')),
      h('button', { class: 'btn big home-btn', onclick: () => choose('hub') }, h('b', {}, 'Hub'), h('small', {}, 'Scan scouts’ codes, manage the schedule, see rankings')),
      h('button', { class: 'btn big home-btn wide-cell', onclick: () => choose('dual') }, h('b', {}, 'Hub + Scout'),
        h('small', {}, 'The hub device, whose operator also scouts one slot. Switch screens with one tap; your own matches save straight into the hub.'))),
    h('p', { class: 'muted small' }, 'This device remembers the mode you pick. Install it to the home screen so it opens without a network.')));
}

window.addEventListener('hashchange', route);
route();
db.persist();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker failed', e));
}
