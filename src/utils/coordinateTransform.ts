import proj4 from 'proj4';
import { CRS } from '../types/spatial';

// Define UTM 50S and WGS84 in Proj4
proj4.defs('EPSG:32750', '+proj=utm +zone=50 +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

// Calibrated Tutupan Site Parameters
export const TUTUPAN_PARAMS = {
  rot: 57.26,
  dx: -330718.744,
  dy: -9748020.012,
  sf: 1.00008025,
  ox: 334759.446,
  oy: 9757090.68,
  olocx: 4040.702,
  olocy: 9070.668,
};

/**
 * Convert Tutupan Local Grid (Easting, Northing) to UTM 50S (x3, y3)
 */
export function ttp2Utm50s(easting: number, northing: number): [number, number] {
  const { rot, dx, dy, sf, ox, oy, olocx, olocy } = TUTUPAN_PARAMS;
  const x1 = (easting - olocx) / sf + olocx;
  const y1 = (northing - olocy) / sf + olocy;
  const x2 = x1 - dx;
  const y2 = y1 - dy;

  const rad = (-rot * Math.PI) / 180;
  const cosRad = Math.cos(rad);
  const sinRad = Math.sin(rad);

  const x3 = (x2 - ox) * cosRad - (y2 - oy) * sinRad + ox;
  const y3 = (y2 - oy) * cosRad + (x2 - ox) * sinRad + oy;

  return [x3, y3];
}

/**
 * Convert UTM 50S (x3, y3) to Tutupan Local Grid (Easting, Northing)
 */
export function utm50s2Ttp(x3: number, y3: number): [number, number] {
  const { rot, dx, dy, sf, ox, oy, olocx, olocy } = TUTUPAN_PARAMS;

  // Inverse rotation by +rot
  const rad = (rot * Math.PI) / 180;
  const cosRad = Math.cos(rad);
  const sinRad = Math.sin(rad);

  const x2Diff = (x3 - ox) * cosRad - (y3 - oy) * sinRad;
  const y2Diff = (y3 - oy) * cosRad + (x3 - ox) * sinRad;

  const x2 = x2Diff + ox;
  const y2 = y2Diff + oy;

  // Inverse shift
  const x1 = x2 + dx;
  const y1 = y2 + dy;

  // Inverse scale
  const easting = (x1 - olocx) * sf + olocx;
  const northing = (y1 - olocy) * sf + olocy;

  return [easting, northing];
}

/**
 * Direct port of python Ttp2Geo:
 * Convert Tutupan Local Grid (Easting, Northing) to WGS84 Geographic [Longitude, Latitude]
 */
export function ttp2Geo(easting: number, northing: number): [number, number] {
  const [x3, y3] = ttp2Utm50s(easting, northing);
  // UTM50s(x3, y3, inverse=True) -> [lon, lat]
  const [lon, lat] = proj4('EPSG:32750', 'EPSG:4326', [x3, y3]);
  return [lon, lat];
}

// Calibrated Tutupan Site 3D Parameters (Inclined Plane Adjustment)
export const TUTUPAN_3D_PARAMS = {
  ...TUTUPAN_PARAMS,
  originEasting: -119.715,
  originNorthing: 5543.114,
  slopeEasting: 11.395,
  slopeNorthing: -30.227,
  zOffset: 19.191,
};

/**
 * Calculate the inclined plane elevation adjustment dz for Tutupan Local Grid:
 * dz = ((northing - originNorthing) * -slopeNorthing / 1000000) +
 *      ((easting - originEasting) * -slopeEasting / 1000000) + 19.191
 *
 * z_utm = z_ttp + dz
 * z_ttp = z_utm - dz
 */
export function calcTutupanElevationAdjustment(easting: number, northing: number): number {
  const { originEasting, originNorthing, slopeEasting, slopeNorthing, zOffset } = TUTUPAN_3D_PARAMS;
  const dZNorthing = ((northing - originNorthing) * (-slopeNorthing)) / 1000000;
  const dZEasting = ((easting - originEasting) * (-slopeEasting)) / 1000000;
  return dZNorthing + dZEasting + zOffset;
}

/**
 * Convert Tutupan 3D (Easting, Northing, Elevation) to UTM 50S (Easting, Northing, Elevation)
 */
export function ttp2Utm50s3D(
  easting: number,
  northing: number,
  elevation: number
): [number, number, number] {
  const [x3, y3] = ttp2Utm50s(easting, northing);
  const dz = calcTutupanElevationAdjustment(easting, northing);
  const z1 = elevation + dz;
  return [x3, y3, z1];
}

/**
 * Convert UTM 50S 3D (Easting, Northing, Elevation) to Tutupan 3D (Easting, Northing, Elevation)
 */
export function utm50s2Ttp3D(
  x3: number,
  y3: number,
  elevation: number
): [number, number, number] {
  const [easting, northing] = utm50s2Ttp(x3, y3);
  const dz = calcTutupanElevationAdjustment(easting, northing);
  const z1 = elevation - dz;
  return [easting, northing, z1];
}

/**
 * Convert Tutupan 3D to WGS84 Geographic 3D [lon, lat, elevation]
 */
export function ttp2Geo3D(
  easting: number,
  northing: number,
  elevation: number
): [number, number, number] {
  const [x3, y3, z1] = ttp2Utm50s3D(easting, northing, elevation);
  const [lon, lat] = proj4('EPSG:32750', 'EPSG:4326', [x3, y3]);
  return [lon, lat, z1];
}

/**
 * Convert WGS84 Geographic 3D [lon, lat, elevation] to Tutupan 3D
 */
export function geo2Ttp3D(
  lon: number,
  lat: number,
  elevation: number
): [number, number, number] {
  const [x3, y3] = proj4('EPSG:4326', 'EPSG:32750', [lon, lat]);
  return utm50s2Ttp3D(x3, y3, elevation);
}

/**
 * Convert WGS84 Geographic [Longitude, Latitude] to Tutupan Local Grid (Easting, Northing)
 */
export function geo2Ttp(lon: number, lat: number): [number, number] {
  // WGS84 to UTM 50S
  const [x3, y3] = proj4('EPSG:4326', 'EPSG:32750', [lon, lat]);
  return utm50s2Ttp(x3, y3);
}

/**
 * Generalized 2D or 3D coordinate transformation between any supported CRS
 * (EPSG:4326, EPSG:32750, TUTUPAN).
 * If is3D is true, applies Tutupan inclined plane elevation transformation when converting
 * from or to TUTUPAN.
 */
export function transformCoordinate3D(
  coords: [number, number, number],
  fromCRS: CRS,
  toCRS: CRS,
  is3D: boolean = false
): [number, number, number] {
  const [x, y, z] = coords;
  if (fromCRS === toCRS) {
    return [x, y, z];
  }

  if (!is3D) {
    const [tx, ty] = transformCoordinate([x, y], fromCRS, toCRS);
    return [tx, ty, z];
  }

  // 3D Transformation with Inclined Plane Adjustment
  if (fromCRS === 'TUTUPAN' && toCRS === 'EPSG:32750') {
    return ttp2Utm50s3D(x, y, z);
  }
  if (fromCRS === 'EPSG:32750' && toCRS === 'TUTUPAN') {
    return utm50s2Ttp3D(x, y, z);
  }
  if (fromCRS === 'TUTUPAN' && toCRS === 'EPSG:4326') {
    return ttp2Geo3D(x, y, z);
  }
  if (fromCRS === 'EPSG:4326' && toCRS === 'TUTUPAN') {
    return geo2Ttp3D(x, y, z);
  }

  // Between EPSG:4326 and EPSG:32750 (horizontal reprojection, elevation preserved)
  if (fromCRS === 'EPSG:4326' && toCRS === 'EPSG:32750') {
    const [utmX, utmY] = proj4('EPSG:4326', 'EPSG:32750', [x, y]);
    return [utmX, utmY, z];
  }
  if (fromCRS === 'EPSG:32750' && toCRS === 'EPSG:4326') {
    const [lon, lat] = proj4('EPSG:32750', 'EPSG:4326', [x, y]);
    return [lon, lat, z];
  }

  // Fallback
  const [tx, ty] = transformCoordinate([x, y], fromCRS, toCRS);
  return [tx, ty, z];
}

/**
 * Transform an arbitrary 2D coordinate pair [x, y] between any supported CRS.
 * For EPSG:4326, input/output is [longitude, latitude].
 * For EPSG:32750 and TUTUPAN, input/output is [easting, northing].
 */
export function transformCoordinate(
  coords: [number, number],
  fromCRS: CRS,
  toCRS: CRS
): [number, number] {
  if (fromCRS === toCRS) {
    return [coords[0], coords[1]];
  }

  // First convert from fromCRS to WGS84 [lon, lat]
  let lonLat: [number, number];
  if (fromCRS === 'EPSG:4326') {
    lonLat = [coords[0], coords[1]];
  } else if (fromCRS === 'EPSG:32750') {
    lonLat = proj4('EPSG:32750', 'EPSG:4326', [coords[0], coords[1]]);
  } else if (fromCRS === 'TUTUPAN') {
    lonLat = ttp2Geo(coords[0], coords[1]);
  } else {
    throw new Error(`Unsupported source CRS: ${fromCRS}`);
  }

  // Then convert from WGS84 [lon, lat] to toCRS
  if (toCRS === 'EPSG:4326') {
    return lonLat;
  } else if (toCRS === 'EPSG:32750') {
    const utm = proj4('EPSG:4326', 'EPSG:32750', lonLat);
    return [utm[0], utm[1]];
  } else if (toCRS === 'TUTUPAN') {
    return geo2Ttp(lonLat[0], lonLat[1]);
  } else {
    throw new Error(`Unsupported destination CRS: ${toCRS}`);
  }
}

/**
 * Recursively reproject GeoJSON geometry coordinates
 */
function transformGeometryCoordinates(coords: any, fromCRS: CRS, toCRS: CRS): any {
  if (!Array.isArray(coords)) return coords;

  // If this is a [x, y] or [x, y, z] point
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const transformed = transformCoordinate([coords[0], coords[1]], fromCRS, toCRS);
    if (coords.length > 2) {
      return [transformed[0], transformed[1], coords[2]];
    }
    return transformed;
  }

  // Nested coordinate arrays (LineString, Polygon, MultiPolygon)
  return coords.map((c) => transformGeometryCoordinates(c, fromCRS, toCRS));
}

