import { OVERPASS_URL } from '../config.js';

const CORRIDOR_ERROR = '탄천자전거도로를 찾지 못했습니다. 지도에서 직접 지점을 선택해주세요.';
const MAX_ENTRY_DISTANCE_M = 5000;
const SAMPLE_DISTANCE_M = 1500;

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= -90 && point.lat <= 90
    && point.lng >= -180 && point.lng <= 180;
}

function distanceM(a, b) {
  const latitude = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const lat = (b.lat - a.lat) * 111320;
  const lng = (b.lng - a.lng) * 111320 * Math.cos(latitude);
  return Math.hypot(lat, lng);
}

function normalizeGeometry(geometry = []) {
  const points = geometry
    .map(point => ({ lat: Number(point.lat), lng: Number(point.lon) }))
    .filter(validPoint);
  return points.filter((point, index) => index === 0 || distanceM(point, points[index - 1]) > 0.5);
}

function joinPoints(target, points) {
  for (const point of points) {
    if (!target.length || distanceM(target.at(-1), point) > 0.5) {
      target.push(point);
    }
  }
}

function project(point, start, end) {
  const dx = end.lng - start.lng;
  const dy = end.lat - start.lat;
  const lengthSquared = dx * dx + dy * dy || 1;
  return ((point.lng - start.lng) * dx + (point.lat - start.lat) * dy) / lengthSquared;
}

function buildCorridorPoints(ways, start, end) {
  const points = [];
  ways.forEach(way => joinPoints(points, way));
  const relevant = points.filter(point => project(point, start, end) >= -0.2 && project(point, start, end) <= 1.2);
  return relevant.sort((a, b) => project(a, start, end) - project(b, start, end));
}

function sampleBetween(points, startIndex, endIndex) {
  const ordered = startIndex <= endIndex ? points.slice(startIndex, endIndex + 1) : points.slice(endIndex, startIndex + 1).reverse();
  if (ordered.length < 2) {
    return ordered;
  }

  const sampled = [ordered[0]];
  let accumulated = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    accumulated += distanceM(ordered[index - 1], ordered[index]);
    if (accumulated >= SAMPLE_DISTANCE_M || index === ordered.length - 1) {
      sampled.push(ordered[index]);
      accumulated = 0;
    }
  }
  return sampled;
}

function queryFor(point) {
  return `[out:json][timeout:20];
(
  way["highway"="cycleway"]["name"~"탄천"](around:10000,${point.lat},${point.lng});
  way["route"="bicycle"]["name"~"탄천"](around:10000,${point.lat},${point.lng});
  way["highway"="cycleway"]["route_bicycle_lcn"](around:10000,${point.lat},${point.lng});
);
out geom;`;
}

export async function findTancheonCorridor(start, end, fetchImpl = fetch) {
  if (!validPoint(start) || !validPoint(end)) {
    throw new Error(CORRIDOR_ERROR);
  }

  try {
    let response;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetchImpl(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: queryFor(start)
      });
      if (response?.ok) {
        break;
      }
    }
    if (!response?.ok) {
      throw new Error(CORRIDOR_ERROR);
    }
    const data = await response.json();
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    const namedElements = elements.filter(element => /탄천/.test(element?.tags?.name ?? ''));
    const sourceElements = namedElements.length ? namedElements : elements;
    const ways = sourceElements
      .map(element => normalizeGeometry(element.geometry))
      .filter(way => way.length >= 2);
    if (!ways.length) {
      throw new Error(CORRIDOR_ERROR);
    }

    const chain = buildCorridorPoints(ways, start, end);
    const startIndex = chain.reduce((best, point, index) => distanceM(point, start) < distanceM(chain[best], start) ? index : best, 0);
    const endIndex = chain.reduce((best, point, index) => distanceM(point, end) < distanceM(chain[best], end) ? index : best, 0);
    if (!chain.length || distanceM(chain[startIndex], start) > MAX_ENTRY_DISTANCE_M || distanceM(chain[endIndex], end) > MAX_ENTRY_DISTANCE_M) {
      throw new Error(CORRIDOR_ERROR);
    }

    const waypoints = sampleBetween(chain, startIndex, endIndex);
    if (waypoints.length < 2) {
      throw new Error(CORRIDOR_ERROR);
    }
    return { waypoints };
  } catch (error) {
    if (error instanceof Error && error.message === CORRIDOR_ERROR) {
      throw error;
    }
    throw new Error(CORRIDOR_ERROR);
  }
}
