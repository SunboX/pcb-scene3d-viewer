import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dTriangleVertexQueryBounds } from '../src/PcbScene3dTriangleVertexQueryBounds.mjs'

const EPSILON = 0.001

/**
 * Resolves the legacy point-first signed area.
 * @param {{ x: number, y: number }} point Query point.
 * @param {{ x: number, y: number }} start Edge start.
 * @param {{ x: number, y: number }} end Edge end.
 * @returns {number}
 */
function pointFirstCross(point, start, end) {
    return (
        (start.x - point.x) * (end.y - point.y) -
        (start.y - point.y) * (end.x - point.x)
    )
}

/**
 * Returns whether the legacy tolerant predicate accepts one point.
 * @param {{ x: number, y: number }} point Query point.
 * @param {{ x: number, y: number }[]} triangle Triangle vertices.
 * @returns {boolean}
 */
function acceptsPoint(point, triangle) {
    const signs = triangle.map((start, index) =>
        pointFirstCross(point, start, triangle[(index + 1) % triangle.length])
    )

    return !(
        signs.some((sign) => sign < -EPSILON) &&
        signs.some((sign) => sign > EPSILON)
    )
}

/**
 * Resolves finite bounds for one point list.
 * @param {{ x: number, y: number }[]} points Points to inspect.
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
function resolveBounds(points) {
    return {
        minX: Math.min(...points.map((point) => point.x)),
        maxX: Math.max(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxY: Math.max(...points.map((point) => point.y))
    }
}

/**
 * Returns true when one point lies inside finite query bounds.
 * @param {{ x: number, y: number }} point Query point.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Bounds to inspect.
 * @returns {boolean}
 */
function boundsContainPoint(point, bounds) {
    return (
        point.x >= bounds.minX &&
        point.x <= bounds.maxX &&
        point.y >= bounds.minY &&
        point.y <= bounds.maxY
    )
}

/**
 * Creates one deterministic xorshift random source.
 * @param {number} seed Initial unsigned state.
 * @returns {() => number}
 */
function createRandom(seed) {
    let state = seed >>> 0

    return () => {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        return (state >>> 0) / 0x100000000
    }
}

test('falls back for point-first determinants dominated by roundoff', () => {
    const triangle = [
        { x: -5.901132453800528e-7, y: 4.299122053907922e-7 },
        { x: -5.900902806388331e-7, y: 4.298857447793125e-7 },
        { x: -5.901561053178739e-7, y: 4.2992456883439445e-7 }
    ]
    const cutout = [
        { x: -30_000_000, y: 300_000_000 },
        { x: 30_000_000, y: 270_000_000 },
        { x: 300_000_000, y: -30_000_000 }
    ]

    assert.equal(
        PcbScene3dTriangleVertexQueryBounds.resolve(
            triangle,
            resolveBounds(triangle),
            resolveBounds(cutout),
            EPSILON
        ),
        null
    )
})

test('expands finite envelopes for sub-epsilon determinant error', () => {
    const height = Math.fround(1e-16)
    const triangle = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: height }
    ]
    const triangleBounds = resolveBounds(triangle)

    for (const multiplier of [1, 4, 8]) {
        const excess = multiplier * Number.EPSILON * 1_000_000
        const tolerance = EPSILON + excess
        const point = {
            x: (-2 * tolerance) / height,
            y: -tolerance
        }
        const cutout = [
            point,
            { x: 30_000_000_000_000, y: 0.0005 },
            { x: 30_000_000_000_000, y: 0.0008 }
        ]
        const bounds = PcbScene3dTriangleVertexQueryBounds.resolve(
            triangle,
            triangleBounds,
            resolveBounds(cutout),
            EPSILON
        )

        assert.ok(bounds)
        assert.equal(acceptsPoint(point, triangle), true)
        assert.equal(boundsContainPoint(point, bounds), true)
    }
})

test('keeps seeded tolerant vertices inside every finite envelope', () => {
    const random = createRandom(0x9e3779b9)
    let acceptedCount = 0
    let indexedCount = 0

    for (let index = 0; index < 2048; index += 1) {
        const width = 10 ** (-8 + random() * 12)
        const height = 10 ** (-8 + random() * 12)
        const originScale = 10 ** (-4 + random() * 12)
        const originX = (random() - 0.5) * originScale
        const originY = (random() - 0.5) * originScale
        const triangle = [
            { x: Math.fround(originX), y: Math.fround(originY) },
            {
                x: Math.fround(originX + width),
                y: Math.fround(originY + (random() - 0.5) * height * 0.3)
            },
            {
                x: Math.fround(originX + (random() * 0.8 + 0.1) * width),
                y: Math.fround(originY + height)
            }
        ]
        const doubledArea = Math.abs(
            pointFirstCross(triangle[0], triangle[1], triangle[2])
        )
        if (!Number.isFinite(doubledArea) || doubledArea === 0) continue

        const firstWeight = (-random() * 1.05 * EPSILON) / doubledArea
        const secondWeight = (-random() * 1.05 * EPSILON) / doubledArea
        const thirdWeight = 1 - firstWeight - secondWeight
        const point = {
            x:
                firstWeight * triangle[0].x +
                secondWeight * triangle[1].x +
                thirdWeight * triangle[2].x,
            y:
                firstWeight * triangle[0].y +
                secondWeight * triangle[1].y +
                thirdWeight * triangle[2].y
        }
        if (
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            !acceptsPoint(point, triangle)
        ) {
            continue
        }

        acceptedCount += 1
        const queryBounds = PcbScene3dTriangleVertexQueryBounds.resolve(
            triangle,
            resolveBounds(triangle),
            resolveBounds([point]),
            EPSILON
        )
        if (!queryBounds) continue

        indexedCount += 1
        assert.equal(boundsContainPoint(point, queryBounds), true)
    }

    assert.ok(acceptedCount > 1000)
    assert.ok(indexedCount > 1000)
})
