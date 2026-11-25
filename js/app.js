import * as lock from './lock.js';
import * as store from './store.js';
import * as dbx from './dropbox.js';
import * as c from './calc.js';
import { CONFIG } from './config.js';
import { ABSCHNITTE, SICHERHEIT_FELDER } from './felder.js';
import { BERICHTE, erstelle } from './berichte.js';
import { aufbereiten, formatiere, alsPDF, alsExcel, herunterladen } from './export.js';
import { analysiere, analysierbar } from './analyse.js';
import { treffer as suchTreffer } from './suche.js';
import { istNachtrag, findeVertrag, kurzueberblick, nachtragDatum, aendWert } from './nachtraege.js';
import * as hinweise from './hinweise.js';

const $ = (s, el = document) => el.querySelector(s);
const main = () => $('#main');

// Passwortfelder sind Textfelder mit Punkten, damit iPhone/iPad nicht „Starkes Passwort verwenden?“ fragt.
// Browser ohne Punkt-Darstellung bekommen wieder ein normales Passwortfeld.
if (!(window.CSS && CSS.supports && CSS.supports('-webkit-text-security', 'disc'))) {
  new MutationObserver(() => document.querySelectorAll('input.pw[type="text"]').forEach((i) => { i.type = 'password'; }))
    .observe(document.documentElement, { childList: true, subtree: true });
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const heute = () => c.isoDate(new Date());

// ---------------- Hilfen ----------------
function toast(text, art = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + art;
  t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), art === 'fehler' ? 7000 : 3500);
}
async function versuch(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { console.error(e); toast(e.message || String(e), 'fehler'); return undefined; }
}
function titelVon(v) {
  if (istNachtrag(v)) return ['Nachtrag', v.nachtrag?.titel || v.art, v.anbieter].filter(Boolean).join(' · ');
  return [v.art || v.kategorie, v.anbieter].filter(Boolean).join(' · ') || 'Vertrag';
}

function nachtragsBlock(n, mitDoc = true) {
  const nt = n.nachtrag || {};
  const aend = (nt.aenderungen || []).filter((a) => a && (a.neu !== undefined || a.alt !== undefined));
  return `<article class="nachtrag">
    <div class="nt-kopf"><b>${esc(nt.titel || 'Nachtrag')}</b><span class="info">${nt.datum ? `vom ${c.fmtDatum(nt.datum)}` : ''}${nt.gueltig_ab ? ` · gültig ab ${c.fmtDatum(nt.gueltig_ab)}` : ''}</span></div>
    ${nt.inhalt ? `<p>${esc(nt.inhalt)}</p>` : n.analyse?.zusammenfassung ? `<p>${esc(n.analyse.zusammenfassung)}</p>` : ''}
    ${aend.length ? `<ul class="aenderungen">${aend.map((a) => `<li><span>${esc(a.bezeichnung || a.feld)}</span> ${a.alt !== null && a.alt !== undefined && a.alt !== '' ? `<s>${esc(aendWert(a.alt, a.feld))}</s> → ` : ''}<b>${esc(aendWert(a.neu, a.feld))}</b></li>`).join('')}</ul>` : ''}
    ${n.analyse?.kritisch?.length ? `<p class="rot klein">Kritisch: ${esc(n.analyse.kritisch.join(' · '))}</p>` : ''}
    <div class="aktionen">${mitDoc && n.quelldatei ? `<button data-doc="${esc(n.quelle_id || n.quelldatei)}">Dokument öffnen</button>` : ''}${mitDoc ? `<button class="link" data-loesen="${esc(n.id)}">Zuordnung lösen</button>` : ''}</div>
  </article>`;
}
function fristBadge(v) {
  const sp = c.kuendigungSpaetestens(v);
  if (!sp || v.status === 'gekündigt' || v.status === 'beendet') return '';
  const t = c.tageBis(sp);
  const cls = t < 0 ? 'grau' : t <= 31 ? 'rot' : t <= 62 ? 'gelb' : 'gruen';
  return `<span class="badge ${cls}" title="Kündigung spätestens">${t < 0 ? 'Frist vorbei' : `Kündigen bis ${c.fmtDatum(sp)}`}</span>`;
}

// ---------------- Sperre ----------------
function zeigeSperre(faceIdSofort = true) {
  document.body.classList.add('gesperrt');
  const neu = !lock.isSetUp();
  main().innerHTML = `
  <section class="sperre">
    <img src="icons/icon-192.png" alt="" width="72" height="72">
    <h1>Vertragsverwaltung</h1>
    ${neu ? `
      <p>Lege ein Passwort für diese App auf diesem Gerät fest. Danach kannst du Face ID bzw. Touch ID einrichten.</p>
      <form id="f-setup" class="karte">
        <label>Passwort<input type="text" class="pw" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore name="pw" minlength="8" required></label>
        <label>Passwort wiederholen<input type="text" class="pw" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore name="pw2" required></label>
        <button class="primaer">Einrichten</button>
      </form>` : `
      <form id="f-unlock" class="karte">
        ${lock.hasPasskey() ? '<button type="button" id="b-faceid" class="primaer gross">Mit Face ID entsperren</button><div class="oder">oder</div>' : ''}
        <label>Passwort<input type="text" class="pw" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore name="pw" required></label>
        <button class="${lock.hasPasskey() ? '' : 'primaer'}">Entsperren</button>
      </form>
      ${!lock.hasPasskey() && lock.passkeySupported() ? '<p class="info">Face ID ist auf diesem Gerät noch nicht eingerichtet. Entsperre einmal mit dem Passwort und tippe dann unter Einstellungen › Entsperren auf „Face ID einrichten“.</p>' : ''}
      <button class="link" id="b-reset">Passwort vergessen? App auf diesem Gerät zurücksetzen</button>`}
  </section>`;
  if (neu) {
    $('#f-setup').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (f.get('pw') !== f.get('pw2')) return toast('Die Passwörter stimmen nicht überein.', 'fehler');
      await versuch(async () => { await lock.setup(f.get('pw')); await nachEntsperren(true); });
    };
  } else {
    $('#f-unlock').onsubmit = async (e) => {
      e.preventDefault();
      await versuch(async () => {
        await lock.unlockPassword(new FormData(e.target).get('pw'));
        if (!lock.hasPasskey() && lock.passkeySupported()) location.hash = '#/einstellungen';
        await nachEntsperren();
      });
    };
    const fb = $('#b-faceid');
    if (fb) {
      fb.onclick = () => versuch(async () => { await lock.unlockPasskey(); await nachEntsperren(); });
      // Face ID gleich beim Öffnen anbieten. Lässt der Browser das ohne Tippen nicht zu, bleibt der Knopf.
      if (faceIdSofort) lock.unlockPasskey()
        .then(() => { if (document.body.classList.contains('gesperrt')) return nachEntsperren(); })
        .catch(() => {});
    }
    $('#b-reset').onclick = () => {
      if (confirm('Alle lokal gespeicherten Zugänge auf diesem Gerät löschen? Deine Verträge in der Dropbox bleiben erhalten.')) { lock.reset(); location.reload(); }
    };
  }
}

