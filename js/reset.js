// "Reset this device": erase all records, schedules and settings on this
// device (offering a backup first). The app itself stays installed.

import { h, modal, download, toast } from './ui.js';
import * as db from './db.js';

export async function resetDevice() {
  const data = await db.dumpAll();
  const n = data.records.length;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const close = modal('Reset this device', h('div', {},
    h('p', {}, `This erases everything stored on this device: `, h('b', {}, `${n} scouting record${n === 1 ? '' : 's'}`),
      ', the schedules, and settings such as Scout/Hub mode and scout slot.'),
    h('p', { class: 'muted' }, 'The app stays installed and still works offline. Records already scanned into the hub are not affected there.'),
    n ? h('p', {}, h('b', {}, 'Download a backup first'), ' unless you are sure the hub already has them.') : null),
  {
    actions: [
      h('button', { class: 'btn', onclick: () => download(`ftc-scout-device-backup-${stamp}.json`,
        JSON.stringify({ app: 'ftc-scout', kind: 'backup', exported: Date.now(), records: data.records, kv: data.kv })) }, 'Download backup'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm(`Erase ${n} record${n === 1 ? '' : 's'} and all settings on this device? This cannot be undone.`)) return;
        const done = await db.eraseAll();
        close();
        if (!done) { toast('Close the app in other tabs/windows to finish erasing', 'err'); return; }
        location.hash = '';
        location.reload();
      } }, 'Erase everything'),
    ],
  });
}
