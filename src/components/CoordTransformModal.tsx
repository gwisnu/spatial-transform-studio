import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CRS, SpatialLayer, SUPPORTED_CRS } from '../types/spatial';
import {
  Calculator,
  FileSpreadsheet,
  Upload,
  X,
  ArrowRight,
  ArrowLeftRight,
  Download,
  Layers,
  Copy,
  Check,
  RotateCcw,
  Info,
  Sparkles,
  Table,
  MapPin,
  Search,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  transformCoordinate3D,
  calcTutupanElevationAdjustment,
  calculateBounds
} from '../utils/coordinateTransform';
import { parseDelimitedLine, detectDelimiter } from '../utils/parsers';

interface CoordTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportLayer: (layer: SpatialLayer) => void;
}

export interface TransformedPoint {
  id: string;
  sourceX: number;
  sourceY: number;
  sourceZ?: number;
  targetX: number;
  targetY: number;
  targetZ?: number;
  dZ?: number;
  rawAttributes: Record<string, string>;
}

// Sample presets for quick testing
const SAMPLE_TUTUPAN_TEXT = `Point_ID,Easting,Northing,Elevation,Description
BM-01,4040.702,9070.668,100.000,Calibration Origin
TP-02,4150.250,9200.500,105.420,Pit North Crest
TP-03,3980.120,8890.300,95.180,Pit South Crest
TP-04,4500.000,9500.000,112.500,Haul Road Ramp A
TP-05,3700.000,8500.000,88.750,Dump Area East`;

const SAMPLE_UTM50S_TEXT = `Point_ID,Easting,Northing,Elevation,Description
BM-01,334759.446,9757090.680,119.250,Calibration Origin
TP-02,334818.910,9757220.150,124.670,Pit North Crest
TP-03,334726.850,9756910.420,114.430,Pit South Crest
TP-04,335010.500,9757520.800,131.750,Haul Road Ramp A
TP-05,334570.200,9756520.100,108.000,Dump Area East`;

