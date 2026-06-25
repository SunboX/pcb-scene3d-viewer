import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dSelectionMarkerFactory } from '../src/PcbScene3dSelectionMarkerFactory.mjs'

/**
 * Minimal fake group.
 */
class FakeGroup {
    /** @type {any[]} */
    children = []
    /** @type {Record<string, any>} */
    userData = {}

    /** @param {...any} children Child objects. @returns {void} */
    add(...children) {
        this.children.push(...children)
    }
}

/**
 * Minimal fake geometry.
 */
class FakeBufferGeometry {
    /** @type {Map<string, any>} */
    attributes = new Map()

    /** @param {string} name Attribute name. @param {any} value Attribute value. @returns {void} */
    setAttribute(name, value) {
        this.attributes.set(name, value)
    }
}

/**
 * Minimal fake buffer attribute.
 */
class FakeFloat32BufferAttribute {
    /** @type {number[]} */
    array
    /** @type {number} */
    itemSize

    /** @param {number[]} array Attribute values. @param {number} itemSize Item size. */
    constructor(array, itemSize) {
        this.array = array
        this.itemSize = itemSize
    }
}

/**
 * Minimal fake line material.
 */
class FakeLineBasicMaterial {
    /** @type {Record<string, any>} */
    options

    /** @param {Record<string, any>} options Material options. */
    constructor(options) {
        this.options = options
    }
}

/**
 * Minimal fake line loop.
 */
class FakeLineLoop {
    /** @type {any} */
    geometry
    /** @type {any} */
    material
    /** @type {number} */
    renderOrder = 0

    /** @param {any} geometry Geometry. @param {any} material Material. */
    constructor(geometry, material) {
        this.geometry = geometry
        this.material = material
    }
}

/**
 * Builds the fake Three namespace.
 * @returns {object}
 */
function createFakeThree() {
    return {
        Group: FakeGroup,
        BufferGeometry: FakeBufferGeometry,
        Float32BufferAttribute: FakeFloat32BufferAttribute,
        LineBasicMaterial: FakeLineBasicMaterial,
        LineLoop: FakeLineLoop
    }
}

test('PcbScene3dSelectionMarkerFactory builds marker from rotated owned pads', () => {
    const marker = PcbScene3dSelectionMarkerFactory.build(
        createFakeThree(),
        {
            board: {
                centerX: 100,
                centerY: 100,
                thicknessMil: 62
            },
            components: [
                {
                    componentIndex: 4,
                    designator: 'J1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 0 },
                    boardPositionMil: { x: 120, y: 100, z: 0 },
                    body: { sizeMil: { width: 20, depth: 20, height: 5 } }
                }
            ],
            detail: {
                pads: [
                    {
                        componentIndex: 4,
                        x: 110,
                        y: 100,
                        sizeTopX: 20,
                        sizeTopY: 80,
                        rotation: 90
                    },
                    {
                        componentIndex: 4,
                        x: 130,
                        y: 100,
                        sizeTopX: 20,
                        sizeTopY: 80,
                        rotation: 90
                    }
                ]
            }
        },
        'J1',
        (x, y) => ({ x: x - 100, y: y - 100 })
    )

    assert.ok(marker)
    assert.deepEqual(marker.userData.scene3dSelectionMarker, {
        designator: 'J1'
    })
    assert.equal(marker.children.length, 1)
    const line = marker.children[0]
    assert.equal(line.renderOrder, 1000)
    assert.equal(line.material.options.depthTest, true)
    assert.equal(line.material.options.color, 0x14c5e6)
    assert.deepEqual(
        line.geometry.attributes.get('position').array,
        [-38, -18, 39, 78, -18, 39, 78, 18, 39, -38, 18, 39]
    )
})

test('PcbScene3dSelectionMarkerFactory keeps bottom markers below bottom-side bodies', () => {
    const marker = PcbScene3dSelectionMarkerFactory.build(
        createFakeThree(),
        {
            board: {
                centerX: 100,
                centerY: 100,
                thicknessMil: 63
            },
            components: [
                {
                    componentIndex: 8,
                    designator: 'IC8',
                    mountSide: 'bottom',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: -42.5 },
                    boardPositionMil: { x: 120, y: 100, z: -42.5 },
                    body: { sizeMil: { width: 20, depth: 20, height: 22 } }
                }
            ],
            detail: {
                pads: []
            }
        },
        'IC8',
        (x, y) => ({ x: x - 100, y: y - 100 })
    )

    assert.ok(marker)
    const line = marker.children[0]
    assert.equal(line.material.options.depthTest, true)
    assert.deepEqual(
        line.geometry.attributes.get('position').array,
        [2, -18, -61.5, 38, -18, -61.5, 38, 18, -61.5, 2, 18, -61.5]
    )
})
