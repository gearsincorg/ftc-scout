// IndexedDB storage: `records` (scouting records by id) and `kv` (settings, schedules).

let dbp;
function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('ftc-scout', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('records', { keyPath: 'id' });
        db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab is erasing the database: let go so it can finish.
        db.onversionchange = () => { db.close(); dbp = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

// Everything on this device, for a backup before erasing.
export async function dumpAll() {
  const kv = {};
  const keys = await run('kv', 'readonly', s => s.getAllKeys());
  for (const k of keys) kv[k] = await getKV(k);
  return { records: await allRecords(), kv };
}

// Delete the whole database (records, schedules, settings). The offline app
// files are a separate cache and stay, so the app keeps working offline.
export async function eraseAll() {
  if (dbp) { (await dbp).close(); dbp = null; }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('ftc-scout');
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(false); // another tab still has it open; finishes when that tab closes
  });
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const getKV = k => run('kv', 'readonly', s => s.get(k));
export const setKV = (k, v) => run('kv', 'readwrite', s => s.put(v, k));
export const delKV = k => run('kv', 'readwrite', s => s.delete(k));

export const getRecord = id => run('records', 'readonly', s => s.get(id));
export const allRecords = () => run('records', 'readonly', s => s.getAll());
export const putRecord = r => run('records', 'readwrite', s => s.put(r));
export const deleteRecord = id => run('records', 'readwrite', s => s.delete(id));
export const clearRecords = () => run('records', 'readwrite', s => s.clear());

// Merge an incoming record: keep whichever copy was edited last.
// Returns 'new' | 'updated' | 'same'.
export async function mergeRecord(r) {
  const old = await getRecord(r.id);
  if (old && old.u >= r.u) return 'same';
  await putRecord(r);
  return old ? 'updated' : 'new';
}

// Ask the browser not to evict our data (iOS may still clear it; keep backups).
export async function persist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return (await navigator.storage.persisted()) || (await navigator.storage.persist());
    }
  } catch (e) { /* not supported */ }
  return false;
}

export async function deviceId() {
  let id = await getKV('deviceId');
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    await setKV('deviceId', id);
  }
  return id;
}
