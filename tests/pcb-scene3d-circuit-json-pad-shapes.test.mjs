import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dDrillPathFactory } from '../src/PcbScene3dDrillPathFactory.mjs'
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

/**
 * Builds a rotated rectangular outline around one center.
 * @param {{ x: number, y: number }} center Rectangle center.
 * @param {number} width Rectangle width.
 * @param {number} height Rectangle height.
 * @param {number} rotationDeg Counter-clockwise board-space rotation.
 * @returns {{ x: number, y: number }[]}
 */
function rotatedRectangle(center, width, height, rotationDeg) {
    const angle = (rotationDeg * Math.PI) / 180
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    return [
        [-width / 2, -height / 2],
        [width / 2, -height / 2],
        [width / 2, height / 2],
        [-width / 2, height / 2]
    ].map(([x, y]) => ({
        x: center.x + x * cosine - y * sine,
        y: center.y + x * sine + y * cosine
    }))
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

test('PcbScene3dCircuitJsonAdapter preserves polygon-plated pill slot geometry', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'plated_slot',
            shape: 'hole_with_polygon_pad',
            hole_shape: 'pill',
            x: 2,
            y: 3,
            hole_width: 2.6,
            hole_height: 0.6,
            pad_outline: [
                { x: 0.7, y: 2.7 },
                { x: 3.3, y: 2.7 },
                { x: 3.3, y: 3.3 },
                { x: 0.7, y: 3.3 }
            ],
            ccw_rotation: 0,
            layers: ['top', 'bottom']
        }
    ])
    const [pad] = renderModel.detail.pads
    const surface = PcbScene3dPadFactory.resolvePadSurfaceSpec(pad, 'top')

    assert.equal(pad.shapeTop, 2)
    assert.ok(Math.abs(pad.sizeTopX - (2.6 * 1000) / 25.4) < 1e-5)
    assert.ok(Math.abs(pad.sizeTopY - (0.6 * 1000) / 25.4) < 1e-5)
    assert.ok(Math.abs(pad.holeDiameter - (0.6 * 1000) / 25.4) < 1e-5)
    assert.ok(Math.abs(pad.holeSlotLength - (2.6 * 1000) / 25.4) < 1e-5)
    assert.equal(surface.kind, 'rect')
})

test('PcbScene3dCircuitJsonAdapter keeps diagonal and vertical slots in board space', () => {
    for (const rotation of [45, 90]) {
        const center = { x: 2, y: 3 }
        const renderModel = PcbScene3dCircuitJsonAdapter.build([
            createBoard(),
            {
                type: 'pcb_plated_hole',
                pcb_plated_hole_id: 'plated_slot_' + rotation,
                shape: 'hole_with_polygon_pad',
                hole_shape: 'pill',
                x: center.x,
                y: center.y,
                hole_width: 2.6,
                hole_height: 0.6,
                pad_outline: rotatedRectangle(center, 2.6, 0.6, rotation),
                ccw_rotation: rotation,
                layers: ['top', 'bottom']
            }
        ])
        const [pad] = renderModel.detail.pads
        const [drill] = PcbScene3dDrillPathFactory.resolveBoardDrillSpecs(
            renderModel.detail
        )

        assert.ok(Math.abs(pad.sizeTopX - (2.6 * 1000) / 25.4) < 1e-4)
        assert.ok(Math.abs(pad.sizeTopY - (0.6 * 1000) / 25.4) < 1e-4)
        assert.equal(pad.rotation, rotation)
        assert.equal(pad.holeRotation, rotation)
        assert.ok(drill.slotLength > drill.diameter)
        assert.equal(drill.rotationDeg, rotation)
    }
})

test('PcbScene3dCircuitJsonAdapter preserves independent rect-pad and slot variants', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'independent_slot',
            shape: 'rotated_pill_hole_with_rect_pad',
            pad_shape: 'rect',
            x: 2,
            y: 3,
            rect_pad_width: 4.5,
            rect_pad_height: 2.5,
            rect_ccw_rotation: 20,
            hole_shape: 'rotated_pill',
            hole_width: 2.8,
            hole_height: 0.8,
            hole_ccw_rotation: 70,
            layers: ['top', 'bottom']
        }
    ])
    const [pad] = renderModel.detail.pads
    const [drill] = PcbScene3dDrillPathFactory.resolveBoardDrillSpecs(
        renderModel.detail
    )

    assert.ok(Math.abs(pad.sizeTopX - (4.5 * 1000) / 25.4) < 1e-5)
    assert.ok(Math.abs(pad.sizeTopY - (2.5 * 1000) / 25.4) < 1e-5)
    assert.equal(pad.rotation, 20)
    assert.equal(pad.holeRotation, 70)
    assert.ok(drill.slotLength > drill.diameter)
    assert.equal(drill.rotationDeg, 70)
})

test('PcbScene3dCircuitJsonAdapter preserves square drill apertures', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'pcb_hole',
            pcb_hole_id: 'square_hole',
            hole_shape: 'square',
            hole_diameter: 1.2,
            ccw_rotation: 30,
            x: 2,
            y: 3
        }
    ])
    const [pad] = renderModel.detail.pads
    const [drill] = PcbScene3dDrillPathFactory.resolveBoardDrillSpecs(
        renderModel.detail
    )

    assert.equal(pad.holeShape, 1)
    assert.ok(Math.abs(pad.holeWidth - (1.2 * 1000) / 25.4) < 1e-5)
    assert.ok(Math.abs(pad.holeHeight - (1.2 * 1000) / 25.4) < 1e-5)
    assert.equal(drill.shape, 'rect')
    assert.ok(Math.abs(drill.width - (1.2 * 1000) / 25.4) < 1e-5)
    assert.ok(Math.abs(drill.height - (1.2 * 1000) / 25.4) < 1e-5)
    assert.equal(drill.rotationDeg, 30)
})
