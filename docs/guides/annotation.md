# Text, blocks, hatches and dimensions

Annotating drawings: text and fields, blocks with attributes, hatches and every kind of dimension.

## Text, blocks and hatches

- **Blocks:** `BLOCK` turns a group of objects into a reusable definition; `INSERT` places it (with scale and
  rotation). `ATTDEF` adds attributes (text fields asked on insertion); `ATTEDIT` / `EATTEDIT` edit their
  values, `ATTSYNC` updates references after a block changes. `EXPLODE` breaks a block into its parts.
- **Text:** `TEXT` writes single lines on their **baseline** (`Justify` for center or right; every <kbd>Enter</kbd>
  starts the next line, an empty line ends), `MTEXT` multiline text from its top-left corner. `%%c`, `%%d` and
  `%%p` give Ø, ° and ±. Double-click any object to open its properties.
  `FIELD` inserts live fields (date, file name, drawing properties set with `DWGPROPS`, sheet number…).
- **Hatches:** `HATCH`, then click inside a closed area. The *Hatch Creation* panel sets pattern, scale, angle,
  solid fill and island detection. Hatches are associative: they follow when their boundary moves.
  `HATCHEDIT` edits them.

## Dimensions

The dimension commands are in the **Dimension** menu and on the dimension toolbar on the left.

| Kind | Commands |
| --- | --- |
| Linear | `DIMLINEAR`, `DIMALIGNED`, `DIMBASELINE`, `DIMCONTINUE`, `DIMORDINATE` |
| Radial and angular | `DIMRADIUS`, `DIMDIAMETER`, `DIMJOGGED`, `DIMANGULAR`, `DIMARC` |
| Smart | `DIM` (picks the right type from what you click), `QDIM` (many at once) |
| Automatic | `AUTODIM`: dimensions a whole part — overall sizes, steps, hole positions, diameters and radii — in baseline or chain style. In a layout it dimensions every drawing view without repeating what an aligned view already shows |
| Leaders | `MLEADER`, `QLEADER`, `LEADER`, with `MLEADERSTYLE`, `MLEADEREDIT`, `MLEADERALIGN` |
| Annotation | `DIMCENTER`, `CENTERLINE`, `THREAD`, `DIMINSPECT`, `DIMBREAK`, `DIMSPACE`, `DIMJOGLINE` |
| Editing | `DIMEDIT`, `DIMTEDIT`, `DIMOVERRIDE`, `DIMREASSOCIATE`, `DIMDISASSOCIATE`, `DIMREGEN`, and right-click on a dimension |

`DIMSTYLE` manages dimension styles (text, arrows, lines, units, tolerances, fit). Dimensions are
**associative**: they update when the geometry changes (`DIMASSOC`). Annotative dimensions keep their
paper size at any annotation scale (`CANNOSCALE`).

**See also:** [Dimension commands](../reference/dimension.md) · [Draw commands](../reference/draw.md#text) · [Dimension variables](../reference/variables.md#dimension-variables)
