import { Notice, Plugin, ui } from "notia";
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
} from "./table.js";

const COMMANDS = [
  ["insert-table", "Insert table", "ctrl-alt-t", "table", insertTable],
  ["add-row", "Add row below", "ctrl-alt-enter", "plus", addRow],
  ["delete-row", "Delete row", "ctrl-alt-backspace", "minus", deleteRow],
  ["add-column", "Add column to the right", "ctrl-alt-c", "plus", addColumn],
  ["delete-column", "Delete column", "ctrl-alt-x", "minus", deleteColumn],
  ["cycle-align", "Cycle column alignment", "ctrl-alt-a", "align-left", cycleAlign],
  ["next-cell", "Next cell", "ctrl-alt-n", "arrow-right", nextCell],
  ["previous-cell", "Previous cell", "ctrl-alt-p", "arrow-left", previousCell],
];

export default class TableEnhancer extends Plugin {
  onload() {
    this.label = "Not in a table";
    this.status = this.addStatusBarItem().setText(this.label);
    this.panel = this.addPanel({
      id: "bar",
      title: "Table",
      icon: "table",
      side: "editor",
      render: () => this.renderBar(),
    });

    for (const [id, name, hotkey, icon, op] of COMMANDS) {
      this.addCommand({
        id,
        name,
        icon,
        hotkey,
        editorCallback: (editor) => this.run(editor, op),
      });
    }

    this.addRibbonIcon("table", "Insert table", () => {
      const editor = this.app.workspace.getActiveEditor();
      if (!editor) {
        new Notice("Open a note first.");
        return;
      }
      this.run(editor, insertTable);
    });

    this.registerEvent(this.app.workspace.on("editor-change", () => this.sync()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.sync()));
    this.sync();
  }

  renderBar() {
    const button = (label, op, tooltip, icon) =>
      ui.button(label, () => this.onBar(op), { icon, tooltip, variant: "ghost" });
    return ui.row(
      [
        ui.text(this.label, { small: true, muted: true }),
        button("Table", insertTable, "Insert table (Ctrl+Alt+T)", "table"),
        button("+ Row", addRow, "Add row below (Ctrl+Alt+Enter)", "plus"),
        button("- Row", deleteRow, "Delete row (Ctrl+Alt+Backspace)", "minus"),
        button("+ Col", addColumn, "Add column to the right (Ctrl+Alt+C)", "plus"),
        button("- Col", deleteColumn, "Delete column (Ctrl+Alt+X)", "minus"),
        button("Align", cycleAlign, "Cycle alignment (Ctrl+Alt+A)", "align-left"),
        button("Prev", previousCell, "Previous cell (Ctrl+Alt+P)", "arrow-left"),
        button("Next", nextCell, "Next cell (Ctrl+Alt+N)", "arrow-right"),
      ],
      { wrap: false },
    );
  }

  onBar(op) {
    const editor = this.app.workspace.getActiveEditor();
    if (!editor) {
      new Notice("Open a note first.");
      return;
    }
    this.run(editor, op);
  }

  run(editor, op) {
    const result = op(editor.getValue(), editor.getCursor("head"));
    if (!result.ok) {
      new Notice(result.message);
      return;
    }
    const anchor = { line: result.cursor.line, ch: result.cursor.ch };
    const head = {
      line: result.cursor.line,
      ch: result.cursor.chEnd ?? result.cursor.ch,
    };
    if (result.text !== editor.getValue()) {
      const last = editor.lastLine();
      editor.transaction({
        changes: [
          {
            from: { line: 0, ch: 0 },
            to: { line: last, ch: editor.getLine(last).length },
            text: result.text,
          },
        ],
        selection: { from: anchor, to: head },
      });
    } else {
      editor.setSelection(anchor, head);
    }
    editor.focus();
    this.label = describe(result.text, anchor);
    this.status.setText(this.label);
    this.panel.refresh();
  }

  sync() {
    const editor = this.app.workspace.getActiveEditor();
    this.label = editor
      ? describe(editor.getValue(), editor.getCursor("head"))
      : "No note open";
    this.status.setText(this.label);
    this.panel.refresh();
  }
}
