import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'
import { PcbScene3dRuntime } from '../src/PcbScene3dRuntime.mjs'

/** @type {FakeWebGLRenderer | null} */
let lastCreatedRenderer = null

/** @type {FakeOrbitControls | null} */
let lastCreatedControls = null

/**
 * Minimal event target used by the runtime harness.
 */
class FakeEventTarget {
    /** @type {Map<string, Set<(event: any) => void>>} */
    #listeners

    constructor() {
        this.#listeners = new Map()
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
     * @param {string} type
     * @param {any} [event]
     * @returns {void}
     */
    dispatchEvent(type, event = {}) {
        for (const listener of this.#listeners.get(type) || []) {
            listener(event)
        }
    }
}

/**
 * Minimal mutable vector used by the fake Three graph.
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
 * Minimal DOM node for fake renderer mounts.
 */
class FakeDomNode extends FakeEventTarget {
    /** @type {string} */
    className

    /** @type {Record<string, string>} */
    style

    /** @type {boolean} */
    removed

    constructor() {
        super()
        this.className = ''
        this.style = {}
        this.removed = false
    }

    /**
     * @returns {{ width: number, height: number, left: number, top: number }}
     */
    getBoundingClientRect() {
        return {
            width: 960,
            height: 560,
            left: 0,
            top: 0
        }
    }

    /**
     * @returns {void}
     */
    remove() {
        this.removed = true
    }
}

/**
 * Minimal fake Three group implementation.
 */
class FakeGroup {
    /** @type {any[]} */
    children

    /** @type {FakeVector3} */
    position

    /** @type {FakeVector3} */
    scale

    /** @type {{ x: number, y: number, z: number }} */
    rotation

    /** @type {Record<string, any>} */
    userData

    /** @type {boolean} */
    visible

    constructor() {
        this.children = []
        this.position = new FakeVector3()
        this.scale = new FakeVector3(1, 1, 1)
        this.rotation = { x: 0, y: 0, z: 0 }
        this.userData = {}
        this.visible = true
    }

    /**
     * @param {...any} children
     * @returns {void}
     */
    add(...children) {
        this.children.push(...children)
    }
}

/**
 * Minimal fake scene implementation.
 */
class FakeScene extends FakeGroup {}

/**
 * Minimal fake shape implementation.
 */
class FakeShape {
    /** @type {Array<{ x: number, y: number }>} */
    #points

    /** @type {any[]} */
    holes

