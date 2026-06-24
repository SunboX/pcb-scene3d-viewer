import { PcbAssemblyMeshUtils } from './PcbAssemblyMeshUtils.mjs'
import { PcbAssemblyFillRingNormalizer } from './PcbAssemblyFillRingNormalizer.mjs'

/**
 * Resolves filled PCB detail primitives into exportable polygon loops.
 */
export class PcbAssemblyFillGeometryResolver {
    /**
     * Resolves one or more independent fill islands.
     * @param {object} source Filled primitive.
     * @returns {{ outer: number[][], holes: number[][][] }[]}
     */
    static resolveAll(source) {
        return PcbAssemblyFillGeometryResolver.inspect(source).loopSets
    }

    /**
     * Resolves the outer loop and inner cutout loops for one fill primitive.
     * @param {object} source Filled primitive.
     * @returns {{ outer: number[][], holes: number[][][] }}
     */
    static resolve(source) {
        const report = PcbAssemblyFillGeometryResolver.inspect(source)
        return report.loopSets[0] || { outer: [], holes: [] }
    }

    /**
     * Resolves fill geometry and reports discarded saved-fill rings.
     * @param {object} source Filled primitive.
     * @returns {{ loopSets: { outer: number[][], holes: number[][][] }[], diagnostics: object[] }}
     */
    static inspect(source) {
        const ringReport =
            PcbAssemblyFillGeometryResolver.#inspectRingGeometry(source)
        if (ringReport.hasRingGeometry) {
            return {
                loopSets: ringReport.loopSets,
                diagnostics: ringReport.diagnostics
            }
        }

        return {
            loopSets: [PcbAssemblyFillGeometryResolver.#resolveLegacy(source)],
            diagnostics: []
        }
    }

    /**
     * Resolves non-B-Rep fill geometry.
     * @param {object} source Filled primitive.
     * @returns {{ outer: number[][], holes: number[][][] }}
     */
    static #resolveLegacy(source) {
        const contours = PcbAssemblyFillGeometryResolver.#contours(source)
        if (contours.length) {
            return {
                outer: contours[0],
                holes: contours.slice(1)
            }
        }

        return {
            outer: PcbAssemblyFillGeometryResolver.#outerLoop(source),
            holes: PcbAssemblyFillGeometryResolver.#holeLoops(source)
        }
    }

    /**
     * Resolves ring-style geometry and diagnostics when present.
     * @param {object} source Filled primitive.
     * @returns {{ hasRingGeometry: boolean, loopSets: { outer: number[][], holes: number[][][] }[], diagnostics: object[] }}
     */
    static #inspectRingGeometry(source) {
        const shapes = PcbAssemblyFillGeometryResolver.#ringShapes(source)
        if (shapes.length) {
            return PcbAssemblyFillGeometryResolver.#inspectRingShapes(shapes)
        }

        const shape = source?.brep_shape || source?.brepShape || null
        if (!shape) {
            return {
                hasRingGeometry: false,
                loopSets: [],
                diagnostics: []
            }
        }

