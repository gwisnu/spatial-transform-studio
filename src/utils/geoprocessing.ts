import * as turf from '@turf/turf';
import { CRS, SpatialLayer } from '../types/spatial';
import { calculateBounds } from './coordinateTransform';
import { extractFields, detectGeometryTypes } from './parsers';

/**
 * Generate multiple concentric buffer polygons around vector features
 * Default distances: 100m, 150m, 300m (fully customizable)
 * Note: Never simplifies geometry; preserves all original vertices
 */
export function createMultipleBuffers(
  features: GeoJSON.Feature[],
  distances: number[], // in meters
  sourceLayer: SpatialLayer,
  options?: { dissolve?: boolean }
): Omit<SpatialLayer, 'id' | 'color' | 'opacity' | 'lineWidth' | 'pointSize' | 'visible' | 'createdAt'> {
  // Sort distances descending so outer rings render behind inner rings
  const sortedDistances = [...distances].sort((a, b) => b - a);
  const bufferFeatures: GeoJSON.Feature[] = [];

  sortedDistances.forEach((dist) => {
    features.forEach((feature, fIdx) => {
      try {
        if (!feature.geometry) return;
        // turf.buffer operates in geodesic meters on WGS84 coordinates
        const buffered = turf.buffer(feature as any, dist, {
          units: 'meters',
          steps: 32, // high precision circular arcs without simplifying
        });

        if (buffered) {
          const props = {
            ...(feature.properties || {}),
            buffer_dist: dist,
            buffer_unit: 'meters',
            parent_id: feature.id ?? `f_${fIdx}`,
          };

          if (buffered.type === 'FeatureCollection') {
            buffered.features.forEach((bf, bIdx) => {
              bufferFeatures.push({
                ...bf,
                id: `buf_${dist}m_${fIdx}_${bIdx}`,
                properties: { ...props },
              });
            });
          } else {
            bufferFeatures.push({
              ...(buffered as any),
              id: `buf_${dist}m_${fIdx}`,
              properties: { ...props },
            });
          }
        }
      } catch (err) {
        console.warn(`Buffer failed for feature ${fIdx} at distance ${dist}m:`, err);
      }
    });
  });

  const collection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: bufferFeatures,
  };

  const bounds = calculateBounds(collection);
  const distStr = distances.sort((a, b) => a - b).join(', ');

  return {
    name: `${sourceLayer.name} - Buffer (${distStr}m)`,
    originalFileName: `${sourceLayer.name}_buffer.geojson`,
    format: 'geojson',
    sourceCRS: sourceLayer.sourceCRS,
    geojson: collection,
    featureCount: collection.features.length,
    geometryTypes: detectGeometryTypes(collection.features),
    bounds,
    fields: extractFields(collection.features),
  };
}

/**
 * Convert LineString and MultiLineString features into closed Polygons
 * Note: Never simplifies geometry; preserves all original vertices
 */
export function convertLinesToPolygons(
  features: GeoJSON.Feature[],
  sourceLayer: SpatialLayer
): Omit<SpatialLayer, 'id' | 'color' | 'opacity' | 'lineWidth' | 'pointSize' | 'visible' | 'createdAt'> {
  const polygonFeatures: GeoJSON.Feature[] = [];

  features.forEach((feat, idx) => {
    if (!feat.geometry) return;
    const geomType = feat.geometry.type;

    if (geomType === 'LineString') {
      const coords = (feat.geometry as GeoJSON.LineString).coordinates;
      if (coords.length >= 3) {
        const ring = [...coords];
        // Ensure closed ring without altering inner vertices
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          ring.push([first[0], first[1]]);
        }

        polygonFeatures.push({
          type: 'Feature',
          id: `poly_${idx}`,
          properties: {
            ...(feat.properties || {}),
            converted_from: 'LineString',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [ring],
          },
        });
      }
    } else if (geomType === 'MultiLineString') {
      const lineStrings = (feat.geometry as GeoJSON.MultiLineString).coordinates;
      const polygonRings: [number, number][][] = [];

      lineStrings.forEach((coords) => {
        if (coords.length >= 3) {
          const ring = [...coords];
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]]);
          }
          polygonRings.push(ring as [number, number][]);
        }
      });

      if (polygonRings.length > 0) {
        polygonFeatures.push({
          type: 'Feature',
          id: `poly_${idx}`,
          properties: {
            ...(feat.properties || {}),
            converted_from: 'MultiLineString',
          },
          geometry: {
            type: 'MultiPolygon',
            coordinates: polygonRings.map((r) => [r]),
          },
        });
      }
    } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
      // Already a polygon, retain
      polygonFeatures.push({ ...feat, id: feat.id ?? `poly_${idx}` });
    }
  });

  if (polygonFeatures.length === 0) {
    throw new Error('No valid LineString or Polyline features could be converted into Polygons (at least 3 vertices required).');
  }

  const collection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: polygonFeatures,
  };

  const bounds = calculateBounds(collection);

  return {
    name: `${sourceLayer.name} - Polygonized`,
    originalFileName: `${sourceLayer.name}_polygons.geojson`,
    format: 'geojson',
    sourceCRS: sourceLayer.sourceCRS,
    geojson: collection,
    featureCount: collection.features.length,
    geometryTypes: detectGeometryTypes(collection.features),
    bounds,
    fields: extractFields(collection.features),
  };
}

