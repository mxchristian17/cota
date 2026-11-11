# Help commands

## HELP

Opens the help panel and lists every command with its aliases and description in the command line.

**Aliases** `?` · **Menu** Help

## DOCS

Opens this documentation in a new tab.

**Aliases** `DOCUMENTATION` · **Menu** Help

**Notes**

- <kbd>F1</kbd> does the same; during a command, <kbd>F1</kbd> opens the section of that command.

## TRACEBACK

Exports what happened in this session, so a bug can be reproduced exactly (for example by an AI agent). Cota keeps a
log of every action in the tab: commands and each answer, clicks with their point and the object they hit,
selections, grips, view changes, layers, tabs and files. The log is lost when the tab is closed.

**Aliases** none · **Menu** Help

**Steps**

1. `Export the session log by [Lines/Minutes] <Minutes>:`
2. `Number of minutes <10>:` (or `Number of lines <200>:`).

Cota downloads a `.txt` file (and copies it to the clipboard when it fits) and prints how many events it has. The
file starts with the Cota version, browser and screen, then one event per line, then the drawing as it was when those
events started, so the replay starts from the same state.

**Notes**

- The file contains your drawing: share it only with whom you trust.
- To replay it, run the development server (`npm run dev` in `services/web`) and
  `node tools/replay-traceback.mjs traceback.txt --headed`.
- Passwords and API keys are never logged.

## ABOUT

Shows the version of Cota, its author and its license.

**Aliases** none · **Menu** Help
