/**
 * A small RFC 4180 reader, kept in-house rather than pulled from npm.
 *
 * The files this has to survive are exports from Excel, Google Sheets and Tally,
 * which between them use CRLF and LF, quote any field containing a comma, escape
 * a literal quote by doubling it, and (Excel, always) open with a UTF-8 BOM.
 * That is the whole grammar, and it is smaller than the dependency would be.
 */

export interface CsvRow {
  /**
   * 1-based line in the file as the user's spreadsheet numbers it, so an error
   * message can point at a row they can actually go and find. Counted from
   * record starts, not newlines — a quoted field may legally contain one.
   */
  line: number;
  cells: string[];
}

/** True when a row carries no data — a trailing blank line, or a spacer row. */
export function isBlankRow(row: CsvRow): boolean {
  return row.cells.every((cell) => cell.trim() === "");
}

export function parseCsv(input: string): CsvRow[] {
  // Excel writes a BOM; left in place it becomes part of the first header cell
  // and "Item Name" silently stops matching.
  const text = input.replace(/^\uFEFF/, "");

  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let value = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let started = false;

  const endCell = () => {
    cells.push(value);
    value = "";
  };

  const endRow = () => {
    endCell();
    rows.push({ line: rowLine, cells });
    cells = [];
    started = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (!started) {
      rowLine = line;
      started = true;
    }

    if (quoted) {
      if (char !== '"') {
        if (char === "\n") line += 1;
        value += char;
        continue;
      }
      // A doubled quote is an escaped quote; a lone one closes the field.
      if (text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && value === "") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      endCell();
      continue;
    }
    if (char === "\r") {
      // Swallow the LF of a CRLF pair so it doesn't open an empty record.
      if (text[i + 1] === "\n") i += 1;
      endRow();
      line += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      line += 1;
      continue;
    }
    value += char;
  }

  // A file that doesn't end in a newline still has one last record in hand.
  if (started || value !== "" || cells.length > 0) endRow();

  return rows;
}

/** Quote a cell only when it would otherwise change meaning. */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CRLF and a trailing newline, because that is what Excel expects to read. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
