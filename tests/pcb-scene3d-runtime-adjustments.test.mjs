import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'
import { PcbScene3dRuntime } from '../src/PcbScene3dRuntime.mjs'

/** @type {FakeScene | null} */
let lastCreatedScene = null

/**
 * Minimal event target used by the runtime harness.
 */
class FakeEventTarget {
    /** @type {Map<string, Set<(event: any) => void>>} */
    #listeners = new Map()

    /** @param {string} type @param {(event: any) => void} listener */
    addEventListener(type, listener) {
        if (!this.#listeners.has(type)) {
            this.#listeners.set(type, new Set())
        }
        this.#listeners.get(type)?.add(listener)
    }

    /** @param {string} type @param {(event: any) => void} listener */
    removeEventListener(type, listener) {
        this.#listeners.get(type)?.delete(listener)
    }
}

/**
 * Minimal mutable vector for fake Three.js objects.
 */
class FakeVector3 {
    /** @type {number} */
    x
    /** @type {number} */
    y
    /** @type {number} */
    z

    /** @param {number} [x] @param {number} [y] @param {number} [z] */
    constructor(x = 0, y = 0, z = 0) {
        this.x = x
        this.y = y
        this.z = z
    }

    /** @param {number} x @param {number} y @param {number} z @returns {FakeVector3} */
    set(x, y, z) {
        this.x = x
        this.y = y
        this.z = z
        return this
    }

    /** @param {number} scalar @returns {FakeVector3} */
    multiplyScalar(scalar) {
        this.x *= scalar
        this.y *= scalar
        this.z *= scalar
        return this
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

    /** @returns {{ width: number, height: number, left: number, top: number }} */
    getBoundingClientRect() {
        return { width: 960, height: 560, left: 0, top: 0 }
    }

    /** @returns {void} */
    remove() {}
}

/**
 * Minimal Three.js group.
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

    /** @param {...any} children @returns {void} */
    add(...children) {
        this.children.push(...children)
    }
}

/**
 * Minimal scene that captures the created graph.
 */
class FakeScene extends FakeGroup {
    constructor() {
        super()
        lastCreatedScene = this
    }
}

/**
 * Minimal shape used by board geometry.
 */
class FakeShape {
    /** @type {{ x: number, y: number }[]} */
    #points = []
    /** @type {any[]} */
    holes = []

    /** @param {number} x @param {number} y @returns {void} */
    moveTo(x, y) {
        this.#points.push({ x, y })
    }

    /** @param {number} x @param {number} y @returns {void} */
    lineTo(x, y) {
        this.#points.push({ x, y })
    }

    /** @returns {void} */
    closePath() {}

    /** @returns {{ x: number, y: number }[]} */
    getPoints() {
        return [...this.#points]
    }
}

/**
 * Minimal geometry wrapper.
 */
class FakeGeometry {
    /** @type {string} */
    type

    /** @param {string} type */
    constructor(type) {
        this.type = type
    }

    /** @returns {void} */
    translate() {}
}

/**
 * Minimal buffer geometry.
 */
class FakeBufferGeometry extends FakeGeometry {
    /** @type {Map<string, any>} */
    attributes = new Map()

    constructor() {
        super('BufferGeometry')
    }

    /** @param {string} name @param {any} attribute @returns {void} */
    setAttribute(name, attribute) {
        this.attributes.set(name, attribute)
    }

    /** @returns {void} */
    computeVertexNormals() {}
}

/**
 * Minimal float buffer attribute.
 */
class FakeFloat32BufferAttribute {
    /** @param {number[]} _array @param {number} _itemSize */
    constructor(_array, _itemSize) {}
}

/**
 * Minimal material wrapper.
 */
class FakeMaterial {
    /** @param {Record<string, any>} _options */
    constructor(_options) {}
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

    /** @param {any} geometry @param {any} material */
    constructor(geometry, material) {
        this.geometry = geometry
        this.material = material
    }
}

/**
 * Minimal line loop.
 */
class FakeLineLoop extends FakeMesh {}

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

    /** @param {number} _fov @param {number} aspect */
    constructor(_fov, aspect) {
        this.aspect = aspect
    }

    /** @returns {void} */
    lookAt() {}

    /** @returns {void} */
    updateProjectionMatrix() {}
}

/**
 * Minimal renderer.
 */
class FakeWebGLRenderer {
    /** @type {FakeDomNode} */
    domElement = new FakeDomNode()

    /** @returns {void} */
    setPixelRatio() {}

    /** @returns {void} */
    setSize() {}

    /** @returns {void} */
    render() {}

