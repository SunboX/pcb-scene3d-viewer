import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dCompanionBasePlacementAdjuster } from '../src/PcbScene3dCompanionBasePlacementAdjuster.mjs'

/**
 * Builds a minimal companion-base test scene.
 * @param {object[]} externalPlacements External model placements.
 * @param {object[]} [staticBodyPlacements] Static body placements.
 * @returns {object}
 */
function createScene(externalPlacements, staticBodyPlacements = []) {
    return {
        board: { thicknessMil: 60 },
        components: [
            {
                designator: 'U1',
                mountSide: 'top',
                rotationDeg: 0,
                positionMil: { x: 0, y: 0, z: 50 },
                body: {
                    family: 'generic',
                    sizeMil: { width: 100, depth: 80, height: 40 }
                }
            }
        ],
        externalPlacements,
        staticBodyPlacements
    }
}

/**
 * Creates the partial embedded model-anchor placement that marks a companion
 * fallback base.
 * @returns {object}
 */
function createPartialAnchorPlacement() {
    return {
        designator: 'U1',
        mountSide: 'top',
        positionMil: { x: 0, y: 0, z: 30 },
        projection: {
            source: 'model-anchor-fallback',
            boundsMil: { width: 0, depth: 0, height: 0 }
        },
        externalModel: {
            origin: 'embedded',
            name: 'partial.step',
            format: 'step'
        }
    }
}

test('PcbScene3dCompanionBasePlacementAdjuster seats overlapping authored placements on companion bases', () => {
    const adjusted = PcbScene3dCompanionBasePlacementAdjuster.adjust(
        createScene(
            [
                createPartialAnchorPlacement(),
                {
                    designator: 'C1',
                    mountSide: 'top',
                    positionMil: { x: 45, y: 35, z: 30 },
                    projection: {
                        source: 'pad-fallback',
                        boundsMil: { width: 20, depth: 10, height: 8 }
                    },
                    externalModel: { origin: 'embedded', name: 'chip.step' }
                },
                {
                    designator: 'C2',
                    mountSide: 'top',
                    positionMil: { x: 250, y: 0, z: 30 },
                    projection: {
                        source: 'pad-fallback',
                        boundsMil: { width: 20, depth: 10, height: 8 }
                    },
                    externalModel: { origin: 'embedded', name: 'far.step' }
                },
                {
                    designator: 'C3',
                    mountSide: 'bottom',
                    positionMil: { x: 10, y: 10, z: -30 },
                    projection: {
                        source: 'pad-fallback',
                        boundsMil: { width: 20, depth: 10, height: 8 }
                    },
                    externalModel: { origin: 'embedded', name: 'bottom.step' }
                }
            ],
            [
                {
                    designator: 'S1',
                    mountSide: 'top',
                    positionMil: { x: -20, y: 20, z: 35 },
                    geometry: { kind: 'extruded-polygon', heightMil: 10 }
                },
                {
                    designator: 'S2',
                    mountSide: 'top',
                    positionMil: { x: 200, y: 20, z: 35 },
                    geometry: { kind: 'extruded-polygon', heightMil: 10 }
                }
            ]
        )
    )

    assert.equal(adjusted.externalPlacements[0].positionMil.z, 70)
    assert.equal(adjusted.externalPlacements[1].positionMil.z, 70)
    assert.equal(adjusted.externalPlacements[2].positionMil.z, 30)
    assert.equal(adjusted.externalPlacements[3].positionMil.z, -30)
    assert.equal(adjusted.staticBodyPlacements[0].positionMil.z, 75)
    assert.equal(adjusted.staticBodyPlacements[1].positionMil.z, 35)
})

test('PcbScene3dCompanionBasePlacementAdjuster leaves bottom repeated full embedded connectors on the board face', () => {
    const adjusted = PcbScene3dCompanionBasePlacementAdjuster.adjust({
        board: { thicknessMil: 63 },
        components: [
            {
                designator: 'J1',
                mountSide: 'bottom',
                rotationDeg: 0,
                positionMil: { x: 0, y: 0, z: -31.5 },
                body: {
                    family: 'header',
                    sizeMil: { width: 360, depth: 80, height: 330 }
                }
            }
        ],
        externalPlacements: [
            {
                designator: 'J1',
                mountSide: 'bottom',
                positionMil: { x: 0, y: 0, z: -31.5 },
                projection: {
                    source: 'pad-fallback',
                    boundsMil: { width: 360, depth: 80, height: 330 }
                },
                externalModel: { origin: 'embedded', name: 'header.step' }
            },
            {
                designator: 'J1',
                mountSide: 'bottom',
                positionMil: { x: 100, y: 0, z: -31.5 },
                projection: {
                    source: 'model-anchor-fallback',
                    boundsMil: { width: 0, depth: 0, height: 0 }
                },
                externalModel: { origin: 'embedded', name: 'header.step' }
            }
        ],
        staticBodyPlacements: []
    })

    assert.equal(adjusted.externalPlacements[0].positionMil.z, -31.5)
    assert.equal(adjusted.externalPlacements[1].positionMil.z, -31.5)
})

