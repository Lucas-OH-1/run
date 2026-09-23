import { OVERPASS_URLS } from '../config.js';

const CORRIDOR_ERROR = '탄천자전거도로를 찾지 못했습니다. 지도에서 직접 지점을 선택해주세요.';
const MAX_ENTRY_DISTANCE_M = 5000;
const MAX_EXIT_DISTANCE_M = 3000;
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

function queryFor(point) {
  return `[out:json][timeout:20];
(
  way["highway"="cycleway"](around:10000,${point.lat},${point.lng});
  way["highway"~"path|footway"]["bicycle"~"yes|designated"]["name"~"탄천"](around:10000,${point.lat},${point.lng});
);
out body geom;`;
}

function normalizeWay(element) {
  if (!Array.isArray(element?.nodes) || !Array.isArray(element?.geometry) || element.nodes.length !== element.geometry.length) {
    return null;
  }
  const points = element.nodes.map((id, index) => ({
    id: String(id),
    lat: Number(element.geometry[index]?.lat),
    lng: Number(element.geometry[index]?.lon)
  })).filter(point => point.id && validPoint(point));
  if (points.length < 2) {
    return null;
  }
  return { points, tancheon: /탄천/.test(element?.tags?.name ?? '') };
}

function addEdge(adjacency, from, to, weight) {
  if (!adjacency.has(from)) {
    adjacency.set(from, []);
  }
  adjacency.get(from).push({ id: to, weight });
}

function buildGraph(elements) {
  const nodes = new Map();
  const adjacency = new Map();
  const tancheonNodes = new Set();

  for (const way of elements.map(normalizeWay).filter(Boolean)) {
    for (const point of way.points) {
      nodes.set(point.id, point);
      if (way.tancheon) {
        tancheonNodes.add(point.id);
      }
    }
    for (let index = 1; index < way.points.length; index += 1) {
      const previous = way.points[index - 1];
      const current = way.points[index];
      const weight = distanceM(previous, current);
      addEdge(adjacency, previous.id, current.id, weight);
      addEdge(adjacency, current.id, previous.id, weight);
    }
  }

  return { nodes, adjacency, tancheonNodes };
}

function connectedComponents(graph) {
  const unvisited = new Set(graph.nodes.keys());
  const components = [];

  while (unvisited.size) {
    const first = unvisited.values().next().value;
    const stack = [first];
    const ids = [];
    let hasTancheon = false;
    unvisited.delete(first);

    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      hasTancheon ||= graph.tancheonNodes.has(id);
      for (const edge of graph.adjacency.get(id) ?? []) {
        if (unvisited.delete(edge.id)) {
          stack.push(edge.id);
        }
      }
    }

    if (hasTancheon) {
      components.push(ids);
    }
  }

  return components;
}

function nearestNode(component, target, nodes) {
  let bestId = component[0];
  let bestDistance = distanceM(nodes.get(bestId), target);
  for (let index = 1; index < component.length; index += 1) {
    const id = component[index];
    const candidateDistance = distanceM(nodes.get(id), target);
    if (candidateDistance < bestDistance) {
      bestId = id;
      bestDistance = candidateDistance;
    }
  }
  return { id: bestId, distance: bestDistance };
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].distance <= item.distance) {
        break;
      }
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    if (!this.items.length) {
      return null;
    }
    const result = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.items.length) {
          break;
        }
        const child = right < this.items.length && this.items[right].distance < this.items[left].distance ? right : left;
        if (this.items[child].distance >= last.distance) {
          break;
        }
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return result;
  }
}

function shortestPaths(graph, startId) {
  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  const queue = new MinHeap();
  queue.push({ id: startId, distance: 0 });

  while (queue.items.length) {
    const current = queue.pop();
    if (current.distance !== distances.get(current.id)) {
      continue;
    }
    for (const edge of graph.adjacency.get(current.id) ?? []) {
      const candidate = current.distance + edge.weight;
      if (candidate < (distances.get(edge.id) ?? Infinity)) {
        distances.set(edge.id, candidate);
        previous.set(edge.id, current.id);
        queue.push({ id: edge.id, distance: candidate });
      }
    }
  }

  return { distances, previous };
}

function pathFrom(previous, startId, endId) {
  if (startId !== endId && !previous.has(endId)) {
    return null;
  }
  const ids = [endId];
  while (ids[0] !== startId) {
    ids.unshift(previous.get(ids[0]));
  }
  return ids;
}

function samplePath(points) {
  if (points.length < 2) {
    return points;
  }
  const sampled = [points[0]];
  let accumulated = 0;
  for (let index = 1; index < points.length; index += 1) {
    accumulated += distanceM(points[index - 1], points[index]);
    if (accumulated >= SAMPLE_DISTANCE_M || index === points.length - 1) {
      sampled.push(points[index]);
      accumulated = 0;
    }
  }
  return sampled.map(({ lat, lng }) => ({ lat, lng }));
}

function selectConnectedCorridor(graph, start, end) {
  let best = null;
  for (const component of connectedComponents(graph)) {
    const tancheonIds = component.filter(id => graph.tancheonNodes.has(id));
    const entry = nearestNode(tancheonIds, start, graph.nodes);
    if (entry.distance > MAX_ENTRY_DISTANCE_M) {
      continue;
    }
    const paths = shortestPaths(graph, entry.id);
    for (const exitId of tancheonIds) {
      const exitDistance = distanceM(graph.nodes.get(exitId), end);
      const pathDistance = paths.distances.get(exitId);
      if (exitDistance > MAX_EXIT_DISTANCE_M || pathDistance === undefined) {
        continue;
      }
      const score = exitDistance * 100 + pathDistance + entry.distance;
      if (!best || score < best.score) {
        best = {
          score,
          ids: pathFrom(paths.previous, entry.id, exitId)
        };
      }
    }
  }
  if (!best?.ids) {
    throw new Error(CORRIDOR_ERROR);
  }
  return samplePath(best.ids.map(id => graph.nodes.get(id)));
}

export async function findTancheonCorridor(start, end, fetchImpl = fetch) {
  if (!validPoint(start) || !validPoint(end)) {
    throw new Error(CORRIDOR_ERROR);
  }

  try {
    let response;
    for (const url of OVERPASS_URLS) {
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: queryFor(start)
        });
      } catch {
        response = null;
      }
      if (response?.ok) {
        break;
      }
    }
    if (!response?.ok) {
      throw new Error(CORRIDOR_ERROR);
    }

    const data = await response.json();
    const graph = buildGraph(Array.isArray(data?.elements) ? data.elements : []);
    if (!graph.nodes.size || !graph.tancheonNodes.size) {
      throw new Error(CORRIDOR_ERROR);
    }
    const waypoints = selectConnectedCorridor(graph, start, end);
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
