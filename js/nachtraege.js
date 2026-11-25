// Nachträge (z. B. Nachtrag zum Versicherungsschein) und Kurzüberblick je Vertrag.
//
// Ein Nachtrag wird als eigene Datei gespeichert (dokumenttyp: "Nachtrag", zu_vertrag: <id des Vertrags>).
// Beim Laden hängt die App ihn an den Vertrag an und übernimmt die geänderten Werte
// (z. B. neuer Beitrag ab 01.01.) in die aktuelle Ansicht. Die Vertragsdatei selbst bleibt unverändert,
// so kann der tägliche Lauf Nachträge ablegen, ohne Dateien überschreiben zu müssen.
import * as c from './calc.js';

export const istNachtrag = (v) => v?.dokumenttyp === 'Nachtrag';
// Unterlagen (Antrag, Zulassung, Kaufvertrag …) sind kein eigener Vertrag, gehören aber zu einem.
export const istUnterlage = (v) => v?.dokumenttyp === 'Unterlage' || /^unterlage/i.test(String(v?.zusatzfelder?.dokumentart || ''));
const unterlageZu = (u) => u.zu_vertrag || u.zusatzfelder?.gehoert_zu || null;

const kompakt = (s) => String(s ?? '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');

// Passenden Vertrag zu einem Nachtrag finden (Vertragsnummer, sonst Anbieter + Objekt/Kennzeichen).
export function findeVertrag(n, vertraege) {
  const kandidaten = vertraege.filter((v) => !istNachtrag(v) && v.id !== n.id);
  if (n.zu_vertrag) {
    const v = kandidaten.find((x) => x.id === n.zu_vertrag);
    if (v) return v;
  }
  if (n.zuordnung_geloest) return null;
  const nr = kompakt(n.bezug_vertragsnummer || n.vertragsnummer);
  if (nr.length >= 4) {
    const treffer = kandidaten.filter((v) => { const k = kompakt(v.vertragsnummer); return k.length >= 4 && (k === nr || k.includes(nr) || nr.includes(k)); });
    if (treffer.length === 1) return treffer[0];
    if (treffer.length > 1) return treffer.find((v) => kompakt(v.anbieter) === kompakt(n.anbieter)) || treffer[0];
  }
  const anb = kompakt(n.anbieter);
  const obj = kompakt(n.kennzeichen || n.objekt);
  if (anb && obj) {
    const treffer = kandidaten.filter((v) => kompakt(v.anbieter).includes(anb.slice(0, 8)) && obj && (kompakt(v.kennzeichen) === obj || kompakt(v.objekt) === obj));
    if (treffer.length === 1) return treffer[0];
  }
  return null;
}

function setzeFeld(v, feld, wert) {
  if (!feld) return;
  const zahl = c.num(wert);
  const w = typeof wert === 'string' && zahl !== null && /^[\d.,\s€%-]+$/.test(wert) ? zahl : wert;
  if (feld.includes('.')) {
    const [p, k] = feld.split('.');
    v[p] = { ...(v[p] || {}), [k]: w };
  } else v[feld] = w;
}

// Baut aus den gespeicherten Dateien die Ansicht: Verträge mit angehängten Nachträgen.
// Nicht zuordenbare Nachträge bleiben als eigener Eintrag sichtbar.
export function zusammenfuehren(roh) {
  const vertraege = roh.filter((v) => !istNachtrag(v) && !istUnterlage(v)).map((v) => ({ ...v, _nachtraege: [], _unterlagen: [] }));
  const offen = [];
  for (const u of roh.filter((x) => istUnterlage(x) && !istNachtrag(x))) {
    const v = vertraege.find((x) => x.id === unterlageZu(u));
    if (v) v._unterlagen.push(u); else offen.push({ ...u, _nachtraege: [], _unterlagen: [] });
  }
  for (const n of roh.filter(istNachtrag)) {
    const v = findeVertrag(n, vertraege);
    if (v) v._nachtraege.push(n); else offen.push({ ...n, _nachtraege: [], _unterlagen: [] });
  }
  for (const v of vertraege) {
    v._nachtraege.sort((a, b) => String(nachtragDatum(a)).localeCompare(String(nachtragDatum(b))));
    // Änderungen in zeitlicher Reihenfolge übernehmen (der jüngste Nachtrag gilt)
    for (const n of v._nachtraege) {
      for (const a of n.nachtrag?.aenderungen || []) {
        if (a?.feld && a.neu !== undefined && a.neu !== null && a.neu !== '') setzeFeld(v, a.feld, a.neu);
      }
    }
  }
  return [...vertraege, ...offen];
}

// Werte einer Änderung lesbar anzeigen (Beträge als Euro, Zinsen als Prozent)
export function aendWert(x, feld = '') {
  if (x === null || x === undefined) return '';
  const n = c.num(x);
  if (n === null || (typeof x === 'string' && !/^[\d.,\s€%-]+$/.test(x))) return String(x);
  if (/zins(satz)?$|effektivzins/.test(feld)) return c.fmtProzent(n);
  if (/beitrag|selbstbehalt|summe|rate|betrag|restschuld/.test(feld)) return c.fmtEuro(n);
  return String(x);
}

