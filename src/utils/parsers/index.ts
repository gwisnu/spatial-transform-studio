import DxfParser from 'dxf-parser';
import * as toGeoJSON from '@tmcw/togeojson';
import shp from 'shpjs';
import JSZip from 'jszip';
import { CRS, SpatialLayer } from '../../types/spatial';
import { calculateBounds, transformGeoJSON, transformCoordinate } from '../coordinateTransform';

/**
 * Extract summary fields metadata from GeoJSON properties
 */
export function extractFields(features: GeoJSON.Feature[]): { name: string; type: 'string' | 'number' | 'boolean' }[] {
  const fieldMap = new Map<string, 'string' | 'number' | 'boolean'>();

  for (const f of features.slice(0, 100)) {
    if (f.properties) {
      for (const [key, val] of Object.entries(f.properties)) {
        if (!fieldMap.has(key)) {
          let type: 'string' | 'number' | 'boolean' = 'string';
          if (typeof val === 'number') type = 'number';
          else if (typeof val === 'boolean') type = 'boolean';
          fieldMap.set(key, type);
        }
      }
    }
  }

  return Array.from(fieldMap.entries()).map(([name, type]) => ({ name, type }));
}

/**
 * Detect geometry types in FeatureCollection
 */
export function detectGeometryTypes(features: GeoJSON.Feature[]): string[] {
  const set = new Set<string>();
  for (const f of features) {
    if (f.geometry?.type) {
      set.add(f.geometry.type);
    }
  }
  return Array.from(set);
}

/**
 * Parse GeoJSON or JSON string / buffer
 */
export async function parseGeoJSON(
  fileContent: string,
  fileName: string,
  sourceCRS: CRS
): Promise<Omit<SpatialLayer, 'id' | 'color' | 'opacity' | 'lineWidth' | 'pointSize' | 'visible' | 'createdAt'>> {
  const parsed = JSON.parse(fileContent);
  let featureCollection: GeoJSON.FeatureCollection;

  if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    featureCollection = parsed;
  } else if (parsed.type === 'Feature') {
    featureCollection = {
      type: 'FeatureCollection',
      features: [parsed],
    };
  } else if (parsed.type && parsed.coordinates) {
    featureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: parsed,
      }],
    };
  } else {
    throw new Error('File does not appear to contain valid GeoJSON geometry');
  }

  // Ensure every feature has an ID
  featureCollection.features = featureCollection.features.map((f, i) => ({
    ...f,
    id: f.id ?? `feat_${Date.now()}_${i}`,
    properties: f.properties || {},
  }));

  // Convert to WGS84 for MapLibre
  const wgs84GeoJSON = transformGeoJSON(featureCollection, sourceCRS, 'EPSG:4326');
  const bounds = calculateBounds(wgs84GeoJSON);
  const geometryTypes = detectGeometryTypes(wgs84GeoJSON.features);
  const fields = extractFields(wgs84GeoJSON.features);

  return {
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'geojson',
    sourceCRS,
    geojson: wgs84GeoJSON,
    featureCount: wgs84GeoJSON.features.length,
    geometryTypes,
    bounds,
    fields,
  };
}

export interface ParsedLayerOutput {
  layerData: Omit<SpatialLayer, 'id' | 'color' | 'opacity' | 'lineWidth' | 'pointSize' | 'visible' | 'createdAt'>;
  category: 'polygon' | 'line' | 'point' | 'mixed';
}

/**
 * Parse DXF file content (Points, Lines, Polylines, 3DFaces, Text)
 * Supports automatically separating into distinct layers by entity / geometry type
 */
