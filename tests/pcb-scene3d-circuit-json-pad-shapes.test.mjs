import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dPadFactory } from '../src/PcbScene3dPadFactory.mjs'

/**
 * Builds a minimal board for adapter pad-shape tests.
 * @returns {object}
 */
function createBoard() {
    return {
        type: 'pcb_board',
        pcb_board_id: 'board_1',
        center: { x: 0, y: 0 },
        width: 10,
        height: 10,
        thickness: 1.6
    }
}

test('PcbScene3dCircuitJsonAdapter maps pill SMT pads to rounded rectangles', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'pill_pad',
            x: 2,
            y: 2,
            layer: 'top',
            shape: 'rotated_pill',
            width: 2,
            height: 1,
            ccw_rotation: 30
        }
    ])
    const [pad] = renderModel.detail.pads
    const surface = PcbScene3dPadFactory.resolvePadSurfaceSpec(pad, 'top')

    assert.equal(pad.rotation, 30)
    assert.equal(pad.shapeTop, 2)
    assert.equal(pad.hasRoundedRect, true)
    assert.equal(pad.roundedRectShapeTop, 2)
    assert.equal(pad.cornerRadiusTop, 50)
    assert.equal(surface.kind, 'rounded-rect')
    assert.equal(Math.round(surface.cornerRadius), 20)
})
