import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'
import { PcbScene3dCircuitJsonSourceLayer } from '../src/PcbScene3dCircuitJsonSourceLayer.mjs'

test('PcbScene3dCircuitJsonSourceLayer classifies only outer copper and solder-mask source layers', () => {
    assert.equal(
        PcbScene3dCircuitJsonSourceLayer.isOuterCopper({
            source_layer: 'F.Cu'
        }),
        true
    )
    assert.equal(
        PcbScene3dCircuitJsonSourceLayer.isOuterCopper({
            sourceLayer: { layer: 'B.Cu' }
        }),
        true
    )
    assert.equal(
        PcbScene3dCircuitJsonSourceLayer.isOuterCopper({
            source_layer: 'In1.Cu'
        }),
        false
    )
    assert.equal(
        PcbScene3dCircuitJsonSourceLayer.isSolderMask({
            source_layer: { name: 'F.Mask' }
        }),
        true
    )
    assert.equal(
        PcbScene3dCircuitJsonSourceLayer.isCopperOrSolderMask({
            source_layer: 'B.Mask'
        }),
        true
    )
    assert.equal(
        PcbScene3dCircuitJsonSourceLayer.isCopperOrSolderMask({
            source_layer: 'F.Fab'
        }),
        false
    )
})

test('PcbScene3dCircuitJsonAdapter keeps copper and mask text out of optional documentation', () => {
    const text = (id, sourceLayer, layer = 'top') => ({
        type: 'pcb_fabrication_note_text',
        pcb_fabrication_note_text_id: id,
        text: id,
        anchor_position: { x: 0, y: 0 },
        font_size: 1,
        layer,
        source_layer: sourceLayer
    })
    const scene = PcbScene3dCircuitJsonAdapter.build(
        [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 0, y: 0 },
                width: 20,
                height: 10,
                thickness: 1.6
            },
            text('outer_copper_top', 'F.Cu'),
            text('outer_copper_bottom', 'B.Cu', 'bottom'),
            text('solder_mask_top', 'F.Mask'),
            text('solder_mask_bottom', 'B.Mask', 'bottom'),
            text('assembly_note', 'F.Fab'),
            text('drawing_note', 'Dwgs.User', 'bottom')
        ],
        { showPcbNotes: true }
    )
    const visibleTextIds = [
        ...scene.detail.silkscreen.top.texts,
        ...scene.detail.silkscreen.bottom.texts
    ]
        .map((entry) => entry.sourceId)
        .sort()

    assert.deepEqual(visibleTextIds, ['assembly_note', 'drawing_note'])
})

test('PcbScene3dCircuitJsonAdapter maps silkscreen circles to full-circle arcs', () => {
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
            type: 'pcb_silkscreen_circle',
            pcb_silkscreen_circle_id: 'circle_top',
            layer: 'F.SilkS',
            center: { x: 2.54, y: 1.27 },
            radius: 1.27,
            stroke_width: 0.254
        },
        {
            type: 'pcb_silkscreen_circle',
            pcb_silkscreen_circle_id: 'circle_bottom',
            layer: { name: 'B.SilkS' },
            x: -2.54,
            y: -1.27,
            radius: 0.635,
            stroke_width: 0.127
        }
    ])
    const topArc = renderModel.detail.silkscreen.top.arcs[0]
    const bottomArc = renderModel.detail.silkscreen.bottom.arcs[0]

    assert.equal(renderModel.detail.silkscreen.top.arcs.length, 1)
    assert.equal(renderModel.detail.silkscreen.bottom.arcs.length, 1)
    assert.equal(topArc.sourceId, 'circle_top')
    assert.equal(Math.round(topArc.x), 100)
    assert.equal(Math.round(topArc.y), 50)
    assert.equal(Math.round(topArc.radius), 50)
    assert.equal(Math.round(topArc.width), 10)
    assert.equal(topArc.startAngle, 0)
    assert.equal(topArc.endAngle, 360)
    assert.equal(topArc.sweepAngle, 360)
    assert.equal(bottomArc.sourceId, 'circle_bottom')
    assert.equal(Math.round(bottomArc.x), -100)
    assert.equal(Math.round(bottomArc.y), -50)
    assert.equal(Math.round(bottomArc.radius), 25)
    assert.equal(Math.round(bottomArc.width), 5)
})

