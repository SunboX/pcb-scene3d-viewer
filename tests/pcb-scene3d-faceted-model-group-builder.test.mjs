import assert from 'node:assert/strict'
import test from 'node:test'

import * as THREE from 'three'

import { PcbScene3dFacetedModelGroupBuilder } from '../src/PcbScene3dFacetedModelGroupBuilder.mjs'

test('PcbScene3dFacetedModelGroupBuilder preserves vertex alpha', () => {
    const group = PcbScene3dFacetedModelGroupBuilder.build(THREE, [
        {
            name: 'alpha-triangle',
            vertices: [
                [0, 0, 0],
                [1, 0, 0],
                [0, 1, 0]
            ],
            faces: [[0, 1, 2]],
            vertexColors: [
                [1, 0, 0, 1],
                [0, 1, 0, 0.5],
                [0, 0, 1, 0.25]
            ]
        }
    ])
    const mesh = group.children[0]
    const colors = mesh.geometry.getAttribute('color')

    assert.equal(colors.itemSize, 4)
    assert.deepEqual(
        Array.from(colors.array),
        [1, 0, 0, 1, 0, 1, 0, 0.5, 0, 0, 1, 0.25]
    )
    assert.equal(mesh.material.vertexColors, true)
    assert.equal(mesh.material.transparent, true)
})