    /** @returns {void} */
    dispose() {}
}

/**
 * Minimal raycaster.
 */
class FakeRaycaster {
    /** @returns {void} */
    setFromCamera() {}

    /** @returns {any[]} */
    intersectObjects() {
        return []
    }
}

/**
 * Minimal orbit controls.
 */
class FakeOrbitControls extends FakeEventTarget {
    /** @type {FakeVector3} */
    target = new FakeVector3()

    /** @returns {void} */
    update() {}

    /** @returns {void} */
    dispose() {}
}

/**
 * Minimal viewport mount.
 */
class FakeViewportNode {
    /** @type {any[]} */
    children = []

    /** @returns {{ width: number, height: number }} */
    getBoundingClientRect() {
        return { width: 960, height: 560 }
    }

    /** @param {...any} children @returns {void} */
    replaceChildren(...children) {
        this.children = children
    }
}

/**
 * Builds the fake runtime modules.
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
            LineLoop: FakeLineLoop,
            MeshStandardMaterial: FakeMaterial,
            MeshBasicMaterial: FakeMaterial,
            LineBasicMaterial: FakeMaterial,
            BoxGeometry: class FakeBoxGeometry extends FakeGeometry {
                constructor() {
                    super('BoxGeometry')
                }
            },
            CylinderGeometry: class FakeCylinderGeometry extends FakeGeometry {
                constructor() {
                    super('CylinderGeometry')
                }
            },
            ExtrudeGeometry: class FakeExtrudeGeometry extends FakeGeometry {
                constructor() {
                    super('ExtrudeGeometry')
                }
            },
            BufferGeometry: FakeBufferGeometry,
            Float32BufferAttribute: FakeFloat32BufferAttribute,
            Shape: FakeShape,
            Raycaster: FakeRaycaster,
            Vector2: class FakeVector2 {
                /** @type {number} */
                x = 0
                /** @type {number} */
                y = 0
            },
            DoubleSide: 'DoubleSide',
            FrontSide: 'FrontSide',
            MOUSE: { ROTATE: 'rotate', DOLLY: 'dolly', PAN: 'pan' }
        },
        OrbitControls: FakeOrbitControls
    }
}

/**
 * Resolves the fallback-bodies render group from the current fake scene tree.
 * @returns {FakeGroup | undefined}
 */
function resolveFallbackBodiesGroup() {
    const rootGroup = resolveRootGroup()
    if (!rootGroup) {
        return undefined
    }

    return rootGroup.children.find(
        (group) =>
            Array.isArray(group?.children) &&
            group.children.some(
                (child) =>
                    child?.userData?.scene3dSelection?.designator === 'U1'
            )
    )
}

/**
 * Resolves one fallback root by designator.
 * @param {string} designator Component designator.
 * @returns {FakeGroup | undefined}
 */
function resolveFallbackRoot(designator) {
    return resolveFallbackBodiesGroup()?.children?.find(
        (child) => child?.userData?.scene3dSelection?.designator === designator
    )
}

/**
 * Resolves the root PCB render group from the current fake scene tree.
 * @returns {FakeGroup | undefined}
 */
function resolveRootGroup() {
    return lastCreatedScene?.children?.[0]?.children?.[0]
}

/**
 * Finds the first registered component adjustment target in the fake scene.
 * @param {any} root Root object.
 * @returns {FakeGroup | undefined}
 */
function findAdjustmentTarget(root = resolveRootGroup()) {
    if (!root) {
        return undefined
    }

    if (root?.userData?.scene3dAdjustmentTarget) {
        return root
    }

    for (const child of root?.children || []) {
        const target = findAdjustmentTarget(child)
        if (target) {
            return target
        }
    }

    return undefined
}

/**
 * Finds one selectable render root by designator in the fake scene.
 * @param {string} designator Component designator.
 * @param {any} root Root object.
 * @returns {FakeGroup | undefined}
 */
function findSelectionRoot(designator, root = resolveRootGroup()) {
    if (!root) {
        return undefined
    }

    if (root?.userData?.scene3dSelection?.designator === designator) {
        return root
    }

    for (const child of root?.children || []) {
        const target = findSelectionRoot(designator, child)
        if (target) {
            return target
        }
    }

    return undefined
}

/**
 * Finds one rendered selection marker by designator in the fake scene.
 * @param {string} designator Component designator.
 * @param {any} root Root object.
 * @returns {FakeGroup | undefined}
 */
