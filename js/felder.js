// Felddefinitionen für Anzeige und Bearbeitung.
import { KATEGORIEN, VERSICHERUNGSARTEN, RHYTHMEN } from './calc.js';

const R = Object.keys(RHYTHMEN);

// wenn: Funktion, die entscheidet, ob ein Feld für den Vertrag relevant ist
const ist = (...k) => (v) => k.includes(v.kategorie);
const kfz = (v) => v.kategorie === 'Versicherung' && (/kfz|kraftfahr|auto/i.test(v.art || '') || !!v.kennzeichen);

export const ABSCHNITTE = [
  {
    titel: 'Vertrag',
    felder: [
      { k: 'kategorie', label: 'Kategorie', typ: 'auswahl', werte: KATEGORIEN, pflicht: true },
      { k: 'art', label: 'Art', typ: 'text', vorschlaege: VERSICHERUNGSARTEN },
      { k: 'anbieter', label: 'Anbieter / Vertragspartner', typ: 'text' },
      { k: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text' },
      { k: 'kundennummer', label: 'Kundennummer', typ: 'text' },
      { k: 'versicherungsnehmer', label: 'Versicherungsnehmer / Kunde', typ: 'text' },
      { k: 'status', label: 'Status', typ: 'auswahl', werte: ['aktiv', 'gekündigt', 'beendet'] },
    ],
  },
  {
    titel: 'Objekt',
    felder: [
      { k: 'objekt', label: 'Belegenheit / Objekt / Lieferstelle', typ: 'text' },
      { k: 'kennzeichen', label: 'Kennzeichen', typ: 'text', wenn: kfz },
      { k: 'fahrzeug', label: 'Fahrzeug', typ: 'text', wenn: kfz },
    ],
  },
  {
    titel: 'Beitrag und Zahlung',
    wenn: (v) => v.kategorie !== 'Darlehen',
    felder: [
      { k: 'beitrag', label: 'Beitrag je Zahlung (€)', typ: 'euro' },
      { k: 'beitrag_rhythmus', label: 'Zahlungsrhythmus', typ: 'auswahl', werte: R },
      { k: 'zahlungstermin', label: 'Zahlungstermin', typ: 'text' },
      { k: 'zahlungsweise', label: 'Zahlungsweise', typ: 'text' },
    ],
  },
  {
    titel: 'Laufzeit und Kündigung',
    felder: [
      { k: 'beginn', label: 'Vertragsbeginn', typ: 'datum' },
      { k: 'vertragsende', label: 'Vertragsende (fest)', typ: 'datum' },
      { k: 'hauptfaelligkeit', label: 'Hauptfälligkeit / nächster Ablauf', typ: 'datum' },
      { k: 'verlaengerung_monate', label: 'Verlängerung um (Monate)', typ: 'zahl' },
      { k: 'kuendigungsfrist_text', label: 'Kündigungsfrist (Wortlaut)', typ: 'text' },
      { k: 'kuendigungsfrist_monate', label: 'Kündigungsfrist Monate', typ: 'zahl' },
      { k: 'kuendigungsfrist_wochen', label: 'Kündigungsfrist Wochen', typ: 'zahl' },
      { k: 'kuendigungsfrist_tage', label: 'Kündigungsfrist Tage', typ: 'zahl' },
    ],
  },
  {
    titel: 'Leistung',
    wenn: ist('Versicherung'),
    felder: [
      { k: 'versicherungssumme', label: 'Versicherungssumme (€)', typ: 'euro' },
      { k: 'deckung', label: 'Deckung / Tarif', typ: 'textlang' },
      { k: 'selbstbehalt', label: 'Selbstbehalt (€)', typ: 'euro' },
      { k: 'selbstbehalt_vk', label: 'Selbstbehalt Vollkasko (€)', typ: 'euro', wenn: kfz },
      { k: 'selbstbehalt_tk', label: 'Selbstbehalt Teilkasko (€)', typ: 'euro', wenn: kfz },
      { k: 'sf_klasse', label: 'SF-Klasse', typ: 'text', wenn: kfz },
    ],
  },
  {
    titel: 'Energie',
    wenn: ist('Energie'),
    felder: [
      { k: 'zaehlernummer', label: 'Zählernummer', typ: 'text' },
      { k: 'marktlokation', label: 'Marktlokation (MaLo)', typ: 'text' },
      { k: 'verbrauch_prognose', label: 'Jahresverbrauch', typ: 'text' },
      { k: 'arbeitspreis', label: 'Arbeitspreis', typ: 'text' },
      { k: 'grundpreis', label: 'Grundpreis', typ: 'text' },
      { k: 'preisgarantie_bis', label: 'Preisgarantie bis', typ: 'datum' },
    ],
  },
  {
    titel: 'Darlehen',
    wenn: ist('Darlehen', 'Leasing'),
    pfad: 'darlehen',
    felder: [
      { k: 'darlehensbetrag', label: 'Darlehensbetrag (€)', typ: 'euro' },
      { k: 'restschuld', label: 'Restschuld (€)', typ: 'euro' },
      { k: 'restschuld_stichtag', label: 'Restschuld per', typ: 'datum' },
      { k: 'zinssatz', label: 'Sollzins p. a. (%)', typ: 'prozent' },
      { k: 'effektivzins', label: 'Effektivzins (%)', typ: 'prozent' },
      { k: 'zinsbindung_bis', label: 'Zinsbindung bis', typ: 'datum' },
      { k: 'tilgungsart', label: 'Tilgungsart', typ: 'auswahl', werte: ['Annuität', 'Tilgungsdarlehen', 'endfällig'] },
      { k: 'rate', label: 'Rate (€)', typ: 'euro' },
      { k: 'tilgung_betrag', label: 'Tilgung je Rate (€, bei Tilgungsdarlehen)', typ: 'euro' },
      { k: 'rate_rhythmus', label: 'Ratenrhythmus', typ: 'auswahl', werte: R },
      { k: 'naechste_rate', label: 'Nächste Rate am', typ: 'datum' },
      { k: 'faelligkeit', label: 'Fälligkeit / Laufzeitende', typ: 'datum' },
      { k: 'zinsbetrag_jahr', label: 'Zinsbetrag p. a. lt. Vertrag (€)', typ: 'euro' },
      { k: 'sondertilgung', label: 'Sondertilgung', typ: 'text' },
      { k: 'verwendungszweck', label: 'Verwendungszweck', typ: 'text' },
      { k: 'bilanzposten', label: 'Bilanzposten', typ: 'auswahl', werte: ['Verbindlichkeiten gegenüber Kreditinstituten', 'Verbindlichkeiten gegenüber Gesellschaftern', 'Sonstige Verbindlichkeiten', 'Leasingverbindlichkeiten'] },
    ],
  },
  {
    titel: 'Notizen',
    felder: [{ k: 'notizen', label: 'Notizen', typ: 'textlang' }],
  },
];

export const SICHERHEIT_FELDER = [
  { k: 'art', label: 'Art', typ: 'auswahl', werte: ['Grundschuld', 'Hypothek', 'Sicherungsübereignung', 'Abtretung', 'Bürgschaft', 'Verpfändung', 'Sonstige'] },
  { k: 'beschreibung', label: 'Beschreibung', typ: 'text' },
  { k: 'objekt', label: 'Objekt', typ: 'text' },
  { k: 'betrag', label: 'Betrag (€)', typ: 'euro' },
  { k: 'rang', label: 'Rang', typ: 'text' },
];
