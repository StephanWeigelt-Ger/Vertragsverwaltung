// Vordefinierte Auswertungen. Jede liefert { titel, untertitel, spalten, zeilen, gruppe?, fussnote? }.
import * as c from './calc.js';

const aktiv = (v) => v.status !== 'beendet';
const versicherungen = (vs) => vs.filter((v) => v.kategorie === 'Versicherung' && aktiv(v));
const istArt = (v, ...worte) => worte.some((w) => String(v.art || '').toLowerCase().includes(w));

function basis(v, heute) {
  return {
    ...v,
    jahresbeitrag: c.jahresbeitrag(v),
    termin: c.isoDate(c.naechsterKuendigungstermin(v, heute)),
    spaetestens: c.isoDate(c.kuendigungSpaetestens(v, heute)),
    frist: v.kuendigungsfrist_text || [v.kuendigungsfrist_monate && `${v.kuendigungsfrist_monate} Monate`, v.kuendigungsfrist_wochen && `${v.kuendigungsfrist_wochen} Wochen`, v.kuendigungsfrist_tage && `${v.kuendigungsfrist_tage} Tage`].filter(Boolean).join(''),
    objekt_kz: v.objekt || v.kennzeichen || '',
  };
}

const S = {
  kategorie: { k: 'kategorie', label: 'Kategorie' },
  art: { k: 'art', label: 'Art' },
  anbieter: { k: 'anbieter', label: 'Anbieter', breite: 28 },
  nr: { k: 'vertragsnummer', label: 'Vertragsnr.' },
  kdnr: { k: 'kundennummer', label: 'Kundennr.' },
  objekt: { k: 'objekt_kz', label: 'Objekt / Kennzeichen', breite: 34 },
  beitrag: { k: 'beitrag', label: 'Beitrag', typ: 'euro' },
  rhythmus: { k: 'beitrag_rhythmus', label: 'Rhythmus' },
  zahlung: { k: 'zahlungstermin', label: 'Zahlungstermin' },
  jahr: { k: 'jahresbeitrag', label: 'Jahresbeitrag', typ: 'euro', summe: true },
  frist: { k: 'frist', label: 'Kündigungsfrist' },
  termin: { k: 'termin', label: 'Ablauf', typ: 'datum' },
  spaet: { k: 'spaetestens', label: 'Kündigen bis', typ: 'datum' },
  vs: { k: 'versicherungssumme', label: 'Vers.-Summe', typ: 'euro' },
  sb: { k: 'selbstbehalt', label: 'Selbstbehalt', typ: 'euro' },
};

