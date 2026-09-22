import { describe, expect, it } from 'vitest';
import { createRouteMap, routeStyle } from '../src/map/create-map.js';

describe('routeStyle', () => {
  it('선택 경로를 굵고 불투명하게 만들고 기본 선택값은 A로 둔다', () => {
    expect(routeStyle('A')).toMatchObject({ color: '#087f5b', weight: 8, opacity: 1 });
    expect(routeStyle('B')).toMatchObject({ weight: 4, opacity: 0.28 });
    expect(routeStyle('A', 'A')).toMatchObject({ color: '#087f5b', weight: 8, opacity: 1 });
    expect(routeStyle('B', 'A')).toMatchObject({ weight: 4, opacity: 0.28 });
  });

  it('지도에 처음 표시할 때 A 경로를 선택한다', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const routeMap = createRouteMap(container);

    routeMap.setRoutes([
      {
        mode: 'A',
        feature: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }
      },
      {
        mode: 'B',
        feature: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 1], [1, 2]] } }
      }
    ]);

    const paths = [...container.querySelectorAll('.leaflet-overlay-pane path')];
    expect(paths.map(path => path.getAttribute('stroke-width'))).toEqual(['8', '4']);
    expect(paths.map(path => path.getAttribute('stroke-opacity'))).toEqual(['1', '0.28']);

    routeMap.destroy();
  });

  it('마커를 교체하고 잘못된 좌표에서는 기존 마커를 보존한다', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const routeMap = createRouteMap(container);

    routeMap.setPoint('start', { lat: 37, lng: 127 });
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1);
    expect(Object.values(routeMap.map._layers).map(layer => layer.getLatLng?.()).filter(Boolean)).toEqual([
      { lat: 37, lng: 127 }
    ]);

    routeMap.setPoint('start', { lat: 38, lng: 128 });
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1);
    expect(Object.values(routeMap.map._layers).map(layer => layer.getLatLng?.()).filter(Boolean)).toEqual([
      { lat: 38, lng: 128 }
    ]);

    routeMap.setPoint('start', { lat: 91, lng: 128 });
    routeMap.setPoint('start', { lat: 38, lng: 181 });
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1);
    expect(Object.values(routeMap.map._layers).map(layer => layer.getLatLng?.()).filter(Boolean)).toEqual([
      { lat: 38, lng: 128 }
    ]);

    routeMap.destroy();
  });

  it('해당 지점 마커만 지우고 다른 지점 마커는 보존한다', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const routeMap = createRouteMap(container);

    routeMap.setPoint('start', { lat: 37, lng: 127 });
    routeMap.setPoint('end', { lat: 38, lng: 128 });
    routeMap.clearPoint('start');

    expect(Object.values(routeMap.map._layers).map(layer => layer.getLatLng?.()).filter(Boolean)).toEqual([
      { lat: 38, lng: 128 }
    ]);
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1);

    routeMap.destroy();
  });

  it('지도 클릭 좌표를 콜백으로 전달한다', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const clicks = [];
    const routeMap = createRouteMap(container, { onMapClick: point => clicks.push(point) });

    routeMap.map.fire('click', { latlng: { lat: 35.1, lng: 129.1 } });

    expect(clicks).toEqual([{ lat: 35.1, lng: 129.1 }]);
    routeMap.destroy();
  });

  it('selectRoute가 표시된 경로 스타일을 갱신한다', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const routeMap = createRouteMap(container);
    const routes = [
      {
        mode: 'A',
        feature: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }
      },
      {
        mode: 'B',
        feature: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 1], [1, 2]] } }
      }
    ];

    routeMap.setRoutes(routes);
    routeMap.selectRoute('B');

    const paths = [...container.querySelectorAll('.leaflet-overlay-pane path')];
    expect(paths.map(path => path.getAttribute('stroke-width'))).toEqual(['4', '8']);
    expect(paths.map(path => path.getAttribute('stroke-opacity'))).toEqual(['0.28', '1']);

    routeMap.destroy();
  });

  it('잘못된 좌표를 무시하고 비배열 입력으로 기존 경로를 지우지 않는다', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const routeMap = createRouteMap(container);
    const validRoute = {
      mode: 'A',
      feature: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }
    };

    routeMap.setRoutes([validRoute]);
    expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(1);

    expect(() => routeMap.setRoutes(null)).not.toThrow();
    expect(() => routeMap.setRoutes({})).not.toThrow();
    expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(1);

    expect(() =>
      routeMap.setRoutes([
        null,
        {},
        { feature: null },
        {
          mode: 'B',
          feature: {
            type: 'Feature',
            geometry: {
              type: 'GeometryCollection',
              geometries: [
                { type: 'LineString', coordinates: [[0, 0], [181, 1]] },
                { type: 'Point', coordinates: [0, 'invalid'] }
              ]
            }
          }
        }
      ])
    ).not.toThrow();
    expect(container.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(0);

    routeMap.destroy();
  });
});
