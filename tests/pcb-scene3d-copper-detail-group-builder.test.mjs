import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dCopperDetailGroupBuilder } from '../src/PcbScene3dCopperDetailGroupBuilder.mjs'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'
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
        assert.equal(captured.options.occlusionCutouts.bottom.length, 0)
    } finally {
        PcbScene3dViaFactory.buildGroup = originalBuildViaGroup
        PcbScene3dCopperFactory.buildGroup = originalBuildGroup
        PcbScene3dCopperFactory.buildMaskCoveredGroup =
            originalBuildMaskCoveredGroup
    }
})