test('PcbScene3dCircuitJsonAdapter maps note rectangles only when notes are enabled', () => {
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
            type: 'pcb_note_rect',
            pcb_note_rect_id: 'note_box',
            layer: { name: 'B.SilkS' },
            center: { x: 1.27, y: 2.54 },
            width: 5.08,
            height: 2.54,
            ccw_rotation: 90,
            stroke_width: 0.254
        }
    ]
    const hiddenNotes = PcbScene3dCircuitJsonAdapter.build(circuitJson)
    const visibleNotes = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
        showPcbNotes: true
    })
    const tracks = visibleNotes.detail.silkscreen.bottom.tracks
    const bounds = pointBounds(
        tracks.flatMap((track) => [
            { x: track.x1, y: track.y1 },
            { x: track.x2, y: track.y2 }
        ])
    )

    assert.equal(hiddenNotes.detail.silkscreen.bottom.tracks.length, 0)
    assert.equal(tracks.length, 4)
    assert.equal(
        tracks.every((track) => track.sourceId === 'note_box'),
        true
    )
    assert.equal(Math.round(bounds.maxX - bounds.minX), 100)
    assert.equal(Math.round(bounds.maxY - bounds.minY), 200)
    assert.equal(Math.round(tracks[0].width), 10)
})

test('PcbScene3dCircuitJsonAdapter maps additional silkscreen shapes to strokes', () => {
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
            type: 'pcb_silkscreen_rect',
            pcb_silkscreen_rect_id: 'rect_top',
            layer: 'top',
            center: { x: 0, y: 0 },
            width: 5.08,
            height: 2.54,
            ccw_rotation: 90,
            stroke_width: 0.254
        },
        {
            type: 'pcb_silkscreen_oval',
            pcb_silkscreen_oval_id: 'oval_bottom',
            layer: 'bottom',
            center: { x: -2.54, y: 0 },
            width: 5.08,
            height: 2.54,
            stroke_width: 0.127
        },
        {
            type: 'pcb_silkscreen_pill',
            pcb_silkscreen_pill_id: 'pill_top',
            layer: 'F.SilkS',
            center: { x: 2.54, y: 0 },
            width: 5.08,
            height: 2.54,
            stroke_width: 0.127
        }
    ])
    const rectTracks = tracksBySource(
        renderModel.detail.silkscreen.top.tracks,
        'rect_top'
    )
    const pillTracks = tracksBySource(
        renderModel.detail.silkscreen.top.tracks,
        'pill_top'
    )
    const ovalTracks = tracksBySource(
        renderModel.detail.silkscreen.bottom.tracks,
        'oval_bottom'
    )
    const rectBounds = trackBounds(rectTracks)
    const ovalBounds = trackBounds(ovalTracks)
    const pillBounds = trackBounds(pillTracks)

    assert.equal(rectTracks.length, 4)
    assert.equal(Math.round(rectBounds.maxX - rectBounds.minX), 100)
    assert.equal(Math.round(rectBounds.maxY - rectBounds.minY), 200)
    assert.equal(Math.round(rectTracks[0].width), 10)
    assert.ok(ovalTracks.length >= 24)
    assert.equal(Math.round(ovalBounds.maxX - ovalBounds.minX), 200)
    assert.equal(Math.round(ovalBounds.maxY - ovalBounds.minY), 100)
    assert.ok(pillTracks.length >= 24)
    assert.equal(Math.round(pillBounds.maxX - pillBounds.minX), 200)
    assert.equal(Math.round(pillBounds.maxY - pillBounds.minY), 100)
})

