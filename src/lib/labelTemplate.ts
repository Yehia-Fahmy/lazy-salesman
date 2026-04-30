import type { ColumnDef, Stop } from '@/types';

const PLACEHOLDER = /\{([^}]+)\}/g;

export function renderLabel(
  template: string,
  row: Record<string, string | number>,
  fallback?: string,
): string {
  if (!template) return fallback ?? '';
  let used = false;
  const out = template.replace(PLACEHOLDER, (_match, key: string) => {
    const v = row[key];
    if (v === undefined || v === '') return `{${key}}`;
    used = true;
    return String(v);
  });
  if (!used && (!template || !template.match(PLACEHOLDER))) {
    return fallback ?? template;
  }
  return out.trim() || fallback || '';
}

export function defaultLabelTemplate(schema: ColumnDef[]): string {
  const labelCols = schema.filter((c) => c.role === 'label');
  if (labelCols.length === 0) return '';
  return labelCols.map((c) => `{${c.name}}`).join(' ');
}

export function stopLabel(stop: Stop, template: string): string {
  return renderLabel(template, stop.fields, stop.composed_address);
}
