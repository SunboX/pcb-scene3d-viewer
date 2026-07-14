import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dCopperDetailFilter } from '../src/PcbScene3dCopperDetailFilter.mjs'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'

/**
 * Builds a neutral canonical board for surface-detail tests.
 * @returns {object}
 */
function board() {
    return {
        type: 'pcb_board',
        pcb_board_id: 'board_surface_detail',
        center: { x: 0, y: 0 },
        width: 20,
        height: 12,
        thickness: 1.6
    }
}

/**
 * Finds one named object in a Three.js group tree.
 * @param {any} root Root group.
 * @param {string} name Object name.
 * @returns {any | null}
 */
function findObjectByName(root, name) {
    if (root?.name === name) return root
    for (const child of root?.children || []) {
        const match = findObjectByName(child, name)
        if (match) return match
    }
    return null
}

test('direct CircuitJSON projects canonical copper text into scene detail', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        {
            type: 'pcb_copper_text',
            pcb_copper_text_id: 'canonical_text_1',
            pcb_component_id: 'component_1',
            text: 'NET A',
            anchor_position: { x: 2.54, y: -1.27 },
            anchor_alignment: 'center_right',
            ccw_rotation: 25,
            font_size: 1.27,
            is_mirrored: false,
            layer: 'top'
        }
    ])

    assert.equal(scene.detail.copperTexts.length, 1)
    assert.deepEqual(scene.detail.copperTexts[0], {
        sourceId: 'canonical_text_1',
        sourceType: '',
        x: 100,
        y: -50,
        value: 'NET A',
        rotation: 25,
        mirrored: false,
        hAlign: 'right',
        vAlign: 'center',
        sizeX: 50,
        sizeY: 50,
        thickness: 4.724409,
        layer: 'F.Cu',
        side: 'front',
        layerId: 1,
        hasSolderMask: true,
        solderMaskOpening: false
    })
})

test('realistic masking renders covered canonical copper text with mask relief', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        {
            type: 'pcb_copper_text',
            pcb_copper_text_id: 'covered_text_1',
            pcb_component_id: 'component_1',
            text: 'MASKED',
            anchor_position: { x: 0, y: 0 },
            anchor_alignment: 'center',
            font_size: 1,
            layer: 'top'
        }
    ])
    const covered = PcbScene3dCopperDetailFilter.resolveCoveredByMask(scene)

    assert.equal(
        PcbScene3dCopperDetailFilter.resolve(scene).copperTexts.length,
        0
    )
    assert.equal(covered.copperTexts.length, 1)

    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        covered,
        5,
        -5,
        (x, y) => ({ x, y }),
        { solderMaskColor: 0x2a5f27 }
    )
    const mesh = findObjectByName(group, 'mask-covered-copper-text')

    assert.ok(mesh)
    assert.notEqual(mesh.material.color.getHex(), 0xd9a61d)
})
