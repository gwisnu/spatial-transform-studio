import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CRS, SpatialLayer } from '../types/spatial';
import { Download, X, Layers, Compass, FileCheck } from 'lucide-react';
import { exportToGeoJSON, exportToShapefileZIP, exportToDXF, exportToKML } from '../utils/exporters';

interface ExportModalProps {
  layer: SpatialLayer | null;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ layer, onClose }) => {
  const [exportFormat, setExportFormat] = useState<'geojson' | 'shapefile' | 'dxf' | 'kml'>('geojson');
  const [exportCRS, setExportCRS] = useState<CRS>('EPSG:4326');

  if (!layer) return null;

  const handleExport = () => {
    if (exportFormat === 'geojson') {
      exportToGeoJSON(layer, exportCRS);
    } else if (exportFormat === 'shapefile') {
      exportToShapefileZIP(layer, exportCRS);
    } else if (exportFormat === 'dxf') {
      exportToDXF(layer, exportCRS);
    } else if (exportFormat === 'kml') {
      exportToKML(layer, exportCRS);
    }
    onClose();
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
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Export Spatial Layer</h2>
              <p className="text-xs text-slate-400">Convert and download vector geometries</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Layer Summary Box */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: layer.color }}
                />
                <span className="font-semibold text-slate-100 truncate">{layer.name}</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-amber-300 font-mono text-[10px]">
                Source: {layer.sourceCRS}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-3 pt-1">
              <span>{layer.featureCount} features</span>
              <span>·</span>
              <span>Types: {layer.geometryTypes.join(', ')}</span>
            </div>
          </div>

          {/* Format Selector */}
          <div>
            <label className="text-xs text-slate-200 block mb-2 font-semibold">
              1. Choose Export File Format
            </label>
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

          {/* Target CRS Selector */}
          <div>
            <label className="text-xs text-slate-200 block mb-2 font-semibold flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>2. Choose Destination Coordinate System (CRS)</span>
            </label>
            <div className="space-y-2">
              {[
                {
                  code: 'EPSG:4326',
                  name: 'WGS 84 (Geographic Degrees)',
                  sub: 'Standard Longitude/Latitude for web GIS & Google Earth',
                },
                {
                  code: 'EPSG:32750',
                  name: 'WGS 84 / UTM zone 50S (Meters)',
                  sub: 'Metric projected grid for South Kalimantan / Indonesia',
                },
                {
                  code: 'TUTUPAN',
                  name: 'Local Coordinate System (Tutupan)',
                  sub: 'Inverse site-calibrated mine grid (Easting/Northing in meters)',
                },
              ].map((crs) => (
                <label
                  key={crs.code}
                  onClick={() => setExportCRS(crs.code as any)}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    exportCRS === crs.code
                      ? 'bg-emerald-950/40 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="modalExportCRS"
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

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/60 shrink-0">
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
            Real-time in-browser transformation
          </span>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
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
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
