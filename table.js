// Markdown pipe-table edits. Pure functions: the plugin host applies the text.

// shortcut: a pipe inside `code` still splits the cell, upgrade if a table needs that
function unescapedPipes(line) {
  const at = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && line[i + 1] === "|") {
      i += 1;
      continue;
    }
    if (line[i] === "|") at.push(i);
  }
  return at;
}

function splitCells(line) {
  let source = line.trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|")) source = source.slice(0, -1);
  const cells = [];
  let current = "";
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\" && source[i + 1] === "|") {
      current += "\\|";
      i += 1;
      continue;
    }
    if (source[i] === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += source[i];
  }
  cells.push(current.trim());
  return cells;
}

function isPipeRow(line) {
  return /^\s*\|/.test(line) && unescapedPipes(line).length > 0;
}

function alignmentOf(cell) {
  if (!/^:?-+:?$/.test(cell)) return null;
  const dashes = cell.replace(/:/g, "");
  if (dashes.length < 3) return null;
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "none";
}

function isDelimiter(line) {
  if (!isPipeRow(line)) return false;
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((cell) => alignmentOf(cell) !== null);
}

function fenceMask(lines) {
  const mask = Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const mark = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (fence) {
      mask[i] = true;
      if (
        mark &&
        mark[1][0] === fence.char &&
        mark[1].length >= fence.len &&
        mark[2].trim() === ""
      ) {
        fence = null;
      }
    } else if (mark && (mark[1][0] !== "`" || !mark[2].includes("`"))) {
      fence = { char: mark[1][0], len: mark[1].length };
      mask[i] = true;
    }
  }
  return mask;
}

function findTables(lines) {
  const fenced = fenceMask(lines);
  const tables = [];
  for (let i = 1; i < lines.length; i++) {
    if (fenced[i] || !isDelimiter(lines[i])) continue;
    if (tables.some((table) => i > table.header && i <= table.end)) continue;
    const header = i - 1;
    if (fenced[header] || !isPipeRow(lines[header])) continue;
    let end = i;
    while (end + 1 < lines.length) {
      const next = end + 1;
      if (fenced[next] || !isPipeRow(lines[next])) break;
      end = next;
    }
    tables.push({ header, delimiter: i, end });
  }
  return tables;
}

function open(text) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length === 0 ? [""] : text.split(/\r?\n/);
  return { newline, lines };
}

function parse(lines, table) {
  const delim = splitCells(lines[table.delimiter]);
  let cols = delim.length;
  const indexes = [];
  for (let i = table.header; i <= table.end; i++) {
    if (i === table.delimiter) continue;
    indexes.push(i);
    cols = Math.max(cols, splitCells(lines[i]).length);
  }
  const aligns = delim.map((cell) => alignmentOf(cell) ?? "none");
  while (aligns.length < cols) aligns.push("none");
  const rows = indexes.map((i) => {
    const cells = splitCells(lines[i]).slice(0, cols);
    while (cells.length < cols) cells.push("");
    return cells;
  });
  return { aligns, header: rows[0], body: rows.slice(1), cols };
}

function minWidth(align) {
  if (align === "center") return 5;
  if (align === "left" || align === "right") return 4;
  return 3;
}

function formatDelimCell(align, width) {
  const w = Math.max(minWidth(align), width);
  if (align === "center") return ":" + "-".repeat(w - 2) + ":";
  if (align === "right") return "-".repeat(w - 1) + ":";
  if (align === "left") return ":" + "-".repeat(w - 1);
  return "-".repeat(w);
}

function formatRow(cells, widths) {
  const padded = cells.map((cell, i) => cell + " ".repeat(Math.max(0, widths[i] - cell.length)));
  return `| ${padded.join(" | ")} |`;
}

function format(aligns, header, body) {
  const rows = [header, ...body];
  const widths = aligns.map((align, col) => {
    let width = minWidth(align);
    for (const row of rows) width = Math.max(width, row[col].length);
    return width;
  });
  const delim = `| ${aligns.map((align, col) => formatDelimCell(align, widths[col])).join(" | ")} |`;
  return [formatRow(header, widths), delim, ...body.map((row) => formatRow(row, widths))];
}

function columnAt(line, ch) {
  const pipes = unescapedPipes(line);
  if (pipes.length < 2) return 0;
  const at = Math.max(0, ch);
  for (let i = 0; i < pipes.length - 1; i++) {
    if (at <= pipes[i + 1]) return i;
  }
  return pipes.length - 2;
}