/**
 * Convert Polygon and MultiPolygon features into boundary LineString / MultiLineString features
 * Note: Never simplifies geometry; preserves all exterior and interior hole vertices
 */
export function convertPolygonsToLines(
  features: GeoJSON.Feature[],
  sourceLayer: SpatialLayer
): Omit<SpatialLayer, 'id' | 'color' | 'opacity' | 'lineWidth' | 'pointSize' | 'visible' | 'createdAt'> {
  const lineFeatures: GeoJSON.Feature[] = [];

  features.forEach((feat, idx) => {
    if (!feat.geometry) return;
    const geomType = feat.geometry.type;

    if (geomType === 'Polygon') {
      const rings = (feat.geometry as GeoJSON.Polygon).coordinates;
      if (rings.length === 1) {
        // Single exterior ring -> LineString
        lineFeatures.push({
          type: 'Feature',
          id: `line_${idx}`,
          properties: {
            ...(feat.properties || {}),
            converted_from: 'Polygon',
            ring_type: 'exterior',
          },
          geometry: {
            type: 'LineString',
            coordinates: [...rings[0]],
          },
        });
      } else if (rings.length > 1) {
        // Exterior + interior hole rings -> MultiLineString
        lineFeatures.push({
          type: 'Feature',
          id: `line_${idx}`,
          properties: {
            ...(feat.properties || {}),
            converted_from: 'Polygon',
            ring_count: rings.length,
          },
          geometry: {
            type: 'MultiLineString',
            coordinates: rings.map((r) => [...r]),
          },
        });
      }
    } else if (geomType === 'MultiPolygon') {
      const polygons = (feat.geometry as GeoJSON.MultiPolygon).coordinates;
      const allRings: GeoJSON.Position[][] = [];
      polygons.forEach((polyRings) => {
        polyRings.forEach((ring) => {
          allRings.push([...ring]);
        });
      });

      if (allRings.length > 0) {
        lineFeatures.push({
          type: 'Feature',
          id: `line_${idx}`,
          properties: {
            ...(feat.properties || {}),
            converted_from: 'MultiPolygon',
            ring_count: allRings.length,
          },
          geometry: {
            type: 'MultiLineString',
            coordinates: allRings,
          },
        });
      }
    } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
      // Already a line, retain
      lineFeatures.push({ ...feat, id: feat.id ?? `line_${idx}` });
    }
  });

  if (lineFeatures.length === 0) {
    throw new Error('No valid Polygon or MultiPolygon features found in layer to convert into Polylines.');
  }

  const collection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: lineFeatures,
  };

  const bounds = calculateBounds(collection);

  return {
    name: `${sourceLayer.name} - Polylines`,
    originalFileName: `${sourceLayer.name}_polylines.geojson`,
    format: 'geojson',
    sourceCRS: sourceLayer.sourceCRS,
    geojson: collection,
    featureCount: collection.features.length,
    geometryTypes: detectGeometryTypes(collection.features),
    bounds,
    fields: extractFields(collection.features),
  };
}
