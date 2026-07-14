import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dCopperDetailFilter } from '../src/PcbScene3dCopperDetailFilter.mjs'

/**
 * Builds one canonical board for text projection tests.
 * @returns {object}
 */
function board() {
    return {
        type: 'pcb_board',
        pcb_board_id: 'board_1',
        center: { x: 0, y: 0 },
        width: 20,
        height: 10,
        thickness: 1.6
    }
}

/**
 * Builds one board-owned canonical note-text row.
 * @param {object} overrides Field overrides.
 * @returns {object}
 */
function noteText(overrides = {}) {
    return {
        type: 'pcb_note_text',
        pcb_note_text_id: 'text_1',
        text: 'OPEN MARK',
        anchor_position: { x: 2.54, y: 1.27 },
        layer: 'top',
        source_layer: 'F.Cu',
        source_type: 'gr_text',
        ccw_rotation: 30,
        font_size: 1.27,
        font_width: 0.762,
        font_height: 1.524,
        stroke_width: 0.127,
        anchor_alignment: 'center',
        source_anchor_alignment: 'bottom_left',
        is_mirrored_from_top_view: true,
        is_hidden: false,
        ...overrides
    }
}

/**
 * Builds one component-owned canonical fabrication-text row.
 * @param {object} overrides Field overrides.
 * @returns {object}
 */
function fabricationText(overrides = {}) {
    return {
        type: 'pcb_fabrication_note_text',
        pcb_fabrication_note_text_id: 'fabrication_text_1',
        pcb_component_id: 'component_1',
        text: 'OWNED MARK',
        anchor_position: { x: -2.54, y: -1.27 },
        layer: 'top',
        source_layer: 'F.Cu',
        source_type: 'fp_text',
        ccw_rotation: 15,
        font_size: 1.27,
        font_width: 0.762,
        font_height: 1.524,
        stroke_width: 0.127,
        anchor_alignment: 'center',
        source_anchor_alignment: 'center_left',
        is_mirrored: false,
        is_hidden: false,
        ...overrides
    }
}

test('direct CircuitJSON maps paired copper and mask text to one exposed copper primitive', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        noteText(),
        noteText({
            pcb_note_text_id: 'mask_1',
            source_layer: 'F.Mask',
            font_width: 0.762,
            font_height: 1.524,
            stroke_width: 0.2032,
            source_anchor_alignment: 'bottom_left'
        })
    ])
    const [text] = scene.detail.copperTexts

    assert.equal(scene.detail.copperTexts.length, 1)
    assert.deepEqual(text, {
        sourceId: 'text_1',
        sourceType: 'gr_text',
        x: 100,
        y: 50,
        value: 'OPEN MARK',
        layer: 'F.Cu',
        side: 'front',
        layerId: 1,
        rotation: 30,
        mirrored: true,
        hAlign: 'left',
        vAlign: 'bottom',
        sizeX: 30,
        sizeY: 60,
        thickness: 5,
        hasSolderMask: false,
        solderMaskOpening: true
    })
    assert.deepEqual(PcbScene3dCopperDetailFilter.resolve(scene).copperTexts, [
        text
    ])
})

test('direct CircuitJSON pairs equivalent text rotations across full turns', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        noteText({ ccw_rotation: 0 }),
        noteText({
            pcb_note_text_id: 'mask_full_turn',
            source_layer: 'F.Mask',
            ccw_rotation: 360,
            stroke_width: 0.2032
        })
    ])

    assert.equal(scene.detail.copperTexts[0].solderMaskOpening, true)
})

test('direct CircuitJSON pairs source mask text only when its stroke geometry covers copper', () => {
    const opensWithMask = (maskOverrides) => {
        const scene = PcbScene3dCircuitJsonAdapter.build([
            board(),
            noteText(),
            noteText({
                pcb_note_text_id: 'candidate_mask',
                source_layer: 'F.Mask',
                stroke_width: 0.2032,
                ...maskOverrides
            })
        ])
        return scene.detail.copperTexts[0].solderMaskOpening
    }

    assert.equal(
        opensWithMask({
            font_width: 0.381,
            font_height: 0.762,
            stroke_width: 0.0635
        }),
        false
    )
    assert.equal(
        opensWithMask({
            anchor_position: { x: 2.794, y: 1.27 }
        }),
        false
    )
    assert.equal(
        opensWithMask({
            source_anchor_alignment: 'top_right'
        }),
        false
    )
})

test('direct CircuitJSON keeps unpaired copper text covered and excludes hidden or inner-layer text', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        noteText({
            pcb_note_text_id: 'covered_bottom',
            source_layer: 'B.Cu',
            layer: 'bottom',
            is_mirrored_from_top_view: false
        }),
        noteText({
            pcb_note_text_id: 'different_mask',
            source_layer: 'B.Mask',
            layer: 'bottom',
            text: 'OTHER MARK'
        }),
        noteText({
            pcb_note_text_id: 'inner_copper',
            source_layer: 'In1.Cu'
        }),
        noteText({
            pcb_note_text_id: 'hidden_copper',
            is_hidden: true
        })
    ])
    const [text] = scene.detail.copperTexts

    assert.equal(scene.detail.copperTexts.length, 1)
    assert.equal(text.sourceId, 'covered_bottom')
    assert.equal(text.layer, 'B.Cu')
    assert.equal(text.side, 'back')
    assert.equal(text.layerId, 32)
    assert.equal(text.hasSolderMask, true)
    assert.equal(text.solderMaskOpening, false)
    assert.deepEqual(
        PcbScene3dCopperDetailFilter.resolve(scene).copperTexts,
        []
    )
})

test('direct CircuitJSON includes component-owned copper text without note-layer duplicates', () => {
    const circuitJson = [
        board(),
        fabricationText(),
        fabricationText({
            pcb_fabrication_note_text_id: 'fabrication_mask_1',
            source_layer: 'F.Mask',
            font_width: 0.762,
            font_height: 1.524,
            stroke_width: 0.2032
        })
    ]
    const scene = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
        showPcbNotes: true
    })
    const [text] = scene.detail.copperTexts

    assert.equal(scene.detail.copperTexts.length, 1)
    assert.equal(text.sourceId, 'fabrication_text_1')
    assert.equal(text.sourceType, 'fp_text')
    assert.equal(text.solderMaskOpening, true)
    assert.equal(scene.detail.silkscreen.top.texts.length, 0)
})
