import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dOcctImporterLoader } from '../src/PcbScene3dOcctImporterLoader.mjs'
import { PcbScene3dStepLoader } from '../src/PcbScene3dStepLoader.mjs'

/**
 * Minimal worker fake for STEP loader lifecycle tests.
 */
class FakeStepWorker {
    /** @type {Map<string, Set<(event: any) => void>>} */
    #listeners

    /** @type {any[]} */
    postedMessages

    /** @type {number} */
    terminateCalls

    /** @type {boolean} */
    #failNextPost

    /**
     * @param {{ failNextPost?: boolean }} [options]
     */
    constructor(options = {}) {
        this.#listeners = new Map()
        this.postedMessages = []
        this.terminateCalls = 0
        this.#failNextPost = options.failNextPost === true
    }

    /**
     * @param {string} type
     * @param {(event: any) => void} listener
     * @returns {void}
     */
    addEventListener(type, listener) {
        if (!this.#listeners.has(type)) {
            this.#listeners.set(type, new Set())
        }

        this.#listeners.get(type)?.add(listener)
    }

    /**
     * @param {string} type
     * @param {(event: any) => void} listener
     * @returns {void}
     */
    removeEventListener(type, listener) {
        this.#listeners.get(type)?.delete(listener)
    }

    /**
     * @param {{ buffer?: Uint8Array }} message
     * @param {Transferable[]} [transfer]
     * @returns {void}
     */
    postMessage(message, transfer = []) {
        const workerMessage = structuredClone(message, { transfer })
        this.postedMessages.push(workerMessage)
        queueMicrotask(() => {
            if (this.#failNextPost) {
                this.#failNextPost = false
                this.#emitError('Synthetic STEP worker failure.')
                return
            }

            const byteLength = Number(workerMessage?.buffer?.byteLength || 0)
            this.#emitMessage({
                success: true,
                meshes: [
                    {
                        name: 'body-' + this.postedMessages.length,
                        color: [0.4, 0.5, 0.6],
                        attributes: {
                            position: {
                                array: [0, 0, 0, byteLength || 1, 0, 0, 0, 1, 0]
                            },
                            normal: {
                                array: [0, 0, 1, 0, 0, 1, 0, 0, 1]
                            }
                        },
                        index: { array: [0, 1, 2] }
                    }
                ]
            })
        })
    }

    /**
     * @returns {void}
     */
    terminate() {
        this.terminateCalls += 1
    }

    /**
     * @param {any} data
     * @returns {void}
     */
    #emitMessage(data) {
        ;[...(this.#listeners.get('message') || [])].forEach((listener) =>
            listener({ data })
        )
    }

    /**
     * @param {string} message
     * @returns {void}
     */
    #emitError(message) {
        ;[...(this.#listeners.get('error') || [])].forEach((listener) =>
            listener({ message })
        )
    }
}

test('PcbScene3dOcctImporterLoader loads the package ESM factory directly', async () => {
    const loadedUrls = []
    const factoryOptions = []
    const importer = { ReadStepFile() {} }
    const result = await PcbScene3dOcctImporterLoader.load({
        resolveAssetUrl: (fileName) =>
            '/node_modules/@sunbox/occt-import-js/dist/' + fileName + '?v=12',
        loadModule: async (url) => {
            loadedUrls.push(url)
            return {
                default: async (options) => {
                    factoryOptions.push(options)
                    return importer
                }
            }
        }
    })

    assert.equal(result, importer)
    assert.deepEqual(loadedUrls, [
        '/node_modules/@sunbox/occt-import-js/dist/occt-import-js.js?v=12'
    ])
    assert.equal(
        factoryOptions[0].locateFile('occt-import-js.wasm'),
        '/node_modules/@sunbox/occt-import-js/dist/occt-import-js.wasm?v=12'
    )
    assert.equal(Object.hasOwn(globalThis, 'occtimportjs'), false)
})

test('PcbScene3dOcctImporterLoader rejects modules without a factory', async () => {
    await assert.rejects(
        PcbScene3dOcctImporterLoader.load({
            resolveAssetUrl: (fileName) => fileName,
            loadModule: async () => ({})
        }),
        /did not export a factory/u
    )
})

