// Berechnungen: Beiträge, Kündigungsfristen, Tilgungspläne, Restlaufzeitenspiegel.
// Reine Funktionen ohne DOM, damit sie auch mit Node getestet werden können.

export const RHYTHMEN = {
  monatlich: 12,
  'zweimonatlich': 6,
  vierteljährlich: 4,
  halbjährlich: 2,
  jährlich: 1,
  einmalig: 0,
};

export const KATEGORIEN = [
  'Versicherung',
  'Darlehen',
  'Energie',
  'Telekommunikation',
  'Miete/Pacht',
  'Leasing',
  'Abo/Mitgliedschaft',
  'Sonstiges',
];

export const VERSICHERUNGSARTEN = [
  'KFZ', 'Gebäude', 'Hausrat', 'Privathaftpflicht', 'Haus- und Grundbesitzerhaftpflicht',
  'Krankenversicherung', 'Krankenzusatz', 'Pflege', 'Berufsunfähigkeit', 'Risikolebensversicherung',
  'Lebensversicherung', 'Rentenversicherung', 'Unfall', 'Rechtsschutz', 'Wohngebäude/Elementar',
  'Betriebshaftpflicht', 'Inhalt/Betrieb', 'D&O', 'Cyber', 'Reise', 'Tier', 'Sonstige',
];

const DAY = 86400000;

export function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const g = String(s).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (g) return new Date(+g[3], +g[2] - 1, +g[1]);
  return null;
}

