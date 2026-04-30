import type { Route, Stop } from '@/types';

/** Returns the IDs of every route that currently includes this stop. */
export function getStopRouteIds(stopId: string, routes: Route[]): string[] {
  return routes.filter((r) => r.stop_ids.includes(stopId)).map((r) => r.id);
}

/** Returns the actual route records that include this stop. */
export function getStopRoutes(stopId: string, routes: Route[]): Route[] {
  return routes.filter((r) => r.stop_ids.includes(stopId));
}

export function isStopUnassigned(stopId: string, routes: Route[]): boolean {
  return !routes.some((r) => r.stop_ids.includes(stopId));
}

export function countUnassigned(stops: Stop[], routes: Route[]): number {
  return stops.filter((s) => isStopUnassigned(s.id, routes)).length;
}

/** Whether the stop is visible given current per-route filter state. */
export function isStopVisible(
  stopId: string,
  routes: Route[],
  visibleRoutes: Set<string>,
): boolean {
  const ownerRouteIds = getStopRouteIds(stopId, routes);
  if (ownerRouteIds.length === 0) return visibleRoutes.has('unassigned');
  return ownerRouteIds.some((id) => visibleRoutes.has(id));
}
