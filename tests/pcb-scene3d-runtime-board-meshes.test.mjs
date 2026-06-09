import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dRuntimeBoardMeshes } from '../src/PcbScene3dRuntimeBoardMeshes.mjs'

test('PcbScene3dRuntimeBoardMeshes keeps ordinary board faces front-sided in every preset', () => {
    assert.equal(
        PcbScene3dRuntimeBoardMeshes.resolveBoardFaceSide(THREE, 'bottom', {}),
        THREE.FrontSide
    )
})

test('PcbScene3dRuntimeBoardMeshes uses back-sided faces for board assembly bottom views', () => {
    assert.equal(
        PcbScene3dRuntimeBoardMeshes.resolveBoardFaceSide(THREE, 'bottom', {
            boardAssemblyModel: {
                origin: 'board-assembly',
                name: 'Assembly.step'
            }
        }),
        THREE.BackSide
    )
})

test('PcbScene3dRuntimeBoardMeshes keeps board assembly faces front-sided in top views', () => {
    assert.equal(
        PcbScene3dRuntimeBoardMeshes.resolveBoardFaceSide(THREE, 'top', {
            boardAssemblyModel: {
                origin: 'board-assembly',
                name: 'Assembly.step'
            }
        }),
        THREE.FrontSide
    )
})

test('PcbScene3dRuntimeBoardMeshes marks generated board meshes for face-side switching', () => {
    const boardMesh = PcbScene3dRuntimeBoardMeshes.buildBoardMesh(
        THREE,
        {
            board: {
                widthMil: 1000,
                heightMil: 500,
                thicknessMil: 62,
                segments: []
            },
            detail: {
                pads: [],
                vias: []
            }
        },
        (x, y) => ({ x, y })
    )

    assert.equal(boardMesh.userData.scene3dBoardFaceMaterial, true)
})

test('PcbScene3dRuntimeBoardMeshes updates only generated board shell face materials', () => {
    const boardFaceMaterial = {
        side: THREE.FrontSide,
        needsUpdate: false
    }
    const boardEdgeMaterial = {
        side: THREE.DoubleSide,
        needsUpdate: false
    }
    const unrelatedFaceMaterial = {
        side: THREE.FrontSide,
        needsUpdate: false
    }
    const boardGroup = {
        children: [
            {
                userData: {
                    scene3dBoardFaceMaterial: true
                },
                material: [boardFaceMaterial, boardEdgeMaterial]
            },
            {
                material: [unrelatedFaceMaterial]
            }
        ]
    }

    PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide(
        THREE,
        boardGroup,
        'bottom',
        {
            boardAssemblyModel: {
                origin: 'board-assembly',
                name: 'Assembly.step'
            }
        }
    )

    assert.equal(boardFaceMaterial.side, THREE.BackSide)
    assert.equal(boardFaceMaterial.needsUpdate, true)
    assert.equal(boardEdgeMaterial.side, THREE.DoubleSide)
    assert.equal(boardEdgeMaterial.needsUpdate, false)
    assert.equal(unrelatedFaceMaterial.side, THREE.FrontSide)
    assert.equal(unrelatedFaceMaterial.needsUpdate, false)
})
