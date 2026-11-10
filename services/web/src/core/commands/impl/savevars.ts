import type { Command } from '../types'
import { askNumber } from '../ask'
import { sysvars } from '../sysvars'

/** ISAVEBAK y SAVETIME: copia `.bak` al guardar y copias de recuperación `.sv$` (en la carpeta local), como el CAD clásico. */
export const saveVarCommands: Command[] = [
  {
    name: 'ISAVEBAK',
    aliases: [],
    description: 'Keep the previous version as a .bak file when saving to the local folder (0/1)',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for ISAVEBAK <${sysvars.ISAVEBAK}>: `, { def: sysvars.ISAVEBAK, check: (v) => (v === 0 || v === 1 ? null : 'Requires 0 or 1.') })
      if (r?.kind === 'number') sysvars.ISAVEBAK = r.value as 0 | 1
    },
  },
  {
    name: 'SAVETIME',
    aliases: [],
    description: 'Minutes between automatic recovery copies (.sv$) in the local folder (0 = off)',
    async run(ctx) {
      const r = await askNumber(ctx, `Enter new value for SAVETIME <${sysvars.SAVETIME}>: `, {
        def: sysvars.SAVETIME,
        check: (v) => (Number.isInteger(v) && v >= 0 && v <= 600 ? null : 'Requires an integer between 0 and 600.'),
      })
      if (r?.kind === 'number') sysvars.SAVETIME = r.value
    },
  },
]
