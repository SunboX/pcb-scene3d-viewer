import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbAssemblyGltfValidator,
    PcbAssemblyGltfWriter,
    PcbAssemblyMeshUtils
} from '../src/scene3d.mjs'

/**
 * Builds one deterministic board mesh.
 * @returns {object}
 */
function createBoardMesh() {
    return PcbAssemblyMeshUtils.box('board', {
        width: 100,
        depth: 80,
        height: 10,
        color: [0.05, 0.32, 0.18]
    })
}

/**
 * Decodes the embedded binary buffer from a JSON GLTF document.
 * @param {object} gltf GLTF JSON document.
 * @returns {Buffer}
 */
function embeddedBuffer(gltf) {
    const uri = String(gltf?.buffers?.[0]?.uri || '')
    const prefix = 'data:application/octet-stream;base64,'
    assert.ok(uri.startsWith(prefix))
    return Buffer.from(uri.slice(prefix.length), 'base64')
}

/**
 * Reads Vec3 float accessor values.
 * @param {object} gltf GLTF JSON document.
 * @param {Buffer} buffer Binary buffer.
 * @param {number} accessorIndex Accessor index.
 * @returns {number[][]}
 */
function readVec3Accessor(gltf, buffer, accessorIndex) {
    const accessor = gltf.accessors[accessorIndex]
    const bufferView = gltf.bufferViews[accessor.bufferView]
    const offset =
        Number(bufferView.byteOffset || 0) + Number(accessor.byteOffset || 0)
    const stride = Number(bufferView.byteStride || 12)

    return Array.from({ length: accessor.count }, (_entry, index) => [
        buffer.readFloatLE(offset + index * stride),
        buffer.readFloatLE(offset + index * stride + 4),
        buffer.readFloatLE(offset + index * stride + 8)
    ])
}

/**
 * Computes Vec3 bounds.
 * @param {number[][]} points Vec3 points.
 * @returns {{ min: number[], max: number[] }}
 */
function bounds(points) {
    return points.reduce(
        (current, point) => ({
            min: current.min.map((value, index) =>
                Math.min(value, point[index])
            ),
            max: current.max.map((value, index) =>
                Math.max(value, point[index])
            )
        }),
        {
            min: [Infinity, Infinity, Infinity],
            max: [-Infinity, -Infinity, -Infinity]
        }
    )
}

/**
 * Rounds every vector entry.
 * @param {number[]} values Values.
 * @returns {number[]}
 */
function rounded(values) {
    return values.map((value) => Math.round(value * 1000) / 1000)
}

/**
 * Extracts the JSON chunk from a binary GLB.
 * @param {Uint8Array} glb Binary GLB.
 * @returns {object}
 */
function parseGlbJson(glb) {
    const buffer = Buffer.from(glb)
    assert.equal(buffer.toString('utf8', 0, 4), 'glTF')
    assert.equal(buffer.readUInt32LE(4), 2)
    assert.equal(buffer.readUInt32LE(8), buffer.length)
    const jsonLength = buffer.readUInt32LE(12)
    assert.equal(buffer.toString('utf8', 16, 20), 'JSON')
    return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trim())
}

test('PcbAssemblyGltfWriter writes embedded JSON GLTF with exported PCB axes', () => {
    const gltf = PcbAssemblyGltfWriter.write({
        name: 'fake-board',
        meshes: [createBoardMesh()],
        format: 'gltf'
    })
    const buffer = embeddedBuffer(gltf)
    const primitive = gltf.meshes[0].primitives[0]
    const positions = readVec3Accessor(
        gltf,
        buffer,
        primitive.attributes.POSITION
    )
    const positionBounds = bounds(positions)

    assert.equal(gltf.asset.version, '2.0')
    assert.equal(gltf.scene, 0)
    assert.equal(gltf.nodes[0].mesh, 0)
    assert.equal(gltf.meshes[0].name, 'board')
    assert.deepEqual(rounded(positionBounds.min), [-1.27, -0.127, -1.016])
    assert.deepEqual(rounded(positionBounds.max), [1.27, 0.127, 1.016])
    assert.deepEqual(
        gltf.materials[primitive.material].pbrMetallicRoughness.baseColorFactor,
        [0.05, 0.32, 0.18, 1]
    )
})

