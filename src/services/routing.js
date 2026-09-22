import { BROUTER_URL } from '../config.js';
import { ROUTE_PROFILES } from '../routing/profiles.js';

const SERVICE_ERROR = '러닝 경로 서비스를 사용할 수 없습니다.';
const ROUTE_ERROR = '러닝 경로를 찾지 못했습니다. 지점을 조금 옮겨 다시 시도해주세요.';

export function createRoutingClient({ fetchImpl = fetch } = {}) {
  const profileIds = new Map();

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
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.error || !data.profileid) {
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

  function routeUrl(profile, start, end) {
    const url = new URL(BROUTER_URL);
    url.searchParams.set('lonlats', `${start.lng},${start.lat}|${end.lng},${end.lat}`);
    url.searchParams.set('profile', profile);
    url.searchParams.set('alternativeidx', '0');
    url.searchParams.set('format', 'geojson');
    return url;
  }

  async function requestRoute(mode, start, end) {
    let profile = profileIds.get(mode) || await uploadProfile(mode);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(routeUrl(profile, start, end));
      } catch {
        throw new Error(ROUTE_ERROR);
      }

      if (!response?.ok) {
        if (attempt === 1) {
          throw new Error(ROUTE_ERROR);
        }
        profileIds.delete(mode);
        try {
          profile = await uploadProfile(mode);
        } catch {
          throw new Error(ROUTE_ERROR);
        }
        continue;
      }

      try {
        const data = await response.json();
        const feature = data?.features?.[0];
        if (!feature) {
          throw new Error(ROUTE_ERROR);
        }
        return { mode, feature };
      } catch (error) {
        if (error instanceof Error && error.message === ROUTE_ERROR) {
          throw error;
        }
        throw new Error(ROUTE_ERROR);
      }
    }

    throw new Error(ROUTE_ERROR);
  }

  return {
    getRoutes(start, end) {
      return Promise.all(['A', 'B', 'C'].map(mode => requestRoute(mode, start, end)));
    }
  };
}
