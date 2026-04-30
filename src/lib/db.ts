import Dexie, { type Table } from 'dexie';
import type { ImportTemplate, Project } from '@/types';

export interface GeocodeCacheRow {
  composed_address: string;
  lat: number;
  lng: number;
  confidence: number;
  status: 'ok' | 'low_confidence' | 'failed';
  reason?: string;
  resolved_address?: string;
  cached_at: string;
}

export interface EtaCacheRow {
  key: string;
  total_minutes: number;
  total_km: number;
  geometry?: [number, number][];
  cached_at: string;
}

export class LazySalesmanDb extends Dexie {
  projects!: Table<Project, string>;
  geocodeCache!: Table<GeocodeCacheRow, string>;
  importTemplates!: Table<ImportTemplate, string>;
  etaCache!: Table<EtaCacheRow, string>;

  constructor() {
    super('lazy-salesman');
    this.version(1).stores({
      projects: 'id, name, updated_at',
      geocodeCache: 'composed_address, cached_at',
      importTemplates: 'id, header_signature, name',
      etaCache: 'key, cached_at',
    });
  }
}

export const db = new LazySalesmanDb();
