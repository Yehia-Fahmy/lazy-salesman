import { stopLabel } from '@/lib/labelTemplate';
import type { Depot, Route, Stop } from '@/types';

export interface RoutePoint {
  lat: number;
  lng: number;
  label: string;
}

const MAX_POINTS_PER_URL = 10; // origin + destination + up to 8 waypoints

export function collectRoutePoints(
  route: Route,
  stops: Stop[],
  depots: Depot[],
  labelTemplate: string,
): RoutePoint[] {
  const start = route.start_depot_id ? depots.find((d) => d.id === route.start_depot_id) : undefined;
  const end = route.end_depot_id ? depots.find((d) => d.id === route.end_depot_id) : undefined;
  const stopPoints: RoutePoint[] = route.stop_ids
    .map((id) => stops.find((s) => s.id === id))
    .filter((s): s is Stop => Boolean(s))
    .map((s) => ({ lat: s.lat, lng: s.lng, label: stopLabel(s, labelTemplate) }));

  const points: RoutePoint[] = [];
  if (start) points.push({ lat: start.lat, lng: start.lng, label: start.label });
  points.push(...stopPoints);
  if (end) points.push({ lat: end.lat, lng: end.lng, label: end.label });
  if (route.is_loop && start) {
    points.push({ lat: start.lat, lng: start.lng, label: `${start.label} (return)` });
  }
  return points;
}

export interface DeepLinkPart {
  index: number;
  total: number;
  url: string;
  pointCount: number;
}

export function buildGoogleMapsLinks(points: RoutePoint[]): DeepLinkPart[] {
  if (points.length < 2) return [];
  const parts: RoutePoint[][] = chunkOverlapping(points, MAX_POINTS_PER_URL);
  return parts.map((chunk, i) => ({
    index: i + 1,
    total: parts.length,
    url: oneLink(chunk),
    pointCount: chunk.length,
  }));
}

function chunkOverlapping(points: RoutePoint[], chunkSize: number): RoutePoint[][] {
  if (points.length <= chunkSize) return [points];
  const out: RoutePoint[][] = [];
  let i = 0;
  while (i < points.length) {
    const end = Math.min(i + chunkSize, points.length);
    const chunk = points.slice(i, end);
    out.push(chunk);
    if (end === points.length) break;
    // next chunk starts where previous ended (overlap by one)
    i = end - 1;
  }
  return out;
}

function oneLink(chunk: RoutePoint[]): string {
  if (chunk.length < 2) return '';
  const first = chunk[0]!;
  const last = chunk[chunk.length - 1]!;
  const middle = chunk.slice(1, -1);
  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('travelmode', 'driving');
  params.set('origin', `${first.lat},${first.lng}`);
  params.set('destination', `${last.lat},${last.lng}`);
  if (middle.length > 0) {
    params.set('waypoints', middle.map((p) => `${p.lat},${p.lng}`).join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildPlainText(routeName: string, points: RoutePoint[], links: DeepLinkPart[]): string {
  const lines: string[] = [];
  lines.push(`Route: ${routeName}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`${points.length} point${points.length === 1 ? '' : 's'} total`);
  lines.push('');
  lines.push('Stops in order:');
  points.forEach((p, i) => {
    lines.push(`  ${i + 1}. ${p.label}  (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`);
  });
  lines.push('');
  if (links.length > 0) {
    lines.push('Google Maps links:');
    links.forEach((l) => {
      lines.push(`  Part ${l.index} of ${l.total} (${l.pointCount} points): ${l.url}`);
    });
  }
  return lines.join('\n');
}

export function safeFileName(s: string): string {
  return (s || 'untitled').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'untitled';
}
