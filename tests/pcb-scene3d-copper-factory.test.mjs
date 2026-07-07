import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'
import {
    countTrianglesCoveringPoint,
    createCircularCutout,
    findObjectByName,
    hasTriangleCentroidInsideBounds,
    hasTriangleOverlappingCircle,
    hasVerticalWallThroughPoint,
    resolveBounds
} from './helpers/PcbScene3dCopperTestGeometry.mjs'
test('PcbScene3dCopperFactory separates top and bottom copper detail', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [
                { x1: 10, y1: 20, x2: 70, y2: 20, width: 8, layerId: 1 },
                { x1: 15, y1: 220, x2: 35, y2: 250, width: 6, layerId: 32 }
            ],
            arcs: [
                {
                    x: 150,
                    y: 160,
                    radius: 10,
                    startAngle: 0,
                    endAngle: 180,
                    width: 6,
                    layerId: 1
                },
                {
                    x: 180,
                    y: 260,
                    radius: 12,
                    startAngle: 90,
                    endAngle: 180,
                    width: 6,
                    layerId: 32
                }
            ],
            pads: [
                {
                    x: 100,
                    y: 120,
                    sizeTopX: 60,
                    sizeTopY: 60,
                    sizeBottomX: 90,
                    sizeBottomY: 50,
                    shapeTop: 1,
                    shapeBottom: 2,
                    rotation: 90
                }
            ]
        },
        32.1,
        -32.1,
        (x, y) => ({ x: x - 50, y: y - 75 })
    )

    assert.equal(group.children.length, 2)

    const topGroup = group.children[0]
    const bottomGroup = group.children[1]
    const topTrackMesh = topGroup.children[0]
    const topArcMesh = topGroup.children[1]
    const topPadGroup = topGroup.children[2]
    const bottomTrackMesh = bottomGroup.children[0]
    const bottomArcMesh = bottomGroup.children[1]
    const bottomPadGroup = bottomGroup.children[2]
    const topTrackBounds = resolveBounds(
        topTrackMesh.geometry.attributes.position.array
    )
    const bottomTrackBounds = resolveBounds(
        bottomTrackMesh.geometry.attributes.position.array
    )
    const bottomArcBounds = resolveBounds(
        bottomArcMesh.geometry.attributes.position.array
    )
    const topPadRoot = topPadGroup.children[0]
    const bottomPadRoot = bottomPadGroup.children[0]

    assert.equal(topGroup.rotation.x, 0)
    assert.equal(bottomGroup.rotation.x, Math.PI)
    assert.equal(topTrackBounds.minX, -44)
    assert.equal(topTrackBounds.maxX, 24)
    assert.equal(topTrackBounds.minY, -59)
    assert.equal(topTrackBounds.maxY, -51)
    assert.ok(Math.abs(topTrackBounds.minZ - 31) < 0.001)
    assert.ok(Math.abs(topTrackBounds.maxZ - 33.2) < 0.001)
    assert.ok(bottomTrackBounds.maxX - bottomTrackBounds.minX > 20)
    assert.ok(bottomTrackBounds.maxY - bottomTrackBounds.minY > 30)
    assert.ok(bottomTrackBounds.maxY <= -142)
    assert.ok(Math.abs(bottomArcBounds.minZ - 31) < 0.001)
    assert.ok(Math.abs(bottomArcBounds.maxZ - 33.2) < 0.001)
    assert.equal(topPadRoot.position.x, 50)
    assert.equal(topPadRoot.position.y, 45)
    assert.equal(topPadRoot.children[0].position.z, 32.1)
    assert.equal(bottomPadRoot.position.x, 50)
    assert.equal(bottomPadRoot.position.y, -45)
    assert.equal(bottomPadRoot.children[0].position.z, 32.1)
    assert.equal(topPadRoot.rotation.z, Math.PI / 2)
    assert.equal(bottomPadRoot.rotation.z, Math.PI / 2)
})

test('PcbScene3dCopperFactory rounds track endpoints like KiCad copper', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, width: 20, layerId: 1 }],
            arcs: [],
            pads: [],
            vias: []
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )

    const trackMesh = group.children[0].children[0]
    const bounds = resolveBounds(trackMesh.geometry.attributes.position.array)

    assert.ok(bounds.minX <= -9.99)
    assert.ok(bounds.maxX >= 109.99)
    assert.equal(bounds.minY, -10)
    assert.equal(bounds.maxY, 10)
})

