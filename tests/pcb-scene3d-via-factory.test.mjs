import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dViaFactory } from '../src/PcbScene3dViaFactory.mjs'

test('PcbScene3dViaFactory extrudes annular vias around drilled holes', () => {
    const group = PcbScene3dViaFactory.buildGroup(
        THREE,
        [{ x: 20, y: 30, diameter: 24, holeDiameter: 10 }],
        63,
        (x, y) => ({ x, y })
    )

    assert.equal(group.children.length, 1)
    assert.equal(group.children[0].geometry.type, 'ExtrudeGeometry')
    assert.equal(group.children[0].geometry.parameters.shapes.holes.length, 1)
    assert.equal(group.children[0].position.x, 20)
    assert.equal(group.children[0].position.y, 30)
})

test('PcbScene3dViaFactory keeps drilled via barrels without filling the aperture', () => {
    const group = PcbScene3dViaFactory.buildGroup(
        THREE,
        [{ x: 20, y: 30, diameter: 24, holeDiameter: 10 }],
        63,
        (x, y) => ({ x, y })
    )

    assert.equal(
        countCircularDrillFaceCapTriangles(group.children[0].geometry, 5),
        0,
        'Expected via hole center to stay uncapped'
    )
    assert.ok(
        countCircularDrillWallTriangles(group.children[0].geometry, 5),
        'Expected the drilled via to keep a visible copper barrel'
    )
    assert.equal(
        group.children[0].material.side,
        THREE.DoubleSide,
        'Expected the drilled via barrel to render from the underside'
    )
})

test('PcbScene3dViaFactory falls back to solid cylinders when no drill is present', () => {
    const group = PcbScene3dViaFactory.buildGroup(
        THREE,
        [{ x: 20, y: 30, diameter: 24, holeDiameter: 0 }],
        63,
        (x, y) => ({ x, y })
    )

    assert.equal(group.children[0].geometry.type, 'CylinderGeometry')
    assert.equal(group.children[0].rotation.x, Math.PI / 2)
})

test('PcbScene3dViaFactory renders through-hole pad barrels as annular liners', () => {
    const group = PcbScene3dViaFactory.buildGroup(
        THREE,
        [{ x: 20, y: 30, holeDiameter: 40, barrelOnly: true }],
        63,
        (x, y) => ({ x, y })
    )

    assert.equal(group.children.length, 1)
    assert.equal(group.children[0].geometry.type, 'ExtrudeGeometry')
    assert.equal(group.children[0].geometry.parameters.shapes.holes.length, 1)
    assert.equal(
        countCircularDrillFaceCapTriangles(group.children[0].geometry, 16),
        0,
        'Expected through-hole pad center to stay round and open'
    )
    assert.ok(
        countCircularDrillWallTriangles(group.children[0].geometry, 16),
        'Expected through-hole pad to keep a visible copper liner wall'
    )
})

test('PcbScene3dViaFactory uses supplied material for masked via annuli', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x2f6b2b })
    const group = PcbScene3dViaFactory.buildGroup(
        THREE,
        [{ x: 20, y: 30, diameter: 24, holeDiameter: 10 }],
        63,
        (x, y) => ({ x, y }),
        { material }
    )

    assert.equal(group.children[0].material, material)
})

test('PcbScene3dViaFactory masks via faces while preserving copper drill walls', () => {
    const copperMaterial = new THREE.MeshStandardMaterial({ color: 0xcaa24e })
    const surfaceMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6b2b })
    const group = PcbScene3dViaFactory.buildGroup(
        THREE,
        [
            {
                x: 20,
                y: 30,
                diameter: 60,
                holeDiameter: 40,
                barrelOnly: true,
                isTentingTop: true,
                isTentingBottom: false
            }
        ],
        63,
        (x, y) => ({ x, y }),
        { material: copperMaterial, surfaceMaterial }
    )
    const barrelMesh = group.children.find(
        (mesh) => mesh.geometry.type === 'ExtrudeGeometry'
    )
    const surfaceMeshes = group.children.filter(
        (mesh) => mesh.geometry.type === 'ShapeGeometry'
    )
    const barrelBounds = worldZBounds(barrelMesh)

    assert.equal(barrelMesh.material, copperMaterial)
    assert.ok(barrelBounds.max <= 0.001)
    assert.ok(barrelBounds.min < -31.5)
    assert.equal(surfaceMeshes.length, 1)
    assert.equal(surfaceMeshes[0].material, surfaceMaterial)
    assert.ok(surfaceMeshes[0].position.z > 0)
    assert.equal(surfaceMeshes[0].geometry.parameters.shapes.holes.length, 1)
})

test('PcbScene3dViaFactory hides copper barrels tented on both board sides', () => {
    const copperMaterial = new THREE.MeshStandardMaterial({ color: 0xcaa24e })
    const surfaceMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6b2b })
    const group = PcbScene3dViaFactory.buildGroup(
        THREE,
        [
            {
                x: 20,
                y: 30,
                diameter: 60,
                holeDiameter: 40,
                barrelOnly: true,
                isTentingTop: true,
                isTentingBottom: true
            }
        ],
        63,
        (x, y) => ({ x, y }),
        { material: copperMaterial, surfaceMaterial }
    )
    const copperMeshes = group.children.filter(
        (mesh) => mesh.material === copperMaterial
    )
    const surfaceMeshes = group.children.filter(
        (mesh) => mesh.material === surfaceMaterial
    )

    assert.equal(copperMeshes.length, 0)
    assert.equal(surfaceMeshes.length, 2)
})

