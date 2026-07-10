import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dCutoutCircleDetector } from '../src/PcbScene3dCutoutCircleDetector.mjs'

test('requires at least eight sampled points', () => {
    assert.equal(
        PcbScene3dCutoutCircleDetector.resolve(sampledEllipse(7, 0, 0, 5, 5)),
        null
    )
    assert.equal(
        PcbScene3dCutoutCircleDetector.resolve(sampledEllipse(8, 0, 0, 5, 5))
            ?.isCircular,
        true
    )
})

test('recognizes circles and rejects ellipses and non-finite samples', () => {
    const circle = PcbScene3dCutoutCircleDetector.resolve(
        sampledEllipse(32, 7, -3, 12, 12)
    )

    assert.deepEqual(
        circle,
        referenceResolve(sampledEllipse(32, 7, -3, 12, 12))
    )
    assert.equal(
        PcbScene3dCutoutCircleDetector.resolve(
            sampledEllipse(32, 7, -3, 12, 8)
        ),
        null
    )
    assert.equal(
        PcbScene3dCutoutCircleDetector.resolve([
            ...sampledEllipse(7, 0, 0, 5, 5),
            { x: Infinity, y: 0 }
        ]),
        null
    )
})

test('honors a custom absolute epsilon without changing default behavior', () => {
    const uneven = Array.from({ length: 8 }, (_value, index) => {
        const angle = (index / 8) * Math.PI * 2
        const radius = index % 2 === 0 ? 10 : 11

        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
    })

    assert.equal(PcbScene3dCutoutCircleDetector.resolve(uneven), null)
    assert.deepEqual(
        PcbScene3dCutoutCircleDetector.resolve(uneven, 0.6),
        referenceResolve(uneven, 0.6)
    )
})

test('matches the allocation-heavy reference for seeded sampled polygons', () => {
    const random = seededRandom(0x51a7c0de)

    for (let sampleIndex = 0; sampleIndex < 120; sampleIndex += 1) {
        const pointCount = 8 + Math.floor(random() * 72)
        const centerX = random() * 80 - 40
        const centerY = random() * 80 - 40
        const radiusX = 0.01 + random() * 25
        const radiusY =
            sampleIndex % 3 === 0 ? radiusX : radiusX * (0.5 + random() * 1.5)
        const points = sampledEllipse(
            pointCount,
            centerX,
            centerY,
            radiusX,
            radiusY
        )
        const epsilon = sampleIndex % 5 === 0 ? random() * 0.8 : undefined

        assert.deepEqual(
            PcbScene3dCutoutCircleDetector.resolve(points, epsilon),
            referenceResolve(points, epsilon)
        )
    }
})

test('matches sparse-array and inherited-index callback semantics', () => {
    const fullySparse = new Array(8)
    const partiallySparse = sampledEllipse(8, 2, -3, 5, 5)
    delete partiallySparse[3]
    const inheritedIndex = sampledEllipse(8, -4, 6, 9, 9)
    const inheritedPoint = inheritedIndex[5]
    const inheritedPrototype = Object.create(Array.prototype)
    inheritedPrototype[5] = inheritedPoint
    delete inheritedIndex[5]
    Object.setPrototypeOf(inheritedIndex, inheritedPrototype)

    for (const points of [fullySparse, partiallySparse, inheritedIndex]) {
        let actual
        assert.doesNotThrow(() => {
            actual = PcbScene3dCutoutCircleDetector.resolve(points)
        })
        assert.deepEqual(actual, referenceResolve(points))
    }
    assert.equal(referenceResolve(fullySparse), null)
    assert.equal(referenceResolve(partiallySparse)?.isCircular, true)
    assert.equal(referenceResolve(inheritedIndex)?.isCircular, true)
})

/**
 * Reproduces the pre-optimization allocation-heavy detector exactly.
 * @param {{ x: number, y: number }[]} points Sampled polygon points.
 * @param {number} [epsilon] Absolute tolerance.
 * @returns {{ isCircular: true, centerX: number, centerY: number, radius: number } | null}
 */
function referenceResolve(points, epsilon = 0.001) {
    if (!Array.isArray(points) || points.length < 8) {
        return null
    }

    const sum = points.reduce(
        (accumulator, point) => ({
            x: accumulator.x + Number(point.x || 0),
            y: accumulator.y + Number(point.y || 0)
        }),
        { x: 0, y: 0 }
    )
    const center = { x: sum.x / points.length, y: sum.y / points.length }
    const radii = points.map((point) =>
        Math.hypot(point.x - center.x, point.y - center.y)
    )
    const radius =
        radii.reduce((total, value) => total + value, 0) / radii.length
    const maxError = Math.max(...radii.map((value) => Math.abs(value - radius)))
    const tolerance = Math.max(Number(epsilon || 0), radius * 0.025)

    return !Number.isFinite(radius) ||
        radius <= Number(epsilon || 0) ||
        maxError > tolerance
        ? null
        : {
              isCircular: true,
              centerX: center.x,
              centerY: center.y,
              radius
          }
}

/**
 * Builds deterministic samples around one ellipse.
 * @param {number} pointCount Point count.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radiusX X radius.
 * @param {number} radiusY Y radius.
 * @returns {{ x: number, y: number }[]}
 */
function sampledEllipse(pointCount, centerX, centerY, radiusX, radiusY) {
    return Array.from({ length: pointCount }, (_value, index) => {
        const angle = (index / pointCount) * Math.PI * 2

        return {
            x: centerX + Math.cos(angle) * radiusX,
            y: centerY + Math.sin(angle) * radiusY
        }
    })
}

/**
 * Creates one deterministic pseudo-random number source.
 * @param {number} seed Initial unsigned state.
 * @returns {() => number}
 */
function seededRandom(seed) {
    let state = seed >>> 0

    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 0x100000000
    }
}
