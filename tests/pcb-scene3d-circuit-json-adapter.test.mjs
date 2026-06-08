import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'

/**
 * Builds a small serialized CircuitJSON PCB sample.
 * @returns {object[]}
 */
function createCircuitJsonSample() {
    return [
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 10, y: 5 },
            width: 20,
            height: 10,
            thickness: 1.6,
            outline: [
                { x: 0, y: 0 },
                { x: 20, y: 0 },
                { x: 20, y: 10 },
                { x: 0, y: 10 }
            ]
        },
        {
            type: 'source_component',
            source_component_id: 'source_r1',
            name: 'R1',
            ftype: 'simple_resistor'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_r1',
            source_component_id: 'source_r1',
            center: { x: 6, y: 4 },
            layer: 'top',
            rotation: 90,
            width: 2,
            height: 1
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'pad_1',
            pcb_component_id: 'pcb_r1',
            x: 5,
            y: 4,
            layer: 'top',
            shape: 'rect',
            width: 1.2,
            height: 0.7,
            port_hints: ['1']
        },
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'hole_1',
            pcb_component_id: 'pcb_r1',
            x: 6,
            y: 4,
            shape: 'circle',
            outer_diameter: 1.4,
            hole_diameter: 0.8,
            layers: ['top', 'bottom']
        },
        {
            type: 'pcb_via',
            pcb_via_id: 'via_1',
            x: 8,
            y: 6,
            outer_diameter: 0.8,
            hole_diameter: 0.3,
            layers: ['top', 'bottom']
        },
        {
            type: 'pcb_trace',
            pcb_trace_id: 'trace_1',
            route: [
                {
                    route_type: 'wire',
                    x: 1,
                    y: 1,
                    width: 0.25,
                    layer: 'top'
                },
                {
                    route_type: 'wire',
                    x: 4,
                    y: 1,
                    width: 0.25,
                    layer: 'top'
                }
            ]
        }
    ]
}

test('PcbScene3dCircuitJsonAdapter builds a core render model from serialized CircuitJSON', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build(
        createCircuitJsonSample()
    )

    assert.equal(renderModel.sourceFormat, 'circuitjson')
    assert.equal(Math.round(renderModel.board.widthMil), 787)
    assert.equal(Math.round(renderModel.board.heightMil), 394)
    assert.equal(renderModel.board.segments.length, 4)

    assert.equal(renderModel.components.length, 1)
    assert.equal(renderModel.components[0].designator, 'R1')
    assert.equal(renderModel.components[0].mountSide, 'top')
    assert.equal(Math.round(renderModel.components[0].body.sizeMil.width), 79)

    assert.equal(renderModel.detail.pads.length, 2)
    assert.equal(renderModel.detail.vias.length, 1)
    assert.equal(renderModel.detail.tracks.length, 1)
    assert.equal(renderModel.detail.tracks[0].layerId, 1)
})

test('PcbScene3dCircuitJsonAdapter ignores hidden compatibility fields', () => {
    const circuitJson = createCircuitJsonSample()
    Object.defineProperty(circuitJson, 'pcb', {
        enumerable: false,
        value: {
            boardOutline: {
                widthMil: 1,
                heightMil: 1
            },
            components: [
                {
                    designator: 'SHOULD_NOT_RENDER'
                }
            ]
        }
    })

    const renderModel = PcbScene3dCircuitJsonAdapter.build(circuitJson)

    assert.equal(renderModel.components[0].designator, 'R1')
    assert.notEqual(renderModel.board.widthMil, 1)
})
