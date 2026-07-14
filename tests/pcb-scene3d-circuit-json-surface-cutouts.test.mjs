import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dPadFactory } from '../src/PcbScene3dPadFactory.mjs'
import { PcbScene3dSilkscreenCopperCutoutBuilder } from '../src/PcbScene3dSilkscreenCopperCutoutBuilder.mjs'

/**
 * Builds a neutral canonical board.
 * @returns {object}
 */
function board() {
    return {
        type: 'pcb_board',
        pcb_board_id: 'surface_cutout_board',
        center: { x: 0, y: 0 },
        width: 20,
        height: 12,
        thickness: 1.6
    }
}

/**
 * Builds filled silkscreen artwork on one board face.
 * @param {'top' | 'bottom'} side Board face.
 * @returns {object}
 */
function filledSilkscreen(side) {
    return {
        type: 'pcb_silkscreen_path',
        pcb_silkscreen_path_id: `surface_silk_${side}`,
        layer: side,
        fill: true,
        route: [
            { x: -9, y: -5 },
            { x: 9, y: -5 },
            { x: 9, y: 5 },
            { x: -9, y: 5 },
            { x: -9, y: -5 }
        ]
    }
}

/**
 * Resolves a polygon centroid.
 * @param {{ x: number, y: number }[]} polygon Polygon points.
 * @returns {{ x: number, y: number }}
 */
function centroid(polygon) {
    const sum = polygon.reduce(
        (point, current) => ({
            x: point.x + Number(current?.x || 0),
            y: point.y + Number(current?.y || 0)
        }),
        { x: 0, y: 0 }
    )
    return {
        x: sum.x / polygon.length,
        y: sum.y / polygon.length
    }
}

test('canonical snake-case SMT corner radii produce rounded surface geometry', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'corner_radius_pad',
            x: -2,
            y: 0,
            layer: 'top',
            shape: 'rect',
            width: 2,
            height: 1,
            corner_radius: 0.2
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'border_radius_pad',
            x: 2,
            y: 0,
            layer: 'top',
            shape: 'rect',
            width: 2,
            height: 1,
            rect_border_radius: 0.25
        }
    ])
    const surfaces = scene.detail.pads.map((pad) =>
        PcbScene3dPadFactory.resolvePadSurfaceSpec(pad, 'top')
    )

    assert.deepEqual(
        surfaces.map((surface) => surface.kind),
        ['rounded-rect', 'rounded-rect']
    )
    assert.ok(Math.abs(surfaces[0].cornerRadius - (0.2 * 1000) / 25.4) < 1e-5)
    assert.ok(Math.abs(surfaces[1].cornerRadius - (0.25 * 1000) / 25.4) < 1e-5)
})

test('blind vias preserve their layer span and clip only the reached board face', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        filledSilkscreen('top'),
        filledSilkscreen('bottom'),
        {
            type: 'pcb_via',
            pcb_via_id: 'top_blind_via',
            x: -2,
            y: 0,
            outer_diameter: 1,
            hole_diameter: 0.5,
            layers: ['top', 'inner2'],
            is_tented: false
        },
        {
            type: 'pcb_trace',
            pcb_trace_id: 'bottom_blind_route',
            route: [
                {
                    route_type: 'via',
                    x: 2,
                    y: 0,
                    via_diameter: 1,
                    hole_diameter: 0.5,
                    from_layer: 'inner2',
                    to_layer: 'bottom',
                    is_tented: false
                }
            ]
        }
    ])
    const [topVia, bottomVia] = scene.detail.vias

    assert.deepEqual(topVia.layers, ['top', 'inner2'])
    assert.equal(topVia.fromLayer, 'top')
    assert.equal(topVia.toLayer, 'inner2')
    assert.deepEqual(bottomVia.layers, ['inner2', 'bottom'])
    assert.equal(bottomVia.fromLayer, 'inner2')
    assert.equal(bottomVia.toLayer, 'bottom')
    assert.equal(scene.detail.silkscreen.top.copperCutouts.length, 1)
    assert.equal(scene.detail.silkscreen.top.drillCutouts.length, 1)
    assert.equal(scene.detail.silkscreen.bottom.copperCutouts.length, 1)
    assert.equal(scene.detail.silkscreen.bottom.drillCutouts.length, 1)
    assert.ok(centroid(scene.detail.silkscreen.top.copperCutouts[0]).x < 0)
    assert.ok(centroid(scene.detail.silkscreen.bottom.copperCutouts[0]).x > 0)
})