/**
 * Transform all geometries in a GeoJSON FeatureCollection between coordinate systems
 */
export function transformGeoJSON(
  featureCollection: GeoJSON.FeatureCollection,
  fromCRS: CRS,
  toCRS: CRS
): GeoJSON.FeatureCollection {
  if (fromCRS === toCRS) {
    return JSON.parse(JSON.stringify(featureCollection));
  }

  const transformedFeatures: GeoJSON.Feature[] = featureCollection.features.map((feature, idx) => {
    if (!feature.geometry) return feature;

    const transformedGeometry = {
      ...feature.geometry,
      coordinates: transformGeometryCoordinates(
        (feature.geometry as any).coordinates,
        fromCRS,
        toCRS
      ),
    };

    return {
      ...feature,
      id: feature.id ?? `f_${idx}`,
      geometry: transformedGeometry as any,
    };
  });

  return {
    type: 'FeatureCollection',
    features: transformedFeatures,
  };
}

/**
 * Calculate [minLng, minLat, maxLng, maxLat] bounding box in WGS84 for MapLibre fitBounds
 */
export function calculateBounds(geojson: GeoJSON.FeatureCollection): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  function traverse(coords: any) {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const lng = coords[0];
      const lat = coords[1];
      if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
      return;
    }
    coords.forEach(traverse);
  }

  for (const feature of geojson.features) {
    if (feature.geometry && (feature.geometry as any).coordinates) {
      traverse((feature.geometry as any).coordinates);
    }
  }

  // Fallback if no valid points found: centered around Tutupan area in Kalimantan, Indonesia
  if (!isFinite(minLng) || !isFinite(minLat)) {
    return [115.45, -2.15, 115.65, -2.05];
  }

  // Add 5% padding
  const dLng = (maxLng - minLng) * 0.05 || 0.01;
  const dLat = (maxLat - minLat) * 0.05 || 0.01;

  return [minLng - dLng, minLat - dLat, maxLng + dLng, maxLat + dLat];
}

