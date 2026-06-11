import { PcbScene3dBoardEdgeCutoutBuilder } from './PcbScene3dBoardEdgeCutoutBuilder.mjs'
import { PcbScene3dDrillPathFactory } from './PcbScene3dDrillPathFactory.mjs'
import { PcbScene3dOutlineBuilder } from './PcbScene3dOutlineBuilder.mjs'

/**
 * Builds the board solid profile, including drilled holes.
 */
export class PcbScene3dBoardShapeFactory {
    static #CURVE_SEGMENTS = 8
    static #PAD_HOLE_SHAPE_SLOT = 2
    static #PLATED_WALL_MATERIAL_INDEX = 2
    static #EDGE_WALL_MATERIAL_INDEX = 1
    static #CONTOUR_SAMPLE_POINTS = 64
    static #GEOMETRY_EPSILON = 0.001
    static #CONTOUR_MATCH_TOLERANCE_MIL = 0.25
    static #CONTOUR_INDEX_MIN_CELL_SIZE = 32
    static #CONTOUR_INDEX_MAX_CELLS_PER_CONTOUR = 128

    /**
     * Builds one board shape with drill holes.
     * @param {any} THREE
     * @param {{ widthMil?: number, heightMil?: number, segments?: Array<Record<string, number | string>> }} board
     * @param {{ pads?: any[], vias?: any[] }} [detail]
     * @param {(x: number, y: number) => { x: number, y: number }} [normalizeBoardPoint]
     * @returns {any}
     */
    static buildShape(
        THREE,
        board,
        detail = {},
        normalizeBoardPoint = (x, y) => ({ x, y })
    ) {
        const baseShape = PcbScene3dBoardShapeFactory.#buildBaseShape(
            THREE,
            board
        )
        const contourPoints =
            PcbScene3dBoardEdgeCutoutBuilder.resolveShapePoints(baseShape)
        const drillCutouts = PcbScene3dBoardShapeFactory.#resolveDrillCutouts(
            THREE,
            detail,
            normalizeBoardPoint
        )
        const edgeCutouts = drillCutouts.filter(
            (cutout) =>
                cutout.isCircular &&
                !PcbScene3dBoardEdgeCutoutBuilder.isHoleInsideContour(
                    cutout.points,
                    contourPoints
                )
        )
        const shape = edgeCutouts.length
            ? PcbScene3dBoardEdgeCutoutBuilder.buildShapeFromPoints(
                  THREE,
                  PcbScene3dBoardEdgeCutoutBuilder.applyCircularEdgeCutouts(
                      contourPoints,
                      edgeCutouts
                  )
              )
            : baseShape
        const finalContourPoints = edgeCutouts.length
            ? PcbScene3dBoardEdgeCutoutBuilder.resolveShapePoints(shape)
            : contourPoints

        for (const cutout of drillCutouts) {
            if (edgeCutouts.includes(cutout)) {
                continue
            }

            if (
                !cutout.isCircular ||
                PcbScene3dBoardEdgeCutoutBuilder.isHoleInsideContour(
                    cutout.points,
                    finalContourPoints
                )
            ) {
                shape.holes.push(cutout.path)
            }
        }

        return shape
    }

    /**
     * Resolves circular drills that intersect the board outline.
     * @param {any} THREE
     * @param {{ widthMil?: number, heightMil?: number, segments?: Array<Record<string, number | string>> }} board
     * @param {{ pads?: any[], vias?: any[] }} [detail]
     * @param {(x: number, y: number) => { x: number, y: number }} [normalizeBoardPoint]
     * @returns {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }[]}
     */
    static resolveCircularEdgeDrills(
        THREE,
        board,
        detail = {},
        normalizeBoardPoint = (x, y) => ({ x, y })
    ) {
        if (!board) {
            return []
        }

        const contourPoints =
            PcbScene3dBoardEdgeCutoutBuilder.resolveShapePoints(
                PcbScene3dBoardShapeFactory.#buildBaseShape(THREE, board)
            )

        return PcbScene3dBoardShapeFactory.#resolveDrillCutouts(
            THREE,
            detail,
            normalizeBoardPoint
        )
            .filter(
                (cutout) =>
                    cutout.isCircular &&
                    !PcbScene3dBoardEdgeCutoutBuilder.isHoleInsideContour(
                        cutout.points,
                        contourPoints
                    )
            )
            .map((cutout) => cutout.drillSpec)
    }

    /**
     * Builds the outer board shape before drill holes are applied.
     * @param {any} THREE
     * @param {{ widthMil?: number, heightMil?: number, segments?: Array<Record<string, number | string>> }} board
     * @returns {any}
     */
    static #buildBaseShape(THREE, board) {
        const shape = new THREE.Shape()
        const commands = PcbScene3dOutlineBuilder.buildCommands(board)

        if (!commands.length) {
            shape.moveTo(-board.widthMil / 2, -board.heightMil / 2)
            shape.lineTo(board.widthMil / 2, -board.heightMil / 2)
            shape.lineTo(board.widthMil / 2, board.heightMil / 2)
            shape.lineTo(-board.widthMil / 2, board.heightMil / 2)
            shape.lineTo(-board.widthMil / 2, -board.heightMil / 2)
        } else {
            for (const command of commands) {
                if (command.type === 'move') {
                    shape.moveTo(Number(command.x || 0), Number(command.y || 0))
                    continue
                }

                if (command.type === 'arc') {
                    shape.absarc(
                        Number(command.cx || 0),
                        Number(command.cy || 0),
                        Number(command.radius || 0),
                        Number(command.startAngleRad || 0),
                        Number(command.endAngleRad || 0),
                        Boolean(command.clockwise)
                    )
                    continue
                }

                shape.lineTo(Number(command.x || 0), Number(command.y || 0))
            }
            shape.closePath()
        }
        return shape
    }

    /**
     * Builds one extruded board body geometry with open drill apertures.
     * @param {any} THREE
     * @param {{ widthMil?: number, heightMil?: number, thicknessMil?: number, segments?: Array<Record<string, number | string>> }} board
     * @param {{ pads?: any[], vias?: any[] }} [detail]
     * @param {(x: number, y: number) => { x: number, y: number }} [normalizeBoardPoint]
     * @returns {any}
     */
    static buildGeometry(
        THREE,
        board,
        detail = {},
        normalizeBoardPoint = (x, y) => ({ x, y })
    ) {
        const thicknessMil = Number(board?.thicknessMil || 0)
        const shape = PcbScene3dBoardShapeFactory.buildShape(
            THREE,
            board,
            detail,
            normalizeBoardPoint
        )
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: thicknessMil,
            bevelEnabled: false,
            curveSegments: PcbScene3dBoardShapeFactory.#CURVE_SEGMENTS
        })

        geometry.translate?.(0, 0, -thicknessMil / 2)
        PcbScene3dBoardShapeFactory.#applyPlatedDrillWallMaterials(
            THREE,
            geometry,
            detail,
            normalizeBoardPoint
        )
        return geometry
    }

    /**
     * Resolves normalized drill cutout metadata.
     * @param {any} THREE
     * @param {{ pads?: any[], vias?: any[] }} detail
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @returns {{ path: any, points: { x: number, y: number }[], centerX: number, centerY: number, radius: number, isCircular: boolean, drillSpec: { x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null } }[]}
     */
    static #resolveDrillCutouts(THREE, detail, normalizeBoardPoint) {
        return PcbScene3dDrillPathFactory.resolveBoardDrillSpecs(detail)
            .map((drillSpec) => {
                const point = normalizeBoardPoint(drillSpec.x, drillSpec.y)
                const normalizedSpec = {
                    ...drillSpec,
                    x: point.x,
                    y: point.y
                }
                const path = PcbScene3dDrillPathFactory.buildDrillPath(
                    THREE,
                    normalizedSpec
                )
                const diameter = Number(normalizedSpec.diameter || 0)
                const slotLength = Number(normalizedSpec.slotLength || 0)
                const isCircular =
                    diameter > 0 && slotLength <= diameter + 0.001
                const points = isCircular
                    ? PcbScene3dBoardEdgeCutoutBuilder.buildCircularCutoutPoints(
                          Number(normalizedSpec.x || 0),
                          Number(normalizedSpec.y || 0),
                          diameter / 2
                      )
                    : PcbScene3dBoardShapeFactory.#resolvePathPoints(path)

                return {
                    path,
                    points,
                    centerX: Number(normalizedSpec.x || 0),
                    centerY: Number(normalizedSpec.y || 0),
                    radius: diameter / 2,
                    isCircular,
                    drillSpec
                }
            })
            .filter((cutout) => cutout.path && cutout.points.length >= 3)
    }

    /**
     * Resolves sampled points from one path.
     * @param {{ getPoints?: (segments: number) => { x: number, y: number }[] } | null} path
     * @returns {{ x: number, y: number }[]}
     */
    static #resolvePathPoints(path) {
        return (
            path?.getPoints?.(
                PcbScene3dBoardShapeFactory.#CONTOUR_SAMPLE_POINTS
            ) || []
        ).map((point) => ({
            x: Number(point.x || 0),
            y: Number(point.y || 0)
        }))
    }

    /**
     * Assigns copper material to plated drill side-wall triangles only.
     * @param {any} THREE
     * @param {any} geometry
     * @param {{ pads?: any[], vias?: any[] }} detail
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @returns {void}
     */
    static #applyPlatedDrillWallMaterials(
        THREE,
        geometry,
        detail,
        normalizeBoardPoint
    ) {
        const contours = PcbScene3dBoardShapeFactory.#resolvePlatedContours(
            THREE,
            detail,
            normalizeBoardPoint
        )
        if (!contours.length || !geometry?.groups?.length) {
            return
        }

        const contourIndex =
            PcbScene3dBoardShapeFactory.#buildContourSpatialIndex(contours)
        const nextGroups = []
        for (const group of geometry.groups) {
            const start = Number(group.start || 0)
            const end = start + Number(group.count || 0)
            for (let index = start; index < end; index += 3) {
                const materialIndex =
                    Number(group.materialIndex) ===
                        PcbScene3dBoardShapeFactory.#EDGE_WALL_MATERIAL_INDEX &&
                    PcbScene3dBoardShapeFactory.#matchesAnyContour(
                        geometry,
                        index,
                        contourIndex
                    )
                        ? PcbScene3dBoardShapeFactory
                              .#PLATED_WALL_MATERIAL_INDEX
                        : Number(group.materialIndex || 0)

                PcbScene3dBoardShapeFactory.#appendGeometryGroup(
                    nextGroups,
                    index,
                    Math.min(3, end - index),
                    materialIndex
                )
            }
        }

        geometry.clearGroups?.()
        nextGroups.forEach((group) => {
            geometry.addGroup(group.start, group.count, group.materialIndex)
        })
    }

    /**
     * Resolves normalized contours for plated board drills.
     * @param {any} THREE
     * @param {{ pads?: any[], vias?: any[] }} detail
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @returns {{ points: { x: number, y: number }[], segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }[]}
     */
    static #resolvePlatedContours(THREE, detail, normalizeBoardPoint) {
        return PcbScene3dBoardShapeFactory.#resolvePlatedDrillSpecs(detail)
            .map((drillSpec) => {
                const point = normalizeBoardPoint(drillSpec.x, drillSpec.y)
                const normalizedSpec = {
                    ...drillSpec,
                    x: point.x,
                    y: point.y
                }

                if (
                    PcbScene3dBoardShapeFactory.#isCircularDrillSpec(
                        normalizedSpec
                    )
                ) {
                    return PcbScene3dBoardShapeFactory.#buildCircularContour(
                        Number(normalizedSpec.x || 0),
                        Number(normalizedSpec.y || 0),
                        Number(normalizedSpec.diameter || 0) / 2
                    )
                }

                const path = PcbScene3dDrillPathFactory.buildDrillPath(THREE, {
                    ...normalizedSpec
                })
                const points =
                    path?.getPoints?.(
                        PcbScene3dBoardShapeFactory.#CONTOUR_SAMPLE_POINTS
                    ) || []
                return PcbScene3dBoardShapeFactory.#buildContour(points)
            })
            .filter(Boolean)
    }

    /**
     * Returns true when a drill aperture can be matched as a circle.
     * @param {{ diameter?: number, slotLength?: number | null }} drillSpec
     * @returns {boolean}
     */
    static #isCircularDrillSpec(drillSpec) {
        const diameter = Number(drillSpec?.diameter || 0)
        const slotLength = Number(drillSpec?.slotLength || 0)

        return diameter > 0 && slotLength <= diameter + 0.001
    }

    /**
     * Builds a contour descriptor for circular plated holes.
     * @param {number} centerX
     * @param {number} centerY
     * @param {number} radius
     * @returns {{ points: { x: number, y: number }[], segments: any[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, isCircular: boolean, centerX: number, centerY: number, radius: number } | null}
     */
    static #buildCircularContour(centerX, centerY, radius) {
        if (
            !Number.isFinite(centerX) ||
            !Number.isFinite(centerY) ||
            !Number.isFinite(radius) ||
            radius <= 0
        ) {
            return null
        }

        return {
            points: [],
            segments: [],
            bounds: {
                minX: centerX - radius,
                maxX: centerX + radius,
                minY: centerY - radius,
                maxY: centerY + radius
            },
            isCircular: true,
            centerX,
            centerY,
            radius
        }
    }

    /**
     * Resolves deduped drill specs that represent plated holes.
     * @param {{ pads?: any[], vias?: any[] }} detail
     * @returns {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }[]}
     */
    static #resolvePlatedDrillSpecs(detail) {
        const platedKeys = new Set()

        for (const via of detail?.vias || []) {
            const diameter = Number(via?.holeDiameter || 0)
            if (diameter <= 0) {
                continue
            }

            platedKeys.add(
                PcbScene3dBoardShapeFactory.#buildDrillSpecKey({
                    x: Number(via?.x || 0),
                    y: Number(via?.y || 0),
                    diameter,
                    slotLength: null,
                    rotationDeg: 0
                })
            )
        }

        for (const pad of detail?.pads || []) {
            const diameter = Number(pad?.holeDiameter || 0)
            if (
                diameter <= 0 ||
                !PcbScene3dBoardShapeFactory.#hasPadCopperAnnulus(pad, diameter)
            ) {
                continue
            }

            const slotLength =
                Number(pad?.holeShape) ===
                    PcbScene3dBoardShapeFactory.#PAD_HOLE_SHAPE_SLOT &&
                Number(pad?.holeSlotLength || 0) > diameter
                    ? Number(pad?.holeSlotLength || 0)
                    : null
            platedKeys.add(
                PcbScene3dBoardShapeFactory.#buildDrillSpecKey({
                    x: Number(pad?.x || 0),
                    y: Number(pad?.y || 0),
                    diameter,
                    slotLength,
                    rotationDeg:
                        slotLength === null
                            ? 0
                            : PcbScene3dBoardShapeFactory.#normalizeAngle(
                                  Number(pad?.rotation || 0) +
                                      Number(pad?.holeRotation || 0)
                              )
                })
            )
        }

        return PcbScene3dDrillPathFactory.resolveBoardDrillSpecs(detail).filter(
            (drillSpec) =>
                platedKeys.has(
                    PcbScene3dBoardShapeFactory.#buildDrillSpecKey(drillSpec)
                )
        )
    }

    /**
     * Checks whether one pad has copper larger than its drill aperture.
     * @param {any} pad
     * @param {number} diameter
     * @returns {boolean}
     */
    static #hasPadCopperAnnulus(pad, diameter) {
        const drillSpan = Math.max(diameter, Number(pad?.holeSlotLength || 0))

        return [
            pad?.sizeTopX,
            pad?.sizeTopY,
            pad?.sizeMidX,
            pad?.sizeMidY,
            pad?.sizeBottomX,
            pad?.sizeBottomY
        ].some(
            (size) =>
                Number(size || 0) >
                drillSpan + PcbScene3dBoardShapeFactory.#GEOMETRY_EPSILON
        )
    }

    /**
     * Builds one closed contour and bounds from sampled path points.
     * @param {any[]} points
     * @returns {{ points: { x: number, y: number }[], segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number } } | null}
     */
    static #buildContour(points) {
        const contour = (points || [])
            .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
            .filter(
                (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
            )
        const first = contour[0]
        const last = contour[contour.length - 1]

        if (contour.length < 3) {
            return null
        }

        if (
            Math.hypot(first.x - last.x, first.y - last.y) >
            PcbScene3dBoardShapeFactory.#GEOMETRY_EPSILON
        ) {
            contour.push({ ...first })
        }

        return {
            points: contour,
            segments:
                PcbScene3dBoardShapeFactory.#buildContourSegments(contour),
            bounds: contour.reduce(
                (bounds, point) => ({
                    minX: Math.min(bounds.minX, point.x),
                    maxX: Math.max(bounds.maxX, point.x),
                    minY: Math.min(bounds.minY, point.y),
                    maxY: Math.max(bounds.maxY, point.y)
                }),
                {
                    minX: Infinity,
                    maxX: -Infinity,
                    minY: Infinity,
                    maxY: -Infinity
                }
            )
        }
    }

    /**
     * Builds reusable segment metadata for one contour.
     * @param {{ x: number, y: number }[]} points Closed contour points.
     * @returns {{ start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]}
     */
    static #buildContourSegments(points) {
        const segments = []

        for (let index = 0; index < points.length - 1; index += 1) {
            const start = points[index]
            const end = points[index + 1]
            const dx = end.x - start.x
            const dy = end.y - start.y

            segments.push({
                start,
                end,
                dx,
                dy,
                lengthSquared: dx * dx + dy * dy,
                bounds: {
                    minX: Math.min(start.x, end.x),
                    maxX: Math.max(start.x, end.x),
                    minY: Math.min(start.y, end.y),
                    maxY: Math.max(start.y, end.y)
                }
            })
        }

        return segments
    }

    /**
     * Builds a spatial index for plated drill contour bounds.
     * @param {{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]} contours
     * @returns {{ cellSize: number, cells: Map<string, number[]>, contours: any[], overflowIndexes: number[], marks: Uint32Array, mark: number }}
     */
    static #buildContourSpatialIndex(contours) {
        const cellSize =
            PcbScene3dBoardShapeFactory.#resolveContourIndexCellSize(contours)
        const cells = new Map()
        const overflowIndexes = []

        contours.forEach((contour, index) => {
            const range = PcbScene3dBoardShapeFactory.#resolveCellRange(
                contour.bounds,
                cellSize
            )
            const cellCount =
                (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1)

            if (
                cellCount >
                PcbScene3dBoardShapeFactory.#CONTOUR_INDEX_MAX_CELLS_PER_CONTOUR
            ) {
                overflowIndexes.push(index)
                return
            }

            for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
                for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
                    const key = PcbScene3dBoardShapeFactory.#cellKey(
                        cellX,
                        cellY
                    )
                    const bucket = cells.get(key)

                    if (bucket) {
                        bucket.push(index)
                    } else {
                        cells.set(key, [index])
                    }
                }
            }
        })

        return {
            cellSize,
            cells,
            contours,
            overflowIndexes,
            marks: new Uint32Array(contours.length),
            mark: 0
        }
    }

    /**
     * Resolves a spatial cell size from typical contour spans.
     * @param {{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]} contours
     * @returns {number}
     */
    static #resolveContourIndexCellSize(contours) {
        const spans = contours
            .map((contour) =>
                Math.max(
                    Number(contour.bounds.maxX) - Number(contour.bounds.minX),
                    Number(contour.bounds.maxY) - Number(contour.bounds.minY),
                    0
                )
            )
            .filter((span) => Number.isFinite(span))
            .sort((left, right) => left - right)
        const medianSpan = spans[Math.floor(spans.length / 2)] || 0

        return Math.max(
            medianSpan * 4,
            PcbScene3dBoardShapeFactory.#CONTOUR_INDEX_MIN_CELL_SIZE
        )
    }

    /**
     * Collects unique contour candidates that could touch one triangle.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
     * @param {{ cellSize: number, cells: Map<string, number[]>, contours: any[], overflowIndexes: number[], marks: Uint32Array, mark: number }} contourIndex
     * @returns {any[]}
     */
    static #collectCandidateContours(bounds, contourIndex) {
        const candidates = []
        const tolerance =
            PcbScene3dBoardShapeFactory.#CONTOUR_MATCH_TOLERANCE_MIL
        const range = PcbScene3dBoardShapeFactory.#resolveCellRange(
            {
                minX: bounds.minX - tolerance,
                maxX: bounds.maxX + tolerance,
                minY: bounds.minY - tolerance,
                maxY: bounds.maxY + tolerance
            },
            contourIndex.cellSize
        )

        contourIndex.mark += 1
        if (contourIndex.mark >= 0xffffffff) {
            contourIndex.marks.fill(0)
            contourIndex.mark = 1
        }

        for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
                const bucket = contourIndex.cells.get(
                    PcbScene3dBoardShapeFactory.#cellKey(cellX, cellY)
                )

                if (bucket) {
                    for (const index of bucket) {
                        PcbScene3dBoardShapeFactory.#appendContourCandidate(
                            candidates,
                            contourIndex,
                            index
                        )
                    }
                }
            }
        }

        for (const index of contourIndex.overflowIndexes) {
            PcbScene3dBoardShapeFactory.#appendContourCandidate(
                candidates,
                contourIndex,
                index
            )
        }
        return candidates
    }

    /**
     * Appends one unique contour candidate for the current collection mark.
     * @param {any[]} candidates
     * @param {{ contours: any[], marks: Uint32Array, mark: number }} contourIndex
     * @param {number} index
     * @returns {void}
     */
    static #appendContourCandidate(candidates, contourIndex, index) {
        if (contourIndex.marks[index] === contourIndex.mark) {
            return
        }

        contourIndex.marks[index] = contourIndex.mark
        candidates.push(contourIndex.contours[index])
    }

    /**
     * Resolves the inclusive grid-cell range for one bounds box.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
     * @param {number} cellSize
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveCellRange(bounds, cellSize) {
        return {
            minX: Math.floor(Number(bounds.minX) / cellSize),
            maxX: Math.floor(Number(bounds.maxX) / cellSize),
            minY: Math.floor(Number(bounds.minY) / cellSize),
            maxY: Math.floor(Number(bounds.maxY) / cellSize)
        }
    }

    /**
     * Builds a deterministic contour spatial index key.
     * @param {number} cellX
     * @param {number} cellY
     * @returns {string}
     */
    static #cellKey(cellX, cellY) {
        return `${cellX}:${cellY}`
    }

    /**
     * Returns true when a triangle is on any plated drill contour.
     * @param {any} geometry
     * @param {number} triangleStart
     * @param {{ cellSize: number, cells: Map<string, number[]>, contours: any[], overflowIndexes: number[], marks: Uint32Array, mark: number }} contourIndex
     * @returns {boolean}
     */
    static #matchesAnyContour(geometry, triangleStart, contourIndex) {
        const triangle = PcbScene3dBoardShapeFactory.#resolveTrianglePoints(
            geometry,
            triangleStart
        )
        return PcbScene3dBoardShapeFactory.#collectCandidateContours(
            triangle.bounds,
            contourIndex
        ).some((contour) =>
            PcbScene3dBoardShapeFactory.#matchesContourPoints(
                triangle.points,
                contour
            )
        )
    }

    /**
     * Returns true when all triangle vertices lie on one drill contour.
     * @param {{ x: number, y: number }[]} points
     * @param {{ points: { x: number, y: number }[], segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }} contour
     * @returns {boolean}
     */
    static #matchesContourPoints(points, contour) {
        for (const point of points) {
            if (
                !PcbScene3dBoardShapeFactory.#isPointNearContour(point, contour)
            ) {
                return false
            }
        }

        return true
    }

    /**
     * Resolves one geometry triangle's XY points and bounds.
     * @param {any} geometry
     * @param {number} triangleStart
     * @returns {{ points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number } }}
     */
    static #resolveTrianglePoints(geometry, triangleStart) {
        const points = [0, 1, 2].map((offset) =>
            PcbScene3dBoardShapeFactory.#resolveVertexPoint(
                geometry,
                triangleStart + offset
            )
        )

        return {
            points,
            bounds: points.reduce(
                (bounds, point) => ({
                    minX: Math.min(bounds.minX, point.x),
                    maxX: Math.max(bounds.maxX, point.x),
                    minY: Math.min(bounds.minY, point.y),
                    maxY: Math.max(bounds.maxY, point.y)
                }),
                {
                    minX: Infinity,
                    maxX: -Infinity,
                    minY: Infinity,
                    maxY: -Infinity
                }
            )
        }
    }

    /**
     * Resolves the XY point for one indexed or non-indexed geometry vertex.
     * @param {any} geometry
     * @param {number} index
     * @returns {{ x: number, y: number }}
     */
    static #resolveVertexPoint(geometry, index) {
        const position = geometry.getAttribute('position')
        const vertexIndex = geometry.index?.getX?.(index) ?? index

        return {
            x: position.getX(vertexIndex),
            y: position.getY(vertexIndex)
        }
    }

    /**
     * Returns true when a point is close to one contour boundary.
     * @param {{ x: number, y: number }} point
     * @param {{ segments: { start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, isCircular?: boolean, centerX?: number, centerY?: number, radius?: number }} contour
     * @returns {boolean}
     */
    static #isPointNearContour(point, contour) {
        const tolerance =
            PcbScene3dBoardShapeFactory.#CONTOUR_MATCH_TOLERANCE_MIL
        const toleranceSquared = tolerance * tolerance
        if (
            point.x < contour.bounds.minX - tolerance ||
            point.x > contour.bounds.maxX + tolerance ||
            point.y < contour.bounds.minY - tolerance ||
            point.y > contour.bounds.maxY + tolerance
        ) {
            return false
        }

        if (contour.isCircular) {
            return PcbScene3dBoardShapeFactory.#isPointNearCircularContour(
                point,
                contour,
                tolerance
            )
        }

        for (const segment of contour.segments) {
            if (
                point.x < segment.bounds.minX - tolerance ||
                point.x > segment.bounds.maxX + tolerance ||
                point.y < segment.bounds.minY - tolerance ||
                point.y > segment.bounds.maxY + tolerance
            ) {
                continue
            }

            if (
                PcbScene3dBoardShapeFactory.#distanceToSegmentSquared(
                    point,
                    segment
                ) <= toleranceSquared
            ) {
                return true
            }
        }

        return false
    }

    /**
     * Returns true when a point lies within the tolerance ring of a circle.
     * @param {{ x: number, y: number }} point
     * @param {{ centerX?: number, centerY?: number, radius?: number }} contour
     * @param {number} tolerance
     * @returns {boolean}
     */
    static #isPointNearCircularContour(point, contour, tolerance) {
        const radius = Number(contour.radius || 0)
        const minRadius = Math.max(0, radius - tolerance)
        const maxRadius = radius + tolerance
        const dx = point.x - Number(contour.centerX || 0)
        const dy = point.y - Number(contour.centerY || 0)
        const distanceSquared = dx * dx + dy * dy

        return (
            distanceSquared >= minRadius * minRadius &&
            distanceSquared <= maxRadius * maxRadius
        )
    }

    /**
     * Appends or extends a contiguous material group.
     * @param {{ start: number, count: number, materialIndex: number }[]} groups
     * @param {number} start
     * @param {number} count
     * @param {number} materialIndex
     * @returns {void}
     */
    static #appendGeometryGroup(groups, start, count, materialIndex) {
        const previous = groups[groups.length - 1]
        if (
            previous &&
            previous.start + previous.count === start &&
            previous.materialIndex === materialIndex
        ) {
            previous.count += count
            return
        }

        groups.push({ start, count, materialIndex })
    }

    /**
     * Computes the squared XY distance from a point to a finite segment.
     * @param {{ x: number, y: number }} point
     * @param {{ start: { x: number, y: number }, end: { x: number, y: number }, dx: number, dy: number, lengthSquared: number }} segment
     * @returns {number}
     */
    static #distanceToSegmentSquared(point, segment) {
        if (
            segment.lengthSquared <=
            PcbScene3dBoardShapeFactory.#GEOMETRY_EPSILON
        ) {
            const dx = point.x - segment.start.x
            const dy = point.y - segment.start.y
            return dx * dx + dy * dy
        }

        const ratio = Math.max(
            0,
            Math.min(
                1,
                ((point.x - segment.start.x) * segment.dx +
                    (point.y - segment.start.y) * segment.dy) /
                    segment.lengthSquared
            )
        )
        const projectedX = segment.start.x + ratio * segment.dx
        const projectedY = segment.start.y + ratio * segment.dy
        const dx = point.x - projectedX
        const dy = point.y - projectedY

        return dx * dx + dy * dy
    }

    /**
     * Builds a stable drill spec key.
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }} drillSpec
     * @returns {string}
     */
    static #buildDrillSpecKey(drillSpec) {
        return [
            Number(drillSpec.x || 0).toFixed(4),
            Number(drillSpec.y || 0).toFixed(4),
            Number(drillSpec.diameter || 0).toFixed(4),
            Number(drillSpec.slotLength || 0).toFixed(4),
            Number(drillSpec.rotationDeg || 0).toFixed(4)
        ].join(':')
    }

    /**
     * Normalizes one angle into the inclusive `[0, 360)` range.
     * @param {number} angleDeg
     * @returns {number}
     */
    static #normalizeAngle(angleDeg) {
        const normalized = Number(angleDeg || 0) % 360
        return normalized < 0 ? normalized + 360 : normalized
    }
}