        return PcbAssemblyFillGeometryResolver.#inspectRingShapes([shape])
    }

    /**
     * Resolves ring-style geometry from shape objects.
     * @param {object[]} shapes Ring shape objects.
     * @returns {{ hasRingGeometry: boolean, loopSets: { outer: number[][], holes: number[][][] }[], diagnostics: object[] }}
     */
    static #inspectRingShapes(shapes) {
        const diagnostics = []
        const loopSets = shapes
            .map((shape, shapeIndex) =>
                PcbAssemblyFillGeometryResolver.#ringGeometryFromShape(
                    shape,
                    shapeIndex,
                    diagnostics
                )
            )
            .filter((geometry) =>
                PcbAssemblyFillGeometryResolver.#isValidLoop(geometry.outer)
            )

        return {
            hasRingGeometry: true,
            loopSets,
            diagnostics
        }
    }

    /**
     * Resolves ring-style geometry from one shape object.
     * @param {object} shape Ring shape object.
     * @param {number} shapeIndex Shape index.
     * @param {object[]} diagnostics Diagnostic accumulator.
     * @returns {{ outer: number[][], holes: number[][][] }}
     */
    static #ringGeometryFromShape(shape, shapeIndex, diagnostics) {
        const outer = PcbAssemblyFillGeometryResolver.#normalizedRingLoop(
            shape.outer_ring ||
                shape.outerRing ||
                shape.outer ||
                shape.outer_loop ||
                shape.outerLoop,
            {
                role: 'outer',
                shapeIndex,
                ringIndex: 0,
                winding: 'positive'
            },
            diagnostics
        )
        return {
            outer,
            holes: PcbAssemblyFillGeometryResolver.#array(
                shape.inner_rings ||
                    shape.innerRings ||
                    shape.holes ||
                    shape.inner ||
                    shape.cutouts
            )
                .map((ring, ringIndex) =>
                    PcbAssemblyFillGeometryResolver.#normalizedRingLoop(
                        ring,
                        {
                            role: 'hole',
                            shapeIndex,
                            ringIndex,
                            winding: 'negative'
                        },
                        diagnostics
                    )
                )
                .filter((loop) =>
                    PcbAssemblyFillGeometryResolver.#isValidLoop(loop)
                )
        }
    }

    /**
     * Resolves independent ring-shape islands.
     * @param {object} source Filled primitive.
     * @returns {object[]}
     */
    static #ringShapes(source) {
        return PcbAssemblyFillGeometryResolver.#array(
            source?.brep_shapes ||
                source?.brepShapes ||
                source?.brep_shape_array ||
                source?.brepShapeArray
        )
    }

    /**
     * Resolves a ring object into normalized loop geometry.
     * @param {object | object[]} ring Ring source.
     * @param {{ role: string, shapeIndex: number, ringIndex: number, winding: 'positive' | 'negative' }} options Normalization options.
     * @param {object[]} diagnostics Diagnostic accumulator.
     * @returns {number[][]}
     */
    static #normalizedRingLoop(ring, options, diagnostics) {
        const report = PcbAssemblyFillRingNormalizer.normalize(
            PcbAssemblyFillGeometryResolver.#expandBulgedPoints(
                ring?.vertices ||
                    ring?.cwVertices ||
                    ring?.cw_vertices ||
                    ring?.points ||
                    ring ||
                    []
            ),
            options
        )
        if (report.diagnostic) {
            diagnostics.push(report.diagnostic)
        }
        return report.loop
    }

    /**
     * Samples point-level bulge arcs in one ring.
     * @param {unknown[]} points Candidate ring points.
     * @returns {number[][]}
     */
    static #expandBulgedPoints(points) {
        const vertices = PcbAssemblyFillGeometryResolver.#array(points).map(
            (point) => ({
                point: PcbAssemblyFillGeometryResolver.#point(point),
                bulge: PcbAssemblyFillGeometryResolver.#pointBulge(point)
            })
        )
        const loop =
            PcbAssemblyFillGeometryResolver.#removeClosingVertex(vertices)
        const expanded = []

        for (let index = 0; index < loop.length; index += 1) {
            const current = loop[index]
            const next = loop[(index + 1) % loop.length]
            if (!current?.point) {
                expanded.push([NaN, NaN])
                continue
            }

            expanded.push(current.point)
            if (next?.point) {
                expanded.push(
                    ...PcbAssemblyFillGeometryResolver.#bulgeArcPoints(
                        current.point,
                        next.point,
                        current.bulge
                    )
                )
            }
        }

        return expanded
    }

    /**
     * Removes an explicit closing vertex while preserving per-segment bulge data.
     * @param {{ point: number[] | null, bulge: number }[]} vertices Ring vertices.
     * @returns {{ point: number[] | null, bulge: number }[]}
     */
    static #removeClosingVertex(vertices) {
        const first = vertices[0]?.point
        const last = vertices[vertices.length - 1]?.point

        if (
            first &&
            last &&
            Math.abs(first[0] - last[0]) < 0.001 &&
            Math.abs(first[1] - last[1]) < 0.001
        ) {
            return vertices.slice(0, -1)
        }

        return vertices
    }

    /**
     * Resolves a bulge value from object or tuple point forms.
     * @param {unknown} point Candidate point.
     * @returns {number}
     */
    static #pointBulge(point) {
        const value = Array.isArray(point) ? point[2] : point?.bulge
        const bulge = Number(value || 0)
        return Number.isFinite(bulge) ? bulge : 0
    }

    /**
     * Samples the arc between two points from a polyline bulge value.
     * @param {number[]} start Arc start point.
     * @param {number[]} end Arc end point.
     * @param {number} bulge Polyline bulge value.
     * @returns {number[][]}
     */
    static #bulgeArcPoints(start, end, bulge) {
        if (Math.abs(bulge) <= 0.001) {
            return []
        }

        const dx = end[0] - start[0]
        const dy = end[1] - start[1]
        const chordLength = Math.hypot(dx, dy)
        if (chordLength <= 0.001) {
            return []
        }

        const sweep = 4 * Math.atan(bulge)
        const radius = chordLength / (2 * Math.sin(Math.abs(sweep) / 2))
        const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
        const centerOffset = (chordLength * (1 - bulge * bulge)) / (4 * bulge)
        const center = [
            midpoint[0] - (dy / chordLength) * centerOffset,
            midpoint[1] + (dx / chordLength) * centerOffset
        ]
        const startAngle = Math.atan2(
            start[1] - center[1],
            start[0] - center[0]
        )
        const segments = Math.max(
            Math.ceil(Math.abs(sweep) / (Math.PI / 16)),
            4
        )
        const points = []

        for (let index = 1; index < segments; index += 1) {
            const angle = startAngle + (sweep * index) / segments
            points.push([
                center[0] + Math.cos(angle) * radius,
                center[1] + Math.sin(angle) * radius
            ])
        }

        return points
    }

    /**
     * Resolves contour loops from a multi-contour fill primitive.
     * @param {object} source Filled primitive.
     * @returns {number[][][]}
     */
    static #contours(source) {
        return PcbAssemblyFillGeometryResolver.#array(source?.contours)
            .map((contour) =>
                PcbAssemblyFillGeometryResolver.#pointOrSegmentLoop(contour)
            )
            .filter((loop) =>
                PcbAssemblyFillGeometryResolver.#isValidLoop(loop)
            )
    }

    /**
     * Resolves the primary fill outline.
     * @param {object} source Filled primitive.
     * @returns {number[][]}
     */
    static #outerLoop(source) {
        const explicitLoop = PcbAssemblyFillGeometryResolver.#pointLoop(
            source?.points || source?.vertices || source?.polygon || []
        )
        if (explicitLoop.length >= 3) {
            return explicitLoop
        }

        return PcbAssemblyFillGeometryResolver.#rectangleLoop(source)
    }

    /**
     * Resolves authored cutout loops.
     * @param {object} source Filled primitive.
     * @returns {number[][][]}
     */
    static #holeLoops(source) {
        return PcbAssemblyFillGeometryResolver.#array(source?.holes)
            .map((hole) =>
                PcbAssemblyFillGeometryResolver.#pointOrSegmentLoop(hole)
            )
            .filter((loop) =>
                PcbAssemblyFillGeometryResolver.#isValidLoop(loop)
            )
    }

    /**
     * Resolves a contour that may contain points or segment records.
     * @param {unknown[]} entries Contour entries.
     * @returns {number[][]}
     */
    static #pointOrSegmentLoop(entries) {
        const list = PcbAssemblyFillGeometryResolver.#array(entries)
        if (!list.length) {
            return []
        }

        const pointLoop = PcbAssemblyFillGeometryResolver.#pointLoop(list)
        if (pointLoop.length >= 3) {
            return pointLoop
        }

        return PcbAssemblyFillGeometryResolver.#segmentLoop(list)
    }

    /**
     * Resolves a point loop from object or tuple points.
     * @param {unknown[]} points Candidate points.
     * @returns {number[][]}
     */
    static #pointLoop(points) {
        const loop = PcbAssemblyFillGeometryResolver.#array(points)
            .map((point) => PcbAssemblyFillGeometryResolver.#point(point))
            .filter(Boolean)

        return PcbAssemblyMeshUtils.cleanLoop(loop)
    }

    /**
     * Resolves a point from an object or tuple.
     * @param {unknown} point Candidate point.
     * @returns {number[] | null}
     */
    static #point(point) {
        const x = Array.isArray(point) ? point[0] : point?.x
        const y = Array.isArray(point) ? point[1] : point?.y
        const normalized = [Number(x), Number(y)]

        return normalized.every(Number.isFinite) ? normalized : null
    }

    /**
     * Resolves an ordered loop from line or arc segment records.
     * @param {object[]} segments Segment records.
     * @returns {number[][]}
     */
    static #segmentLoop(segments) {
        const points = []

        segments.forEach((segment, index) => {
            if (index === 0) {
                const start =
                    PcbAssemblyFillGeometryResolver.#segmentStart(segment)
                if (start) points.push(start)
            }

            points.push(
                ...PcbAssemblyFillGeometryResolver.#segmentTailPoints(segment)
            )
        })

        return PcbAssemblyMeshUtils.cleanLoop(points)
    }

    /**
     * Resolves the start point for one segment.
     * @param {object} segment Segment record.
     * @returns {number[] | null}
     */
    static #segmentStart(segment) {
        return (
            PcbAssemblyFillGeometryResolver.#fieldPoint(segment, 'x1', 'y1') ||
            PcbAssemblyFillGeometryResolver.#fieldPoint(
                segment,
                'startX',
                'startY'
            ) ||
            PcbAssemblyFillGeometryResolver.#point(segment?.start)
        )
    }

    /**
     * Resolves the end or sampled arc points for one segment.
     * @param {object} segment Segment record.
     * @returns {number[][]}
     */
    static #segmentTailPoints(segment) {
        const isArc =
            String(segment?.type || '').toLowerCase() === 'arc' ||
            Number.isFinite(Number(segment?.radius))
        if (isArc) {
            return PcbAssemblyFillGeometryResolver.#arcPoints(segment)
        }

        const end =
            PcbAssemblyFillGeometryResolver.#fieldPoint(segment, 'x2', 'y2') ||
            PcbAssemblyFillGeometryResolver.#fieldPoint(
                segment,
                'endX',
                'endY'
            ) ||
            PcbAssemblyFillGeometryResolver.#point(segment?.end)

        return end ? [end] : []
    }

    /**
     * Samples an arc segment into tail points.
     * @param {object} arc Arc segment.
     * @returns {number[][]}
     */
    static #arcPoints(arc) {
        const center = PcbAssemblyFillGeometryResolver.#arcCenter(arc)
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
                center.x + Math.cos(angle) * radius,
                center.y + Math.sin(angle) * radius
            ])
        }

        return points
    }

    /**
     * Resolves the center point for an arc segment.
     * @param {object} arc Arc segment.
     * @returns {{ x: number, y: number }}
     */
    static #arcCenter(arc) {
        return {
            x: Number(arc?.x ?? arc?.cx ?? arc?.centerX ?? arc?.center?.x ?? 0),
            y: Number(arc?.y ?? arc?.cy ?? arc?.centerY ?? arc?.center?.y ?? 0)
        }
    }

    /**
     * Resolves a rectangle fill loop from corner fields.
     * @param {object} source Fill primitive.
     * @returns {number[][]}
     */
    static #rectangleLoop(source) {
        const x1 = Number(source?.x1 ?? source?.left)
        const y1 = Number(source?.y1 ?? source?.top)
        const x2 = Number(source?.x2 ?? source?.right)
        const y2 = Number(source?.y2 ?? source?.bottom)
        if (![x1, y1, x2, y2].every(Number.isFinite)) {
            return []
        }

        const minX = Math.min(x1, x2)
        const maxX = Math.max(x1, x2)
        const minY = Math.min(y1, y2)
        const maxY = Math.max(y1, y2)
        if (maxX - minX <= 0 || maxY - minY <= 0) {
            return []
        }

        return [
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY]
        ]
    }

    /**
     * Resolves a finite point from paired fields.
     * @param {object} source Source object.
     * @param {string} xField X field.
     * @param {string} yField Y field.
     * @returns {number[] | null}
     */
    static #fieldPoint(source, xField, yField) {
        const point = [Number(source?.[xField]), Number(source?.[yField])]
        return point.every(Number.isFinite) ? point : null
    }

    /**
     * Checks whether one loop has enough non-collinear area.
     * @param {number[][]} loop Candidate loop.
     * @returns {boolean}
     */
    static #isValidLoop(loop) {
        return PcbAssemblyFillRingNormalizer.isValidLoop(loop)
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
