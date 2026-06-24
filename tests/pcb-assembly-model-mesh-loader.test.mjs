import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbAssemblyModelMeshLoader } from '../src/scene3d.mjs'

const MIL100_MM = 2.54

/**
 * Encodes bytes as a base64 data URI payload.
 * @param {Uint8Array} bytes Binary bytes.
 * @returns {string}
 */
function dataUri(bytes) {
    return (
        'data:application/octet-stream;base64,' +
        Buffer.from(bytes).toString('base64')
    )
}

/**
 * Builds a typed byte buffer for one simple triangular GLTF mesh.
 * @returns {Uint8Array}
 */
function createTriangleBinaryBuffer() {
    const bytes = new Uint8Array(48)
    const view = new DataView(bytes.buffer)
    ;[0, 0, 0, MIL100_MM, 0, 0, 0, MIL100_MM, 0].forEach((value, index) => {
        view.setFloat32(index * 4, value, true)
    })
    ;[0, 1, 2].forEach((value, index) => {
        view.setUint32(36 + index * 4, value, true)
    })
    return bytes
}

/**
 * Builds a minimal GLTF document with an embedded buffer.
 * @returns {object}
 */
function createTriangleGltf() {
    const buffer = createTriangleBinaryBuffer()
    return {
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [
            {
                name: 'triangle',
                primitives: [
                    {
                        attributes: { POSITION: 0 },
                        indices: 1,
                        material: 0
                    }
                ]
            }
        ],
        materials: [
            {
                pbrMetallicRoughness: {
                    baseColorFactor: [0.2, 0.3, 0.4, 1]
                }
            }
        ],
        buffers: [{ byteLength: buffer.byteLength, uri: dataUri(buffer) }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 36 },
            { buffer: 0, byteOffset: 36, byteLength: 12 }
        ],
        accessors: [
            {
                bufferView: 0,
                componentType: 5126,
                count: 3,
                type: 'VEC3'
            },
            {
                bufferView: 1,
                componentType: 5125,
                count: 3,
                type: 'SCALAR'
            }
        ]
    }
}

/**
 * Builds a binary GLB around the triangle GLTF fixture.
 * @returns {Uint8Array}
 */
function createTriangleGlb() {
    const binaryBuffer = createTriangleBinaryBuffer()
    const gltf = createTriangleGltf()
    gltf.buffers = [{ byteLength: binaryBuffer.byteLength }]
    const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf))
    const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4
    const binPadding = (4 - (binaryBuffer.byteLength % 4)) % 4
    const jsonLength = jsonBytes.byteLength + jsonPadding
    const binLength = binaryBuffer.byteLength + binPadding
    const glb = new Uint8Array(12 + 8 + jsonLength + 8 + binLength)
    const view = new DataView(glb.buffer)

    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, glb.byteLength, true)
    view.setUint32(12, jsonLength, true)
    view.setUint32(16, 0x4e4f534a, true)
    glb.set(jsonBytes, 20)
    glb.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength)
    view.setUint32(20 + jsonLength, binLength, true)
    view.setUint32(24 + jsonLength, 0x004e4942, true)
    glb.set(binaryBuffer, 28 + jsonLength)

    return glb
}

/**
 * Asserts that loaded triangle meshes are converted into internal mil units.
 * @param {object[]} meshes Loaded meshes.
 * @returns {void}
 */
function assertTriangleMeshes(meshes) {
    assert.equal(meshes.length, 1)
    assert.equal(meshes[0].faces.length, 1)
    assert.deepEqual(meshes[0].faces[0], [0, 1, 2])
    assert.equal(Math.round(meshes[0].vertices[1][0]), 100)
    assert.equal(Math.round(meshes[0].vertices[2][1]), 100)
}

/**
 * Builds a prepared STEP payload with one default-colored triangle and one
 * explicitly colored triangle.
 * @returns {object}
 */
function createFaceColoredStepPayload() {
    return {
        name: 'colored-body',
        color: [0.12, 0.14, 0.16],
        positions: new Float32Array([
            0, 0, 0, 0.1, 0, 0, 0.1, 0.1, 0, 0, 0.1, 0
        ]),
        normals: new Float32Array(),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        faceColors: [{ first: 0, last: 0, color: [0.82, 0.1, 0.05] }]
    }
}

test('PcbAssemblyModelMeshLoader preserves STEP face colors as export meshes', async () => {
    const loader = new PcbAssemblyModelMeshLoader()
    const meshes = await loader.loadPlacement({
        externalModel: {
            format: 'step',
            name: 'colored.step',
            preparedMeshPayloads: [createFaceColoredStepPayload()]
        }
    })

    assert.equal(meshes.length, 2)
    assert.deepEqual(meshes[0].color, [0.82, 0.1, 0.05])
    assert.deepEqual(meshes[1].color, [0.12, 0.14, 0.16])
    assert.equal(meshes[0].faces.length, 1)
    assert.equal(meshes[1].faces.length, 1)
})

