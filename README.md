# Table Enhancer

A [Notia](https://github.com/Chakyiu/notia) plugin that inserts and edits GitHub-flavored Markdown tables. The controls sit in a bar above the note title, and the same actions are in the command palette.

Notia renders pipe tables in the preview. This plugin edits the source: it finds the table under the cursor, rewrites that table, and leaves the rest of the note alone.

## Install

Copy this folder into the vault's plugins folder so these files sit together:

```
<vault>/.notia/plugins/table-enhancer/manifest.json
<vault>/.notia/plugins/table-enhancer/main.js
<vault>/.notia/plugins/table-enhancer/table.js
```

A symlink or junction to a clone of this repo works too. Then run **Reload community plugins** and enable **Table Enhancer** in **Settings → Plugins**. It stays off until you enable it.

There is nothing to build. A fresh clone is the plugin.

## Usage

Open a note. The bar above the title shows where the cursor last was in a table, and these buttons:

| Button | What it does | Shortcut |
| --- | --- | --- |
| Table | Insert a 2×2 table (header plus one empty row). On a blank line it replaces that line; otherwise it inserts the table on the next line. | Ctrl+Alt+T |
| + Row | Add an empty row below the current body row. From the header or separator, the row is inserted at the top of the body. | Ctrl+Alt+Enter |
| - Row | Delete the body row under the cursor. | Ctrl+Alt+Backspace |
| + Col | Add an empty column to the right of the cursor. | Ctrl+Alt+C |
| - Col | Delete the column under the cursor. | Ctrl+Alt+X |
| Align | Cycle that column: default, left, center, right. | Ctrl+Alt+A |
| Prev / Next | Move to the previous or next cell and select its text. Next, on the last cell, adds a row. | Ctrl+Alt+P / Ctrl+Alt+N |

The ribbon icon inserts a table. Every action is also a command named **Table Enhancer: …**.

Rows are padded so the pipes line up. One undo puts the note back to before that action.

The status bar shows the same place as the toolbar, for example `Row 1, column 2 · left`.

## Limitations

- Rows need a leading `|`. A table inside a code fence or a block quote is left alone.
- A `|` inside `` `code` `` still splits a cell. A backslash-escaped `\|` does not.
- The label updates when the note text changes, when you open a note, and after each table command. Arrow keys do not update it: Notia does not tell plugins that the cursor moved.
- Tab still indents. Cell movement is Ctrl+Alt+N / Ctrl+Alt+P, so Tab is not taken from the editor.
- The plugin does not edit the rendered preview, and it has no formulas or drag handles.
- Column padding uses character counts, so wide glyphs may not line up on screen.
- Mobile is out of scope. The bar is the desktop toolbar above the note.

## Check

```sh
node --test
```

The tests cover insert, rows, columns, alignment, cell movement, fences, and CRLF. They do not launch Notia.
