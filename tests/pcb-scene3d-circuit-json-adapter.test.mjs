import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dCopperDetailGroupBuilder } from '../src/PcbScene3dCopperDetailGroupBuilder.mjs'
import { createCanonicalKicadMaskDocument } from './helpers/PcbScene3dCircuitJsonMaskFixture.mjs'
import { findObjectByName } from './helpers/PcbScene3dCopperTestGeometry.mjs'

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
            ftype: 'simple_resistor',
            resistance: '10k'
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

/**
 * Builds one canonical source/PCB/CAD component fixture.
 * @param {{ id: string, sourceId?: string, name?: string, center: { x: number, y: number }, layer?: 'top' | 'bottom', rotation?: number, width?: number, height?: number, includeSource?: boolean, cad: object }} options Fixture options.
 * @returns {object[]} Canonical CircuitJSON elements.
 */
function createModelComponentFixture(options) {
    const id = String(options.id)
    const sourceId = String(options.sourceId || id)
    const layer = options.layer || 'top'
    const elements = []
    if (options.includeSource !== false) {
        elements.push({
            type: 'source_component',
            source_component_id: `source_${sourceId}`,
            name: options.name || id.toUpperCase(),
            ftype: 'simple_chip'
        })
    }
    elements.push(
        {
            type: 'pcb_component',
            pcb_component_id: `pcb_${id}`,
            source_component_id: `source_${sourceId}`,
            center: options.center,
            layer,
            rotation: options.rotation || 0,
            width: options.width || 0,
            height: options.height || 0
        },
        {
            type: 'cad_component',
            cad_component_id: `cad_${id}`,
            pcb_component_id: `pcb_${id}`,
            source_component_id: `source_${sourceId}`,
            position: {
                ...options.center,
                z: layer === 'bottom' ? -0.8 : 0.8
            },
            ...options.cad
        }
    )
    return elements
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

test('PcbScene3dCircuitJsonAdapter honors direct solder-mask coverage flags', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 10,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'covered_top_pad',
            x: 1,
            y: 1,
            layer: 'top',
            shape: 'rect',
            width: 1,
            height: 0.5,
            is_covered_with_solder_mask: true
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'open_bottom_pad',
            x: 2,
            y: 1,
            layer: 'bottom',
            shape: 'rect',
            width: 1,
            height: 0.5,
            covered_with_solder_mask: false
        },
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'covered_hole',
            x: 3,
            y: 1,
            shape: 'circle',
            outer_diameter: 1,
            hole_diameter: 0.5,
            is_covered_with_solder_mask: true
        },
        {
            type: 'pcb_via',
            pcb_via_id: 'covered_via',
            x: 4,
            y: 1,
            outer_diameter: 0.8,
            hole_diameter: 0.3,
            covered_with_solder_mask: true
        },
        {
            type: 'pcb_via',
            pcb_via_id: 'open_via',
            x: 5,
            y: 1,
            outer_diameter: 0.8,
            hole_diameter: 0.3,
            is_covered_with_solder_mask: false
        }
    ])
    const [coveredTopPad, openBottomPad, coveredHole] = renderModel.detail.pads
    const [coveredVia, openVia] = renderModel.detail.vias

    assert.equal(coveredTopPad.hasTopSolderMaskOpening, false)
    assert.equal(coveredTopPad.hasBottomSolderMaskOpening, false)
    assert.equal(openBottomPad.hasTopSolderMaskOpening, false)
    assert.equal(openBottomPad.hasBottomSolderMaskOpening, true)
    assert.equal(coveredHole.hasTopSolderMaskOpening, false)
    assert.equal(coveredHole.hasBottomSolderMaskOpening, false)
    assert.equal(coveredVia.isTentingTop, true)
    assert.equal(coveredVia.isTentingBottom, true)
    assert.equal(openVia.isTentingTop, false)
    assert.equal(openVia.isTentingBottom, false)
})

