import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dSilkscreenFactory } from '../src/PcbScene3dSilkscreenFactory.mjs'

/**
 * Builds minimal Three-compatible doubles for cutout filtering tests.
 * @returns {any}
 */
function createFakeThree() {
    class FakeVector3 {
        constructor() {
            this.x = 0
            this.y = 0
            this.z = 0
        }

        /**
         * @param {number} x
         * @param {number} y
         * @param {number} z
         * @returns {void}
         */
        set(x, y, z) {
            this.x = x
            this.y = y
            this.z = z
        }
    }

    class FakeGroup {
        constructor() {
            this.children = []
            this.position = new FakeVector3()
            this.rotation = new FakeVector3()
        }

        /**
         * @param {...any} children
         * @returns {void}
         */
        add(...children) {
            this.children.push(...children)
        }
    }

    class FakeMesh {
        /**
         * @param {any} geometry
         * @param {any} material
         */
        constructor(geometry, material) {
            this.geometry = geometry
            this.material = material
            this.position = new FakeVector3()
            this.rotation = new FakeVector3()
        }
    }

    class FakeBufferGeometry {
        constructor() {
            this.attributes = new Map()
        }

        /**
         * @param {string} name
         * @param {any} value
         * @returns {void}
         */
        setAttribute(name, value) {
            this.attributes.set(name, value)
        }

        /**
         * @param {string} name
         * @returns {any}
         */
        getAttribute(name) {
            return this.attributes.get(name)
        }
    }

    class FakeFloat32BufferAttribute {
        /**
         * @param {number[]} array
         * @param {number} itemSize
         */
        constructor(array, itemSize) {
            this.array = array
            this.itemSize = itemSize
            this.count = array.length / itemSize
        }

        /**
         * @param {number} index
         * @returns {number}
         */
        getX(index) {
            return this.array[index * this.itemSize]
        }

        /**
         * @param {number} index
         * @returns {number}
         */
        getY(index) {
            return this.array[index * this.itemSize + 1]
        }

        /**
         * @param {number} index
         * @returns {number}
         */
        getZ(index) {
            return this.array[index * this.itemSize + 2]
        }
    }

    class FakeMeshBasicMaterial {
        /**
         * @param {Record<string, unknown>} options
         */
        constructor(options) {
            this.options = options
        }
    }

    return {
        Group: FakeGroup,
        Mesh: FakeMesh,
        BufferGeometry: FakeBufferGeometry,
        Float32BufferAttribute: FakeFloat32BufferAttribute,
        MeshBasicMaterial: FakeMeshBasicMaterial,
        DoubleSide: 'DoubleSide'
    }
}

/**
 * Checks whether any triangle centroid lies inside an axis-aligned square.
 * @param {number[]} positions Flattened triangle positions.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
 * Keepout bounds.
 * @returns {boolean}
 */
function hasTriangleCentroidInsideBounds(positions, bounds) {
    for (let index = 0; index < positions.length; index += 9) {
        const centroid = {
            x:
                (positions[index] +
                    positions[index + 3] +
                    positions[index + 6]) /
                3,
            y:
                (positions[index + 1] +
                    positions[index + 4] +
                    positions[index + 7]) /
                3
        }

        if (
            centroid.x >= bounds.minX &&
            centroid.x <= bounds.maxX &&
            centroid.y >= bounds.minY &&
            centroid.y <= bounds.maxY
        ) {
            return true
        }
    }

    return false
}

test('PcbScene3dSilkscreenFactory cuts stroke geometry around copper keepouts', () => {
    const THREE = createFakeThree()
    const group = PcbScene3dSilkscreenFactory.buildGroup(
        THREE,
        {
            top: {
                fills: [],
                tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, width: 8 }],
                arcs: [],
                copperCutouts: [
                    [
                        { x: 25, y: -8 },
                        { x: 75, y: -8 },
                        { x: 75, y: 8 },
                        { x: 25, y: 8 }
                    ]
                ]
            },
            bottom: { fills: [], tracks: [], arcs: [] }
        },
        12,
        -12,
        (x, y) => ({ x, y })
    )

    const trackMesh = group.children[0].children[0]
    const positions = trackMesh.geometry.attributes.get('position').array

    assert.equal(
        hasTriangleCentroidInsideBounds(positions, {
            minX: 25,
            maxX: 75,
            minY: -8,
            maxY: 8
        }),
        false
    )
})
