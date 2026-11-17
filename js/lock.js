// App-Sperre: Passwort (PBKDF2) und Face ID / Touch ID / Windows Hello (Passkey mit PRF).
// Ein zufälliger Datenschlüssel verschlüsselt alle lokal gespeicherten Geheimnisse
// (Dropbox-Zugang, API-Schlüssel, Daten-Cache). Er wird mit dem Passwort und optional
// mit dem Passkey "eingepackt" gespeichert.

const LS = 'vv.lock';
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let dataKey = null;

function load() {
  try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; }
}
function save(o) { localStorage.setItem(LS, JSON.stringify(o)); }

export function isSetUp() { return !!load(); }
export function hasPasskey() { return !!load()?.passkey; }
export function isUnlocked() { return !!dataKey; }
export function lock() { dataKey = null; }

async function pwKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

async function prfKey(prfBytes) {
  const base = await crypto.subtle.importKey('raw', prfBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('vv-prf'), info: enc.encode('wrap') },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

async function wrap(key, wrapper) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const w = await crypto.subtle.wrapKey('raw', key, wrapper, { name: 'AES-GCM', iv });
  return { iv: b64(iv), data: b64(w) };
}
async function unwrap(obj, wrapper) {
  return crypto.subtle.unwrapKey('raw', unb64(obj.data), wrapper, { name: 'AES-GCM', iv: unb64(obj.iv) },
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function setup(password) {
  if (!password || password.length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen haben.');
  dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const w = await wrap(dataKey, await pwKey(password, salt));
  save({ v: 1, salt: b64(salt), pw: w });
}

export async function unlockPassword(password) {
  const s = load();
  try {
    dataKey = await unwrap(s.pw, await pwKey(password, unb64(s.salt)));
  } catch {
    throw new Error('Passwort falsch.');
  }
}

export async function changePassword(password) {
  if (!dataKey) throw new Error('Gesperrt');
  const s = load();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  s.salt = b64(salt);
  s.pw = await wrap(dataKey, await pwKey(password, salt));
  save(s);
}

export function passkeySupported() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

// Passkey anlegen (Face ID auf iPhone/iPad, Touch ID/Windows Hello am PC).
export async function enrollPasskey() {
  if (!dataKey) throw new Error('Gesperrt');
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Vertragsverwaltung' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'vertragsverwaltung', displayName: 'Vertragsverwaltung' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: { eval: { first: prfSalt } } },
      timeout: 60000,
    },
  });
  const s = load();
  const id = b64(cred.rawId);
  let prfOut = cred.getClientExtensionResults()?.prf?.results?.first;
  if (!prfOut) {
    // Manche Geräte liefern PRF erst bei der Anmeldung
    prfOut = await assertion(id, prfSalt).then((r) => r.prf).catch(() => null);
  }
  if (prfOut) {
    s.passkey = { id, prfSalt: b64(prfSalt), wrapped: await wrap(dataKey, await prfKey(prfOut)) };
  } else {
    // Fallback ohne PRF: Datenschlüssel bleibt im geschützten Gerätespeicher,
    // Freigabe nur nach erfolgreicher biometrischer Prüfung.
    await idbPut('dataKey', await nonExtractableCopy(dataKey));
    s.passkey = { id, prfSalt: b64(prfSalt), fallback: true };
  }
  save(s);
}

export function removePasskey() {
  const s = load();
  delete s.passkey;
  save(s);
  idbPut('dataKey', null);
}

async function assertion(id, prfSalt) {
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(id) }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: prfSalt } } },
      timeout: 60000,
    },
  });
  return { prf: a.getClientExtensionResults()?.prf?.results?.first || null };
}

export async function unlockPasskey() {
  const s = load();
  if (!s?.passkey) throw new Error('Kein Face-ID-Zugang eingerichtet.');
  const r = await assertion(s.passkey.id, unb64(s.passkey.prfSalt));
  if (s.passkey.wrapped) {
    if (!r.prf) throw new Error('Gerät lieferte keinen Schlüssel. Bitte Passwort verwenden.');
    dataKey = await unwrap(s.passkey.wrapped, await prfKey(r.prf));
  } else {
    dataKey = await idbGet('dataKey');
    if (!dataKey) throw new Error('Schlüssel nicht gefunden. Bitte Passwort verwenden.');
  }
}

async function nonExtractableCopy(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({ iv: b64(iv), ct: b64(ct) });
}

export async function decryptJSON(str) {
  if (!str) return null;
  const o = JSON.parse(str);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, dataKey, unb64(o.ct));
  return JSON.parse(dec.decode(pt));
}

export function reset() {
  localStorage.removeItem(LS);
  for (const k of Object.keys(localStorage)) if (k.startsWith('vv.')) localStorage.removeItem(k);
  idbPut('dataKey', null);
  dataKey = null;
}

// --- Mini-IndexedDB ---
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('vv', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(k, v) {
  const db = await idb();
  return new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); });
}