test('PcbScene3dOcctImporterLoader retries a rejected cached import', async () => {
    let loadCalls = 0
    const options = {
        resolveAssetUrl: (fileName) => '/retryable-occt/' + fileName,
        loadModule: async () => {
            loadCalls += 1
            if (loadCalls === 1) {
                throw new Error('Transient module failure.')
            }
            return {
                default: async () => ({ ReadStepFile() {} })
            }
        }
    }

    await assert.rejects(
        PcbScene3dOcctImporterLoader.loadCached(options),
        /Transient module failure/u
    )
    const importer = await PcbScene3dOcctImporterLoader.loadCached(options)
    const cachedImporter =
        await PcbScene3dOcctImporterLoader.loadCached(options)

    assert.equal(typeof importer.ReadStepFile, 'function')
    assert.equal(cachedImporter, importer)
    assert.equal(loadCalls, 2)
})

/**
 * Verifies repeated STEP loads reuse the cached importer result.
 */
test('PcbScene3dStepLoader caches parsed STEP payloads by model identity', async () => {
    let importerCalls = 0
    const loader = new PcbScene3dStepLoader({
        importerLoader: async () => ({
            ReadStepFile(content, params) {
                importerCalls += 1

                assert.equal(content instanceof Uint8Array, true)
                assert.equal(params.linearUnit, 'inch')

                return {
                    success: true,
                    meshes: [
                        {
                            name: 'body',
                            color: [0.5, 0.5, 0.5],
                            brep_faces: [
                                {
                                    first: 1,
                                    last: 1,
                                    color: [0.9, 0.8, 0.7]
                                }
                            ],
                            attributes: {
                                position: {
                                    array: [0, 0, 0, 1, 0, 0, 0, 1, 0]
                                },
                                normal: { array: [0, 0, 1, 0, 0, 1, 0, 0, 1] }
                            },
                            index: { array: [0, 1, 2] }
                        }
                    ]
                }
            }
        })
    })
    const model = {
        origin: 'embedded',
        name: 'SOT-23_Y.stp',
        format: 'step',
        payloadText: 'ISO-10303-21;',
        sourceStream: 'Models/0'
    }

    const firstLoad = await loader.loadModel(model)
    const secondLoad = await loader.loadModel(model)

    assert.equal(importerCalls, 1)
    assert.equal(firstLoad, secondLoad)
    assert.equal(firstLoad.meshPayloads.length, 1)
    assert.deepEqual(
        firstLoad.meshPayloads[0].positions,
        [0, 0, 0, 1, 0, 0, 0, 1, 0]
    )
    assert.deepEqual(firstLoad.meshPayloads[0].indices, [0, 1, 2])
    assert.deepEqual(firstLoad.meshPayloads[0].faceColors, [
        {
            first: 1,
            last: 1,
            color: [0.9, 0.8, 0.7]
        }
    ])
})

test('PcbScene3dStepLoader distinguishes canonical paths and reuses identical sources', async () => {
    let importerCalls = 0
    const loader = new PcbScene3dStepLoader({
        importerLoader: async () => ({
            ReadStepFile() {
                importerCalls += 1
                return {
                    success: true,
                    meshes: [
                        {
                            name: 'body',
                            color: [0.5, 0.5, 0.5],
                            attributes: {
                                position: {
                                    array: [0, 0, 0, 1, 0, 0, 0, 1, 0]
                                },
                                normal: { array: [] }
                            },
                            index: { array: [0, 1, 2] }
                        }
                    ]
                }
            }
        })
    })
    const first = {
        id: 'asset-a',
        name: 'body.step',
        format: 'step',
        data: new Uint8Array([1]),
        source: { projectRelativePath: 'models/a/body.step' }
    }
    const sameSource = {
        id: 'asset-a-copy',
        name: 'body.step',
        format: 'step',
        data: new Uint8Array([1]),
        source: { projectRelativePath: 'models/a/body.step' }
    }
    const collision = {
        id: 'asset-b',
        name: 'body.step',
        format: 'step',
        data: new Uint8Array([2]),
        source: { projectRelativePath: 'models/b/body.step' }
    }
    const textSource = {
        id: 'asset-c',
        name: 'body.step',
        format: 'step',
        text: 'ISO-10303-21;',
        source: { projectRelativePath: 'models/c/body.step' }
    }

    const firstResult = await loader.loadModel(first)
    const repeatedResult = await loader.loadModel(sameSource)
    const collisionResult = await loader.loadModel(collision)
    const textResult = await loader.loadModel(textSource)

    assert.equal(firstResult, repeatedResult)
    assert.notEqual(firstResult, collisionResult)
    assert.notEqual(collisionResult, textResult)
    assert.equal(importerCalls, 3)
})

