import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dDrillVoidFactory } from '../src/PcbScene3dDrillVoidFactory.mjs'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'
import { PcbScene3dRuntime } from '../src/PcbScene3dRuntime.mjs'

/**
 * Minimal mutable vector used by the fake Three graph.
 */
class FakeVector3 {
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
 * Minimal event target used by fake DOM and controls objects.
 */
class FakeEventTarget {
    /**
     * @returns {void}
     */
    addEventListener() {}

    /**
     * @returns {void}
     */
    removeEventListener() {}
}

/**
 * Minimal fake Three group implementation.
 */
class FakeGroup {
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
 * Minimal fake shape implementation.
 */
class FakeShape {
    constructor() {
        this.points = []
        this.holes = []
    }

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

    /**
     * @returns {{ x: number, y: number }[]}
     */
    getPoints() {
        return [...this.points]
    }
}

/**
 * Minimal fake geometry implementation.
 */
class FakeGeometry {
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
 * Minimal fake buffer geometry implementation.
 */
class FakeBufferGeometry extends FakeGeometry {
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
}

/**
 * Minimal fake mesh implementation.
 */
class FakeMesh {
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
 * Minimal fake runtime modules used by the renderer.
 * @returns {{ THREE: any, OrbitControls: any }}
 */
function createRuntimeModules() {
    return {
        THREE: {
            WebGLRenderer: class FakeWebGLRenderer {
                constructor() {
                    this.domElement = new FakeEventTarget()
                    this.domElement.className = ''
                    this.domElement.style = {}
                }

                /** @returns {void} */
                setPixelRatio() {}

                /** @returns {void} */
                setSize() {}

                /** @returns {void} */
                render() {}

                /** @returns {void} */
                dispose() {}
            },
            Scene: class FakeScene extends FakeGroup {},
            PerspectiveCamera: class FakePerspectiveCamera {
                constructor(_fov, aspect) {
                    this.aspect = aspect
                    this.position = new FakeVector3()
                    this.up = new FakeVector3(0, 0, 1)
                }

                /** @returns {void} */
                lookAt() {}

                /** @returns {void} */
                updateProjectionMatrix() {}
            },
            Group: FakeGroup,
            AmbientLight: FakeGroup,
            DirectionalLight: class FakeDirectionalLight extends FakeGroup {},
            Fog: class FakeFog {},
            Mesh: FakeMesh,
            LineLoop: FakeMesh,
            MeshStandardMaterial: class FakeMaterial {
                constructor(options) {
                    this.options = options
                }
            },
            LineBasicMaterial: class FakeLineMaterial {
                constructor(options) {
                    this.options = options
                }
            },
            BoxGeometry: class FakeBoxGeometry extends FakeGeometry {
                constructor(...args) {
                    super('BoxGeometry', { args })
                }
            },
            ExtrudeGeometry: class FakeExtrudeGeometry extends FakeGeometry {
                constructor(shape, options) {
                    super('ExtrudeGeometry', { shape, options })
                }
            },
            BufferGeometry: FakeBufferGeometry,
            Float32BufferAttribute: class FakeFloat32BufferAttribute {
                constructor(array, itemSize) {
                    this.array = array
                    this.itemSize = itemSize
                }
            },
            Shape: FakeShape,
            Raycaster: class FakeRaycaster {
                /** @returns {void} */
                setFromCamera() {}

                /** @returns {any[]} */
                intersectObjects() {
                    return []
                }
            },
            Vector2: class FakeVector2 {
                x = 0
                y = 0
            },
            DoubleSide: 'DoubleSide',
            FrontSide: 'FrontSide',
            MOUSE: { ROTATE: 'rotate', DOLLY: 'dolly', PAN: 'pan' }
        },
        OrbitControls: class FakeOrbitControls extends FakeEventTarget {
            constructor() {
                super()
                this.target = new FakeVector3()
            }

            /** @returns {void} */
            update() {}

            /** @returns {void} */
            dispose() {}
        }
    }
}

test('PcbScene3dRuntime enables drill voids for generated Gerber boards', async () => {
    const originalWindow = globalThis.window
    const originalDocument = globalThis.document
    const originalLoadIntoScene = PcbScene3dExternalModels.loadIntoScene
    const originalBuildDrillVoids = PcbScene3dDrillVoidFactory.buildGroup
    let capturedOptions = null

    globalThis.window = {
        devicePixelRatio: 1,
        requestAnimationFrame(callback) {
            callback()
        },
        addEventListener() {},
        removeEventListener() {}
    }
    globalThis.document = {}
    PcbScene3dExternalModels.loadIntoScene = async () => []
    PcbScene3dDrillVoidFactory.buildGroup = (
        _three,
        _detail,
        _topZ,
        _bottomZ,
        _normalizePoint,
        options = {}
    ) => {
        capturedOptions = options
        const group = new FakeGroup()
        group.add(new FakeGroup())
        return group
    }

    const runtime = new PcbScene3dRuntime(
        {
            /**
             * @returns {{ width: number, height: number }}
             */
            getBoundingClientRect() {
                return { width: 960, height: 560 }
            },

            /**
             * @returns {void}
             */
            replaceChildren() {}
        },
        {
            board: {
                widthMil: 1200,
                heightMil: 800,
                centerX: 0,
                centerY: 0,
                thicknessMil: 62,
                segments: []
            },
            components: [],
            sourceFormat: 'gerber',
            detail: {
                silkscreen: {},
                tracks: [],
                arcs: [],
                pads: [],
                vias: []
            },
            externalPlacements: [],
            boardAssemblyModel: null
        },
        {
            loadRuntimeModules: async () => createRuntimeModules()
        }
    )

    try {
        await runtime.whenReady()

        assert.equal(capturedOptions?.enabled, true)
    } finally {
        runtime.dispose()
        PcbScene3dDrillVoidFactory.buildGroup = originalBuildDrillVoids
        PcbScene3dExternalModels.loadIntoScene = originalLoadIntoScene
        globalThis.window = originalWindow
        globalThis.document = originalDocument
    }
})
