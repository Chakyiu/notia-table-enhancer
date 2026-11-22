import assert from "node:assert/strict";
import test from "node:test";
import {
  addColumn,
  addRow,
  cycleAlign,
  deleteColumn,
  deleteRow,
  describe,
  insertTable,
  nextCell,
  previousCell,
} from "../table.js";

const note = ["Intro", "", "| Name | Qty |", "| --- | --- |", "| a | 1 |", "| b | 2 |", ""].join("\n");

function line(text, n) {
  return text.split(/\r?\n/)[n];
}

function at(text, row, needle) {
  const src = line(text, row);
  const ch = src.indexOf(needle);
  assert.notEqual(ch, -1, `missing ${needle} on line ${row}: ${src}`);
  return { line: row, ch };
}

test("inserts a table on an empty line and lands in the first body cell", () => {
  const result = insertTable("Hello\n\n", { line: 1, ch: 0 });
  assert.equal(result.ok, true);
  assert.equal(
    result.text,
    ["Hello", "| Column 1 | Column 2 |", "| -------- | -------- |", "|          |          |", ""].join("\n"),
  );
  assert.equal(result.cursor.line, 3);
  const body = line(result.text, 3);
  assert.equal(body[result.cursor.ch - 2], "|");
  assert.equal(body[result.cursor.ch], " ");
});

test("inserts after a non-empty line and refuses a second insert", () => {
  const result = insertTable("Hello", { line: 0, ch: 5 });
  assert.equal(result.text.startsWith("Hello\n| Column 1 |"), true);
  const again = insertTable(result.text, result.cursor);
  assert.equal(again.ok, false);
  assert.match(again.message, /already in a table/);
});

test("adds a row below the cursor and deletes a body row", () => {
  const added = addRow(note, at(note, 4, "a"));
  assert.equal(added.ok, true);
  assert.match(line(added.text, 4), /^\| a +\| 1 +\|$/);
  assert.match(line(added.text, 5), /^\| +\| +\|$/);
  assert.match(line(added.text, 6), /^\| b +\| 2 +\|$/);
  assert.equal(added.cursor.line, 5);

  const removed = deleteRow(added.text, added.cursor);
  assert.match(line(removed.text, 4), /^\| a +\| 1 +\|$/);
  assert.match(line(removed.text, 5), /^\| b +\| 2 +\|$/);
  assert.equal(removed.text.split("\n").filter((row) => row.startsWith("|")).length, 4);

  assert.equal(deleteRow(note, at(note, 2, "Name")).ok, false);
});

test("adds a column to the right and will not delete the last one", () => {
  const added = addColumn(note, at(note, 4, "1"));
  assert.match(line(added.text, 2), /\| Name +\| Qty +\| +\|/);
  assert.match(line(added.text, 4), /\| a +\| 1 +\| +\|/);
  assert.equal(line(added.text, added.cursor.line).slice(added.cursor.ch - 2, added.cursor.ch), "| ");

  let only = "| A |\n| --- |\n| z |";
  const gone = deleteColumn(only, at(only, 2, "z"));
  assert.equal(gone.ok, false);
  const kept = deleteColumn(added.text, added.cursor);
  assert.equal(kept.ok, true);
  assert.doesNotMatch(line(kept.text, 2), /\| +\|$/);
});

test("cycles alignment default, left, center, right", () => {
  const left = cycleAlign(note, at(note, 4, "1"));
  assert.match(line(left.text, 3), /\| ---- \| :--- \|/);
  assert.match(line(left.text, 4), /\| a +\| 1 +\|/);
  const center = cycleAlign(left.text, left.cursor);
  assert.match(line(center.text, 3), /:---:/);
  const right = cycleAlign(center.text, center.cursor);
  assert.match(line(right.text, 3), /\| ---: \|/);
  const reset = cycleAlign(right.text, right.cursor);
  assert.match(line(reset.text, 3), /\| ---- \| --- \|/);
  assert.equal(describe(left.text, left.cursor), "Row 1, column 2 · left");
});

test("moves between cells and adds a row after the last cell", () => {
  const next = nextCell(note, at(note, 4, "a"));
  assert.equal(next.cursor.line, 4);
  assert.equal(line(next.text, 4).slice(next.cursor.ch, next.cursor.chEnd), "1");

  const prev = previousCell(next.text, { line: next.cursor.line, ch: next.cursor.chEnd });
  assert.equal(line(prev.text, prev.cursor.line).slice(prev.cursor.ch, prev.cursor.chEnd), "a");

  const end = nextCell(note, at(note, 5, "2"));
  assert.equal(end.cursor.line, 6);
  assert.match(line(end.text, 6), /\| +\| +\|/);
});

test("ignores fences, quotes, and prose, and keeps CRLF", () => {
  const fenced = ["```", "| a | b |", "| --- | --- |", "| 1 | 2 |", "```"].join("\n");
  assert.equal(describe(fenced, { line: 1, ch: 2 }), "Not in a table");
  assert.equal(addRow(fenced, { line: 1, ch: 2 }).ok, false);

  const quote = "> | a | b |\n> | --- | --- |\n> | 1 | 2 |";
  assert.equal(describe(quote, { line: 2, ch: 4 }), "Not in a table");

  assert.equal(describe("use a | b here", { line: 0, ch: 6 }), "Not in a table");

  const crlf = "| A | B |\r\n| --- | --- |\r\n| 1 | 2 |";
  const added = addRow(crlf, { line: 2, ch: 2 });
  assert.equal(added.text.includes("\r\n"), true);
  assert.equal(added.text.includes("\n\n"), false);
});

test("keeps an escaped pipe in one cell", () => {
  const text = "| a \\| b | c |\n| --- | --- |\n| 1 | 2 |";
  const added = addColumn(text, { line: 0, ch: 2 });
  assert.match(line(added.text, 0), /\| a \\| b +\| +\| c +\|/);
  assert.match(line(added.text, 2), /\| 1 +\| +\| 2 +\|/);
});

test("describe names the body cell under the cursor", () => {
  assert.equal(describe(note, at(note, 4, "a")), "Row 1, column 1 · default");
  assert.equal(describe(note, { line: 0, ch: 0 }), "Not in a table");
});
