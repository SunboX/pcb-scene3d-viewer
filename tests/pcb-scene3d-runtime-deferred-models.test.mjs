import assert from 'node:assert/strict'
import test from 'node:test'
import {
    FakeGroup,
    createDeferred,
    createRuntimeHarness,
    getLastCreatedRenderer,
    waitForCondition
} from './support/PcbScene3dRuntimeDeferredModelsHarness.mjs'

test('PcbScene3dRuntime does not start model import when disposed before the first deferred frame', async () => {
    const queuedFrames = []
    const events = []
    const harness = createRuntimeHarness({
        requestAnimationFrame: (callback) => {
            queuedFrames.push(callback)
            return queuedFrames.length
        },
        loadModels: async () => {
            events.push('model-start')
            return []
        }
    })

    try {
        await waitForCondition(
            () => queuedFrames.length === 1,
            'first deferred frame'
        )
        harness.runtime.dispose()
        queuedFrames.shift()?.()
        await new Promise((resolve) => setImmediate(resolve))

        assert.deepEqual(events, [])
    } finally {
        harness.restore()
    }
})

test('PcbScene3dRuntime starts model import before deferred board detail completes', async () => {
    const surfaceRelease = createDeferred()
    const modelRelease = createDeferred()
    const events = []
    const harness = createRuntimeHarness({
        loadSurface: async () => {
            events.push('surface-start')
            await surfaceRelease.promise
            events.push('surface-complete')
            return false
        },
        buildCopper: () => {
            events.push('copper-complete')
            return new FakeGroup()
        },
        loadModels: async () => {
            events.push('model-start')
            await modelRelease.promise
            events.push('model-complete')
            return []
        }
    })
    const readyPromise = harness.runtime.whenReady().then(() => {
        events.push('ready')
    })

    try {
        await waitForCondition(
            () => events.includes('surface-start'),
            'surface start'
        )
        surfaceRelease.resolve()
        await readyPromise
        await waitForCondition(
            () => events.includes('model-start'),
            'model start'
        )

        assert.ok(
            events.indexOf('model-start') < events.indexOf('surface-complete'),
            events.join(' -> ')
        )
        assert.ok(
            events.indexOf('model-start') < events.indexOf('copper-complete'),
            events.join(' -> ')
        )
        assert.ok(
            events.indexOf('copper-complete') < events.indexOf('ready'),
            events.join(' -> ')
        )
        assert.equal(events.includes('model-complete'), false)

        modelRelease.resolve()
        await waitForCondition(
            () => events.includes('model-complete'),
            'model completion'
        )
    } finally {
        surfaceRelease.resolve()
        modelRelease.resolve()
        harness.restore()
    }
})