test('PcbAssemblyModelMeshLoader preserves WRL material diffuse colors', async () => {
    const loader = new PcbAssemblyModelMeshLoader()
    const meshes = await loader.loadPlacement({
        externalModel: {
            format: 'wrl',
            name: 'colored.wrl',
            payloadText: `
#VRML V2.0 utf8
Shape {
  appearance Appearance {
    material Material { diffuseColor 0.05 0.07 0.09 }
  }
  geometry IndexedFaceSet {
    coord Coordinate {
      point [ 0 0 0, 1 0 0, 0 1 0 ]
    }
    coordIndex [ 0, 1, 2, -1 ]
  }
}`
        }
    })

    assert.equal(meshes.length, 1)
    assert.deepEqual(meshes[0].color, [0.05, 0.07, 0.09])
})

test('PcbAssemblyModelMeshLoader loads ASCII STL meshes', async () => {
    const loader = new PcbAssemblyModelMeshLoader()
    const meshes = await loader.loadPlacement({
        externalModel: {
            format: 'stl',
            name: 'triangle.stl',
            payloadText: `
solid triangle
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex ${MIL100_MM} 0 0
      vertex 0 ${MIL100_MM} 0
    endloop
  endfacet
endsolid triangle`
        }
    })

    assertTriangleMeshes(meshes)
    assert.equal(meshes[0].name, 'triangle.stl')
})

test('PcbAssemblyModelMeshLoader loads OBJ meshes', async () => {
    const loader = new PcbAssemblyModelMeshLoader()
    const meshes = await loader.loadPlacement({
        externalModel: {
            format: 'obj',
            name: 'triangle.obj',
            payloadText: `
v 0 0 0
v ${MIL100_MM} 0 0
v 0 ${MIL100_MM} 0
f 1 2 3`
        }
    })

    assertTriangleMeshes(meshes)
    assert.equal(meshes[0].name, 'triangle.obj')
})

test('PcbAssemblyModelMeshLoader applies OBJ material sidecar colors', async () => {
    const loader = new PcbAssemblyModelMeshLoader()
    const meshes = await loader.loadPlacement({
        externalModel: {
            format: 'obj',
            name: 'colored.obj',
            payloadText: `
mtllib colored.mtl
v 0 0 0
v ${MIL100_MM} 0 0
v 0 ${MIL100_MM} 0
usemtl body
f 1 2 3`,
            resources: [
                {
                    name: 'colored.mtl',
                    payloadText: `
newmtl body
Kd 0.1 0.2 0.3
d 0.4`
                }
            ]
        }
    })

    assertTriangleMeshes(meshes)
    assert.deepEqual(meshes[0].color, [0.1, 0.2, 0.3, 0.4])
})

test('PcbAssemblyModelMeshLoader loads GLTF meshes', async () => {
    const loader = new PcbAssemblyModelMeshLoader()
    const meshes = await loader.loadPlacement({
        externalModel: {
            format: 'gltf',
            name: 'triangle.gltf',
            payloadText: JSON.stringify(createTriangleGltf())
        }
    })

    assertTriangleMeshes(meshes)
    assert.deepEqual(meshes[0].color, [0.2, 0.3, 0.4])
})

test('PcbAssemblyModelMeshLoader preserves GLTF material alpha', async () => {
    const loader = new PcbAssemblyModelMeshLoader()
    const gltf = createTriangleGltf()
    gltf.materials[0].pbrMetallicRoughness.baseColorFactor = [
        0.2, 0.3, 0.4, 0.35
    ]
    const meshes = await loader.loadPlacement({
        externalModel: {
            format: 'gltf',
            name: 'transparent-triangle.gltf',
            payloadText: JSON.stringify(gltf)
        }
    })

    assertTriangleMeshes(meshes)
    assert.deepEqual(meshes[0].color, [0.2, 0.3, 0.4, 0.35])
})

test('PcbAssemblyModelMeshLoader loads binary GLB meshes', async () => {
    const loader = new PcbAssemblyModelMeshLoader()
    const meshes = await loader.loadPlacement({
        externalModel: {
            format: 'glb',
            name: 'triangle.glb',
            file: createTriangleGlb()
        }
    })

    assertTriangleMeshes(meshes)
    assert.deepEqual(meshes[0].color, [0.2, 0.3, 0.4])
})
