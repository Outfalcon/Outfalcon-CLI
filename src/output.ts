// Output rendering. JSON by default (so `falcon ... | jq` just works), plus human table, csv, and
// a compact yaml. `--fields a,b.c` projects a jq-lite subset before rendering so agents and humans
// can trim big responses without piping through another tool.

export type OutputFormat = "json" | "table" | "csv" | "yaml";

export interface RenderOptions {
  format: OutputFormat;
  fields?: string;
  pretty?: boolean;
  quiet?: boolean;
}

/** Read a dotted path (`a.b.c`) out of an object; returns undefined if any hop is missing. */
function getPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** Project each row (or a single object) down to the requested dotted fields. */
export function projectFields(data: any, fields?: string): any {
  if (!fields) return data;
  const paths = fields.split(",").map((f) => f.trim()).filter(Boolean);
  const pick = (row: any) => {
    if (row == null || typeof row !== "object") return row;
    const out: Record<string, any> = {};
    for (const p of paths) out[p] = getPath(row, p);
    return out;
  };
  return Array.isArray(data) ? data.map(pick) : pick(data);
}

export function render(data: any, opts: RenderOptions): string {
  const projected = projectFields(data, opts.fields);
  switch (opts.format) {
    case "table":
      return renderTable(projected);
    case "csv":
      return renderCsv(projected);
    case "yaml":
      return renderYaml(projected).trimEnd();
    case "json":
    default:
      return JSON.stringify(projected, null, opts.pretty ? 2 : 0);
  }
}

function toCell(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function columnsOf(rows: any[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    if (r && typeof r === "object" && !Array.isArray(r)) {
      for (const k of Object.keys(r)) seen.add(k);
    }
  }
  return [...seen];
}

function renderTable(data: any): string {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return "(no rows)";
  // Array of scalars → single column.
  const scalar = rows.every((r) => r === null || typeof r !== "object");
  if (scalar) return rows.map(toCell).join("\n");

  const cols = columnsOf(rows);
  if (cols.length === 0) return "(no columns)";
  const widths = cols.map((c) => c.length);
  const body = rows.map((r) =>
    cols.map((c, i) => {
      const cell = toCell(r?.[c]);
      if (cell.length > widths[i]) widths[i] = cell.length;
      return cell;
    })
  );
  const line = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  const header = line(cols);
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  return [header, sep, ...body.map(line)].join("\n");
}

function renderCsv(data: any): string {
  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) return "";
  const scalar = rows.every((r) => r === null || typeof r !== "object");
  if (scalar) return rows.map((r) => csvCell(toCell(r))).join("\n");
  const cols = columnsOf(rows);
  const head = cols.map(csvCell).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(toCell(r?.[c]))).join(","));
  return [head, ...body].join("\n");
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function renderYaml(data: any, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (data === null || data === undefined) return `${pad}null\n`;
  if (typeof data !== "object") return `${pad}${yamlScalar(data)}\n`;

  if (Array.isArray(data)) {
    if (data.length === 0) return `${pad}[]\n`;
    return data
      .map((item) => {
        if (item !== null && typeof item === "object") {
          const inner = renderYaml(item, indent + 1);
          return `${pad}-\n${inner}`;
        }
        return `${pad}- ${yamlScalar(item)}\n`;
      })
      .join("");
  }

  const keys = Object.keys(data);
  if (keys.length === 0) return `${pad}{}\n`;
  return keys
    .map((k) => {
      const v = data[k];
      if (v !== null && typeof v === "object" && Object.keys(v).length > 0) {
        return `${pad}${k}:\n${renderYaml(v, indent + 1)}`;
      }
      return `${pad}${k}: ${yamlScalar(v)}\n`;
    })
    .join("");
}

function yamlScalar(v: any): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  if (s === "" || /[:#\-?\[\]{}&*!|>'"%@`\n]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}
