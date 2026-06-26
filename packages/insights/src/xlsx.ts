/**
 * A tiny, dependency-free XLSX (SpreadsheetML / OOXML) writer for report exports. An .xlsx file is a
 * ZIP of XML parts; this builds the minimal valid set with a single worksheet, stores entries
 * uncompressed (ZIP method 0 / STORE) so the worksheet XML appears verbatim in the output, and uses
 * a fixed DOS timestamp so the bytes are deterministic (same result in → identical bytes out, no
 * `Date.now()`). Pure: no I/O. Numbers are written as numeric cells, everything else as inline
 * strings, so Excel/Sheets shows measures as real numbers you can sum.
 */

import { displayDimension } from "./format";
import type { ReportResult } from "./result";

/** Fixed DOS date/time (1980-01-01 00:00) so archives are byte-for-byte reproducible. */
const DOS_DATE = 0x0021;
const DOS_TIME = 0x0000;

const encoder = new TextEncoder();

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// ─────────────────────────── CRC-32 (used by the ZIP container) ───────────────────────────

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    // Index is masked to 0..255, so the lookup is always defined; `?? 0` only satisfies the checker.
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ─────────────────────────── Minimal STORE-only ZIP writer ───────────────────────────

/** A growable little-endian byte sink; the ZIP format is entirely little-endian. */
class ByteSink {
  private chunks: number[] = [];

  get length(): number {
    return this.chunks.length;
  }

  u16(value: number): void {
    this.chunks.push(value & 0xff, (value >>> 8) & 0xff);
  }

  u32(value: number): void {
    this.chunks.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    );
  }

  bytes(data: Uint8Array): void {
    for (const b of data) this.chunks.push(b);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

/** Assemble ZIP entries into a single archive using STORE (no compression). */
function zip(entries: ZipEntry[]): Uint8Array {
  const sink = new ByteSink();
  const central: Array<{ name: Uint8Array; crc: number; size: number; offset: number }> = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const offset = sink.length;

    // Local file header.
    sink.u32(0x04034b50);
    sink.u16(20); // version needed
    sink.u16(0); // general purpose flags
    sink.u16(0); // compression method: 0 = stored
    sink.u16(DOS_TIME);
    sink.u16(DOS_DATE);
    sink.u32(crc);
    sink.u32(entry.data.length); // compressed size == uncompressed size for STORE
    sink.u32(entry.data.length);
    sink.u16(name.length);
    sink.u16(0); // extra field length
    sink.bytes(name);
    sink.bytes(entry.data);

    central.push({ name, crc, size: entry.data.length, offset });
  }

  const centralStart = sink.length;
  for (const e of central) {
    sink.u32(0x02014b50);
    sink.u16(20); // version made by
    sink.u16(20); // version needed
    sink.u16(0);
    sink.u16(0); // stored
    sink.u16(DOS_TIME);
    sink.u16(DOS_DATE);
    sink.u32(e.crc);
    sink.u32(e.size);
    sink.u32(e.size);
    sink.u16(e.name.length);
    sink.u16(0); // extra
    sink.u16(0); // comment
    sink.u16(0); // disk number start
    sink.u16(0); // internal attributes
    sink.u32(0); // external attributes
    sink.u32(e.offset);
    sink.bytes(e.name);
  }
  const centralSize = sink.length - centralStart;

  // End of central directory record.
  sink.u32(0x06054b50);
  sink.u16(0); // disk number
  sink.u16(0); // disk with central directory
  sink.u16(central.length);
  sink.u16(central.length);
  sink.u32(centralSize);
  sink.u32(centralStart);
  sink.u16(0); // comment length

  return sink.toUint8Array();
}

// ─────────────────────────── SpreadsheetML ───────────────────────────

/** XML-escape text destined for an element body or attribute value. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Spreadsheet column reference for a zero-based index: 0 → A, 26 → AA. */
function columnRef(index: number): string {
  let ref = "";
  let n = index;
  do {
    ref = String.fromCharCode(65 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return ref;
}

type Cell = { kind: "number"; value: number } | { kind: "string"; value: string };

function cellXml(cell: Cell, ref: string): string {
  if (cell.kind === "number") {
    return `<c r="${ref}"><v>${cell.value}</v></c>`;
  }
  // Inline string; preserve whitespace so values like "(none)" or padded codes round-trip.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
}

function rowXml(cells: Cell[], rowNumber: number): string {
  const inner = cells.map((cell, col) => cellXml(cell, `${columnRef(col)}${rowNumber}`)).join("");
  return `<row r="${rowNumber}">${inner}</row>`;
}

/** Project a report into the grid of cells: label header row + one row per result row. */
function toCells(result: ReportResult): Cell[][] {
  const header: Cell[] = result.columns.map((c) => ({ kind: "string", value: c.label }));
  const body = result.rows.map<Cell[]>((row) =>
    result.columns.map<Cell>((col) => {
      const raw = row[col.key] ?? null;
      if (col.kind === "measure") {
        return { kind: "number", value: typeof raw === "number" ? raw : 0 };
      }
      return { kind: "string", value: displayDimension(raw) };
    }),
  );
  return [header, ...body];
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function worksheetXml(result: ReportResult): string {
  const rows = toCells(result)
    .map((cells, i) => rowXml(cells, i + 1))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

/** A worksheet name must be <=31 chars and exclude `[]:*?/\`; fall back to a safe default. */
function sanitizeSheetName(name: string | undefined): string {
  const cleaned = (name ?? "Report").replace(/[[\]:*?/\\]/g, " ").trim();
  return cleaned.length === 0 ? "Report" : cleaned.slice(0, 31);
}

/**
 * Serialise an executed report to a deterministic .xlsx workbook (one sheet). The API streams the
 * returned bytes as the `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` download.
 */
export function reportToXlsx(result: ReportResult, opts?: { sheetName?: string }): Uint8Array {
  const sheetName = sanitizeSheetName(opts?.sheetName);
  return zip([
    { name: "[Content_Types].xml", data: encoder.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: encoder.encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: encoder.encode(workbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(WORKBOOK_RELS) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(worksheetXml(result)) },
  ]);
}