test('PcbAssemblyGltfWriter writes binary GLB containers', () => {
    const glb = PcbAssemblyGltfWriter.write({
        name: 'fake-board',
        meshes: [createBoardMesh()],
        format: 'glb'
    })
    const gltf = parseGlbJson(glb)

    assert.ok(glb instanceof Uint8Array)
    assert.equal(gltf.asset.version, '2.0')
    assert.equal(gltf.buffers.length, 1)
    assert.equal(gltf.buffers[0].uri, undefined)
    assert.ok(gltf.buffers[0].byteLength > 0)
})

test('PcbAssemblyGltfWriter preserves texture-backed board materials', () => {
    const textureUri =
        'data:image/png;base64,' + Buffer.from('fake-png').toString('base64')
    const gltf = PcbAssemblyGltfWriter.write({
        name: 'textured-board',
        meshes: [
            {
                ...createBoardMesh(),
                texture: {
                    top: textureUri,
                    bottom: textureUri
                }
            }
        ],
        format: 'gltf'
    })
    const texturedPrimitive = gltf.meshes[0].primitives.find((primitive) => {
        const material = gltf.materials[primitive.material]
        return Number.isInteger(
            material?.pbrMetallicRoughness?.baseColorTexture?.index
        )
    })

    assert.equal(gltf.images[0].uri, textureUri)
    assert.equal(gltf.textures[0].source, 0)
    assert.ok(texturedPrimitive)
    assert.ok(Number.isInteger(texturedPrimitive.attributes.TEXCOORD_0))
})

test('PcbAssemblyGltfWriter preserves translucent mesh material alpha', () => {
    const gltf = PcbAssemblyGltfWriter.write({
        name: 'translucent-model',
        meshes: [
            {
                ...createBoardMesh(),
                name: 'clear-body',
                color: [0.2, 0.3, 0.4, 0.45]
            }
        ],
        format: 'gltf'
    })
    const material = gltf.materials[gltf.meshes[0].primitives[0].material]

    assert.deepEqual(
        material.pbrMetallicRoughness.baseColorFactor,
        [0.2, 0.3, 0.4, 0.45]
    )
    assert.equal(material.alphaMode, 'BLEND')
    assert.equal(material.doubleSided, true)
})

test('PcbAssemblyGltfWriter reuses identical meshes as node instances', () => {
    const baseMesh = createBoardMesh()
    const gltf = PcbAssemblyGltfWriter.write({
        name: 'instanced-board',
        meshes: [
            { ...baseMesh, name: 'board-copy-a' },
            { ...baseMesh, name: 'board-copy-b' }
        ],
        format: 'gltf'
    })

    assert.equal(gltf.meshes.length, 1)
    assert.equal(gltf.nodes.length, 2)
    assert.deepEqual(
        gltf.nodes.map((node) => node.mesh),
        [0, 0]
    )
    assert.deepEqual(gltf.scenes[0].nodes, [0, 1])
})

test('PcbAssemblyGltfWriter can add default camera and light nodes', () => {
    const gltf = PcbAssemblyGltfWriter.write({
        name: 'framed-board',
        meshes: [createBoardMesh()],
        format: 'gltf',
        includeSceneMetadata: true
    })
    const cameraNode = gltf.nodes.find((node) => Number.isInteger(node.camera))
    const lightNode = gltf.nodes.find((node) =>
        Number.isInteger(node.extensions?.KHR_lights_punctual?.light)
    )

    assert.equal(gltf.cameras[0].type, 'perspective')
    assert.equal(
        gltf.extensions.KHR_lights_punctual.lights[0].type,
        'directional'
    )
    assert.ok(gltf.extensionsUsed.includes('KHR_lights_punctual'))
    assert.ok(cameraNode.translation[2] > 0)
    assert.ok(lightNode.translation[2] > 0)
    assert.equal(
        gltf.scenes[0].nodes.includes(gltf.nodes.indexOf(cameraNode)),
        true
    )
    assert.equal(
        gltf.scenes[0].nodes.includes(gltf.nodes.indexOf(lightNode)),
        true
    )
})

test('PcbAssemblyGltfValidator accepts exported textured GLB payloads', () => {
    const textureUri =
        'data:image/png;base64,' + Buffer.from('fake-png').toString('base64')
    const glb = PcbAssemblyGltfWriter.write({
        name: 'validated-board',
        meshes: [
            {
                ...createBoardMesh(),
                texture: {
                    top: textureUri,
                    bottom: textureUri
                }
            }
        ],
        format: 'glb'
    })

    assert.deepEqual(PcbAssemblyGltfValidator.validate(glb), [])
})
