import { PcbScene3dBoardSolderMaskFactory } from './PcbScene3dBoardSolderMaskFactory.mjs'
import { PcbScene3dCopperDetailGroupBuilder } from './PcbScene3dCopperDetailGroupBuilder.mjs'
import { PcbScene3dDetailCoordinateNormalizer } from './PcbScene3dDetailCoordinateNormalizer.mjs'
import { PcbScene3dDrillVoidFactory } from './PcbScene3dDrillVoidFactory.mjs'
import { PcbScene3dRuntimeBoardMeshes } from './PcbScene3dRuntimeBoardMeshes.mjs'

/** Runs the same exact generated-geometry factories on workers or the caller. */
export class PcbScene3dGeneratedGeometryBuilder {
    /**
     * Builds one independent generated runtime stage.
     * @param {any} THREE Three.js namespace.
     * @param {'board' | 'copper'} kind Geometry stage.
     * @param {object} sceneDescription Normalized scene description.
     * @returns {any}
     */
    static build(THREE, kind, sceneDescription) {
        const normalizePoint =
            PcbScene3dDetailCoordinateNormalizer.create(sceneDescription)
        const board = sceneDescription.board
        if (kind === 'copper') {
            return PcbScene3dCopperDetailGroupBuilder.build(
                THREE,
                sceneDescription,
                board.thicknessMil / 2 + 0.05,
                normalizePoint
            )
        }
        if (kind !== 'board')
            throw new Error('Unknown generated geometry stage: ' + kind)
        const group = new THREE.Group()
        group.add(
            PcbScene3dRuntimeBoardMeshes.buildBoardMesh(
                THREE,
                sceneDescription,
                normalizePoint
            )
        )
        group.add(
            PcbScene3dBoardSolderMaskFactory.buildGroup(
                THREE,
                sceneDescription,
                normalizePoint
            )
        )
        group.add(
            PcbScene3dDrillVoidFactory.buildGroup(
                THREE,
                sceneDescription.detail,
                board.thicknessMil / 2,
                -board.thicknessMil / 2,
                normalizePoint,
                {
                    enabled: true,
                    board,
                    hasBoardAssemblyModel: Boolean(
                        sceneDescription.boardAssemblyModel
                    ),
                    sourceFormat: sceneDescription.sourceFormat
                }
            )
        )
        group.add(
            PcbScene3dRuntimeBoardMeshes.buildBoardOutline(
                THREE,
                sceneDescription,
                normalizePoint
            )
        )
        return group
    }

    /**
     * Keeps component model payloads outside geometry-worker messages.
     * @param {object} sceneDescription Normalized scene description.
     * @returns {object}
     */
    static workerInput(sceneDescription) {
        return {
            board: sceneDescription.board,
            detail: sceneDescription.detail,
            texts: sceneDescription.texts,
            sourceFormat: sceneDescription.sourceFormat,
            coordinateSystem: sceneDescription.coordinateSystem,
            boardAssemblyModel: Boolean(sceneDescription.boardAssemblyModel)
        }
    }
}
