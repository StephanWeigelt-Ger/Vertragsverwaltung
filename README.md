# Vertragsverwaltung

Private Web-App (PWA) zur Verwaltung aller Verträge: Versicherungen, Darlehen, Energie, Telekommunikation, Miete, Leasing und Abos.
Läuft im Browser auf PC, iPad und iPhone und kann zum Home-Bildschirm hinzugefügt werden. Es gibt keinen eigenen Server:
Die App spricht direkt mit deiner Dropbox, alle Daten bleiben dort.

**Adresse:** https://stephanweigelt-ger.github.io/Vertragsverwaltung/

## Funktionen

- **Entsperren** per Face ID / Touch ID / Windows Hello (Passkey) oder Passwort. Zugangsdaten werden auf dem Gerät mit AES-256 verschlüsselt. Nach 5 Minuten im Hintergrund sperrt die App automatisch.
- **Vertragsliste** mit Volltextsuche (Vertragsnummer, Kundennummer, Kennzeichen, Zählernummer, Objekt …), Filter nach Kategorie, Gruppierung nach Kategorie, Art, Objekt oder Anbieter.
- **Erfasste Angaben:** Vertrags- und Kundennummer, Belegenheit/Objekt bzw. Kennzeichen, Art, Beitrag, Zahlungstermin und -rhythmus, Laufzeit, Kündigungsfrist, Versicherungssumme, Selbstbehalt (bei KFZ Voll- und Teilkasko, SF-Klasse), Zählernummer und Marktlokation bei Energie, bei Darlehen Betrag, Restschuld, Zinssatz, Zinsbindung, Rate, Fälligkeit, Zinsbetrag und Sicherheiten.
- **Analyse** je Vertrag: Zusammenfassung, kritische Punkte, Verbesserungsvorschläge.
- **Auswertungen** als Tabelle, **PDF** und **Excel** (wahlweise zusätzlich in der Dropbox abgelegt):
  Alle Verträge, Alle Versicherungen, Versicherungen nach Objekt, KFZ-Versicherungen, Gebäudeversicherungen nach Objekt, Energieverträge, Beitragsübersicht, Kündigungsfristen,
  Verbindlichkeitenübersicht, Sicherheitenübersicht, Verbindlichkeitenspiegel mit Restlaufzeiten (bis 1 Jahr, 1 bis 5 Jahre, über 5 Jahre, davon gesichert, Art und Form der Sicherheiten) nach § 268 Abs. 5 und § 285 Nr. 1 und 2 HGB.
- **Tilgungsplan** je Darlehen (Annuität, Ratentilgung, endfällig) als Grundlage der Restlaufzeiten.
- **Erinnerungen:** Kalender-Abo (ICS) für Outlook mit Alarm einen Monat vor Ablauf jeder Kündigungsfrist und am letzten Kündigungstag, bei Darlehen 6 Monate vor Ende der Zinsbindung. Zusätzlich Mitteilung beim Öffnen der App und Push-Mitteilung aus dem täglichen Claude-Lauf.

## Ablage in der Dropbox

| Ordner | Inhalt |
|---|---|
| `/privat/KI - Zugriff/` | Eingang: Hier neue Verträge ablegen (PDF, Fotos, Word; Unterordner erlaubt) |
| `/privat/KI - Zugriff/_Vertragsdaten/vertraege/` | Eine JSON-Datei pro Vertrag |
| `/privat/KI - Zugriff/_Vertragsdaten/vertragsfristen.ics` | Kalender für das Outlook-Abo |
| `/privat/KI - Zugriff/_Vertragsdaten/auswertungen/` | Exportierte PDF- und Excel-Dateien |

## Analyse neuer Verträge

1. **Täglich automatisch:** Ein geplanter Claude-Lauf prüft jeden Morgen den Eingang, analysiert neue Dokumente nach [ANALYSE.md](ANALYSE.md) und legt je Vertrag eine JSON-Datei an. Neue Verträge sind in der App als „prüfen" markiert.
2. **Sofort in der App:** Unter *Eingang* → *Analysieren*. Benötigt einen Anthropic-API-Schlüssel (Einstellungen), der nur verschlüsselt auf dem Gerät liegt.

## Einrichtung (einmalig)

1. App öffnen, Passwort festlegen, unter *Einstellungen* Face ID einrichten.
2. *Mit Dropbox verbinden*.
3. *Kalender-Link erzeugen* und in Outlook unter *Kalender hinzufügen → Aus dem Internet abonnieren* einfügen.
4. Auf iPhone/iPad in Safari *Teilen → Zum Home-Bildschirm*.

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt, gehostet über GitHub Pages. Bibliotheken im Ordner `vendor/`:
jsPDF 2.5.1 und jsPDF-AutoTable 3.8.2 (MIT), SheetJS 0.18.5 (Apache-2.0), Anthropic TypeScript SDK 1.4.0 (Apache-2.0, gebündelt).
Einstellungen in `js/config.js`. Lokal testen: `python3 -m http.server` im Projektordner.
