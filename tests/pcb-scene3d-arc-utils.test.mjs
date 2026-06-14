import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dArcUtils } from '../src/PcbScene3dArcUtils.mjs'

test('PcbScene3dArcUtils keeps legacy endpoint arcs on the short sweep', () => {
    assert.equal(
        PcbScene3dArcUtils.resolveArcSweepDelta({
            startAngle: 200,
            endAngle: 160
        }),
        -40
    )
})

test('PcbScene3dArcUtils preserves explicit long arc sweep angles', () => {
    assert.equal(
        PcbScene3dArcUtils.resolveArcSweepDelta({
            startAngle: 200,
            endAngle: 160,
            sweepAngle: 320
        }),
        320
    )
})
