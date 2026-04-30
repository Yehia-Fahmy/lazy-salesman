import Papa from 'papaparse';
import type { ColumnDef, ColumnRole, InferredType, Stop } from '@/types';

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  duplicatesRenamed: string[];
}

export function parseCsv(file: File | string): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file as File, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => stripBom(h).trim(),
      complete: (res) => {
        const originalHeaders = res.meta.fields ?? [];
        const { headers, duplicatesRenamed, indexMap } = renameDuplicates(originalHeaders);
        const rows = (res.data || []).map((raw) => {
          const out: Record<string, string> = {};
          for (let i = 0; i < headers.length; i++) {
            const newHeader = headers[i] ?? '';
            const originalHeader = originalHeaders[indexMap[i] ?? i] ?? newHeader;
            const v = raw[originalHeader];
            out[newHeader] = (v ?? '').toString();
          }
          return out;
        });
        resolve({ headers, rows, duplicatesRenamed });
      },
      error: (err) => reject(err),
    });
  });
}

function stripBom(s: string): string {
  return s.replace(/^﻿/, '');
}

function renameDuplicates(headers: string[]): {
  headers: string[];
  duplicatesRenamed: string[];
  indexMap: number[];
} {
  const seen = new Map<string, number>();
  const out: string[] = [];
  const renamed: string[] = [];
  const indexMap: number[] = [];
  headers.forEach((h, i) => {
    const count = seen.get(h) ?? 0;
    if (count === 0) {
      seen.set(h, 1);
      out.push(h);
    } else {
      seen.set(h, count + 1);
      const newName = `${h} (${count + 1})`;
      out.push(newName);
      renamed.push(newName);
    }
    indexMap.push(i);
  });
  return { headers: out, duplicatesRenamed: renamed, indexMap };
}

export function headerSignature(headers: string[]): string {
  return [...headers].sort().join('|');
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RX = /^[\d\s().+\-]{7,}$/;

export function autoDetectRoles(headers: string[], rows: Record<string, string>[]): ColumnDef[] {
  return headers.map((name): ColumnDef => {
    const lower = name.toLowerCase();
    const sample = rows.slice(0, Math.min(rows.length, 50)).map((r) => r[name] ?? '');
    const inferred = inferType(sample);

    // Header heuristics
    if (/^id$|submission.?id|uuid/i.test(name)) {
      return { name, role: 'ignore', sensitive: false, inferred_type: inferred };
    }
    if (/street|address.*1?$/i.test(lower) && !/line.?2/.test(lower)) {
      return { name, role: 'address_street', sensitive: false, inferred_type: inferred };
    }
    if (/line.?2|apt|unit|suite/i.test(lower)) {
      return { name, role: 'address_line2', sensitive: false, inferred_type: inferred };
    }
    if (/city|town/i.test(lower)) {
      return { name, role: 'address_city', sensitive: false, inferred_type: inferred };
    }
    if (/state|province|region/i.test(lower)) {
      return { name, role: 'address_region', sensitive: false, inferred_type: inferred };
    }
    if (/zip|postal/i.test(lower)) {
      return { name, role: 'address_postal', sensitive: false, inferred_type: inferred };
    }
    if (/country/i.test(lower)) {
      return { name, role: 'address_country', sensitive: false, inferred_type: inferred };
    }
    if (/email|e-?mail/i.test(lower) || sample.some((v) => EMAIL_RX.test(v))) {
      return { name, role: 'sensitive', sensitive: true, inferred_type: 'email' };
    }
    if (/phone|tel|mobile|cell/i.test(lower) || sample.some((v) => PHONE_RX.test(v))) {
      return { name, role: 'sensitive', sensitive: true, inferred_type: 'phone' };
    }
    if (/name|first.?name|last.?name/i.test(lower)) {
      return { name, role: 'label', sensitive: true, inferred_type: inferred };
    }

    // Boilerplate (≥200 char repeated value) → ignore
    const longVals = sample.filter((v) => v.length > 200);
    if (longVals.length >= 2 && new Set(longVals).size === 1) {
      return { name, role: 'ignore', sensitive: false, inferred_type: inferred };
    }

    return { name, role: 'info', sensitive: false, inferred_type: inferred };
  });
}

function inferType(samples: string[]): InferredType {
  const non = samples.filter((s) => s !== '');
  if (non.length === 0) return 'string';
  if (non.every((s) => EMAIL_RX.test(s))) return 'email';
  if (non.every((s) => PHONE_RX.test(s))) return 'phone';
  if (non.every((s) => /^-?\d+(\.\d+)?$/.test(s))) return 'number';
  if (non.every((s) => /^(true|false|yes|no)$/i.test(s))) return 'boolean';
  return 'string';
}

const ADDRESS_ROLE_ORDER: ColumnRole[] = [
  'address_full',
  'address_street',
  'address_line2',
  'address_city',
  'address_region',
  'address_postal',
  'address_country',
];

export function buildComposedAddress(row: Record<string, string>, schema: ColumnDef[]): string {
  // If any column is address_full, prefer it; never include sensitive fields.
  const fullCol = schema.find((c) => c.role === 'address_full');
  if (fullCol) {
    const v = (row[fullCol.name] ?? '').trim();
    if (v) return v;
  }
  const parts: string[] = [];
  for (const role of ADDRESS_ROLE_ORDER) {
    if (role === 'address_full') continue;
    const col = schema.find((c) => c.role === role);
    if (!col || col.sensitive) continue;
    const v = (row[col.name] ?? '').trim();
    if (v) parts.push(v);
  }
  return parts.join(', ');
}

export function makeStopFromRow(
  row: Record<string, string>,
  schema: ColumnDef[],
  geo: { lat: number; lng: number; status: Stop['geocode_status']; confidence: number; reason?: string },
  id: string,
): Stop {
  const fields: Record<string, string | number> = {};
  for (const col of schema) {
    if (col.role === 'ignore') continue;
    const v = row[col.name];
    if (v === undefined) continue;
    fields[col.name] = v;
  }
  const composed = buildComposedAddress(row, schema);
  const stop: Stop = {
    id,
    lat: geo.lat,
    lng: geo.lng,
    geocode_status: geo.status,
    geocode_confidence: geo.confidence,
    composed_address: composed,
    fields,
  };
  if (geo.status !== 'ok') {
    stop.needs_attention = true;
    if (geo.reason) stop.attention_reason = geo.reason;
  }
  return stop;
}
