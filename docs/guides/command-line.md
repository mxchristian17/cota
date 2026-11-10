# The command line

How commands, options, defaults and scripts work.

Everything in Cota is a command. Type its name (or an alias: `L` for `LINE`, `C` for `CIRCLE`, `M` for
`MOVE`…) and press <kbd>Enter</kbd> or <kbd>Space</kbd>. While you type, the command line suggests matching
commands; <kbd>Tab</kbd> completes the suggestion. Menus and toolbars run the same commands.

A command asks questions in the command line, for example:

```text
Specify center point for circle or [3P/2P/Ttr (tan tan radius)]:
```

- **Options** are in square brackets. Type the capitalized letters (`3P`, `T`) or click the option.
- **The default** is in angle brackets, `<10.0000>`: press <kbd>Enter</kbd> to accept it.
- <kbd>Enter</kbd> (or <kbd>Space</kbd>, or a right-click) finishes the current step.
- <kbd>Esc</kbd> cancels the command.
- <kbd>Enter</kbd> on an empty command line repeats the last command.
- <kbd>↑</kbd> and <kbd>↓</kbd> walk through the command history.

You never need to click the command line: typing anywhere in the window sends the keys there (unless you are
typing in another field or a dialog is open).

## Scripts: several commands at once

A script is a list of inputs that answer the prompts in order, as if you typed them: separate them with spaces or
new lines, write `""` for an empty Enter and put text with spaces in double quotes. When a command ends, the next
input starts another one.

```
CIRCLE 50,50 20
RECTANGLE 0,0 @100,60
TEXT 10,70 5 0 "Base plate" ""
```

Paste a script in the command line (<kbd>Ctrl</kbd>+<kbd>V</kbd>, when no objects are copied) or run **SCRIPT** to
type it, load a `.scr` file or **copy a link** that shares it. The whole script is one undo step. If an input is
rejected, the script stops there and tells you which one. A shared link only shows the script: it runs when you
press Run.

**See also:** [SCRIPT](../reference/tools.md#script) · [Command reference](../commands.md)
