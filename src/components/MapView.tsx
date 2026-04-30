import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { getStopRouteIds } from '@/lib/stopRoutes';
import type { Depot, Route, Stop, ThemeTokens } from '@/types';

interface MapViewProps {
  theme: ThemeTokens;
  stops: Stop[];
  routes: Route[];
  depots: Depot[];
  visibleRoutes: Set<string>;
  activeRoute: Route | null;
  popupStopId: string | null;
  placementMode?: boolean;
  onPinClick: (stopId: string) => void;
  onMapClick: () => void;
  onPlacePoint?: (point: { lat: number; lng: number }) => void;
}

export function MapView({
  theme,
  stops,
  routes,
  depots,
  visibleRoutes,
  activeRoute,
  popupStopId,
  placementMode = false,
  onPinClick,
  onMapClick,
  onPlacePoint,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const stopMarkers = useRef<Record<string, L.Marker>>({});
  const depotMarkers = useRef<L.Marker[]>([]);
  const polylines = useRef<L.Polyline[]>([]);
  const onPinClickRef = useRef(onPinClick);
  const onMapClickRef = useRef(onMapClick);
  const onPlacePointRef = useRef(onPlacePoint);
  const placementRef = useRef(placementMode);
  onPinClickRef.current = onPinClick;
  onMapClickRef.current = onMapClick;
  onPlacePointRef.current = onPlacePoint;
  placementRef.current = placementMode;

  // Init map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [43.42, -80.47],
      zoom: 12,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    map.on('click', (e) => {
      if (placementRef.current && onPlacePointRef.current) {
        onPlacePointRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
        return;
      }
      onMapClickRef.current();
    });

    const panHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ lat: number; lng: number }>).detail;
      map.setView([detail.lat, detail.lng], Math.max(map.getZoom(), 14), { animate: true });
    };
    window.addEventListener('ls:panTo', panHandler);

    mapRef.current = map;
    return () => {
      window.removeEventListener('ls:panTo', panHandler);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(stopMarkers.current).forEach((m) => m.remove());
    stopMarkers.current = {};

    const activeIds = activeRoute?.stop_ids ?? [];

    stops.forEach((stop) => {
      const ownerRouteIds = getStopRouteIds(stop.id, routes);
      const ownerRoutes = ownerRouteIds
        .map((id) => routes.find((r) => r.id === id))
        .filter((r): r is Route => Boolean(r));
      const colors = ownerRoutes.length > 0
        ? ownerRoutes.map((r) => r.color)
        : ['#71717A'];
      const visible = ownerRouteIds.length === 0
        ? visibleRoutes.has('unassigned')
        : ownerRouteIds.some((id) => visibleRoutes.has(id));
      const opacity = visible ? 1 : 0.2;
      const seq = activeIds.indexOf(stop.id);
      const seqNumber = seq >= 0 ? seq + 1 : null;
      const isOpen = stop.id === popupStopId;
      const isAttention = Boolean(stop.needs_attention);

      const marker = L.marker([stop.lat, stop.lng], {
        icon: createStopIcon({ colors, opacity, seqNumber, isAttention, isOpen }),
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onPinClickRef.current(stop.id);
      });
      marker.addTo(map);
      stopMarkers.current[stop.id] = marker;
    });
  }, [stops, routes, visibleRoutes, activeRoute, popupStopId]);

  // Render depot markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    depotMarkers.current.forEach((m) => m.remove());
    depotMarkers.current = [];
    depots.forEach((depot) => {
      const m = L.marker([depot.lat, depot.lng], { icon: createDepotIcon() });
      m.bindTooltip(depot.label, { className: 'ls-tooltip' });
      m.addTo(map);
      depotMarkers.current.push(m);
    });
  }, [depots]);

  // Render polylines
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    polylines.current.forEach((p) => p.remove());
    polylines.current = [];

    const depotPoint = (id?: string): [number, number] | null => {
      if (!id) return null;
      const d = depots.find((x) => x.id === id);
      return d ? [d.lat, d.lng] : null;
    };

    const straightLinePoints = (route: Route): [number, number][] => {
      const stopPoints = route.stop_ids
        .map((id) => stops.find((s) => s.id === id))
        .filter((s): s is Stop => Boolean(s))
        .map((s) => [s.lat, s.lng] as [number, number]);
      const start = depotPoint(route.start_depot_id);
      const end = depotPoint(route.end_depot_id);
      const points: [number, number][] = [];
      if (start) points.push(start);
      points.push(...stopPoints);
      if (end) points.push(end);
      if (route.is_loop && start) points.push(start);
      return points;
    };

    routes.forEach((route) => {
      if (!visibleRoutes.has(route.id)) return;
      // Prefer Mapbox-routed geometry; fall back to straight lines while ETA is loading.
      const useRouted = route.geometry && route.geometry.length >= 2;
      const points = useRouted ? route.geometry! : straightLinePoints(route);
      if (points.length < 2) return;
      const poly = L.polyline(points, {
        color: route.color,
        weight: 3,
        opacity: 0.75,
        ...(useRouted ? {} : { dashArray: '4 6' }), // dashed = unrouted/loading
      }).addTo(map);
      polylines.current.push(poly);
    });

    if (activeRoute && activeRoute.stop_ids.length >= 1) {
      const useRouted = activeRoute.geometry && activeRoute.geometry.length >= 2;
      const points = useRouted ? activeRoute.geometry! : straightLinePoints(activeRoute);
      if (points.length >= 2) {
        const preview = L.polyline(points, {
          color: activeRoute.color,
          weight: 2.5,
          opacity: 0.85,
          dashArray: '7 5',
        }).addTo(map);
        polylines.current.push(preview);
      }
    }
  }, [routes, stops, depots, visibleRoutes, activeRoute]);

  // Auto-fit when stops first appear
  const autoFitDoneRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (autoFitDoneRef.current) return;
    if (stops.length === 0 && depots.length === 0) return;
    const points: [number, number][] = [
      ...stops.map((s) => [s.lat, s.lng] as [number, number]),
      ...depots.map((d) => [d.lat, d.lng] as [number, number]),
    ];
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points).pad(0.2));
    autoFitDoneRef.current = true;
  }, [stops, depots]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: theme.mapBg,
        cursor: placementMode ? 'crosshair' : undefined,
      }}
    >
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}

