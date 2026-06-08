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

    const start = performance.now()
    const filtered = PcbScene3dCutoutGeometryFilter.filter(
        THREE,
        geometry,
        cutouts
    )
    const elapsed = performance.now() - start

    assert.equal(filtered, geometry)
    assert.ok(elapsed < 800, `filtering took ${elapsed.toFixed(1)}ms`)
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

    assert.equal(filtered.getAttribute('position').count, 197082)
    assert.ok(elapsed < 380, `dense clipping took ${elapsed.toFixed(1)}ms`)
})

/**
 * Builds parallel stroke-strip triangles crossing one local cutout.
 * @returns {any}
 */
function createDenseStrokeStripGeometry() {
    const positions = []

    for (let row = 0; row < 120; row += 1) {
        for (let column = 0; column < 20; column += 1) {
            const y = -20 + row * (40 / 120)
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
