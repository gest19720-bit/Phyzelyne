/**
 * Phyzelyne App — app.js
 * Auth · Store · Utilities · Sidebar · Currency · AI Analysis
 */

'use strict';

/* ══════════════════════════════════════
   SUPABASE CLIENT
   ⚠️  Paste your Project URL and anon key from
   Supabase Dashboard → Settings → API
   Use window.__PHYZELYNE_SUPABASE_URL__ / __KEY__
   for build-time injection (recommended).
══════════════════════════════════════ */
const SUPABASE_URL = window.__PHYZELYNE_SUPABASE_URL__ || 'https://ecxjttbbesbjpisealrp.supabase.co';
const SUPABASE_KEY = window.__PHYZELYNE_SUPABASE_KEY__ || 'sb_publishable__qiqb1L9zW6Q4guscaGvbA_4r0daTME';

const _sb = (typeof supabase !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null; // graceful degradation if CDN not loaded yet

/* ── In-memory cache (keeps all HTML reads synchronous) ────────────── */
const _cache = {
  transactions: null,  // null = not yet loaded; [] = loaded but empty
  settings:     null,
  goals:        null,
  invoices:     null,
  receipts:     null,
  ready:        false,
  userId:       null,
};

/* ── Write queue — captures upserts/deletes that fire before _initData
   completes (i.e. before _cache.userId is populated) and replays them
   once the user id is known. This ensures no user data is silently lost
   when a write happens during the auth/data-load window. ────────────── */
const _writeQueue = [];
let   _writeQueueFlushing = false;
let   _remoteSyncTimer = null;
let   _realtimeChannel = null;
let   _remoteSyncInFlight = false;
const _inFlightWrites = new Set();

const _PERSISTED_TABLES = ['transactions', 'settings', 'goals', 'invoices', 'receipts'];

function _storageUserId() {
  const authUser = (typeof Auth !== 'undefined') ? Auth.getUser?.() : null;
  return _cache.userId || authUser?.id || 'anonymous';
}

function _localKey(table) {
  return `phyzelyne_backup_${_storageUserId()}_${table}`;
}

function _pendingKey() {
  return `phyzelyne_pending_sync_${_storageUserId()}`;
}

function _readLocal(table, fallback) {
  try {
    const raw = localStorage.getItem(_localKey(table));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function _writeLocal(table, value) {
  try {
    localStorage.setItem(_localKey(table), JSON.stringify(value));
  } catch (e) {
    console.warn('[Phyzelyne] local backup failed', table, e.message);
  }
}

function _readPendingSync() {
  try {
    return JSON.parse(localStorage.getItem(_pendingKey()) || '[]');
  } catch {
    return [];
  }
}

function _writePendingSync(list) {
  try {
    localStorage.setItem(_pendingKey(), JSON.stringify(list));
  } catch (e) {
    console.warn('[Phyzelyne] pending sync backup failed', e.message);
  }
}

function _queuePendingSync(op) {
  const list = _readPendingSync();
  const id = op.row?.id || op.id || 'settings';
  const deduped = list.filter(x => !(x.table === op.table && (x.row?.id || x.id || 'settings') === id));
  deduped.push({ ...op, queuedAt: new Date().toISOString() });
  _writePendingSync(deduped);
}

function _pendingIds(table, type) {
  return new Set(_readPendingSync()
    .filter(op => op.table === table && op.type === type)
    .map(op => op.row?.id || op.id || 'settings'));
}

function _mergeRows(remoteRows, localRows, table) {
  const remote = Array.isArray(remoteRows) ? remoteRows : [];
  const local = Array.isArray(localRows) ? localRows : [];
  const pendingUpserts = _pendingIds(table, 'upsert');
  const pendingDeletes = _pendingIds(table, 'delete');
  const byId = new Map();

  local.forEach(row => {
    if (row?.id && !pendingDeletes.has(row.id)) byId.set(row.id, row);
  });
  remote.forEach(row => {
    if (!row?.id || pendingDeletes.has(row.id)) return;
    if (!pendingUpserts.has(row.id)) byId.set(row.id, row);
  });

  return Array.from(byId.values());
}

function _mergeRemoteRows(remoteRows, localRows, table) {
  return _mergeRows(remoteRows, localRows, table);
}

function _mergeSettings(remoteSettings, localSettings) {
  if (_pendingIds('settings', 'upsert').has('settings') || _inFlightWrites.has('settings')) {
    return { ...(remoteSettings || {}), ...(localSettings || {}) };
  }
  return { ...(localSettings || {}), ...(remoteSettings || {}) };
}

function _stripUserId(row) {
  if (!row || typeof row !== 'object') return row;
  const clean = { ...row };
  delete clean.user_id;
  return clean;
}

function _stripUserIds(rows) {
  return Array.isArray(rows) ? rows.map(_stripUserId) : [];
}

function _persistCache(table) {
  if (!_PERSISTED_TABLES.includes(table)) return;
  _writeLocal(table, _cache[table] || (table === 'settings' ? {} : []));
}

function _persistAllCache() {
  _PERSISTED_TABLES.forEach(_persistCache);
}

function _adoptAnonymousLocalData() {
  if (!_cache.userId || _cache.userId === 'anonymous') return;
  const currentUid = _cache.userId;
  const oldUid = 'anonymous';

  _PERSISTED_TABLES.forEach(table => {
    try {
      const oldRaw = localStorage.getItem(`phyzelyne_backup_${oldUid}_${table}`);
      if (!oldRaw) return;
      const oldData = JSON.parse(oldRaw);
      const newRaw = localStorage.getItem(`phyzelyne_backup_${currentUid}_${table}`);
      const newData = newRaw ? JSON.parse(newRaw) : (table === 'settings' ? {} : []);
      const merged = table === 'settings'
        ? _mergeSettings(newData, oldData)
        : _mergeRows(newData, oldData, table);
      localStorage.setItem(`phyzelyne_backup_${currentUid}_${table}`, JSON.stringify(merged));
      localStorage.removeItem(`phyzelyne_backup_${oldUid}_${table}`);
    } catch {}
  });

  try {
    const oldRaw = localStorage.getItem(`phyzelyne_pending_sync_${oldUid}`);
    if (oldRaw) {
      const oldOps = JSON.parse(oldRaw);
      const newOps = _readPendingSync();
      _writePendingSync([...newOps, ...oldOps]);
      localStorage.removeItem(`phyzelyne_pending_sync_${oldUid}`);
    }
  } catch {}
}

async function _syncCacheToSupabase() {
  if (!_cache.userId || !_sb) return;
  const uid = _cache.userId;
  const ops = [
    ...(_cache.transactions || []).map(row => ({ table: 'transactions', row })),
    ...(_cache.goals || []).map(row => ({ table: 'goals', row })),
    ...(_cache.invoices || []).map(row => ({ table: 'invoices', row })),
    ...(_cache.receipts || []).map(row => ({ table: 'receipts', row })),
  ];
  if (_cache.settings && Object.keys(_cache.settings).length) {
    ops.push({ table: 'settings', row: _cache.settings });
  }

  for (const op of ops) {
    await _upsert(op.table, { ...op.row, user_id: uid });
  }
}

async function _loadRemoteData(uid) {
  const [txRes, stRes, goRes, invRes, recRes] = await Promise.all([
    _sb.from('transactions').select('*').eq('user_id', uid).order('date', { ascending: false }),
    _sb.from('settings').select('*').eq('user_id', uid).maybeSingle(),
    _sb.from('goals').select('*').eq('user_id', uid),
    _sb.from('invoices').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    _sb.from('receipts').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
  ]);

  return {
    transactions: _stripUserIds(txRes.data || []),
    settings: _stripUserId(stRes.data || {}) || {},
    goals: _stripUserIds(goRes.data || []),
    invoices: _stripUserIds(invRes.data || []),
    receipts: _stripUserIds(recRes.data || []),
  };
}

async function _refreshCacheFromSupabase({ notify = true, preserveLocal = true } = {}) {
  if (!_cache.userId || !_sb) return false;
  if (_remoteSyncInFlight) return false;
  _remoteSyncInFlight = true;
  const uid = _cache.userId;
  try {
    const remote = await _loadRemoteData(uid);
    const mergeRows = preserveLocal ? _mergeRows : _mergeRemoteRows;
    
    // Track cache state before merge to detect real changes
    const oldTxns = JSON.stringify(_cache.transactions);
    const oldGoals = JSON.stringify(_cache.goals);
    const oldInvoices = JSON.stringify(_cache.invoices);
    const oldReceipts = JSON.stringify(_cache.receipts);
    const oldSettings = JSON.stringify(_cache.settings);

    _cache.transactions = mergeRows(remote.transactions, _readLocal('transactions', _cache.transactions || []), 'transactions');
    _cache.goals        = mergeRows(remote.goals, _readLocal('goals', _cache.goals || []), 'goals');
    _cache.invoices     = mergeRows(remote.invoices, _readLocal('invoices', _cache.invoices || []), 'invoices');
    _cache.receipts     = mergeRows(remote.receipts, _readLocal('receipts', _cache.receipts || []), 'receipts');
    _cache.settings     = _mergeSettings(remote.settings, _readLocal('settings', _cache.settings || {}));

    const changed = 
      oldTxns !== JSON.stringify(_cache.transactions) ||
      oldGoals !== JSON.stringify(_cache.goals) ||
      oldInvoices !== JSON.stringify(_cache.invoices) ||
      oldReceipts !== JSON.stringify(_cache.receipts) ||
      oldSettings !== JSON.stringify(_cache.settings);

    _persistAllCache();
    if (notify && changed) {
      document.dispatchEvent(new CustomEvent('phyzelyne:data-changed', { detail: { type: 'all', source: 'remote-sync' } }));
    }
    return true;
  } catch (e) {
    console.warn('[Phyzelyne] remote sync failed', e.message);
    return false;
  } finally {
    _remoteSyncInFlight = false;
  }
}

function _startRemoteSync() {
  if (_remoteSyncTimer || !_cache.userId || !_sb) return;
  _remoteSyncTimer = setInterval(() => {
    if (!document.hidden) _refreshCacheFromSupabase({ preserveLocal: true }).then(() => _flushWriteQueue()).catch(() => {});
  }, 10000);
}

function _upsertOptions(table) {
  return { onConflict: table === 'settings' ? 'user_id' : 'id' };
}

function _afterRemoteWrite(table, promise) {
  Promise.resolve(promise)
    .then(() => {
      _broadcastChange(table);
      return _refreshCacheFromSupabase({ notify: false, preserveLocal: true });
    })
    .catch(() => {});
}

async function _flushWriteQueue() {
  if (_writeQueueFlushing || !_cache.userId || !_sb) return;
  _writeQueueFlushing = true;
  const pending = _readPendingSync();
  _writePendingSync([]);
  _writeQueue.push(...pending);
  const failed = [];

  while (_writeQueue.length) {
    const op = _writeQueue.shift();
    try {
	      if (op.type === 'upsert') {
	        const { error } = await _sb.from(op.table).upsert({ ...op.row, user_id: _cache.userId }, _upsertOptions(op.table));
	        if (error) throw error;
	      } else if (op.type === 'delete') {
	        const { error } = await _sb.from(op.table).delete().eq('id', op.id).eq('user_id', _cache.userId);
	        if (error) throw error;
	      }
    } catch (e) {
      console.error('[Phyzelyne] write-queue replay', op.table, e.message);
      failed.push(op);
    }
  }
  if (failed.length) _writePendingSync(failed);
  _writeQueueFlushing = false;
}

/* ── Cross-tab data sync (BroadcastChannel) ─────────────────────────────────
   When any tab calls a Store mutation (addTransaction, deleteTransaction, etc.)
   it broadcasts a lightweight message.  Every other open Phyzelyne tab receives it,
   re-fetches the affected table from Supabase, then fires 'phyzelyne:data-changed'
   on the DOM so the page can re-render — giving the dashboard instant updates
   whenever the user adds a transaction on the Transactions page (and vice-versa).
   Falls back silently where BroadcastChannel is unavailable (e.g. some iframes).
────────────────────────────────────────────────────────────────────────────── */
const _phyzelyneChannel = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('phyzelyne_data_sync')
  : null;

function _applySettingsSideEffects(raw) {
  try {
    if (raw.darkMode !== undefined) {
      localStorage.setItem('phyzelyne_theme', raw.darkMode ? 'dark' : 'light');
      if (raw.darkMode) {
        document.body.classList.add('dark');
        document.documentElement.classList.add('dark-pre');
      } else {
        document.body.classList.remove('dark');
        document.documentElement.classList.remove('dark-pre');
      }
    }
    if (raw.accentTheme !== undefined) {
      localStorage.setItem('phyzelyne_accent', raw.accentTheme);
      _applyAccentTheme(raw.accentTheme);
    }
  } catch {}
}

function _handlePostgresChange(table, payload) {
  if (!_cache.ready || !_cache.userId) return false;
  const eventType = payload.eventType; // 'INSERT', 'UPDATE', 'DELETE'
  const newRow = payload.new;
  const oldRow = payload.old;

  if (table === 'settings') {
    if (eventType === 'DELETE') {
      if (Object.keys(_cache.settings || {}).length === 0) return false;
      _cache.settings = {};
    } else if (newRow) {
      const raw = { ...newRow };
      delete raw.user_id;
      const oldStr = JSON.stringify(_cache.settings);
      _cache.settings = _mergeSettings(raw, _readLocal('settings', _cache.settings || {}));
      _applySettingsSideEffects(raw);
      if (oldStr === JSON.stringify(_cache.settings)) return false;
    }
    _persistCache('settings');
    return true;
  }

  let list = _cache[table] || [];
  let changed = false;

  if (eventType === 'INSERT') {
    if (newRow && newRow.id) {
      const cleanRow = _stripUserId(newRow);
      const idx = list.findIndex(item => item.id === cleanRow.id);
      if (idx === -1) {
        if (['transactions', 'invoices', 'receipts'].includes(table)) {
          list.unshift(cleanRow);
        } else {
          list.push(cleanRow);
        }
        changed = true;
      }
    }
  } else if (eventType === 'UPDATE') {
    if (newRow && newRow.id) {
      const cleanRow = _stripUserId(newRow);
      const idx = list.findIndex(item => item.id === cleanRow.id);
      if (idx !== -1) {
        const oldStr = JSON.stringify(list[idx]);
        list[idx] = { ...list[idx], ...cleanRow };
        if (oldStr !== JSON.stringify(list[idx])) {
          changed = true;
        }
      } else {
        if (['transactions', 'invoices', 'receipts'].includes(table)) {
          list.unshift(cleanRow);
        } else {
          list.push(cleanRow);
        }
        changed = true;
      }
    }
  } else if (eventType === 'DELETE') {
    if (oldRow && oldRow.id) {
      const originalLength = list.length;
      list = list.filter(item => item.id !== oldRow.id);
      if (list.length !== originalLength) {
        changed = true;
      }
    }
  }

  if (changed) {
    _cache[table] = list;
    _persistCache(table);
    return true;
  }
  return false;
}

async function _syncTableFromRemote(table) {
  if (!_cache.userId || !_sb) return;
  const uid = _cache.userId;
  try {
    if (table === 'transactions' || table === 'all') {
      const { data } = await _sb.from('transactions').select('*').eq('user_id', uid).order('date', { ascending: false });
	      if (data) _cache.transactions = _mergeRemoteRows(_stripUserIds(data), _readLocal('transactions', _cache.transactions || []), 'transactions');
    }
    if (table === 'goals' || table === 'all') {
      const { data } = await _sb.from('goals').select('*').eq('user_id', uid);
	      if (data) _cache.goals = _mergeRemoteRows(_stripUserIds(data), _readLocal('goals', _cache.goals || []), 'goals');
    }
    if (table === 'settings' || table === 'all') {
      const { data } = await _sb.from('settings').select('*').eq('user_id', uid).maybeSingle();
      if (data) {
        const raw = { ...data };
        delete raw.user_id;
	        _cache.settings = _mergeSettings(raw, _readLocal('settings', _cache.settings || {}));
        _applySettingsSideEffects(raw);
      }
    }
    if (table === 'invoices' || table === 'all') {
      const { data } = await _sb.from('invoices').select('*').eq('user_id', uid).order('created_at', { ascending: false });
	      if (data) _cache.invoices = _mergeRemoteRows(_stripUserIds(data), _readLocal('invoices', _cache.invoices || []), 'invoices');
    }
    if (table === 'receipts' || table === 'all') {
      const { data } = await _sb.from('receipts').select('*').eq('user_id', uid).order('created_at', { ascending: false });
	      if (data) _cache.receipts = _mergeRemoteRows(_stripUserIds(data), _readLocal('receipts', _cache.receipts || []), 'receipts');
    }
    _persistAllCache();
  } catch (e) {
    console.warn('[Phyzelyne Realtime] failed to sync table:', table, e.message);
  }
}

function _broadcastChange(type, op) {
  try { _phyzelyneChannel?.postMessage({ type: type || 'transactions', op, ts: Date.now() }); } catch {}
}

function _initDataSync() {
  if (!_phyzelyneChannel) return;
  _phyzelyneChannel.onmessage = async (evt) => {
    if (!_cache.ready || !_cache.userId || !_sb) return;
    const t = evt.data?.type || 'transactions';
    const op = evt.data?.op;
    if (op) {
      const updated = _handlePostgresChange(t, op);
      if (updated) {
        document.dispatchEvent(new CustomEvent('phyzelyne:data-changed', { detail: evt.data }));
      }
    } else {
      await _syncTableFromRemote(t);
      document.dispatchEvent(new CustomEvent('phyzelyne:data-changed', { detail: evt.data }));
    }
  };
}

async function _initRealtimeSync() {
  if (!_cache.userId || !_sb) return;
  const uid = _cache.userId;

  if (_realtimeChannel) {
    try {
      _sb.removeChannel(_realtimeChannel);
    } catch {}
    _realtimeChannel = null;
  }

  const channelName = `phyzelyne_user_${uid}`;
  _realtimeChannel = _sb.channel(channelName);

  _PERSISTED_TABLES.forEach(table => {
    _realtimeChannel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: table, filter: `user_id=eq.${uid}` },
      async (payload) => {
        console.log('[Phyzelyne Realtime] DB change event received for:', table, payload.eventType);
        const updated = _handlePostgresChange(table, payload);
        if (updated) {
          document.dispatchEvent(new CustomEvent('phyzelyne:data-changed', { detail: { type: table, source: 'postgres-changes', payload } }));
        }
      }
    );
  });

  _realtimeChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[Phyzelyne Realtime] Subscribed to realtime channel:', channelName);
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    _flushWriteQueue().then(() => _refreshCacheFromSupabase()).then(() => _syncCacheToSupabase()).catch(() => {});
  });
  window.addEventListener('focus', () => {
    _refreshCacheFromSupabase().then(() => _flushWriteQueue()).catch(() => {});
  });
  window.addEventListener('pageshow', () => {
    _refreshCacheFromSupabase().then(() => _flushWriteQueue()).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) _refreshCacheFromSupabase().then(() => _flushWriteQueue()).catch(() => {});
  });
}

