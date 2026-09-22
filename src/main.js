import './styles.css';
import { createApp } from './app.js';
import { createRouteMap } from './map/create-map.js';
import { createRoutingClient } from './services/routing.js';
import { reversePlace, searchPlaces } from './services/geocoding.js';

let app;
const map = createRouteMap(document.querySelector('#map'), {
  onMapClick: point => app?.handleMapClick(point)
});

app = createApp({
  document,
  map,
  routing: createRoutingClient(),
  geocoding: { searchPlaces, reversePlace },
  navigator
});
