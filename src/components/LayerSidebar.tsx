import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CRS, SpatialLayer, SUPPORTED_CRS } from '../types/spatial';
import {
  Layers,
  Eye,
  EyeOff,
  Maximize2,
  Trash2,
  Plus,
  Sliders,
  Calculator,
  Compass,
  ArrowRight,
  Download,
  Edit2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';
import { transformCoordinate } from '../utils/coordinateTransform';

interface LayerSidebarProps {
  layers: SpatialLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onUpdateLayer: (layer: SpatialLayer) => void;
  onDeleteLayer: (layerId: string) => void;
  onReorderLayers: (newLayers: SpatialLayer[]) => void;
  onFitBounds: (bounds: [number, number, number, number]) => void;
  onOpenUpload: () => void;
  onQuickExport: (layer: SpatialLayer) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const LayerSidebar: React.FC<LayerSidebarProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onDeleteLayer,
  onReorderLayers,
  onFitBounds,
  onOpenUpload,
  onQuickExport,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'calc'>('layers');

  // Layer Rename Modal state (full popup so user can see & edit entire name)
  const [renameModalLayer, setRenameModalLayer] = useState<SpatialLayer | null>(null);
  const [newLayerNameInput, setNewLayerNameInput] = useState<string>('');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Quick Coordinate Converter Playground state
  const [calcSourceCRS, setCalcSourceCRS] = useState<CRS>('TUTUPAN');
  const [coordX, setCoordX] = useState<string>('4040.702'); // Tutupan test easting
  const [coordY, setCoordY] = useState<string>('9070.668'); // Tutupan test northing

  // Calculate coordinates in all 3 systems
  const calcResults = React.useMemo(() => {
    const x = parseFloat(coordX);
    const y = parseFloat(coordY);
    if (isNaN(x) || isNaN(y)) {
      return null;
    }

    try {
      const wgs84 = transformCoordinate([x, y], calcSourceCRS, 'EPSG:4326');
      const utm50s = transformCoordinate([x, y], calcSourceCRS, 'EPSG:32750');
      const tutupan = transformCoordinate([x, y], calcSourceCRS, 'TUTUPAN');

      return {
        wgs84: { lng: wgs84[0], lat: wgs84[1] },
        utm50s: { easting: utm50s[0], northing: utm50s[1] },
        tutupan: { easting: tutupan[0], northing: tutupan[1] },
      };
    } catch {
      return null;
    }
  }, [coordX, coordY, calcSourceCRS]);

  // Open Rename Layer Popup Modal
  const handleOpenRename = (layer: SpatialLayer) => {
    setRenameModalLayer(layer);
    setNewLayerNameInput(layer.name);
  };

  // Save Layer Name from Popup Modal
  const handleSaveRename = () => {
    if (renameModalLayer && newLayerNameInput.trim()) {
      onUpdateLayer({ ...renameModalLayer, name: newLayerNameInput.trim() });
    }
    setRenameModalLayer(null);
  };

  // Move layer order (up / down)
  const handleMoveLayer = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= layers.length || fromIdx === toIdx) return;
    const updated = [...layers];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    onReorderLayers(updated);
  };

  // Handle drag drop reordering
  const handleDrop = (targetIdx: number) => {
    if (draggedIdx === null || draggedIdx === targetIdx) return;
    handleMoveLayer(draggedIdx, targetIdx);
    setDraggedIdx(null);
  };

  // If TOC is collapsed, render a slim rail with an expand button
  if (isCollapsed) {
    return (
      <aside className="w-12 border-r border-slate-800 bg-slate-900/90 flex flex-col items-center py-3 justify-between shrink-0 z-10 backdrop-blur-md transition-all">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors shadow"
            title="Expand Table of Contents (Layer Panel)"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          {/* Vertical Label */}
          <div
            className="writing-mode-vertical text-[11px] font-mono font-semibold tracking-wider text-slate-400 uppercase select-none cursor-pointer py-4 hover:text-slate-200"
            onClick={onToggleCollapse}
          >
            Layers ({layers.length})
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenUpload}
          className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors border border-emerald-500/30"
          title="Upload Dataset"
        >
          <Plus className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-80 border-r border-slate-800 bg-slate-900/90 flex flex-col h-full shrink-0 z-10 backdrop-blur-md transition-all">
      {/* Sidebar Mode Tabs + Collapse Toggle */}
      <div className="flex border-b border-slate-800 text-xs font-medium items-center justify-between">
        <div className="flex flex-1">
          <button
            onClick={() => setActiveTab('layers')}
            className={`flex-1 py-3 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'layers'
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Layers ({layers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('calc')}
            className={`flex-1 py-3 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              activeTab === 'calc'
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>CRS Inspector</span>
          </button>
        </div>

        {/* Toggle Collapse Button on Sidebar */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="px-2.5 py-3 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-l border-slate-800 transition-colors"
            title="Collapse Layer Panel (TOC)"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content Area */}
      {activeTab === 'layers' ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Add Layer Action Card */}
          <button
            onClick={onOpenUpload}
            className="w-full py-2.5 px-3 border border-dashed border-emerald-500/40 hover:border-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Upload DXF / SHP / KML / GeoJSON / CSV</span>
          </button>

          {/* Layer List */}
          {layers.map((layer, idx) => {
            const isSelected = layer.id === selectedLayerId;

            return (
              <div
                key={layer.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(idx));
                  setDraggedIdx(idx);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(idx);
                }}
                onDragEnd={() => setDraggedIdx(null)}
                onClick={() => onSelectLayer(layer.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  draggedIdx === idx ? 'opacity-40 border-dashed border-amber-400' : ''
                } ${
                  isSelected
                    ? 'bg-slate-800/90 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/30'
                    : 'bg-slate-950/60 border-slate-800/90 hover:border-slate-700'
                }`}
              >
                {/* Layer Title Row with Top-Left Order Icons */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {/* Top-Left Up/Down Order Controls */}
                    <div
                      className="flex flex-col items-center justify-center mr-1 shrink-0 bg-slate-900/90 rounded border border-slate-800 p-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveLayer(idx, idx - 1)}
                        className="p-0.5 text-slate-400 hover:text-emerald-400 disabled:opacity-20 disabled:hover:text-slate-400 rounded transition-colors"
                        title={idx === 0 ? 'Top layer' : 'Move layer up (draws on top)'}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === layers.length - 1}
                        onClick={() => handleMoveLayer(idx, idx + 1)}
                        className="p-0.5 text-slate-400 hover:text-emerald-400 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                        title={idx === layers.length - 1 ? 'Bottom layer' : 'Move layer down'}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Color Picker */}
                    <input
                      type="color"
                      value={layer.color}
                      onChange={(e) => {
                        e.stopPropagation();
                        onUpdateLayer({ ...layer, color: e.target.value });
                      }}
                      className="w-4 h-4 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0"
                      title="Change layer color"
                    />

                    {/* Layer Name + Rename Popup trigger */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 group/title">
                      <span
                        className="text-xs font-semibold text-slate-200 truncate cursor-pointer hover:text-emerald-300 transition-colors"
                        title="Double-click to rename layer in popup"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleOpenRename(layer);
                        }}
                      >
                        {layer.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenRename(layer);
                        }}
                        className="opacity-0 group-hover/title:opacity-100 text-slate-500 hover:text-emerald-400 p-0.5 transition-opacity shrink-0"
                        title="Rename layer in popup"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Actions Row (Visibility + Zoom + Export + Delete) */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {/* Toggle Visibility */}
                    <button
                      onClick={() => onUpdateLayer({ ...layer, visible: !layer.visible })}
                      className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-700/60 transition-colors"
                      title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                    >
                      {layer.visible ? (
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </button>

                    {/* Zoom to Extents */}
                    <button
                      onClick={() => onFitBounds(layer.bounds)}
                      className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-700/60 transition-colors"
                      title="Zoom to Layer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Quick Export */}
                    <button
                      onClick={() => onQuickExport(layer)}
                      className="p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-slate-700/60 transition-colors"
                      title="Export Layer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onDeleteLayer(layer.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-700/60 transition-colors"
                      title="Delete Layer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Layer Metadata Chips */}
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    {layer.format.toUpperCase()}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300">
                    {layer.sourceCRS}
                  </span>
                  <span className="tabular-nums">
                    {layer.featureCount} features
                  </span>
                  <span className="text-[9px] text-slate-500">
                    #{idx + 1}
                  </span>
                </div>

                {/* Geometry types */}
                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-slate-500 font-mono">
                  <span>Geom:</span>
                  <span>{layer.geometryTypes.join(', ') || 'Vector'}</span>
                </div>

                {/* Layer Controls when Selected */}
                {isSelected && (
                  <div
                    className="mt-3 pt-2.5 border-t border-slate-700/60 space-y-2 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Fill Opacity</span>
                        <span className="font-mono text-slate-300">
                          {Math.round((layer.opacity ?? 0.45) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={layer.opacity ?? 0.45}
                        onChange={(e) =>
                          onUpdateLayer({ ...layer, opacity: parseFloat(e.target.value) })
                        }
                        className="w-full accent-emerald-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>Outline / Line Width</span>
                        <span className="font-mono text-slate-300">{layer.lineWidth ?? 2}px</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="8"
                        step="0.5"
                        value={layer.lineWidth ?? 2}
                        onChange={(e) =>
                          onUpdateLayer({ ...layer, lineWidth: parseFloat(e.target.value) })
                        }
                        className="w-full accent-emerald-500 h-1 bg-slate-700 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty State */}
          {layers.length === 0 && (
            <div className="text-center py-10 px-4 border border-dashed border-slate-800 rounded-xl space-y-3">
              <Compass className="w-8 h-8 text-slate-600 mx-auto" />
              <div>
                <h4 className="text-xs font-semibold text-slate-300">Workspace is Empty</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Upload CAD DXF, GIS Shapefile (.zip), KML, or GeoJSON files to begin spatial transformation and editing.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Real-Time Coordinate Calculator Tool */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-Time Coordinate Inspector</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Test site calibration and transform between Tutupan Grid, UTM Zone 50S, and WGS84 coordinates.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Source Coordinate System</label>
              <select
                value={calcSourceCRS}
                onChange={(e) => setCalcSourceCRS(e.target.value as CRS)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              >
                <option value="TUTUPAN">Local Grid (Tutupan)</option>
                <option value="EPSG:32750">EPSG:32750 (UTM 50S)</option>
                <option value="EPSG:4326">EPSG:4326 (WGS 84)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1 font-mono">
                {calcSourceCRS === 'EPSG:4326' ? 'Longitude (Degrees)' : 'X / Easting (Meters)'}
              </label>
              <input
                type="text"
                value={coordX}
                onChange={(e) => setCoordX(e.target.value)}
                placeholder={calcSourceCRS === 'EPSG:4326' ? '115.541234' : '334759.45'}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1 font-mono">
                {calcSourceCRS === 'EPSG:4326' ? 'Latitude (Degrees)' : 'Y / Northing (Meters)'}
              </label>
              <input
                type="text"
                value={coordY}
                onChange={(e) => setCoordY(e.target.value)}
                placeholder={calcSourceCRS === 'EPSG:4326' ? '-2.123456' : '9757090.68'}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Results Display */}
          {calcResults && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-[10px] font-semibold text-slate-400 tracking-wider font-mono">
                CALCULATED COORDINATES:
              </span>

              {/* Tutupan */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1 font-mono text-[11px]">
                <div className="text-emerald-400 font-semibold flex items-center justify-between">
                  <span>Tutupan Local Grid</span>
                  <span className="text-[9px] text-slate-500">Meters</span>
                </div>
                <div className="text-slate-300">
                  E: <span className="text-slate-100 font-bold tabular-nums">{calcResults.tutupan.easting.toFixed(3)}</span>
                </div>
                <div className="text-slate-300">
                  N: <span className="text-slate-100 font-bold tabular-nums">{calcResults.tutupan.northing.toFixed(3)}</span>
                </div>
              </div>

              {/* UTM 50S */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1 font-mono text-[11px]">
                <div className="text-amber-400 font-semibold flex items-center justify-between">
                  <span>WGS 84 / UTM zone 50S</span>
                  <span className="text-[9px] text-slate-500">Meters</span>
                </div>
                <div className="text-slate-300">
                  E: <span className="text-slate-100 font-bold tabular-nums">{calcResults.utm50s.easting.toFixed(3)}</span>
                </div>
                <div className="text-slate-300">
                  N: <span className="text-slate-100 font-bold tabular-nums">{calcResults.utm50s.northing.toFixed(3)}</span>
                </div>
              </div>

              {/* WGS 84 */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1 font-mono text-[11px]">
                <div className="text-cyan-400 font-semibold flex items-center justify-between">
                  <span>WGS 84 Geographic</span>
                  <span className="text-[9px] text-slate-500">Degrees</span>
                </div>
                <div className="text-slate-300">
                  Lon: <span className="text-slate-100 font-bold tabular-nums">{calcResults.wgs84.lng.toFixed(7)}°</span>
                </div>
                <div className="text-slate-300">
                  Lat: <span className="text-slate-100 font-bold tabular-nums">{calcResults.wgs84.lat.toFixed(7)}°</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rename Layer Full Popup Modal */}
      {renameModalLayer &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setRenameModalLayer(null)}
          >
            <div
              className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Edit2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Rename Spatial Layer</h3>
                    <p className="text-[11px] text-slate-400">View and edit full layer name without truncation</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRenameModalLayer(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Layer Name
                  </label>
                  <span className="text-[10px] font-mono text-slate-500">
                    {renameModalLayer.format.toUpperCase()} · {renameModalLayer.sourceCRS} · {renameModalLayer.featureCount} features
                  </span>
                </div>
                <input
                  type="text"
                  autoFocus
                  value={newLayerNameInput}
                  onChange={(e) => setNewLayerNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setRenameModalLayer(null);
                    }
                  }}
                  placeholder="Enter layer name..."
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none shadow-inner"
                />
                <p className="text-[11px] text-slate-500">
                  Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">Enter</kbd> to save or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300 border border-slate-700">Esc</kbd> to cancel.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRenameModalLayer(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRename}
                  disabled={!newLayerNameInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-emerald-950 rounded-xl shadow-lg transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Layer Name</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
};