/* ── Session cache for synchronous Auth.getUser() calls ────────────── */
let _sessionCache = null;
if (_sb) {
  _sb.auth.getSession().then(({ data: { session } }) => {
    if (session) { _sessionCache = session.user; _cache.userId = session.user.id; }
  });
	  _sb.auth.onAuthStateChange((event, session) => {
	    _sessionCache = session?.user || null;
	    _cache.userId = session?.user?.id || null;
	    if (!session?.user && _remoteSyncTimer) {
	      clearInterval(_remoteSyncTimer);
	      _remoteSyncTimer = null;
	    }

    // SIGNED_IN fires when an OAuth callback lands (detectSessionInUrl picks it up).
    // We need to boot _initData here so protected pages get their data even when
    // the page loaded before the OAuth redirect completed.
    if (event === 'SIGNED_IN' && session?.user && !_cache.ready) {
      _initData().then(() => {
        // Route new OAuth users (not yet onboarded) to onboarding.
        const page = window.location.pathname.split('/').pop() || '';
        const skipCheck = ['onboarding.html', 'login.html', 'signup.html', 'index.html', ''].includes(page);
        if (!skipCheck && !session.user.user_metadata?.onboarded) {
          window.location.replace('onboarding.html');
        }
      });
    }
  });
}

/* ── Async helpers for Supabase writes ─────────────────────────────── */
function _genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
async function _upsert(table, rowOrRows) {
  if (!_sb) {
    if (Array.isArray(rowOrRows)) {
      rowOrRows.forEach(row => _queuePendingSync({ type: 'upsert', table, row: { ...row } }));
    } else {
      _queuePendingSync({ type: 'upsert', table, row: { ...rowOrRows } });
    }
    return;
  }
  if (!_cache.userId) {
    // Auth hasn't resolved yet — queue for replay once userId is set
    if (Array.isArray(rowOrRows)) {
      rowOrRows.forEach(row => {
        _writeQueue.push({ type: 'upsert', table, row: { ...row } });
        _queuePendingSync({ type: 'upsert', table, row: { ...row } });
      });
    } else {
      _writeQueue.push({ type: 'upsert', table, row: { ...rowOrRows } });
      _queuePendingSync({ type: 'upsert', table, row: { ...rowOrRows } });
    }
    return;
  }

  // Track in-flight writes to prevent disappearing from UI during active sync
  let idsToTrack = [];
  if (Array.isArray(rowOrRows)) {
    idsToTrack = rowOrRows.map(row => row.id).filter(Boolean);
  } else {
    idsToTrack = [rowOrRows.id || (table === 'settings' ? 'settings' : null)].filter(Boolean);
  }
  idsToTrack.forEach(id => _inFlightWrites.add(id));

  let payload = Array.isArray(rowOrRows)
    ? rowOrRows.map(row => ({ ...row, user_id: _cache.userId }))
    : { ...rowOrRows, user_id: _cache.userId };

  if (table === 'transactions') {
    // Keep image payload intact for Supabase sync
  }

  try {
    const { error } = await _sb.from(table).upsert(payload, _upsertOptions(table));
    if (error) {
      console.error('[Phyzelyne] upsert error:', table, error.message);
      if (Array.isArray(rowOrRows)) {
        rowOrRows.forEach(row => _queuePendingSync({ type: 'upsert', table, row: { ...row } }));
      } else {
        _queuePendingSync({ type: 'upsert', table, row: { ...rowOrRows } });
      }
    }
  } catch (e) {
    console.warn('[Phyzelyne] upsert network failure:', table, e.message);
    if (Array.isArray(rowOrRows)) {
      rowOrRows.forEach(row => _queuePendingSync({ type: 'upsert', table, row: { ...row } }));
    } else {
      _queuePendingSync({ type: 'upsert', table, row: { ...rowOrRows } });
    }
  } finally {
    idsToTrack.forEach(id => _inFlightWrites.delete(id));
  }
}

async function _sbDelete(table, id) {
  if (!_sb) {
    _queuePendingSync({ type: 'delete', table, id });
    return;
  }
  if (!_cache.userId) {
    _writeQueue.push({ type: 'delete', table, id });
    _queuePendingSync({ type: 'delete', table, id });
    return;
  }
  try {
    const { error } = await _sb.from(table).delete().eq('id', id).eq('user_id', _cache.userId);
    if (error) {
      console.error('[Phyzelyne] delete error:', table, error.message);
      _queuePendingSync({ type: 'delete', table, id });
    }
  } catch (e) {
    console.warn('[Phyzelyne] delete network failure:', table, e.message);
    _queuePendingSync({ type: 'delete', table, id });
  }
}

/* ── Load all user data into cache (called after auth) ─────────────── */
async function _initData() {
  if (!_cache.userId || !_sb) return;
  _adoptAnonymousLocalData();
  const loaded = await _refreshCacheFromSupabase({ notify: false, preserveLocal: true });
  if (!loaded) {
    _cache.transactions = _readLocal('transactions', []);
    _cache.settings     = _readLocal('settings', {});
    _cache.goals        = _readLocal('goals', []);
    _cache.invoices     = _readLocal('invoices', []);
    _cache.receipts     = _readLocal('receipts', []);
  }
  _persistAllCache();
  _cache.ready = true;
  _initDataSync();      // start listening for cross-tab data changes
  _initRealtimeSync();  // start listening for remote device data changes
  _startRemoteSync();   // keep multiple logged-in devices converged
  await _flushWriteQueue();      // replay any writes that arrived before userId was set
  await _syncCacheToSupabase();  // upload device-only records for same-account sync
  migrateFromLocalStorage();     // one-shot: move any old localStorage data to Supabase
  document.dispatchEvent(new Event('phyzelyne:ready'));

  // Boot subscription reminders after data is loaded
  try { SubReminder.start(); } catch (e) { /* SubReminder not available */ }
}