test('route vias accept canonical layers arrays as their authored span', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        {
            type: 'pcb_trace',
            pcb_trace_id: 'array_span_route',
            route: [
                {
                    route_type: 'via',
                    x: 0,
                    y: 0,
                    via_diameter: 1,
                    layers: ['top', 'inner3']
                }
            ]
        }
    ])
    const [via] = scene.detail.vias

    assert.equal(scene.detail.vias.length, 1)
    assert.deepEqual(via.layers, ['top', 'inner3'])
    assert.equal(via.fromLayer, 'top')
    assert.equal(via.toLayer, 'inner3')
})

test('route vias with inner-only canonical spans stay off outer surfaces', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        {
            type: 'pcb_trace',
            pcb_trace_id: 'buried_array_span_route',
            route: [
                {
                    route_type: 'via',
                    x: 0,
                    y: 0,
                    via_diameter: 1,
                    layers: ['inner1', 'inner3']
                }
            ]
        }
    ])

    assert.deepEqual(scene.detail.vias, [])
})

test('mask-open tracks and pours contribute exact side-specific silkscreen cutouts', () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        board(),
        filledSilkscreen('top'),
        filledSilkscreen('bottom'),
        {
            type: 'pcb_trace',
            pcb_trace_id: 'open_top_trace',
            is_covered_with_solder_mask: false,
            route: [
                { route_type: 'wire', x: -3, y: 0, width: 0.5, layer: 'top' },
                { route_type: 'wire', x: -1, y: 0, width: 0.5, layer: 'top' }
            ]
        },
        {
            type: 'pcb_trace',
            pcb_trace_id: 'covered_bottom_trace',
            is_covered_with_solder_mask: true,
            route: [
                { route_type: 'wire', x: 1, y: 0, width: 0.5, layer: 'bottom' },
                { route_type: 'wire', x: 3, y: 0, width: 0.5, layer: 'bottom' }
            ]
        },
        {
            type: 'pcb_copper_pour',
            pcb_copper_pour_id: 'open_top_pour',
            shape: 'polygon',
            layer: 'top',
            covered_with_solder_mask: false,
            points: [
                { x: -3, y: 1 },
                { x: -1, y: 1 },
                { x: -1, y: 3 },
                { x: -3, y: 3 }
            ]
        },
        {
            type: 'pcb_copper_pour',
            pcb_copper_pour_id: 'covered_bottom_pour',
            shape: 'polygon',
            layer: 'bottom',
            covered_with_solder_mask: true,
            points: [
                { x: 1, y: 1 },
                { x: 3, y: 1 },
                { x: 3, y: 3 },
                { x: 1, y: 3 }
            ]
        }
    ])
    const topCutouts = scene.detail.silkscreen.top.copperCutouts

    assert.equal(topCutouts.length, 2)
    assert.equal(
        topCutouts.some((polygon) => polygon.length === 4),
        true
    )
    assert.equal(
        topCutouts.some((polygon) => polygon.length > 20),
        true
    )
    assert.deepEqual(scene.detail.silkscreen.bottom.copperCutouts, [])
})

test('mask-open copper text contributes stroke-shaped silkscreen cutouts', () => {
    const cutouts = PcbScene3dSilkscreenCopperCutoutBuilder.build({
        copperTexts: [
            {
                value: 'A',
                x: 0,
                y: 0,
                sizeX: 40,
                sizeY: 40,
                thickness: 5,
                side: 'front',
                layerId: 1,
                solderMaskOpening: true
            }
        ]
    })

    assert.ok(cutouts.top.length >= 2)
    assert.equal(
        cutouts.top.every((polygon) => polygon.length > 20),
        true
    )
    assert.deepEqual(cutouts.bottom, [])
})
