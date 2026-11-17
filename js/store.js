// Datenhaltung: eine JSON-Datei pro Vertrag in Dropbox, verschlüsselter Cache auf dem Gerät.
import { CONFIG } from './config.js';
import * as dbx from './dropbox.js';
import * as lock from './lock.js';
import { kalenderICS } from './calc.js';
import { DEMO } from './demo.js';

const VERZ = () => CONFIG.daten + '/vertraege';
let vertraege = [];
let einstellungen = {};
let demo = false;

export const state = { get vertraege() { return vertraege; }, get demo() { return demo; }, get einstellungen() { return einstellungen; } };

export async function ladeEinstellungen() {
  einstellungen = (await lock.decryptJSON(localStorage.getItem('vv.settings')).catch(() => null)) || {};
  dbx.setSession(einstellungen.dropbox || null, (s) => { einstellungen.dropbox = s; speichereEinstellungen(); });
  return einstellungen;
}

export async function speichereEinstellungen() {
  localStorage.setItem('vv.settings', await lock.encryptJSON(einstellungen));
}

export async function setzeEinstellung(k, v) {
  einstellungen[k] = v;
  if (k === 'dropbox') dbx.setSession(v);
  await speichereEinstellungen();
}

async function cacheSchreiben() {
  localStorage.setItem('vv.cache', await lock.encryptJSON({ vertraege, zeit: Date.now() }));
}

export async function ladeCache() {
  const c = await lock.decryptJSON(localStorage.getItem('vv.cache')).catch(() => null);
  if (c) vertraege = c.vertraege;
  demo = !dbx.isConnected();
  if (demo && !vertraege.length) vertraege = structuredClone(DEMO);
  return vertraege;
}

export async function synchronisiere() {
  if (!dbx.isConnected()) { demo = true; if (!vertraege.length) vertraege = structuredClone(DEMO); return vertraege; }
  if (demo) { vertraege = []; demo = false; }
  const dateien = (await dbx.listFolder(VERZ())).filter((e) => e['.tag'] === 'file' && e.name.endsWith('.json'));
  const neu = [];
  await Promise.all(dateien.map(async (f) => {
    try {
      const v = JSON.parse(await (await dbx.download(f.path_lower)).text());
      v._datei = f.path_display;
      neu.push(v);
    } catch (e) { console.warn('Datei unlesbar', f.path_display, e); }
  }));
  vertraege = neu;
  await cacheSchreiben();
  return vertraege;
}

// Verträge aus Dokumenten bekommen eine ID aus der Dropbox-Datei-ID. So erkennen App und
// täglicher Lauf schon am Dateinamen, welche Dokumente erfasst sind.
export function idAusDokument(dateiId, n = 0) {
  return 'd-' + String(dateiId).replace(/^id:/, '') + (n ? '-' + (n + 1) : '');
}

export function neueId() {
  return 'v-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8);
}

function dateiname(v) {
  const teile = [v.kategorie, v.art, v.anbieter, v.vertragsnummer].filter(Boolean).join('_')
    .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 80);
  return `${VERZ()}/${teile || 'vertrag'}__${v.id}.json`;
}

export async function speichere(v) {
  v.aktualisiert = new Date().toISOString();
  if (!v.id) { v.id = neueId(); v.erstellt = v.aktualisiert; }
  const i = vertraege.findIndex((x) => x.id === v.id);
  if (i >= 0) vertraege[i] = v; else vertraege.push(v);
  if (!demo) {
    const ziel = dateiname(v);
    const { _datei, ...daten } = v;
    await dbx.upload(ziel, JSON.stringify(daten, null, 2), 'application/json');
    if (_datei && _datei.toLowerCase() !== ziel.toLowerCase()) await dbx.remove(_datei).catch(() => {});
    v._datei = ziel;
    await cacheSchreiben();
    kalenderAktualisieren().catch((e) => console.warn(e));
  }
  return v;
}

export async function loesche(v) {
  vertraege = vertraege.filter((x) => x.id !== v.id);
  if (!demo && v._datei) await dbx.remove(v._datei);
  if (!demo) { await cacheSchreiben(); kalenderAktualisieren().catch(() => {}); }
}

// Dateien im Eingangsordner, die noch keinem Vertrag zugeordnet sind.
export async function offeneDokumente() {
  if (!dbx.isConnected()) return [];
  const eintraege = await dbx.listFolder(CONFIG.eingang, true);
  const bekannt = new Set(vertraege.flatMap((v) => [v.quelle_id, (v.quelldatei || '').toLowerCase()]).filter(Boolean));
  const dateien = (await dbx.listFolder(VERZ())).map((e) => e.name).join('|');
  const daten = CONFIG.daten.toLowerCase();
  return eintraege.filter((e) => e['.tag'] === 'file'
    && !e.path_lower.startsWith(daten + '/')
    && !e.name.startsWith('.')
    && !bekannt.has(e.id) && !bekannt.has(e.path_lower)
    && !dateien.includes('__' + idAusDokument(e.id)));
}

export const KALENDER = () => CONFIG.daten + '/vertragsfristen.ics';

export async function kalenderAktualisieren() {
  if (!dbx.isConnected()) return null;
  await dbx.upload(KALENDER(), kalenderICS(vertraege), 'text/calendar');
  return KALENDER();
}

export async function kalenderLink() {
  await kalenderAktualisieren();
  return dbx.publicLink(KALENDER());
}

export async function exportAblegen(name, blob) {
  if (!dbx.isConnected()) return null;
  const pfad = `${CONFIG.daten}/auswertungen/${name}`;
  await dbx.upload(pfad, blob);
  return pfad;
}
