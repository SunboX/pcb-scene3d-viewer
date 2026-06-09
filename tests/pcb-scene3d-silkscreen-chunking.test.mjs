import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dSilkscreenFactory } from '../src/PcbScene3dSilkscreenFactory.mjs'

/**
 * Builds minimal Three-compatible doubles for silkscreen chunking tests.
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

    class FakeEuler {
        constructor() {
            this.x = 0
            this.y = 0
            this.z = 0
        }
    }

    class FakeGroup {
        constructor() {
            this.children = []
            this.position = new FakeVector3()
            this.rotation = new FakeEuler()
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
            this.rotation = new FakeEuler()
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
    }

    class FakeFloat32BufferAttribute {
        /**
         * @param {number[]} array
         * @param {number} itemSize
         */
        constructor(array, itemSize) {
            this.array = array
            this.itemSize = itemSize
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
        BufferGeometry: FakeBufferGeometry,
        Float32BufferAttribute: FakeFloat32BufferAttribute,
        Group: FakeGroup,
        Mesh: FakeMesh,
        MeshBasicMaterial: FakeMeshBasicMaterial,
        DoubleSide: 'DoubleSide'
    }
}

/**
 * Returns the numeric position attribute arrays from one rendered side group.
 * @param {any} sideGroup
 * @returns {number[][]}
 */
function resolvePositionArrays(sideGroup) {
    return sideGroup.children
        .map((child) => child.geometry?.attributes?.get('position')?.array)
        .filter((array) => Array.isArray(array))
}

/**
 * Builds deterministic horizontal track records.
 * @param {number} count
 * @returns {{ x1: number, y1: number, x2: number, y2: number, width: number }[]}
 */
function buildTracks(count) {
    return Array.from({ length: count }, (_value, index) => ({
        x1: 0,
        y1: index,
        x2: 120,
        y2: index,
        width: 6
    }))
}

test('PcbScene3dSilkscreenFactory chunks large track batches', () => {
    const THREE = createFakeThree()
    const singleTrackGroup = PcbScene3dSilkscreenFactory.buildGroup(
        THREE,
        { top: { tracks: buildTracks(1) } },
        32,
        -32,
        (x, y) => ({ x, y })
    )
    const singleTrackPositions = resolvePositionArrays(
        singleTrackGroup.children[0]
    )[0]
    const trackCount = 1400
    const group = PcbScene3dSilkscreenFactory.buildGroup(
        THREE,
        { top: { tracks: buildTracks(trackCount) } },
        32,
        -32,
        (x, y) => ({ x, y })
    )
    const topGroup = group.children[0]
    const positionArrays = resolvePositionArrays(topGroup)
    const totalPositionCount = positionArrays.reduce(
        (sum, positions) => sum + positions.length,
        0
    )

    assert.equal(positionArrays.length > 1, true)
    assert.equal(totalPositionCount, singleTrackPositions.length * trackCount)
    assert.equal(
        positionArrays.every(
            (positions) => positions.length < totalPositionCount
        ),
        true
    )
    assert.equal(
        topGroup.children.every((child) => child.material),
        true
    )
})