function cellBounds(line, col) {
  const pipes = unescapedPipes(line);
  const open = pipes[col];
  const close = pipes[col + 1];
  if (open === undefined || close === undefined) return { start: 0, end: 0 };
  const interior = line.slice(open + 1, close);
  const trimmed = interior.trim();
  const lead = interior.length - interior.trimStart().length;
  if (!trimmed) {
    const gap = line[open + 1] === " " ? 1 : 0;
    const start = open + 1 + gap;
    return { start, end: start };
  }
  const start = open + 1 + lead;
  return { start, end: start + trimmed.length };
}

function locate(doc, cursor) {
  const line = Math.max(0, Math.min(cursor.line, doc.lines.length - 1));
  const tables = findTables(doc.lines);
  const table = tables.find((item) => line >= item.header && line <= item.end);
  if (!table) return null;
  const parsed = parse(doc.lines, table);
  const column = Math.min(columnAt(doc.lines[line], cursor.ch), parsed.cols - 1);
  let rowKind = "body";
  let bodyIndex = 0;
  if (line === table.header) rowKind = "header";
  else if (line === table.delimiter) rowKind = "delimiter";
  else bodyIndex = line - table.delimiter - 1;
  return { table, parsed, line, column, rowKind, bodyIndex };
}

function finish(doc, lines, cursor) {
  return { ok: true, text: lines.join(doc.newline), cursor };
}

function fail(message) {
  return { ok: false, message };
}

function write(doc, table, aligns, header, body, focus) {
  const formatted = format(aligns, header, body);
  const lines = doc.lines.slice();
  lines.splice(table.header, table.end - table.header + 1, ...formatted);
  const line = table.header + focus.rowOffset;
  const bounds = cellBounds(formatted[focus.rowOffset], focus.col);
  const cursor = { line, ch: bounds.start };
  if (focus.select && bounds.end > bounds.start) cursor.chEnd = bounds.end;
  return finish(doc, lines, cursor);
}

function rowOffset(loc) {
  if (loc.rowKind === "header") return 0;
  if (loc.rowKind === "delimiter") return 1;
  return 2 + loc.bodyIndex;
}

export function describe(text, cursor) {
  const loc = locate(open(text), cursor);
  if (!loc) return "Not in a table";
  const align = loc.parsed.aligns[loc.column];
  const where =
    loc.rowKind === "header"
      ? "Header"
      : loc.rowKind === "delimiter"
        ? "Separator"
        : `Row ${loc.bodyIndex + 1}`;
  const named = align === "none" ? "default" : align;
  return `${where}, column ${loc.column + 1} · ${named}`;
}

export function insertTable(text, cursor) {
  const doc = open(text);
  if (locate(doc, cursor)) return fail("The cursor is already in a table.");
  const formatted = format(["none", "none"], ["Column 1", "Column 2"], [["", ""]]);
  const lines = doc.lines.slice();
  const line = Math.max(0, Math.min(cursor.line, lines.length - 1));
  let at = line;
  if (lines[line].trim() === "") lines.splice(line, 1, ...formatted);
  else {
    at = line + 1;
    lines.splice(at, 0, ...formatted);
  }
  const bounds = cellBounds(formatted[2], 0);
  return finish(doc, lines, { line: at + 2, ch: bounds.start });
}

export function addRow(text, cursor) {
  const doc = open(text);
  const loc = locate(doc, cursor);
  if (!loc) return fail("The cursor is not in a table.");
  const at = loc.rowKind === "body" ? loc.bodyIndex + 1 : 0;
  const body = loc.parsed.body.slice();
  body.splice(at, 0, Array(loc.parsed.cols).fill(""));
  return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, body, {
    rowOffset: 2 + at,
    col: loc.column,
    select: false,
  });
}

export function deleteRow(text, cursor) {
  const doc = open(text);
  const loc = locate(doc, cursor);
  if (!loc) return fail("The cursor is not in a table.");
  if (loc.rowKind !== "body") {
    return fail("Put the cursor on a body row. The header and separator stay.");
  }
  const body = loc.parsed.body.slice();
  body.splice(loc.bodyIndex, 1);
  const rowOffset = body.length === 0 ? 0 : 2 + Math.min(loc.bodyIndex, body.length - 1);
  return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, body, {
    rowOffset,
    col: body.length === 0 ? 0 : loc.column,
    select: false,
  });
}

