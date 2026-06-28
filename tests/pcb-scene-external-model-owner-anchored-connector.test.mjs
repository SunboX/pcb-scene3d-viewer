import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'

/**
 * Builds a single off-board connector whose STEP source bounds are biased
 * from the authored component-body anchor.
 * @param {{ modelOffsetZ?: number }} [options] Fixture options.
 * @returns {object}
 */
function createOwnerAnchoredConnectorModelBoundsScene(options = {}) {
    const modelOffsetZ = Number(options?.modelOffsetZ || 0)

    return {
        sourceFormat: 'altium',
        board: {
            centerX: 0,
            centerY: 0,
            widthMil: 1600,
            heightMil: 600,
            thicknessMil: 63
        },
        components: [
            {
                designator: 'J4',
                componentIndex: 14,
                mountSide: 'top',
                positionMil: { x: 0, y: 0, z: 31.5 },
                boardPositionMil: { x: 0, y: 0 },
                rotationDeg: 270,
                pattern: 'FAKE_USB_A_CONNECTOR',
                source: 'FAKE_USB_CONNECTOR',
                parameters: {
                    'Connector Type': 'USB - A',
                    'Mounting Type': 'Surface Mount, Right Angle'
                },
                body: {
                    family: 'generic',
                    sizeMil: { width: 340, depth: 72, height: 40 }
                }
            }
        ],
        detail: {
            pads: [
                ...[-160, -80, 0, 80, 160].map((y) =>
                    createSurfaceConnectorPad(14, 47, y)
                ),
                createThroughHolePad(14, -47, -225),
                createThroughHolePad(14, -47, 225)
            ]
        },
        externalPlacements: [
            {
                designator: 'J4',
                mountSide: 'top',
                rotationDeg: 270,
                positionMil: { x: 0, y: 0, z: 31.5 },
                bodyPositionMil: { x: -464, y: 0 },
                projection: {
                    source: 'model-bounds',
                    boundsMil: { width: 472, depth: 1341, height: 100 }
                },
                modelTransform: {
                    rotationDeg: { x: 0, y: 0, z: 0 },
                    offsetMil: { x: 0, y: -464, z: modelOffsetZ },
                    ownerAnchorOffsetMil: { x: -464, y: 0 }
                },
                externalModel: {
                    origin: 'embedded',
                    name: 'fake-usb-a-body.step',
                    format: 'step',
                    preparedMeshPayloads: [
                        createBodyPayload(0, 0.387, 0.472, 1.341, 0.1),
                        ...[-0.16, -0.08, 0, 0.08, 0.16].map((x) =>
                            createTerminalPayload(x, 0.495)
                        )
                    ]
                }
            }
        ]
    }
}

/**
 * Builds one fake top-side connector contact pad.
 * @param {number} componentIndex Owning component index.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {object}
 */
function createSurfaceConnectorPad(componentIndex, x, y) {
    return {
        componentIndex,
        x,
        y,
        sizeTopX: 28,
        sizeTopY: 72,
        sizeMidX: 28,
        sizeMidY: 72,
        hasTopPasteMaskOpening: true,
        hasBottomPasteMaskOpening: false
    }
}

/**
 * Builds one fake through-hole pad.
 * @param {number} componentIndex Owning component index.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {object}
 */
function createThroughHolePad(componentIndex, x, y) {
    return {
        componentIndex,
        x,
        y,
        sizeTopX: 40,
        sizeTopY: 40,
        sizeMidX: 40,
        sizeMidY: 40,
        holeDiameter: 24,
        hasTopPasteMaskOpening: false,
        hasBottomPasteMaskOpening: false
    }
}

/**
 * Builds one rectangular body payload in source units.
 * @param {number} x X center.
 * @param {number} y Y center.
 * @param {number} width Body width.
 * @param {number} depth Body depth.
 * @param {number} height Body height.
 * @param {number[]} [color] Mesh color.
 * @returns {object}
 */
function createBodyPayload(x, y, width, depth, height, color = [1, 1, 1]) {
    const halfWidth = width / 2
    const halfDepth = depth / 2
    const minZ = 0
    const maxZ = height
    const positions = new Float32Array([
        x - halfWidth,
        y - halfDepth,
        minZ,
        x + halfWidth,
        y - halfDepth,
        minZ,
        x + halfWidth,
        y + halfDepth,
        minZ,
        x - halfWidth,
        y + halfDepth,
        minZ,
        x - halfWidth,
        y - halfDepth,
        maxZ,
        x + halfWidth,
        y - halfDepth,
        maxZ,
        x + halfWidth,
        y + halfDepth,
        maxZ,
        x - halfWidth,
        y + halfDepth,
        maxZ
    ])

    return {
        positions,
        normals: new Float32Array(),
        indices: new Uint32Array([
            0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6,
            2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0
        ]),
        color,
        faceColors: []
    }
}

/**
 * Builds one fake connector terminal payload in source units.
 * @param {number} x X center.
 * @param {number} y Y center.
 * @returns {object}
 */
function createTerminalPayload(x, y) {
    return createBodyPayload(x, y, 0.028, 0.072, 0.02, [0.6, 0.6, 0.6])
}

/**
 * Renders one scene and returns the loaded placement group.
 * @param {object} scene Scene description.
 * @returns {Promise<any>}
 */
async function loadPlacementGroup(scene) {
    const root = new THREE.Group()
    let loadedGroup = null

    await PcbScene3dExternalModels.loadIntoScene({
        three: THREE,
        sceneDescription: scene,
        externalModelsGroup: root,
        onPlacementGroup: (placement, group) => {
            loadedGroup = group
        }
    })
    root.updateMatrixWorld(true)

    return loadedGroup
}

/**
 * Resolves aggregate world bounds for meshes whose material has one color.
 * @param {any} root Root object.
 * @param {string} colorHex Lowercase RGB hex string without #.
 * @returns {any}
 */
function findBoundsForColor(root, colorHex) {
    const bounds = new THREE.Box3()

    root?.traverse?.((object) => {
        const materials = Array.isArray(object?.material)
            ? object.material
            : [object?.material]
        if (
            materials.some(
                (material) => material?.color?.getHexString?.() === colorHex
            )
        ) {
            bounds.union(new THREE.Box3().setFromObject(object))
        }
    })

    return bounds
}

test('PcbScene3dExternalModels aligns owner-anchored connector model-bounds contact rows', async () => {
    const group = await loadPlacementGroup(
        createOwnerAnchoredConnectorModelBoundsScene()
    )
    const bounds = findBoundsForColor(group, 'cbcbcb')
    const center = new THREE.Vector3()
    bounds.getCenter(center)

    assert.equal(
        group.userData.scene3dOwnerAnchoredConnectorContactRowRepair,
        true
    )
    assert.ok(Math.abs(center.x - 47) < 0.001)
    assert.ok(Math.abs(center.y) < 0.001)
})

test('PcbScene3dExternalModels seats owner-anchored connector contact rows on the board face', async () => {
    const scene = createOwnerAnchoredConnectorModelBoundsScene({
        modelOffsetZ: 24
    })
    const group = await loadPlacementGroup(scene)
    const bounds = findBoundsForColor(group, 'cbcbcb')
    const boardFaceZ = Number(scene.components[0].positionMil.z)

    assert.equal(
        group.userData.scene3dOwnerAnchoredConnectorContactRowRepair,
        true
    )
    assert.equal(
        group.userData.scene3dOwnerAnchoredConnectorContactRowSeatingRepair,
        true
    )
    assert.ok(Math.abs(bounds.min.z - boardFaceZ) < 0.001)
})
