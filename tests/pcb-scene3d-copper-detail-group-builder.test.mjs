import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dCopperDetailGroupBuilder } from '../src/PcbScene3dCopperDetailGroupBuilder.mjs'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'
import { PcbScene3dMaskCoveredCopperMaterial } from '../src/PcbScene3dMaskCoveredCopperMaterial.mjs'
import { PcbScene3dViaFactory } from '../src/PcbScene3dViaFactory.mjs'

class FakeGroup {
    constructor() {
        this.children = []
    }

    /**
     * Adds a child object.
     * @param {any} child Child object.
     * @returns {void}
     */
    add(child) {
        this.children.push(child)
    }
}

test('PcbScene3dCopperDetailGroupBuilder passes silkscreen fill occlusions to covered copper', () => {
    const originalBuildMaskCoveredGroup =
        PcbScene3dCopperFactory.buildMaskCoveredGroup
    const originalBuildGroup = PcbScene3dCopperFactory.buildGroup
    const captured = {}

    PcbScene3dCopperFactory.buildMaskCoveredGroup = (
        _three,
        _detail,
        _topZ,
        _bottomZ,
        _normalizePoint,
        options
    ) => {
        captured.options = options
        const group = new FakeGroup()
        group.add(new FakeGroup())
        return group
    }
    PcbScene3dCopperFactory.buildGroup = () => new FakeGroup()

    try {
        PcbScene3dCopperDetailGroupBuilder.build(
            { Group: FakeGroup },
            {
                sourceFormat: 'kicad',
                board: { surfaceColor: 0x17396b },
                detail: {
                    silkscreen: {
                        top: {
                            fills: [
                                {
                                    points: [
                                        { x: 20, y: -20 },
                                        { x: 80, y: -20 },
                                        { x: 80, y: 20 },
                                        { x: 20, y: 20 }
                                    ]
                                }
                            ]
                        },
                        bottom: {
                            fills: [
                                {
                                    x1: -10,
                                    y1: -5,
                                    x2: 10,
                                    y2: 5
                                }
                            ]
                        }
                    },
                    tracks: [
                        {
                            x1: 0,
                            y1: 0,
                            x2: 100,
                            y2: 0,
                            width: 10,
                            layerId: 1
                        }
                    ],
                    arcs: [],
                    pads: [],
                    vias: []
                }
            },
            31,
            (x, y) => ({ x, y })
        )

        assert.equal(captured.options.occlusionCutouts.top.length, 1)
        assert.equal(captured.options.occlusionCutouts.top[0].length, 4)
        assert.equal(captured.options.occlusionCutouts.bottom.length, 1)
        assert.equal(captured.options.occlusionCutouts.bottom[0].length, 4)
    } finally {
        PcbScene3dCopperFactory.buildGroup = originalBuildGroup
        PcbScene3dCopperFactory.buildMaskCoveredGroup =
            originalBuildMaskCoveredGroup
    }
})

