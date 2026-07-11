import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

import { PcbScene3dCircuitJsonAdapter } from '../src/PcbScene3dCircuitJsonAdapter.mjs'

test('CircuitJSON documentation sample is executable and canonical', async () => {
    const source = await readFile(
        new URL('../docs/circuitjson.md', import.meta.url),
        'utf8'
    )
    const match = source.match(
        /const circuitJson = (\[[\s\S]*?\n\])\n\ncontainer\.innerHTML/u
    )
    assert.ok(match, 'CircuitJSON documentation sample is missing.')
    const crossRealmModel = vm.runInNewContext(`(${match[1]})`)
    const model = JSON.parse(JSON.stringify(crossRealmModel))

    const scene = PcbScene3dCircuitJsonAdapter.build(model)

    assert.equal(scene.components.length, 1)
    assert.equal(scene.components[0].designator, 'R1')
    assert.equal(scene.detail.pads.length, 2)
    assert.equal(scene.detail.tracks.length, 1)
})
