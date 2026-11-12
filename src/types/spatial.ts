export type CRS = 'EPSG:4326' | 'EPSG:32750' | 'TUTUPAN';

export interface CRSDefinition {
  code: CRS;
  name: string;
  category: 'Geographic' | 'Projected UTM' | 'Local Grid';
  description: string;
  unit: string;
}

export const SUPPORTED_CRS: CRSDefinition[] = [
  {
    code: 'EPSG:4326',
    name: 'WGS 84 (Geographic)',
    category: 'Geographic',
    description: 'Latitude / Longitude coordinates (Standard GPS & Web Cartography)',
    unit: 'degrees',
  },
  {
    code: 'EPSG:32750',
    name: 'WGS 84 / UTM zone 50S',
    category: 'Projected UTM',
    description: 'Universal Transverse Mercator Zone 50 South (Kalimantan / Indonesia)',
    unit: 'meters',
  },
  {
    code: 'TUTUPAN',
    name: 'Local Coordinate System (Tutupan)',
    category: 'Local Grid',
    description: 'Calibrated site grid for Tutupan mine with 7-parameter Helmert / local scale transformation',
    unit: 'meters',
  },
];

export type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';

export interface SpatialLayer {
  id: string;
  name: string;
  originalFileName: string;
  format: 'geojson' | 'shapefile' | 'dxf' | 'kml' | 'csv';
  sourceCRS: CRS;
  geojson: GeoJSON.FeatureCollection;
  featureCount: number;
  geometryTypes: string[];
  color: string;
  opacity: number;
  lineWidth: number;
  pointSize: number;
  visible: boolean;
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat] in WGS84
  createdAt: number;
  fields: { name: string; type: 'string' | 'number' | 'boolean' }[];
}

export interface InspectionFeature {
  layerId: string;
  layerName: string;
  featureIndex: number;
  geometryType: string;
  properties: Record<string, any>;
  coordinates: any;
  lngLat?: [number, number];
}

export type BasemapStyle = 'satellite' | 'streets' | 'dark' | 'topo';
