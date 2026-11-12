import JSZip from 'jszip';
import { CRS, SpatialLayer } from '../../types/spatial';
import { transformGeoJSON } from '../coordinateTransform';

/**
 * Trigger browser file download of Blob
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export layer to GeoJSON file in target CRS
 */
export function exportToGeoJSON(layer: SpatialLayer, targetCRS: CRS) {
  const transformed = transformGeoJSON(layer.geojson, 'EPSG:4326', targetCRS);
  const data = {
    ...transformed,
    crs: {
      type: 'name',
      properties: {
        name: targetCRS === 'EPSG:4326'
          ? 'urn:ogc:def:crs:OGC:1.3:CRS84'
          : targetCRS === 'EPSG:32750'
          ? 'urn:ogc:def:crs:EPSG::32750'
          : 'TUTUPAN_LOCAL_GRID',
      },
    },
  };

  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/geo+json' });
  const crsSuffix = targetCRS.replace(':', '_');
  downloadBlob(blob, `${layer.name}_${crsSuffix}.geojson`);
}

/**
 * Export layer to KML file
 */
export function exportToKML(layer: SpatialLayer, targetCRS: CRS) {
  // Transform coordinates to target CRS (standard KML is usually 4326, but surveyors often need custom)
  const transformed = transformGeoJSON(layer.geojson, 'EPSG:4326', targetCRS);

  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(layer.name)}</name>
    <description>Exported from SpatialTransform Studio - CRS: ${targetCRS}</description>
    <Style id="polyStyle">
      <LineStyle>
        <color>ff${layer.color.replace('#', '')}</color>
        <width>${layer.lineWidth || 2}</width>
      </LineStyle>
      <PolyStyle>
        <color>80${layer.color.replace('#', '')}</color>
      </PolyStyle>
    </Style>
    <Style id="lineStyle">
      <LineStyle>
        <color>ff${layer.color.replace('#', '')}</color>
        <width>${layer.lineWidth || 2}</width>
      </LineStyle>
    </Style>
    <Style id="pointStyle">
      <IconStyle>
        <color>ff${layer.color.replace('#', '')}</color>
        <scale>1.1</scale>
      </IconStyle>
    </Style>
`;

  transformed.features.forEach((feat, idx) => {
    const props = feat.properties || {};
    const name = props.name || props.id || props.title || `Feature ${idx + 1}`;
    const desc = Object.entries(props)
      .map(([k, v]) => `<b>${escapeXml(k)}:</b> ${escapeXml(String(v))}`)
      .join('<br/>');

    kml += `    <Placemark>
      <name>${escapeXml(String(name))}</name>
      <description><![CDATA[${desc}]]></description>
      <ExtendedData>
