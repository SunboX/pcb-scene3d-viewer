import * as THREE from 'three'
import { PcbScene3dCopperFillAreaClipper } from '../src/PcbScene3dCopperFillAreaClipper.mjs'
import { PcbScene3dCutoutGeometryFilter } from '../src/PcbScene3dCutoutGeometryFilter.mjs'
import { PcbScene3dDrillCutoutFilter } from '../src/PcbScene3dDrillCutoutFilter.mjs'
import { PcbScene3dPreparedPolygon } from '../src/PcbScene3dPreparedPolygon.mjs'

/**
 * Builds one sampled circular loop.
 * @param {number} pointCount Number of loop points.
 * @param {number} radius Loop radius.
 * @param {number} [offsetX] Center X coordinate.
 * @param {number} [offsetY] Center Y coordinate.
 * @returns {{ x: number, y: number }[]}
 */
function buildLoop(pointCount, radius, offsetX = 0, offsetY = 0) {
    return Array.from({ length: pointCount }, (_, index) => {
        const angle = (index / pointCount) * Math.PI * 2
        return {
            x: offsetX + Math.cos(angle) * radius,
            y: offsetY + Math.sin(angle) * radius
        }
    })
}

/**
 * Resolves a square-biased, non-circular boundary radius at one angle.
 * @param {number} angle Polar angle in radians.
 * @param {number} radius Base boundary radius.
 * @returns {number}
 */
function irregularBoundaryRadius(angle, radius) {
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const squareRadius =
        radius / Math.max(Math.abs(cosine), Math.abs(sine), 0.001)
    const ripple = 1 + Math.sin(angle * 5) * 0.08 + Math.sin(angle * 11) * 0.04

    return squareRadius * ripple
}

/**
 * Builds one dense square-biased irregular polygon.
 * @param {number} pointCount Number of boundary points.
 * @param {number} radius Base boundary radius.
 * @returns {{ x: number, y: number }[]}
 */
function buildDenseBoundary(pointCount, radius) {
    return Array.from({ length: pointCount }, (_, index) => {
        const angle = (index / pointCount) * Math.PI * 2
        const distance = irregularBoundaryRadius(angle, radius)

        return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance
        }
    })
}

/**
 * Builds a deterministic non-circular boundary for repeated segment queries.
 * @param {number} pointCount Number of boundary points.
 * @param {number} radius Base boundary radius.
 * @returns {{ x: number, y: number }[]}
 */
function buildRepeatedQueryBoundary(pointCount, radius) {
    return Array.from({ length: pointCount }, (_, index) => {
        const angle = (index / pointCount) * Math.PI * 2
        const distance = radius + Math.sin(angle * 3) * 1.25

        return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance
        }
    })
}

/**
 * Builds a deterministic grid of localized AABB queries.
 * @param {number} minimum Minimum query-center coordinate.
 * @param {number} maximum Maximum query-center coordinate.
 * @param {number} step Distance between query centers.
 * @param {number} halfExtent Query half width and height.
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }[]}
 */
function buildQueryGrid(minimum, maximum, step, halfExtent) {
    const queries = []

    for (let y = minimum; y <= maximum; y += step) {
        for (let x = minimum; x <= maximum; x += step) {
            queries.push({
                minX: x - halfExtent,
                maxX: x + halfExtent,
                minY: y - halfExtent,
                maxY: y + halfExtent
            })
        }
    }

    return queries
}

/**
 * Resolves the middle value from an odd-sized sample.
 * @param {number[]} values Measurement samples.
 * @returns {number}
 */
function median(values) {
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.floor(sorted.length / 2)]
}

/**
 * Measures one warmed operation and returns its median duration.
 * @template Result
 * @param {() => Result} operation Operation to measure.
 * @param {number} [iterations] Measured iteration count.
 * @returns {{ milliseconds: number, result: Result }}
 */
function measure(operation, iterations = 5) {
    operation()
    const elapsed = []
    let result
    for (let index = 0; index < iterations; index += 1) {
        const startedAt = performance.now()
        result = operation()
        elapsed.push(performance.now() - startedAt)
    }
    return { milliseconds: median(elapsed), result }
}

