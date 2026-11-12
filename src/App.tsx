import React, { useState, useCallback } from 'react';
import * as turf from '@turf/turf';
import { BasemapStyle, InspectionFeature, SpatialLayer } from './types/spatial';
import { Header } from './components/Header';
import { LayerSidebar } from './components/LayerSidebar';
import { MapViewport } from './components/MapViewport';
import { AttributeTable } from './components/AttributeTable';
import { UploadModal } from './components/UploadModal';
import { ExportModal } from './components/ExportModal';
import { GeoprocessingModal } from './components/GeoprocessingModal';

export default function App() {
  const [layers, setLayers] = useState<SpatialLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedFeatureIndices, setSelectedFeatureIndices] = useState<number[]>([]);
  const [basemap, setBasemap] = useState<BasemapStyle>('satellite');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isGeoprocessingOpen, setIsGeoprocessingOpen] = useState(false);
  const [isTableCollapsed, setIsTableCollapsed] = useState(false);
  const [isLayerPanelVisible, setIsLayerPanelVisible] = useState(true);
  const [exportModalLayer, setExportModalLayer] = useState<SpatialLayer | null>(null);

  // Fit bounds helper (can be passed to map)
  const handleFitBounds = useCallback((bounds: [number, number, number, number]) => {
    const event = new CustomEvent('map:fitbounds', { detail: bounds });
    window.dispatchEvent(event);
  }, []);

  // Add new parsed layer
  const handleAddLayer = useCallback((newLayer: SpatialLayer) => {
    setLayers((prev) => [newLayer, ...prev]);
    setSelectedLayerId(newLayer.id);
    setSelectedFeatureIndices([]);
    setIsTableCollapsed(false);
    setTimeout(() => {
      handleFitBounds(newLayer.bounds);
    }, 100);
  }, [handleFitBounds]);

  // Add multiple new parsed layers (e.g. from separated DXF entities)
  const handleAddLayers = useCallback((newLayers: SpatialLayer[]) => {
    if (newLayers.length === 0) return;
    setLayers((prev) => [...newLayers, ...prev]);
    setSelectedLayerId(newLayers[0].id);
    setSelectedFeatureIndices([]);
    setIsTableCollapsed(false);

    // Calculate combined bounding box of all added layers
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    newLayers.forEach((l) => {
      minLng = Math.min(minLng, l.bounds[0]);
      minLat = Math.min(minLat, l.bounds[1]);
      maxLng = Math.max(maxLng, l.bounds[2]);
      maxLat = Math.max(maxLat, l.bounds[3]);
    });

    if (isFinite(minLng)) {
      setTimeout(() => {
        handleFitBounds([minLng, minLat, maxLng, maxLat]);
      }, 100);
    }
  }, [handleFitBounds]);

  // Update existing layer (e.g. style changes or attribute edits)
  const handleUpdateLayer = useCallback((updatedLayer: SpatialLayer) => {
    setLayers((prev) => prev.map((l) => (l.id === updatedLayer.id ? updatedLayer : l)));
  }, []);

  // Delete layer
  const handleDeleteLayer = useCallback((layerId: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== layerId));
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
      setSelectedFeatureIndices([]);
    }
  }, [selectedLayerId]);

  // Select layer (and reset selection)
  const handleSelectLayer = useCallback((layerId: string) => {
    setSelectedLayerId(layerId);
    setSelectedFeatureIndices([]);
  }, []);

  // Reorder layers list
  const handleReorderLayers = useCallback((newLayers: SpatialLayer[]) => {
    setLayers(newLayers);
  }, []);

  // Handle map click feature selection (supports multi-selection toggling)
  const handleMapSelectFeatures = useCallback((indices: number[], lastInspection?: InspectionFeature | null) => {
    setSelectedFeatureIndices(indices);
    if (lastInspection) {
      setSelectedLayerId(lastInspection.layerId);
    }
  }, []);

  // Batch delete selected features from the currently selected layer
  const handleDeleteSelectedFeatures = useCallback(() => {
    if (!selectedLayerId || selectedFeatureIndices.length === 0) return;
    const targetLayer = layers.find((l) => l.id === selectedLayerId);
    if (!targetLayer) return;

    const toRemove = new Set(selectedFeatureIndices);
    const remainingFeatures = targetLayer.geojson.features.filter((_, i) => !toRemove.has(i));

    // Recompute bounds without geometric simplification
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    remainingFeatures.forEach((f) => {
      try {
        const b = turf.bbox(f);
        minLng = Math.min(minLng, b[0]);
        minLat = Math.min(minLat, b[1]);
        maxLng = Math.max(maxLng, b[2]);
        maxLat = Math.max(maxLat, b[3]);
      } catch {}
    });

    const newBounds: [number, number, number, number] = isFinite(minLng)
      ? [minLng, minLat, maxLng, maxLat]
      : targetLayer.bounds;

    const updatedLayer: SpatialLayer = {
      ...targetLayer,
      featureCount: remainingFeatures.length,
      bounds: newBounds,
      geojson: {
        ...targetLayer.geojson,
        features: remainingFeatures,
      },
    };

    setLayers((prev) => prev.map((l) => (l.id === selectedLayerId ? updatedLayer : l)));
    setSelectedFeatureIndices([]);
  }, [selectedLayerId, selectedFeatureIndices, layers]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header Contract */}
      <Header
        layers={layers}
        basemap={basemap}
        onChangeBasemap={setBasemap}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenGeoprocessing={() => setIsGeoprocessingOpen(true)}
        isTableCollapsed={isTableCollapsed}
        onToggleTable={() => setIsTableCollapsed(!isTableCollapsed)}
        isLayerPanelVisible={isLayerPanelVisible}
        onToggleLayerPanel={() => setIsLayerPanelVisible((v) => !v)}
      />

      {/* Main Workspace Split: Sidebar + Map + Bottom Attribute Table */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Layer Management & Coordinate Inspector Sidebar */}
        <LayerSidebar
          layers={layers}
          selectedLayerId={selectedLayerId}
          onSelectLayer={handleSelectLayer}
          onUpdateLayer={handleUpdateLayer}
          onDeleteLayer={handleDeleteLayer}
          onReorderLayers={handleReorderLayers}
          onFitBounds={handleFitBounds}
          onOpenUpload={() => setIsUploadOpen(true)}
          onQuickExport={(layer) => setExportModalLayer(layer)}
          isCollapsed={!isLayerPanelVisible}
          onToggleCollapse={() => setIsLayerPanelVisible((v) => !v)}
        />

        {/* Center Canvas: Map + Bottom Attribute Drawer */}
        <main className="flex-1 flex flex-col h-full relative overflow-hidden">
          {/* Map Viewport Area */}
          <div className="flex-1 relative w-full h-full">
            <MapViewport
              layers={layers}
              selectedLayerId={selectedLayerId}
              selectedFeatureIndices={selectedFeatureIndices}
              basemap={basemap}
              onSelectFeatures={handleMapSelectFeatures}
              onDeleteSelectedFeatures={handleDeleteSelectedFeatures}
              onOpenGeoprocessing={() => setIsGeoprocessingOpen(true)}
              onFitBoundsRequest={handleFitBounds}
            />

            {/* Zero State Overlay if No Layers */}
            {layers.length === 0 && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                <div className="pointer-events-auto max-w-md w-full bg-slate-900/95 border border-slate-700/80 rounded-2xl p-6 shadow-2xl backdrop-blur-md text-center space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                    <span className="text-xl font-bold font-mono">CRS</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">Ready for Geospatial Ingestion</h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Upload CAD DXF, Shapefiles (.zip), KML, or GeoJSON. Automatic coordinate transformations between WGS84, UTM 50S, and Tutupan Local Grid.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-left pt-2">
                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                      <div className="text-[10px] text-emerald-400 font-mono font-semibold">WGS 84</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">EPSG:4326 Lat/Lon</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                      <div className="text-[10px] text-amber-400 font-mono font-semibold">UTM 50S</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">EPSG:32750 Metric</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                      <div className="text-[10px] text-cyan-400 font-mono font-semibold">Tutupan</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Site Calibrated Grid</div>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="w-full py-2.5 px-4 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-semibold text-xs rounded-xl shadow-lg transition-all"
                  >
                    Upload Dataset
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Attribute Table Drawer */}
          <AttributeTable
            layers={layers}
            selectedLayerId={selectedLayerId}
            selectedFeatureIndices={selectedFeatureIndices}
            onSelectLayer={handleSelectLayer}
            onSelectFeatures={setSelectedFeatureIndices}
            onUpdateLayer={handleUpdateLayer}
            onDeleteSelectedFeatures={handleDeleteSelectedFeatures}
            onOpenGeoprocessing={() => setIsGeoprocessingOpen(true)}
            onExportRequest={(layer) => setExportModalLayer(layer)}
            isCollapsed={isTableCollapsed}
            onToggleCollapse={() => setIsTableCollapsed(!isTableCollapsed)}
          />
        </main>
      </div>

      {/* Upload & Ingestion Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onAddLayers={handleAddLayers}
        onAddLayer={handleAddLayer}
      />

      {/* Geoprocessing Studio Modal */}
      <GeoprocessingModal
        isOpen={isGeoprocessingOpen}
        onClose={() => setIsGeoprocessingOpen(false)}
        layers={layers}
        selectedLayerId={selectedLayerId}
        selectedFeatureIndices={selectedFeatureIndices}
        onAddLayer={handleAddLayer}
      />

      {/* Export Modal (Centered on page via React Portal) */}
      <ExportModal
        layer={exportModalLayer}
        onClose={() => setExportModalLayer(null)}
      />
    </div>
  );
}
