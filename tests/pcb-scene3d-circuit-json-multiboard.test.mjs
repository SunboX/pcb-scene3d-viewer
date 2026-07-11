import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'

/**
 * Resolves point bounds.
 * @param {{ x: number, y: number }[]} points Points.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }} Bounds.
 */
function pointBounds(points) {
    return points.reduce(
        (bounds, point) => ({
            minX: Math.min(bounds.minX, point.x),
            minY: Math.min(bounds.minY, point.y),
            maxX: Math.max(bounds.maxX, point.x),
            maxY: Math.max(bounds.maxY, point.y)
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    )
}

test('PcbScene3dCircuitJsonAdapter preserves every board and targeted cutout', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_a',
            center: { x: 0, y: 0 },
            width: 20,
            height: 20,
            thickness: 1.6
        },
        {
            type: 'pcb_board',
            pcb_board_id: 'board_b',
            center: { x: 50, y: 0 },
            width: 20,
            height: 20,
            thickness: 1.6
        },
        {
            type: 'pcb_cutout',
            pcb_cutout_id: 'matching',
            pcb_board_id: 'board_a',
            shape: 'rect',
            center: { x: 1, y: 2 },
            width: 2,
            height: 6,
            ccw_rotation: 90
        },
        {
            type: 'pcb_cutout',
            pcb_cutout_id: 'global',
            shape: 'circle',
            center: { x: -2, y: -2 },
            radius: 1
        },
        {
            type: 'pcb_cutout',
            pcb_cutout_id: 'other-board',
            pcb_board_id: 'board_b',
            shape: 'rect',
            center: { x: 3, y: 3 },
            width: 2,
            height: 2
        }
    ])
    const sourceIds = renderModel.board.cutouts.map((cutout) => cutout.sourceId)
    const contourIds = renderModel.board.contours.map(
        (contour) => contour.sourceId
    )
    const rotated = renderModel.board.cutouts.find(
        (cutout) => cutout.sourceId === 'matching'
    )
    const bounds = pointBounds(rotated.points)

    assert.deepEqual(contourIds, ['board_a', 'board_b'])
    assert.deepEqual(sourceIds, ['matching', 'global', 'other-board'])
    assert.deepEqual(
        renderModel.board.contours.map((contour) =>
            contour.cutouts.map((cutout) => cutout.sourceId)
        ),
        [
            ['matching', 'global'],
            ['global', 'other-board']
        ]
    )
    assert.equal(Math.round(renderModel.board.widthMil), 2756)
    assert.equal(Math.round(bounds.maxX - bounds.minX), 236)
    assert.equal(Math.round(bounds.maxY - bounds.minY), 79)
})

test('PcbScene3dCircuitJsonAdapter renders panels instead of duplicating child boards', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_panel',
            pcb_panel_id: 'panel_a',
            center: { x: 0, y: 0 },
            width: 15,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'pcb_panel',
            pcb_panel_id: 'panel_b',
            center: { x: 25, y: 0 },
            width: 15,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'pcb_board',
            pcb_board_id: 'panel_a_child',
            pcb_panel_id: 'panel_a',
            center: { x: 0, y: 0 },
            width: 10,
            height: 8,
            thickness: 1.6
        }
    ])

    assert.deepEqual(
        renderModel.board.contours.map((contour) => contour.sourceId),
        ['panel_a', 'panel_b']
    )
    assert.equal(Math.round(renderModel.board.widthMil), 1575)
})
