import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbAssemblyFillGeometryResolver } from '../src/PcbAssemblyFillGeometryResolver.mjs'

/** Builds a rounded rectangle from explicit arc centers and endpoints. */
function roundedContour() {
    return [
        {
            type: 'arc',
            x: 10,
            y: 10,
            x1: 0,
            y1: 10,
            x2: 10,
            y2: 0,
            startAngle: 180,
            endAngle: 270,
            sweepAngle: 90,
            radius: 10
        },
        { type: 'line', x1: 10, y1: 0, x2: 90, y2: 0 },
        {
            type: 'arc',
            x: 90,
            y: 10,
            x1: 90,
            y1: 0,
            x2: 100,
            y2: 10,
            startAngle: 270,
            endAngle: 0,
            sweepAngle: 90,
            radius: 10
        },
        { type: 'line', x1: 100, y1: 10, x2: 100, y2: 70 },
        {
            type: 'arc',
            x: 90,
            y: 70,
            x1: 100,
            y1: 70,
            x2: 90,
            y2: 80,
            startAngle: 0,
            endAngle: 90,
            sweepAngle: 90,
            radius: 10
        },
        { type: 'line', x1: 90, y1: 80, x2: 10, y2: 80 },
        {
            type: 'arc',
            x: 10,
            y: 70,
            x1: 10,
            y1: 80,
            x2: 0,
            y2: 70,
            startAngle: 90,
            endAngle: 180,
            sweepAngle: 90,
            radius: 10
        },
        { type: 'line', x1: 0, y1: 70, x2: 0, y2: 10 }
    ]
}

for (const typed of [true, false]) {
    test(`fill contours sample arc boundaries instead of their centers (typed: ${typed})`, () => {
        const contour = roundedContour().map(({ type, ...segment }) =>
            typed ? { type, ...segment } : segment
        )
        const source = { contours: [contour] }
        const before = structuredClone(source)
        const { outer } = PcbAssemblyFillGeometryResolver.resolve(source)
        assert.deepEqual(
            [
                Math.min(...outer.map((p) => p[0])),
                Math.min(...outer.map((p) => p[1])),
                Math.max(...outer.map((p) => p[0])),
                Math.max(...outer.map((p) => p[1]))
            ],
            [0, 0, 100, 80]
        )
        const area =
            Math.abs(
                outer.reduce((sum, p, i) => {
                    const next = outer[(i + 1) % outer.length]
                    return sum + p[0] * next[1] - next[0] * p[1]
                }, 0)
            ) / 2
        const expected = 100 * 80 - (4 - Math.PI) * 10 ** 2
        assert.ok(
            Math.abs(area - expected) / expected < 0.001,
            `rounded area ${area} differs from ${expected}`
        )
        assert.deepEqual(source, before)
    })
}
