import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dRenderGroupVisibility } from '../src/PcbScene3dRenderGroupVisibility.mjs'

/**
 * Minimal render group fixture.
 */
class FakeGroup {
    /** @type {boolean} */
    visible

    /** @type {number} */
    renderOrder

    /** @type {any[]} */
    children

    constructor() {
        this.visible = true
        this.renderOrder = 0
        this.children = []
    }

    /**
     * @param {any} child
     * @returns {void}
     */
    add(child) {
        this.children.push(child)
    }

    /**
     * @param {(object: any) => void} visitor
     * @returns {void}
     */
    traverse(visitor) {
        visitor(this)
        this.children.forEach((child) => {
            if (typeof child.traverse === 'function') {
                child.traverse(visitor)
                return
            }

            visitor(child)
        })
    }
}

/**
 * Minimal mesh fixture.
 */
class FakeMesh {
    /** @type {number} */
    renderOrder

    /** @type {{ depthTest: boolean, depthWrite: boolean }} */
    material

    constructor() {
        this.renderOrder = 0
        this.material = {
            depthTest: true,
            depthWrite: true
        }
    }
}

test('PcbScene3dRenderGroupVisibility preserves PCB detail while board assembly is active', () => {
    const groups = new Map(
        [
            'board',
            'silkscreen',
            'paste',
            'copper',
            'fallback-bodies',
            'external-models'
        ].map((name) => [name, new FakeGroup()])
    )

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': true,
            copper: true
        },
        fallbackBodyRoots: new Map(),
        loadedExternalModelDesignators: new Set(),
        hasLoadedBoardAssemblyModel: true
    })

    assert.equal(groups.get('board').visible, true)
    assert.equal(groups.get('silkscreen').visible, true)
    assert.equal(groups.get('paste').visible, true)
    assert.equal(groups.get('copper').visible, true)
    assert.equal(groups.get('fallback-bodies').visible, false)
    assert.equal(groups.get('external-models').visible, true)
})

test('PcbScene3dRenderGroupVisibility keeps component depth over board assemblies', () => {
    const groups = new Map(
        [
            'board',
            'silkscreen',
            'paste',
            'copper',
            'fallback-bodies',
            'external-models'
        ].map((name) => [name, new FakeGroup()])
    )
    const silkscreenMesh = new FakeMesh()
    const pasteMesh = new FakeMesh()
    const copperMesh = new FakeMesh()
    groups.get('silkscreen').add(silkscreenMesh)
    groups.get('paste').add(pasteMesh)
    groups.get('copper').add(copperMesh)

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': true,
            copper: true
        },
        fallbackBodyRoots: new Map(),
        loadedExternalModelDesignators: new Set(),
        hasLoadedBoardAssemblyModel: true
    })

    assert.equal(silkscreenMesh.renderOrder > 0, true)
    assert.equal(pasteMesh.renderOrder > 0, true)
    assert.equal(copperMesh.renderOrder > 0, true)
    assert.equal(silkscreenMesh.material.depthTest, true)
    assert.equal(pasteMesh.material.depthTest, true)
    assert.equal(copperMesh.material.depthTest, true)
    assert.equal(silkscreenMesh.material.depthWrite, true)
    assert.equal(pasteMesh.material.depthWrite, true)
    assert.equal(copperMesh.material.depthWrite, true)
})

test('PcbScene3dRenderGroupVisibility hides only model-search external roots', () => {
    const groups = new Map(
        [
            'board',
            'silkscreen',
            'copper',
            'fallback-bodies',
            'external-models'
        ].map((name) => [name, new FakeGroup()])
    )
    const modelSearchRoot = new FakeGroup()
    const regularExternalRoot = new FakeGroup()

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': false,
            'model-search-models': false,
            copper: true
        },
        fallbackBodyRoots: new Map(),
        loadedExternalModelDesignators: new Set(),
        modelSearchExternalModelRoots: new Set([modelSearchRoot]),
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(groups.get('external-models').visible, true)
    assert.equal(modelSearchRoot.visible, false)
    assert.equal(regularExternalRoot.visible, true)

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': false,
            'model-search-models': true,
            copper: true
        },
        fallbackBodyRoots: new Map(),
        loadedExternalModelDesignators: new Set(),
        modelSearchExternalModelRoots: new Set([modelSearchRoot]),
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(modelSearchRoot.visible, true)
})

