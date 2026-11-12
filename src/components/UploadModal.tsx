import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CRS, SpatialLayer, SUPPORTED_CRS } from '../types/spatial';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Compass,
  Loader2,
  Layers,
  Sparkles,
  ArrowRight,
  FileSpreadsheet,
  Table,
  MapPin
} from 'lucide-react';
import {
  parseGeoJSON,
  parseDXF,
  parseKML,
  parseShapefile,
  extractRawFeaturesFromFile,
  inspectCSV,
  parseCSV,
  CSVInspection
} from '../utils/parsers';
import { guessCoordinateSystem, CRSGuessResult } from '../utils/coordinateTransform';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLayers: (layers: SpatialLayer[]) => void;
  onAddLayer?: (layer: SpatialLayer) => void;
}

const LAYER_PALETTE = [
  '#10B981', // emerald
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // purple
  '#06B6D4', // cyan
  '#EF4444', // red
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
];

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onAddLayers,
  onAddLayer,
}) => {
  // Ingest mode tab: Vector vs CSV
  const [ingestMode, setIngestMode] = useState<'vector' | 'csv'>('vector');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCRS, setSelectedCRS] = useState<CRS>('EPSG:4326');
  const [separateDXF, setSeparateDXF] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [crsGuess, setCrsGuess] = useState<CRSGuessResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [userManuallySelectedCRS, setUserManuallySelectedCRS] = useState(false);

  // CSV-specific inspection & column mapping state
  const [csvText, setCsvText] = useState<string>('');
  const [csvDelimiter, setCsvDelimiter] = useState<string>(',');
  const [csvInspection, setCsvInspection] = useState<CSVInspection | null>(null);
  const [csvXCol, setCsvXCol] = useState<string>('');
  const [csvYCol, setCsvYCol] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle CSV file inspection
  const analyzeCSVContent = (text: string, customDelimiter?: string) => {
    const inspection = inspectCSV(text, customDelimiter);
    setCsvText(text);
    setCsvInspection(inspection);
    setCsvDelimiter(inspection.delimiter);
    setCsvXCol(inspection.guessedX);
    setCsvYCol(inspection.guessedY);

    if (inspection.sampleCoordinates.length > 0) {
      const sampleFeatures: GeoJSON.Feature[] = inspection.sampleCoordinates.map((coord, i) => ({
        type: 'Feature',
        id: `sample_${i}`,
        properties: {},
        geometry: { type: 'Point', coordinates: coord },
      }));
      const guess = guessCoordinateSystem(sampleFeatures, selectedCRS);
      setCrsGuess(guess);
      if (!userManuallySelectedCRS) {
        setSelectedCRS(guess.guessedCRS);
      }
    }
  };

  // Analyze file whenever selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setCrsGuess(null);
      setCsvInspection(null);
      return;
    }

    let isMounted = true;
    setIsAnalyzing(true);
    setErrorMsg(null);

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      setIngestMode('csv');
      selectedFile.text().then((text) => {
        if (!isMounted) return;
        analyzeCSVContent(text);
        setIsAnalyzing(false);
      }).catch((err) => {
        console.warn('Failed to read CSV text:', err);
        setIsAnalyzing(false);
      });
      return;
    }

    // Vector files
    extractRawFeaturesFromFile(selectedFile)
      .then((rawFeatures) => {
        if (!isMounted) return;
        if (rawFeatures.length > 0) {
          const guess = guessCoordinateSystem(rawFeatures, selectedCRS);
          setCrsGuess(guess);

          if (!userManuallySelectedCRS) {
            setSelectedCRS(guess.guessedCRS);
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to extract raw features for inspection:', err);
      })
      .finally(() => {
        if (isMounted) setIsAnalyzing(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFile]);

  // Re-evaluate mismatch whenever selectedCRS changes
  useEffect(() => {
    if (crsGuess) {
      setCrsGuess((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          isMismatch: selectedCRS !== prev.guessedCRS,
        };
      });
    }
  }, [selectedCRS]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUserManuallySelectedCRS(false);
      setErrorMsg(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setUserManuallySelectedCRS(false);
      setErrorMsg(null);
    }
  };

  const handleDelimiterChange = (newDelim: string) => {
    setCsvDelimiter(newDelim);
    if (csvText) {
      const inspection = inspectCSV(csvText, newDelim);
      setCsvInspection(inspection);
      setCsvXCol(inspection.guessedX);
      setCsvYCol(inspection.guessedY);
    }
  };

  const handleSelectCRS = (crs: CRS) => {
    setSelectedCRS(crs);
    setUserManuallySelectedCRS(true);
  };

  const handleApplyGuessedCRS = () => {
    if (crsGuess) {
      setSelectedCRS(crsGuess.guessedCRS);
      setUserManuallySelectedCRS(true);
    }
  };

  const handleProcessUpload = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const fileName = selectedFile.name;
      const ext = fileName.split('.').pop()?.toLowerCase();
      const generatedLayers: SpatialLayer[] = [];

      let colorIndex = Math.floor(Math.random() * LAYER_PALETTE.length);

      if (ingestMode === 'csv' || ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        if (!csvXCol || !csvYCol) {
          throw new Error('Please select both X (Easting/Lon) and Y (Northing/Lat) coordinate columns.');
        }

        const text = csvText || await selectedFile.text();
        const parsedResult = await parseCSV(text, fileName, {
          delimiter: csvDelimiter,
          xColumn: csvXCol,
          yColumn: csvYCol,
          sourceCRS: selectedCRS,
        });

        const color = LAYER_PALETTE[colorIndex % LAYER_PALETTE.length];
        generatedLayers.push({
          id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          ...parsedResult,
          color,
          opacity: 0.9,
          lineWidth: 2,
          pointSize: 6,
          visible: true,
          createdAt: Date.now(),
        });
      } else if (ext === 'dxf') {
        const text = await selectedFile.text();
        const parsedOutputs = await parseDXF(text, fileName, selectedCRS, separateDXF);

        parsedOutputs.forEach((output, idx) => {
          const color = LAYER_PALETTE[(colorIndex + idx) % LAYER_PALETTE.length];
          generatedLayers.push({
            id: `layer_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
            ...output.layerData,
            color,
            opacity: output.category === 'polygon' ? 0.45 : 0.9,
            lineWidth: 2,
            pointSize: 6,
            visible: true,
            createdAt: Date.now() + idx,
          });
        });
      } else if (ext === 'geojson' || ext === 'json') {
        const text = await selectedFile.text();
        const parsedResult = await parseGeoJSON(text, fileName, selectedCRS);
        const color = LAYER_PALETTE[colorIndex % LAYER_PALETTE.length];
        generatedLayers.push({
          id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          ...parsedResult,
          color,
          opacity: 0.45,
          lineWidth: 2,
          pointSize: 6,
          visible: true,
          createdAt: Date.now(),
        });
      } else if (ext === 'kml') {
        const text = await selectedFile.text();
        const parsedResult = await parseKML(text, fileName, selectedCRS);
        const color = LAYER_PALETTE[colorIndex % LAYER_PALETTE.length];
        generatedLayers.push({
          id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          ...parsedResult,
          color,
          opacity: 0.45,
          lineWidth: 2,
          pointSize: 6,
          visible: true,
          createdAt: Date.now(),
        });
      } else if (ext === 'kmz') {
        const buffer = await selectedFile.arrayBuffer();
        const parsedResult = await parseKML(buffer, fileName, selectedCRS);
        const color = LAYER_PALETTE[colorIndex % LAYER_PALETTE.length];
        generatedLayers.push({
          id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          ...parsedResult,
          color,
          opacity: 0.45,
          lineWidth: 2,
          pointSize: 6,
          visible: true,
          createdAt: Date.now(),
        });
      } else if (ext === 'zip' || ext === 'shp') {
        const buffer = await selectedFile.arrayBuffer();
        const parsedResult = await parseShapefile(buffer, fileName, selectedCRS);
        const color = LAYER_PALETTE[colorIndex % LAYER_PALETTE.length];
        generatedLayers.push({
          id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          ...parsedResult,
          color,
          opacity: 0.45,
          lineWidth: 2,
          pointSize: 6,
          visible: true,
          createdAt: Date.now(),
        });
      } else {
        throw new Error(`Unsupported file format (.${ext}). Please upload DXF, GeoJSON, Shapefile (zip), KML, or CSV.`);
      }

      if (generatedLayers.length === 0) {
        throw new Error('No valid spatial features could be extracted from this file.');
      }

      if (onAddLayers) {
        onAddLayers(generatedLayers);
      } else if (onAddLayer) {
        generatedLayers.forEach((l) => onAddLayer(l));
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse spatial dataset. Check format and CRS definition.');
    } finally {
      setIsProcessing(false);
    }
  };

  const isDxfFile = selectedFile?.name.toLowerCase().endsWith('.dxf');
  const isCsvFile = ingestMode === 'csv' || selectedFile?.name.toLowerCase().endsWith('.csv') || selectedFile?.name.toLowerCase().endsWith('.tsv') || selectedFile?.name.toLowerCase().endsWith('.txt');

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-slate-900 border border-slate-700/90 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Ingest Spatial Dataset</h2>
              <p className="text-xs text-slate-400">DXF, Shapefile, KML, GeoJSON, or Delimited CSV</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ingest Format Mode Switcher */}
        <div className="flex border-b border-slate-800 text-xs font-medium bg-slate-950/20 shrink-0">
          <button
            type="button"
            onClick={() => {
              setIngestMode('vector');
              if (selectedFile && (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.tsv') || selectedFile.name.endsWith('.txt'))) {
                setSelectedFile(null);
                setCrsGuess(null);
              }
            }}
            className={`flex-1 py-3 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              ingestMode === 'vector'
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Vector GIS / CAD (DXF, SHP, KML, GeoJSON)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIngestMode('csv');
              if (selectedFile && !(selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.tsv') || selectedFile.name.endsWith('.txt'))) {
                setSelectedFile(null);
                setCrsGuess(null);
              }
            }}
            className={`flex-1 py-3 flex items-center justify-center gap-2 border-b-2 transition-colors ${
              ingestMode === 'csv'
                ? 'border-emerald-400 text-emerald-400 bg-slate-800/40 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Delimited Coordinates (CSV / TSV)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* File Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-emerald-500 bg-emerald-500/5'
                : selectedFile
                ? 'border-emerald-500/40 bg-slate-950/40'
                : 'border-slate-700 hover:border-slate-600 bg-slate-950/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={
                ingestMode === 'csv'
                  ? '.csv,.tsv,.txt'
                  : '.dxf,.geojson,.json,.kml,.kmz,.zip,.shp'
              }
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                {isCsvFile ? (
                  <FileSpreadsheet className="w-8 h-8 text-emerald-400 shrink-0" />
                ) : (
                  <FileText className="w-8 h-8 text-emerald-400 shrink-0" />
                )}
                <div className="text-left">
                  <p className="text-xs font-semibold text-slate-200 font-mono truncate max-w-[280px]">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Click to replace
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Upload className="w-7 h-7 text-slate-500 mx-auto" />
                <div className="text-xs text-slate-300">
                  <span className="font-semibold text-emerald-400">Click to upload</span> or drag and drop
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {ingestMode === 'csv'
                    ? 'Supported: .CSV, .TSV, .TXT'
                    : 'Supported: .DXF, .GEOJSON, .SHP/.ZIP, .KML/.KMZ'}
                </div>
              </div>
            )}
          </div>

          {/* CSV Specific Configuration: Column Separator & X/Y Point Geometry Selection */}
          {isCsvFile && selectedFile && csvInspection && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-200 border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Delimited File Configuration</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {csvInspection.totalRows} rows · {csvInspection.columns.length} columns
                </span>
              </div>

              {/* 1. Define Column Separator */}
              <div>
                <label className="text-xs text-slate-300 block mb-1.5 font-medium">
                  Column Separator / Delimiter:
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { id: ',', label: 'Comma (,)' },
                    { id: ';', label: 'Semicolon (;)' },
                    { id: '\t', label: 'Tab (\\t)' },
                    { id: '|', label: 'Pipe (|)' },
                    { id: 'whitespace', label: 'Space' },
                  ].map((delim) => (
                    <button
                      key={delim.id}
                      type="button"
                      onClick={() => handleDelimiterChange(delim.id)}
                      className={`py-1.5 px-2 text-xs rounded-lg border font-mono transition-colors text-center ${
                        csvDelimiter === delim.id
                          ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {delim.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Select X and Y Columns for Point Geometry */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs text-slate-300 flex items-center gap-1 mb-1.5 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>X Column (Easting / Longitude)</span>
                  </label>
                  <select
                    value={csvXCol}
                    onChange={(e) => setCsvXCol(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  >
                    {csvInspection.columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-300 flex items-center gap-1 mb-1.5 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Y Column (Northing / Latitude)</span>
                  </label>
                  <select
                    value={csvYCol}
                    onChange={(e) => setCsvYCol(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  >
                    {csvInspection.columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. CSV Data Preview Table */}
              {csvInspection.previewRows.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Table className="w-3.5 h-3.5 text-slate-400" />
                      <span>Data Preview (first {csvInspection.previewRows.length} rows):</span>
                    </span>
                    <span className="text-[10px] text-amber-400">
                      Point: [{csvXCol || 'X'}, {csvYCol || 'Y'}]
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60 max-h-36">
                    <table className="w-full text-left text-[11px] font-mono border-collapse">
                      <thead className="bg-slate-950/90 sticky top-0 border-b border-slate-800 text-slate-400">
                        <tr>
                          {csvInspection.columns.map((col) => (
                            <th
                              key={col}
                              className={`py-1.5 px-2.5 whitespace-nowrap ${
                                col === csvXCol
                                  ? 'text-amber-400 bg-amber-950/30 font-bold'
                                  : col === csvYCol
                                  ? 'text-cyan-400 bg-cyan-950/30 font-bold'
                                  : ''
                              }`}
                            >
                              {col}
                              {col === csvXCol && ' (X)'}
                              {col === csvYCol && ' (Y)'}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {csvInspection.previewRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-800/30">
                            {csvInspection.columns.map((col) => (
                              <td
                                key={col}
                                className={`py-1 px-2.5 whitespace-nowrap max-w-[140px] truncate ${
                                  col === csvXCol
                                    ? 'text-amber-300 font-semibold bg-amber-950/10'
                                    : col === csvYCol
                                    ? 'text-cyan-300 font-semibold bg-cyan-950/10'
                                    : ''
                                }`}
                              >
                                {row[col] ?? ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Smart CRS Detection / Mismatch Warning */}
          {crsGuess && (
            <div className="space-y-2">
              {/* Extent Coordinates Inspection Badge */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5 font-sans font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Coordinate Extent Analysis:
                  </span>
                  <span className="text-slate-300 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
                    Detected: <strong className="text-emerald-400">{crsGuess.guessedCRS}</strong>
                  </span>
                </div>
                <div className="text-slate-300 text-[10px] truncate">
                  X Range: [{crsGuess.rawExtent[0].toFixed(2)}, {crsGuess.rawExtent[2].toFixed(2)}]
                </div>
                <div className="text-slate-300 text-[10px] truncate">
                  Y Range: [{crsGuess.rawExtent[1].toFixed(2)}, {crsGuess.rawExtent[3].toFixed(2)}]
                </div>
                <div className="text-slate-400 text-[10px] italic font-sans pt-0.5">
                  {crsGuess.reason}
                </div>
              </div>

              {/* Mismatch Warning Alert if User selected CRS conflicts with detected extent */}
              {crsGuess.isMismatch && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-600/40 text-amber-200 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-amber-300">Coordinate System Mismatch Detected</div>
                      <p className="text-[11px] text-amber-200/90 leading-relaxed mt-0.5">
                        The file coordinates correspond to <strong className="text-white">{crsGuess.guessedCRS}</strong>, but you have selected <strong className="text-white">{selectedCRS}</strong>. Rendering may be displaced or distorted if imported with the wrong CRS.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyGuessedCRS}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 text-xs font-semibold transition-colors"
                  >
                    <span>Auto-Correct to {crsGuess.guessedCRS}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* DXF Entity Separation Toggle */}
          {isDxfFile && (
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={separateDXF}
                  onChange={(e) => setSeparateDXF(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                />
                <div className="flex-1">
                  <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Automatically separate layers by entity / feature type</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    Splits DXF into dedicated layers for <strong>Polygons</strong> (closed shapes, 3DFaces), <strong>Lines & Polylines</strong>, and <strong>Points & Text</strong>, each with its own style and attributes.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* CRS Definition Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-400" />
              <span>Select Source Coordinate System (CRS)</span>
            </label>

            <div className="space-y-2 mt-2">
              {SUPPORTED_CRS.map((crs) => (
                <label
                  key={crs.code}
                  onClick={() => handleSelectCRS(crs.code)}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedCRS === crs.code
                      ? 'bg-emerald-950/30 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/50'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="uploadCRS"
                    checked={selectedCRS === crs.code}
                    onChange={() => handleSelectCRS(crs.code)}
                    className="mt-1 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{crs.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        {crs.unit}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{crs.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Tutupan Calibration Info Callout */}
            {selectedCRS === 'TUTUPAN' && (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-[11px] text-emerald-300 space-y-1 font-mono">
                <div className="flex items-center gap-1 font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Site Calibration Tutupan Active</span>
                </div>
              </div>
            )}
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-950/60 shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">
            {isCsvFile ? 'Point geometry layer' : 'Vector layer(s)'}
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
              onClick={handleProcessUpload}
              disabled={!selectedFile || isProcessing || isAnalyzing}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:pointer-events-none rounded-lg shadow-lg transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Transforming & Ingesting...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import & Transform Layer(s)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