test('PcbScene3dCopperFactory keeps round copper caps free of internal side walls', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, width: 20, layerId: 1 }],
            arcs: [],
            pads: [],
            vias: []
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )

    const trackMesh = group.children[0].children[0]
    const positions = trackMesh.geometry.attributes.position.array

    assert.equal(hasVerticalWallThroughPoint(positions, 0, 0), false)
    assert.equal(hasVerticalWallThroughPoint(positions, 100, 0), false)
    assert.equal(hasVerticalWallThroughPoint(positions, 10, 0), false)
    assert.equal(hasVerticalWallThroughPoint(positions, 90, 0), false)
    assert.equal(hasVerticalWallThroughPoint(positions, -10, 0), true)
    assert.equal(hasVerticalWallThroughPoint(positions, 110, 0), true)
})

test('PcbScene3dCopperFactory suppresses drill-cut rounded caps', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [
                {
                    x1: 0,
                    y1: 0,
                    x2: 100,
                    y2: 0,
                    width: 20,
                    layerId: 1,
                    capStartRound: false,
                    capEndRound: false,
                    capStartSideWall: false,
                    capEndSideWall: false
                }
            ],
            arcs: [],
            pads: [],
            vias: []
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )

    const trackMesh = group.children[0].children[0]
    const positions = trackMesh.geometry.attributes.position.array
    const bounds = resolveBounds(positions)

    assert.ok(Math.abs(bounds.minX - 0) < 0.001)
    assert.ok(Math.abs(bounds.maxX - 100) < 0.001)
    assert.equal(hasVerticalWallThroughPoint(positions, -10, 0), false)
    assert.equal(hasVerticalWallThroughPoint(positions, 110, 0), false)
    assert.equal(hasVerticalWallThroughPoint(positions, 0, 10), true)
    assert.equal(hasVerticalWallThroughPoint(positions, 100, 10), true)
})

test('PcbScene3dCopperFactory uses polygon offset for coplanar copper', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, width: 20, layerId: 1 }],
            arcs: [],
            pads: [],
            vias: []
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )

    const trackMesh = group.children[0].children[0]

    assert.equal(trackMesh.material.polygonOffset, true)
    assert.equal(trackMesh.material.polygonOffsetFactor < 0, true)
    assert.equal(trackMesh.material.polygonOffsetUnits < 0, true)
})

test('PcbScene3dCopperFactory renders mask-covered traces with a solder-mask copper tint', () => {
    const group =
        PcbScene3dCopperFactory.buildMaskCoveredGroup?.(
            THREE,
            {
                tracks: [
                    {
                        x1: 0,
                        y1: 0,
                        x2: 100,
                        y2: 0,
                        width: 20,
                        layerId: 1
                    }
                ],
                arcs: []
            },
            5,
            -5,
            (x, y) => ({ x, y }),
            { solderMaskColor: 0x2a5f27 }
        ) || new THREE.Group()

    assert.equal(group.children.length, 1)
    const trackMesh = group.children[0].children[0]
    const bounds = resolveBounds(trackMesh.geometry.attributes.position.array)

    assert.equal(trackMesh.name, 'mask-covered-copper-tracks')
    assert.equal(trackMesh.material.color.getHex(), 0x247330)
    assert.equal(trackMesh.material.metalness, 0)
    assert.equal(trackMesh.material.roughness, 0.56)
    assert.notEqual(trackMesh.material.polygonOffset, true)
    assert.ok(bounds.maxZ > 5)
})

test('PcbScene3dCopperFactory keeps mask-covered traces below exposed copper', () => {
    const coveredGroup = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, width: 20, layerId: 1 }],
            arcs: []
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )
    const exposedGroup = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, width: 20, layerId: 1 }],
            arcs: [],
            pads: [],
            vias: []
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )
    const coveredBounds = resolveBounds(
        coveredGroup.children[0].children[0].geometry.attributes.position.array
    )
    const exposedBounds = resolveBounds(
        exposedGroup.children[0].children[0].geometry.attributes.position.array
    )

    assert.ok(coveredBounds.maxZ > 5)
    assert.ok(coveredBounds.maxZ < exposedBounds.maxZ)
})

test('PcbScene3dCopperFactory renders mask-covered copper fills with solder-mask tint', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 80, y: 0 },
                        { x: 80, y: 50 },
                        { x: 0, y: 50 }
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        { solderMaskColor: 0x2a5f27 }
    )

    assert.equal(group.children.length, 1)
    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')
    assert.ok(fillMesh)

    const bounds = resolveBounds(fillMesh.geometry.attributes.position.array)
    assert.equal(fillMesh.material.color.getHex(), 0x296d2d)
    assert.equal(fillMesh.material.metalness, 0)
    assert.equal(fillMesh.material.roughness, 0.56)
    assert.ok(bounds.minX <= 0)
    assert.ok(bounds.maxX >= 80)
    assert.ok(bounds.minY <= 0)
    assert.ok(bounds.maxY >= 50)
    assert.ok(bounds.maxZ > 5)
    assert.ok(bounds.maxZ < 6.1)
})

