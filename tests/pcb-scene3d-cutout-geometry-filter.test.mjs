import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCutoutGeometryFilter } from '../src/PcbScene3dCutoutGeometryFilter.mjs'

test('PcbScene3dCutoutGeometryFilter indexes sparse cutouts without quadratic scan', () => {
    const positions = []
    const cutouts = []

    for (let index = 0; index < 12000; index += 1) {
        const x = index * 10
        positions.push(x, 0, 0, x + 1, 0, 0, x, 1, 0)
        cutouts.push(createSquareCutout(x + 5, 5))
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
    )

    let mapReadCount = 0
    const originalMapGet = Map.prototype.get
    const start = performance.now()
    let filtered = null

    try {
        Map.prototype.get = function countMapGet(key) {
            mapReadCount += 1
            return originalMapGet.call(this, key)
        }
        filtered = PcbScene3dCutoutGeometryFilter.filter(
            THREE,
            geometry,
            cutouts
        )
    } finally {
        Map.prototype.get = originalMapGet
    }

    assert.equal(filtered, geometry)
    assert.equal(mapReadCount, 0)
    assert.ok(performance.now() - start < 800)
})

test('PcbScene3dCutoutGeometryFilter honors zero max depth', () => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([-20, -20, 0, 20, -20, 0, 0, 20, 0], 3)
    )

    const filtered = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        [createSquareCutout(0, 0)],
        { maxDepth: 0, maxEdgeLength: 0.1 }
    )

    assert.equal(filtered.getAttribute('position').count, 0)
})

test('PcbScene3dCutoutGeometryFilter clips dense local stroke strips without repeated boundary scans', () => {
    const geometry = createDenseStrokeStripGeometry()
    const start = performance.now()
    const filtered = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        [createCircularCutout(0, 0, 8)],
        { maxDepth: 6, maxEdgeLength: 4 }
    )
    const elapsed = performance.now() - start

    assert.ok(filtered.getAttribute('position').count < 350000)
    assert.equal(geometryContainsPointTriangle(filtered, { x: 0, y: 0 }), false)
    assert.ok(elapsed < 140, `dense clipping took ${elapsed.toFixed(1)}ms`)
})

test('PcbScene3dCutoutGeometryFilter keeps long crossing strokes responsive', () => {
    const geometry = createDenseStrokeStripGeometry({
        columns: 40,
        rows: 240
    })
    const start = performance.now()
    const filtered = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        [createCircularCutout(0, 0, 8)],
        { maxDepth: 6, maxEdgeLength: 4 }
    )
    const elapsed = performance.now() - start

    assert.ok(filtered.getAttribute('position').count < 1300000)
    assert.equal(geometryContainsPointTriangle(filtered, { x: 0, y: 0 }), false)
    assert.ok(
        elapsed < 470,
        `long crossing stroke clipping took ${elapsed.toFixed(1)}ms`
    )
})

test('PcbScene3dCutoutGeometryFilter clips repeated circular drills analytically', () => {
    const geometry = createDenseStrokeStripGeometry({
        columns: 30,
        rows: 160
    })
    const cutouts = [
        createCircularCutout(-12, -8, 8),
        createCircularCutout(12, -8, 8),
        createCircularCutout(-12, 8, 8),
        createCircularCutout(12, 8, 8)
    ]
    const start = performance.now()
    const filtered = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        cutouts,
        { maxDepth: 6, maxEdgeLength: 4 }
    )
    const elapsed = performance.now() - start

    assert.equal(
        geometryContainsPointTriangle(filtered, { x: -12, y: -8 }),
        false
    )
    assert.equal(
        geometryContainsPointTriangle(filtered, { x: 12, y: 8 }),
        false
    )
    assert.ok(
        elapsed < 320,
        `circular drill clipping took ${elapsed.toFixed(1)}ms`
    )
})

/**
 * Builds parallel stroke-strip triangles crossing one local cutout.
 * @param {{ columns?: number, rows?: number }} [options] Geometry options.
 * @returns {any}
 */
function createDenseStrokeStripGeometry(options = {}) {
    const columns = Number(options?.columns || 20)
    const rows = Number(options?.rows || 120)
    const positions = []

    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            const y = -20 + row * (40 / rows)
            const x = -30 + column * 0.05
            const halfHeight = 0.12

            positions.push(
                x,
                y - halfHeight,
                0,
                x + 60,
                y - halfHeight,
                0,
                x,
                y + halfHeight,
                0,
                x + 60,
                y - halfHeight,
                0,
                x + 60,
                y + halfHeight,
                0,
                x,
                y + halfHeight,
                0
            )
        }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
    )
    return geometry
}

/**
 * Returns true when one geometry has a triangle covering a local XY point.
 * @param {any} geometry Geometry to inspect.
 * @param {{ x: number, y: number }} point Local XY point.
 * @returns {boolean}
 */
function geometryContainsPointTriangle(geometry, point) {
    const position = geometry.getAttribute('position')

    for (let index = 0; index < position.count; index += 3) {
        const triangle = [0, 1, 2].map((offset) => ({
            x: position.getX(index + offset),
            y: position.getY(index + offset)
        }))

        if (pointInsideTriangle(point, triangle)) {
            return true
        }
    }

    return false
}

/**
 * Returns true when a point is inside one triangle.
 * @param {{ x: number, y: number }} point Point to test.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {boolean}
 */
function pointInsideTriangle(point, triangle) {
    const signs = triangle.map((current, index) => {
        const next = triangle[(index + 1) % triangle.length]
        return (
            (point.x - next.x) * (current.y - next.y) -
            (current.x - next.x) * (point.y - next.y)
        )
    })

    return signs.every((sign) => sign >= 0) || signs.every((sign) => sign <= 0)
}

/**
 * Builds one circular drill cutout polygon.
 * @param {number} centerX Center x.
 * @param {number} centerY Center y.
 * @param {number} radius Radius.
 * @returns {{ x: number, y: number }[]}
 */
function createCircularCutout(centerX, centerY, radius) {
    return Array.from({ length: 64 }, (_value, index) => {
        const angle = (index / 64) * Math.PI * 2

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

/**
 * Builds one square drill cutout polygon.
 * @param {number} centerX Center x.
 * @param {number} centerY Center y.
 * @returns {{ x: number, y: number }[]}
 */
function createSquareCutout(centerX, centerY) {
    return [
        { x: centerX - 1, y: centerY - 1 },
        { x: centerX + 1, y: centerY - 1 },
        { x: centerX + 1, y: centerY + 1 },
        { x: centerX - 1, y: centerY + 1 }
    ]
}
