import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { buildEtaKey, getEtaForRoute } from '@/lib/etaCache';
import type { Route } from '@/types';

const DEBOUNCE_MS = 350;

/** Recalculates totals + road-following geometry for every route whose
 *  shape (stops/depots/loop) has changed since the last fetch. */
export function useAllRoutesEta(): void {
  const project = useProjectStore((s) => s.project);
  const updateRoute = useProjectStore((s) => s.updateRoute);
  const token = useUIStore((s) => s.mapboxToken);
  const lastKeysRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!project || !token) return;
    const stops = project.stops;
    const depots = project.depots;
    project.routes.forEach((route) => {
      const key = buildEtaKey(route);
      const lastKey = lastKeysRef.current.get(route.id);
      if (key === lastKey) return;
      // Skip routes that don't have enough points to draw a line.
      const usable = collectPointCount(route, depots.length) + route.stop_ids.length >= 2;
      if (!usable) return;
      lastKeysRef.current.set(route.id, key);
      void (async () => {
        try {
          const eta = await getEtaForRoute(route, stops, depots, token);
          updateRoute(route.id, {
            total_minutes: eta.total_minutes,
            total_km: eta.total_km,
            geometry: eta.geometry,
            last_calculated_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error(`Route ${route.id} ETA error:`, err);
        }
      })();
    });
  }, [project, token, updateRoute]);
}

function collectPointCount(route: Route, depotCount: number): number {
  let n = 0;
  if (route.start_depot_id && depotCount > 0) n += 1;
  if (route.end_depot_id && depotCount > 0) n += 1;
  if (route.is_loop && route.start_depot_id && depotCount > 0) n += 1;
  return n;
}

/** Recalculates the ETA for the active route on every relevant change. */
export function useActiveRouteEta(): void {
  const project = useProjectStore((s) => s.project);
  const updateRoute = useProjectStore((s) => s.updateRoute);
  const activeRouteId = useUIStore((s) => s.activeRouteId);
  const token = useUIStore((s) => s.mapboxToken);
  const lastKeyRef = useRef<string>('');
  const timerRef = useRef<number | null>(null);

  const route = project?.routes.find((r) => r.id === activeRouteId) ?? null;
  const stops = project?.stops ?? [];
  const depots = project?.depots ?? [];

  useEffect(() => {
    if (!route) {
      lastKeyRef.current = '';
      return;
    }
    if (!token) return;
    const key = buildEtaKey(route);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const eta = await getEtaForRoute(route, stops, depots, token);
          updateRoute(route.id, {
            total_minutes: eta.total_minutes,
            total_km: eta.total_km,
            geometry: eta.geometry,
            last_calculated_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error('Active route ETA error:', err);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // We only want this to fire when the route's relevant inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    route?.id,
    route?.stop_ids.join(','),
    route?.is_loop,
    route?.start_depot_id,
    route?.end_depot_id,
    token,
  ]);
}
