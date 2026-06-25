import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbAssemblyComponentMeshBuilder } from '../src/PcbAssemblyComponentMeshBuilder.mjs'
import { PcbScene3dFootprintBodyBuilder } from '../src/PcbScene3dFootprintBodyBuilder.mjs'

/**
 * Finds one mesh by name.
 * @param {object[]} meshes Mesh list.
 * @param {string} name Mesh name.
 * @returns {object | undefined}
 */
function findMesh(meshes, name) {
    return meshes.find((mesh) => mesh.name === name)
}

/**
 * Measures a mesh bounds box.
 * @param {{ vertices?: number[][] }} mesh Mesh data.
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
function meshBounds(mesh) {
    return (mesh?.vertices || []).reduce(
        (bounds, vertex) => ({
            minX: Math.min(bounds.minX, Number(vertex?.[0] || 0)),
            maxX: Math.max(bounds.maxX, Number(vertex?.[0] || 0)),
            minY: Math.min(bounds.minY, Number(vertex?.[1] || 0)),
            maxY: Math.max(bounds.maxY, Number(vertex?.[1] || 0))
        }),
        {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity
        }
    )
}

test('PcbScene3dFootprintBodyBuilder resolves pushbutton footprints', () => {
    const body = PcbScene3dFootprintBodyBuilder.resolve(
        'pushbutton_id1.3mm_od2mm',
        { width: 60, depth: 60, height: 12 }
    )
    const pins = PcbScene3dFootprintBodyBuilder.accessoryBoxes(body)

    assert.equal(body.family, 'switch')
    assert.equal(body.footprintModel.style, 'pushbutton')
    assert.equal(pins.length, 4)
    assert.equal(
        pins.every((pin) => pin.role === 'pin'),
        true
    )
    assert.ok(body.sizeMil.width >= 100)
    assert.ok(body.sizeMil.depth >= 100)
})

test('PcbScene3dFootprintBodyBuilder resolves testpoint footprints', () => {
    const body = PcbScene3dFootprintBodyBuilder.resolve('testpoint_tp1')

    assert.equal(body.family, 'test-point')
    assert.equal(body.footprintModel.style, 'test-point')
    assert.equal(PcbScene3dFootprintBodyBuilder.accessoryBoxes(body).length, 0)
    assert.equal(body.sizeMil.width, body.sizeMil.depth)
})

test('PcbScene3dFootprintBodyBuilder resolves TO-style footprints', () => {
    const body = PcbScene3dFootprintBodyBuilder.resolve('to-92_inline')
    const leads = PcbScene3dFootprintBodyBuilder.accessoryBoxes(body)

    assert.equal(body.family, 'transistor')
    assert.equal(body.footprintModel.style, 'to-package')
    assert.equal(body.footprintModel.leadCount, 3)
    assert.equal(leads.length, 3)
    assert.deepEqual(
        leads.map((lead) => lead.index),
        [1, 2, 3]
    )
})

test('PcbAssemblyComponentMeshBuilder exports testpoints as round bodies', async () => {
    const { meshes } = await PcbAssemblyComponentMeshBuilder.build(
        {
            components: [
                {
                    designator: 'TP1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 20 },
                    body: PcbScene3dFootprintBodyBuilder.resolve('testpoint')
                }
            ],
            externalPlacements: []
        },
        { includeModels: false }
    )
    const body = findMesh(meshes, 'component-TP1-body')

    assert.ok(body)
    assert.ok(body.vertices.length > 8)
    assert.deepEqual(meshBounds(body), {
        minX: -30,
        maxX: 30,
        minY: -30,
        maxY: 30
    })
})
