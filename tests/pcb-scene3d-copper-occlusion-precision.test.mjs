import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCopperOcclusionClipper } from '../src/PcbScene3dCopperOcclusionClipper.mjs'

/** Builds packed triangle geometry. */
function geometry(values) {
    return new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(values, 3)
    )
}

/** Builds a rectangular occlusion. */
function rectangle(x1, y1, x2, y2) {
    return [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 }
    ]
}

/** Measures actual three-dimensional triangle area. */
function area(mesh) {
    const a = mesh.getAttribute('position').array
    let result = 0
    for (let i = 0; i < a.length; i += 9) {
        const ux = a[i + 3] - a[i],
            uy = a[i + 4] - a[i + 1],
            uz = a[i + 5] - a[i + 2]
        const vx = a[i + 6] - a[i],
            vy = a[i + 7] - a[i + 1],
            vz = a[i + 8] - a[i + 2]
        result +=
            Math.hypot(
                uy * vz - uz * vy,
                uz * vx - ux * vz,
                ux * vy - uy * vx
            ) / 2
    }
    return result
}

/** Builds a square surface from two triangles. */
function square(size = 100) {
    return geometry([
        0,
        0,
        3,
        size,
        0,
        3,
        size,
        size,
        3,
        0,
        0,
        3,
        size,
        size,
        3,
        0,
        size,
        3
    ])
}

test('copper occlusion preserves exposed area without recursively expanding the mesh', () => {
    const clipped = PcbScene3dCopperOcclusionClipper.filter(THREE, square(), [
        rectangle(20, 20, 80, 80)
    ])
    assert.ok(
        Math.abs(area(clipped) - 6400) < 0.01,
        'Only the covered 60 by 60 area should be removed'
    )
    assert.ok(
        clipped.getAttribute('position').count <= 60,
        'A rectangular opening needs only boundary triangles'
    )
})

test('copper occlusion interpolates vertical walls and sloped triangle heights', () => {
    const wall = geometry([
        0, 0, 0, 100, 0, 0, 100, 0, 10, 0, 0, 0, 100, 0, 10, 0, 0, 10
    ])
    const clipped = PcbScene3dCopperOcclusionClipper.filter(THREE, wall, [
        rectangle(20, -10, 80, 10)
    ])
    assert.ok(Math.abs(area(clipped) - 400) < 0.001)
    const slope = geometry([0, 0, 0, 100, 0, 100, 0, 100, 200])
    const result = PcbScene3dCopperOcclusionClipper.filter(THREE, slope, [
        rectangle(20, 20, 80, 80)
    ])
    const a = result.getAttribute('position').array
    for (let i = 0; i < a.length; i += 3)
        assert.ok(Math.abs(a[i + 2] - a[i] - 2 * a[i + 1]) < 0.001)
})

test('copper occlusion handles concave overlapping and reversed polygons without overcutting', () => {
    const lShape = [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
        { x: 80, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 80 },
        { x: 20, y: 80 }
    ]
    const overlap = rectangle(30, 30, 50, 50)
    for (const cutouts of [
        [lShape, overlap],
        [overlap.reverse(), [...lShape].reverse()]
    ]) {
        const clipped = PcbScene3dCopperOcclusionClipper.filter(
            THREE,
            square(),
            cutouts
        )
        assert.ok(Math.abs(area(clipped) - 7900) < 0.01)
    }
})

test('copper occlusion keeps untouched geometry and removes fully covered geometry', () => {
    const input = square()
    assert.equal(
        PcbScene3dCopperOcclusionClipper.filter(THREE, input, [
            rectangle(200, 200, 300, 300)
        ]),
        input
    )
    assert.equal(
        PcbScene3dCopperOcclusionClipper.filter(THREE, input, [
            rectangle(-1, -1, 101, 101)
        ]),
        null
    )
})

test('copper occlusion keeps touching vertical boundaries free of duplicate faces', () => {
    const wall = geometry([
        0, 0, 0, 100, 0, 0, 100, 0, 10, 0, 0, 0, 100, 0, 10, 0, 0, 10
    ])
    const clipped = PcbScene3dCopperOcclusionClipper.filter(THREE, wall, [
        rectangle(20, 0, 80, 10)
    ])
    assert.ok(Math.abs(area(clipped) - 400) < 0.001)
})

test('copper occlusion preserves indexed input and triangle winding', () => {
    const input = geometry([0, 0, 3, 100, 0, 3, 100, 100, 3, 0, 100, 3])
    input.setIndex([0, 1, 2, 0, 2, 3])
    const original = Array.from(input.getAttribute('position').array)
    const clipped = PcbScene3dCopperOcclusionClipper.filter(THREE, input, [
        rectangle(20, 20, 80, 80)
    ])
    assert.deepEqual(Array.from(input.getAttribute('position').array), original)
    assert.equal(input.index.count, 6)
    assert.ok(Math.abs(area(clipped) - 6400) < 0.01)
    const normals = clipped.getAttribute('normal').array
    for (let i = 2; i < normals.length; i += 3) assert.ok(normals[i] >= 0)
})

test('copper occlusion scales with opening boundaries across large coordinate spans', () => {
    for (const size of [10, 100, 10000]) {
        const holes = []
        for (let row = 0; row < 4; row += 1) {
            for (let column = 0; column < 4; column += 1) {
                const x = ((column + 0.25) * size) / 4
                const y = ((row + 0.25) * size) / 4
                holes.push(rectangle(x, y, x + size / 8, y + size / 8))
            }
        }
        const clipped = PcbScene3dCopperOcclusionClipper.filter(
            THREE,
            square(size),
            holes
        )
        assert.ok(
            Math.abs(area(clipped) - size * size * 0.75) <
                size * size * 0.000001
        )
        assert.ok(clipped.getAttribute('position').count < 1500)
    }
})
