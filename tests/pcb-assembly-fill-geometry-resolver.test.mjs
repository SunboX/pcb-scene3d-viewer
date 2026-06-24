import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbAssemblyFillGeometryResolver } from '../src/PcbAssemblyFillGeometryResolver.mjs'

/**
 * Computes signed polygon area.
 * @param {number[][]} loop Candidate loop.
 * @returns {number}
 */
function signedArea(loop) {
    let area = 0
    for (let index = 0; index < loop.length; index += 1) {
        const current = loop[index]
        const next = loop[(index + 1) % loop.length]
        area += current[0] * next[1] - next[0] * current[1]
    }
    return area / 2
}

test('PcbAssemblyFillGeometryResolver removes duplicate closure points', () => {
    const loops = PcbAssemblyFillGeometryResolver.resolve({
        points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 0, y: 0 }
        ]
    })

    assert.deepEqual(loops.outer, [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
    ])
})

test('PcbAssemblyFillGeometryResolver ignores degenerate fill holes', () => {
    const loops = PcbAssemblyFillGeometryResolver.resolve({
        points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 }
        ],
        holes: [
            [
                { x: 10, y: 10 },
                { x: 20, y: 20 },
                { x: 30, y: 30 }
            ],
            [
                { x: 40, y: 40 },
                { x: 60, y: 40 },
                { x: 60, y: 60 },
                { x: 40, y: 60 }
            ]
        ]
    })

    assert.deepEqual(loops.holes, [
        [
            [40, 40],
            [60, 40],
            [60, 60],
            [40, 60]
        ]
    ])
})

test('PcbAssemblyFillGeometryResolver normalizes B-Rep ring winding', () => {
    const loops = PcbAssemblyFillGeometryResolver.resolve({
        brep_shape: {
            outer_ring: {
                vertices: [
                    { x: 0, y: 0 },
                    { x: 0, y: 100 },
                    { x: 100, y: 100 },
                    { x: 100, y: 0 },
                    { x: 0, y: 0 }
                ]
            },
            inner_rings: [
                {
                    vertices: [
                        { x: 40, y: 40 },
                        { x: 60, y: 40 },
                        { x: 60, y: 60 },
                        { x: 40, y: 60 },
                        { x: 40, y: 40 }
                    ]
                }
            ]
        }
    })

    assert.equal(loops.outer.length, 4)
    assert.equal(loops.holes[0].length, 4)
    assert.equal(signedArea(loops.outer) > 0, true)
    assert.equal(signedArea(loops.holes[0]) < 0, true)
})

test('PcbAssemblyFillGeometryResolver reports dropped saved-fill rings', () => {
    assert.equal(typeof PcbAssemblyFillGeometryResolver.inspect, 'function')

    const report = PcbAssemblyFillGeometryResolver.inspect({
        brep_shapes: [
            {
                outer_ring: {
                    vertices: [
                        { x: 0, y: 0 },
                        { x: 0, y: 0 },
                        { x: 0, y: 0 }
                    ]
                }
            },
            {
                outer_ring: {
                    vertices: [
                        { x: 0, y: 0 },
                        { x: Infinity, y: 0 },
                        { x: 10, y: 10 },
                        { x: 0, y: 10 }
                    ]
                }
            },
            {
                outer_ring: {
                    vertices: [
                        { x: 10, y: 10 },
                        { x: 10.01, y: 10 },
                        { x: 10.01, y: 10.01 },
                        { x: 10, y: 10.01 }
                    ]
                }
            },
            {
                outer_ring: {
                    vertices: [
                        { x: 20, y: 20 },
                        { x: 40, y: 20 },
                        { x: 40, y: 40 },
                        { x: 20, y: 40 }
                    ]
                },
                inner_rings: [
                    {
                        vertices: [
                            { x: 25, y: 25 },
                            { x: 25, y: 25 },
                            { x: 25, y: 25 }
                        ]
                    }
                ]
            }
        ]
    })

    assert.equal(report.loopSets.length, 1)
    assert.deepEqual(
        report.diagnostics.map((diagnostic) => diagnostic.reason),
        [
            'too-few-points',
            'non-finite-point',
            'near-zero-area',
            'too-few-points'
        ]
    )
    assert.deepEqual(
        report.diagnostics.map((diagnostic) => diagnostic.role),
        ['outer', 'outer', 'outer', 'hole']
    )
})