export function addColumn(text, cursor) {
  const doc = open(text);
  const loc = locate(doc, cursor);
  if (!loc) return fail("The cursor is not in a table.");
  const at = loc.column + 1;
  const aligns = loc.parsed.aligns.slice();
  aligns.splice(at, 0, "none");
  const header = loc.parsed.header.slice();
  header.splice(at, 0, "");
  const body = loc.parsed.body.map((row) => {
    const next = row.slice();
    next.splice(at, 0, "");
    return next;
  });
  return write(doc, loc.table, aligns, header, body, {
    rowOffset: loc.rowKind === "body" ? rowOffset(loc) : 0,
    col: at,
    select: false,
  });
}

export function deleteColumn(text, cursor) {
  const doc = open(text);
  const loc = locate(doc, cursor);
  if (!loc) return fail("The cursor is not in a table.");
  if (loc.parsed.cols < 2) return fail("A table needs at least one column.");
  const drop = (cells) => cells.filter((_, index) => index !== loc.column);
  return write(doc, loc.table, drop(loc.parsed.aligns), drop(loc.parsed.header), loc.parsed.body.map(drop), {
    rowOffset: loc.rowKind === "body" ? rowOffset(loc) : 0,
    col: Math.min(loc.column, loc.parsed.cols - 2),
    select: false,
  });
}

const ALIGNS = ["none", "left", "center", "right"];

export function cycleAlign(text, cursor) {
  const doc = open(text);
  const loc = locate(doc, cursor);
  if (!loc) return fail("The cursor is not in a table.");
  const aligns = loc.parsed.aligns.slice();
  const current = ALIGNS.indexOf(aligns[loc.column]);
  aligns[loc.column] = ALIGNS[(current + 1) % ALIGNS.length];
  return write(doc, loc.table, aligns, loc.parsed.header, loc.parsed.body, {
    rowOffset: rowOffset(loc),
    col: loc.column,
    select: false,
  });
}

export function nextCell(text, cursor) {
  const doc = open(text);
  const loc = locate(doc, cursor);
  if (!loc) return fail("The cursor is not in a table.");
  const last = loc.parsed.cols - 1;
  if (loc.rowKind !== "body") {
    if (loc.rowKind === "header" && loc.column < last) {
      return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
        rowOffset: 0,
        col: loc.column + 1,
        select: true,
      });
    }
    if (loc.parsed.body.length === 0) return addRow(text, cursor);
    const col = loc.rowKind === "delimiter" ? loc.column : 0;
    return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
      rowOffset: 2,
      col,
      select: true,
    });
  }
  if (loc.column < last) {
    return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
      rowOffset: rowOffset(loc),
      col: loc.column + 1,
      select: true,
    });
  }
  if (loc.bodyIndex < loc.parsed.body.length - 1) {
    return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
      rowOffset: rowOffset(loc) + 1,
      col: 0,
      select: true,
    });
  }
  return addRow(text, { line: loc.line, ch: cursor.ch });
}

export function previousCell(text, cursor) {
  const doc = open(text);
  const loc = locate(doc, cursor);
  if (!loc) return fail("The cursor is not in a table.");
  const last = loc.parsed.cols - 1;
  if (loc.rowKind === "delimiter") {
    return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
      rowOffset: 0,
      col: loc.column,
      select: true,
    });
  }
  if (loc.rowKind === "header") {
    if (loc.column === 0) {
      return finish(doc, doc.lines, cursorAt(doc, loc));
    }
    return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
      rowOffset: 0,
      col: loc.column - 1,
      select: true,
    });
  }
  if (loc.column > 0) {
    return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
      rowOffset: rowOffset(loc),
      col: loc.column - 1,
      select: true,
    });
  }
  if (loc.bodyIndex > 0) {
    return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
      rowOffset: rowOffset(loc) - 1,
      col: last,
      select: true,
    });
  }
  return write(doc, loc.table, loc.parsed.aligns, loc.parsed.header, loc.parsed.body, {
    rowOffset: 0,
    col: last,
    select: true,
  });
}

function cursorAt(doc, loc) {
  const bounds = cellBounds(doc.lines[loc.line], loc.column);
  const cursor = { line: loc.line, ch: bounds.start };
  if (bounds.end > bounds.start) cursor.chEnd = bounds.end;
  return cursor;
}
