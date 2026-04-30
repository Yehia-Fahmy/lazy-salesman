export type ColumnRole =
  | 'address_street'
  | 'address_line2'
  | 'address_city'
  | 'address_region'
  | 'address_postal'
  | 'address_country'
  | 'address_full'
  | 'label'
  | 'info'
  | 'sensitive'
  | 'ignore';

export type InferredType = 'string' | 'number' | 'email' | 'phone' | 'boolean';

export interface ColumnDef {
  name: string;
  role: ColumnRole;
  sensitive: boolean;
  inferred_type: InferredType;
}

export type GeocodeStatus = 'ok' | 'low_confidence' | 'failed';

export interface Stop {
  id: string;
  lat: number;
  lng: number;
  geocode_status: GeocodeStatus;
  geocode_confidence: number;
  composed_address: string;
  needs_attention?: boolean;
  attention_reason?: string;
  fields: Record<string, string | number>;
}

export interface Depot {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Route {
  id: string;
  name: string;
  color: string;
  stop_ids: string[];
  is_loop: boolean;
  start_depot_id?: string;
  end_depot_id?: string;
  total_minutes: number;
  total_km: number;
  /** Road-following geometry from Mapbox Directions, [lat, lng] pairs. */
  geometry?: [number, number][];
  last_calculated_at?: string;
}

export interface ProjectSettings {
  default_loop: boolean;
}

export interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  settings: ProjectSettings;
  column_schema: ColumnDef[];
  label_template: string;
  stops: Stop[];
  depots: Depot[];
  routes: Route[];
}

export interface ImportTemplate {
  id: string;
  name: string;
  created_at: string;
  header_signature: string;
  column_schema: ColumnDef[];
  label_template: string;
}

export type ThemeName = 'spec' | 'warm' | 'dark';

export interface ThemeTokens {
  name: string;
  chrome: string;
  sidebar: string;
  mapBg: string;
  inputBg: string;
  popupBg: string;
  border: string;
  hoverBg: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
}