export function nachtragDatum(n) {
  return n.nachtrag?.gueltig_ab || n.nachtrag?.datum || n.beginn || n.erstellt || '';
}

// Kurzer Überblick in ganzen Sätzen aus den erfassten Daten (für jeden Vertrag, auch ohne KI-Analyse).
export function kurzueberblick(v, heute = new Date()) {
  const s = [];
  const art = v.art || v.kategorie || 'Vertrag';
  const bei = v.anbieter ? ` bei ${v.anbieter}` : '';
  const fuer = v.kennzeichen ? ` für das Fahrzeug ${[v.fahrzeug, v.kennzeichen].filter(Boolean).join(' ')}` : v.objekt ? ` für ${v.objekt}` : '';
  const nr = v.vertragsnummer ? ` (Nr. ${v.vertragsnummer})` : '';
  if (istNachtrag(v)) s.push(`Nachtrag${bei}${nr}, noch keinem Vertrag zugeordnet.`);
  else if (v.kategorie === 'Darlehen' || v.kategorie === 'Leasing') {
    const d = v.darlehen || {};
    s.push(`${art}${bei}${nr}${v.objekt ? ` für ${v.objekt}` : ''}.`);
    const teile = [];
    if (c.num(d.darlehensbetrag)) teile.push(`Ursprünglich ${c.fmtEuro(c.num(d.darlehensbetrag))}`);
    teile.push(`Restschuld ${c.fmtEuro(c.restschuld(v))}`);
    if (c.num(d.zinssatz) !== null) teile.push(`Zins ${c.fmtProzent(d.zinssatz)}${d.zinsbindung_bis ? ` fest bis ${c.fmtDatum(d.zinsbindung_bis)}` : ''}`);
    s.push(teile.join(', ') + '.');
    if (c.num(d.rate)) s.push(`Rate ${c.fmtEuro(c.num(d.rate))} ${d.rate_rhythmus || ''}${d.faelligkeit ? `, fällig bis ${c.fmtDatum(d.faelligkeit)}` : ''}.`.replace(' ,', ','));
    const b = c.laufzeitBaender(v, heute);
    s.push(`In den nächsten 12 Monaten ca. ${c.fmtEuro(b.zins12)} Zinsen und ${c.fmtEuro(b.bis1)} Tilgung.`);
    const sich = (d.sicherheiten || []).map((x) => x.art + (c.num(x.betrag) ? ` ${c.fmtEuro(c.num(x.betrag))}` : '')).join(', ');
    if (sich) s.push(`Gesichert durch ${sich}.`);
  } else {
    s.push(`${art}${bei}${fuer}${nr}.`);
    const jb = c.jahresbeitrag(v);
    if (c.num(v.beitrag) !== null) s.push(`Beitrag ${c.fmtEuro(c.num(v.beitrag))} ${v.beitrag_rhythmus || ''}${jb && v.beitrag_rhythmus !== 'jährlich' ? ` (${c.fmtEuro(jb)} im Jahr)` : ''}${v.zahlungstermin ? `, fällig ${v.zahlungstermin}` : ''}.`.replace(' .', '.'));
    const leistung = [];
    if (c.num(v.versicherungssumme)) leistung.push(`Versicherungssumme ${c.fmtEuro(c.num(v.versicherungssumme))}`);
    if (c.num(v.selbstbehalt_vk) !== null) leistung.push(`Selbstbehalt Vollkasko ${c.fmtEuro(c.num(v.selbstbehalt_vk))}`);
    if (c.num(v.selbstbehalt_tk) !== null) leistung.push(`Teilkasko ${c.fmtEuro(c.num(v.selbstbehalt_tk))}`);
    if (c.num(v.selbstbehalt) !== null) leistung.push(`Selbstbehalt ${c.fmtEuro(c.num(v.selbstbehalt))}`);
    if (v.zaehlernummer) leistung.push(`Zähler ${v.zaehlernummer}`);
    if (v.arbeitspreis) leistung.push(`Arbeitspreis ${v.arbeitspreis}`);
    if (leistung.length) s.push(leistung.join(', ') + '.');
  }
  const sp = c.kuendigungSpaetestens(v, heute);
  if (v.status === 'gekündigt') s.push(`Gekündigt${v.gekuendigt_am ? ` am ${c.fmtDatum(v.gekuendigt_am)}` : ''}.`);
  else if (sp) s.push(`Kündbar zum ${c.fmtDatum(c.naechsterKuendigungstermin(v, heute))}, Kündigung muss bis ${c.fmtDatum(sp)} eingehen.`);
  const n = v._nachtraege?.length || 0;
  if (n) {
    const letzter = v._nachtraege[n - 1];
    s.push(`${n === 1 ? 'Ein Nachtrag' : `${n} Nachträge`}, zuletzt vom ${c.fmtDatum(letzter.nachtrag?.datum || nachtragDatum(letzter)) || 'unbekannten Datum'}${letzter.nachtrag?.titel ? `: ${letzter.nachtrag.titel}` : ''}.`);
  }
  return s.join(' ').replace(/\.\./g, '.');
}