/**
 * Verifies importer-provided typed arrays and compact face ranges survive
 * normalization so large STEP models do not get expanded back into plain JS
 * arrays before rendering.
 */
test('PcbScene3dStepLoader preserves typed mesh arrays and compact face runs', async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])
    const indices = new Uint32Array([0, 1, 2])
    const loader = new PcbScene3dStepLoader({
        importerLoader: async () => ({
            ReadStepFile() {
                return {
                    success: true,
                    meshes: [
                        {
                            name: 'typed-body',
                            color: [0.5, 0.5, 0.5],
                            brep_face_runs: [
                                {
                                    first: 0,
                                    last: 0,
                                    color: [0.9, 0.8, 0.7]
                                }
                            ],
                            attributes: {
                                position: { array: positions },
                                normal: { array: normals }
                            },
                            index: { array: indices }
                        }
                    ]
                }
            }
        })
    })

    const load = await loader.loadModel({
        origin: 'session',
        name: 'typed.step',
        format: 'step',
        payloadText: 'ISO-10303-21;',
        relativePath: 'parts/typed.step'
    })

    assert.equal(load.meshPayloads[0].positions, positions)
    assert.equal(load.meshPayloads[0].normals, normals)
    assert.equal(load.meshPayloads[0].indices, indices)
    assert.deepEqual(load.meshPayloads[0].faceColors, [
        {
            first: 0,
            last: 0,
            color: [0.9, 0.8, 0.7]
        }
    ])
})

/**
 * Verifies importer failures reject cleanly with a descriptive STEP error.
 */
test('PcbScene3dStepLoader rejects invalid STEP payloads cleanly', async () => {
    const loader = new PcbScene3dStepLoader({
        importerLoader: async () => ({
            ReadStepFile() {
                return {
                    success: false
                }
            }
        })
    })

    await assert.rejects(
        loader.loadModel({
            origin: 'embedded',
            name: 'broken.stp',
            format: 'step',
            payloadText: 'not a real step file',
            sourceStream: 'Models/9'
        }),
        /STEP import failed for broken\.stp/
    )
})

/**
 * Verifies STEP payloads with obviously baked-in XY world offsets are
 * normalized back around the local origin.
 */
test('PcbScene3dStepLoader normalizes large baked-in XY model offsets', async () => {
    const loader = new PcbScene3dStepLoader({
        importerLoader: async () => ({
            ReadStepFile() {
                return {
                    success: true,
                    meshes: [
                        {
                            name: 'body',
                            color: [0.5, 0.5, 0.5],
                            attributes: {
                                position: {
                                    array: [
                                        1000, 10, 0, 1001, 10, 0, 1000, 11, 0
                                    ]
                                },
                                normal: {
                                    array: [0, 0, 1, 0, 0, 1, 0, 0, 1]
                                }
                            },
                            index: { array: [0, 1, 2] }
                        }
                    ]
                }
            }
        })
    })

    const load = await loader.loadModel({
        origin: 'embedded',
        name: 'shifted.stp',
        format: 'step',
        payloadText: 'ISO-10303-21;',
        sourceStream: 'Models/1'
    })

    assert.deepEqual(
        load.meshPayloads[0].positions,
        [-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0]
    )
})

/**
 * Verifies project-local STEP models keep their authored origin because KiCad
 * applies footprint model transforms against that raw coordinate frame.
 */
test('PcbScene3dStepLoader preserves session STEP model origins', async () => {
    const loader = new PcbScene3dStepLoader({
        importerLoader: async () => ({
            ReadStepFile() {
                return {
                    success: true,
                    meshes: [
                        {
                            name: 'body',
                            color: [0.5, 0.5, 0.5],
                            attributes: {
                                position: {
                                    array: [
                                        1000, 10, 0, 1001, 10, 0, 1000, 11, 0
                                    ]
                                },
                                normal: {
                                    array: [0, 0, 1, 0, 0, 1, 0, 0, 1]
                                }
                            },
                            index: { array: [0, 1, 2] }
                        }
                    ]
                }
            }
        })
    })

    const load = await loader.loadModel({
        origin: 'session',
        name: 'project-local.step',
        format: 'step',
        payloadText: 'ISO-10303-21;',
        relativePath: 'parts/project-local.step'
    })

    assert.deepEqual(
        load.meshPayloads[0].positions,
        [1000, 10, 0, 1001, 10, 0, 1000, 11, 0]
    )
})

