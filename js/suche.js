// Volltextsuche über alle Vertragsfelder.
// Findet Werte so, wie man sie eintippt: Datum als 01.01.2027 oder 2027-01-01, Beträge als 1.184,40 / 1184,4 / 1184.40,
// Kennzeichen und Nummern auch ohne Leerzeichen/Bindestriche, Umlaute auch als ae/oe/ue/ss.
// Feldsuche: "kennzeichen:LEV", "zähler:1ESY", "art:kfz". Mehrere Wörter = alle müssen vorkommen.
import * as c from './calc.js';
import { ABSCHNITTE, SICHERHEIT_FELDER } from './felder.js';

export function normal(s) {
  return String(s ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const kompakt = (s) => normal(s).replace(/[\s\-./,_:;()]/g, '');

function varianten(wert, typ) {
  if (wert === null || wert === undefined || wert === '') return [];
  if (typeof wert === 'object') return [JSON.stringify(wert)];
  const out = [String(wert)];
  const n = c.num(wert);
  if ((typ === 'euro' || typ === 'zahl' || typ === 'prozent' || typeof wert === 'number') && n !== null) {
    out.push(n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    out.push(n.toLocaleString('de-DE'));
    out.push(String(n).replace('.', ','));
    out.push(n.toFixed(2), n.toFixed(2).replace('.', ','));
  }
  if (typ === 'datum' || /^\d{4}-\d{2}-\d{2}/.test(String(wert))) {
    const d = c.parseDate(wert);
    if (d) out.push(c.fmtDatum(d), `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`, d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }));
  }
  return out;
}

// Liefert alle durchsuchbaren Einträge eines Vertrags: { feld, wert, text }
export function eintraege(v) {
  const e = [];
  const add = (feld, wert, typ) => {
    const vs = varianten(wert, typ);
    if (!vs.length) return;
    const anzeige = typeof wert === 'object' ? JSON.stringify(wert)
      : typ === 'euro' ? c.fmtEuro(c.num(wert)) : typ === 'datum' ? c.fmtDatum(wert) : typ === 'prozent' ? c.fmtProzent(wert) : String(wert);
    e.push({ feld, wert: anzeige, text: vs.join(' | ') });
  };
  const bekannt = new Set(['id', '_datei', 'demo', 'darlehen', 'analyse', 'zusatzfelder', 'pruefen']);
  for (const s of ABSCHNITTE) {
    const quelle = s.pfad ? v[s.pfad] || {} : v;
    for (const f of s.felder) {
      add(f.label.replace(/\s*\(.*\)$/, ''), quelle[f.k], f.typ);
      if (!s.pfad) bekannt.add(f.k);
    }
  }
  for (const [i, sh] of (v.darlehen?.sicherheiten || []).entries()) {
    for (const f of SICHERHEIT_FELDER) add(`Sicherheit ${i + 1}: ${f.label.replace(/\s*\(.*\)$/, '')}`, sh[f.k], f.typ);
  }
  const a = v.analyse || {};
  add('Zusammenfassung', a.zusammenfassung);
  for (const x of a.kritisch || []) add('Kritisch', x);
  for (const x of a.verbesserungen || []) add('Verbesserung', x);
  for (const [k, w] of Object.entries(v.zusatzfelder || {})) add(k, w);
  // berechnete Werte
  add('Jahresbeitrag', c.jahresbeitrag(v), 'euro');
  add('Kündigen bis', c.isoDate(c.kuendigungSpaetestens(v)), 'datum');
  add('Ablauf', c.isoDate(c.naechsterKuendigungstermin(v)), 'datum');
  add('Dokument', v.quelldatei);
  // alle übrigen Felder, die nicht in den Formularen vorkommen (z. B. aus der Analyse)
  for (const [k, w] of Object.entries(v)) if (!bekannt.has(k) && !['quelldatei', 'quelle_id', 'erstellt', 'aktualisiert', 'analysiert_am'].includes(k)) add(k, w);
  for (const [k, w] of Object.entries(v.darlehen || {})) if (k !== 'sicherheiten' && !ABSCHNITTE.find((s) => s.pfad === 'darlehen').felder.some((f) => f.k === k)) add(k, w);
  for (const x of e) { x.n = normal(x.text); x.k = kompakt(x.text); x.fn = normal(x.feld); }
  return e;
}

export function zerlege(q) {
  const teile = [];
  const re = /(?:([\wäöüß]+):)?(?:"([^"]+)"|(\S+))/gi;
  let m;
  while ((m = re.exec(q))) teile.push({ feld: m[1] ? normal(m[1]) : null, wort: m[2] || m[3] });
  return teile.filter((t) => t.wort);
}

// Gibt null (kein Treffer) oder die Liste der passenden Felder zurück.
export function treffer(v, q, cache) {
  const teile = zerlege(q);
  if (!teile.length) return [];
  let e = cache?.get(v);
  if (!e) { e = eintraege(v); cache?.set(v, e); }
  // Ganze Eingabe als zusammenhängender Begriff (z. B. "LEV-SW 123", "1.184,40 €")
  if (teile.length > 1 && !teile.some((t) => t.feld)) {
    const n = normal(q.trim()), k = kompakt(q);
    const ganz = e.filter((x) => x.n.includes(n) || (k.length >= 3 && x.k.includes(k)));
    if (ganz.length) return ganz;
  }
  const gefunden = new Map();
  for (const t of teile) {
    const n = normal(t.wort);
    const k = kompakt(t.wort);
    const passt = e.filter((x) => (!t.feld || x.fn.includes(t.feld)) && (x.n.includes(n) || (k.length >= 3 && x.k.includes(k))));
    if (!passt.length) return null;
    for (const p of passt) gefunden.set(p.feld, p);
  }
  return [...gefunden.values()];
}