test('PcbScene3dRuntime reapplies the current preset to models attached after a preset change', async () => {
    const modelRelease = createDeferred()
    const events = []
    let loadedModel = null
    const harness = createRuntimeHarness({
        loadModels: async (options) => {
            events.push('model-start')
            await modelRelease.promise
            loadedModel = {}
            options.externalModelsGroup.add(loadedModel)
            events.push('model-attached')
            return []
        },
        applyViewCompensation: (group, scale) => {
            for (const child of group?.children || []) {
                child.appliedViewScale = { ...scale }
            }
        }
    })

    try {
        await waitForCondition(
            () => events.includes('model-start'),
            'model start'
        )
        harness.runtime.setPreset('bottom')
        modelRelease.resolve()
        await waitForCondition(
            () => events.includes('model-attached'),
            'model attachment'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.deepEqual(loadedModel?.appliedViewScale, {
            x: -1,
            y: 1,
            z: 1
        })
    } finally {
        modelRelease.resolve()
        harness.restore()
    }
})

test('PcbScene3dRuntime reports immediate model rejection without an unhandled rejection', async () => {
    const surfaceRelease = createDeferred()
    const diagnostics = []
    const unhandledRejections = []
    const expectedDiagnostic =
        'Deferred 3D detail could not finish loading: model import failed'
    const onUnhandledRejection = (error) => {
        unhandledRejections.push(error)
    }
    process.on('unhandledRejection', onUnhandledRejection)
    const harness = createRuntimeHarness({
        loadSurface: async () => {
            await surfaceRelease.promise
            return false
        },
        loadModels: async () => {
            throw new Error('model import failed')
        },
        onDiagnostics: (messages) => {
            diagnostics.push(messages)
        }
    })

    try {
        await new Promise((resolve) => setImmediate(resolve))
        assert.deepEqual(unhandledRejections, [])

        surfaceRelease.resolve()
        await harness.runtime.whenReady()
        await waitForCondition(
            () =>
                diagnostics.some((messages) =>
                    messages.includes(expectedDiagnostic)
                ),
            'deferred model diagnostic'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.deepEqual(unhandledRejections, [])
    } finally {
        surfaceRelease.resolve()
        harness.restore()
        process.removeListener('unhandledRejection', onUnhandledRejection)
    }
})

test('PcbScene3dRuntime finalizes delayed models after a surface-stage failure', async () => {
    const modelRelease = createDeferred()
    const diagnostics = []
    const events = []
    let loadedModel = null
    const harness = createRuntimeHarness({
        loadSurface: async () => {
            throw new Error('surface failed')
        },
        loadModels: async (options) => {
            events.push('model-start')
            await modelRelease.promise
            loadedModel = {}
            options.externalModelsGroup.add(loadedModel)
            events.push('model-attached')
            return []
        },
        applyViewCompensation: (group, scale) => {
            for (const child of group?.children || []) {
                child.appliedViewScale = { ...scale }
            }
        },
        onDiagnostics: (messages) => {
            diagnostics.push(messages)
        }
    })

    try {
        await waitForCondition(
            () =>
                diagnostics.some((messages) =>
                    messages.includes(
                        'Deferred 3D detail could not finish loading: surface failed'
                    )
                ),
            'surface-stage diagnostic'
        )
        assert.equal(events.includes('model-attached'), false)
        harness.runtime.setPreset('bottom')
        const renderer = getLastCreatedRenderer()
        const renderCount = renderer?.renderCount

        modelRelease.resolve()
        await waitForCondition(
            () => events.includes('model-attached'),
            'late model attachment'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.deepEqual(loadedModel?.appliedViewScale, {
            x: -1,
            y: 1,
            z: 1
        })
        assert.equal(renderer?.renderCount, renderCount + 1)
    } finally {
        modelRelease.resolve()
        harness.restore()
    }
})

test('PcbScene3dRuntime handles delayed model rejection after a surface-stage failure', async () => {
    const modelRelease = createDeferred()
    const diagnostics = []
    const unhandledRejections = []
    const onUnhandledRejection = (error) => {
        unhandledRejections.push(error)
    }
    process.on('unhandledRejection', onUnhandledRejection)
    const harness = createRuntimeHarness({
        loadSurface: async () => {
            throw new Error('surface failed')
        },
        loadModels: async () => {
            await modelRelease.promise
            throw new Error('late model failed')
        },
        onDiagnostics: (messages) => {
            diagnostics.push(messages)
        }
    })

    try {
        await waitForCondition(
            () => diagnostics.length >= 2,
            'surface-stage diagnostic'
        )
        modelRelease.resolve()
        await waitForCondition(
            () =>
                diagnostics.some((messages) =>
                    messages.includes(
                        'Deferred 3D detail could not finish loading: late model failed'
                    )
                ),
            'late model diagnostic'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.deepEqual(unhandledRejections, [])
    } finally {
        modelRelease.resolve()
        harness.restore()
        process.removeListener('unhandledRejection', onUnhandledRejection)
    }
})

test('PcbScene3dRuntime skips the final render when disposed during model import', async () => {
    const modelRelease = createDeferred()
    const events = []
    const harness = createRuntimeHarness({
        loadModels: async () => {
            events.push('model-start')
            await modelRelease.promise
            events.push('model-complete')
            return []
        }
    })

    try {
        await harness.runtime.whenReady()
        await waitForCondition(
            () => events.includes('model-start'),
            'model start'
        )
        const renderer = getLastCreatedRenderer()
        const renderCount = renderer?.renderCount

        harness.runtime.dispose()
        modelRelease.resolve()
        await waitForCondition(
            () => events.includes('model-complete'),
            'model completion'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.equal(renderer?.renderCount, renderCount)
    } finally {
        modelRelease.resolve()
        harness.restore()
    }
})

test('PcbScene3dRuntime renders after successful deferred model import', async () => {
    const modelRelease = createDeferred()
    const events = []
    const harness = createRuntimeHarness({
        loadModels: async () => {
            events.push('model-start')
            await modelRelease.promise
            events.push('model-complete')
            return []
        }
    })

    try {
        await harness.runtime.whenReady()
        await waitForCondition(
            () => events.includes('model-start'),
            'model start'
        )
        const renderer = getLastCreatedRenderer()
        const renderCount = renderer?.renderCount

        modelRelease.resolve()
        await waitForCondition(
            () => events.includes('model-complete'),
            'model completion'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.equal(renderer?.renderCount, renderCount + 1)
    } finally {
        modelRelease.resolve()
        harness.restore()
    }
})