test('PcbScene3dCircuitJsonAdapter maps thermal spokes to copper tracks', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 10,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'hole_1',
            x: 2,
            y: 2,
            shape: 'circle',
            outer_diameter: 1.4,
            hole_diameter: 0.7,
            layers: ['top', 'bottom']
        },
        {
            type: 'pcb_ground_plane',
            pcb_ground_plane_id: 'plane_1',
            source_pcb_ground_plane_id: 'source_plane_1',
            source_net_id: 'source_net_gnd'
        },
        {
            type: 'pcb_ground_plane_region',
            pcb_ground_plane_region_id: 'plane_region_1',
            pcb_ground_plane_id: 'plane_1',
            layer: 'top',
            points: [
                { x: 0, y: 0 },
                { x: 4, y: 0 },
                { x: 4, y: 4 },
                { x: 0, y: 4 }
            ]
        },
        {
            type: 'pcb_thermal_spoke',
            pcb_thermal_spoke_id: 'thermal_1',
            pcb_ground_plane_id: 'plane_1',
            pcb_plated_hole_id: 'hole_1',
            shape: 'radial',
            spoke_count: 4,
            spoke_thickness: 0.2,
            spoke_inner_diameter: 0.8,
            spoke_outer_diameter: 1.6
        }
    ])
    const thermalTracks = renderModel.detail.tracks.filter(
        (track) => track.sourceType === 'pcb_thermal_spoke'
    )
    const [firstTrack] = thermalTracks

    assert.equal(thermalTracks.length, 4)
    assert.equal(firstTrack.sourceId, 'thermal_1')
    assert.equal(firstTrack.layerId, 1)
    assert.equal(Math.round(firstTrack.width), 8)
    assert.equal(Math.round(firstTrack.x1), 94)
    assert.equal(Math.round(firstTrack.x2), 110)
    assert.equal(Math.round(firstTrack.y1), 79)
    assert.equal(Math.round(firstTrack.y2), 79)
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
    assert.equal(renderModel.board.contours.length, 1)
    assert.equal(renderModel.board.contours[0].sourceId, 'panel_1')
    assert.equal(renderModel.board.segments.length, 4)
    assert.equal(renderModel.board.cutouts.length, 1)
    assert.equal(renderModel.board.cutouts[0].points.length, 4)
})

test('PcbScene3dCircuitJsonAdapter maps offset pill drills with quality metadata', () => {
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
                type: 'pcb_hole',
                pcb_hole_id: 'slot_1',
                x: 3,
                y: 4,
                hole_shape: 'rotated_pill',
                hole_width: 0.5,
                hole_height: 1.5,
                hole_offset_x: 0.25,
                hole_offset_y: -0.1,
                ccw_rotation: 90
            }
        ],
        { boardDrillQuality: 'high' }
    )
    const hole = renderModel.detail.pads[0]

    assert.equal(Math.round(hole.x), 128)
    assert.equal(Math.round(hole.y), 154)
    assert.equal(Math.round(hole.holeDiameter), 20)
    assert.equal(Math.round(hole.holeSlotLength), 59)
    assert.equal(hole.holeRotation, 180)
    assert.equal(renderModel.detail.drillQuality, 'high')
})

test('PcbScene3dCircuitJsonAdapter converts routed silkscreen paths to strokes', () => {
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
            type: 'pcb_silkscreen_path',
            pcb_silkscreen_path_id: 'path_1',
            layer: 'top',
            route: [
                { x: 0, y: 0 },
                { x: 2.54, y: 0 },
                { x: 2.54, y: 1.27 }
            ],
            stroke_width: 0.254
        }
    ])
    const tracks = renderModel.detail.silkscreen.top.tracks

    assert.equal(tracks.length, 2)
    assert.equal(Math.round(tracks[0].x1), 0)
    assert.equal(Math.round(tracks[0].x2), 100)
    assert.equal(Math.round(tracks[1].y1), 0)
    assert.equal(Math.round(tracks[1].y2), 50)
    assert.equal(Math.round(tracks[0].width), 10)
})

