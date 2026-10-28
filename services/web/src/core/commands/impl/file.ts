import type { Command } from '../types'

export const newCommand: Command = {
  name: 'NEW',
  aliases: [],
  description: 'Start a new empty drawing (asks to save the changes first)',
  async run(ctx) {
    if (ctx.app.isDirty?.()) {
      const r = await ctx.getPoint(`Save changes to ${ctx.app.docName()}? [Yes/No] <Yes>: `, { keywords: ['Yes', 'No'], enterKeyword: 'Yes', base: null })
      if (r.kind !== 'keyword') return // Esc (o un clic) cancela NEW
      if (r.keyword === 'Yes' && !(await ctx.app.saveNow?.())) {
        ctx.print('The drawing was not saved: NEW cancelled.')
        return
      }
    }
    ctx.app.newDocument()
    ctx.print('New drawing.')
  },
}

/** ¿Hay una lista propia que mostrar? Carpeta de trabajo o cuenta en la nube. */
const hasList = (ctx: Parameters<Command['run']>[0]): boolean => !!ctx.app.workspaceName() || ctx.app.isAuthenticated()

/**
 * OPEN: abre el diálogo con la lista de la carpeta de trabajo o de la nube, que tiene el botón
 * *Open from device…*. Sin carpeta ni sesión, va directo al selector de archivos del sistema.
 */
export const openCommand: Command = {
  name: 'OPEN',
  aliases: [],
  description: 'Open a drawing: from the working folder / cloud list, or from the device (.cota, .dxf, .dwg, .stl, .obj, .step, .iges)',
  async run(ctx) {
    if (!hasList(ctx)) ctx.app.openFromDevice()
    else ctx.app.openDialog()
  },
}

/** -OPEN: versión de línea de comandos, `[Device/List] <List>`. */
export const openCmdlineCommand: Command = {
  name: '-OPEN',
  aliases: [],
  description: 'Open a drawing from the command line [Device/List]',
  async run(ctx) {
    const r = await ctx.getPoint('Open drawing from [Device/List] <List>: ', { keywords: ['Device', 'List'], enterKeyword: 'List' })
    if (r.kind !== 'keyword') return
    if (r.keyword === 'Device' || !hasList(ctx)) {
      if (r.keyword === 'List') ctx.print('No working folder or account to list: choose a file on this device.')
      ctx.app.openFromDevice()
    } else ctx.app.openDialog()
  },
}

export const saveCommand: Command = {
  name: 'SAVE',
  aliases: ['QSAVE', 'SAVEAS'],
  description: 'Save the current drawing: working folder, your account, or a downloaded .cota file',
  async run(ctx) {
    // Sin carpeta de trabajo ni cuenta, el dibujo se descarga como archivo .cota.
    const current = ctx.app.docName()
    const name = await ctx.getString(`Save drawing as <${current}>: `, { default: current })
    if (name === null) {
      ctx.print('Save cancelled.')
      return
    }
    ctx.app.save(name)
  },
}

export const loginCommand: Command = {
  name: 'LOGIN',
  aliases: [],
  description: 'Sign in to save and load drawings',
  async run(ctx) {
    ctx.app.loginDialog()
  },
}

/**
 * Carpeta de trabajo del sistema: al elegirla, SAVE/OPEN pasan a usar archivos reales
 * (`.cota`) en esa carpeta, como en draw.io.
 */
export const openFolderCommand: Command = {
  name: 'OPENFOLDER',
  aliases: ['FOLDER', 'WORKSPACE'],
  description: 'Choose a system folder to open and save drawings as files',
  async run(ctx) {
    ctx.app.pickWorkspaceFolder()
  },
}

/** Vuelve a guardar los dibujos en la cuenta (backend) en vez de la carpeta local. */
export const cloudCommand: Command = {
  name: 'CLOUD',
  aliases: ['CLOUDSTORAGE'],
  description: 'Store drawings in your account again (detach the local folder)',
  async run(ctx) {
    if (!ctx.app.workspaceName()) {
      ctx.print('Already working in the cloud.')
      return
    }
    ctx.app.useCloudStorage()
  },
}