test('PcbScene3dCompanionBasePlacementAdjuster leaves bottom companion neighbors on the board face', () => {
    const adjusted = PcbScene3dCompanionBasePlacementAdjuster.adjust({
        board: { thicknessMil: 60 },
        components: [
            {
                designator: 'J9',
                mountSide: 'bottom',
                rotationDeg: 0,
                positionMil: { x: 0, y: 0, z: -54 },
                body: {
                    family: 'generic',
                    sizeMil: { width: 220, depth: 180, height: 48 }
                }
            }
        ],
        externalPlacements: [
            {
                designator: 'J9',
                mountSide: 'bottom',
                positionMil: { x: 0, y: 0, z: -30 },
                projection: {
                    source: 'model-anchor-fallback',
                    boundsMil: { width: 0, depth: 0, height: 0 }
                },
                externalModel: { origin: 'embedded', name: 'partial.step' }
            },
            {
                designator: 'C9',
                mountSide: 'bottom',
                positionMil: { x: 20, y: 10, z: -30 },
                projection: {
                    source: 'pad-fallback',
                    boundsMil: { width: 20, depth: 10, height: 8 }
                },
                externalModel: { origin: 'embedded', name: 'chip.step' }
            }
        ],
        staticBodyPlacements: [
            {
                designator: 'R9',
                mountSide: 'bottom',
                positionMil: { x: -20, y: -10, z: -35 },
                geometry: { kind: 'extruded-polygon', heightMil: 10 }
            }
        ]
    })

    assert.equal(adjusted.externalPlacements[0].positionMil.z, -30)
    assert.equal(adjusted.externalPlacements[1].positionMil.z, -30)
    assert.equal(adjusted.staticBodyPlacements[0].positionMil.z, -35)
})

test('PcbScene3dCompanionBasePlacementAdjuster leaves authored companion bases in charge', () => {
    const adjusted = PcbScene3dCompanionBasePlacementAdjuster.adjust(
        createScene(
            [
                createPartialAnchorPlacement(),
                {
                    designator: 'C1',
                    mountSide: 'top',
                    positionMil: { x: 25, y: 15, z: 30 },
                    projection: {
                        source: 'pad-fallback',
                        boundsMil: { width: 20, depth: 10, height: 8 }
                    },
                    externalModel: { origin: 'embedded', name: 'chip.step' }
                }
            ],
            [
                {
                    designator: 'BASE_A',
                    mountSide: 'top',
                    positionMil: { x: 2, y: 0, z: 50 },
                    geometry: {
                        kind: 'extruded-polygon',
                        heightMil: 40,
                        verticesMil: [
                            { x: -60, y: -45 },
                            { x: 60, y: -45 },
                            { x: 60, y: 45 },
                            { x: -60, y: 45 }
                        ]
                    }
                }
            ]
        )
    )

    assert.equal(adjusted.externalPlacements[0].positionMil.z, 30)
    assert.equal(adjusted.externalPlacements[1].positionMil.z, 30)
    assert.equal(adjusted.staticBodyPlacements[0].positionMil.z, 50)
})

test('PcbScene3dCompanionBasePlacementAdjuster leaves scenes without companion bases unchanged', () => {
    const scene = createScene([
        {
            designator: 'C1',
            mountSide: 'top',
            positionMil: { x: 10, y: 10, z: 30 },
            projection: {
                source: 'pad-fallback',
                boundsMil: { width: 20, depth: 10, height: 8 }
            },
            externalModel: { origin: 'embedded', name: 'chip.step' }
        }
    ])

    const adjusted = PcbScene3dCompanionBasePlacementAdjuster.adjust(scene)

    assert.equal(adjusted, scene)
})