export interface CRSGuessResult {
  guessedCRS: CRS;
  confidence: 'high' | 'medium' | 'low';
  rawExtent: [number, number, number, number]; // [minX, minY, maxX, maxY]
  reason: string;
  isMismatch: boolean;
}

/**
 * Extract raw bounding extent of features in their native unprojected coordinates
 */
export function getRawExtent(features: GeoJSON.Feature[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function traverse(coords: any) {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const x = coords[0];
      const y = coords[1];
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      return;
    }
    coords.forEach(traverse);
  }

  for (const f of features) {
    if (f.geometry && (f.geometry as any).coordinates) {
      traverse((f.geometry as any).coordinates);
    }
  }

  if (!isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

/**
 * Automatically inspect coordinate extent to detect and guess the true coordinate system
 */
export function guessCoordinateSystem(
  features: GeoJSON.Feature[],
  selectedCRS?: CRS
): CRSGuessResult {
  const extent = getRawExtent(features);
  const [minX, minY, maxX, maxY] = extent;

  let guessedCRS: CRS = 'EPSG:4326';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let reason = '';

  // 1. Check Geographic WGS84: -180 <= X <= 180 and -90 <= Y <= 90
  if (Math.abs(minX) <= 180 && Math.abs(maxX) <= 180 && Math.abs(minY) <= 90 && Math.abs(maxY) <= 90) {
    guessedCRS = 'EPSG:4326';
    confidence = 'high';
    reason = `Coordinates are in angular degrees (X: [${minX.toFixed(4)}, ${maxX.toFixed(4)}], Y: [${minY.toFixed(4)}, ${maxY.toFixed(4)}]), typical of WGS84 Geographic.`;
  }
  // 2. Check UTM Zone 50S: Y is in southern hemisphere false northing (~9,000,000 to ~10,000,000)
  // and Easting is ~100,000 to ~900,000
  else if (minY > 8000000 && maxY < 10500000 && minX > 100000 && maxX < 900000) {
    guessedCRS = 'EPSG:32750';
    confidence = 'high';
    reason = `Northing is in the 9,000,000m-10,000,000m range and Easting is ~${((minX + maxX) / 2).toFixed(0)}m, characteristic of UTM Zone 50 South (Kalimantan).`;
  }
  // 3. Check Tutupan Local Coordinate System:
  // Typical mine site coordinates have local metric offsets under 1,000,000m (northing is NOT in millions)
  else if (maxY < 1000000 && minY > -200000 && maxX < 1000000 && minX > -200000) {
    guessedCRS = 'TUTUPAN';
    confidence = 'high';
    reason = `Coordinates are metric local values (E: [${minX.toFixed(1)}, ${maxX.toFixed(1)}], N: [${minY.toFixed(1)}, ${maxY.toFixed(1)}]), characteristic of the Tutupan site grid.`;
  }
  // 4. Fallbacks
  else {
    if (maxY > 5000000) {
      guessedCRS = 'EPSG:32750';
      confidence = 'medium';
      reason = `Large metric northing detected (Y up to ${maxY.toFixed(0)}m), matching projected UTM coordinates.`;
    } else {
      guessedCRS = 'TUTUPAN';
      confidence = 'low';
      reason = `Metric coordinates detected, defaulting to local grid.`;
    }
  }

  const isMismatch = selectedCRS ? selectedCRS !== guessedCRS : false;

  return {
    guessedCRS,
    confidence,
    rawExtent: extent,
    reason,
    isMismatch,
  };
}