/* ══════════════════════════════════════
   ACCENT COLOUR THEMES
   20 selectable accent palettes. Replaces
   --gold / --gold-light / --gold-dim /
   --gold-border / --accent-rgb everywhere.
══════════════════════════════════════ */
const THEMES = [
  { id: 'gold',      name: 'Electric Violet', accent: '#a855f7', light: '#6366f1', rgb: '139,92,246' },
  { id: 'emerald',   name: 'Emerald',      accent: '#1f9d6e', light: '#34c98c', rgb: '31,157,110' },
  { id: 'sapphire',  name: 'Sapphire',     accent: '#2f6fed', light: '#5b93ff', rgb: '47,111,237' },
  { id: 'rose',      name: 'Rose',         accent: '#e0457b', light: '#f078a3', rgb: '224,69,123' },
  { id: 'sunset',    name: 'Sunset',       accent: '#e8742c', light: '#f5a45c', rgb: '232,116,44' },
  { id: 'violet',    name: 'Violet',       accent: '#7c3aed', light: '#a78bfa', rgb: '124,58,237' },
  { id: 'teal',      name: 'Ocean Teal',   accent: '#0d9488', light: '#2dd4bf', rgb: '13,148,136' },
  { id: 'crimson',   name: 'Crimson',      accent: '#c2483f', light: '#e2746a', rgb: '194,72,63'  },
  { id: 'graphite',  name: 'Graphite',     accent: '#51596b', light: '#7c8597', rgb: '81,89,107'  },
  { id: 'indigo',    name: 'Indigo',       accent: '#4338ca', light: '#6366f1', rgb: '67,56,202'  },
  { id: 'cyan',      name: 'Cyan Breeze',  accent: '#0891b2', light: '#22d3ee', rgb: '8,145,178'  },
  { id: 'amber',     name: 'Amber',        accent: '#d97706', light: '#fbbf24', rgb: '217,119,6'  },
  { id: 'fuchsia',   name: 'Fuchsia',      accent: '#c026d3', light: '#e879f9', rgb: '192,38,211' },
  { id: 'mint',      name: 'Mint',         accent: '#059669', light: '#6ee7b7', rgb: '5,150,105'  },
  { id: 'coral',     name: 'Coral',        accent: '#fb7185', light: '#fda4af', rgb: '251,113,133'},
  { id: 'steel',     name: 'Steel Blue',   accent: '#3b6e8f', light: '#6fa8c9', rgb: '59,110,143' },
  { id: 'lime',      name: 'Lime',         accent: '#65a30d', light: '#a3e635', rgb: '101,163,13' },
  { id: 'burgundy',  name: 'Burgundy',     accent: '#9f1239', light: '#be123c', rgb: '159,18,57'  },
  { id: 'bronze',    name: 'Bronze',       accent: '#8a5a2b', light: '#b9824a', rgb: '138,90,43'  },
  { id: 'turquoise', name: 'Turquoise',    accent: '#0e9594', light: '#2dd4bf', rgb: '14,149,148' },
];

function _applyAccentTheme(id) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  const root = document.documentElement.style;
  root.setProperty('--gold', t.accent);
  root.setProperty('--gold-light', t.light);
  root.setProperty('--gold-dim', `rgba(${t.rgb},0.18)`);
  root.setProperty('--gold-border', `rgba(${t.rgb},0.3)`);
  root.setProperty('--accent-rgb', t.rgb);
  return t;
}

/* Public API — used by the Settings page theme picker.
   Theme.apply() updates the CSS variables instantly (no reload, no
   save button needed) and persists the choice the same way Dark
   Mode does: into Store/Supabase settings + a localStorage mirror. */
const Theme = {
  list() { return THEMES; },
  current() {
    const s = (typeof Store !== 'undefined') ? Store.getSettings() : {};
    return s.accentTheme || localStorage.getItem('phyzelyne_accent') || 'gold';
	  },
	  apply(id) {
	    const t = _applyAccentTheme(id);
    try { localStorage.setItem('phyzelyne_accent', t.id); } catch {}
    if (typeof Store !== 'undefined') {
      const s = Store.getSettings();
      s.accentTheme = t.id;
      Store.saveSettings(s);
    }
    return t;
  },
};

/* ══════════════════════════════════════
   THEME PERSISTENCE — apply before render
   Falls back to localStorage for guests /
   before Supabase settings are loaded.
══════════════════════════════════════ */
(function() {
  try {
    // Try Supabase cache first (populated by _initData after login)
    // On first paint it won't be ready yet, so we also keep a localStorage mirror
    const localTheme = localStorage.getItem('phyzelyne_theme') || 'light';
    if (localTheme === 'dark') document.documentElement.classList.add('dark-pre');

    // Accent colour theme — also mirrored to localStorage so it survives
    // before Supabase settings load, same pattern as dark mode above.
    const localAccent = localStorage.getItem('phyzelyne_accent');
    if (localAccent) _applyAccentTheme(localAccent);
  } catch {}
})();

/* ══════════════════════════════════════
   WORLD CURRENCY LIST
   Symbol + name for every major currency.
   formatCurrency() reads from here so
   changing currency in Settings instantly
   updates every number across the app.
══════════════════════════════════════ */
const CURRENCIES = [
  // ── Major ──────────────────────────────────────────────────────────────────
  { code:'USD', symbol:'$',    name:'US Dollar' },
  { code:'EUR', symbol:'€',    name:'Euro' },
  { code:'GBP', symbol:'£',    name:'British Pound' },
  { code:'JPY', symbol:'¥',    name:'Japanese Yen' },
  { code:'CHF', symbol:'Fr',   name:'Swiss Franc' },
  { code:'CAD', symbol:'CA$',  name:'Canadian Dollar' },
  { code:'AUD', symbol:'A$',   name:'Australian Dollar' },
  { code:'NZD', symbol:'NZ$',  name:'New Zealand Dollar' },
  { code:'SGD', symbol:'S$',   name:'Singapore Dollar' },
  { code:'HKD', symbol:'HK$',  name:'Hong Kong Dollar' },
  // ── Europe ─────────────────────────────────────────────────────────────────
  { code:'SEK', symbol:'kr',   name:'Swedish Krona' },
  { code:'NOK', symbol:'kr',   name:'Norwegian Krone' },
  { code:'DKK', symbol:'kr',   name:'Danish Krone' },
  { code:'PLN', symbol:'zł',   name:'Polish Zloty' },
  { code:'CZK', symbol:'Kč',   name:'Czech Koruna' },
  { code:'HUF', symbol:'Ft',   name:'Hungarian Forint' },
  { code:'RON', symbol:'lei',  name:'Romanian Leu' },
  { code:'BGN', symbol:'лв',   name:'Bulgarian Lev' },
  { code:'HRK', symbol:'kn',   name:'Croatian Kuna' },
  { code:'UAH', symbol:'₴',    name:'Ukrainian Hryvnia' },
  { code:'RUB', symbol:'₽',    name:'Russian Ruble' },
  { code:'TRY', symbol:'₺',    name:'Turkish Lira' },
  { code:'ILS', symbol:'₪',    name:'Israeli Shekel' },
  { code:'GEL', symbol:'₾',    name:'Georgian Lari' },
  { code:'AMD', symbol:'֏',    name:'Armenian Dram' },
  { code:'AZN', symbol:'₼',    name:'Azerbaijani Manat' },
  { code:'BYN', symbol:'Br',   name:'Belarusian Ruble' },
  { code:'MDL', symbol:'L',    name:'Moldovan Leu' },
  { code:'MKD', symbol:'ден',  name:'Macedonian Denar' },
  { code:'ALL', symbol:'L',    name:'Albanian Lek' },
  { code:'BAM', symbol:'KM',   name:'Bosnian Mark' },
  { code:'RSD', symbol:'din',  name:'Serbian Dinar' },
  { code:'ISK', symbol:'kr',   name:'Icelandic Krona' },
  // ── Africa ─────────────────────────────────────────────────────────────────
  { code:'NGN', symbol:'₦',    name:'Nigerian Naira' },
  { code:'GHS', symbol:'₵',    name:'Ghana Cedi' },
  { code:'ZAR', symbol:'R',    name:'South African Rand' },
  { code:'KES', symbol:'KSh',  name:'Kenyan Shilling' },
  { code:'EGP', symbol:'E£',   name:'Egyptian Pound' },
  { code:'MAD', symbol:'MAD',  name:'Moroccan Dirham' },
  { code:'ETB', symbol:'Br',   name:'Ethiopian Birr' },
  { code:'TZS', symbol:'TSh',  name:'Tanzanian Shilling' },
  { code:'UGX', symbol:'USh',  name:'Ugandan Shilling' },
  { code:'XOF', symbol:'CFA',  name:'West African CFA Franc' },
  { code:'XAF', symbol:'FCFA', name:'Central African CFA Franc' },
  { code:'TND', symbol:'DT',   name:'Tunisian Dinar' },
  { code:'DZD', symbol:'DA',   name:'Algerian Dinar' },
  { code:'LYD', symbol:'LD',   name:'Libyan Dinar' },
  { code:'SDG', symbol:'SDG',  name:'Sudanese Pound' },
  { code:'ZMW', symbol:'ZK',   name:'Zambian Kwacha' },
  { code:'BWP', symbol:'P',    name:'Botswana Pula' },
  { code:'MZN', symbol:'MT',   name:'Mozambican Metical' },
  { code:'MWK', symbol:'MK',   name:'Malawian Kwacha' },
  { code:'ZWL', symbol:'Z$',   name:'Zimbabwean Dollar' },
  { code:'NAD', symbol:'N$',   name:'Namibian Dollar' },
  { code:'SZL', symbol:'L',    name:'Swazi Lilangeni' },
  { code:'LSL', symbol:'L',    name:'Lesotho Loti' },
  { code:'MGA', symbol:'Ar',   name:'Malagasy Ariary' },
  { code:'RWF', symbol:'FRw',  name:'Rwandan Franc' },
  { code:'BIF', symbol:'Fr',   name:'Burundian Franc' },
  { code:'DJF', symbol:'Fr',   name:'Djiboutian Franc' },
  { code:'ERN', symbol:'Nfk',  name:'Eritrean Nakfa' },
  { code:'SOS', symbol:'Sh',   name:'Somali Shilling' },
  { code:'GMD', symbol:'D',    name:'Gambian Dalasi' },
  { code:'SLL', symbol:'Le',   name:'Sierra Leonean Leone' },
  { code:'LRD', symbol:'L$',   name:'Liberian Dollar' },
  { code:'GNF', symbol:'FG',   name:'Guinean Franc' },
  { code:'CVE', symbol:'$',    name:'Cape Verde Escudo' },
  { code:'STN', symbol:'Db',   name:'São Tomé Dobra' },
  { code:'KMF', symbol:'Fr',   name:'Comorian Franc' },
  { code:'SCR', symbol:'₨',    name:'Seychellois Rupee' },
  { code:'MUR', symbol:'₨',    name:'Mauritian Rupee' },
  { code:'AOA', symbol:'Kz',   name:'Angolan Kwanza' },
  { code:'CDF', symbol:'Fr',   name:'Congolese Franc' },
  // ── Asia ───────────────────────────────────────────────────────────────────
  { code:'INR', symbol:'₹',    name:'Indian Rupee' },
  { code:'CNY', symbol:'¥',    name:'Chinese Yuan' },
  { code:'KRW', symbol:'₩',    name:'South Korean Won' },
  { code:'TWD', symbol:'NT$',  name:'Taiwan Dollar' },
  { code:'PHP', symbol:'₱',    name:'Philippine Peso' },
  { code:'IDR', symbol:'Rp',   name:'Indonesian Rupiah' },
  { code:'MYR', symbol:'RM',   name:'Malaysian Ringgit' },
  { code:'THB', symbol:'฿',    name:'Thai Baht' },
  { code:'VND', symbol:'₫',    name:'Vietnamese Dong' },
  { code:'PKR', symbol:'₨',    name:'Pakistani Rupee' },
  { code:'BDT', symbol:'৳',    name:'Bangladeshi Taka' },
  { code:'LKR', symbol:'₨',    name:'Sri Lankan Rupee' },
  { code:'NPR', symbol:'₨',    name:'Nepalese Rupee' },
  { code:'MMK', symbol:'K',    name:'Myanmar Kyat' },
  { code:'KHR', symbol:'₫',    name:'Cambodian Riel' },
  { code:'LAK', symbol:'₭',    name:'Lao Kip' },
  { code:'MNT', symbol:'₮',    name:'Mongolian Tugrik' },
  { code:'KZT', symbol:'₸',    name:'Kazakhstani Tenge' },
  { code:'UZS', symbol:'soʻm', name:'Uzbekistani Som' },
  { code:'KGS', symbol:'с',    name:'Kyrgyzstani Som' },
  { code:'TJS', symbol:'SM',   name:'Tajikistani Somoni' },
  { code:'TMT', symbol:'T',    name:'Turkmenistani Manat' },
  { code:'AFN', symbol:'؋',    name:'Afghan Afghani' },
  { code:'BND', symbol:'B$',   name:'Brunei Dollar' },
  { code:'BTN', symbol:'Nu',   name:'Bhutanese Ngultrum' },
  { code:'MVR', symbol:'Rf',   name:'Maldivian Rufiyaa' },
  // ── Middle East ────────────────────────────────────────────────────────────
  { code:'AED', symbol:'د.إ',  name:'UAE Dirham' },
  { code:'SAR', symbol:'﷼',    name:'Saudi Riyal' },
  { code:'QAR', symbol:'﷼',    name:'Qatari Riyal' },
  { code:'KWD', symbol:'KD',   name:'Kuwaiti Dinar' },
  { code:'BHD', symbol:'BD',   name:'Bahraini Dinar' },
  { code:'OMR', symbol:'﷼',    name:'Omani Rial' },
  { code:'JOD', symbol:'JD',   name:'Jordanian Dinar' },
  { code:'IQD', symbol:'ع.د',  name:'Iraqi Dinar' },
  { code:'IRR', symbol:'﷼',    name:'Iranian Rial' },
  { code:'LBP', symbol:'L£',   name:'Lebanese Pound' },
  { code:'SYP', symbol:'£',    name:'Syrian Pound' },
  { code:'YER', symbol:'﷼',    name:'Yemeni Rial' },
  // ── Americas ───────────────────────────────────────────────────────────────
  { code:'BRL', symbol:'R$',   name:'Brazilian Real' },
  { code:'MXN', symbol:'MX$',  name:'Mexican Peso' },
  { code:'ARS', symbol:'$',    name:'Argentine Peso' },
  { code:'CLP', symbol:'CL$',  name:'Chilean Peso' },
  { code:'COP', symbol:'CO$',  name:'Colombian Peso' },
  { code:'PEN', symbol:'S/.',  name:'Peruvian Sol' },
  { code:'UYU', symbol:'$U',   name:'Uruguayan Peso' },
  { code:'PYG', symbol:'₲',    name:'Paraguayan Guarani' },
  { code:'BOB', symbol:'Bs.',  name:'Bolivian Boliviano' },
  { code:'VES', symbol:'Bs.S', name:'Venezuelan Bolívar' },
  { code:'GTQ', symbol:'Q',    name:'Guatemalan Quetzal' },
  { code:'HNL', symbol:'L',    name:'Honduran Lempira' },
  { code:'NIO', symbol:'C$',   name:'Nicaraguan Córdoba' },
  { code:'CRC', symbol:'₡',    name:'Costa Rican Colón' },
  { code:'PAB', symbol:'B/.',  name:'Panamanian Balboa' },
  { code:'DOP', symbol:'RD$',  name:'Dominican Peso' },
  { code:'HTG', symbol:'G',    name:'Haitian Gourde' },
  { code:'JMD', symbol:'J$',   name:'Jamaican Dollar' },
  { code:'TTD', symbol:'TT$',  name:'Trinidad Dollar' },
  { code:'BBD', symbol:'Bds$', name:'Barbadian Dollar' },
  { code:'XCD', symbol:'EC$',  name:'East Caribbean Dollar' },
  { code:'BSD', symbol:'B$',   name:'Bahamian Dollar' },
  { code:'GYD', symbol:'G$',   name:'Guyanese Dollar' },
  { code:'SRD', symbol:'$',    name:'Surinamese Dollar' },
  { code:'BZD', symbol:'BZ$',  name:'Belize Dollar' },
  // ── Pacific ────────────────────────────────────────────────────────────────
  { code:'FJD', symbol:'FJ$',  name:'Fijian Dollar' },
  { code:'PGK', symbol:'K',    name:'Papua New Guinean Kina' },
  { code:'WST', symbol:'WS$',  name:'Samoan Tala' },
  { code:'TOP', symbol:'T$',   name:'Tongan Paʻanga' },
  { code:'SBD', symbol:'SI$',  name:'Solomon Islands Dollar' },
  { code:'VUV', symbol:'VT',   name:'Vanuatu Vatu' },
];