test('PcbScene3dCircuitJsonAdapter maps note and fabrication artwork only when notes are enabled', () => {
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
            type: 'pcb_note_line',
            pcb_note_line_id: 'note_line',
            layer: 'top',
            x1: 0,
            y1: 0,
            x2: 2.54,
            y2: 0,
            stroke_width: 0.254
        },
        {
            type: 'pcb_note_path',
            pcb_note_path_id: 'note_path',
            layer: 'bottom',
            route: [
                { x: 0, y: 0 },
                { x: 0, y: 1.27 },
                { x: 2.54, y: 1.27 }
            ],
            stroke_width: 0.127
        },
        {
            type: 'pcb_fabrication_note_text',
            pcb_fabrication_note_text_id: 'fab_text',
            layer: 'top',
            text: 'FAB',
            anchor_position: { x: 1.27, y: 2.54 },
            font_size: 1.27
        },
        {
            type: 'pcb_fabrication_note_path',
            pcb_fabrication_note_path_id: 'fab_path',
            layer: 'bottom',
            route: [
                { x: -2.54, y: 0 },
                { x: -1.27, y: 0 }
            ],
            stroke_width: 0.254
        }
    ]
    const hiddenNotes = PcbScene3dCircuitJsonAdapter.build(circuitJson)
    const visibleNotes = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
        showPcbNotes: true
    })
    const topTracks = visibleNotes.detail.silkscreen.top.tracks
    const bottomTracks = visibleNotes.detail.silkscreen.bottom.tracks
    const fabText = visibleNotes.detail.silkscreen.top.texts[0]

    assert.equal(hiddenNotes.detail.silkscreen.top.tracks.length, 0)
    assert.equal(hiddenNotes.detail.silkscreen.bottom.tracks.length, 0)
    assert.equal(hiddenNotes.detail.silkscreen.top.texts.length, 0)
    assert.equal(topTracks.length, 1)
    assert.equal(topTracks[0].sourceId, 'note_line')
    assert.equal(Math.round(topTracks[0].x2), 100)
    assert.equal(bottomTracks.length, 3)
    assert.equal(tracksBySource(bottomTracks, 'note_path').length, 2)
    assert.equal(tracksBySource(bottomTracks, 'fab_path').length, 1)
    assert.equal(fabText.sourceId, 'fab_text')
    assert.equal(fabText.value, 'FAB')
    assert.equal(Math.round(fabText.x), 50)
    assert.equal(Math.round(fabText.y), 100)
})

test('PcbScene3dCircuitJsonAdapter restores source-identified filled silkscreen paths without showing notes', () => {
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
            type: 'pcb_note_path',
            pcb_note_path_id: 'board_silk_fill',
            layer: 'top',
            source_layer: 'F.SilkS',
            source_type: 'gr_poly',
            fill: true,
            route: [
                { x: 0, y: 0 },
                { x: 2.54, y: 0 },
                { x: 1.27, y: 2.54 },
                { x: 0, y: 0 }
            ],
            stroke_width: -0.000001
        },
        {
            type: 'pcb_silkscreen_path',
            pcb_silkscreen_path_id: 'owned_silk_fill',
            pcb_component_id: 'component_1',
            layer: 'bottom',
            source_layer: 'B.SilkS',
            source_type: 'fp_poly',
            fill: true,
            route: [
                { x: -2.54, y: 0 },
                { x: -1.27, y: 1.27 },
                { x: -3.81, y: 1.27 },
                { x: -2.54, y: 0 }
            ],
            stroke_width: 0.12
        },
        {
            type: 'pcb_note_path',
            pcb_note_path_id: 'ordinary_note',
            layer: 'top',
            route: [
                { x: 5.08, y: 0 },
                { x: 7.62, y: 0 }
            ],
            stroke_width: 0.12
        },
        {
            type: 'pcb_note_path',
            pcb_note_path_id: 'fabrication_fill',
            layer: 'top',
            source_layer: 'F.Fab',
            fill: true,
            route: [
                { x: 0, y: -1.27 },
                { x: 1.27, y: -1.27 },
                { x: 0, y: -2.54 },
                { x: 0, y: -1.27 }
            ],
            stroke_width: 0.12
        }
    ]
    const defaultScene = PcbScene3dCircuitJsonAdapter.build(circuitJson)
    const notesScene = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
        showPcbNotes: true
    })
    const topFill = defaultScene.detail.silkscreen.top.fills[0]
    const bottomFill = defaultScene.detail.silkscreen.bottom.fills[0]

    assert.equal(defaultScene.detail.silkscreen.top.fills.length, 1)
    assert.equal(defaultScene.detail.silkscreen.bottom.fills.length, 1)
    assert.equal(topFill.sourceId, 'board_silk_fill')
    assert.equal(bottomFill.sourceId, 'owned_silk_fill')
    assert.deepEqual(topFill.points, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 }
    ])
    assert.equal(defaultScene.detail.silkscreen.top.tracks.length, 0)
    assert.equal(defaultScene.detail.silkscreen.bottom.tracks.length, 0)
    assert.equal(
        notesScene.detail.silkscreen.top.fills.filter(
            (fill) => fill.sourceId === 'board_silk_fill'
        ).length,
        1
    )
    assert.equal(
        notesScene.detail.silkscreen.top.fills.filter(
            (fill) => fill.sourceId === 'fabrication_fill'
        ).length,
        1
    )
    assert.equal(
        tracksBySource(
            notesScene.detail.silkscreen.top.tracks,
            'board_silk_fill'
        ).length,
        0
    )
    assert.equal(
        tracksBySource(notesScene.detail.silkscreen.top.tracks, 'ordinary_note')
            .length,
        1
    )
})

