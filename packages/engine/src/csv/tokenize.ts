export type CsvDelimiter = "," | ";" | "\t";

/** Minimal RFC-4180 tokenizer: quoted fields, embedded delimiters/quotes/newlines, CRLF. */
export function tokenizeCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      pushRow();
      i += 2;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Final field/row unless the text ended exactly on a row break.
  if (field !== "" || row.length > 0) pushRow();

  return rows;
}

/** Pick the delimiter that yields the most consistent multi-column split. */
export function detectDelimiter(text: string): CsvDelimiter {
  const sample = text.slice(0, 4000);
  let best: CsvDelimiter = ",";
  let bestScore = -1;
  for (const candidate of [",", ";", "\t"] as const) {
    const rows = tokenizeCsv(sample, candidate).filter((r) => r.length > 1);
    if (rows.length === 0) continue;
    const width = rows[0]!.length;
    const consistent = rows.filter((r) => r.length === width).length;
    const score = consistent * width;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}