async function nachEntsperren(ersteinrichtung = false) {
  document.body.classList.remove('gesperrt');
  await store.ladeEinstellungen();
  // Rückkehr von der Dropbox-Anmeldung?
  const neu = await versuch(() => dbx.finishLogin());
  if (neu) { await store.setzeEinstellung('dropbox', neu); toast('Dropbox verbunden.'); }
  await store.ladeCache();
  if (ersteinrichtung && lock.passkeySupported()) location.hash = '#/einstellungen';
  route();
  if (dbx.isConnected()) {
    await versuch(() => store.synchronisiere());
    route();
    pruefeErinnerungen();
    store.kalenderAktualisieren().catch(() => {});
  }
}

let verstecktSeit = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) verstecktSeit = Date.now();
  else if (lock.isUnlocked() && verstecktSeit && Date.now() - verstecktSeit > 5 * 60000) { lock.lock(); zeigeSperre(); }
  else if (lock.isUnlocked() && dbx.isConnected() && verstecktSeit && Date.now() - verstecktSeit > 60000) aktualisieren(false);
});

// Daten neu aus der Dropbox laden und die aktuelle Seite neu zeichnen.
async function aktualisieren(mitMeldung = true) {
  if (!dbx.isConnected()) return route();
  const knopf = $('#b-aktualisieren');
  if (knopf) { knopf.disabled = true; knopf.textContent = 'Lädt …'; }
  const ok = await versuch(() => store.synchronisiere());
  route();
  if (ok && mitMeldung) toast(`${store.state.roh.length} Dateien geladen.`);
}

// ---------------- Erinnerungen in der App ----------------
function faelligeErinnerungen() {
  const h = new Date();
  return store.state.vertraege.filter((v) => v.status !== 'gekündigt' && v.status !== 'beendet').map((v) => ({ v, er: c.erinnerungsdatum(v, h), sp: c.kuendigungSpaetestens(v, h) }))
    .filter((x) => x.er && x.er <= h && x.sp >= c.parseDate(h));
}
function pruefeErinnerungen() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const gezeigt = JSON.parse(localStorage.getItem('vv.notified') || '{}');
  for (const { v, sp } of faelligeErinnerungen()) {
    const key = v.id + c.isoDate(sp);
    if (gezeigt[key] === heute()) continue;
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification('Kündigungsfrist läuft ab', {
      body: `${titelVon(v)}: Kündigung bis ${c.fmtDatum(sp)}`, tag: key, icon: 'icons/icon-192.png', data: { url: `#/vertrag/${v.id}` },
    }));
    gezeigt[key] = heute();
  }
  localStorage.setItem('vv.notified', JSON.stringify(gezeigt));
}

