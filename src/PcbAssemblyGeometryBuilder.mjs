import { PcbAssemblyBoardSubstrateBuilder } from './PcbAssemblyBoardSubstrateBuilder.mjs'
import { PcbAssemblyComponentMeshBuilder } from './PcbAssemblyComponentMeshBuilder.mjs'
import { PcbAssemblyFillGeometryResolver } from './PcbAssemblyFillGeometryResolver.mjs'
import { PcbAssemblyMeshUtils } from './PcbAssemblyMeshUtils.mjs'
import { PcbAssemblyPadMeshBuilder } from './PcbAssemblyPadMeshBuilder.mjs'

const COPPER_THICKNESS_MIL = 2.2
const SILKSCREEN_THICKNESS_MIL = 0.8
const BOARD_COLOR = [0.05, 0.32, 0.18]
const COPPER_COLOR = [0.85, 0.62, 0.12]
const SILKSCREEN_COLOR = [0.96, 0.95, 0.9]

/**
 * Converts a prepared 3D scene description into exportable faceted meshes.
 */
export class PcbAssemblyGeometryBuilder {
    /**
     * Builds assembly meshes and diagnostics.
     * @param {{ board?: object, detail?: object, components?: object[], externalPlacements?: object[] }} sceneDescription Prepared scene description.
     * @param {{ modelMeshLoader?: (placement: object) => Promise<object | object[]>, includeModels?: boolean, renderFallbackBodies?: boolean, progress?: { advance?: (units: number, message: string) => Promise<void>, finish?: (message: string) => Promise<void> } }} [options] Build options.
     * @returns {Promise<{ meshes: object[], diagnostics: object[] }>}
     */
    static async build(sceneDescription, options = {}) {
        const diagnostics = []
        const progress = options.progress || null
        const boardMeshes =
            PcbAssemblyGeometryBuilder.#buildBoardMeshes(sceneDescription)
        await progress?.advance?.(1, 'Building board substrate')
        const copperMeshes =
            await PcbAssemblyGeometryBuilder.#buildCopperMeshes(
                sceneDescription,
                progress
            )
        const silkscreenMeshes =
            await PcbAssemblyGeometryBuilder.#buildSilkscreenMeshes(
                sceneDescription,
                progress
            )
        const pcbMeshes = [...boardMeshes, ...copperMeshes, ...silkscreenMeshes]
        const componentResult = await PcbAssemblyComponentMeshBuilder.build(
            sceneDescription,
            options,
            progress
        )
        diagnostics.push(...componentResult.diagnostics)
        const meshes = [
            ...PcbAssemblyGeometryBuilder.#translateMeshes(
                pcbMeshes,
                PcbAssemblyGeometryBuilder.#boardLocalOffset(sceneDescription)
            ),
            ...componentResult.meshes
        ]

        await progress?.finish?.('Geometry meshes ready')
        return {
            meshes: meshes.filter((mesh) => mesh?.vertices?.length),
            diagnostics
        }
    }

    /**
     * Builds substrate meshes.
     * @param {{ board?: object }} sceneDescription Prepared scene description.
     * @returns {object[]}
     */
    static #buildBoardMeshes(sceneDescription) {
        const board = sceneDescription?.board || {}
        const width = Math.max(Number(board.widthMil || 0), 1)
        const height = Math.max(Number(board.heightMil || 0), 1)
        const thickness = Math.max(Number(board.thicknessMil || 63), 1)
        const outlinePoints =
            PcbAssemblyGeometryBuilder.#boardOutlinePoints(board)
        const outlineMesh = PcbAssemblyBoardSubstrateBuilder.build(
            'board',
            outlinePoints,
            sceneDescription,
            thickness,
            BOARD_COLOR
        )
        if (outlineMesh) {
            return [outlineMesh]
        }

        return [
            PcbAssemblyMeshUtils.box('board', {
                width,
                depth: height,
                height: thickness,
                color: BOARD_COLOR
            })
        ]
    }

    /**
     * Builds copper, pads, and via meshes.
     * @param {{ board?: object, detail?: object }} sceneDescription Prepared scene description.
     * @param {{ advance?: (units: number, message: string) => Promise<void> } | null} progress Progress tracker.
     * @returns {Promise<object[]>}
     */
    static async #buildCopperMeshes(sceneDescription, progress = null) {
        const detail = sceneDescription?.detail || {}
        const board = sceneDescription?.board || {}
        const topZ =
            Number(board.thicknessMil || 63) / 2 + COPPER_THICKNESS_MIL / 2
        const bottomZ = -topZ
        const meshes = []

        const tracks = PcbAssemblyGeometryBuilder.#array(detail.tracks)
        for (let index = 0; index < tracks.length; index += 1) {
            const track = tracks[index]
            const side = PcbAssemblyGeometryBuilder.#resolveSide(track)
            const mesh = PcbAssemblyGeometryBuilder.#trackMesh(
                'copper-' + side + '-track-' + (index + 1),
                track,
                side === 'bottom' ? bottomZ : topZ,
                COPPER_THICKNESS_MIL,
                COPPER_COLOR
            )
            if (mesh) meshes.push(mesh)
            await progress?.advance?.(
                1,
                'Building copper tracks ' + (index + 1) + '/' + tracks.length
            )
        }

        const arcs = PcbAssemblyGeometryBuilder.#array(detail.arcs)
        for (let index = 0; index < arcs.length; index += 1) {
            const arc = arcs[index]
            const side = PcbAssemblyGeometryBuilder.#resolveSide(arc)
            const mesh = PcbAssemblyMeshUtils.prism(
                'copper-' + side + '-arc-' + (index + 1),
                PcbAssemblyMeshUtils.arcBandPoints(arc),
                side === 'bottom' ? bottomZ : topZ,
                COPPER_THICKNESS_MIL,
                COPPER_COLOR
            )
            if (mesh) meshes.push(mesh)
            await progress?.advance?.(
                1,
                'Building copper arcs ' + (index + 1) + '/' + arcs.length
            )
        }

        const fills = [
            ...PcbAssemblyGeometryBuilder.#array(detail.fills),
            ...PcbAssemblyGeometryBuilder.#array(detail.polygons)
        ]
        for (let index = 0; index < fills.length; index += 1) {
            const fill = fills[index]
            const side = PcbAssemblyGeometryBuilder.#resolveSide(fill)
            const fillMeshes = PcbAssemblyGeometryBuilder.#fillMeshes(
                'copper-' + side + '-fill-' + (index + 1),
                fill,
                side === 'bottom' ? bottomZ : topZ,
                COPPER_THICKNESS_MIL,
                COPPER_COLOR
            )
            meshes.push(...fillMeshes)
            await progress?.advance?.(
                1,
                'Building copper fills ' + (index + 1) + '/' + fills.length
            )
        }

        const pads = PcbAssemblyGeometryBuilder.#array(detail.pads)
        for (let index = 0; index < pads.length; index += 1) {
            const pad = pads[index]
            const topMesh = PcbAssemblyPadMeshBuilder.build(
                'pad-top-' + (index + 1),
                pad,
                'top',
                topZ,
                COPPER_THICKNESS_MIL,
                COPPER_COLOR
            )
            const bottomMesh = PcbAssemblyPadMeshBuilder.build(
                'pad-bottom-' + (index + 1),
                pad,
                'bottom',
                bottomZ,
                COPPER_THICKNESS_MIL,
                COPPER_COLOR
            )
            if (topMesh) meshes.push(topMesh)
            await progress?.advance?.(
                1,
                'Building pads ' + (index + 1) + '/' + pads.length
            )
            if (bottomMesh) meshes.push(bottomMesh)
            await progress?.advance?.(
                1,
                'Building pads ' + (index + 1) + '/' + pads.length
            )
        }

        const vias = PcbAssemblyGeometryBuilder.#array(detail.vias)
        for (let index = 0; index < vias.length; index += 1) {
            const via = vias[index]
            const mesh = PcbAssemblyGeometryBuilder.#viaMesh(
                'via-' + (index + 1),
                via,
                Number(board.thicknessMil || 63) + COPPER_THICKNESS_MIL
            )
            if (mesh) meshes.push(mesh)
            await progress?.advance?.(
                1,
                'Building vias ' + (index + 1) + '/' + vias.length
            )
        }

        const copperTexts = PcbAssemblyGeometryBuilder.#array(
            detail.copperTexts
        )
        for (let index = 0; index < copperTexts.length; index += 1) {
            const text = copperTexts[index]
            const side = PcbAssemblyGeometryBuilder.#resolveSide(text)
            const mesh = PcbAssemblyGeometryBuilder.#textMesh(
                'copper-' + side + '-text-' + (index + 1),
                text,
                side === 'bottom' ? bottomZ : topZ,
                COPPER_COLOR,
                COPPER_THICKNESS_MIL
            )
            if (mesh) meshes.push(mesh)
            await progress?.advance?.(
                1,
                'Building copper labels ' +
                    (index + 1) +
                    '/' +
                    copperTexts.length
            )
        }

        return meshes
    }

    /**
     * Builds silkscreen meshes.
     * @param {{ board?: object, detail?: object }} sceneDescription Prepared scene description.
     * @param {{ advance?: (units: number, message: string) => Promise<void> } | null} progress Progress tracker.
     * @returns {Promise<object[]>}
     */
    static async #buildSilkscreenMeshes(sceneDescription, progress = null) {
        const detail = sceneDescription?.detail || {}
        const board = sceneDescription?.board || {}
        const topZ =
            Number(board.thicknessMil || 63) / 2 +
            COPPER_THICKNESS_MIL +
            SILKSCREEN_THICKNESS_MIL / 2
        const bottomZ = -topZ
        const meshes = []
        const sides = [
            ['top', detail?.silkscreen?.top || {}, topZ],
            ['bottom', detail?.silkscreen?.bottom || {}, bottomZ]
        ]

        for (const [side, silkscreen, z] of sides) {
            const tracks = PcbAssemblyGeometryBuilder.#array(silkscreen.tracks)
            for (let index = 0; index < tracks.length; index += 1) {
                const mesh = PcbAssemblyGeometryBuilder.#trackMesh(
                    'silkscreen-' + side + '-track-' + (index + 1),
                    tracks[index],
                    z,
                    SILKSCREEN_THICKNESS_MIL,
                    SILKSCREEN_COLOR
                )
                if (mesh) meshes.push(mesh)
                await progress?.advance?.(
                    1,
                    'Building silkscreen tracks ' +
                        (index + 1) +
                        '/' +
                        tracks.length
                )
            }

            const arcs = PcbAssemblyGeometryBuilder.#array(silkscreen.arcs)
            for (let index = 0; index < arcs.length; index += 1) {
                const mesh = PcbAssemblyMeshUtils.prism(
                    'silkscreen-' + side + '-arc-' + (index + 1),
                    PcbAssemblyMeshUtils.arcBandPoints(arcs[index]),
                    z,
                    SILKSCREEN_THICKNESS_MIL,
                    SILKSCREEN_COLOR
                )
                if (mesh) meshes.push(mesh)
                await progress?.advance?.(
                    1,
                    'Building silkscreen arcs ' +
                        (index + 1) +
                        '/' +
                        arcs.length
                )
            }

            const fills = PcbAssemblyGeometryBuilder.#array(silkscreen.fills)
            for (let index = 0; index < fills.length; index += 1) {
                const mesh = PcbAssemblyMeshUtils.prism(
                    'silkscreen-' + side + '-fill-' + (index + 1),
                    PcbAssemblyGeometryBuilder.#points(fills[index]),
                    z,
                    SILKSCREEN_THICKNESS_MIL,
                    SILKSCREEN_COLOR
                )
                if (mesh) meshes.push(mesh)
                await progress?.advance?.(
                    1,
                    'Building silkscreen fills ' +
                        (index + 1) +
                        '/' +
                        fills.length
                )
            }

            const texts = PcbAssemblyGeometryBuilder.#array(silkscreen.texts)
            for (let index = 0; index < texts.length; index += 1) {
                meshes.push(
                    PcbAssemblyGeometryBuilder.#textMesh(
                        'silkscreen-' + side + '-text-' + (index + 1),
                        texts[index],
                        z,
                        SILKSCREEN_COLOR,
                        SILKSCREEN_THICKNESS_MIL
                    )
                )
                await progress?.advance?.(
                    1,
                    'Building silkscreen labels ' +
                        (index + 1) +
                        '/' +
                        texts.length
                )
            }
        }

        return meshes.filter(Boolean)
    }

    /**
     * Resolves the PCB source-coordinate to board-local export offset.
     * @param {{ board?: object }} sceneDescription Prepared scene description.
     * @returns {{ x: number, y: number }}
     */
    static #boardLocalOffset(sceneDescription) {
        const board = sceneDescription?.board || {}
        const centerX = Number(board?.centerX)
        const centerY = Number(board?.centerY)

        return {
            x: Number.isFinite(centerX) ? -centerX : 0,
            y: Number.isFinite(centerY) ? -centerY : 0
        }
    }

    /**
     * Translates PCB-generated meshes into the component placement origin.
     * @param {object[]} meshes Source meshes.
     * @param {{ x: number, y: number }} offset Translation offset in mils.
     * @returns {object[]}
     */
    static #translateMeshes(meshes, offset) {
        if (
            Math.abs(Number(offset?.x || 0)) < 0.001 &&
            Math.abs(Number(offset?.y || 0)) < 0.001
        ) {
            return meshes
        }

        return meshes.map((mesh) =>
            PcbAssemblyGeometryBuilder.#translateMesh(mesh, offset)
        )
    }

    /**
     * Translates one mesh in XY without changing Z.
     * @param {object} mesh Source mesh.
     * @param {{ x: number, y: number }} offset Translation offset in mils.
     * @returns {object}
     */
    static #translateMesh(mesh, offset) {
        return {
            ...mesh,
            vertices: PcbAssemblyGeometryBuilder.#array(mesh?.vertices).map(
                (vertex) => [
                    Number(vertex?.[0] || 0) + Number(offset?.x || 0),
                    Number(vertex?.[1] || 0) + Number(offset?.y || 0),
                    Number(vertex?.[2] || 0)
                ]
            )
        }
    }

    /**
     * Builds one widened track mesh.
     * @param {string} name Mesh name.
     * @param {object} track Track primitive.
     * @param {number} z Center Z.
     * @param {number} thickness Extrusion thickness.
     * @param {number[]} color Mesh color.
     * @returns {object | null}
     */
    static #trackMesh(name, track, z, thickness, color) {
        const x1 = Number(track?.x1 ?? track?.startX ?? 0)
        const y1 = Number(track?.y1 ?? track?.startY ?? 0)
        const x2 = Number(track?.x2 ?? track?.endX ?? x1)
        const y2 = Number(track?.y2 ?? track?.endY ?? y1)
        const width = Math.max(Number(track?.width || 1), 0.001)
        const length = Math.hypot(x2 - x1, y2 - y1)
        if (length <= 0.001) {
            return PcbAssemblyMeshUtils.cylinder(name, {
                x: x1,
                y: y1,
                z,
                radius: width / 2,
                height: thickness,
                color
            })
        }

        return PcbAssemblyMeshUtils.prism(
            name,
            PcbAssemblyMeshUtils.capsulePoints(x1, y1, x2, y2, width / 2),
            z,
            thickness,
            color
        )
    }

    /**
     * Builds filled polygon meshes.
     * @param {string} name Mesh name.
     * @param {object} fill Filled primitive.
     * @param {number} z Center Z.
     * @param {number} thickness Mesh thickness.
     * @param {number[]} color Mesh color.
     * @returns {object[]}
     */
    static #fillMeshes(name, fill, z, thickness, color) {
        const loopSets = PcbAssemblyFillGeometryResolver.resolveAll(fill)
        return loopSets
            .map((loops, index) =>
                PcbAssemblyMeshUtils.prismWithHoles(
                    loopSets.length > 1
                        ? name + '-island-' + (index + 1)
                        : name,
                    loops.outer,
                    loops.holes,
                    z,
                    thickness,
                    color
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one via mesh.
     * @param {string} name Mesh name.
     * @param {object} via Via primitive.
     * @param {number} height Via height.
     * @returns {object}
     */
    static #viaMesh(name, via, height) {
        const outerRadius = Math.max(Number(via?.diameter || 0) / 2, 1)
        const innerRadius = Math.max(Number(via?.holeDiameter || 0) / 2, 0)
        const options = {
            x: Number(via?.x || 0),
            y: Number(via?.y || 0),
            z: 0,
            outerRadius,
            innerRadius,
            height,
            color: COPPER_COLOR
        }

        return innerRadius > 0 && innerRadius < outerRadius
            ? PcbAssemblyMeshUtils.ringCylinder(name, options)
            : PcbAssemblyMeshUtils.cylinder(name, {
                  x: options.x,
                  y: options.y,
                  z: 0,
                  radius: outerRadius,
                  height,
                  color: COPPER_COLOR
              })
    }

    /**
     * Builds a simple text placeholder prism for recoverable text labels.
     * @param {string} name Mesh name.
     * @param {object} text Text primitive.
     * @param {number} z Center Z.
     * @param {number[]} color Mesh color.
     * @param {number} thickness Mesh thickness.
     * @returns {object}
     */
    static #textMesh(name, text, z, color, thickness) {
        const value = String(text?.text || text?.value || text?.string || '')
        const height = Math.max(
            Number(text?.height || text?.size || text?.sizeY || 25),
            1
        )
        const width = Math.max(
            Number(text?.width || text?.sizeX || value.length * height * 0.62),
            height
        )
        const mesh = PcbAssemblyMeshUtils.box(name, {
            x: Number(text?.x || 0) + width / 2,
            y: Number(text?.y || 0) + height / 2,
            z,
            width,
            depth: height,
            height: thickness,
            color
        })

        return PcbAssemblyGeometryBuilder.#rotateMeshAroundZ(
            mesh,
            Number(text?.rotation || 0),
            Number(text?.x || 0),
            Number(text?.y || 0)
        )
    }

    /**
     * Rotates one mesh around a Z-axis origin.
     * @param {object} mesh Mesh to rotate.
     * @param {number} rotationDeg Rotation angle.
     * @param {number} originX Origin X.
     * @param {number} originY Origin Y.
     * @returns {object}
     */
    static #rotateMeshAroundZ(mesh, rotationDeg, originX, originY) {
        if (!mesh || Math.abs(Number(rotationDeg || 0)) < 0.001) {
            return mesh
        }

        const rotationRad = (Number(rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(rotationRad)
        const sin = Math.sin(rotationRad)

        return {
            ...mesh,
            vertices: mesh.vertices.map((vertex) => {
                const dx = Number(vertex[0] || 0) - originX
                const dy = Number(vertex[1] || 0) - originY
                return [
                    originX + dx * cos - dy * sin,
                    originY + dx * sin + dy * cos,
                    Number(vertex[2] || 0)
                ]
            })
        }
    }

    /**
     * Resolves a copper side from layer metadata.
     * @param {object} item Detail primitive.
     * @returns {'top' | 'bottom'}
     */
    static #resolveSide(item) {
        const raw = String(
            item?.side ||
                item?.layerSide ||
                item?.layer ||
                item?.layerName ||
                ''
        ).toLowerCase()

        return raw.includes('bottom') ||
            raw.includes('back') ||
            raw.includes('b.')
            ? 'bottom'
            : 'top'
    }

    /**
     * Extracts polygon points from a primitive.
     * @param {object} source Primitive with point data.
     * @returns {number[][]}
     */
    static #points(source) {
        return PcbAssemblyGeometryBuilder.#array(
            source?.points || source?.vertices || source?.polygon || []
        ).map((point) => [
            Number(point?.x || point?.[0] || 0),
            Number(point?.y || point?.[1] || 0)
        ])
    }

    /**
     * Builds an ordered board outline loop from explicit points or segments.
     * @param {object} board Board metadata.
     * @returns {number[][]}
     */
    static #boardOutlinePoints(board) {
        const explicitPoints = PcbAssemblyGeometryBuilder.#points({
            points: board?.points || board?.outlinePoints || board?.vertices
        })
        if (explicitPoints.length >= 3) {
            return explicitPoints
        }

        const segments = PcbAssemblyGeometryBuilder.#array(board?.segments)
        const points = []
        segments.forEach((segment, index) => {
            if (index === 0) {
                const start = PcbAssemblyGeometryBuilder.#segmentStart(segment)
                if (start) points.push(start)
            }
            points.push(
                ...PcbAssemblyGeometryBuilder.#segmentTailPoints(segment)
            )
        })

        return PcbAssemblyMeshUtils.cleanLoop(points)
    }

    /**
     * Extracts a segment start point.
     * @param {object} segment Segment primitive.
     * @returns {number[] | null}
     */
    static #segmentStart(segment) {
        return PcbAssemblyGeometryBuilder.#pointFromFields(segment, [
            ['x1', 'y1'],
            ['startX', 'startY']
        ])
    }

    /**
     * Extracts line or sampled arc tail points from one segment.
     * @param {object} segment Segment primitive.
     * @returns {number[][]}
     */
    static #segmentTailPoints(segment) {
        if (
            String(segment?.type || '').toLowerCase() === 'arc' ||
            Number.isFinite(Number(segment?.radius))
        ) {
            return PcbAssemblyGeometryBuilder.#arcOutlinePoints(segment)
        }

        const end = PcbAssemblyGeometryBuilder.#pointFromFields(segment, [
            ['x2', 'y2'],
            ['endX', 'endY']
        ])

        return end ? [end] : []
    }

    /**
     * Samples a board outline arc.
     * @param {object} arc Arc segment.
     * @returns {number[][]}
     */
    static #arcOutlinePoints(arc) {
        const centerX = Number(arc?.x || arc?.cx || arc?.centerX || 0)
        const centerY = Number(arc?.y || arc?.cy || arc?.centerY || 0)
        const radius = Number(arc?.radius || 0)
        if (!Number.isFinite(radius) || radius <= 0) {
            return []
        }

        const start = Number(arc?.startAngle || 0)
        const sweep = PcbAssemblyMeshUtils.resolveSweep(arc)
        const segments = Math.max(Math.ceil(Math.abs(sweep) / 8), 4)
        const points = []

        for (let index = 1; index <= segments; index += 1) {
            const angle = ((start + (sweep * index) / segments) * Math.PI) / 180
            points.push([
                centerX + Math.cos(angle) * radius,
                centerY + Math.sin(angle) * radius
            ])
        }

        return points
    }

    /**
     * Reads a point from the first complete field pair.
     * @param {object} source Source object.
     * @param {string[][]} fieldPairs Candidate field pairs.
     * @returns {number[] | null}
     */
    static #pointFromFields(source, fieldPairs) {
        for (const [xField, yField] of fieldPairs) {
            const x = Number(source?.[xField])
            const y = Number(source?.[yField])
            if (Number.isFinite(x) && Number.isFinite(y)) {
                return [x, y]
            }
        }

        return null
    }

    /**
     * Returns the first positive finite number.
     * @param {unknown[]} values Candidate values.
     * @returns {number}
     */
    static #firstPositive(values) {
        for (const value of values) {
            const number = Number(value)
            if (Number.isFinite(number) && number > 0) {
                return number
            }
        }

        return 0
    }

    /**
     * Creates a normalized diagnostic object.
     * @param {string} severity Diagnostic severity.
     * @param {string} code Diagnostic code.
     * @param {string} message User-facing message.
     * @returns {object}
     */
    static #diagnostic(severity, code, message) {
        return { severity, code, message }
    }

    /**
     * Normalizes a value to an array.
     * @param {unknown} value Candidate value.
     * @returns {any[]}
     */
    static #array(value) {
        return Array.isArray(value) ? value : []
    }
}