test('PcbScene3dCircuitJsonAdapter maps copper pour rectangles and polygons', () => {
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
            type: 'pcb_copper_pour',
            pcb_copper_pour_id: 'pour_rect',
            shape: 'rect',
            layer: 'top',
            center: { x: 1, y: 2 },
            width: 4,
            height: 2,
            rotation: 90,
            covered_with_solder_mask: false
        },
        {
            type: 'pcb_copper_pour',
            pcb_copper_pour_id: 'pour_poly',
            shape: 'polygon',
            layer: 'bottom',
            points: [
                { x: 0, y: 0 },
                { x: 2.54, y: 0 },
                { x: 2.54, y: 1.27 }
            ],
            covered_with_solder_mask: true
        }
    ])
    const [rect, polygon] = renderModel.detail.polygons
    const bounds = pointBounds(rect.points)

    assert.equal(renderModel.detail.polygons.length, 2)
    assert.equal(rect.sourceId, 'pour_rect')
    assert.equal(rect.layerId, 1)
    assert.equal(rect.hasSolderMask, false)
    assert.equal(rect.solderMaskOpening, true)
    assert.equal(Math.round(bounds.maxX - bounds.minX), 79)
    assert.equal(Math.round(bounds.maxY - bounds.minY), 157)
    assert.equal(polygon.sourceId, 'pour_poly')
    assert.equal(polygon.layerId, 32)
    assert.equal(polygon.hasSolderMask, true)
    assert.equal(polygon.solderMaskOpening, false)
    assert.equal(Math.round(polygon.points[1].x), 100)
    assert.equal(Math.round(polygon.points[2].y), 50)
})

test('PcbScene3dCircuitJsonAdapter maps copper pour B-Rep rings', () => {
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
            type: 'pcb_copper_pour',
            pcb_copper_pour_id: 'pour_brep',
            shape: 'brep',
            layer: 'top',
            covered_with_solder_mask: false,
            brep_shape: {
                outer_ring: {
                    vertices: [
                        { x: 0, y: 0 },
                        { x: 2.54, y: 0, bulge: 0.5 },
                        { x: 2.54, y: 1.27 },
                        { x: 0, y: 1.27 }
                    ]
                },
                inner_rings: [
                    {
                        vertices: [
                            { x: 0.5, y: 0.25 },
                            { x: 0.75, y: 0.25 },
                            { x: 0.75, y: 0.5 },
                            { x: 0.5, y: 0.5 }
                        ]
                    }
                ]
            }
        }
    ])
    const pour = renderModel.detail.polygons[0]

    assert.equal(pour.sourceId, 'pour_brep')
    assert.equal(Math.round(pour.brep_shape.outer_ring.vertices[1].x), 100)
    assert.equal(pour.brep_shape.outer_ring.vertices[1].bulge, 0.5)
    assert.equal(pour.brep_shape.inner_rings.length, 1)
    assert.equal(Math.round(pour.brep_shape.inner_rings[0].vertices[2].y), 20)
})

