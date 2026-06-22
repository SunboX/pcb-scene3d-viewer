import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dBoardSolderMaskFactory } from '../src/PcbScene3dBoardSolderMaskFactory.mjs'
import { PcbScene3dCopperDetailGroupBuilder } from '../src/PcbScene3dCopperDetailGroupBuilder.mjs'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'
import { PcbScene3dFallbackBodyFactory } from '../src/PcbScene3dFallbackBodyFactory.mjs'
import { PcbScene3dRuntime } from '../src/PcbScene3dRuntime.mjs'
import { PcbScene3dRuntimeBoardMeshes } from '../src/PcbScene3dRuntimeBoardMeshes.mjs'
import { PcbScene3dSilkscreenChunkedFactory } from '../src/PcbScene3dSilkscreenChunkedFactory.mjs'

/** @type {FakeScene | null} */
let lastCreatedScene = null

/**
 * Minimal mutable vector used by the fake runtime.
 */
class FakeVector3 {
    /** @type {number} */
    x

    /** @type {number} */
    y

    /** @type {number} */
    z

    /**
     * @param {number} [x]
     * @param {number} [y]
     * @param {number} [z]
     */
    constructor(x = 0, y = 0, z = 0) {
        this.x = x
        this.y = y
        this.z = z
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @returns {FakeVector3}
     */
    set(x, y, z) {
        this.x = x
        this.y = y
        this.z = z
        return this
    }

    /**
     * @param {number} scalar
     * @returns {FakeVector3}
     */
    multiplyScalar(scalar) {
        this.x *= scalar
        this.y *= scalar
        this.z *= scalar
        return this
    }
}

/**
 * Minimal event target.
 */
class FakeEventTarget {
    /** @type {Map<string, Set<(event: any) => void>>} */
    #listeners = new Map()

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
}

/**
 * Minimal renderer DOM node.
 */
class FakeDomNode extends FakeEventTarget {
    /** @type {string} */
    className = ''

    /** @type {Record<string, string>} */
    style = {}

    /**
     * @returns {{ width: number, height: number, left: number, top: number }}
     */
    getBoundingClientRect() {
        return { width: 800, height: 600, left: 0, top: 0 }
    }

    /**
     * @returns {void}
     */
    remove() {}
}

/**
 * Minimal Three group.
 */
class FakeGroup {
    /** @type {any[]} */
    children = []

    /** @type {FakeVector3} */
    position = new FakeVector3()

    /** @type {FakeVector3} */
    scale = new FakeVector3(1, 1, 1)

    /** @type {{ x: number, y: number, z: number }} */
    rotation = { x: 0, y: 0, z: 0 }

    /** @type {Record<string, any>} */
    userData = {}

    /** @type {boolean} */
    visible = true

    /**
     * @param {...any} children
     * @returns {void}
     */
    add(...children) {
        this.children.push(...children)
    }
}

/**
 * Minimal scene capture.
 */
class FakeScene extends FakeGroup {
    /**
     * Captures the latest fake scene instance.
     */
    constructor() {
        super()
        lastCreatedScene = this
    }
}

/**
 * Minimal shape that records path points.
 */
class FakeShape {
    /** @type {{ x: number, y: number }[]} */
    points = []

    /** @type {any[]} */
    holes = []

    /**
     * @param {number} x
     * @param {number} y
     * @returns {void}
     */
    moveTo(x, y) {
        this.points.push({ x, y })
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {void}
     */
    lineTo(x, y) {
        this.points.push({ x, y })
    }

    /**
     * @returns {void}
     */
    closePath() {}
}

/**
 * Minimal geometry holder.
 */
class FakeGeometry {
    /** @type {string} */
    type

    /** @type {Record<string, any>} */
    options

    /**
     * @param {string} type
     * @param {Record<string, any>} [options]
     */
    constructor(type, options = {}) {
        this.type = type
        this.options = options
    }

    /**
     * @returns {void}
     */
    translate() {}
}

/**
 * Minimal mesh.
 */
class FakeMesh {
    /** @type {any} */
    geometry

