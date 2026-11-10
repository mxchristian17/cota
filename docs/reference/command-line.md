# Command-line versions

Commands whose name starts with a dash do the work of a dialog in the command line, without opening it. Use them
in scripts, with the agent, or when you prefer the keyboard. Their prompts are those of the dialog's options.

## -LAYER

Manages layers from the command line.

**Aliases** `-LA` · **Command line only**

**Steps**

1. `Enter an option [?/Make/Set/New/Rename/ON/OFF/Color/Ltype/LWeight/Plot/Freeze/Thaw/LOck/Unlock]:` the prompt
   repeats until <kbd>Enter</kbd>.

**Options**

| Option | What it does |
| --- | --- |
| `?` | `Enter layer name(s) to list <*>:` lists layers with their state, color, linetype and lineweight. |
| `Make` | Creates a layer and makes it current. |
| `Set` | Makes an existing layer current. |
| `New` | `Enter name list for new layer(s):` creates layers (names separated by commas). |
| `Rename` | `Enter old layer name:` and `Enter new layer name:`. |
| `ON` / `OFF`, `Freeze` / `Thaw`, `LOck` / `Unlock` | Change the state of the layers named. |
| `Color` | `New color [index 1-255, name, #rrggbb or r,g,b]:` then the layers. |
| `Ltype` | `Enter a loaded linetype name or [?] <Continuous>:` then the layers. |
| `LWeight` | `Enter lineweight (0.0mm - 2.11mm):` then the layers. |
| `Plot` | `Enter a plotting preference [Plot/No plot] <Plot>:` then the layers. |

**Example**

```text
-LAYER N Walls,Doors C red Walls M Axes ""
```

## -LINETYPE

Linetypes from the command line.

**Aliases** `-LT` · **Command line only**

**Steps**

1. `Enter an option [?/Create/Load/Set]:`

**Options**

| Option | What it does |
| --- | --- |
| `?` | Lists the linetypes. |
| `Load` | `Enter linetype(s) to load:` from the built-in library (for example `DASHED,HIDDEN,CENTER`). |
| `Set` | `Specify linetype name or [?] <ByLayer>:` the linetype of new objects. |
| `Create` | `Enter name of linetype to create:`, `Descriptive text:` and the pattern after `A,`: dash lengths, positive for lines, negative for gaps, 0 for dots. |

**Example**: a custom dash-dot linetype.

```text
-LINETYPE C DASHDOT2 "Dash dot __ . __" 6,-2,0,-2 ""
```

## -DIMSTYLE

Dimension styles from the command line.

**Aliases** none · **Command line only**

**Steps**

1. `Enter a dimension style option [ANnotative/Save/Restore/STatus/Variables/Apply/?] <Restore>:`

**Options**

| Option | What it does |
| --- | --- |
| `Save` | `Enter name for new dimension style or [?]:` saves the current settings as a style. |
| `Restore` | Makes a style current. |
| `STatus` | Lists the values of every dimension variable. |
| `Variables` | Lists the variables of a style or of a selected dimension. |
| `Apply` | `Select objects:` applies the current settings to existing dimensions. |
| `ANnotative` | Makes the style annotative: its dimensions scale with the annotation scale. |
| `?` | Lists the styles. |

## -HATCH

Creates a hatch from the command line, with all its settings as options.

**Aliases** `-H`, `-BHATCH` · **Command line only**

**Steps**

1. `Specify internal point or [Properties/Select objects/Undo/Advanced/Origin]:` click inside the areas;
   <kbd>Enter</kbd> creates the hatch.

**Options**

| Option | What it does |
| --- | --- |
| `Properties` | `Enter a pattern name or [?/Solid/User defined]`, then the scale and angle (`Specify a scale for the pattern`, `Specify an angle for the pattern`); for User defined, the angle and `Specify spacing between the lines`. |
| `Select objects` | Hatch the inside of selected closed objects. |
| `Advanced` | `Enter an option [Island detection/Style/Associativity] <exit>:` island style `[Ignore/Outer/Normal]` and associativity. |
| `Origin` | `Enter an option [Use current origin/Set new origin]`: where the pattern starts. |
| `Undo` | Removes the last area picked. |

**Example**: a 45° ANSI31 hatch at scale 2.

```text
RECTANGLE 0,0 @100,60
-HATCH P ANSI31 2 45 50,30 ""
```

## -HATCHEDIT

Edits a hatch from the command line.

**Aliases** `-HE` · **Command line only**

**Steps**

1. `Select hatch object:`
2. `Enter hatch option [Disassociate/Style/Properties/Origin/recreate Boundary] <eXit>:`

**Options**

| Option | What it does |
| --- | --- |
| `Disassociate` | The hatch stops following its boundary. |
| `Style` | `Enter hatching style [Ignore/Outer/Normal]`. |
| `Properties` | Pattern, scale and angle, as in -HATCH. |
| `Origin` | `Specify new origin point:` |
| `recreate Boundary` | Draws a new closed polyline around the hatch (`Enter type of boundary object [Region/Polyline] <Polyline>:`; regions are not available yet). |

## -OPEN

Opens a drawing from the command line.

**Aliases** none · **Command line only**

**Steps**

1. `Open drawing from [Device/List] <List>:` the file picker of the device, or the list of the working folder or
   your account.

## -PLOT

Plots to PDF right away with the last PLOT settings, without the dialog.

**Aliases** `-PRINT` · **Command line only**

## -GROUP

Manages groups from the command line.

**Aliases** `-G` · **Command line only**

**Steps**

1. `Enter a group option [?/Add/Remove/Explode/REName/Selectable/Create] <Create>:`

**Options**

| Option | What it does |
| --- | --- |
| `?` | Lists the groups with their number of objects. |
| `Create` | Creates a group (`Enter the name of the group:`, then `Select objects:`). |
| `Add` / `Remove` | Adds objects to a group or removes them. |
| `Explode` | Breaks up a group. |
| `REName` | Renames a group. |
| `Selectable` | Whether picking one object selects the whole group. |

## -TOOLBAR

Shows, hides, docks or floats a toolbar from the command line.

**Aliases** `-TO` · **Command line only**

**Steps**

1. `Enter toolbar name or [ALL]:` for example `Draw`, `Modify` or `Dimension`.
2. `Enter an option [Show/Hide/Left/Right/Top/Bottom/Float] <Show>:` show or hide it, dock it on an edge, or let
   it float.

## -IMAGE

The images of the drawing from the command line.

**Aliases** none · **Command line only**

**Steps**

1. `Enter an option [Reload/?]:` `?` lists the images and whether their files are loaded; `Reload` asks for the
   files of the images.
