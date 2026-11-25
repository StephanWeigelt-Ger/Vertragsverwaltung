// Zentrale Einstellungen der App.
export const CONFIG = {
  // Öffentlicher App-Schlüssel der Dropbox-App (kein Geheimnis).
  dropboxAppKey: 'osq3kgypbdknniu',
  // Die Dropbox-App hat nur Zugriff auf ihren App-Ordner. Pfade gelten relativ dazu:
  // '/KI - Zugriff' ist in der Dropbox der Ordner „Apps/Verträge/KI - Zugriff“.
  // Eingangsordner: Hier legst du neue Verträge (PDF, Bilder, Word) ab.
  eingang: '/KI - Zugriff',
  // Ablage der erfassten Daten (eine JSON-Datei pro Vertrag), Kalender und Auswertungen.
  daten: '/KI - Zugriff/_Vertragsdaten',
  // Claude-Modell für die Vertragsanalyse in der App.
  modell: 'claude-opus-5-5',
};
