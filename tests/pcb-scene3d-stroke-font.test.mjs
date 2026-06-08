import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dStrokeFont } from '../src/PcbScene3dStrokeFont.mjs'

test('PcbScene3dStrokeFont lays out width and strokes in one pass', () => {
    const attrs = { x: 12, y: 34, sizeX: 2, sizeY: 1.5 }
    const layout = PcbScene3dStrokeFont.layoutLine('A~{B}', attrs)

    assert.equal(layout.width, PcbScene3dStrokeFont.measureLine('A~{B}', 2))
    assert.deepEqual(
        layout.strokes,
        PcbScene3dStrokeFont.strokeLine('A~{B}', attrs)
    )
})
