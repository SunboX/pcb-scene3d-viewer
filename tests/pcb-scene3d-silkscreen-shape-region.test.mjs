import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCutoutCircleDetector } from '../src/PcbScene3dCutoutCircleDetector.mjs'
import { PcbScene3dSilkscreenFactory } from '../src/PcbScene3dSilkscreenFactory.mjs'

function createFakeThree() {
    class FakeGroup {
        constructor() {
            this.children = []
            this.rotation = {}
        }

        add(...children) {
            this.children.push(...children)
        }
    }

    class FakeMesh {
        constructor(geometry, material) {
            this.geometry = geometry
            this.material = material
            this.position = {
                set: (x, y, z) => Object.assign(this, { x, y, z })
            }
        }
    }

    class FakeShape {
        constructor() {
            this.commands = []
            this.holes = []
        }

        moveTo(x, y) {
            this.commands.push({ type: 'moveTo', x, y })
        }

        lineTo(x, y) {
            this.commands.push({ type: 'lineTo', x, y })
        }

        closePath() {
            this.commands.push({ type: 'closePath' })
        }
    }

    return {
        Group: FakeGroup,
        Mesh: FakeMesh,
        MeshBasicMaterial: class {
            constructor(options) {
                this.options = options
            }
        },
        Shape: FakeShape,
        Path: FakeShape,
        ShapeGeometry: class {
            constructor(shape) {
                this.shape = shape
            }
        },
        DoubleSide: 'DoubleSide'
    }
}

test('PcbScene3dSilkscreenFactory preserves shape-based region arcs', () => {
    const group = PcbScene3dSilkscreenFactory.buildGroup(
        createFakeThree(),
        {
            top: {
                fills: [
                    {
                        points: [
                            {
                                x: 20,
                                y: 10,
                                isArc: true,
                                centerX: 10,
                                centerY: 10,
                                radius: 10,
                                startAngle: 0,
                                endAngle: 90
                            },
                            { x: 10, y: 20, isArc: false },
                            { x: 10, y: 10, isArc: false }
                        ]
                    }
                ],
                tracks: [],
                arcs: []
            },
            bottom: { fills: [], tracks: [], arcs: [] }
        },
        12,
        -12,
        (x, y) => ({ x, y })
    )

    const commands = group.children[0].children[0].geometry.shape.commands

    assert.ok(
        commands.filter((command) => command.type === 'lineTo').length > 2
    )
    assert.ok(
        commands.some(
            (command) =>
                command.type === 'lineTo' &&
                Math.abs(command.x - 17.07) < 0.1 &&
                Math.abs(command.y - 17.07) < 0.1
        )
    )
})

test('PcbScene3dSilkscreenFactory resolves each side cutout circle once across consumers', () => {
    const cutout = Array.from({ length: 32 }, (_value, index) => {
        const angle = (index / 32) * Math.PI * 2

        return { x: Math.cos(angle) * 5, y: Math.sin(angle) * 5 }
    })
    const originalResolve = PcbScene3dCutoutCircleDetector.resolve
    let detectorCalls = 0

    PcbScene3dCutoutCircleDetector.resolve = (points, epsilon) => {
        detectorCalls += 1
        return originalResolve.call(
            PcbScene3dCutoutCircleDetector,
            points,
            epsilon
        )
    }
    try {
        PcbScene3dSilkscreenFactory.buildGroup(
            THREE,
            {
                top: {
                    fills: [],
                    tracks: [{ x1: -12, y1: 0, x2: 12, y2: 0, width: 2 }],
                    arcs: [
                        {
                            x: 0,
                            y: 0,
                            radius: 9,
                            startAngle: 0,
                            endAngle: 180,
                            width: 2
                        }
                    ],
                    texts: [
                        {
                            value: 'A',
                            x: 0,
                            y: 0,
                            sizeX: 8,
                            sizeY: 8,
                            thickness: 1
                        }
                    ],
                    drillCutouts: [cutout]
                },
                bottom: { fills: [], tracks: [], arcs: [], texts: [] }
            },
            12,
            -12,
            (x, y) => ({ x, y })
        )

        assert.equal(detectorCalls, 1)
    } finally {
        PcbScene3dCutoutCircleDetector.resolve = originalResolve
    }
})