    /** @type {any} */
    material

    /** @type {FakeVector3} */
    position = new FakeVector3()

    /** @type {{ x: number, y: number, z: number }} */
    rotation = { x: 0, y: 0, z: 0 }

    /** @type {Record<string, any>} */
    userData = {}

    /**
     * @param {any} geometry
     * @param {any} material
     */
    constructor(geometry, material) {
        this.geometry = geometry
        this.material = material
    }
}

/**
 * Minimal camera.
 */
class FakePerspectiveCamera {
    /** @type {FakeVector3} */
    position = new FakeVector3()

    /** @type {FakeVector3} */
    up = new FakeVector3(0, 0, 1)

    /** @type {number} */
    aspect

    /**
     * @param {number} _fov
     * @param {number} aspect
     */
    constructor(_fov, aspect) {
        this.aspect = aspect
    }

    /**
     * @returns {void}
     */
    lookAt() {}

    /**
     * @returns {void}
     */
    updateProjectionMatrix() {}
}

/**
 * Minimal renderer.
 */
class FakeWebGLRenderer {
    /** @type {FakeDomNode} */
    domElement = new FakeDomNode()

    /**
     * @returns {void}
     */
    setPixelRatio() {}

    /**
     * @returns {void}
     */
    setSize() {}

    /**
     * @returns {void}
     */
    render() {}

    /**
     * @returns {void}
     */
    dispose() {}
}

/**
 * Minimal viewport.
 */
class FakeViewportNode {
    /**
     * @returns {{ width: number, height: number }}
     */
    getBoundingClientRect() {
        return { width: 800, height: 600 }
    }

    /**
     * @returns {void}
     */
    replaceChildren() {}
}

/**
 * Minimal controls.
 */
class FakeOrbitControls extends FakeEventTarget {
    /** @type {FakeVector3} */
    target = new FakeVector3()

    /**
     * @returns {void}
     */
    update() {}

