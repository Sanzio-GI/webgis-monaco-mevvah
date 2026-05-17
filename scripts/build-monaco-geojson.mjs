import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const input = join(root, 'artifacts/webgis/public/monaco-overpass.json');
const output = join(root, 'artifacts/webgis/public/monaco.geojson');

function convertOverpass(elements) {
  return elements.flatMap((el) => {
    const p = { ...(el.tags ?? {}) };
    p.osm_id = el.id;
    p.osm_type = el.type;
    if (el.type === 'node' && el.lat !== undefined) {
      return [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
          properties: p,
        },
      ];
    }
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const coords = el.geometry.map((g) => [g.lon, g.lat]);
      const closed =
        coords.length > 3 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];
      const isArea = p.building || p.landuse || p.leisure === 'pitch';
      if (closed && isArea) {
        return [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: p,
          },
        ];
      }
      return [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: p,
        },
      ];
    }
    return [];
  });
}

const raw = JSON.parse(readFileSync(input, 'utf8'));
const features = convertOverpass(raw.elements ?? []);
const geojson = { type: 'FeatureCollection', features };
writeFileSync(output, JSON.stringify(geojson));
console.log(`Wrote ${features.length} features to ${output}`);