test('PcbScene3dRenderGroupVisibility hides fallback group for disabled stitched companions', () => {
    const groups = new Map(
        [
            'board',
            'silkscreen',
            'copper',
            'fallback-bodies',
            'external-models'
        ].map((name) => [name, new FakeGroup()])
    )
    const companionFallback = new FakeGroup()
    companionFallback.userData = {
        scene3dFallbackExternalCompanion: true
    }
    const fallbackBodyRoots = new Map([['XO1', new Set([companionFallback])]])
    groups.get('fallback-bodies').add(companionFallback)

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': false,
            copper: true
        },
        fallbackBodyRoots,
        loadedExternalModelDesignators: new Set(['XO1']),
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(groups.get('fallback-bodies').visible, false)
    assert.equal(companionFallback.visible, false)

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': true,
            copper: true
        },
        fallbackBodyRoots,
        loadedExternalModelDesignators: new Set(['XO1']),
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(groups.get('fallback-bodies').visible, true)
    assert.equal(companionFallback.visible, true)
})

test('PcbScene3dRenderGroupVisibility hides fallback group for disabled unresolved bodies', () => {
    const groups = new Map(
        [
            'board',
            'silkscreen',
            'copper',
            'fallback-bodies',
            'external-models'
        ].map((name) => [name, new FakeGroup()])
    )
    const unresolvedFallback = new FakeGroup()
    const representedFallback = new FakeGroup()
    const fallbackBodyRoots = new Map([
        ['R5', new Set([unresolvedFallback])],
        ['J17', new Set([representedFallback])]
    ])
    groups.get('fallback-bodies').add(unresolvedFallback)
    groups.get('fallback-bodies').add(representedFallback)

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': false,
            copper: true
        },
        fallbackBodyRoots,
        loadedExternalModelDesignators: new Set(['J17']),
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(groups.get('fallback-bodies').visible, false)
    assert.equal(unresolvedFallback.visible, false)
    assert.equal(representedFallback.visible, false)

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': true,
            copper: true
        },
        fallbackBodyRoots,
        loadedExternalModelDesignators: new Set(['J17']),
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(groups.get('fallback-bodies').visible, true)
    assert.equal(unresolvedFallback.visible, true)
    assert.equal(representedFallback.visible, false)
})

test('PcbScene3dRenderGroupVisibility keeps authored static bodies when fallbacks are disabled', () => {
    const groups = new Map(
        [
            'board',
            'silkscreen',
            'copper',
            'fallback-bodies',
            'static-bodies',
            'external-models'
        ].map((name) => [name, new FakeGroup()])
    )

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': false,
            copper: true
        },
        fallbackBodyRoots: new Map(),
        loadedExternalModelDesignators: new Set(),
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(groups.get('fallback-bodies').visible, false)
    assert.equal(groups.get('static-bodies').visible, true)

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': true,
            copper: true
        },
        fallbackBodyRoots: new Map(),
        loadedExternalModelDesignators: new Set(),
        hasLoadedBoardAssemblyModel: false
    })

    assert.equal(groups.get('fallback-bodies').visible, true)
    assert.equal(groups.get('static-bodies').visible, true)

    PcbScene3dRenderGroupVisibility.apply({
        groups,
        toggles: {
            'external-models': true,
            'fallback-bodies': true,
            copper: true
        },
        fallbackBodyRoots: new Map(),
        loadedExternalModelDesignators: new Set(),
        hasLoadedBoardAssemblyModel: true
    })

    assert.equal(groups.get('fallback-bodies').visible, false)
    assert.equal(groups.get('static-bodies').visible, true)
})
