import { ARCGIS_GEOCODER_URL, DEFAULT_CENTER, PHOTON_URL } from '../config.js';

const SERVICE_ERROR = '주소 검색 서비스를 사용할 수 없습니다.';

function coordinateLabel(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180;
}

function propertyValue(value) {
  return typeof value === 'string' || typeof value === 'number' ? value : null;
}

function labelFor(properties = {}, lat, lng) {
  const safeProperties = properties && typeof properties === 'object' ? properties : {};
  const street = [safeProperties.street, safeProperties.housenumber]
    .map(propertyValue)
    .filter((value) => value !== null && value !== '')
    .join(' ');
  const parts = [safeProperties.name, street, safeProperties.district, safeProperties.city]
    .map(propertyValue)
    .filter((value) => value !== null && value !== '');
  return [...new Set(parts)].join(', ') || coordinateLabel(lat, lng);
}

function normalizeFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) {
    return null;
  }

  const [lng, lat] = coordinates;
  if (!isValidCoordinate(lat, lng)) {
    return null;
  }

  return { label: labelFor(feature.properties, lat, lng), lat, lng };
}

function normalizeArcGISCandidate(candidate) {
  const lat = candidate?.location?.y;
  const lng = candidate?.location?.x;
  if (!isValidCoordinate(lat, lng)) {
    return null;
  }

  return { label: candidate.address || coordinateLabel(lat, lng), lat, lng };
}

function isKoreanAddressQuery(query) {
  return /[가-힣]/.test(query) && /\d/.test(query) && /(동|로|길|번길|읍|면|리|시|군|구)/.test(query);
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

async function searchPhoton(query, fetchImpl) {
  const url = new URL(`${PHOTON_URL}/api/`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('lang', 'default');
  url.searchParams.set('lat', DEFAULT_CENTER[0]);
  url.searchParams.set('lon', DEFAULT_CENTER[1]);
  const data = await fetchJson(url, fetchImpl);
  const features = Array.isArray(data.features) ? data.features : [];
  return features.map(normalizeFeature).filter(Boolean);
}

async function searchArcGIS(query, fetchImpl) {
  const url = new URL(ARCGIS_GEOCODER_URL);
  url.searchParams.set('SingleLine', query);
  url.searchParams.set('f', 'json');
  url.searchParams.set('maxLocations', '5');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('forStorage', 'false');
  url.searchParams.set('countryCode', 'KOR');
  const data = await fetchJson(url, fetchImpl);
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  return candidates.map(normalizeArcGISCandidate).filter(Boolean);
}

export async function searchPlaces(query, fetchImpl = fetch) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  if (isKoreanAddressQuery(normalizedQuery)) {
    try {
      const addressResults = await searchArcGIS(normalizedQuery, fetchImpl);
      if (addressResults.length > 0) {
        return addressResults;
      }
    } catch {
      // Fall back to Photon when the address geocoder is unavailable.
    }
  }

  return searchPhoton(normalizedQuery, fetchImpl);
}

export async function reversePlace({ lat, lng } = {}, fetchImpl = fetch) {
  if (!isValidCoordinate(lat, lng)) {
    throw new Error(SERVICE_ERROR);
  }

  const url = new URL(`${PHOTON_URL}/reverse`);
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lng);
  url.searchParams.set('lang', 'default');
  const data = await fetchJson(url, fetchImpl);
  const feature = Array.isArray(data.features) ? normalizeFeature(data.features[0]) : null;

  return feature ?? { label: coordinateLabel(lat, lng), lat, lng };
}
