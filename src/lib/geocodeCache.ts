import { db } from '@/lib/db';
import { geocode, type GeocodeResult } from '@/lib/mapbox';

export async function geocodeWithCache(
  address: string,
  token: string,
): Promise<GeocodeResult> {
  const cached = await db.geocodeCache.get(address);
  if (cached) {
    return {
      lat: cached.lat,
      lng: cached.lng,
      confidence: cached.confidence,
      status: cached.status,
      ...(cached.reason !== undefined ? { reason: cached.reason } : {}),
      resolvedAddress: cached.resolved_address ?? '',
    };
  }
  const result = await geocode(address, token);
  await db.geocodeCache.put({
    composed_address: address,
    lat: result.lat,
    lng: result.lng,
    confidence: result.confidence,
    status: result.status,
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
    resolved_address: result.resolvedAddress,
    cached_at: new Date().toISOString(),
  });
  return result;
}
