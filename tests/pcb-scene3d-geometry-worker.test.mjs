import assert from 'node:assert/strict'
import test from 'node:test'
import { Worker } from 'node:worker_threads'
import * as THREE from 'three'
import { PcbScene3dGeometryWorkerClient } from '../src/PcbScene3dGeometryWorkerClient.mjs'
import { PcbScene3dGeneratedGeometryBuilder } from '../src/PcbScene3dGeneratedGeometryBuilder.mjs'
import { PcbScene3dGeometryTransfer } from '../src/PcbScene3dGeometryTransfer.mjs'

/** @returns {object} Browser Worker API backed by an actual worker thread. */
function createWorker() {
    const worker = new Worker(
        new URL('./support/PcbScene3dGeometryWorkerThread.mjs', import.meta.url)
    )
    return {
        addEventListener(type, listener) {
            worker.on(type, (data) =>
                listener(type === 'message' ? { data } : data)
            )
        },
        postMessage(data) {
            worker.postMessage(data)
        },
        terminate() {
            worker.terminate()
        }
    }
}

/** @returns {object} Synthetic centered board with drills, a slot, copper and mask. */
function createScene() {
    return {
        sourceFormat: 'kicad',
        coordinateSystem: 'board',
        board: {
            widthMil: 1000,
            heightMil: 600,
            thicknessMil: 62,
            centerX: 100,
            centerY: 50,
            segments: [],
            surfaceColor: 0x315228,
            cutouts: [
                {
                    points: [
                        { x: 330, y: 100 },
                        { x: 390, y: 100 },
                        { x: 390, y: 180 },
                        { x: 330, y: 180 }
                    ]
                }
            ]
        },
        detail: {
            pads: [
                {
                    x: 40,
                    y: 40,
                    holeDiameter: 20,
                    plated: true,
                    sizeTopX: 45,
                    sizeTopY: 45,
                    sizeBottomX: 45,
                    sizeBottomY: 45,
                    shapeTop: 1,
                    shapeBottom: 1,
                    hasTopSolderMaskOpening: true,
                    hasBottomSolderMaskOpening: true
                },
                {
                    x: -100,
                    y: 80,
                    holeDiameter: 16,
                    holeShape: 2,
                    holeSlotLength: 40,
                    holeRotation: 25,
                    plated: false,
                    sizeTopX: 60,
                    sizeTopY: 35
                }
            ],
            vias: [{ x: 180, y: 70, diameter: 38, holeDiameter: 18 }],
            tracks: [
                { x1: -150, y1: 40, x2: 250, y2: 40, width: 18, layerId: 1 },
                {
                    x1: -150,
                    y1: -40,
                    x2: 250,
                    y2: -40,
                    width: 14,
                    layerId: 32,
                    solderMaskExpansion: 4
                }
            ],
            fills: [{ x1: -160, y1: -150, x2: 180, y2: -80, layerId: 1 }],
            arcs: [],
            polygons: [],
            copperTexts: [],
            silkscreen: {
                top: { fills: [{ x1: 0, y1: 32, x2: 20, y2: 48 }] },
                bottom: {}
            }
        }
    }
}

/**
 * Captures exact observable output independently of transfer encoding.
 * @param {any} root Generated tree.
 * @returns {object[]}
 */
function snapshot(root) {
    const result = []
    root.traverse((object) => {
        const materials = Array.isArray(object.material)
            ? object.material
            : object.material
              ? [object.material]
              : []
        result.push({
            type: object.type,
            name: object.name,
            visible: object.visible,
            userData: object.userData,
            position: object.position.toArray(),
            quaternion: object.quaternion.toArray(),
            scale: object.scale.toArray(),
            attributes: object.geometry
                ? Object.fromEntries(
                      Object.entries(object.geometry.attributes).map(
                          ([name, attribute]) => [
                              name,
                              {
                                  array: [...attribute.array],
                                  itemSize: attribute.itemSize,
                                  normalized: attribute.normalized,
                                  type: attribute.array.constructor.name
                              }
                          ]
                      )
                  )
                : null,
            index: object.geometry?.index
                ? [...object.geometry.index.array]
                : null,
            groups: object.geometry?.groups,
            materials: materials.map((material) => {
                const { uuid, metadata, ...properties } = material.toJSON()
                return properties
            })
        })
    })
    return result
}

for (const kind of ['board', 'copper']) {
    test(
        'geometry worker returns exact ' +
            kind +
            ' detail while the caller remains responsive',
        async (t) => {
            const scene = createScene()
            const expected = PcbScene3dGeneratedGeometryBuilder.build(
                THREE,
                kind,
                scene
            )
            t.mock.method(PcbScene3dGeneratedGeometryBuilder, 'build', () => {
                throw new Error('Geometry must be constructed in the worker.')
            })
            const client = new PcbScene3dGeometryWorkerClient({
                workerFactory: createWorker,
                threeModuleUrl: import.meta.resolve('three')
            })
            let turns = 0
            const heartbeat = setInterval(() => turns++, 1)
            try {
                const actual = await client.build(THREE, kind, scene)
                assert.ok(
                    turns > 0,
                    'event loop must run while worker builds geometry'
                )
                assert.deepEqual(snapshot(actual), snapshot(expected))
                assert.ok(actual.children.length > 0)
                PcbScene3dGeometryTransfer.dispose(actual)
            } finally {
                clearInterval(heartbeat)
                client.dispose()
                PcbScene3dGeometryTransfer.dispose(expected)
            }
        }
    )
}