/* Returns current currency object — falls back to USD */
function getCurrency() {
  const s = Store.getSettings();
  const code = s.currencyCode || 'USD';
  return CURRENCIES.find(c => c.code === code) || CURRENCIES[0];
}

/* ══════════════════════════════════════
   EXCHANGE RATES (for currency conversion)
   All rates normalized against USD base
══════════════════════════════════════ */
// Exchange rates last updated: May 30, 2026
// Source: XE.com mid-market rates (May 28, 2026) + supplementary data
// All rates = units of currency per 1 USD
const EXCHANGE_RATES = {
  // ── Major ──────────────────────────────────────────────────────────────────
  'USD': 1.0,
  'EUR': 0.8584,    // Euro
  'GBP': 0.7442,    // British Pound
  'JPY': 159.29,    // Japanese Yen
  'CHF': 0.7845,    // Swiss Franc
  'CAD': 1.3800,    // Canadian Dollar
  'AUD': 1.3970,    // Australian Dollar
  'NZD': 1.6875,    // New Zealand Dollar
  'SGD': 1.2763,    // Singapore Dollar
  'HKD': 7.8352,    // Hong Kong Dollar
  // ── Europe ─────────────────────────────────────────────────────────────────
  'SEK': 9.2630,    // Swedish Krona
  'NOK': 9.2568,    // Norwegian Krone
  'DKK': 6.4154,    // Danish Krone
  'PLN': 3.6293,    // Polish Zloty
  'CZK': 20.846,    // Czech Koruna
  'HUF': 303.996,   // Hungarian Forint
  'RON': 4.5045,    // Romanian Leu
  'BGN': 1.6799,    // Bulgarian Lev (pegged to EUR)
  'HRK': 6.4700,    // Croatian Kuna
  'UAH': 44.292,    // Ukrainian Hryvnia
  'RUB': 82.50,     // Russian Ruble (restricted market)
  'TRY': 45.898,    // Turkish Lira
  'ILS': 2.8191,    // Israeli Shekel
  'GEL': 2.6619,    // Georgian Lari
  'AMD': 397.50,    // Armenian Dram
  'AZN': 1.7000,    // Azerbaijani Manat
  'BYN': 3.2700,    // Belarusian Ruble
  'MDL': 17.85,     // Moldovan Leu
  'MKD': 52.91,     // Macedonian Denar
  'ALL': 94.20,     // Albanian Lek
  'BAM': 1.6799,    // Bosnian Mark (pegged to EUR)
  'RSD': 100.50,    // Serbian Dinar
  'ISK': 137.50,    // Icelandic Krona
  // ── Africa ─────────────────────────────────────────────────────────────────
  'NGN': 1374.59,   // Nigerian Naira
  'GHS': 11.66,     // Ghana Cedi (XE.com, May 30 2026)
  'ZAR': 16.268,    // South African Rand
  'KES': 129.509,   // Kenyan Shilling
  'EGP': 52.227,    // Egyptian Pound
  'MAD': 9.1906,    // Moroccan Dirham
  'ETB': 142.00,    // Ethiopian Birr
  'TZS': 2720.00,   // Tanzanian Shilling
  'UGX': 3775.23,   // Ugandan Shilling
  'XOF': 563.09,    // West African CFA Franc
  'XAF': 563.09,    // Central African CFA Franc
  'TND': 2.8982,    // Tunisian Dinar
  'DZD': 135.20,    // Algerian Dinar
  'LYD': 4.8700,    // Libyan Dinar
  'SDG': 600.00,    // Sudanese Pound
  'ZMW': 27.85,     // Zambian Kwacha
  'BWP': 13.62,     // Botswana Pula
  'MZN': 63.90,     // Mozambican Metical
  'MWK': 1730.00,   // Malawian Kwacha
  'ZWL': 361.90,    // Zimbabwean Dollar
  'NAD': 16.27,     // Namibian Dollar (pegged to ZAR)
  'SZL': 16.27,     // Swazi Lilangeni (pegged to ZAR)
  'LSL': 16.27,     // Lesotho Loti (pegged to ZAR)
  'MGA': 4540.00,   // Malagasy Ariary
  'RWF': 1430.00,   // Rwandan Franc
  'BIF': 2920.00,   // Burundian Franc
  'DJF': 177.72,    // Djiboutian Franc
  'ERN': 15.00,     // Eritrean Nakfa (fixed)
  'SOS': 571.50,    // Somali Shilling
  'GMD': 71.50,     // Gambian Dalasi
  'SLL': 22750.00,  // Sierra Leonean Leone
  'LRD': 194.50,    // Liberian Dollar
  'GNF': 8640.00,   // Guinean Franc
  'CVE': 94.70,     // Cape Verde Escudo
  'STN': 21.00,     // São Tomé Dobra
  'KMF': 422.00,    // Comorian Franc
  'SCR': 14.20,     // Seychellois Rupee
  'MUR': 45.80,     // Mauritian Rupee
  'AOA': 920.00,    // Angolan Kwanza
  'CDF': 2820.00,   // Congolese Franc
  // ── Asia ───────────────────────────────────────────────────────────────────
  'INR': 95.781,    // Indian Rupee
  'CNY': 6.7786,    // Chinese Yuan
  'KRW': 1495.89,   // South Korean Won
  'TWD': 31.378,    // Taiwan New Dollar
  'PHP': 61.411,    // Philippine Peso
  'IDR': 17819.29,  // Indonesian Rupiah
  'MYR': 3.9782,    // Malaysian Ringgit
  'THB': 32.590,    // Thai Baht
  'VND': 26326.92,  // Vietnamese Dong
  'PKR': 278.429,   // Pakistani Rupee
  'BDT': 122.722,   // Bangladeshi Taka
  'LKR': 328.470,   // Sri Lankan Rupee
  'NPR': 133.20,    // Nepalese Rupee
  'MMK': 2098.00,   // Myanmar Kyat
  'KHR': 4055.00,   // Cambodian Riel
  'LAK': 21900.00,  // Lao Kip
  'MNT': 3430.00,   // Mongolian Tugrik
  'KZT': 505.00,    // Kazakhstani Tenge
  'UZS': 12850.00,  // Uzbekistani Som
  'KGS': 86.50,     // Kyrgyzstani Som
  'TJS': 10.92,     // Tajikistani Somoni
  'TMT': 3.5000,    // Turkmenistani Manat (fixed)
  'AFN': 71.50,     // Afghan Afghani
  'BND': 1.2763,    // Brunei Dollar (pegged to SGD)
  'BTN': 95.781,    // Bhutanese Ngultrum (pegged to INR)
  'MVR': 15.42,     // Maldivian Rufiyaa
  // ── Middle East ────────────────────────────────────────────────────────────
  'AED': 3.6725,    // UAE Dirham (pegged to USD)
  'SAR': 3.7500,    // Saudi Riyal (pegged to USD)
  'QAR': 3.6400,    // Qatari Riyal (pegged to USD)
  'KWD': 0.3095,    // Kuwaiti Dinar
  'BHD': 0.3760,    // Bahraini Dinar (pegged to USD)
  'OMR': 0.3846,    // Omani Rial (pegged to USD)
  'JOD': 0.7090,    // Jordanian Dinar (pegged to USD)
  'IQD': 1309.82,   // Iraqi Dinar
  'IRR': 42300.00,  // Iranian Rial
  'LBP': 89700.00,  // Lebanese Pound
  'SYP': 13000.00,  // Syrian Pound
  'YER': 250.30,    // Yemeni Rial
  // ── Americas ───────────────────────────────────────────────────────────────
  'BRL': 5.0493,    // Brazilian Real
  'MXN': 17.343,    // Mexican Peso
  'ARS': 1409.82,   // Argentine Peso
  'CLP': 891.17,    // Chilean Peso
  'COP': 3648.38,   // Colombian Peso
  'PEN': 3.4105,    // Peruvian Sol
  'UYU': 42.50,     // Uruguayan Peso
  'PYG': 7890.00,   // Paraguayan Guarani
  'BOB': 6.9100,    // Bolivian Boliviano (semi-fixed)
  'VES': 46.80,     // Venezuelan Bolívar
  'GTQ': 7.7600,    // Guatemalan Quetzal
  'HNL': 25.30,     // Honduran Lempira
  'NIO': 36.80,     // Nicaraguan Córdoba
  'CRC': 517.00,    // Costa Rican Colón
  'PAB': 1.0000,    // Panamanian Balboa (pegged to USD)
  'DOP': 60.50,     // Dominican Peso
  'HTG': 132.50,    // Haitian Gourde
  'JMD': 157.20,    // Jamaican Dollar
  'TTD': 6.7900,    // Trinidad & Tobago Dollar
  'BBD': 2.0000,    // Barbadian Dollar (fixed to USD)
  'XCD': 2.7000,    // East Caribbean Dollar (fixed to USD)
  'BSD': 1.0000,    // Bahamian Dollar (pegged to USD)
  'GYD': 209.50,    // Guyanese Dollar
  'SRD': 36.80,     // Surinamese Dollar
  'BZD': 2.0000,    // Belize Dollar (fixed to USD)
  // ── Pacific ────────────────────────────────────────────────────────────────
  'FJD': 2.2590,    // Fijian Dollar
  'PGK': 3.9800,    // Papua New Guinean Kina
  'WST': 2.7800,    // Samoan Tala
  'TOP': 2.3700,    // Tongan Paʻanga
  'SBD': 8.4300,    // Solomon Islands Dollar
  'VUV': 120.50,    // Vanuatu Vatu
};