interface StopIconArgs {
  colors: string[];
  opacity: number;
  seqNumber: number | null;
  isAttention: boolean;
  isOpen: boolean;
}

function createStopIcon({ colors, opacity, seqNumber, isAttention, isOpen }: StopIconArgs): L.DivIcon {
  const size = seqNumber ? 28 : 22;
  const half = size / 2;
  const pad = isOpen ? 8 : 4;
  const total = size + pad * 2;
  const cx = total / 2;
  const cy = total / 2;

  const openRing = isOpen
    ? `<circle cx="${cx}" cy="${cy}" r="${half + 3}" fill="none" stroke="#2563EB" stroke-width="2" opacity="0.4"/>`
    : '';
  const attentionRing = isAttention
    ? `<circle cx="${cx}" cy="${cy}" r="${half - 1}" fill="none" stroke="#DC2626" stroke-width="1.5" stroke-dasharray="3 2" opacity="${opacity}"/>`
    : '';
  const numLabel = seqNumber
    ? `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-size="11" font-weight="700" font-family="Inter,sans-serif" fill="white" opacity="${opacity}">${seqNumber}</text>`
    : '';

  const fill =
    colors.length <= 1
      ? `<circle cx="${cx}" cy="${cy}" r="${half}" fill="${colors[0] ?? '#71717A'}" stroke="white" stroke-width="2" opacity="${opacity}"/>`
      : pieSlices(cx, cy, half, colors, opacity);

  const html = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">
      ${openRing}
      ${fill}
      ${attentionRing}
      ${numLabel}
    </svg>
  `;
  return L.divIcon({
    html,
    className: '',
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
  });
}

function pieSlices(cx: number, cy: number, r: number, colors: string[], opacity: number): string {
  const n = colors.length;
  const step = (Math.PI * 2) / n;
  // Start at the top (12 o'clock) and go clockwise.
  let startAngle = -Math.PI / 2;
  const slices: string[] = [];
  for (let i = 0; i < n; i++) {
    const endAngle = startAngle + step;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = step > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    slices.push(`<path d="${d}" fill="${colors[i] ?? '#71717A'}" opacity="${opacity}"/>`);
    startAngle = endAngle;
  }
  // Outer white border for legibility
  slices.push(
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="white" stroke-width="2" opacity="${opacity}"/>`,
  );
  return slices.join('');
}

function createDepotIcon(): L.DivIcon {
  const html = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <rect x="3" y="3" width="16" height="16" rx="2" fill="#18181B" transform="rotate(45 11 11)"/>
    </svg>
  `;
  return L.divIcon({ html, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
}
