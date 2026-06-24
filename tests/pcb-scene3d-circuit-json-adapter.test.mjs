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

test('PcbScene3dCircuitJsonAdapter builds panels and board cutouts', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_panel',
            pcb_panel_id: 'panel_1',
            center: { x: 5, y: 4 },
            width: 30,
            height: 16,
            thickness: 1.2,
            outline: [
                { x: -10, y: -4 },
                { x: 20, y: -4 },
                { x: 20, y: 12 },
                { x: -10, y: 12 }
            ]
        },
        {
            type: 'pcb_cutout',
            pcb_cutout_id: 'cutout_1',
            shape: 'rect',
            center: { x: 5, y: 4 },
            width: 4,
            height: 2
        }
    ])

    assert.equal(Math.round(renderModel.board.widthMil), 1181)
    assert.equal(Math.round(renderModel.board.heightMil), 630)
    assert.equal(Math.round(renderModel.board.thicknessMil), 47)
    assert.equal(renderModel.board.segments.length, 4)
    assert.equal(renderModel.board.cutouts.length, 1)
    assert.equal(renderModel.board.cutouts[0].points.length, 4)
})

test('PcbScene3dCircuitJsonAdapter exposes component model metadata', () => {
    const modelFields = [
        ['model_step_url', 'step', '/models/u1.step'],
        ['model_wrl_url', 'wrl', '/models/j1.wrl'],
        ['model_glb_url', 'glb', '/models/x1.glb'],
        ['model_gltf_url', 'gltf', '/models/x2.gltf'],
        ['model_stl_url', 'stl', '/models/x3.stl'],
        ['model_obj_url', 'obj', '/models/x4.obj']
    ]
    const circuitJson = [
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        ...modelFields.flatMap(([field, _format, url], index) => [
            {
                type: 'source_component',
                source_component_id: 'source_' + index,
                name: 'U' + (index + 1)
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_' + index,
                source_component_id: 'source_' + index,
                center: { x: index + 1, y: index + 2 },
                layer: index % 2 ? 'bottom' : 'top',
                rotation: index * 15
            },
            {
                type: 'cad_component',
                cad_component_id: 'cad_' + index,
                pcb_component_id: 'pcb_' + index,
                [field]: url
            }
        ])
    ]
    const renderModel = PcbScene3dCircuitJsonAdapter.build(circuitJson)

    assert.deepEqual(
        renderModel.externalPlacements.map(
            (placement) => placement.externalModel.format
        ),
        modelFields.map((entry) => entry[1])
    )
    assert.deepEqual(
        renderModel.externalPlacements.map(
            (placement) => placement.externalModel.sourceUrl
        ),
        modelFields.map((entry) => entry[2])
    )
    assert.equal(renderModel.externalPlacements[1].mountSide, 'bottom')
    assert.equal(renderModel.components[0].externalModel.format, 'step')
})

test('PcbScene3dCircuitJsonAdapter applies explicit model URL resolution metadata', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build(
        [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 0, y: 0 },
                width: 20,
                height: 10,
                thickness: 1.6
            },
            {
                type: 'source_component',
                source_component_id: 'source_u1',
                name: 'U1'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_u1',
                source_component_id: 'source_u1',
                center: { x: 1, y: 2 },
                layer: 'top'
            },
            {
                type: 'cad_component',
                cad_component_id: 'cad_u1',
                pcb_component_id: 'pcb_u1',
                model_step_url: '/models/u1.step'
            }
        ],
        {
            modelUrlResolver(url, context) {
                return {
                    resolvedUrl: 'http://assets.local' + url,
                    sameOrigin: context.format === 'step'
                }
            }
        }
    )

    assert.equal(
        renderModel.externalPlacements[0].externalModel.sourceUrl,
        '/models/u1.step'
    )
    assert.equal(
        renderModel.externalPlacements[0].externalModel.resolvedUrl,
        'http://assets.local/models/u1.step'
    )
    assert.equal(
        renderModel.externalPlacements[0].externalModel.sameOrigin,
        true
    )
})

test('PcbScene3dCircuitJsonAdapter maps richer CAD placement hints', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_u1',
            source_component_id: 'source_u1',
            center: { x: 1, y: 2 },
            layer: 'top'
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_u1',
            pcb_component_id: 'pcb_u1',
            model_obj_url: '/models/u1.obj',
            model_unit_to_mm_scale_factor: 2,
            model_origin_position: { x: 0.5, y: 0.25, z: 0.1 },
            model_offset: { x: 0.1, y: -0.2, z: 0.3 },
            model_origin_alignment: 'center_of_component_on_board_surface',
            model_object_fit: 'fill_bounds',
            model_board_normal_direction: 'z-',
            size: { x: 4, y: 2, z: 1 },
            show_as_translucent_model: true
        }
    ])
    const placement = renderModel.externalPlacements[0]

    assert.equal(placement.modelTransform.scale.x, 2)
    assert.equal(Math.round(placement.modelTransform.originPositionMil.x), 20)
    assert.equal(Math.round(placement.modelTransform.offsetMil.x), 4)
    assert.equal(
        placement.modelTransform.originAlignment,
        'center_of_component_on_board_surface'
    )
    assert.equal(placement.modelTransform.objectFit, 'fill_bounds')
    assert.equal(placement.modelTransform.boardNormalDirection, 'z-')
    assert.equal(Math.round(placement.modelTransform.targetSizeMil.x), 157)
    assert.equal(placement.bodyOpacity, 0.5)
})