test('PcbScene3dCircuitJsonAdapter normalizes text anchors and optional notes', () => {
    const circuitJson = [
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        {
            type: 'pcb_silkscreen_text',
            pcb_silkscreen_text_id: 'silk_text',
            layer: 'top',
            text: 'A1',
            anchor_position: { x: 2.54, y: 1.27 },
            anchor_alignment: 'center',
            font_size: 1.27
        },
        {
            type: 'pcb_note_text',
            pcb_note_text_id: 'note_text',
            layer: 'bottom',
            text: 'assembly note',
            anchor_position: { x: -2.54, y: -1.27 },
            anchor_alignment: 'bottom_left',
            font_size: 0.8
        }
    ]
    const hiddenNotes = PcbScene3dCircuitJsonAdapter.build(circuitJson)
    const visibleNotes = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
        showPcbNotes: true
    })
    const silkText = hiddenNotes.detail.silkscreen.top.texts[0]
    const noteText = visibleNotes.detail.silkscreen.bottom.texts[0]

    assert.equal(Math.round(silkText.x), 100)
    assert.equal(Math.round(silkText.y), 50)
    assert.equal(silkText.hAlign, 'center')
    assert.equal(silkText.vAlign, 'center')
    assert.equal(hiddenNotes.detail.silkscreen.bottom.texts.length, 0)
    assert.equal(visibleNotes.detail.silkscreen.bottom.texts.length, 1)
    assert.equal(noteText.value, 'assembly note')
    assert.equal(Math.round(noteText.x), -100)
    assert.equal(noteText.hAlign, 'left')
    assert.equal(noteText.vAlign, 'bottom')
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
        ...modelFields.flatMap(([field, _format, url], index) =>
            createModelComponentFixture({
                id: String(index),
                name: `U${index + 1}`,
                center: { x: index + 1, y: index + 2 },
                layer: index % 2 ? 'bottom' : 'top',
                rotation: index * 15,
                cad: { [field]: url }
            })
        )
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

