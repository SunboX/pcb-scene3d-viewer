import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dSilkscreenChunkedFactory } from '../src/PcbScene3dSilkscreenChunkedFactory.mjs'

/**
 * Builds minimal Three-compatible doubles for chunked factory tests.
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

    class FakeBoxGeometry {
        /**
         * @param {number} width
         * @param {number} height
         * @param {number} depth
         */
        constructor(width, height, depth) {
            this.width = width
            this.height = height
            this.depth = depth
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
        BoxGeometry: FakeBoxGeometry,
        BufferGeometry: FakeBufferGeometry,
        Float32BufferAttribute: FakeFloat32BufferAttribute,
        Group: FakeGroup,
        Mesh: FakeMesh,
        MeshBasicMaterial: FakeMeshBasicMaterial,
        DoubleSide: 'DoubleSide'
    }
}

/**
 * Counts meshes in a rendered group tree.
 * @param {any} group
 * @returns {number}
 */
function countMeshes(group) {
    let count = 0
    const visit = (node) => {
        if (node?.geometry) {
            count += 1
        }
        for (const child of node?.children || []) {
            visit(child)
        }
    }

    visit(group)
    return count
}

/**
 * Counts generated seam-cover meshes in a rendered group tree.
 * @param {any} group
 * @returns {number}
 */
function countSeamMeshes(group) {
    let count = 0
    const visit = (node) => {
        if (node?.userData?.scene3dSilkscreenFillSeam === true) {
            count += 1
        }
        for (const child of node?.children || []) {
            visit(child)
        }
    }

    visit(group)
    return count
}

/**
 * Collects position arrays from a rendered group tree.
 * @param {any} group
 * @returns {number[][]}
 */
function collectPositionArrays(group) {
    const arrays = []
    const visit = (node) => {
        const positions = node?.geometry?.attributes?.get('position')?.array
        if (Array.isArray(positions)) {
            arrays.push(positions)
        }
        for (const child of node?.children || []) {
            visit(child)
        }
    }

    visit(group)
    return arrays
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

/**
 * Builds deterministic rectangular fill records.
 * @param {number} count
 * @returns {{ x1: number, y1: number, x2: number, y2: number }[]}
 */
function buildFills(count) {
    return Array.from({ length: count }, (_value, index) => ({
        x1: index,
        y1: 0,
        x2: index + 1,
        y2: 4
    }))
}

test('PcbScene3dSilkscreenChunkedFactory yields between large track batches', async () => {
    const THREE = createFakeThree()
    let yieldCount = 0
    const group = await PcbScene3dSilkscreenChunkedFactory.buildGroup(
        THREE,
        { top: { tracks: buildTracks(900) } },
        32,
        -32,
        (x, y) => ({ x, y }),
        {
            yieldToMain: async () => {
                yieldCount += 1
            }
        }
    )
    const positionArrays = collectPositionArrays(group)
    const totalPositionCount = positionArrays.reduce(
        (sum, positions) => sum + positions.length,
        0
    )

    assert.equal(yieldCount >= 18, true)
    assert.equal(positionArrays.length > 1, true)
    assert.equal(totalPositionCount > 0, true)
})

test('PcbScene3dSilkscreenChunkedFactory yields between large fill batches', async () => {
    const THREE = createFakeThree()
    let yieldCount = 0
    const group = await PcbScene3dSilkscreenChunkedFactory.buildGroup(
        THREE,
        { top: { fills: buildFills(360) } },
        32,
        -32,
        (x, y) => ({ x, y }),
        {
            yieldToMain: async () => {
                yieldCount += 1
            }
        }
    )

    assert.equal(yieldCount >= 40, true)
    assert.equal(group.children.length >= 40, true)
    assert.equal(countMeshes(group), 405)
    assert.equal(countSeamMeshes(group), 45)
})
