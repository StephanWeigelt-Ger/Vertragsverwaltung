// Dropbox-Zugriff direkt aus dem Browser (OAuth 2 mit PKCE, ohne eigenen Server).
import { CONFIG } from './config.js';

const AUTH = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2/';
const CONTENT = 'https://content.dropboxapi.com/2/';

let session = null; // { refresh_token, access_token, expires }
let onSessionChange = () => {};

export function setSession(s, cb) { session = s; if (cb) onSessionChange = cb; }
export function isConnected() { return !!session?.refresh_token; }

const redirectUri = () => location.origin + location.pathname;

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startLogin() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem('vv.pkce', verifier);
  const p = new URLSearchParams({
    client_id: CONFIG.dropboxAppKey, response_type: 'code', code_challenge: challenge,
    code_challenge_method: 'S256', token_access_type: 'offline', redirect_uri: redirectUri(),
  });
  location.href = `${AUTH}?${p}`;
}

// Nach der Rückkehr von Dropbox: Code gegen Tokens tauschen.
export async function finishLogin() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  if (!code) return null;
  const verifier = sessionStorage.getItem('vv.pkce');
  history.replaceState(null, '', redirectUri());
  if (!verifier) return null;
  const r = await fetch(TOKEN, {
    method: 'POST',
    body: new URLSearchParams({ code, grant_type: 'authorization_code', code_verifier: verifier, client_id: CONFIG.dropboxAppKey, redirect_uri: redirectUri() }),
  });
  if (!r.ok) throw new Error('Dropbox-Anmeldung fehlgeschlagen: ' + (await r.text()));
  const t = await r.json();
  sessionStorage.removeItem('vv.pkce');
  return { refresh_token: t.refresh_token, access_token: t.access_token, expires: Date.now() + t.expires_in * 1000 - 60000 };
}

async function token() {
  if (!session?.refresh_token) throw new Error('Dropbox ist nicht verbunden.');
  if (session.access_token && session.expires > Date.now()) return session.access_token;
  const r = await fetch(TOKEN, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refresh_token, client_id: CONFIG.dropboxAppKey }),
  });
  if (!r.ok) throw new Error('Dropbox-Zugang abgelaufen. Bitte in den Einstellungen neu verbinden.');
  const t = await r.json();
  session = { ...session, access_token: t.access_token, expires: Date.now() + t.expires_in * 1000 - 60000 };
  onSessionChange(session);
  return session.access_token;
}

// Dropbox verlangt im Header reines ASCII.
const headerArg = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

async function rpc(endpoint, body) {
  const r = await fetch(API + endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    const scope = (txt.match(/required scope '([^']+)'/) || txt.match(/"required_scope":"([^"]+)"/))?.[1];
    const err = new Error(scope
      ? `Der Dropbox-App fehlt die Berechtigung „${scope}". Bitte in der Dropbox App Console unter Permissions aktivieren, dann in den Einstellungen Dropbox trennen und neu verbinden.`
      : `Dropbox ${endpoint}: ${txt}`);
    err.status = r.status; err.body = txt;
    throw err;
  }
  return r.json();
}

export async function listFolder(path, recursive = false) {
  const entries = [];
  let res;
  try {
    res = await rpc('files/list_folder', { path, recursive, limit: 2000 });
  } catch (e) {
    if (String(e.body || '').includes('not_found')) return [];
    throw e;
  }
  entries.push(...res.entries);
  while (res.has_more) {
    res = await rpc('files/list_folder/continue', { cursor: res.cursor });
    entries.push(...res.entries);
  }
  return entries;
}

export async function download(path) {
  const r = await fetch(CONTENT + 'files/download', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await token()), 'Dropbox-API-Arg': headerArg({ path }) },
  });
  if (!r.ok) throw new Error('Download fehlgeschlagen: ' + path);
  return r.blob();
}

export async function upload(path, data, contentType = 'application/octet-stream') {
  const r = await fetch(CONTENT + 'files/upload', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + (await token()),
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': headerArg({ path, mode: 'overwrite', autorename: false, mute: true }),
    },
    body: data instanceof Blob ? data : new Blob([data], { type: contentType }),
  });
  if (!r.ok) throw new Error('Upload fehlgeschlagen: ' + (await r.text()));
  return r.json();
}

export async function remove(path) {
  return rpc('files/delete_v2', { path });
}

export async function move(from, to) {
  return rpc('files/move_v2', { from_path: from, to_path: to, autorename: true });
}

// Öffentlicher Link für das Kalender-Abo (Outlook muss die Datei ohne Anmeldung lesen können).
export async function publicLink(path) {
  let url;
  try {
    url = (await rpc('sharing/create_shared_link_with_settings', { path, settings: { requested_visibility: 'public', audience: 'public', access: 'viewer' } })).url;
  } catch (e) {
    const l = await rpc('sharing/list_shared_links', { path, direct_only: true });
    url = l.links[0]?.url;
    if (!url) throw e;
  }
  const u = new URL(url);
  u.searchParams.set('dl', '1');
  return u.toString();
}

export async function temporaryLink(path) {
  return (await rpc('files/get_temporary_link', { path })).link;
}
