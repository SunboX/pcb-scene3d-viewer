import assert from 'node:assert/strict'
import test from 'node:test'

import { PcbAssemblyGeometryBuilder } from '../src/scene3d.mjs'

/**
 * Builds a board with one rotated rectangular drill through board and copper.
 * @returns {object} Scene description.
 */
function createRectangularHolePadScene() {
    return {
        board: {
            widthMil: 1000,
            heightMil: 500,
            thicknessMil: 62,
            centerX: 500,
            centerY: 250,
            segments: [
                { type: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 },
                { type: 'line', x1: 1000, y1: 0, x2: 1000, y2: 500 },
                { type: 'line', x1: 1000, y1: 500, x2: 0, y2: 500 },
                { type: 'line', x1: 0, y1: 500, x2: 0, y2: 0 }
            ]
        },
        detail: {
            tracks: [],
            arcs: [],
            fills: [],
            polygons: [],
            pads: [
                {
                    x: 600,
                    y: 260,
                    shapeTop: 1,
                    shapeBottom: 1,
                    sizeTopX: 140,
                    sizeTopY: 140,
                    sizeBottomX: 140,
                    sizeBottomY: 140,
                    holeDiameter: 40,
                    holeWidth: 80,
                    holeHeight: 40,
                    holeShape: 1,
                    holeRotation: 30
                }
            ],
            vias: [],
            copperTexts: [],
            silkscreen: {
                top: { tracks: [], arcs: [], fills: [], texts: [] },
                bottom: { tracks: [], arcs: [], fills: [], texts: [] }
            }
        },
        components: [],
        externalPlacements: []
    }
}

test('assembly geometry preserves rectangular drill loops in board and copper', async () => {
    const geometry = await PcbAssemblyGeometryBuilder.build(
        createRectangularHolePadScene()
    )
    const meshes = ['board', 'pad-top-1', 'pad-bottom-1'].map((name) =>
        geometry.meshes.find((mesh) => mesh.name === name)
    )
    const expectedCorner = [75.358984, -27.320508]

    for (const mesh of meshes) {
        assert.ok(mesh)
        assert.equal(
            mesh.vertices.some(
                (vertex) =>
                    Math.abs(vertex[0] - expectedCorner[0]) < 0.001 &&
                    Math.abs(vertex[1] - expectedCorner[1]) < 0.001
            ),
            true,
            mesh.name
        )
    }
})