`;
    for (const [k, v] of Object.entries(props)) {
      kml += `        <Data name="${escapeXml(k)}"><value>${escapeXml(String(v ?? ''))}</value></Data>\n`;
    }
    kml += `      </ExtendedData>\n`;

    const geom = feat.geometry;
    if (!geom) {
      kml += `    </Placemark>\n`;
      return;
    }

    if (geom.type === 'Point') {
      const c = geom.coordinates;
      kml += `      <styleUrl>#pointStyle</styleUrl>\n`;
      kml += `      <Point><coordinates>${c[0]},${c[1]},${c[2] || 0}</coordinates></Point>\n`;
    } else if (geom.type === 'LineString') {
      const coords = geom.coordinates.map((c) => `${c[0]},${c[1]},${c[2] || 0}`).join(' ');
      kml += `      <styleUrl>#lineStyle</styleUrl>\n`;
      kml += `      <LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>\n`;
    } else if (geom.type === 'Polygon') {
      kml += `      <styleUrl>#polyStyle</styleUrl>\n`;
      kml += `      <Polygon>\n`;
      geom.coordinates.forEach((ring, rIdx) => {
        const ringCoords = ring.map((c) => `${c[0]},${c[1]},${c[2] || 0}`).join(' ');
        if (rIdx === 0) {
          kml += `        <outerBoundaryIs><LinearRing><coordinates>${ringCoords}</coordinates></LinearRing></outerBoundaryIs>\n`;
        } else {
          kml += `        <innerBoundaryIs><LinearRing><coordinates>${ringCoords}</coordinates></LinearRing></innerBoundaryIs>\n`;
        }
      });
      kml += `      </Polygon>\n`;
    } else if (geom.type === 'MultiPolygon') {
      kml += `      <styleUrl>#polyStyle</styleUrl>\n`;
      kml += `      <MultiGeometry>\n`;
      geom.coordinates.forEach((poly) => {
        kml += `        <Polygon>\n`;
        poly.forEach((ring, rIdx) => {
          const ringCoords = ring.map((c) => `${c[0]},${c[1]},${c[2] || 0}`).join(' ');
          if (rIdx === 0) {
            kml += `          <outerBoundaryIs><LinearRing><coordinates>${ringCoords}</coordinates></LinearRing></outerBoundaryIs>\n`;
          } else {
            kml += `          <innerBoundaryIs><LinearRing><coordinates>${ringCoords}</coordinates></LinearRing></innerBoundaryIs>\n`;
          }
        });
        kml += `        </Polygon>\n`;
      });
      kml += `      </MultiGeometry>\n`;
    }

    kml += `    </Placemark>\n`;
  });

  kml += `  </Document>
</kml>`;

  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const crsSuffix = targetCRS.replace(':', '_');
  downloadBlob(blob, `${layer.name}_${crsSuffix}.kml`);
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Export layer to AutoCAD DXF ASCII format in target CRS
 */
export function exportToDXF(layer: SpatialLayer, targetCRS: CRS) {
  const transformed = transformGeoJSON(layer.geojson, 'EPSG:4326', targetCRS);

  let dxf = `  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  9\n$INSUNITS\n 70\n      4\n  0\nENDSEC\n`;
  dxf += `  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nLAYER\n 70\n     1\n  0\nLAYER\n  2\n${layer.name.slice(0, 30)}\n 70\n     0\n 62\n     7\n  6\nCONTINUOUS\n  0\nENDTAB\n  0\nENDSEC\n`;
  dxf += `  0\nSECTION\n  2\nENTITIES\n`;

  const layerTag = layer.name.slice(0, 30);

  transformed.features.forEach((feat, i) => {
    const geom = feat.geometry;
    if (!geom) return;

    if (geom.type === 'Point') {
      const [x, y, z = 0] = geom.coordinates;
      dxf += `  0\nPOINT\n  8\n${layerTag}\n 10\n${x.toFixed(6)}\n 20\n${y.toFixed(6)}\n 30\n${z.toFixed(6)}\n`;
      if (feat.properties && (feat.properties.name || feat.properties.text)) {
        const textVal = String(feat.properties.name || feat.properties.text);
        dxf += `  0\nTEXT\n  8\n${layerTag}\n 10\n${x.toFixed(6)}\n 20\n${y.toFixed(6)}\n 30\n${z.toFixed(6)}\n 40\n2.5\n  1\n${textVal}\n`;
      }
    } else if (geom.type === 'LineString') {
      dxf += `  0\nPOLYLINE\n  8\n${layerTag}\n 66\n     1\n 70\n     0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n`;
      geom.coordinates.forEach((pt) => {
        dxf += `  0\nVERTEX\n  8\n${layerTag}\n 10\n${pt[0].toFixed(6)}\n 20\n${pt[1].toFixed(6)}\n 30\n${(pt[2] || 0).toFixed(6)}\n`;
      });
      dxf += `  0\nSEQEND\n`;
    } else if (geom.type === 'Polygon') {
      geom.coordinates.forEach((ring) => {
        dxf += `  0\nPOLYLINE\n  8\n${layerTag}\n 66\n     1\n 70\n     1\n 10\n0.0\n 20\n0.0\n 30\n0.0\n`;
        ring.forEach((pt) => {
          dxf += `  0\nVERTEX\n  8\n${layerTag}\n 10\n${pt[0].toFixed(6)}\n 20\n${pt[1].toFixed(6)}\n 30\n${(pt[2] || 0).toFixed(6)}\n`;
        });
        dxf += `  0\nSEQEND\n`;
      });
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((poly) => {
        poly.forEach((ring) => {
          dxf += `  0\nPOLYLINE\n  8\n${layerTag}\n 66\n     1\n 70\n     1\n 10\n0.0\n 20\n0.0\n 30\n0.0\n`;
          ring.forEach((pt) => {
            dxf += `  0\nVERTEX\n  8\n${layerTag}\n 10\n${pt[0].toFixed(6)}\n 20\n${pt[1].toFixed(6)}\n 30\n${(pt[2] || 0).toFixed(6)}\n`;
          });
          dxf += `  0\nSEQEND\n`;
        });
      });
    }
  });

  dxf += `  0\nENDSEC\n  0\nEOF\n`;

  const blob = new Blob([dxf], { type: 'application/dxf' });
  const crsSuffix = targetCRS.replace(':', '_');
  downloadBlob(blob, `${layer.name}_${crsSuffix}.dxf`);
}