test('PcbScene3dCopperDetailGroupBuilder passes exposed pad occlusions to covered copper', () => {
    const originalBuildMaskCoveredGroup =
        PcbScene3dCopperFactory.buildMaskCoveredGroup
    const originalBuildGroup = PcbScene3dCopperFactory.buildGroup
    const originalBuildViaGroup = PcbScene3dViaFactory.buildGroup
    const captured = {}

    PcbScene3dCopperFactory.buildMaskCoveredGroup = (
        _three,
        _detail,
        _topZ,
        _bottomZ,
        _normalizePoint,
        options
    ) => {
        captured.options = options
        const group = new FakeGroup()
        group.add(new FakeGroup())
        return group
    }
    PcbScene3dCopperFactory.buildGroup = () => new FakeGroup()
    PcbScene3dViaFactory.buildGroup = () => new FakeGroup()

    try {
        PcbScene3dCopperDetailGroupBuilder.build(
            { Group: FakeGroup },
            {
                sourceFormat: 'kicad',
                board: { surfaceColor: 0xffffff },
                detail: {
                    silkscreen: {},
                    tracks: [
                        {
                            x1: 0,
                            y1: 0,
                            x2: 100,
                            y2: 0,
                            width: 10,
                            layerId: 1
                        }
                    ],
                    arcs: [],
                    pads: [
                        {
                            x: 50,
                            y: 50,
                            sizeTopX: 40,
                            sizeTopY: 40,
                            shapeTop: 1,
                            holeDiameter: 20
                        },
                        {
                            x: 50,
                            y: 70,
                            sizeTopX: 40,
                            sizeTopY: 60,
                            shapeTop: 2,
                            rotation: 0
                        }
                    ],
                    vias: []
                }
            },
            31,
            (x, y) => ({ x, y })
        )

        const topCutouts = captured.options.occlusionCutouts.top
        assert.equal(topCutouts.length, 2)
        assert.ok(
            topCutouts.some((cutout) => cutout.length > 16),
            'Expected the circular pad surface to become a smooth occlusion'
        )
        assert.ok(
            topCutouts.some((cutout) => cutout.length === 4),
            'Expected the rectangular pad surface to become an occlusion'
        )
        const rectangularCutout = topCutouts.find(
            (cutout) => cutout.length === 4
        )
        const circularCutout = topCutouts.find((cutout) => cutout.length > 16)
        const rectangularXs = rectangularCutout.map((point) => point.x)
        const rectangularYs = rectangularCutout.map((point) => point.y)
        const circularRadius = Math.max(
            ...circularCutout.map((point) =>
                Math.hypot(point.x - 50, point.y - 50)
            )
        )

        assert.ok(
            Math.min(...rectangularXs) > 30 && Math.max(...rectangularXs) < 70,
            'Expected rectangular pad occlusion to be inset for copper underlap'
        )
        assert.ok(
            Math.min(...rectangularYs) > 40 && Math.max(...rectangularYs) < 100,
            'Expected rectangular pad occlusion to leave end underlap'
        )
        assert.ok(
            circularRadius < 20,
            'Expected circular pad occlusion to be inset for copper underlap'
        )
        assert.equal(captured.options.occlusionCutouts.bottom.length, 0)
    } finally {
        PcbScene3dViaFactory.buildGroup = originalBuildViaGroup
        PcbScene3dCopperFactory.buildGroup = originalBuildGroup
        PcbScene3dCopperFactory.buildMaskCoveredGroup =
            originalBuildMaskCoveredGroup
    }
})

test('PcbScene3dCopperDetailGroupBuilder passes Altium mask color to covered copper', () => {
    const originalBuildMaskCoveredGroup =
        PcbScene3dCopperFactory.buildMaskCoveredGroup
    const originalBuildGroup = PcbScene3dCopperFactory.buildGroup
    const originalBuildViaGroup = PcbScene3dViaFactory.buildGroup
    const captured = {}

    PcbScene3dCopperFactory.buildMaskCoveredGroup = (
        _three,
        _detail,
        _topZ,
        _bottomZ,
        _normalizePoint,
        options
    ) => {
        captured.options = options
        const group = new FakeGroup()
        group.add(new FakeGroup())
        return group
    }
    PcbScene3dCopperFactory.buildGroup = () => new FakeGroup()
    PcbScene3dViaFactory.buildGroup = () => new FakeGroup()

    try {
        PcbScene3dCopperDetailGroupBuilder.build(
            { Group: FakeGroup },
            {
                sourceFormat: 'altium',
                boardAssemblyModel: { name: 'assembly.step' },
                board: { surfaceColor: 0x17396b, thicknessMil: 63 },
                detail: {
                    silkscreen: {},
                    tracks: [
                        {
                            x1: 0,
                            y1: 0,
                            x2: 100,
                            y2: 0,
                            width: 10,
                            layerId: 1
                        }
                    ],
                    arcs: [],
                    pads: [],
                    vias: []
                }
            },
            31,
            (x, y) => ({ x, y })
        )

        assert.equal(captured.options.solderMaskColor, 0x17396b)
    } finally {
        PcbScene3dViaFactory.buildGroup = originalBuildViaGroup
        PcbScene3dCopperFactory.buildGroup = originalBuildGroup
        PcbScene3dCopperFactory.buildMaskCoveredGroup =
            originalBuildMaskCoveredGroup
    }
})