/**
 * Measures 2D point bounds.
 * @param {{ x?: number, y?: number }[]} points Points.
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
function pointBounds(points) {
    return points.reduce(
        (bounds, point) => ({
            minX: Math.min(bounds.minX, Number(point.x || 0)),
            maxX: Math.max(bounds.maxX, Number(point.x || 0)),
            minY: Math.min(bounds.minY, Number(point.y || 0)),
            maxY: Math.max(bounds.maxY, Number(point.y || 0))
        }),
        {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity
        }
    )
}

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
            ...createModelComponentFixture({
                id: 'u1',
                name: 'U1',
                center: { x: 1, y: 2 },
                cad: { model_step_url: '/models/u1.step' }
            })
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

test('PcbScene3dCircuitJsonAdapter resolves package model paths against project downloads', () => {
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
            ...createModelComponentFixture({
                id: 'u1',
                name: 'U1',
                center: { x: 1, y: 2 },
                cad: {
                    model_step_url:
                        './node_modules/@demo/connector-models/dist/u1.step'
                }
            }),
            ...createModelComponentFixture({
                id: 'j1',
                sourceId: 'u1',
                center: { x: 4, y: 2 },
                includeSource: false,
                cad: { model_obj_url: '/node_modules/package-models/j1.obj' }
            })
        ],
        { projectBaseUrl: 'https://assets.invalid/projects/demo/' }
    )
    const urls = renderModel.externalPlacements.map(
        (placement) => new URL(placement.externalModel.resolvedUrl)
    )

    assert.equal(urls[0].origin, 'https://assets.invalid')
    assert.equal(urls[0].pathname, '/package_files/download')
    assert.equal(
        urls[0].searchParams.get('package_name_with_version'),
        '@demo/connector-models@latest'
    )
    assert.equal(urls[0].searchParams.get('file_path'), 'dist/u1.step')
    assert.equal(urls[1].pathname, '/package_files/download')
    assert.equal(
        urls[1].searchParams.get('package_name_with_version'),
        'package-models@latest'
    )
    assert.equal(urls[1].searchParams.get('file_path'), 'dist/j1.obj')
})

test('PcbScene3dCircuitJsonAdapter resolves scoped package aliases against project downloads', () => {
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
            ...createModelComponentFixture({
                id: 'u1',
                name: 'U1',
                center: { x: 1, y: 2 },
                cad: {
                    model_step_url:
                        './node_modules/@tsci/fakeauthor.fake-library/assets/u1.step'
                }
            })
        ],
        { projectBaseUrl: 'https://assets.invalid/projects/demo/' }
    )
    const url = new URL(
        renderModel.externalPlacements[0].externalModel.resolvedUrl
    )

    assert.equal(url.pathname, '/package_files/download')
    assert.equal(
        url.searchParams.get('package_name_with_version'),
        '@fakeauthor/fake-library@latest'
    )
    assert.equal(url.searchParams.get('file_path'), 'dist/assets/u1.step')
})

test('PcbScene3dCircuitJsonAdapter sizes faux boards from component bounds when requested', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build(
        [
            {
                type: 'source_component',
                source_component_id: 'source_u1',
                name: 'U1'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_u1',
                source_component_id: 'source_u1',
                center: { x: -4, y: 1 },
                width: 2,
                height: 1,
                layer: 'top'
            },
            {
                type: 'pcb_component',
                pcb_component_id: 'pcb_j1',
                source_component_id: 'source_u1',
                center: { x: 8, y: 5 },
                width: 4,
                height: 3,
                layer: 'top'
            }
        ],
        { drawFauxBoard: true }
    )

    assert.equal(Math.round(renderModel.board.widthMil), 748)
    assert.equal(Math.round(renderModel.board.heightMil), 394)
    assert.equal(Math.round(renderModel.board.centerX), 98)
    assert.equal(Math.round(renderModel.board.centerY), 138)
})

test('PcbScene3dCircuitJsonAdapter carries CAD bounding-box display intent', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        ...createModelComponentFixture({
            id: 'u1',
            name: 'U1',
            center: { x: 1, y: 2 },
            width: 1,
            height: 1,
            cad: {
                model_step_url: '/models/u1.step',
                show_as_bounding_box: true,
                size: { x: 6, y: 4, z: 2 }
            }
        })
    ])
    const component = renderModel.components[0]
    const placement = renderModel.externalPlacements[0]

    assert.equal(component.renderFallbackBody, true)
    assert.equal(Math.round(component.body.sizeMil.width), 236)
    assert.equal(Math.round(component.body.sizeMil.depth), 157)
    assert.equal(Math.round(component.body.sizeMil.height), 79)
    assert.equal(placement.renderAsBoundingBox, true)
})

test('PcbScene3dCircuitJsonAdapter maps 3MF CAD model URLs', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        {
            type: 'pcb_board',
            pcb_board_id: 'board_1',
            center: { x: 0, y: 0 },
            width: 20,
            height: 10,
            thickness: 1.6
        },
        ...createModelComponentFixture({
            id: 'u1',
            name: 'U1',
            center: { x: 1, y: 2 },
            cad: { model_3mf_url: '/models/u1.3mf' }
        })
    ])
    const placement = renderModel.externalPlacements[0]

    assert.equal(placement.externalModel.format, '3mf')
    assert.equal(placement.externalModel.name, 'u1.3mf')
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
        ...createModelComponentFixture({
            id: 'u1',
            name: 'U1',
            center: { x: 1, y: 2 },
            cad: {
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
        })
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

test('PcbScene3dCircuitJsonAdapter retains canonical KiCad source identity', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build(
        createCanonicalKicadMaskDocument()
    )

    assert.equal(scene.sourceFormat, 'kicad')
})

test('PcbScene3dCircuitJsonAdapter defaults copper to covered and preserves openings', () => {
    const { detail } = PcbScene3dCircuitJsonAdapter.build(
        createCanonicalKicadMaskDocument()
    )

    assert.deepEqual(
        detail.tracks.map((track) => track.solderMaskOpening),
        [false, true]
    )
    assert.deepEqual(
        detail.polygons.map((pour) => pour.solderMaskOpening),
        [false, true]
    )
    assert.deepEqual(
        detail.vias.map((via) => via.isTentingTop),
        [true, false]
    )
})

test('canonical covered copper uses the solder-mask material palette', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build(
        createCanonicalKicadMaskDocument()
    )
    const group = PcbScene3dCopperDetailGroupBuilder.build(
        THREE,
        scene,
        scene.board.thicknessMil / 2,
        (x, y) => ({ x, y })
    )
    const trackMesh = findObjectByName(group, 'mask-covered-copper-tracks')
    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')

    assert.equal(trackMesh?.material.color.getHex(), 0x247330)
    assert.equal(fillMesh?.material.color.getHex(), 0x296d2d)
})