export const CoordTransformModal: React.FC<CoordTransformModalProps> = ({
  isOpen,
  onClose,
  onImportLayer,
}) => {
  // Input method: text paste vs file upload
  const [inputTab, setInputTab] = useState<'text' | 'file'>('text');
  const [inputText, setInputText] = useState<string>(SAMPLE_TUTUPAN_TEXT);
  const [uploadedFileName, setUploadedFileName] = useState<string>('tutupan_sample.csv');
  const [delimiter, setDelimiter] = useState<string>('auto');
  const [hasHeader, setHasHeader] = useState<boolean>(true);

  // CRS Configuration
  const [sourceCRS, setSourceCRS] = useState<CRS>('TUTUPAN');
  const [targetCRS, setTargetCRS] = useState<CRS>('EPSG:32750');
  const [is3D, setIs3D] = useState<boolean>(true);

  // Column Mapping
  const [idCol, setIdCol] = useState<string>('');
  const [xCol, setXCol] = useState<string>('');
  const [yCol, setYCol] = useState<string>('');
  const [zCol, setZCol] = useState<string>('');

  // Results & Table UI State
  const [transformedResults, setTransformedResults] = useState<TransformedPoint[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTransforming, setIsTransforming] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  // Is 3D transformation eligible? (must involve TUTUPAN for inclined plane elevation transformation)
  const is3DEligible = sourceCRS === 'TUTUPAN' || targetCRS === 'TUTUPAN';

  // Automatically enforce 2D if neither CRS is Tutupan
  useEffect(() => {
    if (!is3DEligible && is3D) {
      setIs3D(false);
    }
  }, [is3DEligible, is3D]);

  // Parse raw rows and detected columns from inputText
  const parsedInput = useMemo(() => {
    if (!inputText.trim()) {
      return { columns: [], rows: [], effectiveDelimiter: ',' };
    }

    const lines = inputText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { columns: [], rows: [], effectiveDelimiter: ',' };
    }

    const effectiveDelimiter = delimiter === 'auto' ? detectDelimiter(inputText) : delimiter;
    const parsedRows = lines.map((line) => parseDelimitedLine(line, effectiveDelimiter));

    if (parsedRows.length === 0) {
      return { columns: [], rows: [], effectiveDelimiter };
    }

    let columns: string[] = [];
    let dataRows: string[][] = [];

    if (hasHeader && parsedRows.length > 0) {
      columns = parsedRows[0].map((c, i) => c.trim() || `Col_${i + 1}`);
      dataRows = parsedRows.slice(1);
    } else {
      const maxCols = Math.max(...parsedRows.map((r) => r.length));
      columns = Array.from({ length: maxCols }, (_, i) => `Col_${i + 1}`);
      dataRows = parsedRows;
    }

    return { columns, rows: dataRows, effectiveDelimiter };
  }, [inputText, delimiter, hasHeader]);

  // Guess best column mappings when columns change
  useEffect(() => {
    if (parsedInput.columns.length === 0) return;

    const cols = parsedInput.columns;

    // Guess X / Easting
    const xMatch = cols.find((c) =>
      /^(x|east|easting|lon|long|longitude)$/i.test(c.trim())
    ) || cols.find((c) => /(east|lon|x)/i.test(c)) || cols[1] || cols[0];

    // Guess Y / Northing
    const yMatch = cols.find((c) =>
      /^(y|north|northing|lat|latitude)$/i.test(c.trim())
    ) || cols.find((c) => /(north|lat|y)/i.test(c)) || cols[2] || cols[1];

    // Guess Z / Elevation
    const zMatch = cols.find((c) =>
      /^(z|elev|elevation|height|alt|altitude|rl)$/i.test(c.trim())
    ) || cols.find((c) => /(elev|z|height|rl)/i.test(c)) || cols[3] || '';

    // Guess ID / Name
    const idMatch = cols.find((c) =>
      /^(id|point|point_id|pt|name|station|no|code)$/i.test(c.trim())
    ) || cols.find((c) => /(id|point|name)/i.test(c)) || cols[0];

    if (!xCol || !cols.includes(xCol)) setXCol(xMatch || '');
    if (!yCol || !cols.includes(yCol)) setYCol(yMatch || '');
    if (!zCol || !cols.includes(zCol)) setZCol(zMatch || '');
    if (!idCol || !cols.includes(idCol)) setIdCol(idMatch || '');
  }, [parsedInput.columns]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    file.text().then((text) => {
      setInputText(text);
      setTransformedResults([]);
      setErrorMessage(null);
    }).catch((err) => {
      setErrorMessage(`Failed to read file: ${err.message}`);
    });
  };

  // Swap source and target CRS
  const handleSwapCRS = () => {
    const prevSource = sourceCRS;
    const prevTarget = targetCRS;
    setSourceCRS(prevTarget);
    setTargetCRS(prevSource);
    setTransformedResults([]);
  };

  // Execute Coordinate Transformation
  const handleExecuteTransform = () => {
    if (parsedInput.rows.length === 0) {
      setErrorMessage('No coordinate rows found to transform.');
      return;
    }

    if (!xCol || !yCol) {
      setErrorMessage('Please map both X (Easting/Lon) and Y (Northing/Lat) coordinate columns.');
      return;
    }

    if (is3D && !zCol) {
      setErrorMessage('Please map the Elevation / Z column for 3D transformation.');
      return;
    }

    setIsTransforming(true);
    setErrorMessage(null);

    try {
      const xIdx = parsedInput.columns.indexOf(xCol);
      const yIdx = parsedInput.columns.indexOf(yCol);
      const zIdx = is3D ? parsedInput.columns.indexOf(zCol) : -1;
      const idIdx = idCol ? parsedInput.columns.indexOf(idCol) : -1;

      const results: TransformedPoint[] = [];

      for (let i = 0; i < parsedInput.rows.length; i++) {
        const row = parsedInput.rows[i];
        const rawX = row[xIdx];
        const rawY = row[yIdx];
        const rawZ = zIdx >= 0 ? row[zIdx] : undefined;

        const xVal = parseFloat(rawX?.replace(/,/g, ''));
        const yVal = parseFloat(rawY?.replace(/,/g, ''));
        const zVal = rawZ !== undefined ? parseFloat(rawZ?.replace(/,/g, '')) : 0;

        if (isNaN(xVal) || isNaN(yVal)) {
          continue; // Skip invalid rows
        }

        const pointId = idIdx >= 0 && row[idIdx]?.trim()
          ? row[idIdx].trim()
          : `PT_${String(i + 1).padStart(3, '0')}`;

        // Build raw attributes dictionary
        const rawAttributes: Record<string, string> = {};
        parsedInput.columns.forEach((colName, cIdx) => {
          rawAttributes[colName] = row[cIdx] ?? '';
        });

        // Compute 2D or 3D coordinate transformation
        const transformed = transformCoordinate3D(
          [xVal, yVal, zVal],
          sourceCRS,
          targetCRS,
          is3D
        );

        let dZ: number | undefined = undefined;
        if (is3D) {
          dZ = transformed[2] - zVal;
        }

        results.push({
          id: pointId,
          sourceX: xVal,
          sourceY: yVal,
          sourceZ: is3D ? zVal : undefined,
          targetX: transformed[0],
          targetY: transformed[1],
          targetZ: is3D ? transformed[2] : undefined,
          dZ,
          rawAttributes,
        });
      }

      if (results.length === 0) {
        throw new Error('No valid numeric coordinate pairs could be parsed from the data.');
      }

      setTransformedResults(results);
    } catch (err: any) {
      setErrorMessage(err.message || 'Transformation failed.');
    } finally {
      setIsTransforming(false);
    }
  };

  // Filter transformed results by search
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return transformedResults;
    const query = searchQuery.toLowerCase();
    return transformedResults.filter(
      (pt) =>
        pt.id.toLowerCase().includes(query) ||
        String(pt.sourceX).includes(query) ||
        String(pt.sourceY).includes(query) ||
        String(pt.targetX).includes(query) ||
        String(pt.targetY).includes(query) ||
        Object.values(pt.rawAttributes).some((v) => v.toLowerCase().includes(query))
    );
  }, [transformedResults, searchQuery]);

  // Export Table as CSV
  const handleExportCSV = () => {
    if (transformedResults.length === 0) return;

    // Build CSV Headers
    const headers = [
      'Point_ID',
      `Source_X_${sourceCRS}`,
      `Source_Y_${sourceCRS}`,
      ...(is3D ? [`Source_Z_${sourceCRS}`] : []),
      `Target_X_${targetCRS}`,
      `Target_Y_${targetCRS}`,
      ...(is3D ? [`Target_Z_${targetCRS}`, 'Delta_Z_Meters'] : []),
      ...parsedInput.columns.filter((c) => c !== idCol && c !== xCol && c !== yCol && c !== zCol),
    ];

    const lines = [headers.join(',')];

    transformedResults.forEach((pt) => {
      const extraCols = parsedInput.columns
        .filter((c) => c !== idCol && c !== xCol && c !== yCol && c !== zCol)
        .map((c) => `"${(pt.rawAttributes[c] || '').replace(/"/g, '""')}"`);

      const row = [
        `"${pt.id.replace(/"/g, '""')}"`,
        sourceCRS === 'EPSG:4326' ? pt.sourceX.toFixed(7) : pt.sourceX.toFixed(3),
        sourceCRS === 'EPSG:4326' ? pt.sourceY.toFixed(7) : pt.sourceY.toFixed(3),
        ...(is3D ? [pt.sourceZ !== undefined ? pt.sourceZ.toFixed(3) : ''] : []),
        targetCRS === 'EPSG:4326' ? pt.targetX.toFixed(7) : pt.targetX.toFixed(3),
        targetCRS === 'EPSG:4326' ? pt.targetY.toFixed(7) : pt.targetY.toFixed(3),
        ...(is3D
          ? [
              pt.targetZ !== undefined ? pt.targetZ.toFixed(3) : '',
              pt.dZ !== undefined ? pt.dZ.toFixed(3) : '',
            ]
          : []),
        ...extraCols,
      ];
      lines.push(row.join(','));
    });

    const csvBlob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Transformed_${sourceCRS}_to_${targetCRS}_${is3D ? '3D' : '2D'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy Results to Clipboard
  const handleCopyClipboard = () => {
    if (transformedResults.length === 0) return;

    const headers = [
      'Point_ID',
      `Source_X (${sourceCRS})`,
      `Source_Y (${sourceCRS})`,
      ...(is3D ? [`Source_Z (${sourceCRS})`] : []),
      `Target_X (${targetCRS})`,
      `Target_Y (${targetCRS})`,
      ...(is3D ? [`Target_Z (${targetCRS})`, 'Delta_Z'] : []),
    ];

    const rows = transformedResults.map((pt) => [
      pt.id,
      sourceCRS === 'EPSG:4326' ? pt.sourceX.toFixed(7) : pt.sourceX.toFixed(3),
      sourceCRS === 'EPSG:4326' ? pt.sourceY.toFixed(7) : pt.sourceY.toFixed(3),
      ...(is3D ? [pt.sourceZ !== undefined ? pt.sourceZ.toFixed(3) : ''] : []),
      targetCRS === 'EPSG:4326' ? pt.targetX.toFixed(7) : pt.targetX.toFixed(3),
      targetCRS === 'EPSG:4326' ? pt.targetY.toFixed(7) : pt.targetY.toFixed(3),
      ...(is3D
        ? [
            pt.targetZ !== undefined ? pt.targetZ.toFixed(3) : '',
            pt.dZ !== undefined ? (pt.dZ >= 0 ? `+${pt.dZ.toFixed(3)}` : pt.dZ.toFixed(3)) : '',
          ]
        : []),
    ]);

    const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    });
  };

  // Import to Map as a new Point Layer
  const handleImportToMap = () => {
    if (transformedResults.length === 0) return;

    // Convert transformed points into GeoJSON features in WGS84 for MapLibre rendering
    const features: GeoJSON.Feature[] = transformedResults.map((pt, i) => {
      // Find WGS84 coordinates for map display
      let lngLat: [number, number];
      if (targetCRS === 'EPSG:4326') {
        lngLat = [pt.targetX, pt.targetY];
      } else {
        const wgs = transformCoordinate3D(
          [pt.targetX, pt.targetY, pt.targetZ ?? 0],
          targetCRS,
          'EPSG:4326',
          false
        );
        lngLat = [wgs[0], wgs[1]];
      }

      return {
        type: 'Feature',
        id: `trans_pt_${i}`,
        geometry: {
          type: 'Point',
          coordinates: is3D && pt.targetZ !== undefined ? [lngLat[0], lngLat[1], pt.targetZ] : [lngLat[0], lngLat[1]],
        },
        properties: {
          Point_ID: pt.id,
          Target_CRS: targetCRS,
          Target_X: pt.targetX,
          Target_Y: pt.targetY,
          ...(is3D ? { Target_Z: pt.targetZ, Delta_Z: pt.dZ } : {}),
          Source_CRS: sourceCRS,
          Source_X: pt.sourceX,
          Source_Y: pt.sourceY,
          ...(is3D ? { Source_Z: pt.sourceZ } : {}),
          ...pt.rawAttributes,
        },
      };
    });

    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    const bounds = calculateBounds(featureCollection);

    const newLayer: SpatialLayer = {
      id: `layer_trans_${Date.now()}`,
      name: `Transformed_${sourceCRS}_to_${targetCRS}${is3D ? '_3D' : ''}`,
      originalFileName: uploadedFileName || 'transformed_coordinates.csv',
      format: 'csv',
      sourceCRS: targetCRS,
      geojson: featureCollection,
      featureCount: features.length,
      geometryTypes: ['Point'],
      color: '#10B981', // emerald
      opacity: 0.95,
      lineWidth: 2,
      pointSize: 7,
      visible: true,
      bounds,
      createdAt: Date.now(),
      fields: [
        { name: 'Point_ID', type: 'string' },
        { name: 'Target_X', type: 'number' },
        { name: 'Target_Y', type: 'number' },
        ...(is3D
          ? [
              { name: 'Target_Z', type: 'number' as const },
              { name: 'Delta_Z', type: 'number' as const },
            ]
          : []),
        { name: 'Source_X', type: 'number' },
        { name: 'Source_Y', type: 'number' },
      ],
    };

    onImportLayer(newLayer);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Coordinate Transformation Tools</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  2D / 3D Batch Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Transform coordinates between Tutupan Mine Grid, UTM Zone 50S, and WGS 84 with inclined plane elevation adjustment.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Control Grid: Input Source + Transformation Settings */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (7 cols): Input Data (Text Paste vs File) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Input Coordinates
                  </label>
                </div>

                {/* Input Mode Selector */}
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-medium">
                  <button
                    onClick={() => setInputTab('text')}
                    className={`px-3 py-1 rounded transition-colors ${
                      inputTab === 'text'
                        ? 'bg-slate-800 text-emerald-300 font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Paste Text
                  </button>
                  <button
                    onClick={() => setInputTab('file')}
                    className={`px-3 py-1 rounded transition-colors ${
                      inputTab === 'file'
                        ? 'bg-slate-800 text-emerald-300 font-semibold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Upload CSV
                  </button>
                </div>
              </div>

              {/* Text Area or File Dropzone */}
              {inputTab === 'text' ? (
                <div className="space-y-2">
                  <div className="relative">
                    <textarea
                      value={inputText}
                      onChange={(e) => {
                        setInputText(e.target.value);
                        setTransformedResults([]);
                      }}
                      rows={6}
                      placeholder="Paste CSV, TSV, or whitespace delimited coordinates here..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none shadow-inner"
                    />
                  </div>

                  {/* Sample Data Presets */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Quick Samples:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setInputText(SAMPLE_TUTUPAN_TEXT);
                          setSourceCRS('TUTUPAN');
                          setTargetCRS('EPSG:32750');
                          setIs3D(true);
                          setTransformedResults([]);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 transition-colors"
                      >
                        Tutupan Grid Sample
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setInputText(SAMPLE_UTM50S_TEXT);
                          setSourceCRS('EPSG:32750');
                          setTargetCRS('TUTUPAN');
                          setIs3D(true);
                          setTransformedResults([]);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 transition-colors"
                      >
                        UTM 50S Sample
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-950/60 rounded-xl p-6 text-center space-y-3 transition-colors">
                  <Upload className="w-8 h-8 text-slate-500 mx-auto" />
                  <div>
                    <label className="cursor-pointer px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold inline-block transition-colors">
                      Select CSV / TXT File
                      <input
                        type="file"
                        accept=".csv,.txt,.tsv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] text-slate-500 mt-2">
                      {uploadedFileName ? `Loaded: ${uploadedFileName}` : 'Supports CSV, TSV, or space-delimited text'}
                    </p>
                  </div>
                </div>
              )}

              {/* Parsing Settings & Column Selectors */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  {/* Column Separator */}
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Delimiter</label>
                    <select
                      value={delimiter}
                      onChange={(e) => {
                        setDelimiter(e.target.value);
                        setTransformedResults([]);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="auto">Auto Detect</option>
                      <option value=",">Comma (,)</option>
                      <option value=";">Semicolon (;)</option>
                      <option value="&#9;">Tab (\t)</option>
                      <option value=" ">Space / Whitespace</option>
                      <option value="|">Pipe (|)</option>
                    </select>
                  </div>

                  {/* Header toggle */}
                  <div className="flex flex-col justify-center">
                    <label className="text-[11px] text-slate-400 block mb-1">Header Row</label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={hasHeader}
                        onChange={(e) => {
                          setHasHeader(e.target.checked);
                          setTransformedResults([]);
                        }}
                        className="rounded border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>First row is header</span>
                    </label>
                  </div>

                  {/* Point ID Column */}
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Point ID / Label</label>
                    <select
                      value={idCol}
                      onChange={(e) => setIdCol(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">(Auto Number)</option>
                      {parsedInput.columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Elevation / Z Column */}
                  <div>
                    <label className={`text-[11px] block mb-1 ${is3D ? 'text-emerald-400 font-semibold' : 'text-slate-400'}`}>
                      Elevation / Z {is3D ? '(Required)' : '(Optional)'}
                    </label>
                    <select
                      value={zCol}
                      onChange={(e) => setZCol(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">(None / 0)</option>
                      {parsedInput.columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* X & Y Column Selectors */}
                <div className="grid grid-cols-2 gap-2.5 pt-1 border-t border-slate-800">
                  <div>
                    <label className="text-[11px] text-emerald-400 font-semibold block mb-1">
                      X Coordinate (Easting / Longitude)
                    </label>
                    <select
                      value={xCol}
                      onChange={(e) => setXCol(e.target.value)}
                      className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-medium focus:outline-none"
                    >
                      {parsedInput.columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-emerald-400 font-semibold block mb-1">
                      Y Coordinate (Northing / Latitude)
                    </label>
                    <select
                      value={yCol}
                      onChange={(e) => setYCol(e.target.value)}
                      className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-medium focus:outline-none"
                    >
                      {parsedInput.columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Detected: {parsedInput.rows.length} coordinate rows</span>
                  <span className="font-mono">Delimiter: &quot;{parsedInput.effectiveDelimiter === '\t' ? '\\t' : parsedInput.effectiveDelimiter}&quot;</span>
                </div>
              </div>
            </div>

            {/* Right Column (5 cols): Transformation Settings & Action */}
            <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Coordinate Systems & Dimensions
                  </label>
                </div>

                {/* Source & Target CRS Selector with Swap Button */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  {/* Source CRS */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5 font-medium">Source CRS</label>
                    <select
                      value={sourceCRS}
                      onChange={(e) => {
                        setSourceCRS(e.target.value as CRS);
                        setTransformedResults([]);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    >
                      <option value="TUTUPAN">Local Coordinate System (Tutupan Mine Grid)</option>
                      <option value="EPSG:32750">EPSG:32750 (WGS 84 / UTM zone 50S)</option>
                      <option value="EPSG:4326">EPSG:4326 (WGS 84 Geographic Lat/Lon)</option>
                    </select>
                  </div>

                  {/* Swap Button */}
                  <div className="flex justify-center py-0.5">
                    <button
                      type="button"
                      onClick={handleSwapCRS}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 border border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-medium"
                      title="Swap Source and Target CRS"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>Swap Systems</span>
                    </button>
                  </div>

                  {/* Target CRS */}
                  <div>
                    <label className="text-xs text-slate-400 block mb-1.5 font-medium">Target CRS</label>
                    <select
                      value={targetCRS}
                      onChange={(e) => {
                        setTargetCRS(e.target.value as CRS);
                        setTransformedResults([]);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    >
                      <option value="EPSG:32750">EPSG:32750 (WGS 84 / UTM zone 50S)</option>
                      <option value="TUTUPAN">Local Coordinate System (Tutupan Mine Grid)</option>
                      <option value="EPSG:4326">EPSG:4326 (WGS 84 Geographic Lat/Lon)</option>
                    </select>
                  </div>
                </div>

                {/* 2D vs 3D Dimension Selector */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">Transformation Dimension</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400">
                      {is3D ? '3D Mode' : '2D Mode'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIs3D(false)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        !is3D
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-200">2D Transform</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Horizontal Plane Only (X, Y)</div>
                    </button>

                    <button
                      type="button"
                      disabled={!is3DEligible}
                      onClick={() => setIs3D(true)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        !is3DEligible
                          ? 'opacity-40 cursor-not-allowed bg-slate-900/20 border-slate-800 text-slate-500'
                          : is3D
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-slate-100 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-200">3D Transform</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Inclined Plane Elevation (Z)</div>
                    </button>
                  </div>

                  {/* Informative Note for 3D */}
                  {is3D ? (
                    <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-300/90 leading-relaxed space-y-1">
                      <div className="font-semibold flex items-center gap-1 text-emerald-400">
                        <Info className="w-3.5 h-3.5" />
                        <span>Tutupan Inclined Plane Formula Active:</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-300">
                        dZ = ((N - 5543.114) × 30.227/10⁶) + ((E + 119.715) × -11.395/10⁶) + 19.191
                      </div>
                    </div>
                  ) : !is3DEligible ? (
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-400">
                      * 3D elevation adjustment is calibrated specifically from/to Local Coordinate System (Tutupan).
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Transform Action Button */}
              <div className="space-y-2 pt-2">
                {errorMessage && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleExecuteTransform}
                  disabled={isTransforming || parsedInput.rows.length === 0}
                  className="w-full py-3 px-4 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-emerald-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isTransforming
                      ? 'Transforming...'
                      : `Transform Coordinates (${parsedInput.rows.length} Points)`}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 3: Transformed Output Table Section */}
          {transformedResults.length > 0 && (
            <div className="border border-slate-800 rounded-2xl bg-slate-950/80 p-5 space-y-4 shadow-xl">
              {/* Output Header with Metrics and Actions */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>Transformed Results</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                        {transformedResults.length} points
                      </span>
                    </h3>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                      <span className="text-amber-400">{sourceCRS}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span className="text-emerald-400">{targetCRS}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-cyan-400">{is3D ? '3D Inclined Plane' : '2D Plane'}</span>
                    </div>
                  </div>
                </div>

                {/* Search & Output Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter points..."
                      className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-44"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyClipboard}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5"
                    title="Copy formatted table to clipboard"
                  >
                    {copiedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSuccess ? 'Copied!' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                    title="Download transformed coordinates as CSV file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleImportToMap}
                    className="px-4 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-emerald-950 text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg"
                    title="Import transformed coordinates directly to map as interactive Point Layer"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Import to Map</span>
                  </button>
                </div>
              </div>

              {/* Table Data Container */}
              <div className="max-h-72 overflow-x-auto overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead className="bg-slate-900/90 sticky top-0 z-10 border-b border-slate-800 text-slate-400 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3 whitespace-nowrap">Point ID</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-amber-300">
                        Src X ({sourceCRS})
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-amber-300">
                        Src Y ({sourceCRS})
                      </th>
                      {is3D && (
                        <th className="py-2.5 px-3 whitespace-nowrap text-amber-300">
                          Src Z ({sourceCRS})
                        </th>
                      )}
                      <th className="py-2.5 px-3 whitespace-nowrap text-emerald-300 font-bold bg-emerald-500/5">
                        Transformed X ({targetCRS})
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-emerald-300 font-bold bg-emerald-500/5">
                        Transformed Y ({targetCRS})
                      </th>
                      {is3D && (
                        <>
                          <th className="py-2.5 px-3 whitespace-nowrap text-emerald-300 font-bold bg-emerald-500/5">
                            Transformed Z ({targetCRS})
                          </th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-cyan-300">
                            Δ Elevation (dZ)
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredResults.map((pt, i) => (
                      <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-semibold text-slate-200 whitespace-nowrap">
                          {pt.id}
                        </td>
                        <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                          {sourceCRS === 'EPSG:4326' ? pt.sourceX.toFixed(7) : pt.sourceX.toFixed(3)}
                        </td>
                        <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                          {sourceCRS === 'EPSG:4326' ? pt.sourceY.toFixed(7) : pt.sourceY.toFixed(3)}
                        </td>
                        {is3D && (
                          <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                            {pt.sourceZ !== undefined ? pt.sourceZ.toFixed(3) : '-'}
                          </td>
                        )}
                        <td className="py-2 px-3 text-emerald-300 font-semibold bg-emerald-500/5 whitespace-nowrap">
                          {targetCRS === 'EPSG:4326' ? pt.targetX.toFixed(7) : pt.targetX.toFixed(3)}
                        </td>
                        <td className="py-2 px-3 text-emerald-300 font-semibold bg-emerald-500/5 whitespace-nowrap">
                          {targetCRS === 'EPSG:4326' ? pt.targetY.toFixed(7) : pt.targetY.toFixed(3)}
                        </td>
                        {is3D && (
                          <>
                            <td className="py-2 px-3 text-emerald-300 font-semibold bg-emerald-500/5 whitespace-nowrap">
                              {pt.targetZ !== undefined ? pt.targetZ.toFixed(3) : '-'}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {pt.dZ !== undefined ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  pt.dZ >= 0 ? 'bg-cyan-500/10 text-cyan-300' : 'bg-rose-500/10 text-rose-300'
                                }`}>
                                  {pt.dZ >= 0 ? `+${pt.dZ.toFixed(3)} m` : `${pt.dZ.toFixed(3)} m`}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredResults.length === 0 && (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No points matched your filter query.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