test('PcbScene3dCopperDetailGroupBuilder omits large silkscreen artwork from covered copper occlusions', () => {
    const originalBuildMaskCoveredGroup =
        PcbScene3dCopperFactory.buildMaskCoveredGroup
    const originalBuildGroup = PcbScene3dCopperFactory.buildGroup
    const captured = {}

    PcbScene3dCopperFactory.buildMaskCoveredGroup = (
        _three,
        _detail,
        _topZ,
        _bottomZ,
        _normalizePoint,
        options
    ) => {
        captured.options = options
        const group = new FakeGroup()
        group.add(new FakeGroup())
        return group
    }
    PcbScene3dCopperFactory.buildGroup = () => new FakeGroup()

    try {
        PcbScene3dCopperDetailGroupBuilder.build(
            { Group: FakeGroup },
            {
                sourceFormat: 'kicad',
                board: { surfaceColor: 0x17396b },
                detail: {
                    silkscreen: {
                        top: {
                            fills: [
                                {
                                    points: [
                                        { x: 0, y: 0 },
                                        { x: 20, y: 0 },
                                        { x: 20, y: 20 },
                                        { x: 0, y: 20 }
                                    ]
                                },
                                {
                                    points: [
                                        { x: 0, y: 0 },
                                        { x: 800, y: 0 },
                                        { x: 800, y: 800 },
                                        { x: 0, y: 800 }
                                    ]
                                }
                            ]
                        }
                    },
                    tracks: [
                        {
                            x1: 0,
                            y1: 0,
                            x2: 100,
                            y2: 0,
                            width: 10,
                            layerId: 1
                        }
                    ],
                    arcs: [],
                    pads: [],
                    vias: []
                }
            },
            31,
            (x, y) => ({ x, y })
        )

        assert.equal(captured.options.occlusionCutouts.top.length, 1)
        assert.deepEqual(captured.options.occlusionCutouts.top[0], [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 20 },
            { x: 0, y: 20 }
        ])
    } finally {
        PcbScene3dCopperFactory.buildGroup = originalBuildGroup
        PcbScene3dCopperFactory.buildMaskCoveredGroup =
            originalBuildMaskCoveredGroup
    }
})

test('PcbScene3dCopperDetailGroupBuilder passes board void cutouts to copper groups', () => {
    const originalBuildMaskCoveredGroup =
        PcbScene3dCopperFactory.buildMaskCoveredGroup
    const originalBuildGroup = PcbScene3dCopperFactory.buildGroup
    const originalBuildViaGroup = PcbScene3dViaFactory.buildGroup
    const originalBuildCoveredMaterial =
        PcbScene3dMaskCoveredCopperMaterial.build
    const captured = {}

    PcbScene3dCopperFactory.buildMaskCoveredGroup = (
        _three,
        _detail,
        _topZ,
        _bottomZ,
        _normalizePoint,
        options
    ) => {
        captured.coveredOptions = options
        return new FakeGroup()
    }
    PcbScene3dCopperFactory.buildGroup = (
        _three,
        _detail,
        _topZ,
        _bottomZ,
        _normalizePoint,
        options
    ) => {
        captured.exposedOptions = options
        return new FakeGroup()
    }
    PcbScene3dViaFactory.buildGroup = () => new FakeGroup()
    PcbScene3dMaskCoveredCopperMaterial.build = () => ({ id: 'covered' })

    const sceneDetail = {
        silkscreen: {},
        tracks: [],
        arcs: [],
        fills: [
            {
                layerId: 1,
                points: [
                    [0, 0],
                    [100, 0],
                    [100, 100],
                    [0, 100]
                ]
            }
        ],
        pads: [],
        vias: [
            {
                x: 40,
                y: 60,
                holeDiameter: 18,
                isTentingTop: false
            }
        ]
    }

    try {
        PcbScene3dCopperDetailGroupBuilder.build(
            { Group: FakeGroup },
            {
                sourceFormat: 'kicad',
                board: {
                    surfaceColor: 0xffffff,
                    cutouts: [
                        {
                            points: [
                                { x: 10, y: 10 },
                                { x: 30, y: 10 },
                                { x: 30, y: 30 },
                                { x: 10, y: 30 }
                            ]
                        }
                    ]
                },
                detail: sceneDetail
            },
            31,
            (x, y) => ({ x, y })
        )

        assert.equal(captured.coveredOptions.drillCutouts.length, 2)
        assert.equal(captured.exposedOptions.drillCutouts.length, 2)

        const drillCutout = captured.coveredOptions.drillCutouts[0]
        const boardCutout = captured.coveredOptions.drillCutouts[1]
        const radius = Math.max(
            ...drillCutout.map((point) =>
                Math.hypot(point.x - 40, point.y - 60)
            )
        )

        assert.ok(drillCutout.length >= 8)
        assert.ok(Math.abs(radius - 9) < 0.001)
        assert.deepEqual(
            boardCutout.map((point) => [point.x, point.y]),
            [
                [10, 10],
                [30, 10],
                [30, 30],
                [10, 30]
            ]
        )
    } finally {
        PcbScene3dMaskCoveredCopperMaterial.build = originalBuildCoveredMaterial
        PcbScene3dViaFactory.buildGroup = originalBuildViaGroup
        PcbScene3dCopperFactory.buildGroup = originalBuildGroup
        PcbScene3dCopperFactory.buildMaskCoveredGroup =
            originalBuildMaskCoveredGroup
    }
})

