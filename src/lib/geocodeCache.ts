import { db } from '@/lib/db';
import { geocode, type GeocodeResult } from '@/lib/mapbox';

export interface GeocodeWithCacheOptions {
  // Skip the cache read and always hit the network. Used by manual retries so
  // the user can re-attempt a cached low-confidence row.
  bypassCache?: boolean;
  // Skip the cache write on success. Used by manual retries so a one-off
  // re-attempt does not poison the cache for that address.
  noCache?: boolean;
}

export async function geocodeWithCache(
  address: string,
  token: string,
  options: GeocodeWithCacheOptions = {},
): Promise<GeocodeResult> {
  if (!options.bypassCache) {
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
  }
  const result = await geocode(address, token);
  if (!options.noCache && result.status !== 'failed') {
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