/* ══════════════════════════════════════
   MAKE.COM WEBHOOK INTEGRATION
══════════════════════════════════════ */
const MakeWebhook = (() => {
  const _h = [
    'aHR0cHM6Ly9ob29rLnVzMi5tYWtlLmNvbS83aXNj',
    'YTUwcWdjOHBjbHJnZ3VyY3JqMTRvOWJ0N3JyZg=='
  ].join('');
  const _u = () => atob(_h);

  return {
    async send(event, data, identity = null) {
      const user = identity || Auth.getUser();
      const cur  = getCurrency();
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        user:     { name: user?.name || 'Unknown', email: user?.email || '' },
        currency: { code: cur.code, symbol: cur.symbol },
        data
      };
      try {
        await fetch(_u(), {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload)
        });
      } catch (_) { /* silent */ }
    }
  };
})();

/* ══════════════════════════════════════
   RESEND EMAIL INTEGRATION
══════════════════════════════════════ */
const ResendEmail = (() => {
  const API_KEY = 're_DDhL5QJP_MD6nbRJsMzD3BtFc2CGaynN4';

  return {
    async sendWelcomeEmail(userEmail, userName) {
      if (!userEmail) return;
      const firstName = (userName || 'there').split(' ')[0];

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Inter', Arial, sans-serif; background-color: #09090b; color: #ffffff; margin: 0; padding: 40px 20px; }
            .container { max-width: 560px; margin: 0 auto; background: #18181b; border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 40px; }
            .logo { font-size: 24px; font-weight: bold; color: #a855f7; margin-bottom: 24px; font-family: Georgia, serif; }
            h1 { font-size: 22px; color: #ffffff; margin-bottom: 16px; }
            p { font-size: 15px; color: rgba(161,161,170,0.9); line-height: 1.6; margin-bottom: 20px; }
            .btn { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #a855f7, #6366f1); color: #ffffff; font-weight: bold; text-decoration: none; border-radius: 999px; margin: 10px 0 20px; }
            .footer { font-size: 12px; color: rgba(161,161,170,0.5); border-top: 1px solid rgba(255,255,255,0.08); padding-top: 20px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">Phyzelyne</div>
            <h1>Welcome to Phyzelyne, ${firstName}! 👋</h1>
            <p>We're thrilled to have you join Phyzelyne — your intelligent financial operating system.</p>
            <p>With Phyzelyne, you can track income &amp; expenses across 150+ currencies, draft professional invoices in seconds, hit your savings goals, and get 24/7 financial insights from your AI Coach.</p>
            <p><a href="https://klyro.app" class="btn">Explore Phyzelyne Dashboard</a></p>
            <p>If you have any questions or feedback, simply reply to this email. We're here to help you build your financial future.</p>
            <div class="footer">
              © 2026 Phyzelyne. All rights reserved.<br>
              You received this email because you signed up for a Phyzelyne account.
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Phyzelyne <onboarding@resend.dev>',
            to: [userEmail],
            subject: `Welcome to Phyzelyne, ${firstName}! 🎉`,
            html: htmlContent
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          console.warn('[Resend] Could not send welcome email:', errData.message || response.statusText);
        } else {
          console.log('[Resend] Welcome email sent successfully to', userEmail);
        }
      } catch (err) {
        console.warn('[Resend] Network error sending welcome email:', err.message);
      }
    }
  };
})();

/* ══════════════════════════════════════
   CURRENCY CONVERTER SYSTEM
══════════════════════════════════════ */
const CurrencyConverter = {
  convert(amount, fromCode, toCode) {
    if (fromCode === toCode) return parseFloat(amount);
    const fromRate = EXCHANGE_RATES[fromCode] || 1.0;
    const toRate = EXCHANGE_RATES[toCode] || 1.0;
    const usdAmount = parseFloat(amount) / fromRate;
    return parseFloat((usdAmount * toRate).toFixed(2));
  },
  convertAllTransactions(oldCurrencyCode, newCurrencyCode) {
    const txns = Store.getTransactions();
    if (!txns.length) return { count: 0, totalOld: 0, totalNew: 0 };
    let totalOld = 0, totalNew = 0;
    const converted = txns.map(txn => {
      const origCurrency = txn.originalCurrency || oldCurrencyCode;
      if (origCurrency === oldCurrencyCode) {
        const oldAmount = parseFloat(txn.amount);
        const newAmount = this.convert(oldAmount, oldCurrencyCode, newCurrencyCode);
        totalOld += oldAmount;
        totalNew += newAmount;
        return {...txn, amount: newAmount, originalCurrency: newCurrencyCode, lastConvertedAt: new Date().toISOString()};
      }
      return txn;
    });
    Store.saveTransactions(converted);
    return {count: converted.length, totalOld: parseFloat(totalOld.toFixed(2)), totalNew: parseFloat(totalNew.toFixed(2)), rate: totalOld > 0 ? (totalNew / totalOld).toFixed(4) : 1};
  },
  convertAllGoals(oldCurrencyCode, newCurrencyCode) {
    const goals = Store.getGoals();
    if (!goals.length) return { count: 0 };
    const converted = goals.map(goal => {
      const origCurrency = goal.originalCurrency || oldCurrencyCode;
      if (origCurrency === oldCurrencyCode) {
        return {...goal, target: this.convert(goal.target, oldCurrencyCode, newCurrencyCode), saved: this.convert(goal.saved || 0, oldCurrencyCode, newCurrencyCode), originalCurrency: newCurrencyCode, lastConvertedAt: new Date().toISOString()};
      }
      return goal;
    });
    Store.saveGoals(converted);
    return { count: converted.length };
  },
  getConversionPreview(oldCurrencyCode, newCurrencyCode) {
    const txns = Store.getTransactions();
    const goals = Store.getGoals();
    const totals = Utils.calcTotals(txns);
    return {
      txns: {count: txns.length, income: this.convert(totals.income, oldCurrencyCode, newCurrencyCode), expense: this.convert(totals.expense, oldCurrencyCode, newCurrencyCode), balance: this.convert(totals.balance, oldCurrencyCode, newCurrencyCode)},
      goals: {count: goals.length, totalTarget: this.convert(goals.reduce((sum, g) => sum + parseFloat(g.target || 0), 0), oldCurrencyCode, newCurrencyCode), totalSaved: this.convert(goals.reduce((sum, g) => sum + parseFloat(g.saved || 0), 0), oldCurrencyCode, newCurrencyCode)},
      rate: (EXCHANGE_RATES[newCurrencyCode] / EXCHANGE_RATES[oldCurrencyCode]).toFixed(4),
      oldCurrency: CURRENCIES.find(c => c.code === oldCurrencyCode),
      newCurrency: CURRENCIES.find(c => c.code === newCurrencyCode)
    };
  }
};

function _getOAuthRedirectUrl(targetPage = 'dashboard.html') {
  try {
    return new URL(targetPage, window.location.href).href;
  } catch {
    return window.location.origin + '/' + targetPage;
  }
}

/* ══════════════════════════════════════
   AUTH  (Supabase-backed)
   Public API identical to original so no
   HTML pages need changes.
══════════════════════════════════════ */
const Auth = {

  /* Called on every protected page */
  require() {
    if (!_sb) { console.warn('[Phyzelyne] Supabase not initialised'); return; }
    _sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = 'login.html';
      } else {
        _sessionCache = session.user;
        _cache.userId = session.user.id;

        // Route unboarded users (e.g. new OAuth signups) to onboarding.
        const page = window.location.pathname.split('/').pop() || '';
        const isOnboarded = session.user.user_metadata?.onboarded;
        const skipCheck   = ['onboarding.html'].includes(page);
        if (!isOnboarded && !skipCheck) {
          window.location.replace('onboarding.html');
          return;
        }

        _initData();

        // The sidebar (and any profile fields) may have already been
        // rendered synchronously by the page, before this async session
        // lookup resolved — at that point Auth.getUser() returned null,
        // so avatars showed "?" and email/name fields were blank.
        // Re-render the sidebar now that the real user is known, and let
        // pages listen for 'phyzelyne:auth-ready' to refresh anything else
        // that depends on Auth.getUser().
        const sidebarMount = document.getElementById('sidebar-mount');
        if (sidebarMount && typeof renderSidebar === 'function') {
          sidebarMount.innerHTML = renderSidebar();
          if (typeof initSidebar === 'function') initSidebar();
        }

        document.dispatchEvent(new Event('phyzelyne:auth-ready'));
      }
    });
  },

  /* Synchronous — returns { id, name, email, avatar, onboarded } */
  getUser() {
    const raw = _sessionCache;
    if (!raw) return null;
    return {
      id:        raw.id,
      email:     raw.email,
      name:      raw.user_metadata?.name || raw.user_metadata?.full_name || raw.email?.split('@')[0] || 'User',
      avatar:    raw.user_metadata?.avatar_url || raw.user_metadata?.picture || raw.user_metadata?.avatar || null,
      onboarded: raw.user_metadata?.onboarded || false,
      role:      raw.user_metadata?.role || 'user'
    };
  },

  /* Check if current user has Executive / Admin privileges */
  isAdmin() {
    const user = this.getUser();
    const isUnlocked = sessionStorage.getItem('phyzelyne_admin_session_unlocked') === 'true' || 
                       localStorage.getItem('phyzelyne_admin_session_unlocked') === 'true';
    if (isUnlocked) return true;
    if (!user) return false;
    
    // Check role metadata
    const role = user.role || _sessionCache?.user_metadata?.role;
    if (role === 'admin' || role === 'cto' || role === 'founder') return true;

    // Check admin whitelist
    const adminEmails = [
      'founders@phyzelyne.com',
      'cto@phyzelyne.com',
      'admin@phyzelyne.com',
      'petitgenie@phyzelyne.com'
    ];
    if (user.email && (adminEmails.includes(user.email.toLowerCase()) || user.email.endsWith('@phyzelyne.com'))) {
      return true;
    }
    return false;
  },

  /* Sign up with email + password + name */
  async register({ name, email, password }) {
    if (!_sb) return { success: false, message: 'Service unavailable.' };
    const { data, error } = await _sb.auth.signUp({
      email, password,
      options: {
        data: { name, onboarded: false },
        // When email confirmation is enabled, send the verified user back to
        // the protected onboarding route where the client can establish their
        // newly confirmed session.
        emailRedirectTo: _getOAuthRedirectUrl('onboarding.html')
      }
    });
    if (error) return { success: false, message: error.message };
    const requiresEmailConfirmation = !data.session;

    // A user object without a session is not signed in. Keeping it in the
    // synchronous cache made the UI appear authenticated, then protected
    // pages redirected the person straight back to login.
    _sessionCache = data.session?.user || null;
    _cache.userId = data.session?.user?.id || null;
    const signupIdentity = { name, email };
    MakeWebhook.send('user.signup', { ...signupIdentity, signupDate: new Date().toISOString() }, signupIdentity);
    ResendEmail.sendWelcomeEmail(email, name);
    return { success: true, user: data.user, requiresEmailConfirmation };
  },

  /* Sign in with email + password */
  async login(email, password) {
    if (!_sb) return { success: false, message: 'Service unavailable.' };
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) {
      Auth._recordFailure(email);
      const lockMsg = Auth._isLocked(email);
      if (lockMsg) return { success: false, message: lockMsg, locked: true };
      const d = Auth._getRateData(email);
      const left = 5 - (d.attempts || 0);
      return {
        success: false,
        message: 'Incorrect email or password.' + (left > 0 ? ` ${left} attempt${left !== 1 ? 's' : ''} remaining.` : '')
      };
    }
    Auth._clearRateData(email);
    localStorage.removeItem('phyzelyne_last_email');
    _sessionCache = data.user;
    _cache.userId = data.user.id;
    await _initData();
    MakeWebhook.send('user.login', { name: data.user.user_metadata?.name || '', email, loginDate: new Date().toISOString() });
    return { success: true, user: data.user };
  },



  /* Update user profile metadata */
  async syncProfileDetails(name, email) {
    if (!_sb) return false;
    const { error } = await _sb.auth.updateUser({ email, data: { name } });
    if (error) { console.error('[Phyzelyne] syncProfile:', error.message); return false; }
    if (_sessionCache) {
      _sessionCache.email = email;
      _sessionCache.user_metadata = { ..._sessionCache.user_metadata, name };
    }
    return true;
  },

  /* Update avatar — stores URL in user metadata */
  async updateUserAvatar(urlOrBase64) {
    if (!_sb) return false;
    const { error } = await _sb.auth.updateUser({ data: { avatar: urlOrBase64 } });
    if (error) { console.error('[Phyzelyne] avatar:', error.message); return false; }
    if (_sessionCache?.user_metadata) _sessionCache.user_metadata.avatar = urlOrBase64;
    return true;
  },

  /* Delete account — wipes all Supabase rows, deletes the Auth user itself
     via a server-side Edge Function, then signs out. Returns { success, message }
     so the UI can tell the user if anything went wrong instead of assuming
     the account is really gone. */
  async destroyCurrentAccount() {
    const user = this.getUser();
    if (!user || !_sb) return { success: false, message: 'Not signed in.' };

    MakeWebhook.send('user.deleted', { name: user.name, email: user.email, deletedAt: new Date().toISOString() });

    const uid = _cache.userId;
    await Promise.all([
      _sb.from('transactions').delete().eq('user_id', uid),
      _sb.from('goals').delete().eq('user_id', uid),
      _sb.from('settings').delete().eq('user_id', uid),
      _sb.from('invoices').delete().eq('user_id', uid),
      _sb.from('receipts').delete().eq('user_id', uid),
    ]);

    // Remove the actual login/auth record — this can only be done with a
    // service-role key, which lives in the Edge Function, never in this file.
    try {
      const { data: { session } } = await _sb.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok || result.error) {
        console.error('[Phyzelyne] delete-account function error:', result.error || resp.status);
        await _sb.auth.signOut();
        window.location.replace('login.html');
        return { success: false, message: 'Your data was deleted, but we could not fully close your account. Please contact support.' };
      }
    } catch (err) {
      console.error('[Phyzelyne] delete-account request failed:', err);
      await _sb.auth.signOut();
      window.location.replace('login.html');
      return { success: false, message: 'Your data was deleted, but we could not fully close your account. Please contact support.' };
    }

    await _sb.auth.signOut();
    window.location.replace('login.html');
    return { success: true };
  },

  /* Sign out */
  async logout() {
    if (_sb) await _sb.auth.signOut();
    _sessionCache = null;
    _cache.userId = null;
    _cache.ready  = false;
    window.location.href = 'login.html';
  },

  /* ── Rate limiting (localStorage — intentionally stays local) ────── */
  /* ── Rate Limiting has to be in the backend database or cache not localStorage ────── */
  _getRateData(email) {
    try { return JSON.parse(localStorage.getItem('phyzelyne_rl_' + email) || '{}'); }
    catch { return {}; }
  },
  _saveRateData(email, d) {
    localStorage.setItem('phyzelyne_rl_' + email, JSON.stringify(d));
  },
  _recordFailure(email) {
    const d = this._getRateData(email);
    d.attempts = (d.attempts || 0) + 1;
    d.last = Date.now();
    if (d.attempts >= 5) d.lockedUntil = Date.now() + 15 * 60 * 1000;
    this._saveRateData(email, d);
  },
  _isLocked(email) {
    const d = this._getRateData(email);
    if (d.lockedUntil && Date.now() < d.lockedUntil) {
      const mins = Math.ceil((d.lockedUntil - Date.now()) / 60000);
      return `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
    }
    return null;
  },
  _clearRateData(email) {
    localStorage.removeItem('phyzelyne_rl_' + email);
  },

  /* ── Legacy shims so onboarding.html / signup.html don't crash ───── */
  _getUsers()   { const u = this.getUser(); return u ? [u] : []; },
  _saveUsers()  { /* no-op — data lives in Supabase Auth now */ },
};


/* ══════════════════════════════════════
   PHYZELYNE FREE & UNLIMITED MODEL
   All features (AI Coach, multi-currency,
   analytics, savings goals, invoices & receipts,
   theme customization, business workspace) are
   100% free and unlimited for all users.
══════════════════════════════════════ */


/* ══════════════════════════════════════
   DATA STORE  (Supabase-backed)
   Identical public API — reads hit the in-memory
   cache instantly; writes are optimistic + async.
══════════════════════════════════════ */
const Store = {

  /* ── Transactions ─────────────────────────────────────────────────── */
  getTransactions() { return _cache.transactions || []; },

		  saveTransactions(txns) {
		    _cache.transactions = txns;
		    _persistCache('transactions');
		    _afterRemoteWrite('transactions', _upsert('transactions', txns));
		    _broadcastChange('transactions');
		  },

  addTransaction(txn) {
    txn.id               = _genId();
    txn.date             = txn.date || new Date().toISOString().split('T')[0];
    txn.originalCurrency = txn.originalCurrency || getCurrency().code;
    txn.created_at       = new Date().toISOString();
	    if (_cache.transactions === null) _cache.transactions = [];
	    _cache.transactions.unshift(txn);
	    _persistCache('transactions');
		    _afterRemoteWrite('transactions', _upsert('transactions', { ...txn, user_id: _cache.userId }));
	    _broadcastChange('transactions', { eventType: 'INSERT', new: txn });
    try { PhyzelyneTelemetry?.track('transaction.added', { amount: txn.amount, type: txn.type, currency: txn.originalCurrency }); } catch(e) {}
    MakeWebhook.send('transaction.added', {
      type: txn.type, amount: txn.amount, description: txn.description,
      category: txn.category, date: txn.date, currency: txn.originalCurrency
    });
    return txn;
  },

	  deleteTransaction(id) {
	    _cache.transactions = (_cache.transactions || []).filter(t => t.id !== id);
	    _persistCache('transactions');
		    _afterRemoteWrite('transactions', _sbDelete('transactions', id));
	    _broadcastChange('transactions', { eventType: 'DELETE', old: { id } });
  },

  updateTransaction(id, fields) {
    const txns = _cache.transactions || [];
    const idx  = txns.findIndex(t => t.id === id);
	    if (idx === -1) return null;
	    txns[idx] = { ...txns[idx], ...fields };
	    _cache.transactions = txns;
	    _persistCache('transactions');
		    _afterRemoteWrite('transactions', _upsert('transactions', { ...txns[idx], user_id: _cache.userId }));
	    _broadcastChange('transactions', { eventType: 'UPDATE', new: txns[idx] });
    return txns[idx];
  },

  /* ── Settings ─────────────────────────────────────────────────────── */
  getSettings() { return { ...(_cache.settings || {}) }; },

  saveSettings(s) {
    _cache.settings = { ...s };
    _persistCache('settings');
    // Mirror theme to localStorage for the pre-render flash fix
    if (s.darkMode !== undefined) localStorage.setItem('phyzelyne_theme', s.darkMode ? 'dark' : 'light');
    if (s.accentTheme !== undefined) localStorage.setItem('phyzelyne_accent', s.accentTheme);
    _afterRemoteWrite('settings', _upsert('settings', { ...s, user_id: _cache.userId }));
    if (s.onboarded !== undefined && _sb) {
      _sb.auth.updateUser({ data: { onboarded: s.onboarded } }).catch(() => {});
    }
    try { PhyzelyneTelemetry?.track('settings.saved', { currency: s.currencyCode, plan: s.plan }); } catch(e) {}
    _broadcastChange('settings', { eventType: 'UPDATE', new: s });
  },

  getBusinessProfile() {
    const s = this.getSettings();
    return s.businessProfile || null;
  },

  saveBusinessProfile(profile) {
    const s = this.getSettings();
    const updatedProfile = { ...(s.businessProfile || {}), ...profile, updatedAt: new Date().toISOString() };
    s.businessProfile = updatedProfile;
    s.businessOnboarded = true;
    this.saveSettings(s);
    return updatedProfile;
  },

  /* ── Goals ────────────────────────────────────────────────────────── */
  getGoals() { return _cache.goals || []; },

		  saveGoals(goals) {
		    _cache.goals = goals;
		    _persistCache('goals');
		    _afterRemoteWrite('goals', _upsert('goals', goals));
		    _broadcastChange('goals');
	  },

  addGoal(goal) {
    goal.id               = _genId();
    goal.originalCurrency = goal.originalCurrency || getCurrency().code;
	    if (_cache.goals === null) _cache.goals = [];
	    _cache.goals.push(goal);
	    _persistCache('goals');
		    _afterRemoteWrite('goals', _upsert('goals', { ...goal, user_id: _cache.userId }));
    _broadcastChange('goals', { eventType: 'INSERT', new: goal });
    try { PhyzelyneTelemetry?.track('goal.created', { name: goal.name, target: goal.target }); } catch(e) {}
    MakeWebhook.send('goal.created', {
      name: goal.name, target: goal.target, saved: goal.saved || 0,
      deadline: goal.deadline || null, emoji: goal.emoji || '🎯'
    });
    return goal;
  },

	  deleteGoal(id) {
	    _cache.goals = (_cache.goals || []).filter(g => g.id !== id);
	    _persistCache('goals');
		    _afterRemoteWrite('goals', _sbDelete('goals', id));
    _broadcastChange('goals', { eventType: 'DELETE', old: { id } });
  },

  updateGoal(id, fields) {
    const goals = _cache.goals || [];
    const idx   = goals.findIndex(g => g.id === id);
	    if (idx === -1) return null;
	    goals[idx] = { ...goals[idx], ...fields };
	    _cache.goals = goals;
	    _persistCache('goals');
		    _afterRemoteWrite('goals', _upsert('goals', { ...goals[idx], user_id: _cache.userId }));
    _broadcastChange('goals', { eventType: 'UPDATE', new: goals[idx] });
    return goals[idx];
  },

  updateGoalSaved(id, amount) {
    const goals = _cache.goals || [];
    const g     = goals.find(g => g.id === id);
	    if (!g) return;
	    g.saved = Math.min(parseFloat(g.target), (parseFloat(g.saved) || 0) + parseFloat(amount));
	    _persistCache('goals');
		    _afterRemoteWrite('goals', _upsert('goals', { ...g, user_id: _cache.userId }));
    _broadcastChange('goals', { eventType: 'UPDATE', new: g });
  },

  /* ── Invoices ─────────────────────────────────────────────────────── */
	  getInvoices() { return _cache.invoices || []; },

		  saveInvoices(list) {
		    _cache.invoices = list;
		    _persistCache('invoices');
		    _afterRemoteWrite('invoices', _upsert('invoices', list));
		    _broadcastChange('invoices');
		  },

	  addInvoice(inv) {
	    inv.id        = 'INV-' + _genId();
    inv.createdAt = new Date().toISOString();
	    inv.status    = inv.status || 'draft';
		    if (_cache.invoices === null) _cache.invoices = [];
		    _cache.invoices.unshift(inv);
		    _persistCache('invoices');
		    _afterRemoteWrite('invoices', _upsert('invoices', { ...inv, user_id: _cache.userId }));
		    _broadcastChange('invoices', { eventType: 'INSERT', new: inv });
    try { PhyzelyneTelemetry?.track('invoice.created', { id: inv.id, total: inv.total }); } catch(e) {}
	    return inv;
	  },

  updateInvoice(id, fields) {
    const list = _cache.invoices || [];
    const idx  = list.findIndex(i => i.id === id);
	    if (idx === -1) return null;
		    list[idx] = { ...list[idx], ...fields };
		    _cache.invoices = list;
		    _persistCache('invoices');
		    _afterRemoteWrite('invoices', _upsert('invoices', { ...list[idx], user_id: _cache.userId }));
		    _broadcastChange('invoices', { eventType: 'UPDATE', new: list[idx] });
	    return list[idx];
	  },

	  deleteInvoice(id) {
		    _cache.invoices = (_cache.invoices || []).filter(i => i.id !== id);
		    _persistCache('invoices');
		    _afterRemoteWrite('invoices', _sbDelete('invoices', id));
		    _broadcastChange('invoices', { eventType: 'DELETE', old: { id } });
	  },

  getInvoice(id) { return (_cache.invoices || []).find(i => i.id === id) || null; },

  /* ── Receipts ─────────────────────────────────────────────────────── */
	  getReceipts() { return _cache.receipts || []; },

		  saveReceipts(list) {
		    _cache.receipts = list;
		    _persistCache('receipts');
		    _afterRemoteWrite('receipts', _upsert('receipts', list));
		    _broadcastChange('receipts');
		  },

	  addReceipt(receipt) {
	    receipt.id        = 'REC-' + _genId();
	    receipt.createdAt = new Date().toISOString();
		    if (_cache.receipts === null) _cache.receipts = [];
		    _cache.receipts.unshift(receipt);
		    _persistCache('receipts');
		    _afterRemoteWrite('receipts', _upsert('receipts', { ...receipt, user_id: _cache.userId }));
		    _broadcastChange('receipts', { eventType: 'INSERT', new: receipt });
    try { PhyzelyneTelemetry?.track('receipt.added', { id: receipt.id, merchant: receipt.merchant }); } catch(e) {}
	    return receipt;
	  },
};

/* ══════════════════════════════════════
   UTILITIES
══════════════════════════════════════ */
const Utils = {
  /* Always reads current currency from settings so swapping is instant */
  formatCurrency(amount, forceAbs = false) {
    const cur = getCurrency();
    const num = parseFloat(amount) || 0;
    const abs = Math.abs(num);
    const formatted = abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Show negative sign when amount is genuinely negative (e.g. net balance in deficit)
    // forceAbs = true is used for income/expense display (always positive)
    const prefix = (!forceAbs && num < 0) ? '-' : '';
    return `${prefix}${cur.symbol}${formatted}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  },

  isThisWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00'), now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - now.getDay()); start.setHours(0,0,0,0);
    return d >= start;
  },
  isThisMonth(dateStr) {
    const d = new Date(dateStr + 'T00:00:00'), now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  },
  isThisYear(dateStr) {
    return new Date(dateStr + 'T00:00:00').getFullYear() === new Date().getFullYear();
  },
  filterByPeriod(txns, period) {
    if (period === 'week')  return txns.filter(t => this.isThisWeek(t.date));
    if (period === 'month') return txns.filter(t => this.isThisMonth(t.date));
    if (period === 'year')  return txns.filter(t => this.isThisYear(t.date));
    return txns;
  },

  calcTotals(txns) {
    let income = 0, expense = 0;
    txns.forEach(t => {
      if (t.type === 'income')  income  += parseFloat(t.amount) || 0;
      if (t.type === 'expense') expense += parseFloat(t.amount) || 0;
    });
    return { income, expense, balance: income - expense };
  },

  groupByCategory(txns) {
    const map = {};
    txns.filter(t => t.type === 'expense').forEach(t => {
      map[t.category] = (map[t.category] || 0) + (parseFloat(t.amount) || 0);
    });
    return map;
  },

  getCategoryIcon(cat) {
    const icons = {
      /* Existing */
      groceries:'fa-cart-shopping', food:'fa-utensils', dining:'fa-utensils',
      transport:'fa-car', internet:'fa-wifi', bills:'fa-file-invoice',
      rent:'fa-house', entertainment:'fa-film', health:'fa-heart-pulse',
      clothing:'fa-shirt', savings:'fa-piggy-bank', salary:'fa-briefcase',
      freelance:'fa-laptop', investment:'fa-chart-line', other:'fa-ellipsis',
      shopping:'fa-bag-shopping', education:'fa-graduation-cap', travel:'fa-plane',
      utilities:'fa-bolt', insurance:'fa-shield-halved', subscriptions:'fa-rotate',
      personal:'fa-person', gifts:'fa-gift', childcare:'fa-baby',
      pets:'fa-paw', sports:'fa-dumbbell', beauty:'fa-spa',
      /* New — Transfers & Payments */
      transfer:'fa-arrow-right-arrow-left', 'bank transfer':'fa-building-columns',
      payment:'fa-credit-card', 'card payment':'fa-credit-card',
      loan:'fa-hand-holding-dollar', 'loan repayment':'fa-hand-holding-dollar',
      mortgage:'fa-house-chimney', tax:'fa-landmark', 'tax refund':'fa-rotate-left',
      /* New — Income */
      bonus:'fa-star', commission:'fa-percent', pension:'fa-umbrella',
      rental:'fa-key', dividends:'fa-chart-line', allowance:'fa-coins',
      /* New — Lifestyle */
      coffee:'fa-mug-hot', alcohol:'fa-wine-glass', gym:'fa-dumbbell',
      gaming:'fa-gamepad', books:'fa-book', streaming:'fa-play',
      phone:'fa-mobile-screen', repair:'fa-screwdriver-wrench',
      cleaning:'fa-broom', parking:'fa-square-parking',
      toll:'fa-road', fuel:'fa-gas-pump', charity:'fa-heart',
      medical:'fa-stethoscope', dental:'fa-tooth', pharmacy:'fa-pills',
      haircut:'fa-scissors', laundry:'fa-shirt',
    };
    return icons[cat?.toLowerCase()] || 'fa-circle-dot';
  },

  /* Deep AI analysis helpers */
  getSavingsRate(totals) {
    return totals.income > 0 ? ((totals.income - totals.expense) / totals.income * 100) : 0;
  },

  getFinancialHealth(totals, txns) {
    const sr = this.getSavingsRate(totals);
    const cats = this.groupByCategory(txns);
    const topCat = Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
    const topPct = totals.income > 0 && topCat ? (topCat[1]/totals.income*100) : 0;

    let score = 50;
    if (sr >= 20) score += 25;
    else if (sr >= 10) score += 10;
    else if (sr < 0) score -= 25;
    if (topPct < 30) score += 10;
    else if (topPct > 50) score -= 15;
    if (txns.length > 10) score += 5; // active tracker bonus

    return Math.max(0, Math.min(100, score));
  },

  buildAIContext(period = 'month') {
    const txns   = Store.getTransactions();
    const filt   = this.filterByPeriod(txns, period);
    const totals = this.calcTotals(filt);
    const cats   = this.groupByCategory(filt);
    const goals  = Store.getGoals();
    const cur    = getCurrency();
    const sr     = this.getSavingsRate(totals).toFixed(1);
    const health = this.getFinancialHealth(totals, filt);

    const sortedCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
    const topCatsStr = sortedCats.slice(0,5).map(([k,v])=>`${k}: ${cur.symbol}${v.toFixed(2)}`).join(', ');

    // Month-over-month comparison
    const prevTxns   = this.filterByPeriod(txns, 'month').length
      ? txns.filter(t => {
          const d = new Date(t.date + 'T00:00:00'), now = new Date();
          const prevMonth = new Date(now.getFullYear(), now.getMonth()-1, 1);
          const prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
          return d >= prevMonth && d <= prevEnd;
        })
      : [];
    const prevTotals = this.calcTotals(prevTxns);

    const expenseChange = prevTotals.expense > 0
      ? (((totals.expense - prevTotals.expense)/prevTotals.expense)*100).toFixed(1)
      : null;

    return {
      currency: cur.code,
      symbol: cur.symbol,
      income: totals.income,
      expense: totals.expense,
      balance: totals.balance,
      savingsRate: sr,
      healthScore: health,
      topCategories: topCatsStr || 'none yet',
      topCat: sortedCats[0] || null,
      goals: goals.map(g=>`${g.emoji||'🎯'} ${g.name}: ${cur.symbol}${g.saved||0}/${cur.symbol}${g.target}`).join(', ') || 'none',
      totalTransactions: txns.length,
      periodTransactions: filt.length,
      expenseChange,
      prevExpense: prevTotals.expense,
      isOverspending: totals.expense > totals.income,
      period
    };
  }
};

