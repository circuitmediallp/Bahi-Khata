/* Bahi-Khata Property web backend: replaces the Claude runtime (db, user, assets, downloads) with an access-code login + the Apps Script API. */
(function () {
  var C = window.PR_CONFIG || {};
  var store = {}, ver = 0, me = null, listeners = [], synced = false, writeSeq = 0, inflight = 0;
  var local = {}, firstSync = null, syncing = null, code = '', pid = '', role = '';
  var CKEY = 'pr.code', PKEY = 'pr.pid', RKEY = 'pr.role';
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }

  /* ---------- three portals: Partner (team passcode), Admin (owner passcode), Guest (no passcode) ---------- */
  code = lsGet(CKEY); pid = lsGet(PKEY); role = lsGet(RKEY);
  if (['admin', 'partner', 'guest'].indexOf(role) < 0) role = '';
  if (!/^p[a-z0-9]{8,24}$/.test(pid)) { var a = new Uint8Array(12); crypto.getRandomValues(a); pid = 'p' + Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join(''); lsSet(PKEY, pid); }
  if (!role && !code && /^#[pr]-[a-z0-9]+$/.test(location.hash)) { role = 'guest'; lsSet(RKEY, 'guest'); } // a shared property link opens as Guest
  function authed() { return role === 'guest' || !!code; }
  function raw(body) {
    return fetch(C.API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }, function () { var e = new Error('network'); e.code = 'network'; throw e; });
  }
  var overlay = null;
  function enter(r, c) { role = r; code = c || ''; lsSet(RKEY, r); lsSet(CKEY, code); try { history.replaceState(null, '', location.pathname); } catch (e) {} location.reload(); }
  function portal(key, title, sub, color, needsCode) {
    var card = document.createElement('div');
    card.className = 'pr-card'; card.setAttribute('data-role', key);
    card.style.cssText = 'flex:1 1 200px;min-width:0;max-width:320px;background:var(--surface,#fff);border:1px solid var(--line,#D3DACF);border-top:6px solid ' + color + ';border-radius:12px;padding:16px;display:grid;gap:10px;text-align:left;align-content:start';
    var h2 = document.createElement('h2'); h2.textContent = title; h2.style.cssText = 'margin:0;font-size:20px;color:' + color;
    var p = document.createElement('p'); p.textContent = sub; p.style.cssText = 'margin:0;font-size:13.5px;color:var(--muted,#566860)';
    var err = document.createElement('p'); err.className = 'pr-err'; err.setAttribute('role', 'alert'); err.style.cssText = 'margin:0;color:#A3362E;font-size:13.5px;min-height:1em';
    var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = needsCode ? 'Enter as ' + title : 'Continue as Guest';
    btn.style.cssText = 'font-size:15px;font-weight:600;padding:11px;border:0;border-radius:10px;background:' + color + ';color:#fff;min-height:44px';
    card.appendChild(h2); card.appendChild(p);
    var inp = null;
    if (needsCode) {
      inp = document.createElement('input'); inp.type = 'password'; inp.placeholder = title + ' passcode'; inp.setAttribute('aria-label', title + ' passcode'); inp.autocomplete = 'off'; inp.setAttribute('autocapitalize', 'off');
      inp.style.cssText = 'font-size:16px;padding:10px 12px;border-radius:10px;border:1px solid var(--line,#D3DACF);min-height:44px;width:100%;box-sizing:border-box;background:var(--bg,#fff);color:inherit';
      card.appendChild(inp);
    }
    card.appendChild(btn); card.appendChild(err);
    function go() {
      if (!needsCode) { enter('guest', ''); return; }
      var v = inp.value.trim(); if (!v) { err.textContent = 'Type the passcode.'; return; }
      btn.disabled = true; err.textContent = 'Checking...';
      raw({ action: 'check', role: key, code: v, pid: pid }).then(function (r) {
        btn.disabled = false;
        if (r && r.ok) { enter(key, v); return; }
        err.textContent = r && r.error === 'auth' ? 'Wrong passcode for ' + title + '.' : (r && r.message) || 'Could not check. Try again.';
      }, function () { btn.disabled = false; err.textContent = 'No connection. Try again.'; });
    }
    btn.addEventListener('click', go);
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    return card;
  }
  function chooser(msg, canCancel) {
    if (overlay) overlay.remove();
    overlay = document.createElement('div'); overlay.id = 'pr-login';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg,#EEF1EC);color:var(--ink,#14231D);overflow:auto;padding:28px 16px;font-family:system-ui,sans-serif;text-align:center';
    var h1 = document.createElement('h1'); h1.textContent = 'Bahi-Khata Property'; h1.style.cssText = 'margin:0 0 4px;font-size:28px';
    var sub = document.createElement('p'); sub.id = 'pr-msg'; sub.textContent = msg || (canCancel ? 'Switch portal. Partner and Admin ask for the passcode every time.' : 'Choose how you want to enter.'); sub.style.cssText = 'margin:0 0 18px;color:var(--muted,#566860)';
    var row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:14px;justify-content:center;max-width:1020px;margin:0 auto';
    row.appendChild(portal('partner', 'Partner', 'For team partners. List and manage properties, track your leads and commission.', '#2F5D4B', true));
    row.appendChild(portal('admin', 'Admin', 'For the owner. Confirm sales, set commission, manage the team.', '#C8501A', true));
    row.appendChild(portal('guest', 'Guest', 'For clients. Browse available properties. No passcode needed.', '#3B6EA5', false));
    overlay.appendChild(h1); overlay.appendChild(sub); overlay.appendChild(row);
    if (canCancel) {
      var c = document.createElement('button'); c.type = 'button'; c.id = 'pr-cancel'; c.textContent = 'Cancel, stay as ' + role.charAt(0).toUpperCase() + role.slice(1);
      c.style.cssText = 'margin-top:18px;font-size:15px;padding:10px 18px;border-radius:10px;border:1px solid var(--line,#D3DACF);background:transparent;color:inherit;min-height:44px';
      c.addEventListener('click', function () { overlay.remove(); overlay = null; }); overlay.appendChild(c);
    }
    document.body.appendChild(overlay);
  }
  function ensureAuth() {
    if (authed()) return Promise.resolve();
    chooser(); return new Promise(function () {}); // the page reloads once a portal is entered
  }

  /* ---------- API ---------- */
  function api(action, body) {
    return ensureAuth().then(function () { return raw(Object.assign({ role: role || undefined, code: code, pid: pid, action: action }, body)); }).then(function (r) {
      if (r && r.error === 'auth') { code = ''; lsSet(CKEY, ''); role = ''; lsSet(RKEY, ''); chooser('Your passcode is no longer accepted. Enter again.'); return new Promise(function () {}); }
      if (r && (r.error === 'locked' || r.error === 'setup')) { chooser(r.message); var e1 = new Error(r.message); e1.code = r.error; throw e1; }
      if (r && r.error) { var e = new Error(r.message || r.error); e.code = r.error === 'denied' ? 'permission_denied' : r.error; throw e; }
      return r;
    });
  }

  /* ---------- local store + sync ---------- */
  function applyTables(t) {
    store = {};
    Object.keys(t).forEach(function (k) { t[k].forEach(function (r) { store[k + '/' + r.id.split('~').join('/')] = r.data; }); });
  }
  function snapDoc(path) { var ex = path in store; return { id: path.split('/').pop(), exists: ex, data: function () { return ex ? JSON.parse(JSON.stringify(store[path])) : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function snapCol(path) {
    var p = path + '/', docs = Object.keys(store).filter(function (k) { return k.indexOf(p) === 0 && k.slice(p.length).indexOf('/') < 0; }).sort().map(snapDoc);
    return { docs: docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function fire() { listeners.slice().forEach(function (l) { try { l.cb(l.col ? snapCol(l.path) : snapDoc(l.path)); } catch (e) { console.error(e); } }); }
  function sync() {
    if (syncing) return syncing;
    var seq = writeSeq;
    syncing = api('sync', { ver: ver }).then(function (r) {
      me = r.me;
      if (!role) { role = me.guest ? 'guest' : me.admin ? 'admin' : 'partner'; lsSet(RKEY, role); } // carried over from the older single-code login
      if (!r.same && seq === writeSeq && !inflight) { applyTables(r.tables); ver = r.ver; synced = true; fire(); }
      else if (!synced && r.same) { synced = true; fire(); }
    }).then(function () { syncing = null; }, function (e) { syncing = null; throw e; });
    return syncing;
  }
  function ready() {
    if (!firstSync) firstSync = sync().then(function () { return null; }, function (e) { firstSync = null; throw e; });
    return firstSync;
  }
  function poll() { if (synced && !document.hidden && !inflight) sync().catch(function () {}); }
  setInterval(poll, 30000);
  document.addEventListener('visibilitychange', poll); window.addEventListener('online', poll); window.addEventListener('focus', poll);

  /* ---------- db ---------- */
  function rid() { var a = new Uint8Array(10); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join(''); }
  function write(action, path, data, id) {
    var prev = path in store ? store[path] : undefined, key = path;
    if (action === 'add') key = path + '/' + id;
    var optimistic = action === 'delete' ? undefined : action === 'update' ? Object.assign({}, store[path] || {}, data) : data;
    var had = key in store, before = store[key];
    if (action === 'update' && !(path in store)) { var e0 = new Error('not found'); e0.code = 'not_found'; return Promise.reject(e0); }
    writeSeq++; inflight++;
    if (action === 'delete') delete store[key]; else store[key] = JSON.parse(JSON.stringify(optimistic));
    fire();
    return api(action, { path: path, data: data, id: id }).then(function (r) {
      inflight--; writeSeq++; if (r.data && action !== 'delete') store[key] = r.data; if (r.ver) ver = r.ver; fire(); return r;
    }, function (e) {
      inflight--; writeSeq++; if (had) store[key] = before; else delete store[key]; fire(); throw e;
    });
  }
  function mdoc(path) {
    return { id: path.split('/').pop(), path: path,
      get: function () { return /^plotdocs\//.test(path) ? api('get', { path: path }).then(function (r) { if (r.exists) store[path] = r.data; return { id: path.split('/').pop(), exists: r.exists, data: function () { return r.exists ? r.data : undefined; } }; }) : Promise.resolve(snapDoc(path)); },
      set: function (d) { return write('set', path, d).then(function () {}); },
      update: function (d) { return write('update', path, d).then(function () {}); },
      delete: function () { return write('delete', path).then(function () {}); },
      onSnapshot: function (cb) { var l = { path: path, cb: cb, col: false }; listeners.push(l); setTimeout(function () { cb(snapDoc(path)); }, 0); return function () { listeners = listeners.filter(function (x) { return x !== l; }); }; },
      collection: function (p) { return mcol(path + '/' + p); } };
  }
  function mcol(path) {
    return { path: path, doc: function (id) { return mdoc(path + '/' + (id || rid())); },
      add: function (d) { var id = rid(); return write('add', path, d, id).then(function () { return mdoc(path + '/' + id); }); },
      onSnapshot: function (cb) { var l = { path: path, cb: cb, col: true }; listeners.push(l); setTimeout(function () { cb(snapCol(path)); }, 0); return function () { listeners = listeners.filter(function (x) { return x !== l; }); }; } };
  }
  var db = { doc: mdoc, collection: mcol };
  var user = {
    isOwner: function () { return Promise.resolve(!!(me && me.admin)); }, canEdit: function () { return Promise.resolve(!!(me && me.admin)); }, can: function () { return Promise.resolve(!(me && me.guest)); },
    id: function () { return Promise.resolve(me.uid); },
    me: function () { var p = store['partners/' + me.uid]; return Promise.resolve({ id: me.uid, name: (p && p.name) || '', isOwner: me.admin, canEdit: me.admin }); },
    profiles: function (ids) { var o = {}; [].concat(ids).forEach(function (i) { var p = store['partners/' + i]; o[i] = { id: i, name: (p && p.name) || '', isMe: me && i === me.uid }; }); return Promise.resolve(o); }
  };

  /* ---------- files ---------- */
  function toB64(blob) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.onerror = rej; fr.readAsDataURL(blob); }); }
  var assets = {
    upload: function (blob, kind) {
      return toB64(blob).then(function (b64) { return api('upload', { kind: kind === 'doc' ? 'doc' : 'media', mime: blob.type || 'image/jpeg', b64: b64 }); }).then(function (r) {
        local[r.id] = blob; return { id: r.id, url: '_blob/' + r.id, sizeBytes: blob.size, contentType: blob.type };
      });
    },
    delete: function (id) { delete local[id]; return api('deletefile', { id: id }).then(function () {}); },
    list: function () { return Promise.resolve({ assets: [] }); }
  };
  function fetchBlob(id) {
    if (local[id]) return local[id].arrayBuffer().then(function (b) { return { mime: local[id].type, buf: b }; });
    return api('file', { id: id }).then(function (r) {
      var bin = atob(r.b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return { mime: r.mime, buf: u.buffer };
    });
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (ev) {
      var d = ev.data, port = ev.ports && ev.ports[0]; if (!d || d.type !== 'blob?' || !port) return;
      fetchBlob(d.id).then(function (r) { port.postMessage({ mime: r.mime, buf: r.buf }, [r.buf]); }, function () { port.postMessage({ error: true }); });
    });
  }
  var downloads = { save: function (x) {
    var b = new Blob([x.data], { type: 'text/csv;charset=utf-8' }), u = URL.createObjectURL(b), a = document.createElement('a');
    a.href = u; a.download = x.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); return Promise.resolve();
  } };

  /* ---------- runtime facade ---------- */
  var swReady = ('serviceWorker' in navigator) ? navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function () {
    if (navigator.serviceWorker.controller) return; return new Promise(function (res) { navigator.serviceWorker.addEventListener('controllerchange', function () { res(); }, { once: true }); setTimeout(res, 3000); });
  }).catch(function () {}) : Promise.resolve();
  window.claude = { use: function (name) {
    return Promise.all([ready(), swReady]).then(function () { return ({ db: db, user: user, assets: assets, downloads: downloads })[name] || null; }, function () { return null; });
  } };
  window.__pr = { sync: sync, pid: function () { return pid; }, role: function () { return role; },
    switchRole: function () { chooser('', authed()); },
    enquire: function (d) { return api('enquire', d); },
    signOut: function () { lsSet(CKEY, ''); lsSet(RKEY, ''); location.reload(); },
    useProfile: function (id) { if (/^p[a-z0-9]{8,24}$/.test(id)) { lsSet(PKEY, id); location.reload(); } } };
  document.addEventListener('DOMContentLoaded', function () { ensureAuth(); });
})();
