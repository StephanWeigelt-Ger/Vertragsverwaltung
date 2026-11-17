// Export von Auswertungen als PDF (jsPDF + AutoTable) und Excel (SheetJS).
import { fmtEuro, fmtDatum, fmtProzent } from './calc.js';

// Bibliotheken liegen im Ordner vendor/ (jsPDF 2.5.1, AutoTable 3.8.2, SheetJS 0.18.5)
const LIBS = {
  jspdf: 'vendor/jspdf.umd.min.js',
  autotable: 'vendor/jspdf.plugin.autotable.min.js',
  xlsx: 'vendor/xlsx.full.min.js',
};
const geladen = {};
function lade(url) {
  return geladen[url] ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.onload = res; s.onerror = () => rej(new Error('Bibliothek konnte nicht geladen werden (offline?).'));
    document.head.appendChild(s);
  });
}

export function formatiere(wert, typ) {
  if (wert === null || wert === undefined || wert === '') return '';
  switch (typ) {
    case 'euro': return fmtEuro(Number(wert));
    case 'datum': return fmtDatum(wert);
    case 'prozent': return fmtProzent(wert);
    case 'zahl': return Number(wert).toLocaleString('de-DE');
    default: return String(wert);
  }
}

// Zeilen mit Gruppenköpfen und Zwischensummen aufbereiten.
export function aufbereiten(bericht) {
  const { spalten, zeilen, gruppe } = bericht;
  const summenSpalten = spalten.filter((s) => s.summe);
  const out = [];
  const summe = (rows) => Object.fromEntries(summenSpalten.map((s) => [s.k, rows.reduce((a, r) => a + (Number(r[s.k]) || 0), 0)]));
  if (gruppe) {
    const gruppen = new Map();
    for (const z of zeilen) {
      const g = z[gruppe] || '(ohne Angabe)';
      if (!gruppen.has(g)) gruppen.set(g, []);
      gruppen.get(g).push(z);
    }
    for (const [g, rows] of [...gruppen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))) {
      out.push({ _typ: 'gruppe', titel: g, anzahl: rows.length });
      out.push(...rows);
      if (summenSpalten.length && rows.length > 1) out.push({ _typ: 'zwischensumme', ...summe(rows) });
    }
  } else out.push(...zeilen);
  if (summenSpalten.length && zeilen.length) out.push({ _typ: 'summe', ...summe(zeilen), ...(bericht.summenzeile || {}) });
  return out;
}

function dateiname(bericht, ext) {
  const d = new Date().toISOString().slice(0, 10);
  return `${bericht.titel.replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${d}.${ext}`;
}

export async function alsPDF(bericht) {
  await lade(LIBS.jspdf);
  await lade(LIBS.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(15);
  doc.text(bericht.titel, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text([bericht.untertitel, `Stand: ${fmtDatum(new Date())}`].filter(Boolean).join('  ·  '), 14, 21);
  const rows = aufbereiten(bericht);
  const n = bericht.spalten.length;
  const body = rows.map((r) => {
    if (r._typ === 'gruppe') return [{ content: `${r.titel} (${r.anzahl})`, colSpan: n, styles: { fillColor: [232, 238, 246], fontStyle: 'bold' } }];
    const zeile = bericht.spalten.map((s, i) => {
      if (r._typ && i === 0) return r._typ === 'summe' ? 'Summe' : 'Zwischensumme';
      return r._typ && !s.summe && !(r[s.k]) ? '' : formatiere(r[s.k], s.typ);
    });
    if (r._typ) return zeile.map((c) => ({ content: c, styles: { fontStyle: 'bold', fillColor: r._typ === 'summe' ? [220, 226, 236] : [245, 247, 250] } }));
    return zeile;
  });
  doc.autoTable({
    startY: 26,
    head: [bericht.spalten.map((s) => s.label)],
    body,
    styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 58, 95] },
    columnStyles: Object.fromEntries(bericht.spalten.map((s, i) => [i, ['euro', 'zahl', 'prozent'].includes(s.typ) ? { halign: 'right' } : {}])),
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(140);
      doc.text(`Seite ${doc.internal.getNumberOfPages()}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 6);
    },
  });
  if (bericht.fussnote) {
    doc.setFontSize(7.5);
    doc.setTextColor(80);
    doc.text(doc.splitTextToSize(bericht.fussnote, 265), 14, doc.lastAutoTable.finalY + 6);
  }
  return { blob: doc.output('blob'), name: dateiname(bericht, 'pdf') };
}

export async function alsExcel(bericht) {
  await lade(LIBS.xlsx);
  const XLSX = window.XLSX;
  const rows = aufbereiten(bericht);
  const aoa = [[bericht.titel], [bericht.untertitel || '', `Stand: ${fmtDatum(new Date())}`], [], bericht.spalten.map((s) => s.label)];
  for (const r of rows) {
    if (r._typ === 'gruppe') { aoa.push([`${r.titel} (${r.anzahl})`]); continue; }
    aoa.push(bericht.spalten.map((s, i) => {
      if (r._typ && i === 0) return r._typ === 'summe' ? 'Summe' : 'Zwischensumme';
      const v = r[s.k];
      if (v === null || v === undefined || v === '') return null;
      if (['euro', 'zahl'].includes(s.typ)) return Number(v);
      if (s.typ === 'prozent') return Number(v) / 100;
      if (s.typ === 'datum') { const d = new Date(v); return isNaN(d) ? v : d; }
      return String(v);
    }));
  }
  if (bericht.fussnote) aoa.push([], [bericht.fussnote]);
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  // Zahlenformate
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 4; R <= range.e.r; R++) {
    bericht.spalten.forEach((s, C) => {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell) return;
      if (s.typ === 'euro') cell.z = '#,##0.00 "€"';
      if (s.typ === 'prozent') cell.z = '0.00%';
      if (s.typ === 'datum') cell.z = 'dd.mm.yyyy';
    });
  }
  ws['!cols'] = bericht.spalten.map((s) => ({ wch: Math.max(12, Math.min(40, s.label.length + 4, s.breite || 22)) }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, bericht.titel.slice(0, 31).replace(/[\\/?*[\]:]/g, ''));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: dateiname(bericht, 'xlsx') };
}

export function herunterladen({ blob, name }) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
