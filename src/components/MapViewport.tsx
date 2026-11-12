import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { BasemapStyle, InspectionFeature, SpatialLayer } from '../types/spatial';
import { geo2Ttp } from '../utils/coordinateTransform';
import proj4 from 'proj4';
import { BoxSelect, Trash2, Wand2, X, CheckSquare } from 'lucide-react';

// Configure MapLibre worker URL so it resolves to the bundled worker rather than 404 in .vite/deps
try {
  const resolvedWorkerUrl = typeof window !== 'undefined'
    ? new URL(workerUrl, window.location.origin).href
    : workerUrl;
  maplibregl.setWorkerUrl(resolvedWorkerUrl);
} catch {
  maplibregl.setWorkerUrl(workerUrl);
}

interface MapViewportProps {
  layers: SpatialLayer[];
  selectedLayerId: string | null;
  selectedFeatureIndices: number[];
  basemap: BasemapStyle;
  onSelectFeatures: (indices: number[], lastSelectedFeature?: InspectionFeature | null) => void;
  onDeleteSelectedFeatures?: () => void;
  onOpenGeoprocessing?: () => void;
  onFitBoundsRequest?: (bounds: [number, number, number, number]) => void;
}

const BASEMAP_STYLES: Record<BasemapStyle, any> = {
  satellite: {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
        tileSize: 256,
        attribution: 'Google Satellite',
      },
      'carto-labels': {
        type: 'raster',
        tiles: [
          'https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: 'esri-satellite-layer',
        type: 'raster',
        source: 'esri-satellite',
        minzoom: 0,
        maxzoom: 20,
      },
      {
        id: 'carto-labels-layer',
        type: 'raster',
        source: 'carto-labels',
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  },
  dark: {
    version: 8,
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png'],
        tileSize: 256,
        attribution: '© CARTO, © OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'carto-dark-layer',
        type: 'raster',
        source: 'carto-dark',
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  },
  streets: {
    version: 8,
    sources: {
      'osm-tiles': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm-tiles-layer',
        type: 'raster',
        source: 'osm-tiles',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
  topo: {
    version: 8,
    sources: {
      'opentopo': {
        type: 'raster',
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenTopoMap, © OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'opentopo-layer',
        type: 'raster',
        source: 'opentopo',
        minzoom: 0,
        maxzoom: 17,
      },
    ],
  },
};

export const MapViewport: React.FC<MapViewportProps> = ({
  layers,
  selectedLayerId,
  selectedFeatureIndices,
  basemap,
  onSelectFeatures,
  onDeleteSelectedFeatures,
  onOpenGeoprocessing,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const activeLayersRef = useRef<string[]>([]);
  const isBoxSelectActiveRef = useRef<boolean>(false);
  const [isBoxSelectActive, setIsBoxSelectActive] = React.useState<boolean>(false);

  // Sync ref
  useEffect(() => {
    isBoxSelectActiveRef.current = isBoxSelectActive;
  }, [isBoxSelectActive]);

  // Keep latest layers & selection in refs for event listeners
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const selectedLayerIdRef = useRef(selectedLayerId);
  selectedLayerIdRef.current = selectedLayerId;
  const selectedIndicesRef = useRef(selectedFeatureIndices);
  selectedIndicesRef.current = selectedFeatureIndices;

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Default center near Kalimantan / Tutupan mining region (115.54°E, 2.12°S)
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAP_STYLES[basemap],
      center: [115.54, -2.12],
      zoom: 11,
      pitch: 0,
      bearing: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('error', (e) => {
      console.warn('MapLibre notice:', e?.error?.message || e);
    });

    // Box selection drag variables
    let isDragging = false;
    let startPoint: maplibregl.Point | null = null;
    let boxCanvas: HTMLDivElement | null = null;

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (!isBoxSelectActiveRef.current || (e.originalEvent as MouseEvent).button !== 0) return;
      isDragging = true;
      startPoint = e.point;
      map.dragPan.disable();

      if (!boxCanvas && mapContainer.current) {
        boxCanvas = document.createElement('div');
        boxCanvas.className = 'absolute pointer-events-none border-2 border-amber-400 bg-amber-400/20 z-20';
        mapContainer.current.appendChild(boxCanvas);
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!isDragging || !startPoint || !boxCanvas) return;
      const currentPoint = e.point;
      const minX = Math.min(startPoint.x, currentPoint.x);
      const maxX = Math.max(startPoint.x, currentPoint.x);
      const minY = Math.min(startPoint.y, currentPoint.y);
      const maxY = Math.max(startPoint.y, currentPoint.y);

      boxCanvas.style.left = `${minX}px`;
      boxCanvas.style.top = `${minY}px`;
      boxCanvas.style.width = `${maxX - minX}px`;
      boxCanvas.style.height = `${maxY - minY}px`;
    };

    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      if (!isDragging || !startPoint) return;
      isDragging = false;
      map.dragPan.enable();

      if (boxCanvas && boxCanvas.parentNode) {
        boxCanvas.parentNode.removeChild(boxCanvas);
        boxCanvas = null;
      }

      const endPoint = e.point;
      const minX = Math.min(startPoint.x, endPoint.x);
      const maxX = Math.max(startPoint.x, endPoint.x);
      const minY = Math.min(startPoint.y, endPoint.y);
      const maxY = Math.max(startPoint.y, endPoint.y);

      // If user merely clicked without dragging, let standard click handler handle it
      if (Math.abs(maxX - minX) < 5 && Math.abs(maxY - minY) < 5) {
        startPoint = null;
        return;
      }

      // Query features in box from the active layer
      const curLayerId = selectedLayerIdRef.current;
      const allActiveLayers = activeLayersRef.current;
      const targetLayerIds = curLayerId
        ? allActiveLayers.filter((id) => id.endsWith(`-${curLayerId}`))
        : allActiveLayers;

      if (targetLayerIds.length > 0) {
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [minX, minY],
          [maxX, maxY],
        ];
        const boxedFeatures = map.queryRenderedFeatures(bbox, { layers: targetLayerIds });
        const newIndices = new Set<number>(
          (e.originalEvent as MouseEvent).shiftKey ? selectedIndicesRef.current : []
        );

        boxedFeatures.forEach((f) => {
          if (f.properties && f.properties._sys_idx !== undefined) {
            newIndices.add(Number(f.properties._sys_idx));
          }
        });

        onSelectFeatures(Array.from(newIndices));
      }

      startPoint = null;
    };

    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);

    map.on('load', () => {
      mapRef.current = map;
      syncMapLayers();
    });

    // Feature click inspection handler
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (!mapRef.current) return;
      if (isBoxSelectActiveRef.current) return; // Managed by drag

      const interactiveLayerIds = activeLayersRef.current;
      if (interactiveLayerIds.length === 0) {
        onSelectFeatures([]);
        if (popupRef.current) popupRef.current.remove();
        return;
      }

      const features = map.queryRenderedFeatures(e.point, {
        layers: interactiveLayerIds,
      });

      if (features.length > 0) {
        const feat = features[0];
        const layerId = (feat.layer.metadata as any)?.parentLayerId || feat.layer.id.split('-')[1];
        const targetLayer = layersRef.current.find((l) => l.id === layerId);

        const featureIdx = (feat.properties as any)?._sys_idx !== undefined
          ? Number((feat.properties as any)._sys_idx)
          : 0;

        const isMulti = (e.originalEvent as MouseEvent).shiftKey || (e.originalEvent as MouseEvent).ctrlKey || (e.originalEvent as MouseEvent).metaKey;

        let nextIndices: number[];
        if (isMulti) {
          const current = new Set(selectedIndicesRef.current);
          if (current.has(featureIdx)) {
            current.delete(featureIdx);
          } else {
            current.add(featureIdx);
          }
          nextIndices = Array.from(current);
        } else {
          nextIndices = [featureIdx];
        }

        const lng = e.lngLat.lng;
        const lat = e.lngLat.lat;

        // Compute coordinates in UTM 50S and Tutupan
        let utmText = 'N/A';
        let tutupanText = 'N/A';
        try {
          const [utmE, utmN] = proj4('EPSG:4326', 'EPSG:32750', [lng, lat]);
          utmText = `E: ${utmE.toFixed(2)}m, N: ${utmN.toFixed(2)}m`;
        } catch {}

        try {
          const [ttpE, ttpN] = geo2Ttp(lng, lat);
          tutupanText = `E: ${ttpE.toFixed(2)}m, N: ${ttpN.toFixed(2)}m`;
        } catch {}

        const inspection: InspectionFeature = {
          layerId: layerId,
          layerName: targetLayer?.name || 'Layer',
          featureIndex: featureIdx,
          geometryType: feat.geometry.type,
          properties: { ...feat.properties },
          coordinates: (feat.geometry as any).coordinates,
          lngLat: [lng, lat],
        };

        onSelectFeatures(nextIndices, inspection);

        // Show Popup for clicked feature
        if (popupRef.current) popupRef.current.remove();

        const propsHtml = Object.entries(feat.properties || {})
          .filter(([k]) => !k.startsWith('_sys_'))
          .slice(0, 6)
          .map(
            ([k, v]) => `
            <div class="flex items-center justify-between text-xs py-0.5 border-b border-slate-800">
              <span class="text-slate-400 font-mono">${k}</span>
              <span class="text-slate-200 font-medium font-mono">${String(v)}</span>
            </div>`
          )
          .join('');

        const popupContent = `
          <div class="space-y-2 min-w-[240px] text-xs">
            <div class="flex items-center justify-between font-semibold border-b border-slate-700 pb-1.5">
              <span class="text-emerald-400">${targetLayer?.name || 'Feature'}</span>
              <span class="text-slate-400 text-[10px] font-mono uppercase">${feat.geometry.type} (#${featureIdx + 1})</span>
            </div>
            
            <div class="space-y-1 py-1">
              ${propsHtml || '<p class="text-slate-500 italic">No attributes</p>'}
            </div>

            <div class="bg-slate-900/90 rounded p-1.5 font-mono text-[10px] space-y-0.5 border border-slate-800">
              <div class="text-slate-400">WGS84: <span class="text-slate-200">${lat.toFixed(6)}°, ${lng.toFixed(6)}°</span></div>
              <div class="text-slate-400">UTM 50S: <span class="text-amber-300">${utmText}</span></div>
              <div class="text-slate-400">Tutupan: <span class="text-emerald-300">${tutupanText}</span></div>
            </div>
          </div>
        `;

        const popup = new maplibregl.Popup({ closeOnClick: false, offset: 12 })
          .setLngLat([lng, lat])
          .setHTML(popupContent)
          .addTo(map);

        popupRef.current = popup;
      } else {
        // Clicked on empty space: clear selection
        onSelectFeatures([]);
        if (popupRef.current) popupRef.current.remove();
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Listen for window fitbounds trigger
  useEffect(() => {
    const handleFit = (e: any) => {
      const bounds = e.detail;
      const map = mapRef.current;
      if (map && bounds && bounds.length === 4) {
        map.fitBounds(bounds, { padding: 50, duration: 1000, maxZoom: 17 });
      }
    };
    window.addEventListener('map:fitbounds', handleFit);
    return () => window.removeEventListener('map:fitbounds', handleFit);
  }, []);

  // Update basemap style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.setStyle(BASEMAP_STYLES[basemap]);
    map.once('style.load', () => {
      syncMapLayers();
    });
  }, [basemap]);

  // Synchronize vector layers
  const syncMapLayers = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const interactiveIds: string[] = [];

    // Process all user layers
    layers.forEach((layer) => {
      const sourceId = `src-${layer.id}`;
      const fillLayerId = `fill-${layer.id}`;
      const lineLayerId = `line-${layer.id}`;
      const pointLayerId = `point-${layer.id}`;

      // Attach index to feature properties for reliable two-way selection
      const enrichedGeoJSON: GeoJSON.FeatureCollection = {
        ...layer.geojson,
        features: layer.geojson.features.map((f, i) => ({
          ...f,
          properties: {
            ...f.properties,
            _sys_idx: i,
          },
        })),
      };

      // Add or update GeoJSON source
      if (map.getSource(sourceId)) {
        (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(enrichedGeoJSON);
      } else {
        map.addSource(sourceId, {
          type: 'geojson',
          data: enrichedGeoJSON,
        });
      }

      // 1. Polygon Fill Layer
      if (!map.getLayer(fillLayerId)) {
        map.addLayer({
          id: fillLayerId,
          type: 'fill',
          source: sourceId,
          filter: ['==', '$type', 'Polygon'],
          metadata: { parentLayerId: layer.id },
          paint: {
            'fill-color': layer.color,
            'fill-opacity': layer.visible ? (layer.opacity ?? 0.4) : 0,
          },
        });
      } else {
        map.setPaintProperty(fillLayerId, 'fill-color', layer.color);
        map.setPaintProperty(fillLayerId, 'fill-opacity', layer.visible ? (layer.opacity ?? 0.4) : 0);
      }

      // 2. Line Layer (Outlines for polygons + standalone lines)
      if (!map.getLayer(lineLayerId)) {
        map.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          metadata: { parentLayerId: layer.id },
          paint: {
            'line-color': layer.color,
            'line-width': layer.lineWidth ?? 2,
            'line-opacity': layer.visible ? 0.95 : 0,
          },
        });
      } else {
        map.setPaintProperty(lineLayerId, 'line-color', layer.color);
        map.setPaintProperty(lineLayerId, 'line-width', layer.lineWidth ?? 2);
        map.setPaintProperty(lineLayerId, 'line-opacity', layer.visible ? 0.95 : 0);
      }

      // 3. Point Circle Layer
      if (!map.getLayer(pointLayerId)) {
        map.addLayer({
          id: pointLayerId,
          type: 'circle',
          source: sourceId,
          filter: ['==', '$type', 'Point'],
          metadata: { parentLayerId: layer.id },
          paint: {
            'circle-color': layer.color,
            'circle-radius': layer.pointSize ?? 5,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': layer.visible ? 0.95 : 0,
            'circle-stroke-opacity': layer.visible ? 0.9 : 0,
          },
        });
      } else {
        map.setPaintProperty(pointLayerId, 'circle-color', layer.color);
        map.setPaintProperty(pointLayerId, 'circle-radius', layer.pointSize ?? 5);
        map.setPaintProperty(pointLayerId, 'circle-opacity', layer.visible ? 0.95 : 0);
        map.setPaintProperty(pointLayerId, 'circle-stroke-opacity', layer.visible ? 0.9 : 0);
      }

      if (layer.visible) {
        interactiveIds.push(fillLayerId, lineLayerId, pointLayerId);
      }
    });

    // Remove obsolete layers
    const currentLayerIds = new Set(layers.map((l) => l.id));
    activeLayersRef.current.forEach((activeId) => {
      const parentId = activeId.replace(/^(fill|line|point)-/, '');
      if (!currentLayerIds.has(parentId)) {
        if (map.getLayer(activeId)) map.removeLayer(activeId);
        const sourceId = `src-${parentId}`;
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    });

    // Re-stack vector layers according to layer order (reverse order so top of list is on top)
    const reversed = [...layers].reverse();
    reversed.forEach((layer) => {
      const fillLayerId = `fill-${layer.id}`;
      const lineLayerId = `line-${layer.id}`;
      const pointLayerId = `point-${layer.id}`;
      if (map.getLayer(fillLayerId)) map.moveLayer(fillLayerId);
      if (map.getLayer(lineLayerId)) map.moveLayer(lineLayerId);
      if (map.getLayer(pointLayerId)) map.moveLayer(pointLayerId);
    });

    // Keep selection highlight layers on top of all data layers
    if (map.getLayer('selection-highlight-fill')) map.moveLayer('selection-highlight-fill');
    if (map.getLayer('selection-highlight-line')) map.moveLayer('selection-highlight-line');
    if (map.getLayer('selection-highlight-point')) map.moveLayer('selection-highlight-point');

    activeLayersRef.current = interactiveIds;
    syncSelectionHighlight();
  };

  // Synchronize selection highlight layer
  const syncSelectionHighlight = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const curLayer = layers.find((l) => l.id === selectedLayerId);
    const selectedFeatures: GeoJSON.Feature[] = [];

    if (curLayer && selectedFeatureIndices.length > 0) {
      const idxSet = new Set(selectedFeatureIndices);
      curLayer.geojson.features.forEach((f, i) => {
        if (idxSet.has(i)) {
          selectedFeatures.push(f);
        }
      });
    }

    const highlightFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: selectedFeatures,
    };

    const selSourceId = 'selection-highlight-src';
    if (map.getSource(selSourceId)) {
      (map.getSource(selSourceId) as maplibregl.GeoJSONSource).setData(highlightFC);
    } else {
      map.addSource(selSourceId, {
        type: 'geojson',
        data: highlightFC,
      });

      // Selection fill layer
      map.addLayer({
        id: 'selection-highlight-fill',
        type: 'fill',
        source: selSourceId,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#FACC15',
          'fill-opacity': 0.35,
        },
      });

      // Selection line layer (glowing yellow outline)
      map.addLayer({
        id: 'selection-highlight-line',
        type: 'line',
        source: selSourceId,
        paint: {
          'line-color': '#FACC15',
          'line-width': 4,
          'line-opacity': 1,
        },
      });

      // Selection circle layer (points)
      map.addLayer({
        id: 'selection-highlight-point',
        type: 'circle',
        source: selSourceId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-color': '#FACC15',
          'circle-radius': 8,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1,
        },
      });
    }
  };

  useEffect(() => {
    syncMapLayers();
  }, [layers]);

  useEffect(() => {
    syncSelectionHighlight();
  }, [selectedLayerId, selectedFeatureIndices, layers]);

  // Handle selected feature flyTo (when single feature is selected)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedLayerId || selectedFeatureIndices.length !== 1) return;

    const layer = layers.find((l) => l.id === selectedLayerId);
    if (!layer) return;

    const feat = layer.geojson.features[selectedFeatureIndices[0]];
    if (!feat || !feat.geometry) return;

    if (feat.geometry.type === 'Point') {
      const coords = (feat.geometry as GeoJSON.Point).coordinates;
      map.flyTo({ center: [coords[0], coords[1]], zoom: Math.max(map.getZoom(), 14), duration: 800 });
    }
  }, [selectedLayerId, selectedFeatureIndices]);

  const activeLayer = layers.find((l) => l.id === selectedLayerId);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapContainer}
        className={`w-full h-full ${isBoxSelectActive ? 'cursor-crosshair' : ''}`}
      />

      {/* Map Tools: Box Select Mode Toggle */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsBoxSelectActive(!isBoxSelectActive)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shadow-lg backdrop-blur-md transition-all ${
            isBoxSelectActive
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/80 ring-1 ring-amber-400'
              : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:text-slate-100 hover:bg-slate-800'
          }`}
          title={isBoxSelectActive ? 'Box select enabled: click and drag on map to select features' : 'Click to enable box drag-selection'}
        >
          <BoxSelect className="w-3.5 h-3.5 text-amber-400" />
          <span>Box Select</span>
          {isBoxSelectActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-0.5" />
          )}
        </button>

        {isBoxSelectActive && (
          <span className="text-[11px] font-mono text-amber-300/90 bg-slate-950/80 px-2 py-1 rounded border border-amber-500/30">
            Drag rectangle to select features (Shift+Drag to add)
          </span>
        )}
      </div>

      {/* Floating Interactive Multi-Selection Bar */}
      {selectedFeatureIndices.length > 0 && activeLayer && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/95 border border-amber-500/50 rounded-xl px-4 py-2 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
            <CheckSquare className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-slate-100 font-mono">
              {selectedFeatureIndices.length}{' '}
              <span className="text-slate-400 font-sans font-normal text-[11px]">
                feature{selectedFeatureIndices.length > 1 ? 's' : ''} in{' '}
                <strong className="text-amber-300 font-semibold">{activeLayer.name}</strong>
              </span>
            </span>
          </div>

          {/* Action: Geoprocess Selected */}
          {onOpenGeoprocessing && (
            <button
              onClick={onOpenGeoprocessing}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-lg transition-colors"
              title="Run geoprocessing on selected features"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Buffer / Polygonize</span>
            </button>
          )}

          {/* Action: Delete Selected */}
          {onDeleteSelectedFeatures && (
            <button
              onClick={onDeleteSelectedFeatures}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 rounded-lg transition-colors"
              title="Delete all selected features"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Delete ({selectedFeatureIndices.length})</span>
            </button>
          )}

          {/* Action: Clear Selection */}
          <button
            onClick={() => onSelectFeatures([])}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors ml-1"
            title="Clear feature selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