// ---------------- Router ----------------
const ROUTES = {
  '': uebersicht, uebersicht, vertraege: liste, vertrag: detail, bearbeiten: bearbeiten, neu: () => bearbeiten(null),
  auswertungen, auswertung: auswertung, eingang, einstellungen,
};
function route() {
  if (!lock.isUnlocked()) return zeigeSperre();
  const [, name = '', arg] = decodeURIComponent(location.hash).split('/');
  for (const a of document.querySelectorAll('nav a')) a.classList.toggle('aktiv', a.getAttribute('href') === `#/${name || 'uebersicht'}`);
  $('#demo-hinweis').hidden = !store.state.demo;
  (ROUTES[name] || uebersicht)(arg);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------------- Übersicht ----------------
function uebersicht() {
  const vs = store.state.vertraege.filter((v) => v.status !== 'beendet' && !istNachtrag(v));
  const offeneNachtraege = store.state.vertraege.filter(istNachtrag);
  const jahres = vs.reduce((a, v) => a + (c.jahresbeitrag(v) || 0), 0);
  const restschuld = vs.filter((v) => v.kategorie === 'Darlehen').reduce((a, v) => a + c.restschuld(v), 0);
  const fristen = vs.map((v) => ({ v, sp: c.kuendigungSpaetestens(v) })).filter((x) => x.sp && x.v.status !== 'gekündigt' && c.tageBis(x.sp) >= 0 && c.tageBis(x.sp) <= 120)
    .sort((a, b) => a.sp - b.sp);
  const pruefen = [...vs.filter((v) => v.pruefen || v._nachtraege?.some((n) => n.pruefen)), ...offeneNachtraege];
  const proKat = {};
  for (const v of vs) proKat[v.kategorie] = (proKat[v.kategorie] || 0) + 1;
  const hw = hinweise.sammle(store.state.vertraege);
  const kritProV = new Map();
  for (const k of hw.kritisch) {
    const e = kritProV.get(k.v.id) || { v: k.v, punkte: [] };
    e.punkte.push(...k.punkte.map((t) => (k.unterlage ? `${k.unterlage.art || 'Unterlage'}: ` : '') + t));
    kritProV.set(k.v.id, e);
  }
  const fristGruppen = new Map();
  for (const f of hw.fristen) { const d = c.fmtDatum(f.sp); fristGruppen.set(d, [...(fristGruppen.get(d) || []), f]); }
  const kurzTitel = (v) => [v.art || v.kategorie, v.kennzeichen || v.objekt || v.vertragsnummer].filter(Boolean).join(' ');
  const hinweisKarte = hw.fristen.length || kritProV.size ? `
    <section class="karte hinweise">
      <h2>Hinweise</h2>
      ${[...fristGruppen.entries()].map(([d, fs]) => `
        <h3 class="rot">Bis ${d} entscheiden <small>(Kündigung zum ${c.fmtDatum(fs[0].termin)})</small></h3>
        <ul>${fs.map((f) => `<li><a href="#/vertrag/${f.v.id}"><b>${esc(kurzTitel(f.v))}</b></a> · ${esc(f.v.anbieter || '')}${c.jahresbeitrag(f.v) ? `, ${c.fmtEuro(c.jahresbeitrag(f.v))} im Jahr` : ''}${f.tipp ? `<br><span class="klein">${esc(f.tipp)}</span>` : ''}</li>`).join('')}</ul>`).join('')}
      ${kritProV.size ? `<h3 class="rot">Kritisch</h3>
        <ul>${[...kritProV.values()].map(({ v, punkte }) => `<li><a href="#/vertrag/${v.id}"><b>${esc(kurzTitel(v))}</b></a>${v.anbieter ? ` · ${esc(v.anbieter)}` : ''}${v.status === 'beendet' ? ' (beendet)' : ''}: ${esc(punkte[0])}${punkte.length > 1 ? ` <span class="klein">+${punkte.length - 1} weitere</span>` : ''}</li>`).join('')}</ul>` : ''}
    </section>` : '';
  const fehlerKarte = store.state.syncFehler ? `<div class="karte fehler"><b>Verträge konnten nicht geladen werden.</b><p>${esc(store.state.syncFehler)}</p></div>` : '';
  main().innerHTML = `
    <div class="kopf"><h1>Übersicht</h1>${dbx.isConnected() ? `<div class="aktionen"><button id="b-aktualisieren">Aktualisieren</button></div>` : ''}</div>
    ${fehlerKarte}
    <form id="f-suche" class="suchleiste"><input type="search" name="q" placeholder="Vertrag suchen: Nummer, Kennzeichen, Objekt, Zähler, Betrag …" autocomplete="off"><button class="primaer">Suchen</button></form>
    <div class="kpis">
      <div class="kpi"><span>Aktive Verträge</span><b>${vs.length}</b></div>
      <div class="kpi"><span>Beiträge pro Jahr</span><b>${c.fmtEuro(jahres)}</b><small>Ø ${c.fmtEuro(jahres / 12)} im Monat</small></div>
      <div class="kpi"><span>Restschuld Darlehen</span><b>${c.fmtEuro(restschuld)}</b></div>
      <div class="kpi ${fristen.some((f) => c.tageBis(f.sp) <= 31) ? 'warn' : ''}"><span>Fristen in 120 Tagen</span><b>${fristen.length}</b></div>
    </div>
    ${hinweisKarte}
    ${pruefen.length ? `<details class="karte hinweis"${pruefen.length <= 5 ? ' open' : ''}><summary><b>${pruefen.length} neu erfasste Verträge/Nachträge bitte prüfen${offeneNachtraege.length ? ` (${offeneNachtraege.length} Nachtrag ohne Zuordnung)` : ''}</b></summary>
      <ul>${pruefen.map((v) => `<li><a href="#/vertrag/${v.id}">${esc(titelVon(v))}</a></li>`).join('')}</ul></details>` : ''}
    <div class="raster2">
      <section class="karte">
        <h2>Anstehende Kündigungsfristen</h2>
        ${fristen.length ? `<ul class="liste">${fristen.map(({ v, sp }) => `
          <li><a href="#/vertrag/${v.id}"><span>${esc(titelVon(v))}<small>${esc(v.objekt || v.kennzeichen || v.vertragsnummer || '')}</small></span>
          ${fristBadge(v)}</a></li>`).join('')}</ul>` : '<p class="leer">Keine Fristen in den nächsten 120 Tagen.</p>'}
      </section>
      <section class="karte">
        <h2>Verträge nach Kategorie</h2>
        <ul class="liste">${Object.entries(proKat).sort().map(([k, n]) => `<li><a href="#/vertraege/${encodeURIComponent(k)}"><span>${esc(k)}</span><b>${n}</b></a></li>`).join('') || '<p class="leer">Noch keine Verträge.</p>'}</ul>
      </section>
    </div>`;
  $('#b-aktualisieren') && ($('#b-aktualisieren').onclick = () => aktualisieren());
  $('#f-suche').onsubmit = (e) => {
    e.preventDefault();
    Object.assign(filter, { q: String(new FormData(e.target).get('q') || ''), kat: '', fokus: true });
    location.hash = '#/vertraege/';
  };
}

// ---------------- Vertragsliste ----------------
let filter = { q: '', kat: '', gruppe: '', sort: 'titel' };
const suchCache = new WeakMap();
function liste(kat) {
  if (kat !== undefined) filter.kat = kat;
  const alle = store.state.vertraege;
  const kats = [...new Set(alle.map((v) => v.kategorie).filter(Boolean))].sort();
  main().innerHTML = `
    <div class="kopf"><h1>Verträge</h1><a class="knopf primaer" href="#/neu">+ Neu</a></div>
    <div class="filter">
      <input type="search" id="q" placeholder="Suchen in allen Feldern: Nummer, Kennzeichen, Objekt, Zähler, Betrag, Datum …" value="${esc(filter.q)}" autocomplete="off">
      <details class="tipp"><summary>Suchtipps</summary>
        <p>Gesucht wird in <b>allen Feldern</b> inkl. Sicherheiten, Analyse und Dokumentname. Mehrere Wörter müssen alle vorkommen.
        Beträge und Daten so eingeben, wie du sie kennst (<i>1.184,40</i>, <i>01.01.2027</i>, <i>Januar 2027</i>). Kennzeichen und Nummern gehen auch ohne Leerzeichen (<i>levsw123</i>).
        Gezielt in einem Feld: <i>kennzeichen:LEV</i>, <i>zähler:1ESY</i>, <i>art:kfz</i>, <i>anbieter:"Muster Versicherung"</i>.</p></details>
      <div class="chips">${['', ...kats].map((k) => `<button class="chip ${filter.kat === k ? 'an' : ''}" data-kat="${esc(k)}">${esc(k || 'Alle')}</button>`).join('')}</div>
      <div class="zeile">
        <label>Gruppieren<select id="gruppe">${[['', 'keine'], ['kategorie', 'Kategorie'], ['art', 'Art'], ['objekt', 'Objekt'], ['anbieter', 'Anbieter']].map(([k, l]) => `<option value="${k}" ${filter.gruppe === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Sortieren<select id="sort">${[['titel', 'Art / Anbieter'], ['frist', 'Kündigungsfrist'], ['beitrag', 'Jahresbeitrag'], ['objekt', 'Objekt']].map(([k, l]) => `<option value="${k}" ${filter.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="beendet" ${filter.beendet ? 'checked' : ''}> beendete zeigen</label>
      </div>
    </div>
    <div id="treffer"></div>`;
  const zeichnen = () => {
    const fund = new Map();
    let vs = alle.filter((v) => {
      if (filter.kat && v.kategorie !== filter.kat) return false;
      if (!filter.beendet && v.status === 'beendet' && !filter.q) return false;
      if (!filter.q.trim()) return true;
      const t = suchTreffer(v, filter.q, suchCache);
      if (t) fund.set(v, t);
      return !!t;
    });
    const sorter = {
      titel: (a, b) => titelVon(a).localeCompare(titelVon(b), 'de'),
      frist: (a, b) => (c.kuendigungSpaetestens(a) || 9e15) - (c.kuendigungSpaetestens(b) || 9e15),
      beitrag: (a, b) => (c.jahresbeitrag(b) || 0) - (c.jahresbeitrag(a) || 0),
      objekt: (a, b) => String(a.objekt || a.kennzeichen || '~').localeCompare(String(b.objekt || b.kennzeichen || '~'), 'de'),
    }[filter.sort];
    vs = vs.sort(sorter);
    const gruppen = new Map();
    for (const v of vs) {
      const g = filter.gruppe ? (v[filter.gruppe] || (filter.gruppe === 'objekt' && v.kennzeichen) || '(ohne Angabe)') : '';
      if (!gruppen.has(g)) gruppen.set(g, []);
      gruppen.get(g).push(v);
    }
    const summe = vs.reduce((a, v) => a + (c.jahresbeitrag(v) || 0), 0);
    $('#treffer').innerHTML = `<p class="info">${vs.length} Verträge · Jahresbeiträge ${c.fmtEuro(summe)}</p>` +
      [...gruppen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([g, items]) => `
        ${g ? `<h3 class="gruppe">${esc(g)} <small>${items.length} · ${c.fmtEuro(items.reduce((a, v) => a + (c.jahresbeitrag(v) || 0), 0))} p. a.</small></h3>` : ''}
        <div class="karten">${items.map((v) => vertragKarte(v, fund.get(v))).join('')}</div>`).join('') || '<p class="leer">Keine Treffer.</p>';
  };
  zeichnen();
  $('#q').oninput = (e) => { filter.q = e.target.value; zeichnen(); };
  if (filter.fokus) { filter.fokus = false; const q = $('#q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  $('#gruppe').onchange = (e) => { filter.gruppe = e.target.value; zeichnen(); };
  $('#sort').onchange = (e) => { filter.sort = e.target.value; zeichnen(); };
  $('#beendet').onchange = (e) => { filter.beendet = e.target.checked; zeichnen(); };
  for (const b of document.querySelectorAll('.chip')) b.onclick = () => { filter.kat = b.dataset.kat; liste(); };
}

function vertragKarte(v, fund) {
  const jb = c.jahresbeitrag(v);
  const d = v.darlehen;
  return `<a class="vkarte ${v.status === 'beendet' ? 'aus' : ''}" href="#/vertrag/${v.id}">
    <div class="vk-kopf"><span class="kat">${esc(istNachtrag(v) ? 'Nachtrag' : v.kategorie || '')}</span>${istNachtrag(v) ? '<span class="badge gelb">zuordnen</span>' : ''}${v._nachtraege?.length ? `<span class="badge grau">${v._nachtraege.length} Nachtr.</span>` : ''}${v.pruefen || v._nachtraege?.some((n) => n.pruefen) ? '<span class="badge blau">prüfen</span>' : ''}${v.status === 'gekündigt' ? '<span class="badge grau">gekündigt</span>' : ''}</div>
    <b>${esc(titelVon(v))}</b>
    <small>${esc([v.vertragsnummer && 'Nr. ' + v.vertragsnummer, v.kennzeichen, v.objekt].filter(Boolean).join(' · '))}</small>
    ${fund?.length ? `<div class="fund">${fund.slice(0, 3).map((f) => `<span><i>${esc(f.feld)}:</i> ${esc(f.wert.length > 70 ? f.wert.slice(0, 70) + '…' : f.wert)}</span>`).join('')}</div>` : ''}
    <div class="vk-fuss">
      ${d ? `<span>Restschuld ${c.fmtEuro(c.restschuld(v))}</span>` : jb ? `<span>${c.fmtEuro(c.num(v.beitrag))} ${esc(v.beitrag_rhythmus || '')}</span>` : '<span></span>'}
      ${fristBadge(v)}
    </div>
  </a>`;
}

// ---------------- Detail ----------------
function feldWert(f, wert) {
  if (wert === null || wert === undefined || wert === '') return '';
  return f.typ === 'euro' ? c.fmtEuro(c.num(wert)) : f.typ === 'datum' ? c.fmtDatum(wert) : f.typ === 'prozent' ? c.fmtProzent(wert) : esc(wert);
}

// Hinweise oben im Vertrag: anstehende Entscheidung und offene kritische Punkte (auch aus Unterlagen und Nachträgen).
function hinweisBox(v) {
  const f = hinweise.fristHinweis(v);
  const quellen = [v, ...(v._unterlagen || []), ...(v._nachtraege || [])];
  const punkte = quellen.flatMap((q) => hinweise.offenePunkte(q).map((t) => ({ q, t })));
  if (!f && !punkte.length) return '';
  const tipp = (v.analyse?.verbesserungen || [])[0];
  return `<section class="karte hinweise"><h2>Hinweise</h2>
    ${f ? `<p class="rot"><b>Bis ${c.fmtDatum(f.sp)} entscheiden</b> (noch ${f.tage} Tage): Kündigung zum ${c.fmtDatum(f.termin)}${c.jahresbeitrag(v) ? `, Jahresbeitrag ${c.fmtEuro(c.jahresbeitrag(v))}` : ''}.${tipp ? ` ${esc(tipp)}` : ''}</p>` : ''}
    ${punkte.length ? `<ul class="punkte">${punkte.map(({ q, t }) => `<li><span>${q !== v ? `<i>${esc(istNachtrag(q) ? 'Nachtrag' : q.art || 'Unterlage')}:</i> ` : ''}${esc(t)}</span>
      <button class="klein" data-erledigt="${esc(t)}" data-quelle="${esc(q.id)}">Erledigt</button></li>`).join('')}</ul>` : ''}
  </section>`;
}

function detail(id) {
  const v = store.state.vertraege.find((x) => x.id === id);
  if (!v) { main().innerHTML = '<p class="leer">Vertrag nicht gefunden.</p>'; return; }
  const sp = c.kuendigungSpaetestens(v);
  const termin = c.naechsterKuendigungstermin(v);
  const a = v.analyse || {};
  const abschnitte = ABSCHNITTE.filter((s) => !s.wenn || s.wenn(v)).map((s) => {
    const quelle = s.pfad ? v[s.pfad] || {} : v;
    const zeilen = s.felder.filter((f) => (!f.wenn || f.wenn(v)) && quelle[f.k] !== undefined && quelle[f.k] !== null && quelle[f.k] !== '')
      .map((f) => `<dt>${esc(f.label)}</dt><dd>${feldWert(f, quelle[f.k])}</dd>`).join('');
    return zeilen ? `<section class="karte"><h2>${esc(s.titel)}</h2><dl>${zeilen}</dl></section>` : '';
  }).join('');
  const zusatz = v.zusatzfelder && Object.keys(v.zusatzfelder).length
    ? `<section class="karte"><h2>Weitere Angaben</h2><dl>${Object.entries(v.zusatzfelder).map(([k, w]) => `<dt>${esc(k)}</dt><dd>${esc(typeof w === 'object' ? JSON.stringify(w) : w)}</dd>`).join('')}</dl></section>` : '';
  const sich = v.darlehen?.sicherheiten?.length ? `<section class="karte breit"><h2>Sicherheiten</h2><div class="tabelle"><table>
      <thead><tr>${SICHERHEIT_FELDER.map((f) => `<th>${f.label}</th>`).join('')}</tr></thead>
      <tbody>${v.darlehen.sicherheiten.map((s) => `<tr>${SICHERHEIT_FELDER.map((f) => `<td class="${f.typ === 'euro' ? 'r' : ''}">${feldWert(f, s[f.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : '';
  let plan = '';
  if (v.kategorie === 'Darlehen' || v.kategorie === 'Leasing') {
    const p = c.tilgungsplan(v);
    const b = c.laufzeitBaender(v);
    const jahre = new Map();
    for (const z of p) {
      const j = z.datum.getFullYear();
      const e = jahre.get(j) || { zins: 0, tilgung: 0, rest: 0 };
      e.zins += z.zins; e.tilgung += z.tilgung; e.rest = z.rest;
      jahre.set(j, e);
    }
    plan = `<section class="karte breit"><h2>Tilgungsplan und Restlaufzeiten</h2>
      <div class="kpis klein">
        <div class="kpi"><span>Restlaufzeit bis 1 Jahr</span><b>${c.fmtEuro(b.bis1)}</b></div>
        <div class="kpi"><span>1 bis 5 Jahre</span><b>${c.fmtEuro(b.bis5)}</b></div>
        <div class="kpi"><span>über 5 Jahre</span><b>${c.fmtEuro(b.ueber5)}</b></div>
        <div class="kpi"><span>Zinsen nächste 12 Monate</span><b>${c.fmtEuro(b.zins12)}</b></div>
      </div>
      ${jahre.size ? `<div class="tabelle"><table><thead><tr><th>Jahr</th><th class="r">Zinsen</th><th class="r">Tilgung</th><th class="r">Restschuld Jahresende</th></tr></thead>
      <tbody>${[...jahre.entries()].map(([j, e]) => `<tr><td>${j}</td><td class="r">${c.fmtEuro(e.zins)}</td><td class="r">${c.fmtEuro(e.tilgung)}</td><td class="r">${c.fmtEuro(e.rest)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="leer">Für einen Tilgungsplan Restschuld, Zinssatz und Rate erfassen.</p>'}
    </section>`;
  }
  main().innerHTML = `
    <div class="kopf"><a href="#/vertraege" class="zurueck">‹ Verträge</a>
      <div class="aktionen"><a class="knopf" href="#/bearbeiten/${v.id}">Bearbeiten</a></div></div>
    <h1>${esc(titelVon(v))}</h1>
    <p class="untertitel">${esc([v.kategorie, v.vertragsnummer && 'Nr. ' + v.vertragsnummer, v.objekt || v.kennzeichen].filter(Boolean).join(' · '))} ${fristBadge(v)}</p>
    ${v.pruefen ? `<div class="karte hinweis">Automatisch erfasst. Bitte Angaben prüfen. <button id="b-geprueft" class="primaer">Geprüft</button></div>` : ''}
    ${(v._nachtraege || []).some((n) => n.pruefen) ? `<div class="karte hinweis">Neuer Nachtrag automatisch zugeordnet. Bitte prüfen. <button id="b-nt-geprueft" class="primaer">Geprüft</button></div>` : ''}
    ${istNachtrag(v) ? `<div class="karte hinweis"><b>Dieser Nachtrag ist noch keinem Vertrag zugeordnet.</b>
      <form id="f-zuordnen" class="zeile"><select name="ziel" required><option value="">Vertrag wählen …</option>${store.state.vertraege.filter((x) => !istNachtrag(x)).sort((a, b) => titelVon(a).localeCompare(titelVon(b), 'de'))
        .map((x) => `<option value="${esc(x.id)}">${esc(titelVon(x))}${x.vertragsnummer ? ` (${esc(x.vertragsnummer)})` : ''}${x.objekt || x.kennzeichen ? ` · ${esc(x.kennzeichen || x.objekt)}` : ''}</option>`).join('')}</select><button class="primaer">Zuordnen</button></form></div>
      <section class="karte"><h2>Nachtrag</h2>${nachtragsBlock(v, false)}</section>` : ''}
    <section class="karte ueberblick"><h2>Kurzüberblick</h2><p>${esc(kurzueberblick(v))}</p></section>
    ${hinweisBox(v)}
    ${v._unterlagen?.length ? `<section class="karte"><h2>Unterlagen (${v._unterlagen.length})</h2>${v._unterlagen.map((u) => `<div class="nachtrag">
        <div class="nt-kopf"><b>${esc(u.art || 'Unterlage')}</b>${u.anbieter ? `<span class="klein">${esc(u.anbieter)}</span>` : ''}</div>
        ${u.analyse?.zusammenfassung ? `<p>${esc(u.analyse.zusammenfassung)}</p>` : ''}
        ${u.quelle_id || u.quelldatei ? `<button class="klein" data-doc="${esc(u.quelle_id || u.quelldatei)}">Dokument öffnen</button>` : ''}</div>`).join('')}</section>` : ''}
    ${v._nachtraege?.length ? `<section class="karte"><h2>Nachträge (${v._nachtraege.length})</h2>${[...v._nachtraege].reverse().map((n) => nachtragsBlock(n)).join('')}</section>` : ''}
    ${sp ? `<div class="karte frist"><div><span>Kündigung spätestens</span><b>${c.fmtDatum(sp)}</b></div><div><span>Vertragsablauf</span><b>${c.fmtDatum(termin)}</b></div><div><span>Erinnerung</span><b>${c.fmtDatum(c.erinnerungsdatum(v))}</b></div></div>` : ''}
    ${a.zusammenfassung || a.kritisch?.length || a.verbesserungen?.length ? `
      <section class="karte analyse">
        <h2>Analyse</h2>
        ${a.zusammenfassung ? `<p>${esc(a.zusammenfassung)}</p>` : ''}
        ${a.kritisch?.length ? `<h3 class="rot">Kritisch</h3><ul>${a.kritisch.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${a.verbesserungen?.length ? `<h3 class="gruen">Verbesserungsvorschläge</h3><ul>${a.verbesserungen.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${a.vollstaendigkeit ? `<p class="info">Fehlende Angaben: ${esc(a.vollstaendigkeit)}</p>` : ''}
      </section>` : ''}
    <div class="raster2">${abschnitte}${zusatz}</div>
    ${sich}${plan}
    <div class="aktionen unten">
      ${v.quelldatei ? '<button id="b-doc">Originaldokument öffnen</button>' : ''}
      ${v.status !== 'gekündigt' ? '<button id="b-gek">Als gekündigt markieren</button>' : ''}
      <button id="b-del" class="gefahr">Löschen</button>
    </div>`;
  const setz = async (patch, msg) => { Object.assign(v, patch); await versuch(() => store.speichere(v), msg); detail(id); };
  $('#b-geprueft') && ($('#b-geprueft').onclick = () => setz({ pruefen: false }, 'Gespeichert.'));
  $('#b-gek') && ($('#b-gek').onclick = () => setz({ status: 'gekündigt', gekuendigt_am: heute() }, 'Als gekündigt markiert.'));
  $('#b-doc') && ($('#b-doc').onclick = () => versuch(async () => window.open(await dbx.temporaryLink(v.quelle_id || v.quelldatei), '_blank')));
  const roh = (nid) => store.state.roh.find((x) => x.id === nid);
  for (const b of document.querySelectorAll('[data-erledigt]')) b.onclick = async () => {
    const x = roh(b.dataset.quelle);
    if (!x) return;
    x.hinweise_erledigt = [...new Set([...(x.hinweise_erledigt || []), b.dataset.erledigt])];
    await versuch(() => store.speichere(x), 'Als erledigt vermerkt.');
    detail(id);
  };
  for (const b of document.querySelectorAll('[data-doc]')) b.onclick = () => versuch(async () => window.open(await dbx.temporaryLink(b.dataset.doc), '_blank'));
  for (const b of document.querySelectorAll('[data-loesen]')) b.onclick = async () => {
    if (!confirm('Nachtrag von diesem Vertrag lösen? Er erscheint dann als eigener Eintrag zum Zuordnen.')) return;
    await versuch(() => store.speichere({ ...roh(b.dataset.loesen), zu_vertrag: null, zuordnung_geloest: true }), 'Zuordnung gelöst.');
    detail(id);
  };
  $('#b-nt-geprueft') && ($('#b-nt-geprueft').onclick = async () => {
    for (const n of v._nachtraege.filter((x) => x.pruefen)) await versuch(() => store.speichere({ ...roh(n.id), pruefen: false }));
    detail(id);
  });
  $('#f-zuordnen') && ($('#f-zuordnen').onsubmit = async (e) => {
    e.preventDefault();
    const ziel = new FormData(e.target).get('ziel');
    const ok = await versuch(() => store.speichere({ ...roh(v.id), zu_vertrag: ziel, zuordnung_geloest: false }), 'Nachtrag zugeordnet.');
    if (ok) location.hash = `#/vertrag/${ziel}`;
  });
  $('#b-del').onclick = async () => {
    if (!confirm(`${istNachtrag(v) ? 'Diesen Nachtrag' : 'Diesen Vertrag'} aus der Liste löschen? (Das Originaldokument bleibt in der Dropbox.)`)) return;
    await versuch(() => store.loesche(v), 'Gelöscht.');
    location.hash = '#/vertraege';
  };
}

// ---------------- Bearbeiten ----------------
function eingabe(f, wert, name) {
  const n = name || f.k;
  const w = wert ?? '';
  if (f.typ === 'auswahl') return `<select name="${n}"><option value=""></option>${f.werte.map((x) => `<option ${x === w ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  if (f.typ === 'textlang') return `<textarea name="${n}" rows="3">${esc(w)}</textarea>`;
  if (f.typ === 'datum') return `<input type="date" name="${n}" value="${esc(String(w).slice(0, 10))}">`;
  if (['euro', 'zahl', 'prozent'].includes(f.typ)) return `<input inputmode="decimal" name="${n}" value="${esc(w === '' ? '' : String(w).replace('.', ','))}">`;
  return `<input name="${n}" value="${esc(w)}" ${f.vorschlaege ? `list="dl-${f.k}"` : ''}>${f.vorschlaege ? `<datalist id="dl-${f.k}">${f.vorschlaege.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}`;
}

function bearbeiten(id) {
  const orig = id ? store.state.vertraege.find((x) => x.id === id) : null;
  const v = orig ? structuredClone(orig) : { kategorie: 'Versicherung', status: 'aktiv' };
  const zeichnen = () => {
    main().innerHTML = `
      <div class="kopf"><a href="${orig ? `#/vertrag/${orig.id}` : '#/vertraege'}" class="zurueck">‹ Abbrechen</a></div>
      <h1>${orig ? 'Vertrag bearbeiten' : 'Neuer Vertrag'}</h1>
      <form id="f-v" class="formular">
        ${ABSCHNITTE.filter((s) => !s.wenn || s.wenn(v)).map((s) => `<fieldset><legend>${esc(s.titel)}</legend><div class="felder">
          ${s.felder.filter((f) => !f.wenn || f.wenn(v)).map((f) => `<label class="${f.typ === 'textlang' ? 'breit' : ''}">${esc(f.label)}${eingabe(f, s.pfad ? v[s.pfad]?.[f.k] : v[f.k], s.pfad ? `${s.pfad}.${f.k}` : f.k)}</label>`).join('')}
        </div></fieldset>`).join('')}
        ${v.kategorie === 'Darlehen' || v.kategorie === 'Leasing' ? `<fieldset><legend>Sicherheiten</legend>
          <div id="sich">${(v.darlehen?.sicherheiten || []).map((s, i) => `<div class="felder sicherheit">${SICHERHEIT_FELDER.map((f) => `<label>${f.label}${eingabe(f, s[f.k], `s${i}.${f.k}`)}</label>`).join('')}
            <button type="button" class="link gefahr" data-weg="${i}">entfernen</button></div>`).join('')}</div>
          <button type="button" id="b-sich">+ Sicherheit hinzufügen</button></fieldset>` : ''}
        <fieldset><legend>Analyse</legend><div class="felder">
          <label class="breit">Zusammenfassung<textarea name="a.zusammenfassung" rows="3">${esc(v.analyse?.zusammenfassung)}</textarea></label>
          <label class="breit">Kritische Punkte (je Zeile einer)<textarea name="a.kritisch" rows="3">${esc((v.analyse?.kritisch || []).join('\n'))}</textarea></label>
          <label class="breit">Verbesserungsvorschläge (je Zeile einer)<textarea name="a.verbesserungen" rows="3">${esc((v.analyse?.verbesserungen || []).join('\n'))}</textarea></label>
        </div></fieldset>
        <div class="aktionen unten"><button class="primaer">Speichern</button></div>
      </form>`;
    const form = $('#f-v');
    form.kategorie.onchange = () => { lesen(); zeichnen(); };
    form.art.onchange = () => { lesen(); zeichnen(); };
    $('#b-sich') && ($('#b-sich').onclick = () => { lesen(); v.darlehen = v.darlehen || {}; (v.darlehen.sicherheiten ||= []).push({ art: 'Grundschuld', objekt: v.objekt }); zeichnen(); });
    for (const b of document.querySelectorAll('[data-weg]')) b.onclick = () => { lesen(); v.darlehen.sicherheiten.splice(+b.dataset.weg, 1); zeichnen(); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      lesen();
      const gesp = await versuch(() => store.speichere(v), 'Gespeichert.');
      if (gesp) location.hash = `#/vertrag/${gesp.id}`;
    };
  };
  const typen = {};
  for (const s of ABSCHNITTE) for (const f of s.felder) typen[(s.pfad ? s.pfad + '.' : '') + f.k] = f.typ;
  for (const f of SICHERHEIT_FELDER) typen['s.' + f.k] = f.typ;
  const lesen = () => {
    const fd = new FormData($('#f-v'));
    const sich = [];
    v.analyse = v.analyse || {};
    for (const [k, roh] of fd.entries()) {
      const wert = String(roh).trim();
      let typ = typen[k];
      const m = k.match(/^s(\d+)\.(.+)$/);
      if (m) typ = typen['s.' + m[2]];
      const val = wert === '' ? null : ['euro', 'zahl', 'prozent'].includes(typ) ? c.num(wert) : wert;
      if (m) { (sich[+m[1]] ||= {})[m[2]] = val; continue; }
      if (k.startsWith('a.')) { const ak = k.slice(2); v.analyse[ak] = ak === 'zusammenfassung' ? val : (wert ? wert.split('\n').map((x) => x.trim()).filter(Boolean) : []); continue; }
      if (k.includes('.')) { const [p, kk] = k.split('.'); (v[p] ||= {})[kk] = val; continue; }
      v[k] = val;
    }
    if (document.querySelector('#sich')) { v.darlehen = v.darlehen || {}; v.darlehen.sicherheiten = sich.filter(Boolean); }
  };
  zeichnen();
}

// ---------------- Auswertungen ----------------
function auswertungen() {
  const gruppen = [
    ['Verträge', ['alle', 'versicherungen', 'versicherungen_objekt', 'kfz', 'gebaeude', 'energie', 'beitraege', 'fristen', 'nachtraege']],
    ['Finanzierung (Jahresabschluss)', ['verbindlichkeiten', 'sicherheiten', 'restlaufzeiten']],
  ];
  main().innerHTML = `<h1>Auswertungen</h1>
    ${gruppen.map(([t, keys]) => `<h3 class="gruppe">${t}</h3><div class="karten">${keys.map((k) => {
      const b = erstelle(k, store.state.vertraege);
      return `<a class="vkarte" href="#/auswertung/${k}"><b>${esc(BERICHTE[k].titel)}</b><small>${b.zeilen.length} ${b.zeilen.length === 1 ? 'Eintrag' : 'Einträge'}</small><div class="vk-fuss"><span>PDF · Excel</span></div></a>`;
    }).join('')}</div>`).join('')}`;
}

let stichtag = null;
function auswertung(key) {
  if (!BERICHTE[key]) return auswertungen();
  const mitStichtag = ['restlaufzeiten', 'verbindlichkeiten', 'fristen'].includes(key);
  const st = stichtag || (key === 'restlaufzeiten' ? `${new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0)}-12-31` : heute());
  let q = '';
  const bauen = () => {
    const b = erstelle(key, store.state.vertraege, mitStichtag ? st : new Date());
    if (q) { const w = q.toLowerCase(); b.zeilen = b.zeilen.filter((z) => JSON.stringify({ ...z, v: undefined }).toLowerCase().includes(w)); b.untertitel = [b.untertitel, `Filter: „${q}“`].filter(Boolean).join(' · '); }
    return b;
  };
  main().innerHTML = `
    <div class="kopf"><a href="#/auswertungen" class="zurueck">‹ Auswertungen</a></div>
    <h1>${esc(BERICHTE[key].titel)}</h1>
    <div class="filter zeile">
      <input type="search" id="q" placeholder="Filtern …">
      ${mitStichtag ? `<label>Stichtag<input type="date" id="st" value="${st}"></label>` : ''}
      <button id="b-pdf" class="primaer">PDF</button><button id="b-xls" class="primaer">Excel</button>
      ${dbx.isConnected() ? '<label class="check"><input type="checkbox" id="ablage" checked> in Dropbox ablegen</label>' : ''}
    </div>
    <div id="tab"></div>`;
  const zeichnen = () => {
    const b = bauen();
    const rows = aufbereiten(b);
    $('#tab').innerHTML = (b.untertitel ? `<p class="info">${esc(b.untertitel)}</p>` : '') + `<div class="tabelle"><table>
      <thead><tr>${b.spalten.map((s) => `<th class="${['euro', 'zahl', 'prozent'].includes(s.typ) ? 'r' : ''}">${esc(s.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => r._typ === 'gruppe' ? `<tr class="g"><td colspan="${b.spalten.length}">${esc(r.titel)} (${r.anzahl})</td></tr>`
        : `<tr class="${r._typ || ''}">${b.spalten.map((s, i) => `<td class="${['euro', 'zahl', 'prozent'].includes(s.typ) ? 'r' : ''}">${r._typ && i === 0 ? (r._typ === 'summe' ? 'Summe' : 'Zwischensumme')
          : r.v && i === 0 ? `<a href="#/vertrag/${r.v.id}">${esc(formatiere(r[s.k], s.typ))}</a>` : r.id && i === 0 ? `<a href="#/vertrag/${r.id}">${esc(formatiere(r[s.k], s.typ) || '–')}</a>` : esc(formatiere(r[s.k], s.typ))}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>${rows.length ? '' : '<p class="leer">Keine Einträge.</p>'}${b.fussnote ? `<p class="info">${esc(b.fussnote)}</p>` : ''}`;
  };
  zeichnen();
  $('#q').oninput = (e) => { q = e.target.value; zeichnen(); };
  if (mitStichtag) $('#st').onchange = (e) => { stichtag = e.target.value; auswertung(key); };
  const exp = (fn) => versuch(async () => {
    const datei = await fn(bauen());
    herunterladen(datei);
    if ($('#ablage')?.checked) { const p = await store.exportAblegen(datei.name, datei.blob); if (p) toast('In Dropbox abgelegt: ' + p); }
  });
  $('#b-pdf').onclick = () => exp(alsPDF);
  $('#b-xls').onclick = () => exp(alsExcel);
}

// ---------------- Eingang (neue Dokumente) ----------------
async function eingang() {
  main().innerHTML = `<h1>Eingang</h1>
    <p class="info">Neue Verträge legst du in der Dropbox im Ordner <b>${esc(CONFIG.eingang)}</b> ab (PDF oder Foto, gern auch in Unterordnern).
    Sie werden jeden Morgen automatisch analysiert. Hier kannst du sie sofort analysieren lassen.</p>
    <div id="eing"><p class="leer">Lade …</p></div>`;
  if (!dbx.isConnected()) { $('#eing').innerHTML = '<p class="leer">Bitte zuerst in den Einstellungen die Dropbox verbinden.</p>'; return; }
  const docs = await versuch(() => store.offeneDokumente());
  if (!docs) return;
  const key = store.state.einstellungen.anthropicKey;
  $('#eing').innerHTML = docs.length ? `
    ${key ? `<button id="b-alle" class="primaer">Alle ${docs.length} jetzt analysieren</button>` : `<div class="karte hinweis">Für die Sofort-Analyse in den <a href="#/einstellungen">Einstellungen</a> einen Anthropic-API-Schlüssel hinterlegen. Ohne Schlüssel übernimmt der tägliche Lauf.</div>`}
    <ul class="liste">${docs.map((d, i) => `<li class="doc" data-i="${i}"><span>${esc(d.name)}<small>${esc(d.path_display.slice(CONFIG.eingang.length + 1))} · ${(d.size / 1024).toFixed(0)} KB · ${c.fmtDatum(d.server_modified)}</small></span>
      <span class="aktionen">${key && analysierbar(d.name) ? `<button data-a="${i}">Analysieren</button>` : ''}<button data-m="${i}">Manuell</button></span></li>`).join('')}</ul>`
    : '<p class="leer">Keine neuen Dokumente. Alles erfasst.</p>';
  const einzeln = async (i) => {
    const d = docs[i];
    const li = document.querySelector(`li[data-i="${i}"]`);
    li.classList.add('laeuft');
    li.querySelector('.aktionen').innerHTML = '<span class="spinner"></span> analysiere …';
    try {
      const blob = await dbx.download(d.path_lower);
      const ergebnisse = await analysiere(blob, d.name, key, CONFIG.modell);
      const gespeichert = [];
      for (const [n, e] of ergebnisse.entries()) {
        const neu = { ...e, id: store.idAusDokument(d.id, n), erstellt: new Date().toISOString(), status: 'aktiv', pruefen: true, quelldatei: d.path_display, quelle_id: d.id, analysiert_am: new Date().toISOString(), analysiert_von: 'App' };
        if (istNachtrag(neu)) neu.zu_vertrag = findeVertrag(neu, store.state.vertraege)?.id || null;
        const g = await store.speichere(neu);
        gespeichert.push(istNachtrag(neu) && neu.zu_vertrag ? store.state.vertraege.find((x) => x.id === neu.zu_vertrag) : g);
      }
      li.querySelector('.aktionen').innerHTML = gespeichert.filter(Boolean).map((v) => `<a class="knopf" href="#/vertrag/${v.id}">${ergebnisse.some(istNachtrag) && !istNachtrag(v) ? 'Nachtrag zu ' : ''}${esc(titelVon(v))}</a>`).join('');
      li.classList.replace('laeuft', 'fertig');
    } catch (e) {
      li.classList.remove('laeuft');
      li.querySelector('.aktionen').innerHTML = `<span class="rot">${esc(e.message)}</span>`;
    }
  };
  for (const b of document.querySelectorAll('[data-a]')) b.onclick = () => einzeln(+b.dataset.a);
  for (const b of document.querySelectorAll('[data-m]')) b.onclick = async () => {
    const d = docs[+b.dataset.m];
    const v = await versuch(() => store.speichere({ id: store.idAusDokument(d.id, 0), erstellt: new Date().toISOString(), kategorie: 'Sonstiges', status: 'aktiv', anbieter: d.name.replace(/\.[^.]+$/, ''), quelldatei: d.path_display, quelle_id: d.id }));
    if (v) location.hash = `#/bearbeiten/${v.id}`;
  };
  $('#b-alle') && ($('#b-alle').onclick = async () => {
    $('#b-alle').disabled = true;
    for (let i = 0; i < docs.length; i++) if (analysierbar(docs[i].name)) await einzeln(i);
    toast('Analyse abgeschlossen.');
  });
}

// ---------------- Einstellungen ----------------
function einstellungen() {
  const e = store.state.einstellungen;
  const verbunden = dbx.isConnected();
  main().innerHTML = `<h1>Einstellungen</h1>
    <section class="karte"><h2>Dropbox</h2>
      ${verbunden ? `<p>Verbunden. Eingang: <b>${esc(CONFIG.eingang)}</b><br>Daten: <b>${esc(CONFIG.daten)}</b></p>
        <button id="b-sync">Jetzt synchronisieren</button> <button id="b-trennen" class="gefahr">Trennen</button>`
        : `<p>Verbinde deine Dropbox, damit die App deine Verträge lesen und speichern kann. Bis dahin siehst du Beispieldaten.</p><button id="b-dbx" class="primaer">Mit Dropbox verbinden</button>`}
    </section>
    <section class="karte"><h2>Entsperren</h2>
      ${lock.passkeySupported() ? (lock.hasPasskey()
        ? '<p>Face ID / Touch ID ist eingerichtet.</p><button id="b-pk-weg">Face ID entfernen</button>'
        : '<p>Richte Face ID (iPhone/iPad) bzw. Touch ID oder Windows Hello (PC) ein.</p><button id="b-pk" class="primaer">Face ID einrichten</button>')
        : '<p>Dieses Gerät unterstützt keine biometrische Anmeldung im Browser.</p>'}
      <form id="f-pw" class="zeile"><input type="text" class="pw" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore name="pw" placeholder="Neues Passwort" minlength="8"><button>Passwort ändern</button></form>
      <button id="b-sperren">Jetzt sperren</button>
    </section>
    <section class="karte"><h2>Erinnerungen</h2>
      <p>Einen Monat vor Ablauf jeder Kündigungsfrist bekommst du einen Kalendereintrag mit Alarm. Abonniere dazu den Kalender in Outlook:
      Outlook → Kalender hinzufügen → <i>Aus dem Internet abonnieren</i> → Link einfügen. Die Alarme erscheinen dann als Push-Mitteilung auf iPhone, iPad und PC.</p>
      ${verbunden ? '<button id="b-kal" class="primaer">Kalender-Link erzeugen</button> <button id="b-ics">.ics herunterladen</button><div id="kal-link"></div>' : '<p class="info">Erst Dropbox verbinden.</p>'}
      <p>Zusätzlich zeigt die App selbst eine Mitteilung beim Öffnen, wenn eine Frist ansteht.</p>
      ${'Notification' in window ? (Notification.permission === 'granted' ? '<p class="gruen">Mitteilungen erlaubt.</p>' : '<button id="b-notif">Mitteilungen erlauben</button>') : ''}
    </section>
    <section class="karte"><h2>Sofort-Analyse (Claude)</h2>
      <p>Mit einem Anthropic-API-Schlüssel analysiert die App neue Dokumente auf Knopfdruck (ca. 2 bis 10 Cent pro Vertrag). Der Schlüssel wird verschlüsselt nur auf diesem Gerät gespeichert.
      Schlüssel erstellen: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a></p>
      <form id="f-key" class="zeile"><input type="text" class="pw" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore name="k" placeholder="${e.anthropicKey ? 'gespeichert (••••' + esc(e.anthropicKey.slice(-4)) + ')' : 'sk-ant-…'}" ><button>Speichern</button>${e.anthropicKey ? '<button type="button" id="b-key-weg" class="gefahr">Entfernen</button>' : ''}</form>
    </section>
    <section class="karte"><h2>App installieren</h2>
      <p><b>iPhone/iPad:</b> In Safari auf <i>Teilen</i> → <i>Zum Home-Bildschirm</i>. <b>PC:</b> In Chrome/Edge in der Adresszeile auf das Installieren-Symbol.</p>
    </section>
    <section class="karte"><h2>Gerät zurücksetzen</h2><p>Löscht Passwort, Face ID und Zugänge auf diesem Gerät. Die Daten in der Dropbox bleiben.</p><button id="b-reset" class="gefahr">Zurücksetzen</button></section>`;
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('#b-dbx', () => dbx.startLogin());
  on('#b-sync', () => versuch(async () => { await store.synchronisiere(); }, 'Synchronisiert.'));
  on('#b-trennen', async () => { if (confirm('Dropbox-Verbindung auf diesem Gerät trennen?')) { await store.setzeEinstellung('dropbox', null); location.reload(); } });
  on('#b-pk', () => versuch(async () => { await lock.enrollPasskey(); einstellungen(); }, 'Face ID eingerichtet.'));
  on('#b-pk-weg', () => { lock.removePasskey(); einstellungen(); });
  on('#b-sperren', () => { lock.lock(); zeigeSperre(false); });
  on('#b-notif', async () => { await Notification.requestPermission(); einstellungen(); pruefeErinnerungen(); });
  on('#b-key-weg', async () => { await store.setzeEinstellung('anthropicKey', null); einstellungen(); });
  on('#b-reset', () => { if (confirm('Wirklich zurücksetzen?')) { lock.reset(); location.reload(); } });
  on('#b-kal', () => versuch(async () => {
    const url = await store.kalenderLink();
    $('#kal-link').innerHTML = `<p><input readonly value="${esc(url)}" onclick="this.select()"></p><button id="b-copy">Link kopieren</button>`;
    $('#b-copy').onclick = () => navigator.clipboard.writeText(url).then(() => toast('Kopiert.'));
  }));
  on('#b-ics', () => herunterladen({ blob: new Blob([c.kalenderICS(store.state.vertraege)], { type: 'text/calendar' }), name: 'vertragsfristen.ics' }));
  $('#f-pw').onsubmit = (ev) => { ev.preventDefault(); versuch(() => lock.changePassword(new FormData(ev.target).get('pw')), 'Passwort geändert.'); };
  $('#f-key').onsubmit = async (ev) => {
    ev.preventDefault();
    const k = String(new FormData(ev.target).get('k')).trim();
    if (!k.startsWith('sk-ant-')) return toast('Das sieht nicht wie ein Anthropic-Schlüssel aus (beginnt mit sk-ant-).', 'fehler');
    await versuch(() => store.setzeEinstellung('anthropicKey', k), 'Schlüssel gespeichert.');
    einstellungen();
  };
}

// ---------------- Start ----------------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.url) location.hash = e.data.url; });
zeigeSperre();