    /**
     * @returns {void}
     */
    dispose() {}
}

/**
 * Builds fake runtime modules.
 * @returns {{ THREE: any, OrbitControls: typeof FakeOrbitControls }}
 */
function createFakeRuntimeModules() {
    return {
        THREE: {
            WebGLRenderer: FakeWebGLRenderer,
            Scene: FakeScene,
            PerspectiveCamera: FakePerspectiveCamera,
            Group: FakeGroup,
            AmbientLight: FakeGroup,
            DirectionalLight: class FakeDirectionalLight extends FakeGroup {},
            Fog: class FakeFog {},
            Mesh: FakeMesh,
            MeshStandardMaterial: class FakeMaterial {
                /** @param {Record<string, any>} options */
                constructor(options) {
                    this.options = options
                }
            },
            Shape: FakeShape,
            ExtrudeGeometry: class FakeExtrudeGeometry extends FakeGeometry {
                /**
                 * @param {any} shape Shape.
                 * @param {Record<string, any>} options Extrusion options.
                 */
                constructor(shape, options) {
                    super('ExtrudeGeometry', { shape, options })
                }
            },
            Raycaster: class FakeRaycaster {
                /** @returns {void} */
                setFromCamera() {}
                /** @returns {any[]} */
                intersectObjects() {
                    return []
                }
            },
            Vector2: class FakeVector2 {
                /** @type {number} */ x = 0
                /** @type {number} */ y = 0
            },
            MOUSE: { ROTATE: 'rotate', DOLLY: 'dolly', PAN: 'pan' }
        },
        OrbitControls: FakeOrbitControls
    }
}

/**
 * Walks a fake object tree.
 * @param {any} root Tree root.
 * @returns {any[]}
 */
function flattenTree(root) {
    if (!root) {
        return []
    }

    return [
        root,
        ...(Array.isArray(root.children) ? root.children : []).flatMap(
            (child) => flattenTree(child)
        )
    ]
}

test('PcbScene3dRuntime renders authored static body placements', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene
    const originalBuildBoardMesh = PcbScene3dRuntimeBoardMeshes.buildBoardMesh
    const originalBuildBoardOutline =
        PcbScene3dRuntimeBoardMeshes.buildBoardOutline
    const originalApplyBoardFaceSide =
        PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide
    const originalBuildSolderMaskGroup =
        PcbScene3dBoardSolderMaskFactory.buildGroup
    const originalBuildCopperGroup = PcbScene3dCopperDetailGroupBuilder.build
    const originalBuildSilkscreenGroup =
        PcbScene3dSilkscreenChunkedFactory.buildGroup

    globalThis.window = {
        devicePixelRatio: 1,
        /**
         * @param {() => void} callback Animation callback.
         * @returns {void}
         */
        requestAnimationFrame(callback) {
            callback()
        },
        /**
         * @returns {void}
         */
        addEventListener() {},
        /**
         * @returns {void}
         */
        removeEventListener() {}
    }
    globalThis.document = {}
    lastCreatedScene = null
    PcbScene3dExternalModels.loadIntoScene = async () => []
    PcbScene3dRuntimeBoardMeshes.buildBoardMesh = () => new FakeGroup()
    PcbScene3dRuntimeBoardMeshes.buildBoardOutline = () => new FakeGroup()
    PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide = () => {}
    PcbScene3dBoardSolderMaskFactory.buildGroup = () => new FakeGroup()
    PcbScene3dCopperDetailGroupBuilder.build = () => new FakeGroup()
    PcbScene3dSilkscreenChunkedFactory.buildGroup = () => new FakeGroup()

    const runtime = new PcbScene3dRuntime(
        new FakeViewportNode(),
        {
            board: {
                widthMil: 500,
                heightMil: 300,
                centerX: 250,
                centerY: 150,
                thicknessMil: 60,
                segments: []
            },
            components: [],
            staticBodyPlacements: [
                {
                    designator: 'U1',
                    mountSide: 'top',
                    rotationDeg: 90,
                    positionMil: { x: 20, y: 30, z: 50 },
                    geometry: {
                        kind: 'extruded-polygon',
                        status: 'complete',
                        heightMil: 40,
                        bodyColor: { raw: 0x808080 },
                        verticesMil: [
                            { x: -30, y: -10 },
                            { x: 30, y: -10 },
                            { x: 30, y: 10 },
                            { x: -30, y: 10 }
                        ]
                    }
                }
            ],
            detail: {
                silkscreen: {},
                tracks: [],
                arcs: [],
                pads: [],
                vias: []
            },
            externalPlacements: []
        },
        { loadRuntimeModules: async () => createFakeRuntimeModules() }
    )

    try {
        await runtime.whenReady()
        const staticBodyRoot = flattenTree(lastCreatedScene).find(
            (object) =>
                object?.userData?.scene3dSelection?.sourceType === 'static-body'
        )
        const staticBodyMesh = flattenTree(staticBodyRoot).find(
            (object) => object?.geometry?.type === 'ExtrudeGeometry'
        )

        assert.equal(staticBodyMesh?.geometry?.type, 'ExtrudeGeometry')
        assert.equal(staticBodyMesh?.material?.options?.color, 0x808080)
        assert.equal(
            staticBodyRoot?.userData?.scene3dSelection?.designator,
            'U1'
        )
    } finally {
        runtime.dispose()
        PcbScene3dSilkscreenChunkedFactory.buildGroup =
            originalBuildSilkscreenGroup
        PcbScene3dCopperDetailGroupBuilder.build = originalBuildCopperGroup
        PcbScene3dBoardSolderMaskFactory.buildGroup =
            originalBuildSolderMaskGroup
        PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide =
            originalApplyBoardFaceSide
        PcbScene3dRuntimeBoardMeshes.buildBoardOutline =
            originalBuildBoardOutline
        PcbScene3dRuntimeBoardMeshes.buildBoardMesh = originalBuildBoardMesh
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})

test('PcbScene3dRuntime skips suppressed procedural fallback bodies', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene
    const originalBuildBoardMesh = PcbScene3dRuntimeBoardMeshes.buildBoardMesh
    const originalBuildBoardOutline =
        PcbScene3dRuntimeBoardMeshes.buildBoardOutline
    const originalApplyBoardFaceSide =
        PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide
    const originalBuildSolderMaskGroup =
        PcbScene3dBoardSolderMaskFactory.buildGroup
    const originalBuildCopperGroup = PcbScene3dCopperDetailGroupBuilder.build
    const originalBuildSilkscreenGroup =
        PcbScene3dSilkscreenChunkedFactory.buildGroup
    const originalBuildFallbackBody = PcbScene3dFallbackBodyFactory.build
    const fallbackBuildDesignators = []

    globalThis.window = {
        devicePixelRatio: 1,
        /**
         * @param {() => void} callback Animation callback.
         * @returns {void}
         */
        requestAnimationFrame(callback) {
            callback()
        },
        /**
         * @returns {void}
         */
        addEventListener() {},
        /**
         * @returns {void}
         */
        removeEventListener() {}
    }
    globalThis.document = {}
    lastCreatedScene = null
    PcbScene3dExternalModels.loadIntoScene = async () => []
    PcbScene3dRuntimeBoardMeshes.buildBoardMesh = () => new FakeGroup()
    PcbScene3dRuntimeBoardMeshes.buildBoardOutline = () => new FakeGroup()
    PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide = () => {}
    PcbScene3dBoardSolderMaskFactory.buildGroup = () => new FakeGroup()
    PcbScene3dCopperDetailGroupBuilder.build = () => new FakeGroup()
    PcbScene3dSilkscreenChunkedFactory.buildGroup = () => new FakeGroup()
    PcbScene3dFallbackBodyFactory.build = (THREE, component) => {
        fallbackBuildDesignators.push(String(component?.designator || ''))
        return {
            rootGroup: new FakeGroup(),
            adjustmentGroup: new FakeGroup()
        }
    }

    const runtime = new PcbScene3dRuntime(
        new FakeViewportNode(),
        {
            board: {
                widthMil: 500,
                heightMil: 300,
                centerX: 250,
                centerY: 150,
                thicknessMil: 60,
                segments: []
            },
            components: [
                {
                    designator: 'U1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    renderFallbackBody: false,
                    positionMil: { x: 0, y: 0, z: 40 },
                    body: {
                        family: 'generic',
                        sizeMil: { width: 100, depth: 80, height: 20 }
                    }
                },
                {
                    designator: 'U2',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 120, y: 0, z: 40 },
                    body: {
                        family: 'generic',
                        sizeMil: { width: 100, depth: 80, height: 20 }
                    }
                }
            ],
            staticBodyPlacements: [],
            detail: {
                silkscreen: {},
                tracks: [],
                arcs: [],
                pads: [],
                vias: []
            },
            externalPlacements: []
        },
        { loadRuntimeModules: async () => createFakeRuntimeModules() }
    )

