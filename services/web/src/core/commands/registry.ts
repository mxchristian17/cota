import type { CommandEngine } from './CommandEngine'
import type { Command } from './types'
import { lineCommand } from './impl/line'
import { circleCommand } from './impl/circle'
import { arcCommand } from './impl/arc'
import { ellipseCommand } from './impl/ellipse'
import { mtextCommand, textCommand } from './impl/text'
import { plineCommand } from './impl/pline'
import { rectangleCommand } from './impl/rectangle'
import { splineCommand } from './impl/spline'
import {
  copyCommand,
  eraseCommand,
  moveCommand,
  redoCommand,
  scaleCommand,
  selectCommand,
  selectAllCommand,
  undoCommand,
} from './impl/editing'
import { rotateCommand } from './impl/rotate'
import { mirrorCommand } from './impl/mirror'
import { stretchCommand } from './impl/stretch'
import { aboutCommand, makeHelpCommand } from './impl/help'
import { cloudCommand, loginCommand, newCommand, openCmdlineCommand, openCommand, openFolderCommand, saveCommand } from './impl/file'
import { planCommand, ucsCommand, ucsiconCommand, ucsVarCommands } from './impl/ucs'
import { extrudeCommand } from './impl/extrude'
import { boxCommand, coneCommand, cylinderCommand, sphereCommand, torusCommand } from './impl/primitives'
import { polygonCommand } from './impl/polygon'
import { cannoscaleCommand, dimStyleCmdlineCommand, dimStyleCommand, dimVarCommands } from './impl/dimstyle'
import { dimAssocCommand, dimDisassociateCommand, dimReassociateCommand, dimRegenCommand } from './impl/dimassoc'
import { dimBreakCommand, dimEditCommand, dimInspectCommand, dimJoglineCommand, dimOverrideCommand, dimSpaceCommand, dimTeditCommand } from './impl/dimedit'
import { matchPropCommand } from './impl/matchprop'
import { layerToolCommands } from './impl/layertools'
import { dashLinetypeCommand, linetypeCommand, linetypeVarCommands } from './impl/linetype'
import { peditCommand, peditVarCommands } from './impl/pedit'
import { dashHatchCommand, dashHatchEditCommand, hatchCommand, hatchEditCommand, hatchVarCommands } from './impl/hatch'
import { centerlineCommand, mleaderAlignCommand, mleaderCommand, mleaderEditCommand, mleaderStyleCommand, qleaderCommand } from './impl/mleader'
import { revolveCommand } from './impl/revolve'
import { intersectCommand, subtractCommand, unionCommand } from './impl/csg'
import { orthographicCommand, perspectiveCommand, viewCommand } from './impl/view'
import { dashPanCommand, limitsCommand, panCommand, zoomCommand, zoomVarCommands } from './impl/zoom'
import { arrayCommand } from './impl/array'
import { blockCommand, explodeCommand, insertCommand } from './impl/block'
import { flatshotCommand } from './impl/project'
import { drawingViewCommands } from './impl/viewbase'
import { solprofCommand } from './impl/solprof'
import { autodimCommand } from './impl/autodim'
import { extendCommand, trimCommand } from './impl/trim'
import { offsetCommand, offsetGapTypeCommand } from './impl/offset'
import { joinCommand } from './impl/join'
import { breakAtPointCommand, breakCommand } from './impl/break'
import { lengthenCommand } from './impl/lengthen'
import { chamferCommand, filletCommand } from './impl/fillet'
import { chamferEdgeCommand, filletEdgeCommand } from './impl/filletEdge'
import { alignCommand } from './impl/align'
import { vportsCommand } from './impl/vports'
import { plotCommand, publishCommand } from './impl/plot'
import { layoutCommand, pagesetupCommand } from './impl/layout'
import { mviewCommand } from './impl/mview'
import { mspaceCommand, pspaceCommand, vpmaxCommand, vpminCommand } from './impl/mspace'
import { vpclipCommand } from './impl/vpclip'
import { vplayerCommand } from './impl/vplayer'
import { dwgpropsCommand, fieldCommand, updatefieldCommand } from './impl/field'
import { attdefCommand, attdispCommand, atteditCommand, attsyncCommand, eatteditCommand } from './impl/attribs'
import { distCommand } from './impl/dist'
import { exportCommand, importCommand } from './impl/io'
import { optionsCommand } from './impl/options'
import { osnapCommand } from './impl/osnap'
import { shademodeCommand, vscurrentCommand } from './impl/vstyle'
import { redrawCommand } from './impl/redraw'
import { dashToolbarCommand, fullscreenCommand, gridCommand, layerCommand, propertiesCommand, toolbarCommand, screenCommands, navvcubeCommand } from './impl/ui'
import { promptCommand } from './impl/ai'
import {
  dimAlignedCommand,
  dimAngularCommand,
  dimArcCommand,
  dimBaselineCommand,
  dimCenterCommand,
  dimCommand,
  dimContinueCommand,
  dimDiameterCommand,
  dimJoggedCommand,
  dimLinearCommand,
  dimOrdinateCommand,
  dimRadiusCommand,
  dimTextSizeCommand,
  leaderCommand,
  qdimCommand,
} from './impl/dim'

