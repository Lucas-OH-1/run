import { PHOTON_URL } from '../config.js';

const SERVICE_ERROR = '주소 검색 서비스를 사용할 수 없습니다.';

function labelFor(properties = {}) {
  const street = [properties.street, properties.housenumber].filter(Boolean).join(' ');
  const parts = [properties.name, street, properties.district, properties.city].filter(Boolean);
  return [...new Set(parts)].join(', ');
}

function normalizeFeature(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  return { label: labelFor(feature.properties), lat, lng };
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(SERVICE_ERROR);
  }
  return response.json();
}

export async function searchPlaces(query, fetchImpl = fetch) {
  if (query.trim().length < 2) {
    return [];
  }

  const url = new URL(`${PHOTON_URL}/api/`);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', '5');
  const data = await fetchJson(url, fetchImpl);
  return (data.features ?? []).map(normalizeFeature);
}

export async function reversePlace({ lat, lng }, fetchImpl = fetch) {
  const url = new URL(`${PHOTON_URL}/reverse`);
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lng);
  const data = await fetchJson(url, fetchImpl);
  const feature = data.features?.[0];

  if (!feature) {
    return { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
  }
  return normalizeFeature(feature);
}