    constructor() {
        this.#points = []
        this.holes = []
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {void}
     */
    moveTo(x, y) {
        this.#points.push({ x, y })
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {void}
     */
    lineTo(x, y) {
        this.#points.push({ x, y })
    }

    /**
     * @returns {void}
     */
    closePath() {}

    /**
     * @returns {{ x: number, y: number }[]}
     */
    getPoints() {
        return [...this.#points]
    }
}

/**
 * Minimal fake geometry implementation.
 */
class FakeGeometry {
    /** @type {string} */
    type

    /** @type {Record<string, any> | undefined} */
    options

    /**
     * @param {string} type
     * @param {Record<string, any>} [options]
     */
    constructor(type, options) {
        this.type = type
        this.options = options
    }

    /**
     * @returns {void}
     */
    translate() {}
}

/**
 * Minimal fake buffer geometry.
 */
class FakeBufferGeometry extends FakeGeometry {
    /** @type {Map<string, any>} */
    attributes

    constructor() {
        super('BufferGeometry')
        this.attributes = new Map()
    }

    /**
     * @param {string} name
     * @param {any} attribute
     * @returns {void}
     */
    setAttribute(name, attribute) {
        this.attributes.set(name, attribute)
    }

    /**
     * @returns {void}
     */
    computeVertexNormals() {}
}

/**
 * Minimal float32 buffer attribute.
 */
class FakeFloat32BufferAttribute {
    /** @type {number[]} */
    array

    /** @type {number} */
    itemSize

    /**
     * @param {number[]} array
     * @param {number} itemSize
     */
    constructor(array, itemSize) {
        this.array = array
        this.itemSize = itemSize
    }
}

/**
 * Minimal material wrapper.
 */
class FakeMaterial {
    /** @type {Record<string, any>} */
    options

    /**
     * @param {Record<string, any>} options
     */
    constructor(options) {
        this.options = options
    }
}

/**
 * Minimal mesh implementation.
 */
class FakeMesh {
    /** @type {any} */
    geometry

    /** @type {any} */
    material

    /** @type {FakeVector3} */
    position

    /** @type {{ x: number, y: number, z: number }} */
    rotation

    /** @type {Record<string, any>} */
    userData

    /**
     * @param {any} geometry
     * @param {any} material
     */
    constructor(geometry, material) {
        this.geometry = geometry
        this.material = material
        this.position = new FakeVector3()
        this.rotation = { x: 0, y: 0, z: 0 }
        this.userData = {}
    }
}

/**
 * Minimal line implementation.
 */
class FakeLineLoop extends FakeMesh {}

/**
 * Minimal fake camera.
 */
class FakePerspectiveCamera {
    /** @type {FakeVector3} */
    position

    /** @type {FakeVector3} */
    up

    /** @type {number} */
    aspect

    /**
     * @param {number} _fov
     * @param {number} aspect
     */
    constructor(_fov, aspect) {
        this.position = new FakeVector3()
        this.up = new FakeVector3(0, 0, 1)
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
 * Minimal fake renderer.
 */
class FakeWebGLRenderer {
    /** @type {FakeDomNode} */
    domElement

    /** @type {number} */
    renderCount

    constructor() {
        this.domElement = new FakeDomNode()
        this.renderCount = 0
        lastCreatedRenderer = this
    }

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
    render() {
        this.renderCount += 1
    }

    /**
     * @returns {void}
     */
    dispose() {}
}

/**
 * Minimal fake raycaster.
 */
class FakeRaycaster {
    /**
     * @returns {void}
     */
    setFromCamera() {}

    /**
     * @returns {any[]}
     */
    intersectObjects() {
        return []
    }
}

/**
 * Minimal fake orbit controls.
 */
class FakeOrbitControls extends FakeEventTarget {
    /** @type {FakeVector3} */
    target

    constructor() {
        super()
        this.target = new FakeVector3()
        lastCreatedControls = this
    }

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
 * Minimal viewport mount for the runtime harness.
 */
class FakeViewportNode {
    /** @type {any[]} */
    children

    constructor() {
        this.children = []
    }

    /**
     * @returns {{ width: number, height: number }}
     */
    getBoundingClientRect() {
        return {
            width: 960,
            height: 560
        }
    }

    /**
     * @param {...any} children
     * @returns {void}
     */
    replaceChildren(...children) {
        this.children = children
    }
}

/**
 * Builds the minimal fake runtime modules needed by render-scheduling tests.
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
                /**
                 * @param {...any} args
                 */
                constructor(...args) {
                    super('BoxGeometry', { args })
                }
            },
            CylinderGeometry: class FakeCylinderGeometry extends FakeGeometry {
                /**
                 * @param {...any} args
                 */
                constructor(...args) {
                    super('CylinderGeometry', { args })
                }
            },
            ExtrudeGeometry: class FakeExtrudeGeometry extends FakeGeometry {
                /**
                 * @param {any} shape
                 * @param {Record<string, any>} options
                 */
                constructor(shape, options) {
                    super('ExtrudeGeometry', { shape, options })
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
            MOUSE: {
                ROTATE: 'rotate',
                DOLLY: 'dolly',
                PAN: 'pan'
            }
        },
        OrbitControls: FakeOrbitControls
    }
}

/**
 * Creates one empty scene description for runtime scheduling tests.
 * @returns {object}
 */
function createSceneDescription() {
    return {
        board: {
            widthMil: 1200,
            heightMil: 800,
            centerX: 0,
            centerY: 0,
            thicknessMil: 62,
            segments: []
        },
        components: [],
        detail: {
            silkscreen: {},
            tracks: [],
            arcs: [],
            pads: [],
            vias: []
        },
        externalPlacements: []
    }
}

test('PcbScene3dRuntime coalesces control change renders per frame', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene
    const queuedFrames = []

    globalThis.window = {
        devicePixelRatio: 1,
        requestAnimationFrame(callback) {
            callback()
            return 1
        },
        cancelAnimationFrame() {},
        addEventListener() {},
        removeEventListener() {}
    }
    globalThis.document = {}
    lastCreatedRenderer = null
    lastCreatedControls = null
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
        await new Promise((resolve) => setTimeout(resolve, 0))
        const renderer = lastCreatedRenderer
        const controls = lastCreatedControls
        const renderCount = renderer?.renderCount || 0

        globalThis.window.requestAnimationFrame = (callback) => {
            queuedFrames.push(callback)
            return queuedFrames.length
        }

        controls?.dispatchEvent('change')
        controls?.dispatchEvent('change')
        controls?.dispatchEvent('change')

        assert.equal(renderer?.renderCount, renderCount)
        assert.equal(queuedFrames.length, 1)

        queuedFrames.shift()?.()

        assert.equal(renderer?.renderCount, renderCount + 1)
    } finally {
        runtime.dispose()
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})

test('PcbScene3dRuntime remaps pointer controls for inspection presets', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene

    globalThis.window = {
        devicePixelRatio: 1,
        requestAnimationFrame(callback) {
            callback()
            return 1
        },
        cancelAnimationFrame() {},
        addEventListener() {},
        removeEventListener() {}
    }
    globalThis.document = {}
    lastCreatedControls = null
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
        runtime.setPreset('top')

        assert.equal(lastCreatedControls?.mouseButtons?.LEFT, 'pan')
        assert.equal(lastCreatedControls?.mouseButtons?.RIGHT, 'rotate')

        runtime.setPreset('isometric')

        assert.equal(lastCreatedControls?.mouseButtons?.LEFT, 'rotate')
        assert.equal(lastCreatedControls?.mouseButtons?.RIGHT, 'pan')
    } finally {
        runtime.dispose()
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})
