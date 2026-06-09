import { PcbScene3dBoardMaterialPalette } from './PcbScene3dBoardMaterialPalette.mjs'
import { PcbScene3dBoardShapeFactory } from './PcbScene3dBoardShapeFactory.mjs'

/**
 * Builds generated board meshes used by the interactive 3D runtime.
 */
export class PcbScene3dRuntimeBoardMeshes {
    /**
     * Resolves the board face material side for one camera preset.
     * @param {any} THREE Three.js namespace.
     * @param {string} preset Active camera preset.
     * @param {{ boardAssemblyModel?: any }} sceneDescription Scene metadata.
     * @returns {any}
     */
    static resolveBoardFaceSide(THREE, preset, sceneDescription) {
        return Boolean(sceneDescription?.boardAssemblyModel) &&
            String(preset || '').toLowerCase() === 'bottom'
            ? THREE.BackSide
            : THREE.FrontSide
    }

    /**
     * Applies the preset-specific board face material side to the board mesh.
     * @param {any} THREE Three.js namespace.
     * @param {any} boardGroup Runtime board render group.
     * @param {string} preset Active camera preset.
     * @param {{ boardAssemblyModel?: any }} sceneDescription Scene metadata.
     * @returns {void}
     */
    static applyBoardFaceSide(THREE, boardGroup, preset, sceneDescription) {
        const side = PcbScene3dRuntimeBoardMeshes.resolveBoardFaceSide(
            THREE,
            preset,
            sceneDescription
        )

        PcbScene3dRuntimeBoardMeshes.#traverseBoardObjects(
            boardGroup,
            (object) => {
                if (!object?.userData?.scene3dBoardFaceMaterial) {
                    return
                }

                const faceMaterial = Array.isArray(object?.material)
                    ? object.material[0]
                    : null
                if (!faceMaterial) {
                    return
                }

                if (faceMaterial.side !== side) {
                    faceMaterial.side = side
                    faceMaterial.needsUpdate = true
                }
            }
        )
    }

    /**
     * Builds the extruded board body mesh.
     * @param {any} THREE Three.js namespace.
     * @param {{ board?: any, detail?: any, boardAssemblyModel?: any }} sceneDescription Scene metadata.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeDetailPoint Detail coordinate normalizer.
     * @returns {any}
     */
    static buildBoardMesh(THREE, sceneDescription, normalizeDetailPoint) {
        const board = sceneDescription.board
        const geometry = PcbScene3dBoardShapeFactory.buildGeometry(
            THREE,
            board,
            sceneDescription.detail,
            normalizeDetailPoint
        )
        const hasBoardAssemblyModel = Boolean(
            sceneDescription.boardAssemblyModel
        )
        const generatedBodyVisible =
            PcbScene3dBoardMaterialPalette.isGeneratedBodyVisible({
                hasBoardAssemblyModel
            })
        const materialOptions = {
            roughness: 0.68,
            metalness: 0.08,
            visible: generatedBodyVisible
        }
        const edgeColor = Number(board.edgeColor)
        const resolvedEdgeColor = Number.isInteger(edgeColor)
            ? edgeColor
            : 0xc9ca78
        const surfaceColor = hasBoardAssemblyModel
            ? resolvedEdgeColor
            : PcbScene3dBoardMaterialPalette.resolveSurfaceColor(board, {
                  hasBoardAssemblyModel
              })

        const mesh = new THREE.Mesh(geometry, [
            new THREE.MeshStandardMaterial({
                ...materialOptions,
                color: surfaceColor,
                side: THREE.FrontSide
            }),
            new THREE.MeshStandardMaterial({
                ...materialOptions,
                color: resolvedEdgeColor,
                side: THREE.DoubleSide
            }),
            new THREE.MeshStandardMaterial({
                color: 0xd9a61d,
                roughness: 0.38,
                metalness: 0.55,
                visible: generatedBodyVisible,
                side: THREE.DoubleSide
            })
        ])
        mesh.userData = {
            ...(mesh.userData || {}),
            scene3dBoardFaceMaterial: true
        }

        return mesh
    }

    /**
     * Builds a line outline around the board edge.
     * @param {any} THREE Three.js namespace.
     * @param {{ board?: any, detail?: any }} sceneDescription Scene metadata.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeDetailPoint Detail coordinate normalizer.
     * @returns {any}
     */
    static buildBoardOutline(THREE, sceneDescription, normalizeDetailPoint) {
        const shape = PcbScene3dBoardShapeFactory.buildShape(
            THREE,
            sceneDescription.board,
            sceneDescription.detail,
            normalizeDetailPoint
        )
        const points = shape.getPoints(120)
        const positions = []
        const topZ = sceneDescription.board.thicknessMil / 2 + 0.8

        points.forEach((point) => {
            positions.push(point.x, point.y, topZ)
        })

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )

        return new THREE.LineLoop(
            geometry,
            new THREE.LineBasicMaterial({ color: 0xc9ca78, transparent: true })
        )
    }

    /**
     * Traverses the board render group.
     * @param {any} root Root group or mesh.
     * @param {(object: any) => void} visitor Visitor callback.
     * @returns {void}
     */
    static #traverseBoardObjects(root, visitor) {
        if (!root) {
            return
        }

        if (typeof root.traverse === 'function') {
            root.traverse(visitor)
            return
        }

        visitor(root)
        ;(Array.isArray(root.children) ? root.children : []).forEach((child) =>
            PcbScene3dRuntimeBoardMeshes.#traverseBoardObjects(child, visitor)
        )
    }
}
