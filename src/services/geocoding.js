import { PHOTON_URL } from '../config.js';

const SERVICE_ERROR = '주소 검색 서비스를 사용할 수 없습니다.';

function coordinateLabel(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function labelFor(properties = {}, lat, lng) {
  const safeProperties = properties && typeof properties === 'object' ? properties : {};
  const street = [safeProperties.street, safeProperties.housenumber].filter(Boolean).join(' ');
  const parts = [safeProperties.name, street, safeProperties.district, safeProperties.city].filter(Boolean);
  return [...new Set(parts)].join(', ') || coordinateLabel(lat, lng);
}

function normalizeFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
    return null;
  }

  const [lng, lat] = coordinates;
  return { label: labelFor(feature.properties, lat, lng), lat, lng };
}

async function fetchJson(url, fetchImpl) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(SERVICE_ERROR);
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(SERVICE_ERROR);
    }
    return data;
  } catch {
    throw new Error(SERVICE_ERROR);
  }
}

export async function searchPlaces(query, fetchImpl = fetch) {
  if (query.trim().length < 2) {
    return [];
  }

  const url = new URL(`${PHOTON_URL}/api/`);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', '5');
  const data = await fetchJson(url, fetchImpl);
  const features = Array.isArray(data.features) ? data.features : [];
  return features.map(normalizeFeature).filter(Boolean);
}

export async function reversePlace({ lat, lng }, fetchImpl = fetch) {
  const url = new URL(`${PHOTON_URL}/reverse`);
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lng);
  const data = await fetchJson(url, fetchImpl);
  const feature = Array.isArray(data.features) ? normalizeFeature(data.features[0]) : null;

  return feature ?? { label: coordinateLabel(lat, lng), lat, lng };
}