/**
 * Builds a flat grid containing two triangles per cell.
 * @param {number} columns Grid column count.
 * @param {number} rows Grid row count.
 * @param {number} cellSize Cell width and height.
 * @param {number} offsetX Grid minimum X coordinate.
 * @param {number} offsetY Grid minimum Y coordinate.
 * @returns {number[]}
 */
function buildTriangleGrid(columns, rows, cellSize, offsetX, offsetY) {
    const positions = []

    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const minX = offsetX + column * cellSize
            const minY = offsetY + row * cellSize
            const maxX = minX + cellSize
            const maxY = minY + cellSize

            positions.push(
                minX,
                minY,
                0,
                maxX,
                minY,
                0,
                minX,
                maxY,
                0,
                maxX,
                minY,
                0,
                maxX,
                maxY,
                0,
                minX,
                maxY,
                0
            )
        }
    }

    return positions
}

/**
 * Builds one point from radial distance and tangent offset.
 * @param {number} angle Polar angle in radians.
 * @param {number} distance Radial distance from the origin.
 * @param {number} tangentOffset Signed tangent offset.
 * @returns {{ x: number, y: number }}
 */
function buildRadialPoint(angle, distance, tangentOffset) {
    const radialX = Math.cos(angle)
    const radialY = Math.sin(angle)

    return {
        x: radialX * distance - radialY * tangentOffset,
        y: radialY * distance + radialX * tangentOffset
    }
}

/**
 * Appends one triangle to a packed XYZ position buffer.
 * @param {number[]} positions Target position buffer.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {void}
 */
function appendTriangle(positions, triangle) {
    for (const point of triangle) {
        positions.push(point.x, point.y, 0)
    }
}

/**
 * Builds equal sets of interior, crossing, and exterior boundary triangles.
 * @param {number} triangleCount Total triangle count.
 * @param {number} radius Base boundary radius.
 * @returns {number[]}
 */
function buildBoundaryTriangles(triangleCount, radius) {
    const positions = []
    const groupCount = triangleCount / 3

    for (let index = 0; index < groupCount; index += 1) {
        const angle = ((index + 0.5) / groupCount) * Math.PI * 2
        const boundaryRadius = irregularBoundaryRadius(angle, radius)

        // Interior, crossing, and exterior cases drive the exact point,
        // boundary-vertex, and segment paths while retaining exterior output.
        appendTriangle(positions, [
            buildRadialPoint(angle, boundaryRadius - 12, -2),
            buildRadialPoint(angle, boundaryRadius - 9, 2),
            buildRadialPoint(angle, boundaryRadius - 15, 2)
        ])
        appendTriangle(positions, [
            buildRadialPoint(angle, boundaryRadius - 5, -3),
            buildRadialPoint(angle, boundaryRadius + 5, 0),
            buildRadialPoint(angle, boundaryRadius - 5, 3)
        ])
        appendTriangle(positions, [
            buildRadialPoint(angle, boundaryRadius + 9, -2),
            buildRadialPoint(angle, boundaryRadius + 15, 0),
            buildRadialPoint(angle, boundaryRadius + 9, 2)
        ])
    }

    return positions
}

/**
 * Builds one mutable Three.js geometry from reusable source positions.
 * @param {number[]} positions Packed XYZ positions.
 * @returns {THREE.BufferGeometry}
 */
function buildGeometry(positions) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
    )
    return geometry
}

/**
 * Builds one mutable Three.js mesh from reusable source positions.
 * @param {number[]} positions Packed XYZ positions.
 * @returns {THREE.Mesh}
 */
function buildMesh(positions) {
    return new THREE.Mesh(buildGeometry(positions))
}

/**
 * Returns a geometry position count from a mesh or geometry result.
 * @param {THREE.Mesh | THREE.BufferGeometry | null | undefined} result Result.
 * @returns {number}
 */
function positionCount(result) {
    const geometry = result?.geometry || result
    return Number(geometry?.getAttribute?.('position')?.count || 0)
}

