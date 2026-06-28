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
 * Builds one deterministic wide board mesh.
 * @returns {object}
 */
function createWideBoardMesh() {
    return PcbAssemblyMeshUtils.box('wide-board', {
        width: 8000,
        depth: 800,
        height: 40,
        color: [0.05, 0.32, 0.18]
    })
}

/**
 * Finds the first camera node in a GLTF document.
 * @param {object} gltf GLTF JSON document.
 * @returns {object}
 */
function findCameraNode(gltf) {
    const node = gltf.nodes.find((candidate) =>
        Number.isInteger(candidate.camera)
    )
    assert.ok(node)
    return node
}

/**
 * Computes camera distance from the origin.
 * @param {object} node GLTF camera node.
 * @returns {number}
 */
function cameraDistance(node) {
    return Math.hypot(
        Number(node.translation?.[0] || 0),
        Number(node.translation?.[1] || 0),
        Number(node.translation?.[2] || 0)
    )
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

/**
 * Extracts the binary chunk from a binary GLB.
 * @param {Uint8Array} glb Binary GLB.
 * @returns {Buffer}
 */
function parseGlbBinaryChunk(glb) {
    const buffer = Buffer.from(glb)
    const jsonLength = buffer.readUInt32LE(12)
    const binHeaderOffset = 20 + jsonLength
    const binLength = buffer.readUInt32LE(binHeaderOffset)

    assert.equal(
        buffer.toString('utf8', binHeaderOffset + 4, binHeaderOffset + 7),
        'BIN'
    )
    return buffer.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength)
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

test('PcbAssemblyGltfWriter packs texture images into binary GLB buffer views', () => {
    const imageBytes = Buffer.from('fake-png')
    const textureUri = 'data:image/png;base64,' + imageBytes.toString('base64')
    const glb = PcbAssemblyGltfWriter.write({
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
        format: 'glb'
    })
    const gltf = parseGlbJson(glb)
    const binaryChunk = parseGlbBinaryChunk(glb)
    const image = gltf.images[0]

    assert.equal(image.uri, undefined)
    assert.equal(image.mimeType, 'image/png')
    assert.equal(Number.isInteger(image.bufferView), true)
    const imageBufferView = gltf.bufferViews[image.bufferView]
    const imageData = binaryChunk.subarray(
        imageBufferView.byteOffset,
        imageBufferView.byteOffset + imageBufferView.byteLength
    )

    assert.equal(imageBufferView.target, undefined)
    assert.deepEqual(imageData, imageBytes)
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

test('PcbAssemblyGltfWriter fits scene cameras using FOV and aspect ratio', () => {
    const wideAspect = PcbAssemblyGltfWriter.write({
        name: 'wide-framed-board',
        meshes: [createWideBoardMesh()],
        format: 'gltf',
        includeSceneMetadata: true,
        sceneCameraAspectRatio: 4,
        sceneCameraFovDegrees: 45
    })
    const narrowAspect = PcbAssemblyGltfWriter.write({
        name: 'narrow-framed-board',
        meshes: [createWideBoardMesh()],
        format: 'gltf',
        includeSceneMetadata: true,
        sceneCameraAspectRatio: 0.25,
        sceneCameraFovDegrees: 45
    })

    assert.equal(wideAspect.cameras[0].perspective.aspectRatio, 4)
    assert.equal(
        Math.round(wideAspect.cameras[0].perspective.yfov * 1000),
        Math.round((Math.PI / 4) * 1000)
    )
    assert.ok(
        cameraDistance(findCameraNode(narrowAspect)) >
            cameraDistance(findCameraNode(wideAspect)) * 3
    )
})

test('PcbAssemblyGltfWriter fits default scene cameras for square viewers', () => {
    const defaultCamera = PcbAssemblyGltfWriter.write({
        name: 'default-framed-board',
        meshes: [createWideBoardMesh()],
        format: 'gltf',
        includeSceneMetadata: true
    })
    const squareCamera = PcbAssemblyGltfWriter.write({
        name: 'square-framed-board',
        meshes: [createWideBoardMesh()],
        format: 'gltf',
        includeSceneMetadata: true,
        sceneCameraAspectRatio: 1
    })

    assert.equal(defaultCamera.cameras[0].perspective.aspectRatio, undefined)
    assert.ok(
        Math.abs(
            cameraDistance(findCameraNode(defaultCamera)) -
                cameraDistance(findCameraNode(squareCamera))
        ) < 0.001
    )
})

test('PcbAssemblyGltfWriter supports top export camera preset metadata', () => {
    const gltf = PcbAssemblyGltfWriter.write({
        name: 'top-framed-board',
        meshes: [createWideBoardMesh()],
        format: 'gltf',
        includeSceneMetadata: true,
        sceneCameraPreset: 'top',
        sceneCameraAspectRatio: 1
    })
    const cameraNode = findCameraNode(gltf)

    assert.ok(Math.abs(cameraNode.translation[0]) < 0.001)
    assert.ok(cameraNode.translation[1] > 0)
    assert.ok(Math.abs(cameraNode.translation[2]) < 0.001)
    assert.equal(cameraNode.rotation.every(Number.isFinite), true)
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
