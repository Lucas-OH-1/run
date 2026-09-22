import { describe, expect, it } from 'vitest';
import { analyzeRoute } from '../src/routing/analyze-route.js';

const feature = { properties: {
  'track-length': '6200',
  messages: [
    ['Longitude','Latitude','Elevation','Distance','CostPerKm','ElevCost','TurnCost','NodeCost','InitialCost','WayTags'],
    ['0','0','0','3000','0','0','0','0','0','highway=footway'],
    ['0','0','0','2500','0','0','0','0','0','highway=cycleway foot=designated'],
    ['0','0','0','600','0','0','0','0','0','highway=residential'],
    ['0','0','0','100','0','0','0','0','0','highway=steps']
  ]
}};

describe('analyzeRoute', () => {
  it('길 유형, 시간, 겸용도로 안내를 계산한다', () => {
    expect(analyzeRoute(feature)).toEqual({
      distanceM: 6200, minutes: 41, pedestrianPercent: 89, roadM: 600,
      stepsM: 100, sharedCyclewayM: 2500, showPedestrianSideHint: true, showStructureHint: false
    });
  });
});