export async function parseDXF(
  fileContent: string,
  fileName: string,
  sourceCRS: CRS,
  separateByEntityType: boolean = true
): Promise<ParsedLayerOutput[]> {
  const parser = new DxfParser();
  let dxfData: any;
  try {
    dxfData = parser.parseSync(fileContent);
  } catch (err: any) {
    throw new Error(`Failed to parse DXF structure: ${err?.message || 'Invalid DXF'}`);
  }

  if (!dxfData || !dxfData.entities || dxfData.entities.length === 0) {
    throw new Error('No supported entities found in DXF file');
  }

  const polygonFeatures: GeoJSON.Feature[] = [];
  const lineFeatures: GeoJSON.Feature[] = [];
  const pointFeatures: GeoJSON.Feature[] = [];

  for (let i = 0; i < dxfData.entities.length; i++) {
    const entity = dxfData.entities[i];
    const props: Record<string, any> = {
      layer: entity.layer || '0',
      handle: entity.handle || `h_${i}`,
      color: entity.color !== undefined ? String(entity.color) : 'Default',
      lineType: entity.lineType || 'Continuous',
      entityType: entity.type,
    };

    switch (entity.type) {
      case 'POINT': {
        if (entity.position) {
          pointFeatures.push({
            type: 'Feature',
            id: `dxf_${i}`,
            properties: props,
            geometry: {
              type: 'Point',
              coordinates: [entity.position.x, entity.position.y],
            },
          });
        }
        break;
      }
      case 'LINE': {
        if (entity.vertices && entity.vertices.length >= 2) {
          lineFeatures.push({
            type: 'Feature',
            id: `dxf_${i}`,
            properties: props,
            geometry: {
              type: 'LineString',
              coordinates: [
                [entity.vertices[0].x, entity.vertices[0].y],
                [entity.vertices[1].x, entity.vertices[1].y],
              ],
            },
          });
        }
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        if (entity.vertices && entity.vertices.length >= 2) {
          const coords = entity.vertices.map((v: any) => [v.x, v.y]);
          const isClosed = entity.shape === true || entity.closed === true;

          if (isClosed && coords.length >= 3) {
            const ring = [...coords];
            if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
              ring.push([ring[0][0], ring[0][1]]);
            }
            polygonFeatures.push({
              type: 'Feature',
              id: `dxf_${i}`,
              properties: { ...props, isClosed: true },
              geometry: {
                type: 'Polygon',
                coordinates: [ring],
              },
            });
          } else {
            lineFeatures.push({
              type: 'Feature',
              id: `dxf_${i}`,
              properties: { ...props, isClosed: false },
              geometry: {
                type: 'LineString',
                coordinates: coords,
              },
            });
          }
        }
        break;
      }
      case '3DFACE': {
        if (entity.vertices && entity.vertices.length >= 3) {
          const ring = entity.vertices.map((v: any) => [v.x, v.y]);
          ring.push([ring[0][0], ring[0][1]]);
          polygonFeatures.push({
            type: 'Feature',
            id: `dxf_${i}`,
            properties: props,
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          });
        }
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        if (entity.position) {
          pointFeatures.push({
            type: 'Feature',
            id: `dxf_${i}`,
            properties: { ...props, text: entity.text || entity.string || '' },
            geometry: {
              type: 'Point',
              coordinates: [entity.position.x, entity.position.y],
            },
          });
        }
        break;
      }
      case 'CIRCLE': {
        if (entity.center && entity.radius) {
          const segments = 32;
          const ring: [number, number][] = [];
          for (let s = 0; s <= segments; s++) {
            const angle = (s / segments) * 2 * Math.PI;
            ring.push([
              entity.center.x + entity.radius * Math.cos(angle),
              entity.center.y + entity.radius * Math.sin(angle),
            ]);
          }
          polygonFeatures.push({
            type: 'Feature',
            id: `dxf_${i}`,
            properties: { ...props, radius: entity.radius },
            geometry: {
              type: 'Polygon',
              coordinates: [ring],
            },
          });
        }
        break;
      }
      default:
        break;
    }
  }

  const totalFeatures = polygonFeatures.length + lineFeatures.length + pointFeatures.length;
  if (totalFeatures === 0) {
    throw new Error('DXF file contained no parseable point, line, or polygon geometry');
  }

  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const results: ParsedLayerOutput[] = [];

  // If user requested automatic separation and there are multiple types:
  if (separateByEntityType) {
    if (polygonFeatures.length > 0) {
      const rawColl: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: polygonFeatures };
      const wgs84 = transformGeoJSON(rawColl, sourceCRS, 'EPSG:4326');
      results.push({
        layerData: {
          name: `${baseName} - Polygons`,
          originalFileName: fileName,
          format: 'dxf',
          sourceCRS,
          geojson: wgs84,
          featureCount: wgs84.features.length,
          geometryTypes: ['Polygon'],
          bounds: calculateBounds(wgs84),
          fields: extractFields(wgs84.features),
        },
        category: 'polygon',
      });
    }

    if (lineFeatures.length > 0) {
      const rawColl: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: lineFeatures };
      const wgs84 = transformGeoJSON(rawColl, sourceCRS, 'EPSG:4326');
      results.push({
        layerData: {
          name: `${baseName} - Lines`,
          originalFileName: fileName,
          format: 'dxf',
          sourceCRS,
          geojson: wgs84,
          featureCount: wgs84.features.length,
          geometryTypes: ['LineString'],
          bounds: calculateBounds(wgs84),
          fields: extractFields(wgs84.features),
        },
        category: 'line',
      });
    }

    if (pointFeatures.length > 0) {
      const rawColl: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: pointFeatures };
      const wgs84 = transformGeoJSON(rawColl, sourceCRS, 'EPSG:4326');
      results.push({
        layerData: {
          name: `${baseName} - Points`,
          originalFileName: fileName,
          format: 'dxf',
          sourceCRS,
          geojson: wgs84,
          featureCount: wgs84.features.length,
          geometryTypes: ['Point'],
          bounds: calculateBounds(wgs84),
          fields: extractFields(wgs84.features),
        },
        category: 'point',
      });
    }
  } else {
    // Combined layer
    const allFeatures = [...polygonFeatures, ...lineFeatures, ...pointFeatures];
    const rawColl: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: allFeatures };
    const wgs84 = transformGeoJSON(rawColl, sourceCRS, 'EPSG:4326');
    results.push({
      layerData: {
        name: baseName,
        originalFileName: fileName,
        format: 'dxf',
        sourceCRS,
        geojson: wgs84,
        featureCount: wgs84.features.length,
        geometryTypes: detectGeometryTypes(wgs84.features),
        bounds: calculateBounds(wgs84),
        fields: extractFields(wgs84.features),
      },
      category: 'mixed',
    });
  }

  return results;
}

