import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dGeometryWorkerClient } from '../src/PcbScene3dGeometryWorkerClient.mjs'
import {
    FakeGroup,
    createDeferred,
    createRuntimeHarness,
    getLastCreatedRenderer,
    waitForCondition
} from './support/PcbScene3dRuntimeDeferredModelsHarness.mjs'

test('runtime renders before generated geometry and waits for complete board and copper attachment', async (t) => {
    const board = createDeferred()
    const copper = createDeferred()
    const stages = []
    t.mock.method(
        PcbScene3dGeometryWorkerClient.prototype,
        'build',
        async (_THREE, kind) => {
            stages.push(kind)
            await (kind === 'board' ? board : copper).promise
            const group = new FakeGroup()
            group.add(new FakeGroup())
            return group
        }
    )
    const harness = createRuntimeHarness()
    let ready = false
    harness.runtime.whenReady().then(() => (ready = true))
    try {
        await waitForCondition(
            () => stages.includes('board'),
            'board worker start'
        )
        assert.ok(getLastCreatedRenderer().renderCount > 0)
        assert.equal(ready, false)
        board.resolve()
        await waitForCondition(
            () => stages.includes('copper'),
            'copper worker start'
        )
        assert.equal(ready, false)
        harness.runtime.setToggle('copper', false)
        copper.resolve()
        await harness.runtime.whenReady()
        assert.deepEqual(stages, ['board', 'copper'])
    } finally {
        board.resolve()
        copper.resolve()
        harness.restore()
    }
})

for (const pendingKind of ['board', 'copper']) {
    test(
        'runtime disposes detached ' +
            pendingKind +
            ' geometry returned after disposal',
        async (t) => {
            const release = createDeferred()
            let started = false
            let disposals = 0
            t.mock.method(
                PcbScene3dGeometryWorkerClient.prototype,
                'build',
                async (_THREE, kind) => {
                    if (kind === pendingKind) {
                        started = true
                        await release.promise
                    }
                    const group = new FakeGroup()
                    if (kind === pendingKind) {
                        const mesh = new FakeGroup()
                        mesh.geometry = {
                            dispose() {
                                disposals++
                            }
                        }
                        mesh.material = {
                            dispose() {
                                disposals++
                            }
                        }
                        group.add(mesh)
                    }
                    return group
                }
            )
            const harness = createRuntimeHarness()
            try {
                await waitForCondition(() => started, pendingKind + ' start')
                harness.runtime.dispose()
                release.resolve()
                await waitForCondition(
                    () => disposals === 2,
                    'detached geometry disposal'
                )
            } finally {
                release.resolve()
                harness.restore()
            }
        }
    )
}