test('PcbScene3dCopperDetailGroupBuilder renders KiCad default vias as mask-covered annuli', () => {
    const originalBuildMaskCoveredGroup =
        PcbScene3dCopperFactory.buildMaskCoveredGroup
    const originalBuildGroup = PcbScene3dCopperFactory.buildGroup
    const originalBuildViaGroup = PcbScene3dViaFactory.buildGroup
    const originalBuildCoveredMaterial =
        PcbScene3dMaskCoveredCopperMaterial.build
    const coveredMaterial = { id: 'covered-via-material' }
    const viaCalls = []

    PcbScene3dCopperFactory.buildMaskCoveredGroup = () => new FakeGroup()
    PcbScene3dCopperFactory.buildGroup = () => new FakeGroup()
    PcbScene3dMaskCoveredCopperMaterial.build = () => coveredMaterial
    PcbScene3dViaFactory.buildGroup = (
        _three,
        vias,
        _thicknessMil,
        _normalizePoint,
        options = {}
    ) => {
        viaCalls.push({
            ids: vias.map((via) => via.id),
            material: options.material
        })
        const group = new FakeGroup()
        group.add(new FakeGroup())
        return group
    }

    try {
        PcbScene3dCopperDetailGroupBuilder.build(
            { Group: FakeGroup },
            {
                sourceFormat: 'kicad',
                board: { surfaceColor: 0x2a5f27, thicknessMil: 63 },
                detail: {
                    silkscreen: {},
                    tracks: [],
                    arcs: [],
                    pads: [],
                    vias: [
                        { id: 'default-covered-via' },
                        {
                            id: 'explicit-tented-via',
                            isTentingTop: true,
                            isTentingBottom: true
                        },
                        { id: 'open-via', isTentingTop: false }
                    ]
                }
            },
            31,
            (x, y) => ({ x, y })
        )

        assert.deepEqual(
            viaCalls.map((call) => call.ids),
            [['default-covered-via', 'explicit-tented-via'], ['open-via']]
        )
        assert.equal(viaCalls[0].material, coveredMaterial)
        assert.equal(viaCalls[1].material, undefined)
    } finally {
        PcbScene3dMaskCoveredCopperMaterial.build = originalBuildCoveredMaterial
        PcbScene3dViaFactory.buildGroup = originalBuildViaGroup
        PcbScene3dCopperFactory.buildGroup = originalBuildGroup
        PcbScene3dCopperFactory.buildMaskCoveredGroup =
            originalBuildMaskCoveredGroup
    }
})
