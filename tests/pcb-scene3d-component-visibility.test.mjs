import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dComponentVisibility } from '../src/PcbScene3dComponentVisibility.mjs'

/**
 * Minimal render root fixture.
 */
class FakeRoot {
    /** @type {boolean} */
    visible

    constructor() {
        this.visible = true
    }
}

test('PcbScene3dComponentVisibility overlays selected component hidden state', () => {
    const hiddenDesignators = new Set()
    const fallbackRoot = new FakeRoot()
    const externalRoot = new FakeRoot()
    const modelSearchRoot = new FakeRoot()
    const otherRoot = new FakeRoot()
    const selectionRoots = new Map([
        ['C8', new Set([fallbackRoot, externalRoot, modelSearchRoot])],
        ['R1', new Set([otherRoot])]
    ])
    const fallbackBodyRoots = new Map([['C8', new Set([fallbackRoot])]])
    const modelSearchExternalModelRoots = new Set([modelSearchRoot])

    PcbScene3dComponentVisibility.apply({
        selectionRoots,
        hiddenDesignators,
        fallbackBodyRoots,
        loadedExternalModelDesignators: new Set(['C8']),
        modelSearchExternalModelRoots,
        toggles: {
            'external-models': true,
            'fallback-bodies': true,
            'model-search-models': false
        },
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(fallbackRoot.visible, false)
    assert.equal(externalRoot.visible, true)
    assert.equal(modelSearchRoot.visible, false)
    assert.equal(otherRoot.visible, true)

    assert.equal(
        PcbScene3dComponentVisibility.setHidden(hiddenDesignators, 'C8', true),
        true
    )
    PcbScene3dComponentVisibility.apply({
        selectionRoots,
        hiddenDesignators,
        fallbackBodyRoots,
        loadedExternalModelDesignators: new Set(['C8']),
        modelSearchExternalModelRoots,
        toggles: {
            'external-models': true,
            'fallback-bodies': true,
            'model-search-models': true
        },
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(fallbackRoot.visible, false)
    assert.equal(externalRoot.visible, false)
    assert.equal(modelSearchRoot.visible, false)
    assert.equal(otherRoot.visible, true)

    assert.equal(
        PcbScene3dComponentVisibility.setHidden(hiddenDesignators, 'C8', false),
        true
    )
    PcbScene3dComponentVisibility.apply({
        selectionRoots,
        hiddenDesignators,
        fallbackBodyRoots,
        loadedExternalModelDesignators: new Set(['C8']),
        modelSearchExternalModelRoots,
        toggles: {
            'external-models': false,
            'fallback-bodies': true,
            'model-search-models': true
        },
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(fallbackRoot.visible, true)
    assert.equal(externalRoot.visible, true)
    assert.equal(modelSearchRoot.visible, false)
    assert.equal(otherRoot.visible, true)
})