/**
 * Shapefile ZIP Exporter (.shp, .shx, .dbf, .prj)
 */
export async function exportToShapefileZIP(layer: SpatialLayer, targetCRS: CRS) {
  const transformed = transformGeoJSON(layer.geojson, 'EPSG:4326', targetCRS);
  const zip = new JSZip();

  // Determine dominant geometry type (1 = Point, 3 = PolyLine, 5 = Polygon)
  let shapeType = 5; // Default Polygon
  const types = layer.geometryTypes;
  if (types.includes('Polygon') || types.includes('MultiPolygon')) {
    shapeType = 5;
  } else if (types.includes('LineString') || types.includes('MultiLineString')) {
    shapeType = 3;
  } else if (types.includes('Point') || types.includes('MultiPoint')) {
    shapeType = 1;
  }

  // Generate .prj projection string
  let prjContent = '';
  if (targetCRS === 'EPSG:4326') {
    prjContent = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  } else if (targetCRS === 'EPSG:32750') {
    prjContent = 'PROJCS["WGS_1984_UTM_Zone_50S",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",117.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
  } else {
    prjContent = 'LOCAL_CS["Tutupan_Local_Grid",LOCAL_DATUM["Tutupan_Site_Datum",0],UNIT["Meter",1.0],AXIS["Easting",EAST],AXIS["Northing",NORTH]]';
  }

  // Build binary SHP and SHX
  const { shpBuffer, shxBuffer } = buildShpAndShx(transformed.features, shapeType);

  // Build dBASE III .dbf
  const dbfBuffer = buildDbf(transformed.features, layer.fields);

  const cleanName = layer.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  zip.file(`${cleanName}.shp`, shpBuffer);
  zip.file(`${cleanName}.shx`, shxBuffer);
  zip.file(`${cleanName}.dbf`, dbfBuffer);
  zip.file(`${cleanName}.prj`, prjContent);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const crsSuffix = targetCRS.replace(':', '_');
  downloadBlob(zipBlob, `${cleanName}_${crsSuffix}_shapefile.zip`);
}

/**
 * Build ESRI Shapefile Binary .shp and .shx buffers
 */