test('PcbAssemblyFillGeometryResolver samples arc contours with center objects', () => {
    const loops = PcbAssemblyFillGeometryResolver.resolve({
        contours: [
            [
                {
                    type: 'line',
                    start: { x: 10, y: 0 },
                    end: { x: 20, y: 0 }
                },
                {
                    type: 'arc',
                    center: { x: 20, y: 10 },
                    radius: 10,
                    startAngle: -90,
                    sweepAngle: 90
                },
                {
                    type: 'line',
                    start: { x: 30, y: 10 },
                    end: { x: 10, y: 10 }
                },
                {
                    type: 'line',
                    start: { x: 10, y: 10 },
                    end: { x: 10, y: 0 }
                }
            ]
        ]
    })

    assert.ok(
        loops.outer.some((point) => {
            return (
                Math.abs(point[0] - 30) < 0.001 &&
                Math.abs(point[1] - 10) < 0.001
            )
        })
    )
})

test('PcbAssemblyFillGeometryResolver accepts alternate ring field names', () => {
    const loops = PcbAssemblyFillGeometryResolver.resolve({
        brep_shape: {
            outer: {
                cw_vertices: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0 },
                    { x: 100, y: 100 },
                    { x: 0, y: 100 }
                ]
            },
            holes: [
                {
                    cw_vertices: [
                        { x: 40, y: 40 },
                        { x: 60, y: 40 },
                        { x: 60, y: 60 },
                        { x: 40, y: 60 }
                    ]
                }
            ]
        }
    })

    assert.deepEqual(loops.outer, [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100]
    ])
    assert.deepEqual(loops.holes, [
        [
            [40, 60],
            [60, 60],
            [60, 40],
            [40, 40]
        ]
    ])
})

test('PcbAssemblyFillGeometryResolver samples bulged B-Rep ring vertices', () => {
    const loops = PcbAssemblyFillGeometryResolver.resolve({
        brep_shape: {
            outer_ring: {
                vertices: [
                    { x: 0, y: 0, bulge: 1 },
                    { x: 10, y: 0 },
                    { x: 10, y: 10 },
                    { x: 0, y: 10 }
                ]
            }
        }
    })

    assert.ok(loops.outer.length > 4)
    assert.ok(loops.outer.some((point) => point[0] > 4.9 && point[1] < -4.9))
})

test('PcbAssemblyFillGeometryResolver expands B-Rep shape arrays', () => {
    const loops = PcbAssemblyFillGeometryResolver.resolveAll({
        brep_shapes: [
            {
                outer_ring: {
                    vertices: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                        { x: 10, y: 10 },
                        { x: 0, y: 10 }
                    ]
                }
            },
            {
                outer_ring: {
                    vertices: [
                        { x: 20, y: 0 },
                        { x: 30, y: 0 },
                        { x: 30, y: 10 },
                        { x: 20, y: 10 }
                    ]
                },
                inner_rings: [
                    {
                        vertices: [
                            { x: 24, y: 4 },
                            { x: 26, y: 4 },
                            { x: 26, y: 6 },
                            { x: 24, y: 6 }
                        ]
                    }
                ]
            }
        ]
    })

    assert.equal(loops.length, 2)
    assert.deepEqual(loops[0].outer, [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10]
    ])
    assert.deepEqual(loops[1].holes, [
        [
            [24, 6],
            [26, 6],
            [26, 4],
            [24, 4]
        ]
    ])
})