export const BERICHTE = {
  alle: {
    titel: 'Alle Verträge', gruppe: 'kategorie',
    bauen: (vs, h) => ({ spalten: [S.art, S.anbieter, S.nr, S.kdnr, S.objekt, S.beitrag, S.rhythmus, S.jahr, S.frist, S.spaet], zeilen: vs.filter(aktiv).map((v) => basis(v, h)) }),
  },
  versicherungen: {
    titel: 'Alle Versicherungen', gruppe: 'art',
    bauen: (vs, h) => ({ spalten: [S.anbieter, S.nr, S.kdnr, S.objekt, S.vs, S.sb, S.beitrag, S.rhythmus, S.zahlung, S.jahr, S.frist, S.spaet], zeilen: versicherungen(vs).map((v) => basis(v, h)) }),
  },
  versicherungen_objekt: {
    titel: 'Versicherungen nach Objekt', gruppe: 'objekt_kz',
    bauen: (vs, h) => ({ spalten: [S.art, S.anbieter, S.nr, S.vs, S.sb, S.beitrag, S.rhythmus, S.jahr, S.spaet], zeilen: versicherungen(vs).map((v) => basis(v, h)) }),
  },
  kfz: {
    titel: 'KFZ-Versicherungen',
    bauen: (vs, h) => ({
      spalten: [{ k: 'kennzeichen', label: 'Kennzeichen' }, { k: 'fahrzeug', label: 'Fahrzeug' }, S.anbieter, S.nr, { k: 'sf_klasse', label: 'SF-Klasse' },
        { k: 'selbstbehalt_vk', label: 'SB Vollkasko', typ: 'euro' }, { k: 'selbstbehalt_tk', label: 'SB Teilkasko', typ: 'euro' }, S.beitrag, S.rhythmus, S.jahr, S.spaet],
      zeilen: versicherungen(vs).filter((v) => istArt(v, 'kfz', 'kraftfahr', 'auto') || v.kennzeichen).map((v) => basis(v, h))
        .sort((a, b) => String(a.kennzeichen).localeCompare(String(b.kennzeichen), 'de')),
    }),
  },
  gebaeude: {
    titel: 'Gebäudeversicherungen nach Objekt', gruppe: 'objekt_kz',
    bauen: (vs, h) => ({
      spalten: [S.art, S.anbieter, S.nr, { k: 'deckung', label: 'Deckung', breite: 30 }, S.vs, S.sb, S.beitrag, S.rhythmus, S.jahr, S.spaet],
      zeilen: versicherungen(vs).filter((v) => istArt(v, 'gebäude', 'gebaeude', 'wohngebäude', 'grundbesitz', 'elementar')).map((v) => basis(v, h)),
    }),
  },
  energie: {
    titel: 'Energieverträge',
    bauen: (vs, h) => ({
      spalten: [S.art, S.anbieter, S.nr, S.kdnr, { k: 'objekt', label: 'Lieferstelle' }, { k: 'zaehlernummer', label: 'Zählernummer' }, { k: 'marktlokation', label: 'Marktlokation' },
        { k: 'arbeitspreis', label: 'Arbeitspreis' }, S.beitrag, S.rhythmus, S.jahr, { k: 'preisgarantie_bis', label: 'Preisgarantie bis', typ: 'datum' }, S.spaet],
      zeilen: vs.filter((v) => v.kategorie === 'Energie' && aktiv(v)).map((v) => basis(v, h)),
    }),
  },
  fristen: {
    titel: 'Kündigungsfristen (nächste 18 Monate)',
    bauen: (vs, h) => {
      const grenze = c.addMonths(c.parseDate(h), 18);
      return {
        spalten: [{ k: 'erinnerung', label: 'Erinnerung', typ: 'datum' }, S.spaet, S.termin, S.kategorie, S.art, S.anbieter, S.nr, S.objekt, S.frist, S.jahr],
        zeilen: vs.filter((v) => aktiv(v) && v.status !== 'gekündigt').map((v) => ({ ...basis(v, h), erinnerung: c.isoDate(c.erinnerungsdatum(v, h)) }))
          .filter((z) => z.spaetestens && c.parseDate(z.spaetestens) <= grenze)
          .sort((a, b) => a.spaetestens.localeCompare(b.spaetestens)),
      };
    },
  },
  beitraege: {
    titel: 'Beitragsübersicht', gruppe: 'kategorie',
    bauen: (vs, h) => ({
      spalten: [S.art, S.anbieter, S.nr, S.objekt, S.beitrag, S.rhythmus, S.zahlung, { k: 'monatlich', label: 'Ø je Monat', typ: 'euro', summe: true }, S.jahr],
      zeilen: vs.filter(aktiv).map((v) => { const b = basis(v, h); return { ...b, monatlich: b.jahresbeitrag != null ? b.jahresbeitrag / 12 : null }; }).filter((z) => z.jahresbeitrag),
    }),
  },
  verbindlichkeiten: {
    titel: 'Verbindlichkeitenübersicht',
    bauen: (vs, h) => ({
      spalten: [{ k: 'glaeubiger', label: 'Gläubiger' }, { k: 'vertragsnummer', label: 'Darlehensnr.' }, { k: 'objekt', label: 'Objekt / Zweck' },
        { k: 'darlehensbetrag', label: 'Ursprungsbetrag', typ: 'euro', summe: true }, { k: 'restschuld', label: 'Restschuld', typ: 'euro', summe: true },
        { k: 'zinssatz', label: 'Zins p. a.', typ: 'prozent' }, { k: 'zinsbindung_bis', label: 'Zinsbindung bis', typ: 'datum' },
        { k: 'rate', label: 'Rate', typ: 'euro' }, { k: 'rate_rhythmus', label: 'Rhythmus' }, { k: 'faelligkeit', label: 'Fälligkeit', typ: 'datum' },
        { k: 'zins12', label: 'Zinsen 12 Mon.', typ: 'euro', summe: true }, { k: 'tilgung12', label: 'Tilgung 12 Mon.', typ: 'euro', summe: true },
        { k: 'sicherheiten', label: 'Sicherheiten', breite: 34 }],
      zeilen: c.verbindlichkeiten(vs, h),
      fussnote: 'Zinsen und Tilgung der nächsten 12 Monate aus dem Tilgungsplan ab Stichtag berechnet (Restschuld, Zinssatz, Rate).',
    }),
  },
  sicherheiten: {
    titel: 'Sicherheitenübersicht', gruppe: 'objekt',
    bauen: (vs) => ({
      spalten: [{ k: 'art', label: 'Art der Sicherheit' }, { k: 'beschreibung', label: 'Beschreibung', breite: 40 }, { k: 'rang', label: 'Rang' },
        { k: 'betrag', label: 'Betrag', typ: 'euro', summe: true }, { k: 'glaeubiger', label: 'Sicherungsnehmer' }, { k: 'vertragsnummer', label: 'Darlehen' },
        { k: 'restschuld', label: 'Restschuld Darlehen', typ: 'euro' }],
      zeilen: c.sicherheiten(vs.filter(aktiv)),
    }),
  },
  restlaufzeiten: {
    titel: 'Verbindlichkeitenspiegel (Restlaufzeiten)',
    bauen: (vs, h) => {
      const r = c.restlaufzeitenspiegel(vs, h);
      return {
        untertitel: `Stichtag ${c.fmtDatum(h)} · gem. § 268 Abs. 5, § 285 Nr. 1 und 2 HGB`,
        spalten: [{ k: 'posten', label: 'Verbindlichkeiten', breite: 40 }, { k: 'gesamt', label: 'Gesamtbetrag', typ: 'euro', summe: true },
          { k: 'bis1', label: 'davon RLZ bis 1 Jahr', typ: 'euro', summe: true }, { k: 'bis5', label: 'davon RLZ 1 bis 5 Jahre', typ: 'euro', summe: true },
          { k: 'ueber5', label: 'davon RLZ über 5 Jahre', typ: 'euro', summe: true }, { k: 'gesichert', label: 'davon gesichert', typ: 'euro', summe: true },
          { k: 'sicherheiten', label: 'Art und Form der Sicherheiten', breite: 34 }],
        zeilen: r.zeilen,
        fussnote: 'Die Restlaufzeiten ergeben sich aus der Fälligkeit der einzelnen Tilgungsleistungen laut Tilgungsplan (Annuität, Ratentilgung oder endfällig). '
          + 'Bei Ablauf der Zinsbindung wird die dann bestehende Restschuld als fällig behandelt, sofern als Fälligkeit das Ende der Zinsbindung erfasst ist. '
          + 'Zahlen ungeprüft, für den Jahresabschluss mit Saldenbestätigungen der Kreditinstitute abstimmen.',
      };
    },
  },
};

export function erstelle(key, vertraege, heute = new Date()) {
  const def = BERICHTE[key];
  const b = def.bauen(vertraege, heute);
  return { key, titel: def.titel, gruppe: def.gruppe, ...b };
}