/**
 * Parse KML or KMZ files
 */
export async function parseKML(
  fileData: string | ArrayBuffer,
  fileName: string,
  sourceCRS: CRS
): Promise<Omit<SpatialLayer, 'id' | 'color' | 'opacity' | 'lineWidth' | 'pointSize' | 'visible' | 'createdAt'>> {
  let kmlText = '';

  if (typeof fileData === 'string') {
    kmlText = fileData;
  } else {
    // Check if it's a KMZ (ZIP)
    try {
      const zip = await JSZip.loadAsync(fileData);
      const kmlFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith('.kml'));
      if (kmlFile) {
        kmlText = await kmlFile.async('text');
      } else {
        kmlText = new TextDecoder().decode(fileData);
      }
    } catch {
      kmlText = new TextDecoder().decode(fileData);
    }
  }

  const parser = new DOMParser();
  const kmlDom = parser.parseFromString(kmlText, 'text/xml');
  const parsedGeo = toGeoJSON.kml(kmlDom);

  if (!parsedGeo || !parsedGeo.features || parsedGeo.features.length === 0) {
    throw new Error('KML file contained no valid placemarks or vector features');
  }

  const features: GeoJSON.Feature[] = parsedGeo.features
    .filter((f): f is typeof f & { geometry: NonNullable<typeof f.geometry> } => f.geometry !== null && f.geometry !== undefined)
    .map((f, i) => ({
      ...f,
      id: f.id ?? `kml_${i}`,
      properties: f.properties || {},
    }));

  const rawCollection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  // Usually KML is in WGS84 (EPSG:4326), but user can override if it's local grid or UTM
  const wgs84GeoJSON = transformGeoJSON(rawCollection, sourceCRS, 'EPSG:4326');
  const bounds = calculateBounds(wgs84GeoJSON);
  const geometryTypes = detectGeometryTypes(wgs84GeoJSON.features);
  const fields = extractFields(wgs84GeoJSON.features);

  return {
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'kml',
    sourceCRS,
    geojson: wgs84GeoJSON,
    featureCount: wgs84GeoJSON.features.length,
    geometryTypes,
    bounds,
    fields,
  };
}

