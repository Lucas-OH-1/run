const PEDESTRIAN_HIGHWAYS = new Set(['footway', 'pedestrian', 'path', 'track', 'cycleway']);
const ROAD_HIGHWAYS = new Set([
  'living_street',
  'residential',
  'service',
  'unclassified',
  'tertiary',
  'secondary',
  'primary',
  'trunk'
]);
const SHARED_FOOT_VALUES = new Set(['yes', 'designated', 'permissive']);

function toSafeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parseWayTags(value) {
  if (typeof value !== 'string') {
    return {};
  }

  return value.split(/\s+/).reduce((tags, token) => {
    const separatorIndex = token.indexOf('=');
    if (separatorIndex <= 0) {
      return tags;
    }

    const key = token.slice(0, separatorIndex);
    const tagValue = token.slice(separatorIndex + 1);
    if (key) {
      tags[key] = tagValue;
    }
    return tags;
  }, {});
}

function hasEnabledTag(tags, key) {
  return Object.hasOwn(tags, key) && !['no', 'false', '0'].includes(tags[key]);
}

export function analyzeRoute(feature) {
  const properties = feature?.properties ?? {};
  const distanceM = toSafeNumber(properties['track-length']);
  const messages = Array.isArray(properties.messages) ? properties.messages : [];
  const header = Array.isArray(messages[0]) ? messages[0] : [];
  const distanceIndex = header.indexOf('Distance');
  const wayTagsIndex = header.indexOf('WayTags');

  let pedestrianM = 0;
  let roadM = 0;
  let stepsM = 0;
  let sharedCyclewayM = 0;
  let showStructureHint = false;

  for (const row of messages.slice(1)) {
    if (!Array.isArray(row)) {
      continue;
    }

    const rowDistanceM = distanceIndex >= 0 ? toSafeNumber(row[distanceIndex]) : 0;
    const tags = wayTagsIndex >= 0 ? parseWayTags(row[wayTagsIndex]) : {};
    const highway = tags.highway;

    if (PEDESTRIAN_HIGHWAYS.has(highway)) {
      pedestrianM += rowDistanceM;
    }

    if (ROAD_HIGHWAYS.has(highway)) {
      roadM += rowDistanceM;
    }

    if (highway === 'steps') {
      stepsM += rowDistanceM;
    }

    if (highway === 'cycleway' && SHARED_FOOT_VALUES.has(tags.foot)) {
      sharedCyclewayM += rowDistanceM;
    }

    if (hasEnabledTag(tags, 'bridge') || hasEnabledTag(tags, 'tunnel')) {
      showStructureHint = true;
    }
  }

  return {
    distanceM,
    minutes: Math.ceil((distanceM / 1000) * 6.5),
    pedestrianPercent: distanceM > 0 ? Math.round((pedestrianM / distanceM) * 100) : 0,
    roadM,
    stepsM,
    sharedCyclewayM,
    showPedestrianSideHint: sharedCyclewayM > 0,
    showStructureHint
  };
}
