import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'

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
