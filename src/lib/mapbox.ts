import type { GeocodeStatus } from '@/types';

const GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

export type GeocodeErrorDetails =
  | { type: 'http'; status: number; statusText: string; body: string; url: string }
  | { type: 'network'; message: string; url: string }
  | { type: 'no_result'; url: string }
  | { type: 'empty_address' };

export interface GeocodeResult {
  lat: number;
  lng: number;
  confidence: number; // Mapbox `relevance` (0..1)
  status: GeocodeStatus;
  reason?: string;
  resolvedAddress: string;
  details?: GeocodeErrorDetails;
}

function redactToken(url: string): string {
  return url.replace(/access_token=[^&]+/, 'access_token=***');
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const ADDRESS_PLACE_TYPES = new Set(['address', 'poi', 'street']);

interface MapboxFeature {
  center: [number, number];
  relevance: number;
  place_type?: string[];
  place_name?: string;
}

export async function geocode(address: string, token: string): Promise<GeocodeResult> {
  if (!token) throw new Error('Mapbox token required');
  if (!address.trim()) {
    return {
      lat: 0,
      lng: 0,
      confidence: 0,
      status: 'failed',
      reason: 'Empty address — no address columns mapped or all values blank.',
      resolvedAddress: '',
      details: { type: 'empty_address' },
    };
  }
  const url = `${GEOCODE_BASE}/${encodeURIComponent(address)}.json?limit=1&access_token=${encodeURIComponent(token)}`;
  const safeUrl = redactToken(url);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return {
      lat: 0,
      lng: 0,
      confidence: 0,
      status: 'failed',
      reason: 'Network error contacting Mapbox.',
      resolvedAddress: '',
      details: {
        type: 'network',
        message: err instanceof Error ? err.message : String(err),
        url: safeUrl,
      },
    };
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      body = '';
    }
    return {
      lat: 0,
      lng: 0,
      confidence: 0,
      status: 'failed',
      reason: `Mapbox geocoding error ${res.status}`,
      resolvedAddress: '',
      details: {
        type: 'http',
        status: res.status,
        statusText: res.statusText,
        body,
        url: safeUrl,
      },
    };
  }
  const json = (await res.json()) as { features?: MapboxFeature[] };
  const feat = json.features?.[0];
  if (!feat) {
    return {
      lat: 0,
      lng: 0,
      confidence: 0,
      status: 'failed',
      reason: 'No geocoding result returned.',
      resolvedAddress: '',
      details: { type: 'no_result', url: safeUrl },
    };
  }
  const [lng, lat] = feat.center;
  const placeMatch = feat.place_type?.some((t) => ADDRESS_PLACE_TYPES.has(t)) ?? false;
  let status: GeocodeStatus = 'ok';
  let reason: string | undefined;
  if (feat.relevance < LOW_CONFIDENCE_THRESHOLD) {
    status = 'low_confidence';
    reason = `Mapbox relevance ${(feat.relevance * 100).toFixed(0)}% below ${LOW_CONFIDENCE_THRESHOLD * 100}% threshold.`;
  } else if (!placeMatch) {
    status = 'low_confidence';
    reason = `Mapbox returned a ${feat.place_type?.[0] ?? 'non-address'} match instead of a street address.`;
  }
  return {
    lat,
    lng,
    confidence: feat.relevance,
    status,
    ...(reason !== undefined ? { reason } : {}),
    resolvedAddress: feat.place_name ?? '',
  };
}

export interface ReverseResult {
  label: string;
  resolvedAddress: string;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  token: string,
): Promise<ReverseResult> {
  if (!token) throw new Error('Mapbox token required');
  const url = `${GEOCODE_BASE}/${lng},${lat}.json?limit=1&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, resolvedAddress: '' };
  }
  const json = (await res.json()) as { features?: MapboxFeature[] };
  const feat = json.features?.[0];
  if (!feat) {
    return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, resolvedAddress: '' };
  }
  const place = feat.place_name ?? '';
  const short = place.split(',').slice(0, 2).join(',').trim();
  return { label: short || place || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, resolvedAddress: place };
}

export interface DirectionsResult {
  total_minutes: number;
  total_km: number;
  geometry: [number, number][]; // [lat,lng]
}

export async function directions(
  coords: [number, number][],
  token: string,
): Promise<DirectionsResult> {
  if (!token) throw new Error('Mapbox token required');
  if (coords.length < 2) {
    return { total_minutes: 0, total_km: 0, geometry: [] };
  }
  const path = coords.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${DIRECTIONS_BASE}/${path}?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox directions error ${res.status}`);
  const json = (await res.json()) as {
    routes?: Array<{
      distance: number; // meters
      duration: number; // seconds
      geometry: { coordinates: [number, number][] };
    }>;
  };
  const route = json.routes?.[0];
  if (!route) return { total_minutes: 0, total_km: 0, geometry: [] };
  return {
    total_minutes: Math.round(route.duration / 60),
    total_km: Math.round((route.distance / 1000) * 10) / 10,
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
  };
}