function findSelectionMarker(designator, root = resolveRootGroup()) {
    if (!root) {
        return undefined
    }

    if (root?.userData?.scene3dSelectionMarker?.designator === designator) {
        return root
    }

    for (const child of root?.children || []) {
        const target = findSelectionMarker(designator, child)
        if (target) {
            return target
        }
    }

    return undefined
}

/**
 * Flushes promise turns so async runtime stages can advance.
 * @param {number} turns Turns to flush.
 * @returns {Promise<void>}
 */
async function flushAsyncTurns(turns = 1) {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve()
    }
}

/**
 * Creates a minimal scene description with one fake component.
 * @param {any[]} externalPlacements External placements.
 * @returns {any}
 */
function createSceneDescription(externalPlacements = []) {
    return {
        board: {
            widthMil: 1200,
            heightMil: 800,
            centerX: 0,
            centerY: 0,
            thicknessMil: 62,
            segments: []
        },
        components: [
            {
                designator: 'U1',
                mountSide: 'top',
                rotationDeg: 0,
                positionMil: { x: 0, y: 0, z: 20 },
                body: {
                    family: 'chip',
                    sizeMil: {
                        width: 80,
                        depth: 60,
                        height: 40
                    }
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
        externalPlacements
    }
}

test('PcbScene3dRuntime tags fallback bodies that stitch partial embedded external models', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene
    let loadedSceneDescription = null

    globalThis.window = {
        devicePixelRatio: 1,
        requestAnimationFrame(callback) {
            callback()
        },
        addEventListener() {},
        removeEventListener() {}
    }
    globalThis.document = {}
    lastCreatedScene = null
    PcbScene3dExternalModels.loadIntoScene = async (options) => {
        loadedSceneDescription = options.sceneDescription
        const placement = options.sceneDescription.externalPlacements[0]
        options.onPlacementGroup?.(placement, new FakeGroup())
        return []
    }

    const runtime = new PcbScene3dRuntime(
        new FakeViewportNode(),
        createSceneDescription([
            {
                designator: 'U1',
                mountSide: 'top',
                positionMil: { x: 0, y: 0, z: 0 },
                projection: {
                    source: 'model-anchor-fallback',
                    boundsMil: { width: 0, depth: 0, height: 0 }
                },
                externalModel: {
                    origin: 'embedded',
                    name: 'partial-body.step',
                    format: 'step'
                }
            },
            {
                designator: 'C1',
                mountSide: 'top',
                positionMil: { x: 20, y: 20, z: 0 },
                projection: {
                    source: 'pad-fallback',
                    boundsMil: { width: 10, depth: 10, height: 5 }
                },
                externalModel: {
                    origin: 'embedded',
                    name: 'stitched-chip.step',
                    format: 'step'
                }
            }
        ]),
        {
            loadRuntimeModules: async () => createFakeRuntimeModules()
        }
    )

    try {
        await runtime.whenReady()
        await flushAsyncTurns(4)

        const fallbackRoot = resolveFallbackRoot('U1')
        assert.equal(
            fallbackRoot?.userData?.scene3dFallbackExternalCompanion,
            true
        )
        assert.equal(
            loadedSceneDescription?.externalPlacements?.[1]?.positionMil?.z,
            40
        )
    } finally {
        runtime.dispose()
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})

test('PcbScene3dRuntime reports ready before slow external model loading settles', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene
    let resolveExternalModels = null

    globalThis.window = {
        devicePixelRatio: 1,
        requestAnimationFrame(callback) {
            callback()
        },
        addEventListener() {},
        removeEventListener() {}
    }
    globalThis.document = {}
    lastCreatedScene = null
    PcbScene3dExternalModels.loadIntoScene = async () => {
        await new Promise((resolve) => {
            resolveExternalModels = resolve
        })
        return []
    }

    const runtime = new PcbScene3dRuntime(
        new FakeViewportNode(),
        createSceneDescription([{}]),
        {
            loadRuntimeModules: async () => createFakeRuntimeModules()
        }
    )

    let readyResolved = false
    const readyPromise = runtime.whenReady().then(() => {
        readyResolved = true
    })

    await flushAsyncTurns(8)

    assert.ok(lastCreatedScene)
    assert.equal(resolveFallbackBodiesGroup()?.visible, false)
    assert.equal(readyResolved, true)

    resolveExternalModels?.()
    await readyPromise

    assert.equal(readyResolved, true)

    runtime.dispose()
    PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
    globalThis.window = originalWindow
    globalThis.document = originalDocument
})

test('PcbScene3dRuntime applies live transform adjustments to fallback body targets', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene

    globalThis.window = {
        devicePixelRatio: 1,
        requestAnimationFrame(callback) {
            callback()
        },
        addEventListener() {},
        removeEventListener() {}
    }
    globalThis.document = {}
    lastCreatedScene = null
    PcbScene3dExternalModels.loadIntoScene = async () => []

    const runtime = new PcbScene3dRuntime(
        new FakeViewportNode(),
        createSceneDescription(),
        {
            loadRuntimeModules: async () => createFakeRuntimeModules()
        }
    )

    try {
        await runtime.whenReady()
        runtime.setComponentAdjustment('U1', {
            scale: { x: 1.25, y: 0.75, z: 2 },
            rotationDeg: { x: 10, y: 20, z: 30 },
            offsetMil: { x: 11, y: 22, z: 33 }
        })

        const target = findAdjustmentTarget()
        assert.ok(target)
        assert.equal(target.position.x, 11)
        assert.equal(target.position.y, 22)
        assert.equal(target.position.z, 33)
        assert.equal(target.scale.x, 1.25)
        assert.equal(target.scale.y, 0.75)
        assert.equal(target.scale.z, 2)
        assert.equal(target.rotation.x, (-10 * Math.PI) / 180)
        assert.equal(target.rotation.y, (-20 * Math.PI) / 180)
        assert.equal(target.rotation.z, (-30 * Math.PI) / 180)
    } finally {
        runtime.dispose()
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})

test('PcbScene3dRuntime shows selected co-located body on alternate selection', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene

    globalThis.window = {
        devicePixelRatio: 1,
        requestAnimationFrame(callback) {
            callback()
        },
        addEventListener() {},
        removeEventListener() {}
    }
    globalThis.document = {}
    lastCreatedScene = null
    PcbScene3dExternalModels.loadIntoScene = async () => []

    const runtime = new PcbScene3dRuntime(
        new FakeViewportNode(),
        {
            board: {
                widthMil: 1200,
                heightMil: 800,
                centerX: 0,
                centerY: 0,
                thicknessMil: 62,
                segments: []
            },
            components: [
                {
                    componentIndex: 1,
                    designator: 'XO1',
                    renderFallbackBody: false,
                    body: {
                        family: 'chip',
                        sizeMil: { width: 40, depth: 40, height: 10 }
                    },
                    positionMil: { x: 0, y: 0, z: 36 },
                    mountSide: 'top',
                    rotationDeg: 0
                },
                {
                    componentIndex: 2,
                    designator: 'XO2',
                    renderFallbackBody: false,
                    body: {
                        family: 'chip',
                        sizeMil: { width: 40, depth: 40, height: 22 }
                    },
                    positionMil: { x: 0, y: 0, z: 42 },
                    mountSide: 'top',
                    rotationDeg: 0
                }
            ],
            staticBodyPlacements: [
                {
                    designator: 'XO1',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 36 },
                    coLocatedVariantGroupKey: 'stack:xo',
                    geometry: {
                        kind: 'extruded-polygon',
                        heightMil: 10,
                        verticesMil: [
                            { x: -20, y: -20 },
                            { x: 20, y: -20 },
                            { x: 20, y: 20 },
                            { x: -20, y: 20 }
                        ]
                    }
                },
                {
                    designator: 'XO2',
                    mountSide: 'top',
                    rotationDeg: 0,
                    positionMil: { x: 0, y: 0, z: 42 },
                    coLocatedVariantGroupKey: 'stack:xo',
                    geometry: {
                        kind: 'extruded-polygon',
                        heightMil: 22,
                        verticesMil: [
                            { x: -20, y: -20 },
                            { x: 20, y: -20 },
                            { x: 20, y: 20 },
                            { x: -20, y: 20 }
                        ]
                    }
                }
            ],
            detail: {
                silkscreen: {},
                tracks: [],
                arcs: [],
                pads: [
                    {
                        componentIndex: 2,
                        x: 0,
                        y: 0,
                        sizeTopX: 30,
                        sizeTopY: 30
                    }
                ],
                vias: []
            },
            externalPlacements: []
        },
        {
            loadRuntimeModules: async () => createFakeRuntimeModules()
        }
    )

    try {
        await runtime.whenReady()

        const firstVariantRoot = findSelectionRoot('XO1')
        const secondVariantRoot = findSelectionRoot('XO2')
        assert.equal(firstVariantRoot?.visible, true)
        assert.equal(secondVariantRoot?.visible, true)

        runtime.setSelectedDesignator('XO2')

        assert.equal(firstVariantRoot?.visible, false)
        assert.equal(secondVariantRoot?.visible, true)
        assert.ok(findSelectionMarker('XO2'))
    } finally {
        runtime.dispose()
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})