/**
 * Parse Shapefile (.zip or ArrayBuffer) using shpjs
 */
export async function parseShapefile(
  buffer: ArrayBuffer,
  fileName: string,
  sourceCRS: CRS
): Promise<Omit<SpatialLayer, 'id' | 'color' | 'opacity' | 'lineWidth' | 'pointSize' | 'visible' | 'createdAt'>> {
  let geojsonResult: any;
  try {
    geojsonResult = await shp(buffer);
  } catch (err: any) {
    throw new Error(`Shapefile parsing error: ${err?.message || 'Invalid Shapefile archive. Make sure it contains .shp and .dbf files'}`);
  }

  let featureCollection: GeoJSON.FeatureCollection;
  if (Array.isArray(geojsonResult)) {
    // If archive had multiple layers, merge them or pick first
    featureCollection = geojsonResult[0] || { type: 'FeatureCollection', features: [] };
  } else if (geojsonResult && geojsonResult.type === 'FeatureCollection') {
    featureCollection = geojsonResult;
  } else {
    throw new Error('Parsed Shapefile did not yield a valid FeatureCollection');
  }

  featureCollection.features = featureCollection.features.map((f, i) => ({
    ...f,
    id: f.id ?? `shp_${i}`,
    properties: f.properties || {},
  }));

  // Re-project from sourceCRS to WGS84
  const wgs84GeoJSON = transformGeoJSON(featureCollection, sourceCRS, 'EPSG:4326');
  const bounds = calculateBounds(wgs84GeoJSON);
  const geometryTypes = detectGeometryTypes(wgs84GeoJSON.features);
  const fields = extractFields(wgs84GeoJSON.features);

  return {
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'shapefile',
    sourceCRS,
    geojson: wgs84GeoJSON,
    featureCount: wgs84GeoJSON.features.length,
    geometryTypes,
    bounds,
    fields,
  };
}

/**
 * Rapidly extract raw, unprojected features from a file to inspect coordinates and guess CRS
 */
