import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SpatialLayer } from '../types/spatial';
import {
  Wand2,
  CircleDot,
  Shapes,
  Plus,
  Trash2,
  X,
  Layers,
  ArrowRight,
  Info,
  Route
} from 'lucide-react';
import { createMultipleBuffers, convertLinesToPolygons, convertPolygonsToLines } from '../utils/geoprocessing';

interface GeoprocessingModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: SpatialLayer[];
  selectedLayerId: string | null;
  selectedFeatureIndices: number[];
  onAddLayer: (newLayer: SpatialLayer) => void;
}

const LAYER_PALETTE = [
  '#06B6D4', // cyan
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // purple
  '#10B981', // emerald
  '#3B82F6', // blue
];

export const GeoprocessingModal: React.FC<GeoprocessingModalProps> = ({
  isOpen,
  onClose,
  layers,
  selectedLayerId,
  selectedFeatureIndices,
  onAddLayer,
}) => {
  const [activeTab, setActiveTab] = useState<'buffer' | 'polygonize' | 'lineify'>('buffer');
  const [targetLayerId, setTargetLayerId] = useState<string>(selectedLayerId || layers[0]?.id || '');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  
  // Multiple buffer distances (default: 100, 150, 300, 500)
  const [bufferDistances, setBufferDistances] = useState<number[]>([100, 150, 300, 500]);
  const [newDistanceInput, setNewDistanceInput] = useState<string>('1000');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetLayer = layers.find((l) => l.id === targetLayerId) || layers[0];
  const hasSelection = selectedFeatureIndices.length > 0 && selectedLayerId === targetLayerId;

  // Features to process based on scope
  const targetFeatures = targetLayer
    ? scope === 'selected' && hasSelection
      ? targetLayer.geojson.features.filter((_, i) => selectedFeatureIndices.includes(i))
      : targetLayer.geojson.features
    : [];

  const handleUpdateDistance = (idx: number, val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const updated = [...bufferDistances];
      updated[idx] = num;
      setBufferDistances(updated);
    }
  };

  const handleRemoveDistance = (idx: number) => {
    if (bufferDistances.length <= 1) return;
    setBufferDistances(bufferDistances.filter((_, i) => i !== idx));
  };

  const handleAddDistance = () => {
    const num = parseFloat(newDistanceInput);
    if (!isNaN(num) && num > 0 && !bufferDistances.includes(num)) {
      setBufferDistances([...bufferDistances, num].sort((a, b) => a - b));
      setNewDistanceInput('');
    }
  };

  const handleRunBuffer = () => {
    if (!targetLayer || targetFeatures.length === 0) {
      setErrorMsg('No features available to buffer in selected layer.');
      return;
    }

    try {
      setErrorMsg(null);
      const parsedData = createMultipleBuffers(targetFeatures, bufferDistances, targetLayer);
      const randomColor = LAYER_PALETTE[Math.floor(Math.random() * LAYER_PALETTE.length)];

      const newLayer: SpatialLayer = {
        id: `layer_buf_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        ...parsedData,
        color: randomColor,
        opacity: 0.35,
        lineWidth: 2,
        pointSize: 6,
        visible: true,
        createdAt: Date.now(),
      };

      onAddLayer(newLayer);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create buffer polygons.');
    }
  };

  const handleRunPolygonize = () => {
    if (!targetLayer || targetFeatures.length === 0) {
      setErrorMsg('No features available to polygonize in selected layer.');
      return;
    }

    try {
      setErrorMsg(null);
      const parsedData = convertLinesToPolygons(targetFeatures, targetLayer);
      const randomColor = LAYER_PALETTE[Math.floor(Math.random() * LAYER_PALETTE.length)];

      const newLayer: SpatialLayer = {
        id: `layer_poly_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        ...parsedData,
        color: randomColor,
        opacity: 0.5,
        lineWidth: 2,
        pointSize: 6,
        visible: true,
        createdAt: Date.now(),
      };

      onAddLayer(newLayer);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to convert lines to polygons.');
    }
  };

  const handleRunLineify = () => {
    if (!targetLayer || targetFeatures.length === 0) {
      setErrorMsg('No features available in selected layer to convert to polylines.');
      return;
    }

    try {
      setErrorMsg(null);
      const parsedData = convertPolygonsToLines(targetFeatures, targetLayer);
      const randomColor = LAYER_PALETTE[Math.floor(Math.random() * LAYER_PALETTE.length)];

      const newLayer: SpatialLayer = {
        id: `layer_line_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        ...parsedData,
        color: randomColor,
        opacity: 0.9,
        lineWidth: 2.5,
        pointSize: 6,
        visible: true,
        createdAt: Date.now(),
      };

      onAddLayer(newLayer);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to convert polygons to polylines.');
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Geoprocessing Studio</h2>
              <p className="text-xs text-slate-400">High-fidelity spatial transformations (no simplification)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 text-xs font-medium bg-slate-950/20">
          <button
            type="button"
            onClick={() => setActiveTab('buffer')}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'buffer'
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span>Multiple Buffer</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('polygonize')}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'polygonize'
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shapes className="w-3.5 h-3.5" />
            <span>Line → Polygon</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('lineify')}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'lineify'
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>Polygon → Polyline</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Target Layer Selector */}
          <div>
            <label className="text-xs text-slate-300 block mb-1.5 font-medium">Input Source Layer</label>
            <select
              value={targetLayerId}
              onChange={(e) => setTargetLayerId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            >
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.featureCount} features - {l.geometryTypes.join(', ')})
                </option>
              ))}
            </select>
          </div>

          {/* Scope Selector (All vs Selected) */}
          {hasSelection && (
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Processing Scope:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setScope('selected')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    scope === 'selected'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Selected Features ({selectedFeatureIndices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    scope === 'all'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Features ({targetLayer?.featureCount})
                </button>
              </div>
            </div>
          )}

          {activeTab === 'buffer' ? (
            /* Multiple Buffer View */
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-slate-200 font-semibold flex items-center gap-1.5">
                    <CircleDot className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Buffer Ring Distances (Meters)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">Geodesic metric</span>
                </div>

                {/* Distances List */}
                <div className="space-y-2">
                  {bufferDistances.map((dist, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl p-2.5"
                    >
                      <span className="text-[10px] text-slate-500 font-mono w-6 text-center">
                        #{idx + 1}
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="10"
                        value={dist}
                        onChange={(e) => handleUpdateDistance(idx, e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-slate-400 font-mono">meters</span>

                      <button
                        type="button"
                        onClick={() => handleRemoveDistance(idx)}
                        disabled={bufferDistances.length <= 1}
                        className="text-slate-500 hover:text-rose-400 disabled:opacity-30 p-1 transition-colors"
                        title="Remove distance ring"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new distance row */}
                <div className="flex items-center gap-2 mt-2.5">
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 500"
                    value={newDistanceInput}
                    onChange={(e) => setNewDistanceInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddDistance}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Add Distance</span>
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Generates {bufferDistances.length} concentric buffer polygons around {targetFeatures.length} feature(s). Outer rings are sorted underneath inner rings to enable clear layered visualization.
                </span>
              </div>
            </div>
          ) : activeTab === 'polygonize' ? (
            /* Line to Polygon View */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-200 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Shapes className="w-4 h-4 text-emerald-400" />
                    <span>Polyline to Polygon Conversion</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 bg-emerald-950/50 rounded border border-emerald-500/30">
                    Zero-Simplification
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Converts open and closed LineStrings / Polylines in <strong className="text-slate-200">"{targetLayer?.name}"</strong> into valid GeoJSON Polygons. Closes start/end nodes without modifying any intermediate vertices or losing geometric fidelity.
                </p>

                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
                  Features to polygonize: <strong className="text-slate-200">{targetFeatures.length}</strong>
                </div>
              </div>
            </div>
          ) : (
            /* Polygon to Polyline View */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-200 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Route className="w-4 h-4 text-emerald-400" />
                    <span>Polygon to Polyline Boundary Extraction</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 bg-emerald-950/50 rounded border border-emerald-500/30">
                    Zero-Simplification
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Extracts exterior boundaries and interior ring holes from Polygon and MultiPolygon features in <strong className="text-slate-200">"{targetLayer?.name}"</strong> into clean LineString / MultiLineString vector features. Retains all attribute fields and original vertex precision.
                </p>

                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
                  Features to convert: <strong className="text-slate-200">{targetFeatures.length}</strong>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/60 shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">
            Output: New vector layer
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={
                activeTab === 'buffer'
                  ? handleRunBuffer
                  : activeTab === 'polygonize'
                  ? handleRunPolygonize
                  : handleRunLineify
              }
              disabled={targetFeatures.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg shadow-lg transition-all"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>
                {activeTab === 'buffer'
                  ? 'Generate Buffers'
                  : activeTab === 'polygonize'
                  ? 'Convert to Polygons'
                  : 'Convert to Polylines'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