test('PcbScene3dViaFactory respects blind, buried, and through via spans', () => {
    const boardThickness = 64
    const group = PcbScene3dViaFactory.buildGroup(
        THREE,
        [
            {
                x: -30,
                y: 0,
                diameter: 24,
                holeDiameter: 10,
                layers: ['top', 'inner2']
            },
            {
                x: -10,
                y: 0,
                diameter: 24,
                holeDiameter: 10,
                fromLayer: 'inner2',
                toLayer: 'bottom'
            },
            {
                x: 10,
                y: 0,
                diameter: 24,
                holeDiameter: 10,
                layers: ['inner1', 'inner3']
            },
            {
                x: 30,
                y: 0,
                diameter: 24,
                holeDiameter: 10,
                from_layer: 'top',
                to_layer: 'bottom'
            }
        ],
        boardThickness,
        (x, y) => ({ x, y })
    )
    const topBlind = group.children.find((mesh) => mesh.position.x === -30)
    const bottomBlind = group.children.find((mesh) => mesh.position.x === -10)
    const buried = group.children.find((mesh) => mesh.position.x === 10)
    const through = group.children.find((mesh) => mesh.position.x === 30)
    const topBounds = worldZBounds(topBlind)
    const bottomBounds = worldZBounds(bottomBlind)
    const throughBounds = worldZBounds(through)

    assert.equal(group.children.length, 3)
    assert.ok(topBlind)
    assert.ok(bottomBlind)
    assert.equal(buried, undefined)
    assert.ok(through)
    assert.ok(topBounds.min >= boardThickness / 2 - 1.1)
    assert.ok(topBounds.max <= boardThickness / 2 + 1.1)
    assert.ok(bottomBounds.min >= -boardThickness / 2 - 1.1)
    assert.ok(bottomBounds.max <= -boardThickness / 2 + 1.1)
    assert.ok(throughBounds.min < -boardThickness / 2)
    assert.ok(throughBounds.max > boardThickness / 2)
})

/**
 * Resolves world-space Z bounds for one mesh.
 * @param {THREE.Mesh} mesh Mesh to inspect.
 * @returns {{ min: number, max: number }}
 */
function worldZBounds(mesh) {
    mesh.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(mesh)
    return { min: bounds.min.z, max: bounds.max.z }
}

/**
 * Counts side-wall triangles that lie on a circular drill contour.
 * @param {any} geometry
 * @param {number} radius
 * @returns {number}
 */
function countCircularDrillWallTriangles(geometry, radius) {
    const position = geometry.getAttribute('position')
    let count = 0

    for (const group of geometry.groups) {
        if (Number(group.materialIndex) === 0) {
            continue
        }

        const end = Number(group.start || 0) + Number(group.count || 0)
        for (let index = Number(group.start || 0); index < end; index += 3) {
            if (triangleMatchesCircularContour(position, index, radius)) {
                count += 1
            }
        }
    }

    return count
}

/**
 * Counts face triangles whose centroid sits inside a circular drill.
 * @param {any} geometry
 * @param {number} radius
 * @returns {number}
 */
function countCircularDrillFaceCapTriangles(geometry, radius) {
    const position = geometry.getAttribute('position')
    let count = 0

    for (const group of geometry.groups) {
        if (Number(group.materialIndex) !== 0) {
            continue
        }

        const end = Number(group.start || 0) + Number(group.count || 0)
        for (let index = Number(group.start || 0); index < end; index += 3) {
            if (triangleCentroidRadius(position, index) < radius - 0.01) {
                count += 1
            }
        }
    }

    return count
}

/**
 * Resolves the XY radius of one triangle centroid.
 * @param {any} position
 * @param {number} vertexIndex
 * @returns {number}
 */
function triangleCentroidRadius(position, vertexIndex) {
    let x = 0
    let y = 0

    for (let offset = 0; offset < 3; offset += 1) {
        const index = vertexIndex + offset
        x += position.getX(index)
        y += position.getY(index)
    }

    return Math.hypot(x / 3, y / 3)
}

/**
 * Checks whether one triangle is part of a circular drill wall.
 * @param {any} position
 * @param {number} vertexIndex
 * @param {number} radius
 * @returns {boolean}
 */
function triangleMatchesCircularContour(position, vertexIndex, radius) {
    let matchedVertices = 0

    for (let offset = 0; offset < 3; offset += 1) {
        const index = vertexIndex + offset
        const vertexRadius = Math.hypot(
            position.getX(index),
            position.getY(index)
        )
        if (Math.abs(vertexRadius - radius) < 0.01) {
            matchedVertices += 1
        }
    }

    return matchedVertices >= 2
}
