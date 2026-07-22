import assert from 'node:assert/strict'
import test from 'node:test'

import { SelfAdjustingComputation as CanonicalRuntime } from 'circuitjson-toolkit'
import {
    SelfAdjustingComputation,
    PcbScene3dVisibilityGraph as PublicVisibilityGraph
} from '../src/index.mjs'
import { PcbScene3dVisibilityGraph } from '../src/PcbScene3dVisibilityGraph.mjs'

/**
 * Creates a render object that counts visible-property writes.
 * @returns {{ children: any[], renderOrder: number, userData: object, visible: boolean, visibilityWrites: number }} Render root.
 */
function trackedRoot() {
    let visible = true
    let writes = 0
    return {
        children: [],
        renderOrder: 0,
        userData: {},
        get visible() {
            return visible
        },
        set visible(value) {
            writes += 1
            visible = Boolean(value)
        },
        get visibilityWrites() {
            return writes
        }
    }
}

/**
 * Creates an isolated visibility-state fixture.
 * @returns {{ state: object, copperRoot: any, componentRoot: any }} Fixture.
 */
function visibilityFixture() {
    const copperRoot = trackedRoot()
    const componentRoot = trackedRoot()
    return {
        state: {
            groups: new Map([
                ['board', trackedRoot()],
                ['silkscreen', trackedRoot()],
                ['paste', trackedRoot()],
                ['copper', copperRoot],
                ['fallback-bodies', trackedRoot()],
                ['external-models', trackedRoot()]
            ]),
            toggles: {
                'external-models': true,
                'fallback-bodies': false,
                'model-search-models': true,
                copper: true
            },
            fallbackBodyRoots: new Map(),
            loadedExternalModelDesignators: new Set(),
            modelSearchExternalModelRoots: new Set(),
            hasLoadedBoardAssemblyModel: false,
            selectionRoots: new Map([['R1', new Set([componentRoot])]]),
            selectedDesignator: '',
            hiddenDesignators: new Set()
        },
        copperRoot,
        componentRoot
    }
}

test('public API shares the canonical runtime and visibility graph', () => {
    assert.equal(SelfAdjustingComputation, CanonicalRuntime)
    assert.equal(PublicVisibilityGraph, PcbScene3dVisibilityGraph)
})

test('repairs only the visibility stage that observes a changed root', () => {
    const graph = new PcbScene3dVisibilityGraph()
    const fixture = visibilityFixture()
    const initial = graph.apply(fixture.state, null)

    assert.equal(initial.get('render-groups').recomputed, true)
    assert.equal(initial.get('components').recomputed, true)
    const componentWrites = fixture.componentRoot.visibilityWrites

    fixture.state.toggles.copper = false
    const copperUpdate = graph.apply(fixture.state, [['toggles', 'copper']])

    assert.equal(copperUpdate.get('render-groups').recomputed, true)
    assert.equal(copperUpdate.get('components').recomputed, false)
    assert.equal(fixture.copperRoot.visible, false)
    assert.equal(fixture.componentRoot.visibilityWrites, componentWrites)

    fixture.state.hiddenDesignators.add('R1')
    const componentUpdate = graph.apply(fixture.state, [['componentRevision']])

    assert.equal(componentUpdate.get('render-groups').recomputed, false)
    assert.equal(componentUpdate.get('components').recomputed, true)
    assert.equal(fixture.componentRoot.visible, false)
})

test('unknown structural changes conservatively repair both stages', () => {
    const graph = new PcbScene3dVisibilityGraph()
    const fixture = visibilityFixture()
    graph.apply(fixture.state, null)

    const update = graph.apply(fixture.state, null)

    assert.equal(update.get('render-groups').recomputed, true)
    assert.equal(update.get('components').recomputed, true)
})

test('incremental visibility is consistent with a fresh graph', () => {
    const incrementalFixture = visibilityFixture()
    const incremental = new PcbScene3dVisibilityGraph()
    incremental.apply(incrementalFixture.state, null)
    incrementalFixture.state.toggles.copper = false
    incremental.apply(incrementalFixture.state, [['toggles', 'copper']])
    incrementalFixture.state.hiddenDesignators.add('R1')
    incremental.apply(incrementalFixture.state, [['componentRevision']])

    const freshFixture = visibilityFixture()
    freshFixture.state.toggles.copper = false
    freshFixture.state.hiddenDesignators.add('R1')
    new PcbScene3dVisibilityGraph().apply(freshFixture.state, null)

    assert.deepEqual(
        {
            component: incrementalFixture.componentRoot.visible,
            copper: incrementalFixture.copperRoot.visible
        },
        {
            component: freshFixture.componentRoot.visible,
            copper: freshFixture.copperRoot.visible
        }
    )
})
