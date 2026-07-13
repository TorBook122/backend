type NominatimResult = {
  lat: string;
  lon: string;
};

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org';
const DEFAULT_USER_AGENT = 'KvaTor/1.0 (slotinsystem@gmail.com)';

function getNominatimBaseUrl(): string {
  return process.env.NOMINATIM_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function getNominatimUserAgent(): string {
  return process.env.NOMINATIM_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

function buildGeocodeQuery(address: string): string {
  const trimmed = address.trim();
  if (/israel|ישראל/i.test(trimmed)) return trimmed;
  return `${trimmed}, Israel`;
}

export async function geocodeAddress(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const url = new URL('/search', getNominatimBaseUrl());
  url.searchParams.set('q', buildGeocodeQuery(trimmed));
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'il');

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': getNominatimUserAgent(),
  };

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    console.warn(`[nominatim] geocode failed (${response.status}) for address: ${trimmed}`);
    return null;
  }

  const results = (await response.json()) as NominatimResult[];
  const match = results[0];
  if (!match) return null;

  const latitude = Number.parseFloat(match.lat);
  const longitude = Number.parseFloat(match.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
}

export async function resolveBusinessCoordinates(
  address: string | undefined,
): Promise<{ latitude: number | null; longitude: number | null } | undefined> {
  if (address === undefined) return undefined;

  const trimmed = address.trim();
  if (!trimmed) return { latitude: null, longitude: null };

  const coords = await geocodeAddress(trimmed);
  if (!coords) return { latitude: null, longitude: null };

  return coords;
}
