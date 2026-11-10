# File commands

Commands of the **File** menu: new drawings, opening and saving, importing and exporting, plotting and drawing
settings.

Cota saves drawings as `.cota` files. Where they go depends on how you work:

- **In the browser** (the default): `SAVE` downloads a `.cota` file; `OPEN` picks one from your device.
- **In a folder of your disk**: after `OPENFOLDER`, `OPEN` lists the drawings of that folder and `SAVE` writes there
  directly, with a `.bak` copy of the previous version and automatic `.sv$` recovery saves. This needs a browser
  that can open folders (Chrome, Edge, Brave, Opera).
- **In your account**: with the optional server, `LOGIN` and the drawings are stored on the server.

See [files](../user-guide.md#files) for the formats Cota reads and writes.

## NEW

Starts a new empty drawing. If the current one has unsaved changes, Cota asks first.

**Aliases** none · **Menu** File

**Steps**

1. With unsaved changes: `Save changes to drawing1? [Yes/No] <Yes>:`

**Notes**

- New drawings start from the default template (see [TEMPLATE](#template)).

## OPEN

Opens a drawing: `.cota`, DWG, DXF, STEP, IGES, STL or OBJ. With a working folder or an account, a dialog lists
your drawings and has an **Open from device** button; otherwise the file picker of the system opens directly.

**Aliases** none · **Menu** File

**Notes**

- You can choose a DXF or DWG together with the pictures it uses: they are loaded with it.
- `-OPEN` works from the command line: `Open drawing from [Device/List] <List>:`.
- `.bak` and `.sv$` copies open as an unsaved drawing; `SAVE` writes it as a normal `.cota` file.
- DWG and DXF files are read in the browser; nothing is uploaded. See [DWG and DXF coverage](../dwg-coverage.md).

## SAVE

Saves the drawing: to the working folder, to your account, or as a downloaded `.cota` file.

**Aliases** `QSAVE`, `SAVEAS` · **Menu** File

**Steps**

1. The first time (or with SAVEAS): `Save drawing as <drawing1>:` the name.

**Notes**

- In a working folder, `ISAVEBAK` (on by default) keeps the previous version as `name.bak`, and every `SAVETIME`
  minutes (10 by default) Cota writes a recovery copy `name.sv$` if the drawing changed.

## OPENFOLDER

Chooses a folder of your disk to open and save drawings as files, like a desktop program.

**Aliases** `FOLDER`, `WORKSPACE` · **Menu** File

**Notes**

- The browser asks for permission to use the folder. Cota remembers it and asks again only to confirm access in a
  new session.

## CLOUD

Goes back to storing drawings in your account, detaching the working folder.

**Aliases** `CLOUDSTORAGE` · **Menu** File

## LOGIN

Signs in to the optional server to save and load drawings in your account.

**Aliases** none · **Menu** File › Drawing

## IMPORT

Adds the geometry of an OBJ, DXF or DWG file to the current drawing (OPEN would open it as a new drawing).

**Aliases** `IMP` · **Menu** File › Import / export

**Notes**

- Choosing a `.cota` file opens it as a drawing instead.

## EXPORT

Exports the drawing to another format.

**Aliases** `EXP` · **Menu** File › Import / export

**Steps**

1. `Format [OBJ/DXF/DWG] <OBJ>:` OBJ is a 3D mesh of the solids; DXF and DWG carry the 2D drawing.

## PAGESETUP

Page setup of the current layout: paper size, orientation, margins and plot style. Run it on a layout tab.

**Aliases** none · **Menu** File › Print

## PLOT

Plots to a vector PDF from a dialog with a preview: paper, orientation, area (Extents, Display or Window), scale and
plot style. A layout plots at 1:1 with its page setup.

**Aliases** `PRINT` · **Menu** File › Print

**Notes**

- Lineweights are plotted; frozen layers and layers set to not plot are left out.
- `-PLOT` plots right away with the last PLOT settings, without the dialog.

## PUBLISH

Plots several layouts to one multi-page PDF.

**Aliases** none · **Menu** File › Print

**Steps**

1. `Enter layouts to publish [All/Current] or names separated by commas <All>:`

**Example**

```text
PUBLISH All
```

## DWGPROPS

Edits the properties of the drawing: title, subject, author, keywords and custom properties. Fields in title
blocks show them (see [FIELD](insert.md#field)).

**Aliases** none · **Menu** File › Drawing

## UNITS

Sets the units of the drawing.

**Aliases** `UN` · **Menu** File › Drawing

**Steps**

1. `Drawing units [Millimeters/Centimeters/Meters/Inches/Feet] <Millimeters>:`

**Notes**

- Objects keep their size in units; dimension scales and linetypes follow the new unit.

## TEMPLATE

Manages drawing templates: the layers, styles, units and settings a new drawing starts with.

**Aliases** none · **Menu** File › Drawing

**Steps**

1. `Enter an option [Save/Open/Default/Clear] <Save>:`

**Options**

| Option | What it does |
| --- | --- |
| `Save` | Saves the settings of the current drawing as a template file. |
| `Open` | Starts a new drawing from a template file. |
| `Default` | Makes the current settings the default for every new drawing. |
| `Clear` | Goes back to the built-in defaults. |

## PURGE

Removes unused named objects: block definitions with no references, dimension styles, layers and linetypes nothing
uses.

**Aliases** `PU`, `-PURGE`, `-PU` · **Menu** File › Drawing

**Steps**

1. `Enter type of unused objects to purge [Blocks/Dimstyles/LAyers/LTypes/All] <All>:`
2. `Enter name(s) to purge <*>:` `*` means all of them; wildcards are allowed.
3. `Verify each name to be purged? [Yes/No] <No>:` Yes asks `Purge layer "NAME"? [Yes/No] <No>:` for each one.

**Example**

```text
PURGE A * N
```

**Notes**

- Layer 0, `DEFPOINTS`, the current layer and the current dimension style are never purged.
