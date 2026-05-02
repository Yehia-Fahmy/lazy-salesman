import { db } from '@/lib/db';
import { geocode, type GeocodeResult } from '@/lib/mapbox';

export async function geocodeWithCache(
  address: string,
  token: string,
): Promise<GeocodeResult> {
  const cached = await db.geocodeCache.get(address);
  // Treat failed cache entries as misses: error responses may be transient
  // (token expired, rate-limited, network blip) and should always be retried,
  // and we want every visible failure to carry fresh `details` for "View details".
  if (cached && cached.status !== 'failed') {
    return {
      lat: cached.lat,
      lng: cached.lng,
      confidence: cached.confidence,
      status: cached.status,
      ...(cached.reason !== undefined ? { reason: cached.reason } : {}),
      resolvedAddress: cached.resolved_address ?? '',
      ...(cached.details !== undefined ? { details: cached.details } : {}),
    };
  }
  const result = await geocode(address, token);
  if (result.status !== 'failed') {
    await db.geocodeCache.put({
      composed_address: address,
      lat: result.lat,
      lng: result.lng,
      confidence: result.confidence,
      status: result.status,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      resolved_address: result.resolvedAddress,
      ...(result.details !== undefined ? { details: result.details } : {}),
      cached_at: new Date().toISOString(),
    });
  }
  return result;
}
