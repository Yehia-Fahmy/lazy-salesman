import { stopLabel } from '@/lib/labelTemplate';
import type { Project, Route, Stop } from '@/types';

export interface RouteStopRow {
  stopNumber: number;
  stop: Stop;
  label: string;
  address: string;
}

export interface PdfColumnOption {
  id: string;
  label: string;
  source: 'builtin' | 'field';
  fieldName?: string;
}

const BUILTIN_ADDRESS_COLUMN: PdfColumnOption = {
  id: 'builtin:address',
  label: 'Address',
  source: 'builtin',
};

export function buildRouteStopRows(project: Project, route: Route): RouteStopRow[] {
  const stopById = new Map(project.stops.map((stop) => [stop.id, stop]));
  return route.stop_ids
    .map((stopId, index) => {
      const stop = stopById.get(stopId);
      if (!stop) return null;
      return {
        stopNumber: index + 1,
        stop,
        label: stopLabel(stop, project.label_template),
        address: stop.composed_address,
      } satisfies RouteStopRow;
    })
    .filter((row): row is RouteStopRow => Boolean(row));
}

export function buildPdfColumnOptions(project: Project): PdfColumnOption[] {
  const options: PdfColumnOption[] = [BUILTIN_ADDRESS_COLUMN];
  const seenFieldNames = new Set<string>();

  project.column_schema.forEach((column) => {
    if (column.role === 'ignore') return;
    if (column.role.startsWith('address_')) return;
    seenFieldNames.add(column.name);
  });

  project.stops.forEach((stop) => {
    Object.keys(stop.fields).forEach((fieldName) => {
      if (fieldName.trim() === '') return;
      seenFieldNames.add(fieldName);
    });
  });

  Array.from(seenFieldNames)
    .sort((a, b) => a.localeCompare(b))
    .forEach((fieldName) => {
      options.push({
        id: `field:${fieldName}`,
        label: formatFieldLabel(fieldName),
        source: 'field',
        fieldName,
      });
    });

  return options;
}

export function defaultSelectedPdfColumns(options: PdfColumnOption[]): string[] {
  const defaults = new Set<string>(['builtin:address']);
  const preferredPattern = /(name|contact|phone|note|instruction)/i;

  options.forEach((option) => {
    if (option.source === 'field' && option.fieldName && preferredPattern.test(option.fieldName)) {
      defaults.add(option.id);
    }
  });

  return options.filter((option) => defaults.has(option.id)).map((option) => option.id);
}

export function resolvePdfCellValue(option: PdfColumnOption, row: RouteStopRow): string {
  if (option.source === 'builtin') {
    return row.address || row.label || '—';
  }

  const fieldValue = option.fieldName ? row.stop.fields[option.fieldName] : undefined;
  if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
    return '—';
  }
  return String(fieldValue);
}

function formatFieldLabel(fieldName: string): string {
  const spaced = fieldName
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return fieldName;
  return spaced
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
