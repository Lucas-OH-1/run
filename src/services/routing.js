import { BROUTER_URL } from '../config.js';
import { ROUTE_MODE_IDS, ROUTE_PROFILES } from '../routing/profiles.js';

const SERVICE_ERROR = '러닝 경로 서비스를 사용할 수 없습니다.';
const ROUTE_ERROR = '러닝 경로를 찾지 못했습니다. 지점을 조금 옮겨 다시 시도해주세요.';

export function createRoutingClient({ fetchImpl = fetch } = {}) {
  const profileIds = new Map();
  const profilePromises = new Map();
  const refreshPromises = new Map();

  async function uploadProfile(mode) {
    try {
      const response = await fetchImpl(`${BROUTER_URL}/profile`, {
        method: 'POST',
        body: ROUTE_PROFILES[mode]
      });
      if (!response?.ok) {
        throw new Error(SERVICE_ERROR);
      }
      const data = await response.json();
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        data.error ||
        typeof data.profileid !== 'string' ||
        data.profileid.trim() === ''
      ) {
        throw new Error(SERVICE_ERROR);
      }
      profileIds.set(mode, data.profileid);
      return data.profileid;
    } catch (error) {
      if (error instanceof Error && error.message === SERVICE_ERROR) {
        throw error;
      }
      throw new Error(SERVICE_ERROR);
    }
  }

  function getProfile(mode) {
    const profile = profileIds.get(mode);
    if (profile) {
      return Promise.resolve(profile);
    }

    const inFlight = profilePromises.get(mode);
    if (inFlight) {
      return inFlight;
    }

    const promise = uploadProfile(mode).finally(() => {
      if (profilePromises.get(mode) === promise) {
        profilePromises.delete(mode);
      }
    });
    profilePromises.set(mode, promise);
    return promise;
  }

  function refreshProfile(mode, failedProfile) {
    const currentProfile = profileIds.get(mode);
    if (currentProfile && currentProfile !== failedProfile) {
      return Promise.resolve(currentProfile);
    }

    const inFlight = refreshPromises.get(mode);
    if (inFlight) {
      return inFlight;
    }

    if (profileIds.get(mode) === failedProfile) {
      profileIds.delete(mode);
    }

    const promise = getProfile(mode).finally(() => {
      if (refreshPromises.get(mode) === promise) {
        refreshPromises.delete(mode);
      }
    });
    refreshPromises.set(mode, promise);
    return promise;
  }

  function routeUrl(profile, start, end, viaPoints = []) {
    const points = [start, ...viaPoints, end];
    const lonlats = points.map(point => `${point.lng},${point.lat}`).join('|');
    const url = new URL(BROUTER_URL);
    url.searchParams.set('lonlats', lonlats);
    url.searchParams.set('profile', profile);
    url.searchParams.set('alternativeidx', '0');
    url.searchParams.set('format', 'geojson');
    return url;
  }

  async function requestRoute(mode, start, end, viaPoints = []) {
    let profile = await getProfile(mode);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(routeUrl(profile, start, end, viaPoints));
      } catch {
        throw new Error(ROUTE_ERROR);
      }

      if (!response?.ok) {
        if (attempt === 1) {
          throw new Error(ROUTE_ERROR);
        }
        profile = await refreshProfile(mode, profile);
        continue;
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(ROUTE_ERROR);
      }

      const feature = data?.features?.[0];
      const coordinates = feature?.geometry?.coordinates;
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        !Array.isArray(data.features) ||
        !feature ||
        typeof feature !== 'object' ||
        Array.isArray(feature) ||
        feature.type !== 'Feature' ||
        !feature.geometry ||
        typeof feature.geometry !== 'object' ||
        Array.isArray(feature.geometry) ||
        feature.geometry.type !== 'LineString' ||
        !Array.isArray(coordinates) ||
        coordinates.length < 2 ||
        coordinates.some(coordinate =>
          !Array.isArray(coordinate) ||
          coordinate.length < 2 ||
          !Number.isFinite(coordinate[0]) ||
          !Number.isFinite(coordinate[1]) ||
          coordinate[0] < -180 ||
          coordinate[0] > 180 ||
          coordinate[1] < -90 ||
          coordinate[1] > 90
        )
      ) {
        throw new Error(ROUTE_ERROR);
      }
      return { mode, feature };
    }

    throw new Error(ROUTE_ERROR);
  }

  return {
    getRoutes(start, end, { corridor } = {}) {
      const riverWaypoints = corridor?.waypoints;
      const hasCorridor = Array.isArray(riverWaypoints) && riverWaypoints.length >= 2;
      const modes = hasCorridor ? ROUTE_MODE_IDS : ['A', 'B', 'C'];
      return Promise.all(modes.map(mode => requestRoute(
        mode,
        start,
        end,
        mode === 'RIVER' ? riverWaypoints : []
      )));
    }
  };
}