export async function extractRawFeaturesFromFile(file: File): Promise<GeoJSON.Feature[]> {
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase();

  if (ext === 'geojson' || ext === 'json') {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
      return parsed.features;
    } else if (parsed.type === 'Feature') {
      return [parsed];
    }
    return [];
  } else if (ext === 'dxf') {
    const text = await file.text();
    const parser = new DxfParser();
    const dxfData: any = parser.parseSync(text);
    if (!dxfData || !dxfData.entities) return [];

    const raw: GeoJSON.Feature[] = [];
    for (let i = 0; i < Math.min(dxfData.entities.length, 500); i++) {
      const e = dxfData.entities[i];
      if (e.type === 'POINT' && e.position) {
        raw.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [e.position.x, e.position.y] } });
      } else if (e.type === 'LINE' && e.vertices && e.vertices.length >= 2) {
        raw.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[e.vertices[0].x, e.vertices[0].y], [e.vertices[1].x, e.vertices[1].y]] } });
      } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices && e.vertices.length >= 2) {
        const coords = e.vertices.map((v: any) => [v.x, v.y]);
        raw.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
      } else if (e.type === '3DFACE' && e.vertices && e.vertices.length >= 3) {
        raw.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [e.vertices.map((v: any) => [v.x, v.y])] } });
      }
    }
    return raw;
  } else if (ext === 'kml') {
    const text = await file.text();
    const parser = new DOMParser();
    const kmlDom = parser.parseFromString(text, 'text/xml');
    const parsedGeo = toGeoJSON.kml(kmlDom);
    return parsedGeo.features.filter((f): f is typeof f & { geometry: NonNullable<typeof f.geometry> } => f.geometry !== null && f.geometry !== undefined);
  } else if (ext === 'kmz' || ext === 'zip' || ext === 'shp') {
    const buffer = await file.arrayBuffer();
    if (ext === 'kmz') {
      const zip = await JSZip.loadAsync(buffer);
      const kmlFile = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith('.kml'));
      if (kmlFile) {
        const kmlText = await kmlFile.async('text');
        const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');
        const parsedGeo = toGeoJSON.kml(kmlDom);
        return parsedGeo.features.filter((f): f is typeof f & { geometry: NonNullable<typeof f.geometry> } => f.geometry !== null && f.geometry !== undefined);
      }
    }
    const geojsonResult: any = await shp(buffer);
    if (Array.isArray(geojsonResult)) return geojsonResult[0]?.features || [];
    if (geojsonResult && geojsonResult.features) return geojsonResult.features;
    return [];
  } else if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const text = await file.text();
    const inspection = inspectCSV(text);
    if (inspection.sampleCoordinates.length > 0) {
      return inspection.sampleCoordinates.map((coord, idx) => ({
        type: 'Feature',
        id: `raw_csv_${idx}`,
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: coord,
        },
      }));
    }
    return [];
  }

  return [];
}

export interface CSVInspection {
  columns: string[];
  delimiter: string;
  previewRows: Record<string, string>[];
  totalRows: number;
  guessedX: string;
  guessedY: string;
  sampleCoordinates: [number, number][];
}

/**
 * Split a delimited line handling quoted values
 */