export function isoDate(d) {
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addMonths(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), last));
  return r;
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[€%\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

export function jahresbeitrag(v) {
  const b = num(v.beitrag);
  if (b === null) return null;
  const f = RHYTHMEN[v.beitrag_rhythmus] ?? 1;
  return f === 0 ? 0 : b * f;
}

// Nächster Termin, zu dem der Vertrag endet (Ablauf / Hauptfälligkeit), ab Stichtag.
// Läuft ein Vertrag mit Verlängerung, wird der Termin so oft verschoben, bis die
// Kündigungsfrist noch eingehalten werden kann.
export function naechsterKuendigungstermin(v, heute = new Date()) {
  heute = parseDate(heute);
  let termin = parseDate(v.vertragsende) || parseDate(v.hauptfaelligkeit);
  if (!termin) return null;
  const verl = num(v.verlaengerung_monate) ?? (v.vertragsende ? 0 : 12);
  const fristTage = kuendigungsfristTage(v);
  let guard = 0;
  while (verl > 0 && addDays(termin, -fristTage) < heute && guard++ < 200) {
    termin = addMonths(termin, verl);
  }
  return termin;
}

export function kuendigungsfristTage(v) {
  const m = num(v.kuendigungsfrist_monate);
  const w = num(v.kuendigungsfrist_wochen);
  const t = num(v.kuendigungsfrist_tage);
  if (m !== null) return Math.round(m * 30.4375);
  if (w !== null) return w * 7;
  if (t !== null) return t;
  return 0;
}

export function kuendigungSpaetestens(v, heute = new Date()) {
  const termin = naechsterKuendigungstermin(v, heute);
  if (!termin) return null;
  const m = num(v.kuendigungsfrist_monate);
  if (m !== null) return addMonths(termin, -m);
  return addDays(termin, -kuendigungsfristTage(v));
}

export function erinnerungsdatum(v, heute = new Date()) {
  const s = kuendigungSpaetestens(v, heute);
  return s ? addMonths(s, -1) : null;
}

export function tageBis(d, heute = new Date()) {
  if (!d) return null;
  return Math.round((parseDate(d) - parseDate(heute)) / DAY);
}

// ---------- Darlehen ----------

// Liefert die Zahlungsreihe (Zins, Tilgung, Restschuld) ab Stichtag bis Restschuld 0
// oder Endfälligkeit. Unterstützt Annuität, Tilgungsdarlehen (konstante Tilgung) und endfällig.
export function tilgungsplan(v, stichtag = new Date()) {
  const d = v.darlehen || {};
  stichtag = parseDate(stichtag);
  let rest = num(d.restschuld) ?? num(d.darlehensbetrag);
  if (rest === null || rest <= 0) return [];
  const zins = (num(d.zinssatz) ?? 0) / 100;
  const art = d.tilgungsart || 'Annuität';
  const perJahr = RHYTHMEN[d.rate_rhythmus || 'monatlich'] || 12;
  const schritt = 12 / perJahr;
  const rate = num(d.rate);
  const ende = parseDate(d.faelligkeit);
  const konstTilg = num(d.tilgung_betrag);
  const plan = [];
  let datum = parseDate(d.naechste_rate) || addMonths(stichtag, schritt);
  if (datum <= stichtag) {
    while (datum <= stichtag) datum = addMonths(datum, schritt);
  }
  let n = 0;
  while (rest > 0.005 && n++ < 1200) {
    const z = rest * zins / perJahr;
    let t;
    const letzte = ende && datum >= ende;
    if (art === 'endfällig') t = letzte ? rest : 0;
    else if (art === 'Tilgungsdarlehen') t = konstTilg ?? (rate !== null ? rate : rest);
    else t = rate !== null ? rate - z : rest; // Annuität; ohne Rate: alles fällig
    if (t <= 0 && !letzte) {
      // Rate deckt Zinsen nicht: als endfällig behandeln
      if (!ende) { plan.push({ datum, zins: z, tilgung: rest, rest: 0 }); break; }
      t = 0;
    }
    if (letzte || t > rest) t = rest;
    rest -= t;
    plan.push({ datum: new Date(datum), zins: z, tilgung: t, rest });
    if (letzte) break;
    datum = addMonths(datum, schritt);
  }
  return plan;
}

export function restschuld(v) {
  const d = v.darlehen || {};
  return num(d.restschuld) ?? num(d.darlehensbetrag) ?? 0;
}

// Restlaufzeitenspiegel nach § 268 Abs. 5 und § 285 Nr. 1 HGB:
// Aufteilung der Restschuld nach der Fälligkeit der einzelnen Tilgungsbeträge.
export function laufzeitBaender(v, stichtag = new Date()) {
  stichtag = parseDate(stichtag);
  const g1 = addMonths(stichtag, 12);
  const g5 = addMonths(stichtag, 60);
  const r = { bis1: 0, bis5: 0, ueber5: 0, zins12: 0 };
  const plan = tilgungsplan(v, stichtag);
  if (!plan.length) {
    const rs = restschuld(v);
    const f = parseDate((v.darlehen || {}).faelligkeit);
    if (!f || f <= g1) r.bis1 = rs; else if (f <= g5) r.bis5 = rs; else r.ueber5 = rs;
    return r;
  }
  for (const p of plan) {
    if (p.datum <= g1) { r.bis1 += p.tilgung; r.zins12 += p.zins; }
    else if (p.datum <= g5) r.bis5 += p.tilgung;
    else r.ueber5 += p.tilgung;
  }
  return r;
}

export function restlaufzeitenspiegel(vertraege, stichtag = new Date()) {
  const zeilen = new Map();
  for (const v of vertraege) {
    if (v.kategorie !== 'Darlehen' && v.kategorie !== 'Leasing') continue;
    if (v.status === 'beendet') continue;
    const posten = (v.darlehen && v.darlehen.bilanzposten) || 'Verbindlichkeiten gegenüber Kreditinstituten';
    const b = laufzeitBaender(v, stichtag);
    const gesamt = restschuld(v);
    const gesichert = (v.darlehen?.sicherheiten || []).length ? gesamt : 0;
    const z = zeilen.get(posten) || { posten, gesamt: 0, bis1: 0, bis5: 0, ueber5: 0, gesichert: 0, sicherheiten: new Set(), vertraege: [] };
    z.gesamt += gesamt; z.bis1 += b.bis1; z.bis5 += b.bis5; z.ueber5 += b.ueber5; z.gesichert += gesichert;
    for (const s of v.darlehen?.sicherheiten || []) z.sicherheiten.add(s.art);
    z.vertraege.push(v);
    zeilen.set(posten, z);
  }
  const list = [...zeilen.values()].map((z) => ({ ...z, sicherheiten: [...z.sicherheiten].join(', ') }));
  const summe = list.reduce((a, z) => ({
    posten: 'Summe', gesamt: a.gesamt + z.gesamt, bis1: a.bis1 + z.bis1, bis5: a.bis5 + z.bis5,
    ueber5: a.ueber5 + z.ueber5, gesichert: a.gesichert + z.gesichert, sicherheiten: '',
  }), { gesamt: 0, bis1: 0, bis5: 0, ueber5: 0, gesichert: 0 });
  return { zeilen: list, summe };
}

export function verbindlichkeiten(vertraege, stichtag = new Date()) {
  return vertraege
    .filter((v) => (v.kategorie === 'Darlehen' || v.kategorie === 'Leasing') && v.status !== 'beendet')
    .map((v) => {
      const d = v.darlehen || {};
      const b = laufzeitBaender(v, stichtag);
      return {
        v,
        glaeubiger: v.anbieter,
        vertragsnummer: v.vertragsnummer,
        objekt: v.objekt,
        darlehensbetrag: num(d.darlehensbetrag),
        restschuld: restschuld(v),
        zinssatz: num(d.zinssatz),
        zinsbindung_bis: d.zinsbindung_bis,
        rate: num(d.rate),
        rate_rhythmus: d.rate_rhythmus,
        faelligkeit: d.faelligkeit,
        zins12: b.zins12 || (restschuld(v) * (num(d.zinssatz) || 0) / 100),
        tilgung12: b.bis1,
        sicherheiten: (d.sicherheiten || []).map((s) => s.art + (s.betrag ? ` ${fmtEuro(num(s.betrag))}` : '')).join('; '),
      };
    });
}

export function sicherheiten(vertraege) {
  const out = [];
  for (const v of vertraege) {
    for (const s of v.darlehen?.sicherheiten || []) {
      out.push({
        art: s.art, beschreibung: s.beschreibung, objekt: s.objekt || v.objekt, betrag: num(s.betrag),
        rang: s.rang, glaeubiger: v.anbieter, vertragsnummer: v.vertragsnummer, restschuld: restschuld(v), v,
      });
    }
  }
  return out.sort((a, b) => String(a.objekt || '').localeCompare(String(b.objekt || ''), 'de'));
}

export function fmtEuro(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function fmtDatum(d) {
  d = parseDate(d);
  if (!d) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtProzent(n) {
  n = num(n);
  if (n === null) return '';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' %';
}

// ---------- Kalender (ICS) ----------

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function icsDate(d) { return isoDate(d).replace(/-/g, ''); }
function fold(line) {
  // Zeilen nach max. 73 Bytes (UTF-8) umbrechen, ohne Zeichen zu zerteilen.
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

export function kalenderICS(vertraege, heute = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vertragsverwaltung//DE', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:Vertragsfristen', 'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H',
  ];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ereignis = (uid, datum, titel, desc) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@vertragsverwaltung`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(datum)}`, `DTEND;VALUE=DATE:${icsDate(addDays(datum, 1))}`,
      fold(`SUMMARY:${icsEscape(titel)}`), fold(`DESCRIPTION:${icsEscape(desc)}`), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEscape(titel)}`), 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT');
  };
  for (const v of vertraege) {
    if (v.status === 'beendet' || v.status === 'gekündigt' || v.dokumenttyp === 'Nachtrag') continue;
    // Darlehen: Zinsbindungsende 6 Monate vorher melden
    const zb = parseDate(v.darlehen?.zinsbindung_bis);
    if (zb) {
      const name = [v.art || 'Darlehen', v.anbieter, v.objekt].filter(Boolean).join(' · ');
      ereignis(`${v.id}-zinsbindung-${icsDate(zb)}`, addMonths(zb, -6), `Zinsbindung endet in 6 Monaten: ${name}`,
        `Darlehen ${v.vertragsnummer || ''}\nZinsbindung bis ${fmtDatum(zb)}. Anschlussfinanzierung / Forward-Darlehen prüfen.`);
    }
    const sp = kuendigungSpaetestens(v, heute);
    if (!sp) continue;
    const er = addMonths(sp, -1);
    const name = [v.art || v.kategorie, v.anbieter, v.objekt || v.kennzeichen].filter(Boolean).join(' · ');
    const desc = `Vertrag ${v.vertragsnummer || ''}\nKündigung spätestens am ${fmtDatum(sp)} beim Anbieter eingegangen.\n` +
      `Vertragsablauf: ${fmtDatum(naechsterKuendigungstermin(v, heute))}\nBeitrag: ${fmtEuro(num(v.beitrag))} ${v.beitrag_rhythmus || ''}`;
    ereignis(`${v.id}-erinnerung-${icsDate(er)}`, er, `Kündigung prüfen (Frist in 1 Monat): ${name}`, desc);
    ereignis(`${v.id}-frist-${icsDate(sp)}`, sp, `LETZTER TAG Kündigung: ${name}`, desc);
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