/**
 * Verifies browser runtimes use the installed OCCT worker by default so STEP
 * imports do not execute WASM on the main thread.
 */
test('PcbScene3dStepLoader uses a browser STEP worker by default', async () => {
    const originalWorker = globalThis.Worker
    const createdWorkerUrls = []
    let importerCalls = 0

    globalThis.Worker = class DefaultFakeStepWorker extends FakeStepWorker {
        /**
         * @param {string | URL} url
         */
        constructor(url) {
            super()
            createdWorkerUrls.push(String(url))
        }
    }

    const loader = new PcbScene3dStepLoader({
        importerLoader: async () => {
            importerCalls += 1
            return {
                ReadStepFile() {
                    return { success: false }
                }
            }
        }
    })

    try {
        const load = await loader.loadModel({
            origin: 'embedded',
            name: 'default-worker.step',
            format: 'step',
            payloadText: 'ISO-10303-21;DEFAULT',
            sourceStream: 'Models/13'
        })

        assert.equal(importerCalls, 0)
        assert.equal(createdWorkerUrls.length, 1)
        assert.match(
            createdWorkerUrls[0],
            /\/node_modules\/@sunbox\/occt-import-js\/dist\/occt-import-js-worker\.js/
        )
        assert.equal(load.meshPayloads.length, 1)
    } finally {
        loader.dispose?.()
        globalThis.Worker = originalWorker
    }
})

/**
 * Verifies worker-backed STEP imports reuse one persistent worker across
 * distinct model loads.
 */
test('PcbScene3dStepLoader reuses one STEP worker across distinct model loads', async () => {
    const createdWorkers = []
    const loader = new PcbScene3dStepLoader({
        stepWorkerFactory: () => {
            const worker = new FakeStepWorker()
            createdWorkers.push(worker)
            return worker
        }
    })

    const firstLoad = await loader.loadModel({
        origin: 'embedded',
        name: 'alpha.step',
        format: 'step',
        payloadText: 'ISO-10303-21;ALPHA',
        sourceStream: 'Models/10'
    })
    const secondLoad = await loader.loadModel({
        origin: 'embedded',
        name: 'beta.step',
        format: 'step',
        payloadText: 'ISO-10303-21;BETA',
        sourceStream: 'Models/11'
    })

    assert.equal(createdWorkers.length, 1)
    assert.equal(createdWorkers[0].postedMessages.length, 2)
    assert.equal(createdWorkers[0].terminateCalls, 0)
    assert.equal(firstLoad.meshPayloads.length, 1)
    assert.equal(secondLoad.meshPayloads.length, 1)

    loader.dispose?.()
})

test('PcbScene3dStepLoader preserves caller bytes across worker failure and retry', async () => {
    const sourceBytes = new Uint8Array([1, 2, 3, 4])
    let workerCreations = 0
    const loader = new PcbScene3dStepLoader({
        stepWorkerFactory: () => {
            workerCreations += 1
            return new FakeStepWorker({ failNextPost: workerCreations === 1 })
        }
    })
    const model = {
        origin: 'session',
        name: 'retryable.step',
        format: 'step',
        payloadBytes: sourceBytes,
        relativePath: 'parts/retryable.step'
    }

    await assert.rejects(
        loader.loadModel(model),
        /Synthetic STEP worker failure/u
    )
    assert.deepEqual(sourceBytes, new Uint8Array([1, 2, 3, 4]))
    assert.equal(sourceBytes.byteLength, 4)

    const retried = await loader.loadModel(model)
    assert.equal(retried.meshPayloads.length, 1)
    assert.equal(workerCreations, 2)

    loader.dispose()
})

/**
 * Verifies STEP loader disposal tears down the persistent worker exactly once.
 */
test('PcbScene3dStepLoader dispose terminates its persistent STEP worker', async () => {
    const worker = new FakeStepWorker()
    const loader = new PcbScene3dStepLoader({
        stepWorkerFactory: () => worker
    })

    await loader.loadModel({
        origin: 'embedded',
        name: 'gamma.step',
        format: 'step',
        payloadText: 'ISO-10303-21;GAMMA',
        sourceStream: 'Models/12'
    })

    loader.dispose()
    loader.dispose()

    assert.equal(worker.terminateCalls, 1)
})
