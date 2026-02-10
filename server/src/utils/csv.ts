export function stringifyCsv(rows: Record<string, unknown>[], headers: string[]) {
  const headerLine = headers.join(",");
  const lines = rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","));
  return [headerLine, ...lines].join("\n");
}

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const raw =
    value instanceof Date ? value.toISOString()
    : typeof value === "object" ? JSON.stringify(value)
    : String(value);

  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }

  return raw;
}
