import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dRuntimeBoardMeshes } from '../src/PcbScene3dRuntimeBoardMeshes.mjs'

test('PcbScene3dRuntimeBoardMeshes renders generated board faces double-sided', () => {
    assert.equal(
        PcbScene3dRuntimeBoardMeshes.resolveBoardFaceSide(THREE, 'bottom', {}),
        THREE.DoubleSide
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

test('PcbScene3dRuntimeBoardMeshes renders generated solder mask as semi matte', () => {
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
    const faceMaterial = boardMesh.material[0]

    assert.equal(faceMaterial.roughness, 0.56)
    assert.equal(faceMaterial.metalness, 0)
})

test('PcbScene3dRuntimeBoardMeshes builds every disjoint board contour', () => {
    const board = {
        widthMil: 300,
        heightMil: 100,
        thicknessMil: 62,
        centerX: 0,
        centerY: 0,
        segments: [],
        contours: [
            {
                widthMil: 100,
                heightMil: 100,
                thicknessMil: 62,
                centerX: 0,
                centerY: 0,
                segments: [
                    { type: 'line', x1: -150, y1: -50, x2: -50, y2: -50 },
                    { type: 'line', x1: -50, y1: -50, x2: -50, y2: 50 },
                    { type: 'line', x1: -50, y1: 50, x2: -150, y2: 50 },
                    { type: 'line', x1: -150, y1: 50, x2: -150, y2: -50 }
                ],
                cutouts: []
            },
            {
                widthMil: 100,
                heightMil: 100,
                thicknessMil: 62,
                centerX: 0,
                centerY: 0,
                segments: [
                    { type: 'line', x1: 50, y1: -50, x2: 150, y2: -50 },
                    { type: 'line', x1: 150, y1: -50, x2: 150, y2: 50 },
                    { type: 'line', x1: 150, y1: 50, x2: 50, y2: 50 },
                    { type: 'line', x1: 50, y1: 50, x2: 50, y2: -50 }
                ],
                cutouts: []
            }
        ]
    }
    const boardMesh = PcbScene3dRuntimeBoardMeshes.buildBoardMesh(
        THREE,
        { board, detail: { pads: [], vias: [] } },
        (x, y) => ({ x, y })
    )
    const outline = PcbScene3dRuntimeBoardMeshes.buildBoardOutline(
        THREE,
        { board, detail: { pads: [], vias: [] } },
        (x, y) => ({ x, y })
    )

    assert.equal(boardMesh.isGroup, true)
    assert.equal(boardMesh.children.length, 2)
    assert.equal(outline.isGroup, true)
    assert.equal(outline.children.length, 2)
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