test('unavailable or failed workers fall back to the complete generated geometry', async () => {
    const scene = createScene()
    for (const workerFactory of [
        () => {
            throw new Error('blocked')
        },
        () => ({
            addEventListener() {},
            postMessage() {
                throw new Error('clone failed')
            },
            terminate() {}
        }),
        () => ({
            addEventListener(type, listener) {
                if (type === 'error')
                    setTimeout(() => listener({ message: 'load failed' }), 0)
            },
            postMessage() {},
            terminate() {}
        }),
        () => ({
            addEventListener(type, listener) {
                if (type === 'messageerror') setTimeout(() => listener({}), 0)
            },
            postMessage() {},
            terminate() {}
        }),
        () => ({ addEventListener() {}, postMessage() {}, terminate() {} })
    ]) {
        const client = new PcbScene3dGeometryWorkerClient({
            workerFactory,
            requestTimeoutMs: 25
        })
        try {
            const actual = await client.build(THREE, 'board', scene)
            const expected = PcbScene3dGeneratedGeometryBuilder.build(
                THREE,
                'board',
                scene
            )
            assert.deepEqual(snapshot(actual), snapshot(expected))
            PcbScene3dGeometryTransfer.dispose(actual)
            PcbScene3dGeometryTransfer.dispose(expected)
        } finally {
            client.dispose()
        }
    }
})

test('worker geometry preserves assembly visibility while leaving input buffers usable', async () => {
    const scene = createScene()
    scene.boardAssemblyModel = {
        format: 'step',
        payload: new Uint8Array([1, 2, 3])
    }
    scene.detail.geometryMetadata = new Uint8Array([4, 5, 6])
    const client = new PcbScene3dGeometryWorkerClient({
        workerFactory: createWorker,
        threeModuleUrl: import.meta.resolve('three')
    })
    try {
        const actual = await client.build(THREE, 'board', scene)
        const expected = PcbScene3dGeneratedGeometryBuilder.build(
            THREE,
            'board',
            scene
        )
        assert.deepEqual(snapshot(actual), snapshot(expected))
        assert.deepEqual([...scene.detail.geometryMetadata], [4, 5, 6])
        assert.deepEqual([...scene.boardAssemblyModel.payload], [1, 2, 3])
        PcbScene3dGeometryTransfer.dispose(actual)
        PcbScene3dGeometryTransfer.dispose(expected)
    } finally {
        client.dispose()
    }
})

test('disposing an in-flight build cancels it without rebuilding on the caller', async () => {
    const client = new PcbScene3dGeometryWorkerClient({
        workerFactory: createWorker,
        threeModuleUrl: import.meta.resolve('three')
    })
    const pending = client.build(THREE, 'board', createScene())
    client.dispose()
    await assert.rejects(pending, { name: 'AbortError' })
    await assert.rejects(client.build(THREE, 'copper', createScene()), {
        name: 'AbortError'
    })
})

test('worker copper keeps source mask-layer text openings on both board faces', async (t) => {
    const scene = createScene()
    scene.texts = ['front', 'back'].map((side, index) => ({
        value: 'MARK',
        side,
        layer: index ? 'B.Mask' : 'F.Mask',
        x: 100,
        y: index ? 150 : -100,
        rotation: 0,
        mirrored: Boolean(index)
    }))
    scene.detail.copperTexts = scene.texts.map((text, index) => ({
        ...text,
        layer: index ? 'B.Cu' : 'F.Cu',
        height: 50,
        width: 50,
        strokeWidth: 5
    }))
    const expected = PcbScene3dGeneratedGeometryBuilder.build(
        THREE,
        'copper',
        scene
    )
    const textNodes = snapshot(expected).filter(
        (object) => object.name === 'copper-text'
    )
    assert.equal(textNodes.length, 2)
    assert.ok(
        textNodes.every((object) => object.attributes.position.array.length > 0)
    )
    t.mock.method(PcbScene3dGeneratedGeometryBuilder, 'build', () => {
        throw new Error('Copper text must be constructed in the worker.')
    })
    const client = new PcbScene3dGeometryWorkerClient({
        workerFactory: createWorker,
        threeModuleUrl: import.meta.resolve('three')
    })
    try {
        const actual = await client.build(THREE, 'copper', scene)
        assert.deepEqual(snapshot(actual), snapshot(expected))
        PcbScene3dGeometryTransfer.dispose(actual)
    } finally {
        client.dispose()
        PcbScene3dGeometryTransfer.dispose(expected)
    }
})
