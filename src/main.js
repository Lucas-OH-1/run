import './styles.css';
import { createApp } from './app.js';
import { createRouteMap } from './map/create-map.js';
import { createRoutingClient } from './services/routing.js';
import { findTancheonCorridor } from './services/corridor.js';
import { reversePlace, searchPlaces } from './services/geocoding.js';

let app;
const map = createRouteMap(document.querySelector('#map'), {
  onMapClick: point => app?.handleMapClick(point)
});

app = createApp({
  document,
  map,
  routing: createRoutingClient(),
  corridor: { findTancheonCorridor },
  geocoding: { searchPlaces, reversePlace },
  navigator
});