test('PcbScene3dCircuitJsonAdapter restores source-identified note silk primitives exactly once', () => {
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
            type: 'pcb_note_line',
            pcb_note_line_id: 'source_silk_line',
            layer: 'top',
            source_layer: 'F.SilkS',
            x1: 0,
            y1: 0,
            x2: 2.54,
            y2: 0,
            stroke_width: 0.254
        },
        {
            type: 'pcb_note_rect',
            pcb_note_rect_id: 'source_silk_rect',
            layer: 'bottom',
            source_layer: 'B.SilkS',
            center: { x: 0, y: 0 },
            width: 5.08,
            height: 2.54,
            ccw_rotation: 90,
            stroke_width: 0.127,
            fill: true
        },
        {
            type: 'pcb_note_text',
            pcb_note_text_id: 'source_silk_text',
            layer: 'bottom',
            source_layer: 'B.SilkS',
            text: 'BOARD MARK',
            anchor_position: { x: 2.54, y: 1.27 },
            ccw_rotation: 30,
            font_size: 1.27,
            font_width: 0.635,
            font_height: 1.27,
            stroke_width: 0.127,
            anchor_alignment: 'center',
            source_anchor_alignment: 'center_left',
            is_mirrored_from_top_view: true
        },
        {
            type: 'pcb_note_line',
            pcb_note_line_id: 'ordinary_note_line',
            layer: 'top',
            source_layer: 'Dwgs.User',
            x1: 0,
            y1: 2.54,
            x2: 2.54,
            y2: 2.54,
            stroke_width: 0.127
        },
        {
            type: 'pcb_note_text',
            pcb_note_text_id: 'ordinary_note_text',
            layer: 'top',
            source_layer: 'F.Fab',
            text: 'ASSEMBLY',
            anchor_position: { x: 0, y: 0 },
            font_size: 1
        }
    ]
    const defaultScene = PcbScene3dCircuitJsonAdapter.build(circuitJson)
    const notesScene = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
        showPcbNotes: true
    })
    const defaultLineTracks = tracksBySource(
        defaultScene.detail.silkscreen.top.tracks,
        'source_silk_line'
    )
    const defaultRectTracks = tracksBySource(
        defaultScene.detail.silkscreen.bottom.tracks,
        'source_silk_rect'
    )
    const defaultRectFills = defaultScene.detail.silkscreen.bottom.fills.filter(
        (fill) => fill.sourceId === 'source_silk_rect'
    )
    const defaultText = defaultScene.detail.silkscreen.bottom.texts.find(
        (text) => text.sourceId === 'source_silk_text'
    )

    assert.equal(defaultLineTracks.length, 1)
    assert.equal(defaultRectTracks.length, 0)
    assert.equal(defaultRectFills.length, 1)
    assert.equal(defaultRectFills[0].points.length, 4)
    assert.equal(defaultScene.detail.silkscreen.top.texts.length, 0)
    assert.equal(defaultScene.detail.silkscreen.bottom.texts.length, 1)
    assert.equal(defaultText.value, 'BOARD MARK')
    assert.equal(defaultText.x, 100)
    assert.equal(defaultText.y, 50)
    assert.equal(defaultText.rotation, 30)
    assert.equal(defaultText.sizeX, 25)
    assert.equal(defaultText.sizeY, 50)
    assert.equal(defaultText.strokeWidth, 5)
    assert.equal(defaultText.hAlign, 'left')
    assert.equal(defaultText.vAlign, 'center')
    assert.equal(defaultText.mirrored, true)
    assert.equal(
        tracksBySource(
            defaultScene.detail.silkscreen.top.tracks,
            'ordinary_note_line'
        ).length,
        0
    )
    assert.equal(
        notesScene.detail.silkscreen.top.tracks.filter(
            (track) => track.sourceId === 'source_silk_line'
        ).length,
        1
    )
    assert.equal(
        notesScene.detail.silkscreen.bottom.fills.filter(
            (fill) => fill.sourceId === 'source_silk_rect'
        ).length,
        1
    )
    assert.equal(
        notesScene.detail.silkscreen.bottom.texts.filter(
            (text) => text.sourceId === 'source_silk_text'
        ).length,
        1
    )
    assert.equal(
        tracksBySource(
            notesScene.detail.silkscreen.top.tracks,
            'ordinary_note_line'
        ).length,
        1
    )
    assert.equal(
        notesScene.detail.silkscreen.top.texts.some(
            (text) => text.sourceId === 'ordinary_note_text'
        ),
        true
    )
})