/* ══════════════════════════════════════
   TOAST  (with sound)
══════════════════════════════════════ */
function _playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === 'success') {
      osc.frequency.setValueAtTime(523, ctx.currentTime);       // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    }
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* audio not available */ }
}

function showToast(msg, type = 'success') {
  const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark';
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
  t.className = `toast ${type} show`;
  _playSound(type);
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ══════════════════════════════════════
   SIDEBAR
══════════════════════════════════════ */
function renderSidebar() {
  const user = Auth.getUser();
  const name    = user?.name?.split(' ')[0] || 'User';
  const isExecutive = (typeof Auth !== 'undefined' && typeof Auth.isAdmin === 'function') ? Auth.isAdmin() : false;
  
  // Custom image display logic inside sidebar
  let avatarMarkup = '';
  if (user && user.avatar) {
    avatarMarkup = `<img src="${user.avatar}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
  } else {
    const initial = user?.name?.charAt(0)?.toUpperCase() || '?';
    avatarMarkup = initial;
  }

  return `
  <button class="sidebar-toggle-btn" id="sidebar-toggle" aria-label="Toggle menu">
    <i class="fas fa-bars"></i>
  </button>
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <img src="Phyzelyne's Logo.png" alt="Phyzelyne" onerror="this.style.display='none'">
      <span class="sidebar-logo-text">Phyzelyne</span>
    </div>
    <div class="sidebar-user">
      <div class="sidebar-avatar" style="overflow:hidden; display:flex; align-items:center; justify-content:center;">${avatarMarkup}</div>
      <div class="sidebar-username">${name}</div>
    </div>
    <span class="nav-section-label">Main</span>
    <a href="dashboard.html" class="nav-item" data-page="dashboard"><i class="fas fa-house"></i> Home</a>
    <a href="transactions.html" class="nav-item" data-page="transactions"><i class="fas fa-right-left"></i> Transactions</a>
    <a href="analysis.html" class="nav-item" data-page="analysis"><i class="fas fa-chart-pie"></i> Analysis</a>
    <span class="nav-section-label">Intelligence</span>
    <a href="cofe.html" class="nav-item" data-page="cofe"><i class="fas fa-briefcase"></i> Business</a>
    ${isExecutive ? `
    <span class="nav-section-label">Executive</span>
    <a href="admin.html" class="nav-item" data-page="admin" style="display:flex; justify-content:space-between; align-items:center;">
      <span><i class="fas fa-shield-halved" style="color:var(--gold);"></i> Admin Suite</span>
      <span class="badge" style="font-size:0.62rem; padding:2px 6px; background:rgba(217,165,33,0.22); color:var(--gold-light); font-weight:800; border-radius:4px;">CTO</span>
    </a>` : ''}
    <span class="nav-section-label">Account</span>
    <a href="settings.html" class="nav-item" data-page="settings"><i class="fas fa-gear"></i> Settings</a>
    <div class="sidebar-bottom">
      <button class="nav-item logout-btn" onclick="handleLogout()">
        <i class="fas fa-right-from-bracket"></i> Logout
      </button>
    </div>
  </nav>
  <div id="toast" class="toast"></div>`;
}

function initSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const page      = window.location.pathname.split('/').pop() || 'dashboard.html';

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    const p = item.dataset.page;
      if (page.includes(p) || (p==='dashboard' && ['','dashboard.html'].includes(page)))
      item.classList.add('active');
  });

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', e => { e.stopPropagation(); sidebar.classList.toggle('open'); });
    document.addEventListener('click', e => {
      if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target))
        sidebar.classList.remove('open');
    });
  }

  // Dark mode — read from cache (set by Store.saveSettings) or localStorage mirror
  const s = Store.getSettings();
  const isDark = s.darkMode ?? (localStorage.getItem('phyzelyne_theme') === 'dark');
  if (isDark) {
    document.body.classList.add('dark');
    document.documentElement.classList.add('dark-pre');
  } else {
    document.documentElement.classList.remove('dark-pre');
  }

  // Accent theme — read from cache or localStorage mirror, same pattern as dark mode
  const accentId = s.accentTheme || localStorage.getItem('phyzelyne_accent') || 'gold';
  _applyAccentTheme(accentId);
}

function handleLogout() {
  if (confirm('Log out of Phyzelyne?')) {
    showToast('Logged out. See you soon!');
    setTimeout(() => Auth.logout(), 900);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SUBSCRIPTION REMINDER SYSTEM
   ───────────────────────────────────────────────────────────────────
   • Parses subscription transactions (those ending with [weekly|
     monthly|yearly] in the description).
   • Calculates the next due date based on the original transaction
     date and the billing cycle.
   • Sends two reminders:
       1. 2 days before the due date
       2. On the due day (before 10 AM) — "due today" reminder
   • On the due day after 10 AM, shows a payment confirmation modal.
     - If the user confirms payment → an expense transaction is
       automatically added and income is effectively reduced.
     - If the user declines → nothing is recorded, and the prompt
       won't show again until the next cycle.
   • Uses localStorage to avoid re-showing reminders the same day.
   • Checks: on page load, on tab focus, on visibility change, and
     every 30 minutes while the app is open.
═══════════════════════════════════════════════════════════════════ */
const SubReminder = (() => {
  const SEEN_KEY = 'phyzelyne_sub_reminders_seen';
  const CHECK_INTERVAL = 30 * 60 * 1000; // 30 min

  /* ── Read/write seen-reminders tracker ── */
  function _getSeen() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); }
    catch { return {}; }
  }
  function _markSeen(subId, type) {
    const seen = _getSeen();
    const today = new Date().toISOString().split('T')[0];
    if (!seen[subId]) seen[subId] = {};
    seen[subId][type] = today;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {}
  }
  function _wasSeenToday(subId, type) {
    const seen = _getSeen();
    const today = new Date().toISOString().split('T')[0];
    return seen[subId]?.[type] === today;
  }

  /* ── Parse a transaction into a subscription object ── */
  function _parse(txn) {
    if (!txn || txn.type !== 'expense') return null;
    const m = (txn.description || '').match(/^(.+?)\s+\[(weekly|monthly|yearly)\]$/);
    if (!m) return null;
    return {
      id: txn.id,
      name: m[1],
      cycle: m[2],
      amount: txn.amount,
      createdDate: txn.date || new Date().toISOString().split('T')[0],
      originalTxn: txn
    };
  }

  /* ── Calculate the next due date ── */
  function _nextDue(sub) {
    const created = new Date(sub.createdDate + 'T00:00:00');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (sub.cycle === 'monthly') {
      const day = Math.min(created.getDate(), 28); // safe base
      let next = new Date(today.getFullYear(), today.getMonth(), day);
      if (next <= today) {
        next = new Date(today.getFullYear(), today.getMonth() + 1, day);
      }
      // Clamp to last day of month if day overflows (e.g. Jan 31 -> Feb 28)
      if (next.getDate() !== day) {
        next = new Date(next.getFullYear(), next.getMonth() + 1, 0);
      }
      return next;
    }
    if (sub.cycle === 'yearly') {
      let next = new Date(today.getFullYear(), created.getMonth(), created.getDate());
      if (next <= today) next.setFullYear(next.getFullYear() + 1);
      return next;
    }
    if (sub.cycle === 'weekly') {
      const dow = created.getDay();
      const diff = (dow - today.getDay() + 7) % 7;
      let next = new Date(today);
      next.setDate(today.getDate() + (diff === 0 ? 7 : diff));
      return next;
    }
    return today;
  }

  function _daysUntil(d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }

  /* ── Show the payment confirmation modal ── */
  function _showPrompt(sub) {
    const cur = typeof getCurrency === 'function' ? getCurrency() : { symbol: '$' };
    let overlay = document.getElementById('sub-prompt-overlay');

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sub-prompt-overlay';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:380px;">
          <div class="modal-header">
            <div class="modal-title"><i class="fas fa-repeat" style="color:var(--gold);margin-right:8px;"></i> Subscription Due</div>
            <button class="modal-close" id="sub-prompt-close"><i class="fas fa-times"></i></button>
          </div>
          <div style="text-align:center;padding:8px 0 20px;">
            <div style="font-size:1.3rem;font-weight:700;margin-bottom:2px;" id="sub-prompt-name"></div>
            <div style="font-size:1.6rem;font-weight:700;color:var(--gold);margin-bottom:6px;" id="sub-prompt-amount"></div>
            <div style="font-size:0.82rem;color:var(--text-mid);margin-bottom:2px;" id="sub-prompt-cycle"></div>
            <p style="font-size:0.88rem;color:var(--text-mid);margin-top:14px;">Has this subscription been paid today?</p>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-glass" style="flex:1;justify-content:center;" id="sub-prompt-no">Not Yet</button>
            <button class="btn btn-gold" style="flex:1;justify-content:center;" id="sub-prompt-yes">Yes, Paid ✓</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.classList.remove('open');
      });
      document.getElementById('sub-prompt-close').addEventListener('click', function () {
        overlay.classList.remove('open');
      });
    }

    document.getElementById('sub-prompt-name').textContent = sub.name;
    document.getElementById('sub-prompt-amount').textContent = cur.symbol + parseFloat(sub.amount).toFixed(2);
    document.getElementById('sub-prompt-cycle').textContent = sub.cycle.charAt(0).toUpperCase() + sub.cycle.slice(1);

    // Replace buttons with fresh clones to remove old listeners
    const yesOld = document.getElementById('sub-prompt-yes');
    const noOld  = document.getElementById('sub-prompt-no');
    const yesNew = yesOld.cloneNode(true);
    const noNew  = noOld.cloneNode(true);
    yesOld.parentNode.replaceChild(yesNew, yesOld);
    noOld.parentNode.replaceChild(noNew, noOld);

    yesNew.addEventListener('click', function () {
      _handlePayment(sub, true);
      overlay.classList.remove('open');
    });
    noNew.addEventListener('click', function () {
      _handlePayment(sub, false);
      overlay.classList.remove('open');
    });

    overlay.classList.add('open');
  }

  /* ── Handle the user's payment response ── */
  function _handlePayment(sub, paid) {
    if (paid) {
      const today = new Date().toISOString().split('T')[0];
      if (typeof Store !== 'undefined' && Store.addTransaction) {
        const result = Store.addTransaction({
          type: 'expense',
          amount: sub.amount,
          description: sub.name + ' (subscription)',
          category: 'subscriptions',
          date: today
        });
        if (result && typeof showToast === 'function') {
          showToast('✅ ' + sub.name + ' paid — added to expenses');
        } else if (!result && typeof showToast === 'function') {
          showToast('⚠️ Could not add expense', 'error');
        }
      }
    } else {
      if (typeof showToast === 'function') {
        showToast('⏭️ ' + sub.name + ' skipped — will remind next cycle');
      }
    }
    _markSeen(sub.id, 'paid_' + (paid ? 'yes' : 'no'));
  }

  /* ── Main check — called on load, focus, visibility, and timer ── */
  function check() {
    if (typeof Store === 'undefined' || !Store.getTransactions) return;
    const txns = Store.getTransactions();
    const now = new Date();
    const hour = now.getHours();

    for (let i = 0; i < txns.length; i++) {
      const sub = _parse(txns[i]);
      if (!sub) continue;

      const due = _nextDue(sub);
      const daysTill = _daysUntil(due);

      // 1) Two-day-before reminder
      if (daysTill === 2 && !_wasSeenToday(sub.id, 'reminder_2d')) {
        const cur = typeof getCurrency === 'function' ? getCurrency() : { symbol: '$' };
        if (typeof showToast === 'function') {
          showToast('🔔 ' + sub.name + ' due in 2 days — ' + cur.symbol + parseFloat(sub.amount).toFixed(2));
        }
        _markSeen(sub.id, 'reminder_2d');
      }

      // 2) Day-of reminder (before 10 AM)
      if (daysTill === 0 && hour < 10 && !_wasSeenToday(sub.id, 'reminder_today')) {
        const cur = typeof getCurrency === 'function' ? getCurrency() : { symbol: '$' };
        if (typeof showToast === 'function') {
          showToast('📌 ' + sub.name + ' is due today — ' + cur.symbol + parseFloat(sub.amount).toFixed(2));
        }
        _markSeen(sub.id, 'reminder_today');
      }

      // 3) Payment prompt (after 10 AM on due day, only if not already answered)
      if (
        daysTill === 0 &&
        hour >= 10 &&
        !_wasSeenToday(sub.id, 'paid_yes') &&
        !_wasSeenToday(sub.id, 'paid_no') &&
        !_wasSeenToday(sub.id, 'prompt_shown')
      ) {
        _showPrompt(sub);
        _markSeen(sub.id, 'prompt_shown');
      }
    }
  }

  /* ── Start the reminder system ── */
  function start() {
    if (typeof document === 'undefined') return;

    // Run once data is ready
    if (_cache.ready) {
      setTimeout(check, 500);
    } else {
      document.addEventListener('phyzelyne:ready', function () { setTimeout(check, 500); }, { once: true });
    }

    // Periodic re-check
    setInterval(check, CHECK_INTERVAL);

    // Check when user returns to the tab
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check();
    });

    // Check on window focus
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', check);
    }
  }

  return { check: check, start: start, _parse: _parse, _nextDue: _nextDue };
})();

/* ══════════════════════════════════════
   MIGRATION HELPER
   One-shot: reads any leftover localStorage
   data and pushes it to Supabase.
   Call migrateFromLocalStorage() from any
   page after Auth.require() resolves.
══════════════════════════════════════ */
async function migrateFromLocalStorage() {
  if (!_cache.userId || !_sb) return;
  // One-shot marker: honour both the new key and the pre-rename key so users
  // who already migrated under the old brand don't re-run this.
  const MIGRATED_KEY = `phyzelyne_migrated_v3_${_cache.userId}`;
  const LEGACY_MIGRATED_KEY = `klyro_migrated_v3_${_cache.userId}`;
  if (localStorage.getItem(MIGRATED_KEY) || localStorage.getItem(LEGACY_MIGRATED_KEY)) return;

  // Read namespaced keys from previous app versions ('exmo_' and 'klyro_' eras)
  // plus the current 'phyzelyne_' prefix, and push any leftover data to Supabase.
  const uid = _cache.userId;
	  const oldKeys = {
	    transactions: ['exmo_transactions_' + uid, 'klyro_transactions_' + uid, 'phyzelyne_transactions_' + uid],
	    goals:        ['exmo_goals_' + uid,        'klyro_goals_' + uid,        'phyzelyne_goals_' + uid],
	    settings:     ['exmo_settings_' + uid,     'klyro_settings_' + uid,     'phyzelyne_settings_' + uid],
	    invoices:     ['klyro_invoices_' + uid,    'phyzelyne_invoices_' + uid],
	    receipts:     ['klyro_receipts_' + uid,    'phyzelyne_receipts_' + uid],
	  };
  const read = (keys) => {
    for (const k of keys) {
      try { const v = localStorage.getItem(k); if (v) return JSON.parse(v); } catch {}
    }
    return null;
  };

  let migrated = 0;
  const oldTxns     = read(oldKeys.transactions);
  const oldGoals    = read(oldKeys.goals);
  const oldSettings = read(oldKeys.settings);
  const oldInvoices = read(oldKeys.invoices);
  const oldReceipts = read(oldKeys.receipts);

  if (oldTxns?.length && !(_cache.transactions || []).length) {
    for (const t of oldTxns) await _upsert('transactions', { ...t, user_id: uid });
    migrated += oldTxns.length;
  }
  if (oldGoals?.length && !(_cache.goals || []).length) {
    for (const g of oldGoals) await _upsert('goals', { ...g, user_id: uid });
    migrated += oldGoals.length;
  }
  if (oldSettings && Object.keys(oldSettings).length && !(_cache.settings || {}).currencyCode) {
    await _upsert('settings', { ...oldSettings, user_id: uid });
    migrated++;
  }
  if (oldInvoices?.length && !(_cache.invoices || []).length) {
    for (const inv of oldInvoices) await _upsert('invoices', { ...inv, user_id: uid });
    migrated += oldInvoices.length;
  }
  if (oldReceipts?.length && !(_cache.receipts || []).length) {
    for (const r of oldReceipts) await _upsert('receipts', { ...r, user_id: uid, image: null });
    migrated += oldReceipts.length;
  }

  localStorage.setItem(MIGRATED_KEY, '1');
  if (migrated > 0) {
    await _initData(); // refresh cache from DB
    showToast(`Migrated ${migrated} records to Supabase ✓`);
  }
}

/* ══════════════════════════════════════
   PHYZELYNE REAL-TIME TELEMETRY ENGINE
   Connects all pages to Admin Dashboard
══════════════════════════════════════ */
const PhyzelyneTelemetry = {
  _channel: (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('phyzelyne_telemetry') : null,

  init() {
    if (!this._channel) return;
    this._channel.onmessage = (evt) => {
      if (evt.data?.type === 'admin_ping') {
        const u = (typeof Auth !== 'undefined') ? Auth.getUser() : null;
        try {
          this._channel.postMessage({
            type: 'admin_pong',
            page: window.location.pathname.split('/').pop() || 'index.html',
            userId: u?.id || _cache?.userId || 'guest',
            userEmail: u?.email || 'guest@phyzelyne.com',
            userName: u?.name || 'Guest User',
            ts: Date.now()
          });
        } catch(e) {}
      }
    };

    // Broadcast initial page load telemetry
    this.track('page_view', {
      page: window.location.pathname.split('/').pop() || 'index.html',
      title: document.title
    });
  },

  track(event, data = {}) {
    const user = (typeof Auth !== 'undefined') ? Auth.getUser() : null;
    const payload = {
      event,
      data,
      user: user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null,
      page: window.location.pathname.split('/').pop() || 'index.html',
      timestamp: new Date().toISOString(),
      ts: Date.now()
    };
    try {
      this._channel?.postMessage({ type: 'telemetry_event', payload });
    } catch(e) {}
  }
};

if (typeof window !== 'undefined') {
  window.PhyzelyneTelemetry = PhyzelyneTelemetry;
  PhyzelyneTelemetry.init();
}

/* ══════════════════════════════════════
   NOTE: Add the Supabase CDN script to
   every HTML page BEFORE app.js:

   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script src="app.js"></script>
══════════════════════════════════════ */

