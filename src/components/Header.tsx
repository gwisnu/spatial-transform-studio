import { BasemapStyle, SpatialLayer } from '../types/spatial';
import { Layers, Plus, Map, Globe, Moon, Mountain, Wand2, Calculator } from 'lucide-react';

interface HeaderProps {
  layers: SpatialLayer[];
  basemap: BasemapStyle;
  onChangeBasemap: (style: BasemapStyle) => void;
  onOpenUpload: () => void;
  onOpenGeoprocessing: () => void;
  onOpenCoordTransform: () => void;
  isTableCollapsed: boolean;
  onToggleTable: () => void;
  isLayerPanelVisible: boolean;
  onToggleLayerPanel: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  layers,
  basemap,
  onChangeBasemap,
  onOpenUpload,
  onOpenGeoprocessing,
  onOpenCoordTransform,
  isTableCollapsed,
  onToggleTable,
  isLayerPanelVisible,
  onToggleLayerPanel,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md shrink-0 z-30">
      {/* Zone 1: Single text wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
          ST
        </div>
        <div className="leading-tight">
          <span className="text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap block">
            Spatial Data Conversion 
          </span>
          <span className="text-[10px] text-slate-400 font-mono block">
            Convert data format and coordinate system
          </span>
        </div>
      </div>

      {/* Zone 2: Basemap switcher and view controls */}
      <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-300">
        {/* Basemap Segmented Selector */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            onClick={() => onChangeBasemap('satellite')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
              basemap === 'satellite'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Satellite Imagery with hybrid labels"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Satellite</span>
          </button>

          <button
            onClick={() => onChangeBasemap('dark')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
              basemap === 'dark'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Dark Cartography"
          >
            <Moon className="w-3.5 h-3.5" />
            <span>Dark</span>
          </button>

          <button
            onClick={() => onChangeBasemap('streets')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
              basemap === 'streets'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="OpenStreetMap Streets"
          >
            <Map className="w-3.5 h-3.5" />
            <span>Streets</span>
          </button>

          <button
            onClick={() => onChangeBasemap('topo')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
              basemap === 'topo'
                ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Topographic Terrain"
          >
            <Mountain className="w-3.5 h-3.5" />
            <span>Topo</span>
          </button>
        </div>

        {/* Geoprocessing Studio Button */}
        <button
          onClick={onOpenGeoprocessing}
          className="px-3 py-1.5 rounded-lg border border-slate-800 hover:border-emerald-500/40 bg-slate-900 text-slate-300 hover:text-emerald-300 text-xs transition-colors whitespace-nowrap flex items-center gap-1.5 shadow-sm"
          title="Open Geoprocessing tools (Multiple Buffer, Line to Polygon)"
        >
          <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Geoprocessing</span>
        </button>

        {/* Dedicated Coordinate Transformation Tool */}
        <button
          onClick={onOpenCoordTransform}
          className="px-3 py-1.5 rounded-lg border border-slate-800 hover:border-emerald-500/40 bg-slate-900 text-slate-300 hover:text-emerald-300 text-xs transition-colors whitespace-nowrap flex items-center gap-1.5 shadow-sm"
          title="Open Batch 2D / 3D Coordinate Transformation Tools (Tutupan, UTM 50S, WGS 84)"
        >
          <Calculator className="w-3.5 h-3.5 text-emerald-400" />
          <span>Coord Transform</span>
        </button>

        {/* Toggle Layer Panel (Table of Contents) */}
        <button
          onClick={onToggleLayerPanel}
          className={`px-3 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            isLayerPanelVisible
              ? 'bg-slate-800 text-slate-100 border-slate-700'
              : 'border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Table of Contents / Layer Panel"
        >
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>Layers ({layers.length})</span>
          <span className={`w-1.5 h-1.5 rounded-full ${isLayerPanelVisible ? 'bg-emerald-400' : 'bg-slate-600'}`} />
        </button>

        {/* Toggle Attribute Table */}
        <button
          onClick={onToggleTable}
          className={`px-3 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            !isTableCollapsed
              ? 'bg-slate-800 text-slate-100 border-slate-700'
              : 'border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Table View</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </button>
      </div>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenUpload}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Ingest Dataset</span>
        </button>
      </div>
    </header>
  );
};
