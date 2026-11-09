// Entry point: home screen (pick mode), routing, offline service worker.

import { h, clear } from './ui.js';
import * as db from './db.js';
import { mountScout } from './scout.js';
import { mountHub } from './hub.js';
import { config } from './records.js';

const app = document.getElementById('app');

async function route() {
  let mode = location.hash.slice(1);
  if (!mode) mode = (await db.getKV('mode')) || 'home';
  if (mode === 'scout') { await db.setKV('mode', 'scout'); return mountScout(app); }
  if (mode === 'hub') { await db.setKV('mode', 'hub'); return mountHub(app); }
  await db.setKV('mode', 'home');
  clear(app).append(h('div', { class: 'page home' },
    h('h1', {}, 'FTC Scout'),
    h('p', { class: 'muted' }, `${config.game} · works offline · data moves by QR code`),
    h('div', { class: 'home-grid' },
      h('a', { class: 'btn big home-btn', href: '#scout' }, h('b', {}, 'Scout'), h('small', {}, 'Watch one robot per match and fill in the form')),
      h('a', { class: 'btn big home-btn', href: '#hub' }, h('b', {}, 'Hub'), h('small', {}, 'Scan scouts’ codes, manage the schedule, see rankings'))),
    h('p', { class: 'muted small' }, 'This device remembers the mode you pick. Install it to the home screen so it opens without a network.')));
}

window.addEventListener('hashchange', route);
route();
db.persist();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker failed', e));
}