/** Registra los comandos disponibles (+ persistencia + edición ). */
/**
 * Comandos que sólo leen o fijan una variable de sistema (DIMCLRD, HPNAME, ZOOMFACTOR…): se escriben en la
 * línea de comandos pero no van en los menús, como en el CAD clásico.
 */
export const VARIABLE_COMMANDS = new Set<string>(['OFFSETGAPTYPE', 'DIMTEXTSIZE', 'DIMASSOC', 'CANNOSCALE'])

function registerVariable(engine: CommandEngine, c: Command): void {
  VARIABLE_COMMANDS.add(c.name)
  engine.register(c)
}

export function registerDefaultCommands(engine: CommandEngine): void {
  // Dibujo 2D
  engine.register(lineCommand)
  engine.register(circleCommand)
  engine.register(polygonCommand)
  engine.register(arcCommand)
  engine.register(ellipseCommand)
  engine.register(textCommand)
  engine.register(mtextCommand)
  engine.register(plineCommand)
  engine.register(rectangleCommand)
  engine.register(splineCommand)
  // Edición
  engine.register(selectCommand)
  engine.register(selectAllCommand)
  engine.register(eraseCommand)
  engine.register(moveCommand)
  engine.register(copyCommand)
  engine.register(scaleCommand)
  engine.register(rotateCommand)
  engine.register(mirrorCommand)
  engine.register(stretchCommand)
  engine.register(trimCommand)
  engine.register(extendCommand)
  engine.register(offsetCommand)
  engine.register(offsetGapTypeCommand)
  engine.register(joinCommand)
  engine.register(breakCommand)
  engine.register(breakAtPointCommand)
  engine.register(lengthenCommand)
  engine.register(alignCommand)
  engine.register(filletCommand)
  engine.register(chamferCommand)
  engine.register(filletEdgeCommand)
  engine.register(chamferEdgeCommand)
  engine.register(undoCommand)
  engine.register(redoCommand)
  engine.register(arrayCommand)
  engine.register(distCommand)
  engine.register(blockCommand)
  engine.register(insertCommand)
  engine.register(explodeCommand)
  engine.register(flatshotCommand)
  for (const c of drawingViewCommands) engine.register(c)
  engine.register(solprofCommand)
  engine.register(autodimCommand)
  // 3D
  engine.register(extrudeCommand)
  engine.register(revolveCommand)
  engine.register(boxCommand)
  engine.register(cylinderCommand)
  engine.register(coneCommand)
  engine.register(sphereCommand)
  engine.register(torusCommand)
  engine.register(unionCommand)
  engine.register(subtractCommand)
  engine.register(intersectCommand)
  engine.register(viewCommand)
  engine.register(perspectiveCommand)
  engine.register(orthographicCommand)
  engine.register(zoomCommand)
  engine.register(panCommand)
  engine.register(dashPanCommand)
  engine.register(limitsCommand)
  for (const c of zoomVarCommands) registerVariable(engine, c)
  engine.register(vportsCommand)
  engine.register(vscurrentCommand)
  engine.register(shademodeCommand)
  engine.register(redrawCommand)
  engine.register(propertiesCommand)
  engine.register(layerCommand)
  engine.register(toolbarCommand)
  engine.register(dashToolbarCommand)
  engine.register(gridCommand)
  engine.register(fullscreenCommand)
  for (const c of screenCommands) engine.register(c)
  engine.register(navvcubeCommand)
  engine.register(promptCommand)
  engine.register(plotCommand)
  engine.register(publishCommand)
  engine.register(layoutCommand)
  engine.register(pagesetupCommand)
  engine.register(mviewCommand)
  engine.register(mspaceCommand)
  engine.register(pspaceCommand)
  engine.register(vpmaxCommand)
  engine.register(vpminCommand)
  engine.register(vpclipCommand)
  engine.register(vplayerCommand)
  engine.register(fieldCommand)
  engine.register(updatefieldCommand)
  engine.register(dwgpropsCommand)
  engine.register(attdefCommand)
  engine.register(atteditCommand)
  engine.register(eatteditCommand)
  engine.register(attsyncCommand)
  engine.register(attdispCommand)

  engine.register(dimCommand)
  engine.register(qdimCommand)
  engine.register(dimLinearCommand)
  engine.register(dimAlignedCommand)
  engine.register(dimAngularCommand)
  engine.register(dimRadiusCommand)
  engine.register(dimDiameterCommand)
  engine.register(dimJoggedCommand)
  engine.register(dimArcCommand)
  engine.register(dimOrdinateCommand)
  engine.register(dimBaselineCommand)
  engine.register(dimContinueCommand)
  engine.register(leaderCommand)
  engine.register(dimCenterCommand)
  engine.register(dimTextSizeCommand)
  engine.register(dimStyleCommand)
  for (const c of [dimAssocCommand, dimDisassociateCommand, dimReassociateCommand, dimRegenCommand]) engine.register(c)
  for (const c of [dimEditCommand, dimTeditCommand, dimSpaceCommand, dimBreakCommand, dimJoglineCommand, dimInspectCommand, dimOverrideCommand, matchPropCommand]) engine.register(c)
  for (const c of [mleaderCommand, mleaderEditCommand, mleaderAlignCommand, qleaderCommand, mleaderStyleCommand, centerlineCommand]) engine.register(c)
  engine.register(dimStyleCmdlineCommand)
  engine.register(cannoscaleCommand)
  for (const c of layerToolCommands) engine.register(c)
  for (const c of dimVarCommands) registerVariable(engine, c)
  // Coordenadas
  engine.register(ucsCommand)
  engine.register(planCommand)
  engine.register(ucsiconCommand)
  for (const c of ucsVarCommands) registerVariable(engine, c)
  // Tipos de línea
  engine.register(linetypeCommand)
  engine.register(dashLinetypeCommand)
  for (const c of linetypeVarCommands) registerVariable(engine, c)
  // Sombreados
  engine.register(hatchCommand)
  engine.register(dashHatchCommand)
  engine.register(hatchEditCommand)
  engine.register(dashHatchEditCommand)
  for (const c of hatchVarCommands) registerVariable(engine, c)
  // PEDIT
  engine.register(peditCommand)
  for (const c of peditVarCommands) registerVariable(engine, c)
  // Archivos / sesión
  engine.register(newCommand)
  engine.register(openCommand)
  engine.register(openCmdlineCommand)
  engine.register(saveCommand)
  engine.register(loginCommand)
  engine.register(openFolderCommand)
  engine.register(cloudCommand)
  engine.register(importCommand)
  engine.register(exportCommand)
  engine.register(optionsCommand)
  engine.register(osnapCommand)
  // Ayuda
  engine.register(makeHelpCommand(() => engine.getCommands()))
  engine.register(aboutCommand)
}
