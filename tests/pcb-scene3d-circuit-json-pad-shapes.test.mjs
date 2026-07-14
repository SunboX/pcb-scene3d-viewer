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
 * Builds filled silkscreen artwork on both board faces.
 * @returns {object[]}
 */
function createFilledSilkscreenArtwork() {
    return ['top', 'bottom'].map((layer) => ({
        type: 'pcb_silkscreen_path',
        pcb_silkscreen_path_id: `silk_fill_${layer}`,
        layer,
        fill: true,
        route: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
            { x: 0, y: 0 }
        ]
    }))
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

test('PcbScene3dCircuitJsonAdapter maps rounded plated copper around a circular drill', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'rounded_plated_pad',
            shape: 'circular_hole_with_rect_pad',
            pad_shape: 'rect',
            rect_pad_width: 3.048,
            rect_pad_height: 1.524,
            rect_ccw_rotation: 90,
            rect_border_radius: 0.762,
            hole_shape: 'circle',
            hole_diameter: 1.016,
            x: 2,
            y: 3,
            layers: ['top', 'bottom']
        }
    ])
    const [pad] = renderModel.detail.pads
    const topSurface = PcbScene3dPadFactory.resolvePadSurfaceSpec(pad, 'top')
    const bottomSurface = PcbScene3dPadFactory.resolvePadSurfaceSpec(
        pad,
        'bottom'
    )

    assert.equal(pad.rotation, 90)
    assert.equal(pad.sizeTopX, 120)
    assert.equal(pad.sizeTopY, 60)
    assert.equal(pad.holeDiameter, 40)
    assert.equal(pad.hasRoundedRect, true)
    assert.equal(pad.roundedRectShapeTop, 2)
    assert.equal(pad.roundedRectShapeBottom, 2)
    assert.equal(pad.cornerRadiusTop, 50)
    assert.equal(pad.cornerRadiusBottom, 50)
    assert.equal(topSurface.kind, 'rounded-rect')
    assert.equal(topSurface.cornerRadius, 30)
    assert.equal(bottomSurface.kind, 'rounded-rect')
    assert.equal(bottomSurface.cornerRadius, 30)
})

test('PcbScene3dCircuitJsonAdapter clips filled silkscreen around rotated rounded plated pads', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        ...createFilledSilkscreenArtwork(),
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'rotated_rounded_plated_pad',
            shape: 'circular_hole_with_rect_pad',
            pad_shape: 'rect',
            rect_pad_width: 3.048,
            rect_pad_height: 1.524,
            rect_ccw_rotation: 90,
            rect_border_radius: 0.762,
            hole_shape: 'circle',
            hole_diameter: 1.016,
            x: 2,
            y: 3,
            layers: ['top', 'bottom']
        }
    ])
    const [topCutout] = renderModel.detail.silkscreen.top.copperCutouts
    const [bottomCutout] = renderModel.detail.silkscreen.bottom.copperCutouts
    const bounds = (points) => ({
        width:
            Math.max(...points.map((point) => point.x)) -
            Math.min(...points.map((point) => point.x)),
        height:
            Math.max(...points.map((point) => point.y)) -
            Math.min(...points.map((point) => point.y))
    })

    assert.ok(topCutout.length >= 12)
    assert.deepEqual(bottomCutout, topCutout)
    assert.ok(Math.abs(bounds(topCutout).width - 60) < 0.001)
    assert.ok(Math.abs(bounds(topCutout).height - 120) < 0.001)
})

test('PcbScene3dCircuitJsonAdapter derives side-specific silkscreen cutouts from mask openings', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        ...createFilledSilkscreenArtwork(),
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'open_top_pad',
            x: 1,
            y: 1,
            layer: 'top',
            shape: 'rect',
            width: 1.2,
            height: 0.8,
            is_covered_with_solder_mask: false
        },
        {
            type: 'pcb_smtpad',
            pcb_smtpad_id: 'open_bottom_pad',
            x: 3,
            y: 1,
            layer: 'bottom',
            shape: 'rect',
            width: 1.2,
            height: 0.8,
            is_covered_with_solder_mask: false
        },
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'open_plated_pad',
            shape: 'circle',
            outer_diameter: 1.8,
            hole_diameter: 0.8,
            x: 5,
            y: 1,
            is_covered_with_solder_mask: false,
            layers: ['top', 'bottom']
        },
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'covered_plated_pad',
            shape: 'circle',
            outer_diameter: 1.8,
            hole_diameter: 0.8,
            x: 7,
            y: 1,
            is_covered_with_solder_mask: true,
            layers: ['top', 'bottom']
        }
    ])
    const topSilkscreen = renderModel.detail.silkscreen.top
    const bottomSilkscreen = renderModel.detail.silkscreen.bottom

    assert.equal(topSilkscreen.copperCutouts.length, 2)
    assert.equal(bottomSilkscreen.copperCutouts.length, 2)
    assert.equal(topSilkscreen.drillCutouts.length, 2)
    assert.deepEqual(bottomSilkscreen.drillCutouts, topSilkscreen.drillCutouts)
})

test('PcbScene3dCircuitJsonAdapter skips cutout polygons on empty silkscreen faces', () => {
    const renderModel = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        createFilledSilkscreenArtwork()[0],
        {
            type: 'pcb_plated_hole',
            pcb_plated_hole_id: 'top_artwork_plated_pad',
            shape: 'circle',
            outer_diameter: 1.8,
            hole_diameter: 0.8,
            x: 5,
            y: 1,
            is_covered_with_solder_mask: false,
            layers: ['top', 'bottom']
        }
    ])

    assert.equal(renderModel.detail.silkscreen.top.copperCutouts.length, 1)
    assert.equal(renderModel.detail.silkscreen.top.drillCutouts.length, 1)
    assert.equal(renderModel.detail.silkscreen.bottom.copperCutouts.length, 0)
    assert.equal(renderModel.detail.silkscreen.bottom.drillCutouts.length, 0)
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
