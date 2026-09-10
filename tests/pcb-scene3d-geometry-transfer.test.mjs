import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dGeometryTransfer } from '../src/PcbScene3dGeometryTransfer.mjs'

test('geometry transfer preserves exact buffers, shared resources, materials and hierarchy', () => {
    const geometry = new THREE.BoxGeometry(20, 10, 4)
    geometry.setAttribute(
        'color',
        new THREE.Uint8BufferAttribute(
            new Uint8Array(geometry.attributes.position.count * 3).fill(128),
            3,
            true
        )
    )
    geometry.setDrawRange(3, 21)
    geometry.userData = { region: 'board' }
    const material = new THREE.MeshStandardMaterial({
        color: 0x375d26,
        roughness: 0.56,
        metalness: 0,
        side: THREE.DoubleSide,
        visible: false,
        polygonOffset: true,
        polygonOffsetFactor: 2
    })
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(geometry, [material, material])
    mesh.position.set(10, -5, 3)
    mesh.rotation.set(0.1, 0.2, 0.3, 'ZYX')
    mesh.scale.set(1, 2, -1)
    mesh.name = 'surface'
    mesh.userData = { scene3dBoardFaceMaterial: true }
    mesh.visible = false
    mesh.renderOrder = 4
    mesh.layers.set(2)
    group.add(mesh, new THREE.Mesh(geometry, material))
    const exported = PcbScene3dGeometryTransfer.serialize(group)
    const data = structuredClone(exported.payload, {
        transfer: exported.transferables
    })
    assert.equal(geometry.attributes.position.array.byteLength, 0)
    const restored = PcbScene3dGeometryTransfer.deserialize(THREE, data)
    const [first, second] = restored.children
    assert.equal(first.geometry, second.geometry)
    assert.equal(first.material[0], second.material)
    assert.equal(first.material[0], first.material[1])
    assert.equal(first.material[0].visible, false)
    assert.equal(first.material[0].color.getHex(), 0x375d26)
    assert.equal(first.material[0].roughness, 0.56)
    assert.equal(first.material[0].polygonOffsetFactor, 2)
    assert.equal(first.visible, false)
    assert.equal(first.name, 'surface')
    assert.equal(first.renderOrder, 4)
    assert.equal(first.layers.mask, 4)
    assert.deepEqual(first.position.toArray(), [10, -5, 3])
    assert.deepEqual(first.quaternion.toArray(), mesh.quaternion.toArray())
    assert.deepEqual(first.scale.toArray(), [1, 2, -1])
    assert.deepEqual(first.geometry.drawRange, { start: 3, count: 21 })
    assert.deepEqual(first.geometry.groups, geometry.groups)
    assert.deepEqual(first.userData, mesh.userData)
    assert.deepEqual(first.geometry.userData, { region: 'board' })
    assert.equal(first.geometry.attributes.position.count, 24)
    assert.equal(first.geometry.attributes.uv.count, 24)
    assert.equal(first.geometry.attributes.normal.count, 24)
    assert.equal(first.geometry.attributes.color.normalized, true)
    assert.ok(first.geometry.attributes.color.array instanceof Uint8Array)
    assert.equal(first.geometry.attributes.color.array[0], 128)
    assert.equal(first.geometry.index.count, 36)
    assert.deepEqual(first.geometry.boundingBox.min.toArray(), [-10, -5, -2])
    let geometriesDisposed = 0
    let materialsDisposed = 0
    first.geometry.addEventListener('dispose', () => geometriesDisposed++)
    second.material.addEventListener('dispose', () => materialsDisposed++)
    PcbScene3dGeometryTransfer.dispose(restored)
    assert.equal(geometriesDisposed, 1)
    assert.equal(materialsDisposed, 1)
})

test('geometry transfer preserves line loops and interleaved attributes without recreating geometry', () => {
    const geometry = new THREE.BufferGeometry()
    const data = new THREE.InterleavedBuffer(
        new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]),
        4
    )
    geometry.setAttribute(
        'position',
        new THREE.InterleavedBufferAttribute(data, 3, 0)
    )
    geometry.setAttribute(
        'weight',
        new THREE.InterleavedBufferAttribute(data, 1, 3)
    )
    const line = new THREE.LineLoop(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xffffff })
    )
    const exported = PcbScene3dGeometryTransfer.serialize(line)
    assert.equal(exported.transferables.length, 1)
    const restored = PcbScene3dGeometryTransfer.deserialize(
        THREE,
        structuredClone(exported.payload, { transfer: exported.transferables })
    )
    assert.equal(restored.isLineLoop, true)
    assert.equal(
        restored.geometry.attributes.position.data,
        restored.geometry.attributes.weight.data
    )
    assert.equal(restored.geometry.attributes.position.getX(1), 5)
    assert.equal(restored.geometry.attributes.weight.getX(1), 8)
})
