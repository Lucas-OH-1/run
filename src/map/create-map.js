import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_CENTER, DEFAULT_ZOOM, ROUTE_COLORS } from '../config.js';

export function routeStyle(mode, selected = 'A') {
  return {
    color: ROUTE_COLORS[mode],
    weight: mode === selected ? 8 : 4,
    opacity: mode === selected ? 1 : 0.28,
    dashArray: mode === 'C' ? '8 7' : null
  };
}

function isPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function isCoordinatePair(coordinates) {
  return (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1]) &&
    coordinates[0] >= -180 &&
    coordinates[0] <= 180 &&
    coordinates[1] >= -90 &&
    coordinates[1] <= 90
  );
}

function isCoordinateSequence(coordinates, minimumLength) {
  return (
    Array.isArray(coordinates) &&
    coordinates.length >= minimumLength &&
    coordinates.every(isCoordinatePair)
  );
}

function isGeometryLike(geometry) {
  if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) {
    return false;
  }

  switch (geometry.type) {
    case 'Point':
      return isCoordinatePair(geometry.coordinates);
    case 'MultiPoint':
      return isCoordinateSequence(geometry.coordinates, 1);
    case 'LineString':
      return isCoordinateSequence(geometry.coordinates, 2);
    case 'MultiLineString':
      return (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length >= 1 &&
        geometry.coordinates.every(line => isCoordinateSequence(line, 2))
      );
    case 'Polygon':
      return (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length >= 1 &&
        geometry.coordinates.every(ring => isCoordinateSequence(ring, 4))
      );
    case 'MultiPolygon':
      return (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length >= 1 &&
        geometry.coordinates.every(polygon =>
          Array.isArray(polygon) &&
          polygon.length >= 1 &&
          polygon.every(ring => isCoordinateSequence(ring, 4))
        )
      );
    case 'GeometryCollection':
      return Array.isArray(geometry.geometries) && geometry.geometries.every(isGeometryLike);
    default:
      return false;
  }
}

function isFeatureLike(feature) {
  return feature && typeof feature === 'object' && !Array.isArray(feature) && isGeometryLike(feature.geometry);
}

export function createRouteMap(element, { onMapClick } = {}) {
  const map = L.map(element).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  const routeLayers = [];
  const pointMarkers = new Map();
  let selectedMode = 'A';
  let destroyed = false;

  function handleMapClick(event) {
    if (typeof onMapClick === 'function') {
      onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    }
  }

  map.on('click', handleMapClick);

  function clearRoutes() {
    while (routeLayers.length > 0) {
      const route = routeLayers.pop();
      route.layer.remove();
    }
  }

  function setPoint(kind, point) {
    if (pointMarkers.has(kind)) {
      pointMarkers.get(kind).remove();
      pointMarkers.delete(kind);
    }

    if (!isPoint(point)) {
      return;
    }

    const label = kind === 'start' ? '출발' : '도착';
    const marker = L.marker([point.lat, point.lng]).bindPopup(label).addTo(map);
    pointMarkers.set(kind, marker);
  }

  function setRoutes(routes = []) {
    if (!Array.isArray(routes)) {
      return;
    }

    clearRoutes();

    for (const route of routes) {
      const feature = route?.feature ?? route;
      if (!isFeatureLike(feature)) {
        continue;
      }

      const mode = route?.mode ?? feature.properties?.mode;
      const layer = L.geoJSON(feature, { style: routeStyle(mode, selectedMode) }).addTo(map);
      routeLayers.push({ mode, layer });
    }

    fitRoutes();
  }

  function selectRoute(mode) {
    selectedMode = mode;
    for (const route of routeLayers) {
      route.layer.setStyle(routeStyle(route.mode, selectedMode));
      if (route.mode === selectedMode) {
        route.layer.bringToFront();
      }
    }
  }

  function fitRoutes() {
    if (routeLayers.length === 0) {
      return;
    }

    const bounds = L.featureGroup(routeLayers.map(route => route.layer)).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [28, 28] });
    }
  }

  function locate() {
    map.locate({ setView: true, maxZoom: 16 });
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    map.off('click', handleMapClick);
    clearRoutes();
    for (const marker of pointMarkers.values()) {
      marker.remove();
    }
    pointMarkers.clear();
    tileLayer.remove();
    map.remove();
  }

  return { map, setPoint, setRoutes, selectRoute, fitRoutes, locate, destroy };
}
