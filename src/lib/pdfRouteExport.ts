import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { safeFileName } from '@/lib/googleMapsExport';
import { resolvePdfCellValue, type PdfColumnOption, type RouteStopRow } from '@/lib/exportRouteData';
import type { Project, Route } from '@/types';

interface ExportRoutePdfArgs {
  project: Project;
  route: Route;
  rows: RouteStopRow[];
  columns: PdfColumnOption[];
}

export function exportRoutePdf({ project, route, rows, columns }: ExportRoutePdfArgs): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const generatedAt = new Date();
  const top = 40;

  doc.setFontSize(16);
  doc.text(route.name, 40, top);
  doc.setFontSize(10);
  doc.text(`Project: ${project.name}`, 40, top + 18);
  doc.text(`Stops: ${rows.length}`, 40, top + 32);
  doc.text(
    `Route totals: ${formatDistance(route.total_km)} • ${formatDuration(route.total_minutes)}`,
    40,
    top + 46,
  );
  doc.text(`Generated: ${generatedAt.toLocaleString()}`, 40, top + 60);

  const head = [['Stop #', ...columns.map((column) => column.label)]];
  const body = rows.map((row) => [
    String(row.stopNumber),
    ...columns.map((column) => resolvePdfCellValue(column, row)),
  ]);
  const columnStyles = buildColumnStyles(columns);

  autoTable(doc, {
    startY: top + 76,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4, overflow: 'ellipsize', minCellHeight: 16 },
    headStyles: { fillColor: [41, 78, 114] },
    columnStyles,
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: [0],
  });

  const fileName = `${safeFileName(route.name)}.pdf`;
  doc.save(fileName);
}

function buildColumnStyles(columns: PdfColumnOption[]): Record<number, object> {
  const styles: Record<number, object> = {
    0: { cellWidth: 44, halign: 'right' },
  };

  columns.forEach((column, index) => {
    const tableIndex = index + 1;
    const rawKey = `${column.id} ${column.fieldName ?? ''} ${column.label}`.toLowerCase();

    if (column.id === 'builtin:address' || rawKey.includes('address')) {
      styles[tableIndex] = { cellWidth: 210, overflow: 'linebreak', valign: 'top' };
      return;
    }

    if (rawKey.includes('note') || rawKey.includes('instruction') || rawKey.includes('detail')) {
      styles[tableIndex] = { cellWidth: 160, overflow: 'linebreak', valign: 'top' };
      return;
    }

    if (rawKey.includes('phone') || rawKey.includes('email')) {
      styles[tableIndex] = { cellWidth: 125 };
      return;
    }

    if (rawKey.includes('name') || rawKey.includes('contact')) {
      styles[tableIndex] = { cellWidth: 110 };
      return;
    }

    styles[tableIndex] = { cellWidth: 100 };
  });

  return styles;
}

function formatDistance(totalKm: number): string {
  if (!Number.isFinite(totalKm) || totalKm <= 0) return 'N/A';
  return `${totalKm.toFixed(1)} km`;
}

function formatDuration(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 'N/A';
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours === 0) return `${mins} min`;
  return `${hours}h ${mins}m`;
}
