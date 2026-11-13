// Small DOM helpers shared by scout and hub views.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// The Home button every screen shows. canLeave() may return false to stay put.
export function homeButton(canLeave = () => true) {
  return h('button', { class: 'btn small ghost', 'aria-label': 'Home',
    onclick: () => { if (canLeave()) location.hash = '#home'; } }, '⌂ Home');
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

let toastTimer;
export function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), kind === 'err' ? 5000 : 2500);
}

// Full-screen sheet. Returns a close() function.
export function modal(title, body, { onClose, actions = [], wide = false } = {}) {
  let closed = false;
  const close = () => { if (closed) return; closed = true; wrap.remove(); onClose && onClose(); };
  const wrap = h('div', { class: 'modal', onclick: e => e.target === wrap && close() },
    h('div', { class: 'sheet' + (wide ? ' wide' : '') },   // wide: up to 1280 px on big screens
      h('div', { class: 'sheet-head' },
        h('h2', {}, title),
        h('button', { class: 'btn ghost', onclick: close, 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'sheet-body' }, body),
      actions.length ? h('div', { class: 'sheet-actions' }, actions) : null));
  document.body.append(wrap);
  return close;
}

export function download(name, text, mime = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function pickFile(accept) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
    document.body.append(inp); inp.click();
  });
}

export const fmtTime = ms => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
