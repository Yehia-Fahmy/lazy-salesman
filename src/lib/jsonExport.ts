import { z } from 'zod';
import { db, type GeocodeCacheRow } from '@/lib/db';
import type { Project } from '@/types';

const ColumnDefSchema = z.object({
  name: z.string(),
  role: z.enum([
    'address_street',
    'address_line2',
    'address_city',
    'address_region',
    'address_postal',
    'address_country',
    'address_full',
    'label',
    'info',
    'sensitive',
    'ignore',
  ]),
  sensitive: z.boolean(),
  inferred_type: z.enum(['string', 'number', 'email', 'phone', 'boolean']),
});

const StopSchema = z
  .object({
    id: z.string(),
    lat: z.number(),
    lng: z.number(),
    geocode_status: z.enum(['ok', 'low_confidence', 'failed']),
    geocode_confidence: z.number(),
    composed_address: z.string(),
    // Legacy field from the single-assignment data model — accepted on import,
    // ignored thereafter (route membership is derived from routes[].stop_ids[]).
    assigned_route_id: z.string().nullable().optional(),
    needs_attention: z.boolean().optional(),
    attention_reason: z.string().optional(),
    fields: z.record(z.string(), z.union([z.string(), z.number()])),
  })
  .transform(({ assigned_route_id: _ignored, ...rest }) => rest);

const DepotSchema = z.object({
  id: z.string(),
  label: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
});

const RouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  stop_ids: z.array(z.string()),
  is_loop: z.boolean(),
  start_depot_id: z.string().optional(),
  end_depot_id: z.string().optional(),
  total_minutes: z.number(),
  total_km: z.number(),
  last_calculated_at: z.string().optional(),
});

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  settings: z.object({ default_loop: z.boolean() }),
  column_schema: z.array(ColumnDefSchema),
  label_template: z.string(),
  stops: z.array(StopSchema),
  depots: z.array(DepotSchema),
  routes: z.array(RouteSchema),
});

const GeocodeRowSchema = z.object({
  composed_address: z.string(),
  lat: z.number(),
  lng: z.number(),
  confidence: z.number(),
  status: z.enum(['ok', 'low_confidence', 'failed']),
  reason: z.string().optional(),
  resolved_address: z.string().optional(),
  cached_at: z.string(),
});

const ExportSchema = z.object({
  schema_version: z.literal(1),
  exported_at: z.string(),
  project: ProjectSchema,
  geocode_cache: z.array(GeocodeRowSchema),
});

export interface ExportPayload {
  schema_version: 1;
  exported_at: string;
  project: Project;
  geocode_cache: GeocodeCacheRow[];
}

export async function buildExportPayload(project: Project): Promise<ExportPayload> {
  const addresses = new Set(project.stops.map((s) => s.composed_address));
  const cacheEntries = await db.geocodeCache.toArray();
  const slice = cacheEntries.filter((c) => addresses.has(c.composed_address));
  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    project,
    geocode_cache: slice,
  };
}

export function downloadJson(payload: ExportPayload): void {
  const safeName = payload.project.name.replace(/[^\w-]+/g, '_') || 'project';
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `lazysalesman-${safeName}-${dateStr}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  project: Project;
  geocodeCount: number;
}

export async function importJsonFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON: ${msg}`);
  }
  const result = ExportSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid export file: ${result.error.issues[0]?.message ?? 'schema mismatch'}`);
  }
  const data = result.data;
  // Persist to IDB, replacing any existing project with the same id
  await db.transaction('rw', db.projects, db.geocodeCache, async () => {
    await db.projects.put(data.project as Project);
    if (data.geocode_cache.length > 0) {
      await db.geocodeCache.bulkPut(data.geocode_cache);
    }
  });
  return { project: data.project as Project, geocodeCount: data.geocode_cache.length };
}
