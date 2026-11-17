// Beispieldaten, solange Dropbox nicht verbunden ist (nur zum Ausprobieren).
export const DEMO = [
  {
    id: 'demo-1', kategorie: 'Versicherung', art: 'Gebäude', anbieter: 'Muster Versicherung AG', vertragsnummer: 'GB-4711-01',
    kundennummer: 'K-99812', objekt: 'Hauptstraße 1, 51373 Leverkusen', beginn: '2019-01-01', hauptfaelligkeit: '2027-01-01',
    verlaengerung_monate: 12, kuendigungsfrist_monate: 3, kuendigungsfrist_text: '3 Monate zum Ablauf', beitrag: 1184.4,
    beitrag_rhythmus: 'jährlich', zahlungstermin: '01.01. jährlich', versicherungssumme: 820000, selbstbehalt: 500,
    deckung: 'Feuer, Leitungswasser, Sturm/Hagel, Elementar', status: 'aktiv',
    analyse: { zusammenfassung: 'Wohngebäudeversicherung zum gleitenden Neuwert inkl. Elementar.', kritisch: ['Selbstbehalt 500 € je Schaden', 'Keine Absicherung grober Fahrlässigkeit'], verbesserungen: ['Baustein grobe Fahrlässigkeit ergänzen', 'Angebot mit Photovoltaik-Einschluss einholen'] },
  },
  {
    id: 'demo-2', kategorie: 'Versicherung', art: 'Gebäude', anbieter: 'Beispiel Versicherung', vertragsnummer: 'WG-220-778',
    objekt: 'Am Markt 5, 50667 Köln', beginn: '2021-07-01', hauptfaelligkeit: '2027-07-01', verlaengerung_monate: 12,
    kuendigungsfrist_monate: 1, beitrag: 96.2, beitrag_rhythmus: 'monatlich', versicherungssumme: 1250000, status: 'aktiv',
    analyse: { zusammenfassung: 'Mehrfamilienhaus, Wohngebäude ohne Elementar.', kritisch: ['Elementarschäden nicht versichert', 'Monatliche Zahlweise mit Ratenzuschlag'], verbesserungen: ['Elementar einschließen', 'Auf jährliche Zahlweise umstellen'] },
  },
  {
    id: 'demo-3', kategorie: 'Versicherung', art: 'KFZ', anbieter: 'Auto-Versicherung AG', vertragsnummer: 'KF-55-1200',
    kennzeichen: 'LEV-SW 123', fahrzeug: 'BMW 530e Touring', hauptfaelligkeit: '2027-01-01', verlaengerung_monate: 12,
    kuendigungsfrist_monate: 1, beitrag: 1236, beitrag_rhythmus: 'jährlich', selbstbehalt_vk: 500, selbstbehalt_tk: 150,
    sf_klasse: 'SF 25 / SF 22', status: 'aktiv',
    analyse: { zusammenfassung: 'Haftpflicht, Vollkasko und Teilkasko.', kritisch: ['Werkstattbindung'], verbesserungen: ['Jährlich zum 30.11. Vergleich durchführen'] },
  },
  {
    id: 'demo-4', kategorie: 'Versicherung', art: 'KFZ', anbieter: 'Auto-Versicherung AG', vertragsnummer: 'KF-55-1201',
    kennzeichen: 'LEV-KW 77', fahrzeug: 'VW Golf', hauptfaelligkeit: '2027-01-01', verlaengerung_monate: 12,
    kuendigungsfrist_monate: 1, beitrag: 48.5, beitrag_rhythmus: 'monatlich', selbstbehalt_tk: 150, status: 'aktiv',
  },
  {
    id: 'demo-5', kategorie: 'Versicherung', art: 'Hausrat', anbieter: 'Muster Versicherung AG', vertragsnummer: 'HR-3321',
    objekt: 'Hauptstraße 1, 51373 Leverkusen', hauptfaelligkeit: '2027-04-01', verlaengerung_monate: 12, kuendigungsfrist_monate: 3,
    beitrag: 32.4, beitrag_rhythmus: 'vierteljährlich', versicherungssumme: 95000, status: 'aktiv',
  },
  {
    id: 'demo-6', kategorie: 'Energie', art: 'Strom', anbieter: 'Stadtwerke Beispiel', vertragsnummer: 'SV-881920', kundennummer: '100200300',
    objekt: 'Hauptstraße 1, 51373 Leverkusen', zaehlernummer: '1ESY1160123456', marktlokation: '50412345678',
    beginn: '2025-03-01', vertragsende: '2027-02-28', verlaengerung_monate: 1, kuendigungsfrist_wochen: 4, beitrag: 142,
    beitrag_rhythmus: 'monatlich', arbeitspreis: '29,8 ct/kWh', preisgarantie_bis: '2027-02-28', status: 'aktiv',
  },
  {
    id: 'demo-7', kategorie: 'Darlehen', art: 'Annuitätendarlehen', anbieter: 'Sparkasse Beispiel', vertragsnummer: 'DL 7700 1234',
    objekt: 'Am Markt 5, 50667 Köln', beginn: '2021-07-01', status: 'aktiv',
    darlehen: {
      darlehensbetrag: 900000, restschuld: 812400, restschuld_stichtag: '2026-10-31', zinssatz: 1.45, zinsbindung_bis: '2031-06-30',
      tilgungsart: 'Annuität', rate: 2587.5, rate_rhythmus: 'monatlich', naechste_rate: '2026-11-30', faelligkeit: '2031-06-30',
      bilanzposten: 'Verbindlichkeiten gegenüber Kreditinstituten',
      sicherheiten: [{ art: 'Grundschuld', beschreibung: 'Buchgrundschuld Abt. III Nr. 1, Grundbuch von Köln Blatt 1234', objekt: 'Am Markt 5, 50667 Köln', betrag: 900000, rang: '1' }],
    },
    analyse: { zusammenfassung: 'Annuitätendarlehen für Mehrfamilienhaus, Zinsbindung bis 2031.', kritisch: ['Anschlussfinanzierung für ca. 690 T€ ab 07/2031 nötig'], verbesserungen: ['Ab 2028 Forward-Darlehen prüfen', 'Sondertilgungsrecht 5 % p. a. nutzen'] },
  },
  {
    id: 'demo-8', kategorie: 'Darlehen', art: 'Endfälliges Darlehen', anbieter: 'Volksbank Beispiel', vertragsnummer: 'EF-55120',
    objekt: 'Hauptstraße 1, 51373 Leverkusen', status: 'aktiv',
    darlehen: {
      darlehensbetrag: 150000, restschuld: 150000, zinssatz: 3.2, tilgungsart: 'endfällig', rate: 400, rate_rhythmus: 'monatlich',
      faelligkeit: '2028-03-31', bilanzposten: 'Verbindlichkeiten gegenüber Kreditinstituten',
      sicherheiten: [{ art: 'Grundschuld', beschreibung: 'Grundschuld Abt. III Nr. 2', objekt: 'Hauptstraße 1, 51373 Leverkusen', betrag: 150000, rang: '2' },
        { art: 'Abtretung', beschreibung: 'Abtretung Rückkaufswert Lebensversicherung LV-9988', betrag: 60000 }],
    },
  },
  {
    id: 'demo-9', kategorie: 'Versicherung', art: 'Krankenversicherung', anbieter: 'Private Kranken AG', vertragsnummer: 'PKV-123456',
    beginn: '2010-01-01', beitrag: 689.12, beitrag_rhythmus: 'monatlich', selbstbehalt: 1200, status: 'aktiv',
    kuendigungsfrist_monate: 3, hauptfaelligkeit: '2027-01-01', verlaengerung_monate: 12,
  },
];
for (const v of DEMO) v.demo = true;