test('PcbScene3dCopperFactory clips mask-covered traces below silkscreen fills', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, width: 8, layerId: 1 }],
            arcs: []
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        {
            occlusionCutouts: {
                top: [
                    [
                        { x: 20, y: -20 },
                        { x: 80, y: -20 },
                        { x: 80, y: 20 },
                        { x: 20, y: 20 }
                    ]
                ]
            }
        }
    )

    const trackMesh = group.children[0].children[0]
    const positions = trackMesh.geometry.attributes.position.array

    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 20,
            maxX: 80,
            minY: -4,
            maxY: 4
        }),
        false
    )
})

test('PcbScene3dCopperFactory clips Gerber covered tracks already represented by filled copper', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [
                { x1: 20, y1: 30, x2: 80, y2: 30, width: 8, layerId: 1 },
                { x1: 20, y1: 70, x2: 80, y2: 70, width: 8, layerId: 1 }
            ],
            arcs: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 100, y: 0 },
                        { x: 100, y: 100 },
                        { x: 0, y: 100 }
                    ],
                    holes: [
                        [
                            { x: 10, y: 60 },
                            { x: 90, y: 60 },
                            { x: 90, y: 80 },
                            { x: 10, y: 80 }
                        ]
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        { unionCoveredLayerPrimitives: true }
    )

    const trackMesh = findObjectByName(group, 'mask-covered-copper-tracks')
    assert.ok(trackMesh)
    const positions = trackMesh.geometry.attributes.position.array

    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 20,
            maxX: 80,
            minY: 26,
            maxY: 34
        }),
        false
    )
    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 20,
            maxX: 80,
            minY: 66,
            maxY: 74
        }),
        true
    )
})

test('PcbScene3dCopperFactory removes duplicate Gerber covered fill surfaces', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 100, y: 0 },
                        { x: 100, y: 100 },
                        { x: 0, y: 100 }
                    ]
                },
                {
                    layerId: 1,
                    points: [
                        { x: 25, y: 25 },
                        { x: 75, y: 25 },
                        { x: 75, y: 75 },
                        { x: 25, y: 75 }
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        { unionCoveredLayerPrimitives: true }
    )

    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')

    assert.ok(fillMesh)
    assert.equal(
        countTrianglesCoveringPoint(fillMesh.geometry, { x: 40, y: 60 }),
        1
    )
})

test('PcbScene3dCopperFactory clips mask-covered fills below silkscreen fills', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 100, y: 0 },
                        { x: 100, y: 100 },
                        { x: 0, y: 100 }
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        {
            occlusionCutouts: {
                top: [
                    [
                        { x: 20, y: 20 },
                        { x: 80, y: 20 },
                        { x: 80, y: 80 },
                        { x: 20, y: 80 }
                    ]
                ]
            }
        }
    )

    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')
    assert.ok(fillMesh)
    assert.equal(
        hasTriangleCentroidInsideBounds(
            fillMesh.geometry.attributes.position.array,
            {
                minX: 20,
                maxX: 80,
                minY: 20,
                maxY: 80
            }
        ),
        false
    )
})

test('PcbScene3dCopperFactory removes mask-covered trace slivers at circular pad cutouts', () => {
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [{ x1: -20, y1: 0, x2: 20, y2: 0, width: 4, layerId: 1 }],
            arcs: []
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        {
            occlusionCutouts: {
                top: [createCircularCutout(0, 0, 8)]
            }
        }
    )

    const trackMesh = group.children[0].children[0]

    assert.equal(
        hasTriangleOverlappingCircle(trackMesh.geometry, { x: 0, y: 0 }, 8),
        false
    )
})

test('PcbScene3dCopperFactory renders saved copper fills with holes', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            pads: [],
            vias: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 100, y: 0 },
                        { x: 100, y: 100 },
                        { x: 0, y: 100 }
                    ],
                    holes: [
                        [
                            { x: 40, y: 40 },
                            { x: 60, y: 40 },
                            { x: 60, y: 60 },
                            { x: 40, y: 60 }
                        ]
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )

    const fillMesh = findObjectByName(group, 'copper-fills')

    assert.ok(fillMesh)
    const positions = fillMesh.geometry.attributes.position.array
    const bounds = resolveBounds(positions)

    assert.ok(bounds.minX <= 0)
    assert.ok(bounds.maxX >= 100)
    assert.ok(bounds.minY <= 0)
    assert.ok(bounds.maxY >= 100)
    assert.ok(bounds.minZ < 5)
    assert.ok(bounds.maxZ > 5)
    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 45,
            maxX: 55,
            minY: 45,
            maxY: 55
        }),
        false
    )
})

