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

test('PcbScene3dRuntime compensates each placement before pending surface work renders', async () => {
    const surfaceRelease = createDeferred()
    const placementRelease = createDeferred()
    const modelRelease = createDeferred()
    const events = []
    let placementGroup = null
    const harness = createRuntimeHarness({
        loadSurface: async () => {
            events.push('surface-start')
            await surfaceRelease.promise
            events.push('surface-complete')
            return false
        },
        loadModels: async (options) => {
            events.push('model-start')
            await placementRelease.promise
            placementGroup = new FakeGroup()
            options.externalModelsGroup.add(placementGroup)
            options.onPlacementGroup(
                { designator: 'U1', sourceType: 'component' },
                placementGroup
            )
            events.push('placement-registered')
            await modelRelease.promise
            return []
        },
        applyViewCompensation: (group, scale) => {
            if (group) {
                group.appliedViewScale = { ...scale }
            }
        }
    })

    try {
        await waitForCondition(
            () =>
                events.includes('surface-start') &&
                events.includes('model-start'),
            'surface and model start'
        )
        harness.runtime.setPreset('bottom')
        placementRelease.resolve()
        await waitForCondition(
            () => events.includes('placement-registered'),
            'placement registration'
        )

        assert.equal(events.includes('surface-complete'), false)
        assert.deepEqual(placementGroup?.appliedViewScale, {
            x: -1,
            y: 1,
            z: 1
        })
    } finally {
        placementRelease.resolve()
        modelRelease.resolve()
        surfaceRelease.resolve()
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

test('PcbScene3dRuntime publishes successful model diagnostics at the integration point', async () => {
    const surfaceRelease = createDeferred()
    const diagnostics = []
    const events = []
    const modelDiagnostic = 'placement model diagnostic'
    const harness = createRuntimeHarness({
        loadSurface: async () => {
            events.push('surface-start')
            await surfaceRelease.promise
            events.push('surface-complete')
            return false
        },
        loadModels: async () => {
            events.push('model-complete')
            return [modelDiagnostic]
        },
        onDiagnostics: (messages) => {
            diagnostics.push(messages)
        }
    })

    try {
        await waitForCondition(
            () =>
                events.includes('surface-start') &&
                events.includes('model-complete'),
            'surface start and model completion'
        )
        assert.equal(
            diagnostics.some((messages) => messages.includes(modelDiagnostic)),
            false
        )

        surfaceRelease.resolve()
        await waitForCondition(
            () =>
                diagnostics.some((messages) =>
                    messages.includes(modelDiagnostic)
                ),
            'model diagnostic integration'
        )
    } finally {
        surfaceRelease.resolve()
        harness.restore()
    }
})

test('PcbScene3dRuntime finalizes delayed models without replacing a surface-stage diagnostic', async () => {
    const modelRelease = createDeferred()
    const diagnostics = []
    const events = []
    const stageDiagnostic =
        'Deferred 3D detail could not finish loading: surface failed'
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
            return ['late model diagnostic']
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
                    messages.includes(stageDiagnostic)
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
        assert.equal(diagnostics.at(-1)?.includes(stageDiagnostic), true)
    } finally {
        modelRelease.resolve()
        harness.restore()
    }
})

test('PcbScene3dRuntime consumes a throwing late finalizer after a surface-stage failure', async () => {
    const modelRelease = createDeferred()
    const diagnostics = []
    const events = []
    const unhandledRejections = []
    let throwDuringFinalization = false
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
            events.push('model-complete')
            return []
        },
        applyViewCompensation: () => {
            if (throwDuringFinalization) {
                throw new Error('late finalizer callback failed')
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
        throwDuringFinalization = true
        modelRelease.resolve()
        await waitForCondition(
            () => events.includes('model-complete'),
            'model completion'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.deepEqual(unhandledRejections, [])
    } finally {
        modelRelease.resolve()
        harness.restore()
        process.removeListener('unhandledRejection', onUnhandledRejection)
    }
})

test('PcbScene3dRuntime keeps a surface failure visible after delayed model rejection', async () => {
    const modelRelease = createDeferred()
    const diagnostics = []
    const events = []
    const unhandledRejections = []
    const stageDiagnostic =
        'Deferred 3D detail could not finish loading: surface failed'
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
            events.push('model-rejected')
            throw new Error('late model failed')
        },
        onDiagnostics: (messages) => {
            diagnostics.push(messages)
        }
    })

    try {
        await waitForCondition(
            () =>
                diagnostics.some((messages) =>
                    messages.includes(stageDiagnostic)
                ),
            'surface-stage diagnostic'
        )
        modelRelease.resolve()
        await waitForCondition(
            () => events.includes('model-rejected'),
            'late model rejection'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.equal(diagnostics.at(-1)?.includes(stageDiagnostic), true)
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

test('PcbScene3dRuntime ignores model diagnostics that settle after disposal', async () => {
    const modelRelease = createDeferred()
    const diagnostics = []
    const events = []
    const harness = createRuntimeHarness({
        loadModels: async () => {
            events.push('model-start')
            await modelRelease.promise
            events.push('model-complete')
            return ['late model diagnostic']
        },
        onDiagnostics: (messages) => {
            diagnostics.push(messages)
        }
    })

    try {
        await waitForCondition(
            () => events.includes('model-start'),
            'model start'
        )
        harness.runtime.dispose()
        modelRelease.resolve()
        await waitForCondition(
            () => events.includes('model-complete'),
            'model completion'
        )
        await new Promise((resolve) => setImmediate(resolve))

        assert.equal(
            diagnostics.some((messages) =>
                messages.includes('late model diagnostic')
            ),
            false
        )
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