export function parseDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === 'whitespace') {
    return line.trim().split(/\s+/);
  }
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      if (inQuotes && line[i + 1] === char) {
        current += char;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Auto-detect delimiter from text
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  if (lines.length === 0) return ',';

  const delimiters = [',', ';', '\t', '|'];
  let bestDelim = ',';
  let bestCount = -1;

  for (const d of delimiters) {
    const counts = lines.map((l) => parseDelimitedLine(l, d).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const isConsistent = counts.every((c) => c === counts[0]);
    if (isConsistent && counts[0] > 1 && counts[0] > bestCount) {
      bestCount = counts[0];
      bestDelim = d;
    } else if (avg > 1 && avg > bestCount) {
      bestCount = avg;
      bestDelim = d;
    }
  }

  return bestDelim;
}

/**
 * Inspect CSV text and return columns, preview rows, and guessed coordinate columns
 */
export function inspectCSV(text: string, customDelimiter?: string): CSVInspection {
  const delimiter = customDelimiter || detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      columns: [],
      delimiter,
      previewRows: [],
      totalRows: 0,
      guessedX: '',
      guessedY: '',
      sampleCoordinates: [],
    };
  }

  const headerLine = lines[0];
  const columns = parseDelimitedLine(headerLine, delimiter).map((col) =>
    col.replace(/^["']|["']$/g, '').trim()
  );

  const previewRows: Record<string, string>[] = [];
  const sampleCoordinates: [number, number][] = [];

  // Guess X and Y column names
  let guessedX = '';
  let guessedY = '';

  const xCandidates = ['longitude', 'lon', 'long', 'x', 'easting', 'east', 'xcoord', 'x_coord', 'ttp_e', 'utm_e'];
  const yCandidates = ['latitude', 'lat', 'y', 'northing', 'north', 'ycoord', 'y_coord', 'ttp_n', 'utm_n'];

  for (const col of columns) {
    const lower = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!guessedX && xCandidates.includes(lower)) {
      guessedX = col;
    }
    if (!guessedY && yCandidates.includes(lower)) {
      guessedY = col;
    }
  }

  // Fallback heuristic if not exact
  if (!guessedX) {
    guessedX = columns.find((c) => /^(x|lon|east)/i.test(c.trim())) || columns[0] || '';
  }
  if (!guessedY) {
    guessedY = columns.find((c) => /^(y|lat|north)/i.test(c.trim())) || (columns[1] || columns[0] || '');
  }

  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    const vals = parseDelimitedLine(lines[i], delimiter);
    const rowObj: Record<string, string> = {};
    columns.forEach((col, cIdx) => {
      rowObj[col] = vals[cIdx] !== undefined ? vals[cIdx].replace(/^["']|["']$/g, '').trim() : '';
    });
    previewRows.push(rowObj);

    if (guessedX && guessedY && rowObj[guessedX] && rowObj[guessedY]) {
      const x = parseFloat(rowObj[guessedX]);
      const y = parseFloat(rowObj[guessedY]);
      if (!isNaN(x) && !isNaN(y)) {
        sampleCoordinates.push([x, y]);
      }
    }
  }

  return {
    columns,
    delimiter,
    previewRows,
    totalRows: Math.max(0, lines.length - 1),
    guessedX,
    guessedY,
    sampleCoordinates,
  };
}

/**
 * Parse CSV into SpatialLayer point FeatureCollection with CRS transform
 */
export async function parseCSV(
  text: string,
  fileName: string,
  options: {
    delimiter: string;
    xColumn: string;
    yColumn: string;
    sourceCRS: CRS;
  }
): Promise<Omit<SpatialLayer, 'id' | 'color' | 'opacity' | 'lineWidth' | 'pointSize' | 'visible' | 'createdAt'>> {
  const { delimiter, xColumn, yColumn, sourceCRS } = options;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV file must contain a header row and at least one data row.');
  }

  const columns = parseDelimitedLine(lines[0], delimiter).map((c) =>
    c.replace(/^["']|["']$/g, '').trim()
  );

  const xIdx = columns.indexOf(xColumn);
  const yIdx = columns.indexOf(yColumn);

  if (xIdx === -1 || yIdx === -1) {
    throw new Error(`Specified coordinate columns (${xColumn}, ${yColumn}) were not found in the CSV header.`);
  }

  const features: GeoJSON.Feature[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseDelimitedLine(lines[i], delimiter);
    const xRaw = vals[xIdx]?.replace(/^["']|["']$/g, '').trim();
    const yRaw = vals[yIdx]?.replace(/^["']|["']$/g, '').trim();

    if (!xRaw || !yRaw) continue;
    const x = parseFloat(xRaw);
    const y = parseFloat(yRaw);
    if (isNaN(x) || isNaN(y)) continue;

    // Transform coordinate [x, y] from sourceCRS to WGS84 EPSG:4326
    const [wgs84Lng, wgs84Lat] = transformCoordinate([x, y], sourceCRS, 'EPSG:4326');

    // Build row properties
    const props: Record<string, any> = {};
    columns.forEach((col, cIdx) => {
      const v = vals[cIdx]?.replace(/^["']|["']$/g, '').trim() ?? '';
      const num = Number(v);
      props[col] = !isNaN(num) && v !== '' ? num : v;
    });

    features.push({
      type: 'Feature',
      id: `pt_${i}`,
      properties: props,
      geometry: {
        type: 'Point',
        coordinates: [wgs84Lng, wgs84Lat],
      },
    });
  }

  if (features.length === 0) {
    throw new Error('No valid point coordinates could be parsed using the selected columns.');
  }

  const collection: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  };

  const bounds = calculateBounds(collection);

  return {
    name: fileName.replace(/\.[^/.]+$/, ''),
    originalFileName: fileName,
    format: 'csv',
    sourceCRS,
    geojson: collection,
    featureCount: collection.features.length,
    geometryTypes: ['Point'],
    bounds,
    fields: extractFields(collection.features),
  };
}

