import * as THREE from 'three'
import { PcbScene3dCopperFillAreaClipper } from '../src/PcbScene3dCopperFillAreaClipper.mjs'
import { PcbScene3dCutoutGeometryFilter } from '../src/PcbScene3dCutoutGeometryFilter.mjs'
import { PcbScene3dDrillCutoutFilter } from '../src/PcbScene3dDrillCutoutFilter.mjs'

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
const drillCutouts = Array.from({ length: 200 }, (_, index) =>
    buildLoop(32, 1.5, -57 + (index % 20) * 6, -27 + Math.floor(index / 20) * 6)
)
const cutoutPositions = buildTriangleGrid(20, 6, 6, -60, -30)
const smallCutouts = [
    buildLoop(4, 1.5, -33, -15),
    buildLoop(4, 1.5, 33, -15),
    buildLoop(4, 1.5, -33, -3),
    buildLoop(4, 1.5, 33, -3)
]
const cutoutOptions = {
    maxDepth: 12,
    maxEdgeLength: 2,
    discardTerminalOverlaps: true
}

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
const cutoutGeometry = measure(() =>
    PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        buildGeometry(cutoutPositions),
        drillCutouts,
        cutoutOptions
    )
)
const smallGeometry = measure(() =>
    PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        buildGeometry(cutoutPositions),
        smallCutouts,
        cutoutOptions
    )
)

const results = {
    copperFillMs: copperFill.milliseconds,
    drillCutoutMs: drillCutout.milliseconds,
    cutoutGeometryMs: cutoutGeometry.milliseconds,
    smallGeometryMs: smallGeometry.milliseconds,
    copperPositionCount: positionCount(copperFill.result),
    drillCutoutCount: drillCutout.result.length,
    cutoutPositionCount: positionCount(cutoutGeometry.result),
    smallPositionCount: positionCount(smallGeometry.result)
}

console.log(JSON.stringify(results))
