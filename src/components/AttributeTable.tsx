import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CRS, SpatialLayer } from '../types/spatial';
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  Check,
  X,
  FileSpreadsheet,
  Wand2,
  CheckSquare,
  Square
} from 'lucide-react';
import { exportToGeoJSON, exportToShapefileZIP, exportToDXF, exportToKML } from '../utils/exporters';

interface AttributeTableProps {
  layers: SpatialLayer[];
  selectedLayerId: string | null;
  selectedFeatureIndices: number[];
  onSelectLayer: (layerId: string) => void;
  onSelectFeatures: (indices: number[]) => void;
  onUpdateLayer: (updatedLayer: SpatialLayer) => void;
  onDeleteSelectedFeatures?: () => void;
  onOpenGeoprocessing?: () => void;
  onExportRequest?: (layer: SpatialLayer) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const AttributeTable: React.FC<AttributeTableProps> = ({
  layers,
  selectedLayerId,
  selectedFeatureIndices,
  onSelectLayer,
  onSelectFeatures,
  onUpdateLayer,
  onDeleteSelectedFeatures,
  onOpenGeoprocessing,
  onExportRequest,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colName: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Field modal state
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'string' | 'number'>('string');
  
  // Export modal state
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'geojson' | 'shapefile' | 'dxf' | 'kml'>('geojson');
  const [exportCRS, setExportCRS] = useState<CRS>('EPSG:4326');

  // Currently active layer
  const currentLayer = useMemo(() => {
    return layers.find((l) => l.id === selectedLayerId) || layers[0] || null;
  }, [layers, selectedLayerId]);

  // Fields / columns in current layer
  const fields = useMemo(() => {
    if (!currentLayer) return [];
    return currentLayer.fields || [];
  }, [currentLayer]);

  // Indexed features list
  const indexedFeatures = useMemo(() => {
    if (!currentLayer) return [];
    return currentLayer.geojson.features.map((feat, originalIdx) => ({
      feat,
      originalIdx,
    }));
  }, [currentLayer]);

  // Filtered features
  const filteredIndexedFeatures = useMemo(() => {
    if (!searchQuery.trim()) return indexedFeatures;
    const q = searchQuery.toLowerCase();
    return indexedFeatures.filter(({ feat }) => {
      const props = feat.properties || {};
      return Object.values(props).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [indexedFeatures, searchQuery]);

  // Selection state helpers
  const allFilteredIndices = useMemo(() => {
    return filteredIndexedFeatures.map((item) => item.originalIdx);
  }, [filteredIndexedFeatures]);

  const isAllFilteredSelected = useMemo(() => {
    if (allFilteredIndices.length === 0) return false;
    const set = new Set(selectedFeatureIndices);
    return allFilteredIndices.every((idx) => set.has(idx));
  }, [allFilteredIndices, selectedFeatureIndices]);

  const isSomeFilteredSelected = useMemo(() => {
    if (allFilteredIndices.length === 0) return false;
    const set = new Set(selectedFeatureIndices);
    return allFilteredIndices.some((idx) => set.has(idx));
  }, [allFilteredIndices, selectedFeatureIndices]);

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      // Unselect all filtered
      const filteredSet = new Set(allFilteredIndices);
      onSelectFeatures(selectedFeatureIndices.filter((idx) => !filteredSet.has(idx)));
    } else {
      // Select all filtered
      const combined = new Set([...selectedFeatureIndices, ...allFilteredIndices]);
      onSelectFeatures(Array.from(combined));
    }
  };

  const handleToggleRowSelection = (originalIdx: number, isMultiClick: boolean) => {
    if (isMultiClick) {
      const set = new Set(selectedFeatureIndices);
      if (set.has(originalIdx)) {
        set.delete(originalIdx);
      } else {
        set.add(originalIdx);
      }
      onSelectFeatures(Array.from(set));
    } else {
      // If clicking already exclusively selected row, toggle off; otherwise select just this row
      if (selectedFeatureIndices.length === 1 && selectedFeatureIndices[0] === originalIdx) {
        onSelectFeatures([]);
      } else {
        onSelectFeatures([originalIdx]);
      }
    }
  };

  // Handle cell edit save
  const handleSaveCell = (rowIdx: number, colName: string) => {
    if (!currentLayer) return;

    let parsedVal: any = editValue;
    const fieldDef = fields.find((f) => f.name === colName);
    if (fieldDef?.type === 'number') {
      const num = parseFloat(editValue);
      parsedVal = isNaN(num) ? 0 : num;
    }

    const updatedFeatures = [...currentLayer.geojson.features];
    const targetFeature = { ...updatedFeatures[rowIdx] };
    targetFeature.properties = {
      ...(targetFeature.properties || {}),
      [colName]: parsedVal,
    };
    updatedFeatures[rowIdx] = targetFeature;

    const updatedLayer: SpatialLayer = {
      ...currentLayer,
      geojson: {
        ...currentLayer.geojson,
        features: updatedFeatures,
      },
    };

    onUpdateLayer(updatedLayer);
    setEditingCell(null);
  };

  // Add new column to schema
  const handleAddColumn = () => {
    if (!currentLayer || !newFieldName.trim()) return;
    const cleanName = newFieldName.trim().replace(/[^a-zA-Z0-9_]/g, '_');

    if (fields.some((f) => f.name.toLowerCase() === cleanName.toLowerCase())) {
      return;
    }

    const updatedFields = [...fields, { name: cleanName, type: newFieldType }];
    const defaultVal = newFieldType === 'number' ? 0 : '';

    const updatedFeatures = currentLayer.geojson.features.map((f) => ({
      ...f,
      properties: {
        ...(f.properties || {}),
        [cleanName]: defaultVal,
      },
    }));

    onUpdateLayer({
      ...currentLayer,
      fields: updatedFields,
      geojson: {
        ...currentLayer.geojson,
        features: updatedFeatures,
      },
    });

    setNewFieldName('');
    setIsAddFieldOpen(false);
  };

  // Delete column
  const handleDeleteColumn = (colName: string) => {
    if (!currentLayer) return;
    const updatedFields = fields.filter((f) => f.name !== colName);
    const updatedFeatures = currentLayer.geojson.features.map((f) => {
      const newProps = { ...(f.properties || {}) };
      delete newProps[colName];
      return {
        ...f,
        properties: newProps,
      };
    });

    onUpdateLayer({
      ...currentLayer,
      fields: updatedFields,
      geojson: {
        ...currentLayer.geojson,
        features: updatedFeatures,
      },
    });
  };

  // Delete single feature
  const handleDeleteFeature = (rowIdx: number) => {
    if (!currentLayer) return;
    const updatedFeatures = currentLayer.geojson.features.filter((_, i) => i !== rowIdx);

    onUpdateLayer({
      ...currentLayer,
      featureCount: updatedFeatures.length,
      geojson: {
        ...currentLayer.geojson,
        features: updatedFeatures,
      },
    });

    onSelectFeatures(selectedFeatureIndices.filter((idx) => idx !== rowIdx));
  };

  // Execute Export
  const handleExport = () => {
    if (!currentLayer) return;
    if (exportFormat === 'geojson') {
      exportToGeoJSON(currentLayer, exportCRS);
    } else if (exportFormat === 'shapefile') {
      exportToShapefileZIP(currentLayer, exportCRS);
    } else if (exportFormat === 'dxf') {
      exportToDXF(currentLayer, exportCRS);
    } else if (exportFormat === 'kml') {
      exportToKML(currentLayer, exportCRS);
    }
    setIsExportOpen(false);
  };

  if (!currentLayer || layers.length === 0) {
    return null;
  }

  return (
    <div
      className={`border-t border-slate-800 bg-slate-900/95 backdrop-blur-md transition-all duration-300 flex flex-col z-20 ${
        isCollapsed ? 'h-10' : 'h-72 sm:h-80'
      }`}
    >
      {/* Table Header / Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/80 shrink-0 gap-4">
        {/* Layer tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <div className="flex items-center gap-1 text-slate-400 text-xs font-semibold mr-2 shrink-0">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Attributes</span>
          </div>

          {layers.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                onSelectLayer(l.id);
                onSelectFeatures([]);
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                l.id === currentLayer.id
                  ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: l.color }}
              />
              <span>{l.name}</span>
              <span className="text-[10px] text-slate-500 font-mono">({l.featureCount})</span>
            </button>
          ))}
        </div>

        {/* Right action controls */}
        <div className="flex items-center gap-2 shrink-0">
          {!isCollapsed && (
            <>
              {/* Batch Actions when features selected */}
              {selectedFeatureIndices.length > 0 && (
                <div className="flex items-center gap-1.5 mr-1 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-0.5 animate-in fade-in">
                  <span className="text-[11px] font-mono text-amber-300 font-semibold mr-1">
                    {selectedFeatureIndices.length} selected
                  </span>

                  {onOpenGeoprocessing && (
                    <button
                      onClick={onOpenGeoprocessing}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-300 hover:text-emerald-200 bg-emerald-500/20 hover:bg-emerald-500/30 rounded transition-colors"
                      title="Geoprocess selected features"
                    >
                      <Wand2 className="w-3 h-3 text-emerald-400" />
                      <span className="hidden sm:inline">Process</span>
                    </button>
                  )}

                  {onDeleteSelectedFeatures && (
                    <button
                      onClick={onDeleteSelectedFeatures}
                      className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 rounded transition-colors"
                      title="Delete all selected features"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                      <span>Delete</span>
                    </button>
                  )}

                  <button
                    onClick={() => onSelectFeatures([])}
                    className="p-0.5 text-slate-400 hover:text-slate-200"
                    title="Clear selection"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Search bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter attributes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-950/70 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-32 sm:w-44 font-mono"
                />
              </div>

              {/* Add Column Button */}
              <button
                onClick={() => setIsAddFieldOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-slate-100 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded transition-colors"
                title="Add new column to layer schema"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Add Field</span>
              </button>

              {/* Export Button */}
              <button
                onClick={() => {
                  if (onExportRequest && currentLayer) {
                    onExportRequest(currentLayer);
                  } else {
                    setIsExportOpen(true);
                  }
                }}
                className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded shadow transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
            </>
          )}

          {/* Collapse / Expand Toggle */}
          <button
            onClick={onToggleCollapse}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            title={isCollapsed ? 'Expand Attribute Table' : 'Collapse Attribute Table'}
          >
            {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Table Grid */}
      {!isCollapsed && (
        <div className="flex-1 overflow-auto relative">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
              <tr>
                {/* Select All Checkbox Header */}
                <th className="py-2 px-2 w-10 text-center border-r border-slate-800/60">
                  <input
                    type="checkbox"
                    checked={isAllFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeFilteredSelected && !isAllFilteredSelected;
                    }}
                    onChange={handleToggleSelectAll}
                    className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500 cursor-pointer"
                    title={isAllFilteredSelected ? 'Deselect all' : 'Select all filtered features'}
                  />
                </th>
                <th className="py-2 px-3 w-12 text-center border-r border-slate-800/60 font-mono">#</th>
                <th className="py-2 px-3 w-28 border-r border-slate-800/60 font-mono">Geometry</th>
                {fields.map((field) => (
                  <th
                    key={field.name}
                    className="py-2 px-3 border-r border-slate-800/60 min-w-[130px] group relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{field.name}</span>
                      <button
                        onClick={() => handleDeleteColumn(field.name)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 transition-opacity"
                        title="Delete column"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="py-2 px-3 w-16 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredIndexedFeatures.map(({ feat, originalIdx }) => {
                const isSelected = selectedFeatureIndices.includes(originalIdx);
                const geomType = feat.geometry?.type || 'Unknown';
                const props = feat.properties || {};

                return (
                  <tr
                    key={feat.id || originalIdx}
                    onClick={(e) => {
                      const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
                      handleToggleRowSelection(originalIdx, isMulti);
                    }}
                    className={`transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'bg-amber-950/40 text-amber-100 font-medium'
                        : 'hover:bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    {/* Checkbox Cell */}
                    <td
                      className="py-1.5 px-2 text-center border-r border-slate-800/60"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRowSelection(originalIdx, true)}
                        className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500 cursor-pointer"
                      />
                    </td>

                    <td className="py-1.5 px-3 text-center border-r border-slate-800/60 font-mono text-[11px] text-slate-500 tabular-nums">
                      {originalIdx + 1}
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-800/60 font-mono text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: currentLayer.color }}
                        />
                        {geomType}
                      </span>
                    </td>

                    {fields.map((field) => {
                      const isEditing =
                        editingCell?.rowIdx === originalIdx && editingCell?.colName === field.name;
                      const cellVal = props[field.name] !== undefined ? props[field.name] : '';

                      return (
                        <td
                          key={field.name}
                          onDoubleClick={() => {
                            setEditingCell({ rowIdx: originalIdx, colName: field.name });
                            setEditValue(String(cellVal));
                          }}
                          className="py-1.5 px-3 border-r border-slate-800/60 font-mono text-[11px] relative max-w-[200px] truncate"
                          title="Double-click to edit"
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                autoFocus
                                type={field.type === 'number' ? 'number' : 'text'}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveCell(originalIdx, field.name);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                className="w-full bg-slate-950 border border-emerald-500 rounded px-1.5 py-0.5 text-xs text-slate-100 focus:outline-none"
                              />
                              <button
                                onClick={() => handleSaveCell(originalIdx, field.name)}
                                className="text-emerald-400 hover:text-emerald-300 p-0.5"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingCell(null)}
                                className="text-slate-500 hover:text-slate-400 p-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="tabular-nums">{String(cellVal)}</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="py-1.5 px-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFeature(originalIdx);
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                        title="Delete feature"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredIndexedFeatures.length === 0 && (
                <tr>
                  <td colSpan={fields.length + 4} className="py-8 text-center text-slate-500 italic">
                    No features match current search query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Field Modal */}
      {isAddFieldOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setIsAddFieldOpen(false)}
        >
          <div
            className="relative bg-slate-900 border border-slate-700/90 rounded-2xl p-6 w-full max-w-md shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Add Schema Attribute Field</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Field Name</label>
                <input
                  type="text"
                  placeholder="e.g. elevation, pit_id, zone"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Data Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewFieldType('string')}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                      newFieldType === 'string'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Text (String)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewFieldType('number')}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                      newFieldType === 'number'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Number (Numeric)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6">
              <button
                type="button"
                onClick={() => setIsAddFieldOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddColumn}
                disabled={!newFieldName.trim()}
                className="px-5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-colors"
              >
                Add Field
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Export Options Modal (Centered in Page) */}
      {isExportOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setIsExportOpen(false)}
        >
          <div
            className="relative bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Instant Spatial Export</h3>
                  <p className="text-xs text-slate-400">
                    Export layer <span className="text-emerald-400 font-medium">"{currentLayer.name}"</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsExportOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="text-xs text-slate-200 block mb-2 font-semibold">1. Export File Format</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 'geojson', label: 'GeoJSON (.geojson)', desc: 'Standard JSON vector' },
                    { id: 'shapefile', label: 'Shapefile ZIP (.zip)', desc: 'SHP, DBF, SHX, PRJ bundle' },
                    { id: 'dxf', label: 'AutoCAD DXF (.dxf)', desc: 'CAD R12/2000 vectors' },
                    { id: 'kml', label: 'Google Earth KML (.kml)', desc: 'Keyhole markup schema' },
                  ].map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setExportFormat(fmt.id as any)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        exportFormat === fmt.id
                          ? 'bg-emerald-950/50 border-emerald-500 text-slate-100 ring-1 ring-emerald-500'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-200">{fmt.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{fmt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-200 block mb-2 font-semibold">2. Target Coordinate System (CRS)</label>
                <div className="space-y-2">
                  {[
                    { code: 'EPSG:4326', name: 'WGS 84 (Geographic Lat/Lon)', sub: 'Standard Longitude/Latitude for web GIS & Google Earth' },
                    { code: 'EPSG:32750', name: 'WGS 84 / UTM zone 50S', sub: 'Metric projection (Eastings/Northings in meters)' },
                    { code: 'TUTUPAN', name: 'Local Coordinate System (Tutupan)', sub: 'Calibrated mine site local grid (Easting/Northing)' },
                  ].map((crs) => (
                    <label
                      key={crs.code}
                      onClick={() => setExportCRS(crs.code as any)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        exportCRS === crs.code
                          ? 'bg-emerald-950/40 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/50'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="exportCRS"
                        checked={exportCRS === crs.code}
                        onChange={() => setExportCRS(crs.code as any)}
                        className="mt-1 text-emerald-500 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-slate-200">{crs.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{crs.sub}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-800 bg-slate-950/60 shrink-0">
              <button
                type="button"
                onClick={() => setIsExportOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-lg transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download {exportFormat.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
