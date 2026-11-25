// Hinweise aus der Analyse: anstehende Entscheidungen (Kündigungsfristen) und kritische Punkte.
// Erledigte Punkte merkt sich die App im Vertrag (hinweise_erledigt), damit sie nicht wieder auftauchen.
import * as c from './calc.js';
import { istNachtrag } from './nachtraege.js';

export const FRIST_TAGE = 60;

// Punkte wie „Vertrag beendet, keine Handlung nötig“ sind keine Hinweise.
const belanglos = (t) => /keine handlung n(ö|oe)tig|nur als historie/i.test(t);

export const laeuft = (v) => v.status !== 'beendet' && v.status !== 'gekündigt';

// Offene kritische Punkte eines Eintrags (Vertrag, Nachtrag oder Unterlage).
export function offenePunkte(v) {
  const erledigt = new Set(v.hinweise_erledigt || []);
  return (v.analyse?.kritisch || []).filter((t) => t && !belanglos(t) && !erledigt.has(t));
}

// Entscheidung zur Kündigung ansteht? Liefert { sp, termin, tage } oder null.
export function fristHinweis(v, heute = new Date()) {
  if (!laeuft(v) || istNachtrag(v)) return null;
  const sp = c.kuendigungSpaetestens(v, heute);
  if (!sp) return null;
  const tage = c.tageBis(sp);
  if (tage < 0 || tage > FRIST_TAGE) return null;
  return { sp, termin: c.naechsterKuendigungstermin(v, heute), tage };
}

// Alle Hinweise für die Startseite.
export function sammle(vertraege, heute = new Date()) {
  const fristen = [];
  const kritisch = [];
  for (const v of vertraege) {
    const f = fristHinweis(v, heute);
    if (f) fristen.push({ v, ...f, tipp: (v.analyse?.verbesserungen || []).find((t) => !belanglos(t)) || '' });
    // Kritisch: laufende Verträge, nicht zugeordnete Nachträge, und Unterlagen mit offenen Punkten (z. B. Steuerthemen)
    const quellen = [];
    if (laeuft(v)) quellen.push({ x: v, wo: v });
    for (const u of v._unterlagen || []) quellen.push({ x: u, wo: v, unterlage: u });
    if (laeuft(v)) for (const n of v._nachtraege || []) quellen.push({ x: n, wo: v, nachtrag: n });
    for (const q of quellen) {
      const punkte = offenePunkte(q.x);
      if (punkte.length) kritisch.push({ v: q.wo, quelle: q.x, punkte, unterlage: q.unterlage, nachtrag: q.nachtrag });
    }
  }
  fristen.sort((a, b) => a.sp - b.sp);
  return { fristen, kritisch };
}
