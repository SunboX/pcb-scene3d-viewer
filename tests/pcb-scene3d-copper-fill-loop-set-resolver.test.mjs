import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dCopperFillLoopSetResolver } from '../src/PcbScene3dCopperFillLoopSetResolver.mjs'

test('PcbScene3dCopperFillLoopSetResolver preserves source island and hole order while mirroring', () => {
    const fills = [
        {
            brep_shapes: [
                {
                    outer_ring: [
                        [0, 0],
                        [2, 0],
                        [2, 2],
                        [0, 2]
                    ],
                    inner_rings: [
                        [
                            [0.5, 0.5],
                            [0.5, 1],
                            [1, 1],
                            [1, 0.5]
                        ]
                    ]
                },
                {
                    outer_ring: [
                        [5, 0],
                        [6, 0],
                        [6, 1],
                        [5, 1]
                    ]
                }
            ]
        },
        {
            points: [
                { x: 8, y: 1 },
                { x: 9, y: 1 },
                { x: 9, y: 2 },
                { x: 8, y: 2 }
            ]
        }
    ]

    const result = PcbScene3dCopperFillLoopSetResolver.resolve(
        fills,
        (x, y) => ({ x: x * 2 + 10, y: y * 3 - 4 }),
        true
    )

    assert.deepEqual(result, [
        {
            outer: [
                [10, 4],
                [14, 4],
                [14, -2],
                [10, -2]
            ],
            holes: [
                [
                    [11, 2.5],
                    [11, 1],
                    [12, 1],
                    [12, 2.5]
                ]
            ],
            bounds: { minX: 10, minY: -2, maxX: 14, maxY: 4 }
        },
        {
            outer: [
                [20, 4],
                [22, 4],
                [22, 1],
                [20, 1]
            ],
            holes: [],
            bounds: { minX: 20, minY: 1, maxX: 22, maxY: 4 }
        },
        {
            outer: [
                [26, 1],
                [28, 1],
                [28, -2],
                [26, -2]
            ],
            holes: [],
            bounds: { minX: 26, minY: -2, maxX: 28, maxY: 1 }
        }
    ])
})

test('PcbScene3dCopperFillLoopSetResolver removes invalid points duplicates and zero-area loops', () => {
    const result = PcbScene3dCopperFillLoopSetResolver.resolve(
        [
            {
                points: [
                    [0, 0],
                    [1, 0],
                    [2, 0]
                ]
            },
            {
                points: [
                    [0, 0],
                    [2, 0],
                    [2, 2],
                    [2.0004, 2.0004],
                    [0, 2],
                    [0, 0]
                ],
                holes: [
                    [
                        [0.5, 0.5],
                        [1, 0.5],
                        [1.5, 0.5]
                    ],
                    [
                        [0.5, 0.5],
                        [1.5, 0.5],
                        [1.5, 1.5],
                        [0.5, 1.5]
                    ]
                ]
            }
        ],
        (x, y) => ({ x, y }),
        false
    )

    assert.deepEqual(result, [
        {
            outer: [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 2]
            ],
            holes: [
                [
                    [0.5, 0.5],
                    [1.5, 0.5],
                    [1.5, 1.5],
                    [0.5, 1.5]
                ]
            ],
            bounds: { minX: 0, minY: 0, maxX: 2, maxY: 2 }
        }
    ])
})