const copperPositions = buildTriangleGrid(20, 20, 12, -120, -120)
const copperFills = [{ layerId: 1, points: buildLoop(10000, 100) }]
const denseBoundary = buildDenseBoundary(10000, 100)
const drillCutouts = [
    denseBoundary,
    ...Array.from({ length: 199 }, (_, index) =>
        buildLoop(
            4,
            1.5,
            -42 + (index % 20) * 4.5,
            -20 + Math.floor(index / 20) * 4.5
        )
    )
]
const ordinaryDrillCutouts = Array.from({ length: 200 }, (_, index) =>
    buildLoop(32, 1.5, -57 + (index % 20) * 6, -27 + Math.floor(index / 20) * 6)
)
const cutoutPositions = buildBoundaryTriangles(240, 100)
const ordinaryCutoutPositions = buildTriangleGrid(20, 6, 6, -60, -30)
const smallPositions = buildTriangleGrid(20, 6, 6, -60, -30)
const smallCutouts = [
    buildLoop(4, 1.5, -33, -15),
    buildLoop(4, 1.5, 33, -15),
    buildLoop(4, 1.5, -33, -3),
    buildLoop(4, 1.5, 33, -3)
]
const cutoutOptions = {
    maxDepth: 0,
    maxEdgeLength: 2,
    discardTerminalOverlaps: true
}
const smallCutoutOptions = {
    maxDepth: 12,
    maxEdgeLength: 2,
    discardTerminalOverlaps: true
}
const repeatedQueryBoundary = buildRepeatedQueryBoundary(32, 10)
const repeatedSegmentQueries = buildQueryGrid(-12, 12, 2, 0.4)

const copperFill = measure(() =>
    PcbScene3dCopperFillAreaClipper.filter(
        THREE,
        buildMesh(copperPositions),
        copperFills,
        (x, y) => ({ x, y }),
        false,
        { subdividePartialTriangles: false }
    )
)
const drillCutout = measure(() =>
    PcbScene3dDrillCutoutFilter.removeNestedCutouts(drillCutouts)
)
const ordinaryDrillCutout = measure(() =>
    PcbScene3dDrillCutoutFilter.removeNestedCutouts(ordinaryDrillCutouts)
)
const cutoutGeometry = measure(() =>
    PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        buildGeometry(cutoutPositions),
        [denseBoundary],
        cutoutOptions
    )
)
const ordinaryCutoutGeometry = measure(() =>
    PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        buildGeometry(ordinaryCutoutPositions),
        ordinaryDrillCutouts,
        smallCutoutOptions
    )
)
const smallGeometry = measure(() =>
    PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        buildGeometry(smallPositions),
        smallCutouts,
        smallCutoutOptions
    )
)
const repeatedSegmentQuery = measure(() => {
    const polygon = new PcbScene3dPreparedPolygon(repeatedQueryBoundary, {
        detectCircle: false
    })
    let candidateCount = 0

    for (let repeat = 0; repeat < 200; repeat += 1) {
        for (const query of repeatedSegmentQueries) {
            candidateCount += polygon.querySegments(query, []).length
        }
    }

    return candidateCount
})

const results = {
    copperFillMs: copperFill.milliseconds,
    drillCutoutMs: drillCutout.milliseconds,
    ordinaryDrillCutoutMs: ordinaryDrillCutout.milliseconds,
    cutoutGeometryMs: cutoutGeometry.milliseconds,
    ordinaryCutoutGeometryMs: ordinaryCutoutGeometry.milliseconds,
    smallGeometryMs: smallGeometry.milliseconds,
    repeatedSegmentQueryMs: repeatedSegmentQuery.milliseconds,
    copperPositionCount: positionCount(copperFill.result),
    drillCutoutCount: drillCutout.result.length,
    ordinaryDrillCutoutCount: ordinaryDrillCutout.result.length,
    cutoutPositionCount: positionCount(cutoutGeometry.result),
    ordinaryCutoutPositionCount: positionCount(ordinaryCutoutGeometry.result),
    smallPositionCount: positionCount(smallGeometry.result),
    repeatedSegmentCandidateCount: repeatedSegmentQuery.result
}

console.log(JSON.stringify(results))
