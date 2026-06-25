import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'

/**
 * Builds a minimal board for adapter route tests.
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

test('PcbScene3dCircuitJsonAdapter maps route vias and adjacent surface traces', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'pcb_trace',
            pcb_trace_id: 'trace_with_via',
            route: [
                {
                    route_type: 'wire',
                    x: 1,
                    y: 1,
                    width: 0.2,
                    layer: 'top'
                },
                {
                    route_type: 'via',
                    x: 2,
                    y: 1,
                    from_layer: 'top',
                    to_layer: 'bottom',
                    via_diameter: 0.4
                },
                {
                    route_type: 'wire',
                    x: 2,
                    y: 3,
                    width: 0.2,
                    layer: '32'
                }
            ]
        }
    ])
    const [topTrack, bottomTrack] = renderModel.detail.tracks
    const [via] = renderModel.detail.vias

    assert.equal(renderModel.detail.vias.length, 1)
    assert.equal(Math.round(via.x), 79)
    assert.equal(Math.round(via.y), 39)
    assert.equal(Math.round(via.diameter), 16)
    assert.equal(Math.round(via.holeDiameter), 8)
    assert.equal(renderModel.detail.tracks.length, 2)
    assert.equal(topTrack.layerId, 1)
    assert.equal(Math.round(topTrack.x1), 39)
    assert.equal(Math.round(topTrack.x2), 79)
    assert.equal(bottomTrack.layerId, 32)
    assert.equal(Math.round(bottomTrack.y1), 39)
    assert.equal(Math.round(bottomTrack.y2), 118)
})

test('PcbScene3dCircuitJsonAdapter skips inner-only route vias and tracks', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'pcb_trace',
            pcb_trace_id: 'inner_route',
            route: [
                {
                    route_type: 'wire',
                    x: 0,
                    y: 0,
                    width: 0.15,
                    layer: 'top'
                },
                {
                    route_type: 'via',
                    x: 1,
                    y: 0,
                    from_layer: 'top',
                    to_layer: 'inner2',
                    via_diameter: 0.3
                },
                {
                    route_type: 'wire',
                    x: 2,
                    y: 0,
                    width: 0.15,
                    layer: 'inner2'
                },
                {
                    route_type: 'via',
                    x: 3,
                    y: 0,
                    from_layer: 'inner2',
                    to_layer: 'inner3',
                    via_diameter: 0.3
                },
                {
                    route_type: 'wire',
                    x: 4,
                    y: 0,
                    width: 0.15,
                    layer: 'inner3'
                }
            ]
        }
    ])

    assert.equal(renderModel.detail.vias.length, 1)
    assert.equal(Math.round(renderModel.detail.vias[0].x), 39)
    assert.equal(renderModel.detail.tracks.length, 1)
    assert.equal(renderModel.detail.tracks[0].layerId, 1)
    assert.equal(Math.round(renderModel.detail.tracks[0].x2), 39)
})

test('PcbScene3dCircuitJsonAdapter maps through-pad route tracks', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'pcb_trace',
            pcb_trace_id: 'through_pad_trace',
            route: [
                {
                    route_type: 'through_pad',
                    start: { x: 1, y: 1 },
                    end: { x: 3, y: 1 },
                    width: 0.25,
                    start_layer: 'top',
                    end_layer: 'bottom',
                    pcb_plated_hole_id: 'hole_1'
                }
            ]
        }
    ])
    const [track] = renderModel.detail.tracks

    assert.equal(renderModel.detail.tracks.length, 1)
    assert.equal(track.layerId, 1)
    assert.equal(Math.round(track.x1), 39)
    assert.equal(Math.round(track.x2), 118)
    assert.equal(Math.round(track.width), 10)
})
