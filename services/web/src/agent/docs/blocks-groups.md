# Blocks and groups
BLOCK: objects, "", name, base point. The objects become one block definition and are replaced by one copy of it.
INSERT: name, insertion point, X scale (""= 1), rotation ("" = 0).
  CIRCLE 0,0 5
  BLOCK L "" Bolt 0,0
  INSERT Bolt 50,0 "" ""
ATTDEF defines attributes (text fields) inside a block before creating it.
GROUP: objects, "" — they are selected together. UNGROUP: a point on a grouped object.
  CIRCLE 100,0 5
  CIRCLE 120,0 5
  GROUP C 90,-10 130,10 ""