test('PcbScene3dCircuitJsonAdapter maps courtyard artwork only when notes are enabled', () => {
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
            type: 'pcb_courtyard_rect',
            pcb_courtyard_rect_id: 'courtyard_rect',
            layer: 'top',
            center: { x: 0, y: 0 },
            width: 5.08,
            height: 2.54,
            ccw_rotation: 90,
            stroke_width: 0.254
        },
        {
            type: 'pcb_courtyard_circle',
            pcb_courtyard_circle_id: 'courtyard_circle',
            layer: 'bottom',
            center: { x: 2.54, y: 0 },
            radius: 1.27,
            stroke_width: 0.127
        },
        {
            type: 'pcb_courtyard_outline',
            pcb_courtyard_outline_id: 'courtyard_outline',
            layer: 'F.CrtYd',
            outline: [
                { x: -2.54, y: -1.27 },
                { x: -1.27, y: -1.27 },
                { x: -1.27, y: 1.27 },
                { x: -2.54, y: 1.27 }
            ],
            stroke_width: 0.127
        }
    ]
    const hiddenArtwork = PcbScene3dCircuitJsonAdapter.build(circuitJson)
    const visibleArtwork = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
        showPcbNotes: true
    })
    const rectTracks = tracksBySource(
        visibleArtwork.detail.silkscreen.top.tracks,
        'courtyard_rect'
    )
    const outlineTracks = tracksBySource(
        visibleArtwork.detail.silkscreen.top.tracks,
        'courtyard_outline'
    )
    const circleTracks = tracksBySource(
        visibleArtwork.detail.silkscreen.bottom.tracks,
        'courtyard_circle'
    )
    const rectBounds = trackBounds(rectTracks)
    const circleBounds = trackBounds(circleTracks)

    assert.equal(hiddenArtwork.detail.silkscreen.top.tracks.length, 0)
    assert.equal(hiddenArtwork.detail.silkscreen.bottom.tracks.length, 0)
    assert.equal(rectTracks.length, 4)
    assert.equal(Math.round(rectBounds.maxX - rectBounds.minX), 100)
    assert.equal(Math.round(rectBounds.maxY - rectBounds.minY), 200)
    assert.equal(Math.round(rectTracks[0].width), 10)
    assert.equal(outlineTracks.length, 4)
    assert.ok(circleTracks.length >= 24)
    assert.equal(Math.round(circleBounds.maxX - circleBounds.minX), 100)
    assert.equal(Math.round(circleBounds.maxY - circleBounds.minY), 100)
    assert.equal(Math.round(circleTracks[0].width), 5)
})

test('PcbScene3dCircuitJsonAdapter uses shared layer side detection for copper pours', () => {
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
            pcb_copper_pour_id: 'bottom_pour',
            shape: 'rect',
            layer: { name: 'B.Cu' },
            center: { x: 0, y: 0 },
            width: 2.54,
            height: 1.27
        }
    ])
    const pour = renderModel.detail.polygons[0]

    assert.equal(pour.sourceId, 'bottom_pour')
    assert.equal(pour.layer, 'bottom')
    assert.equal(pour.layerId, 32)
})

/**
 * Filters track primitives by source ID.
 * @param {object[]} tracks Track primitives.
 * @param {string} sourceId Source ID.
 * @returns {object[]}
 */
function tracksBySource(tracks, sourceId) {
    return tracks.filter((track) => track.sourceId === sourceId)
}

/**
 * Measures track endpoint bounds.
 * @param {{ x1?: number, y1?: number, x2?: number, y2?: number }[]} tracks
 * Track primitives.
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
function trackBounds(tracks) {
    return pointBounds(
        tracks.flatMap((track) => [
            { x: track.x1, y: track.y1 },
            { x: track.x2, y: track.y2 }
        ])
    )
}

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