    try {
        await runtime.whenReady()

        assert.deepEqual(fallbackBuildDesignators, ['U2'])
    } finally {
        runtime.dispose()
        PcbScene3dFallbackBodyFactory.build = originalBuildFallbackBody
        PcbScene3dSilkscreenChunkedFactory.buildGroup =
            originalBuildSilkscreenGroup
        PcbScene3dCopperDetailGroupBuilder.build = originalBuildCopperGroup
        PcbScene3dBoardSolderMaskFactory.buildGroup =
            originalBuildSolderMaskGroup
        PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide =
            originalApplyBoardFaceSide
        PcbScene3dRuntimeBoardMeshes.buildBoardOutline =
            originalBuildBoardOutline
        PcbScene3dRuntimeBoardMeshes.buildBoardMesh = originalBuildBoardMesh
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})

test('PcbScene3dRuntime registers external model adjustment targets', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene
    const originalBuildBoardMesh = PcbScene3dRuntimeBoardMeshes.buildBoardMesh
    const originalBuildBoardOutline =
        PcbScene3dRuntimeBoardMeshes.buildBoardOutline
    const originalApplyBoardFaceSide =
        PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide
    const originalBuildSolderMaskGroup =
        PcbScene3dBoardSolderMaskFactory.buildGroup
    const originalBuildCopperGroup = PcbScene3dCopperDetailGroupBuilder.build
    const originalBuildSilkscreenGroup =
        PcbScene3dSilkscreenChunkedFactory.buildGroup
    let diagnostics = []
    let callbackType = ''
    let callbackReturned = false
    let resolveExternalLoad
    const externalLoadPromise = new Promise((resolve) => {
        resolveExternalLoad = resolve
    })

    globalThis.window = {
        devicePixelRatio: 1,
        /**
         * @param {() => void} callback Animation callback.
         * @returns {void}
         */
        requestAnimationFrame(callback) {
            callback()
        },
        /**
         * @returns {void}
         */
        addEventListener() {},
        /**
         * @returns {void}
         */
        removeEventListener() {}
    }
    globalThis.document = {}
    PcbScene3dExternalModels.loadIntoScene = async (options) => {
        const placementGroup = new FakeGroup()
        const adjustmentTarget = new FakeGroup()
        adjustmentTarget.userData.scene3dAdjustmentTarget = true
        placementGroup.add(adjustmentTarget)
        callbackType = typeof options.onPlacementGroup

        try {
            options.onPlacementGroup?.({ designator: 'U1' }, placementGroup)
            callbackReturned = true
            resolveExternalLoad?.()
            return []
        } catch (error) {
            resolveExternalLoad?.()
            return [
                'Could not load external model for U1: ' +
                    String(error?.message || error)
            ]
        }
    }
    PcbScene3dRuntimeBoardMeshes.buildBoardMesh = () => new FakeGroup()
    PcbScene3dRuntimeBoardMeshes.buildBoardOutline = () => new FakeGroup()
    PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide = () => {}
    PcbScene3dBoardSolderMaskFactory.buildGroup = () => new FakeGroup()
    PcbScene3dCopperDetailGroupBuilder.build = () => new FakeGroup()
    PcbScene3dSilkscreenChunkedFactory.buildGroup = () => new FakeGroup()

    const runtime = new PcbScene3dRuntime(
        new FakeViewportNode(),
        {
            board: {
                widthMil: 500,
                heightMil: 300,
                centerX: 250,
                centerY: 150,
                thicknessMil: 60,
                segments: []
            },
            components: [],
            staticBodyPlacements: [],
            detail: {
                silkscreen: {},
                tracks: [],
                arcs: [],
                pads: [],
                vias: []
            },
            externalPlacements: [
                {
                    designator: 'U1',
                    externalModel: {
                        name: 'fake.step',
                        format: 'step'
                    }
                }
            ]
        },
        {
            loadRuntimeModules: async () => createFakeRuntimeModules(),
            setDiagnostics(messages) {
                diagnostics = messages
            }
        }
    )

    try {
        await runtime.whenReady()
        await externalLoadPromise

        assert.equal(callbackType, 'function')
        assert.equal(callbackReturned, true)
        assert.equal(
            diagnostics.some((message) =>
                message.includes('PcbScene3dComponentAdjustment is not defined')
            ),
            false
        )
    } finally {
        runtime.dispose()
        PcbScene3dSilkscreenChunkedFactory.buildGroup =
            originalBuildSilkscreenGroup
        PcbScene3dCopperDetailGroupBuilder.build = originalBuildCopperGroup
        PcbScene3dBoardSolderMaskFactory.buildGroup =
            originalBuildSolderMaskGroup
        PcbScene3dRuntimeBoardMeshes.applyBoardFaceSide =
            originalApplyBoardFaceSide
        PcbScene3dRuntimeBoardMeshes.buildBoardOutline =
            originalBuildBoardOutline
        PcbScene3dRuntimeBoardMeshes.buildBoardMesh = originalBuildBoardMesh
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})