function buildShpAndShx(features: GeoJSON.Feature[], shapeType: number): { shpBuffer: ArrayBuffer; shxBuffer: ArrayBuffer } {
  // Pre-calculate record binary sizes
  const recordBuffers: { id: number; data: Uint8Array; lengthWords: number }[] = [];
  let totalShpBytes = 100; // 100 bytes header
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  features.forEach((feat, idx) => {
    const geom = feat.geometry;
    let recData: Uint8Array;

    if (!geom) {
      // Null shape
      const buf = new Uint8Array(4);
      new DataView(buf.buffer).setInt32(0, 0, true);
      recData = buf;
    } else if (shapeType === 1) { // Point
      let coords = [0, 0];
      if (geom.type === 'Point') coords = geom.coordinates;
      else if (geom.type === 'MultiPoint' && geom.coordinates.length > 0) coords = geom.coordinates[0];

      const x = coords[0] || 0;
      const y = coords[1] || 0;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);

      const buf = new Uint8Array(20);
      const view = new DataView(buf.buffer);
      view.setInt32(0, 1, true); // ShapeType Point
      view.setFloat64(4, x, true);
      view.setFloat64(12, y, true);
      recData = buf;
    } else { // PolyLine (3) or Polygon (5)
      let rings: [number, number][][] = [];
      if (geom.type === 'LineString') {
        rings = [geom.coordinates as [number, number][]];
      } else if (geom.type === 'MultiLineString') {
        rings = geom.coordinates as [number, number][][];
      } else if (geom.type === 'Polygon') {
        rings = geom.coordinates as [number, number][][];
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach((p) => rings.push(...(p as [number, number][][])));
      }

      let numPoints = 0;
      let recMinX = Infinity, recMinY = Infinity, recMaxX = -Infinity, recMaxY = -Infinity;
      rings.forEach((r) => {
        numPoints += r.length;
        r.forEach(([x, y]) => {
          recMinX = Math.min(recMinX, x); recMaxX = Math.max(recMaxX, x);
          recMinY = Math.min(recMinY, y); recMaxY = Math.max(recMaxY, y);
        });
      });

      if (numPoints === 0) {
        recMinX = recMinY = recMaxX = recMaxY = 0;
      }

      minX = Math.min(minX, recMinX); maxX = Math.max(maxX, recMaxX);
      minY = Math.min(minY, recMinY); maxY = Math.max(maxY, recMaxY);

      const numParts = rings.length;
      const dataLength = 4 + 32 + 4 + 4 + (numParts * 4) + (numPoints * 16);
      const buf = new Uint8Array(dataLength);
      const view = new DataView(buf.buffer);

      view.setInt32(0, shapeType, true);
      view.setFloat64(4, recMinX, true);
      view.setFloat64(12, recMinY, true);
      view.setFloat64(20, recMaxX, true);
      view.setFloat64(28, recMaxY, true);
      view.setInt32(36, numParts, true);
      view.setInt32(40, numPoints, true);

      let partOffset = 0;
      let ptIndex = 0;
      rings.forEach((ring, pIdx) => {
        view.setInt32(44 + (pIdx * 4), partOffset, true);
        partOffset += ring.length;
        const ptStartByte = 44 + (numParts * 4);
        ring.forEach(([px, py]) => {
          view.setFloat64(ptStartByte + (ptIndex * 16), px, true);
          view.setFloat64(ptStartByte + (ptIndex * 16) + 8, py, true);
          ptIndex++;
        });
      });

      recData = buf;
    }

    const lengthWords = recData.byteLength / 2;
    recordBuffers.push({ id: idx + 1, data: recData, lengthWords });
    totalShpBytes += 8 + recData.byteLength;
  });

  if (!isFinite(minX)) {
    minX = minY = maxX = maxY = 0;
  }

  // Allocate SHP buffer
  const shpBuffer = new ArrayBuffer(totalShpBytes);
  const shpView = new DataView(shpBuffer);
  const shpBytes = new Uint8Array(shpBuffer);

  // Write SHP 100-byte Header
  shpView.setInt32(0, 9994, false); // Big Endian File Code
  shpView.setInt32(24, totalShpBytes / 2, false); // File Length in 16-bit words (Big Endian)
  shpView.setInt32(28, 1000, true); // Version (Little Endian)
  shpView.setInt32(32, shapeType, true); // Shape Type
  shpView.setFloat64(36, minX, true);
  shpView.setFloat64(44, minY, true);
  shpView.setFloat64(52, maxX, true);
  shpView.setFloat64(60, maxY, true);

  // Allocate SHX buffer (100 header + 8 bytes per record)
  const shxBytesLength = 100 + (recordBuffers.length * 8);
  const shxBuffer = new ArrayBuffer(shxBytesLength);
  const shxView = new DataView(shxBuffer);

  // Write SHX Header
  shxView.setInt32(0, 9994, false);
  shxView.setInt32(24, shxBytesLength / 2, false);
  shxView.setInt32(28, 1000, true);
  shxView.setInt32(32, shapeType, true);
  shxView.setFloat64(36, minX, true);
  shxView.setFloat64(44, minY, true);
  shxView.setFloat64(52, maxX, true);
  shxView.setFloat64(60, maxY, true);

  // Write Records into SHP and SHX
  let shpOffset = 100;
  recordBuffers.forEach((rec, idx) => {
    // SHX record (offset in words, content length in words)
    shxView.setInt32(100 + (idx * 8), shpOffset / 2, false);
    shxView.setInt32(100 + (idx * 8) + 4, rec.lengthWords, false);

    // SHP record header
    shpView.setInt32(shpOffset, rec.id, false);
    shpView.setInt32(shpOffset + 4, rec.lengthWords, false);
    shpBytes.set(rec.data, shpOffset + 8);

    shpOffset += 8 + rec.data.byteLength;
  });

  return { shpBuffer, shxBuffer };
}