test('PcbScene3dCopperFactory renders saved copper zones from layer names', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            pads: [],
            vias: [],
            polygons: [
                {
                    layer: 'B.Cu',
                    points: [
                        { x: 0, y: 0 },
                        { x: 30, y: 0 },
                        { x: 30, y: 20 },
                        { x: 0, y: 20 }
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )

    assert.equal(group.children.length, 1)
    assert.equal(group.children[0].rotation.x, Math.PI)

    const fillMesh = findObjectByName(group, 'copper-fills')
    assert.ok(fillMesh)

    const bounds = resolveBounds(fillMesh.geometry.attributes.position.array)

    assert.ok(bounds.minY <= -20)
    assert.ok(bounds.maxY <= 0)
})

test('PcbScene3dCopperFactory renders B-Rep shape array islands', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            pads: [],
            vias: [],
            polygons: [
                {
                    layer: 'F.Cu',
                    brep_shapes: [
                        {
                            outer_ring: {
                                vertices: [
                                    { x: 0, y: 0 },
                                    { x: 30, y: 0 },
                                    { x: 30, y: 30 },
                                    { x: 0, y: 30 }
                                ]
                            }
                        },
                        {
                            outer_ring: {
                                vertices: [
                                    { x: 60, y: 0 },
                                    { x: 100, y: 0 },
                                    { x: 100, y: 40 },
                                    { x: 60, y: 40 }
                                ]
                            },
                            inner_rings: [
                                {
                                    vertices: [
                                        { x: 74, y: 14 },
                                        { x: 86, y: 14 },
                                        { x: 86, y: 26 },
                                        { x: 74, y: 26 }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )

    const fillMesh = findObjectByName(group, 'copper-fills')

    assert.ok(fillMesh)
    const positions = fillMesh.geometry.attributes.position.array
    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 5,
            maxX: 25,
            minY: 5,
            maxY: 25
        }),
        true
    )
    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 88,
            maxX: 98,
            minY: 10,
            maxY: 25
        }),
        true
    )
    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 76,
            maxX: 84,
            minY: 16,
            maxY: 24
        }),
        false
    )
})

test('PcbScene3dCopperFactory leaves drilled openings uncovered for real board holes', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, width: 12, layerId: 1 }],
            arcs: [],
            pads: [
                {
                    x: 100,
                    y: 0,
                    sizeTopX: 60,
                    sizeTopY: 36,
                    shapeTop: 2,
                    holeDiameter: 20,
                    holeShape: 2,
                    holeSlotLength: 42,
                    rotation: 90
                },
                {
                    x: 100,
                    y: 0,
                    sizeTopX: 80,
                    sizeTopY: 44,
                    shapeTop: 2,
                    holeDiameter: null,
                    holeShape: null,
                    holeSlotLength: null,
                    rotation: 0
                }
            ],
            vias: [{ x: 50, y: 0, diameter: 30, holeDiameter: 16 }]
        },
        5,
        -5,
        (x, y) => ({ x, y })
    )

    const topGroup = group.children[0]
    const maskGroup = topGroup.children.find(
        (child) => child.name === 'copper-drill-masks'
    )

    assert.equal(maskGroup, undefined)
})

test('PcbScene3dCopperFactory renders KiCad front copper text as stroke copper', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            pads: [],
            vias: [],
            copperTexts: [
                {
                    x: 100,
                    y: 120,
                    value: 'OK',
                    layer: 'F.Cu',
                    side: 'front',
                    sizeX: 30,
                    sizeY: 30,
                    thickness: 6,
                    hAlign: 'left',
                    vAlign: 'bottom',
                    rotation: 0
                }
            ]
        },
        7,
        -7,
        (x, y) => ({ x: x - 50, y: y - 60 })
    )
    const textMesh = findObjectByName(group, 'copper-text')

    assert.ok(textMesh)
    const bounds = resolveBounds(textMesh.geometry.attributes.position.array)

    assert.ok(bounds.minX >= 45)
    assert.ok(bounds.maxX > bounds.minX)
    assert.ok(bounds.minY < 60)
    assert.ok(bounds.maxZ > 6.99)
})

test('PcbScene3dCopperFactory orients KiCad y-up copper text glyphs', () => {
    const group = PcbScene3dCopperFactory.buildGroup(
        THREE,
        {
            tracks: [],
            arcs: [],
            pads: [],
            vias: [],
            copperTexts: [
                {
                    x: 100,
                    y: 120,
                    value: 'UP\nDN',
                    layer: 'F.Cu',
                    side: 'front',
                    sizeX: 30,
                    sizeY: 30,
                    thickness: 6,
                    hAlign: 'left',
                    vAlign: 'bottom',
                    rotation: 0
                }
            ]
        },
        7,
        -7,
        (x, y) => ({ x: x - 50, y: y - 60 }),
        { coordinateSystem: 'kicad-3d-y-up' }
    )
    const textMesh = findObjectByName(group, 'copper-text')

    assert.ok(textMesh)
    const bounds = resolveBounds(textMesh.geometry.attributes.position.array)

    assert.ok(bounds.minY > 60)
    assert.ok(bounds.maxY > 140)
})
