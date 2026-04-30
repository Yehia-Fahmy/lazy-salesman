import { db } from '@/lib/db';
import { directions, type DirectionsResult } from '@/lib/mapbox';
import type { Depot, Route, Stop } from '@/types';

export function buildEtaKey(
  route: Pick<Route, 'stop_ids' | 'is_loop' | 'start_depot_id' | 'end_depot_id'>,
): string {
  return JSON.stringify({
    s: route.stop_ids,
    l: route.is_loop,
    sd: route.start_depot_id ?? null,
    ed: route.end_depot_id ?? null,
  });
}

export interface EtaPayload {
  total_minutes: number;
  total_km: number;
  geometry: [number, number][];
  cached: boolean;
}

export async function getEtaForRoute(
  route: Route,
  stops: Stop[],
  depots: Depot[],
  token: string,
): Promise<EtaPayload> {
  const points = collectPoints(route, stops, depots);
  if (points.length < 2) {
    return { total_minutes: 0, total_km: 0, geometry: [], cached: false };
  }
  const key = buildEtaKey(route);
  const cached = await db.etaCache.get(key);
  if (cached && cached.geometry && cached.geometry.length > 0) {
    return {
      total_minutes: cached.total_minutes,
      total_km: cached.total_km,
      geometry: cached.geometry,
      cached: true,
    };
  }
  const result: DirectionsResult = await directions(points, token);
  await db.etaCache.put({
    key,
    total_minutes: result.total_minutes,
    total_km: result.total_km,
    geometry: result.geometry,
    cached_at: new Date().toISOString(),
  });
  return {
    total_minutes: result.total_minutes,
    total_km: result.total_km,
    geometry: result.geometry,
    cached: false,
  };
}

function collectPoints(route: Route, stops: Stop[], depots: Depot[]): [number, number][] {
  const start = route.start_depot_id ? depots.find((d) => d.id === route.start_depot_id) : undefined;
  const end = route.end_depot_id ? depots.find((d) => d.id === route.end_depot_id) : undefined;
  const stopPoints = route.stop_ids
    .map((id) => stops.find((s) => s.id === id))
    .filter((s): s is Stop => Boolean(s))
    .map((s) => [s.lat, s.lng] as [number, number]);
  const points: [number, number][] = [];
  if (start) points.push([start.lat, start.lng]);
  points.push(...stopPoints);
  if (end) points.push([end.lat, end.lng]);
  if (route.is_loop && start) points.push([start.lat, start.lng]);
  return points;
}