/**
 * Build dBASE III (.dbf) binary buffer
 */
function buildDbf(features: GeoJSON.Feature[], fields: { name: string; type: string }[]): ArrayBuffer {
  // Clean field names (max 10 ASCII characters)
  const dbfFields = (fields && fields.length > 0 ? fields : [{ name: 'ID', type: 'number' }])
    .map((f, i) => {
      const safeName = (f.name.replace(/[^a-zA-Z0-9_]/g, '') || `FLD_${i}`).slice(0, 10);
      return {
        name: safeName,
        type: f.type === 'number' ? 'N' : 'C',
        length: f.type === 'number' ? 18 : 64,
        decimals: f.type === 'number' ? 4 : 0,
      };
    });

  const recordLength = 1 + dbfFields.reduce((acc, f) => acc + f.length, 0); // 1 byte delete flag + fields
  const headerLength = 32 + (dbfFields.length * 32) + 1; // 32 header + fields + terminator
  const totalLength = headerLength + (features.length * recordLength) + 1; // + 1 for EOF marker

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // DBF Header
  view.setUint8(0, 0x03); // dBASE III
  const now = new Date();
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, features.length, true); // Record count
  view.setUint16(8, headerLength, true); // Header length
  view.setUint16(10, recordLength, true); // Record length

  // Field descriptors
  let fieldOffset = 32;
  dbfFields.forEach((field) => {
    // Name
    for (let c = 0; c < 11; c++) {
      view.setUint8(fieldOffset + c, c < field.name.length ? field.name.charCodeAt(c) : 0);
    }
    view.setUint8(fieldOffset + 11, field.type.charCodeAt(0));
    view.setUint8(fieldOffset + 16, field.length);
    view.setUint8(fieldOffset + 17, field.decimals);
    fieldOffset += 32;
  });

  // Header terminator
  view.setUint8(headerLength - 1, 0x0d);

  // Write feature records
  let recOffset = headerLength;
  features.forEach((feat, fIdx) => {
    view.setUint8(recOffset, 0x20); // Not deleted (' ')
    let colOffset = recOffset + 1;

    dbfFields.forEach((f) => {
      let val = feat.properties ? feat.properties[f.name] : '';
      if (val === undefined || val === null) {
        val = fIdx + 1;
      }
      let valStr = String(val);

      if (f.type === 'N') {
        const num = parseFloat(valStr);
        valStr = isNaN(num) ? '0' : num.toFixed(f.decimals);
        valStr = valStr.padStart(f.length, ' ').slice(-f.length);
      } else {
        valStr = valStr.padEnd(f.length, ' ').slice(0, f.length);
      }

      for (let i = 0; i < f.length; i++) {
        view.setUint8(colOffset + i, i < valStr.length ? valStr.charCodeAt(i) : 32);
      }
      colOffset += f.length;
    });

    recOffset += recordLength;
  });

  // EOF marker
  view.setUint8(totalLength - 1, 0x1a);

  return buffer;
}
