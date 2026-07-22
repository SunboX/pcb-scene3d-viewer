import { PcbScene3dDrillPathFactory } from './PcbScene3dDrillPathFactory.mjs'
import { PcbScene3dViaLayerSpan } from './PcbScene3dViaLayerSpan.mjs'

/**
 * Builds annular via barrels for the interactive 3D PCB scene.
 */
export class PcbScene3dViaFactory {
    static #PAD_BARREL_OUTER_RADIUS_SCALE = 0.98
    static #PAD_BARREL_MIN_WALL_MIL = 1.2
    static #PAD_BARREL_WALL_FRACTION = 0.09
    static #SURFACE_COPPER_DEPTH_MIL = 2
    static #SURFACE_MASK_Z_OFFSET_MIL = 1.3

    /**
     * Builds the via mesh group for one scene.
     * @param {any} THREE
     * @param {{ diameter?: number, holeDiameter?: number, x?: number, y?: number, barrelOnly?: boolean, layers?: unknown[], fromLayer?: unknown, toLayer?: unknown, from_layer?: unknown, to_layer?: unknown }[]} vias
     * @param {number} thicknessMil
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {{ material?: any, surfaceMaterial?: any }} [options]
     * @returns {any}
     */
    static buildGroup(
        THREE,
        vias,
        thicknessMil,
        normalizeBoardPoint,
        options = {}
    ) {
        const group = new THREE.Group()
        const copperMaterial = PcbScene3dViaFactory.#resolveMaterial(
            THREE,
            options
        )
        const geometryCache = new Map()
        const surfaceGeometryCache = new Map()

        ;(vias || []).forEach((via) => {
            const renderMode = PcbScene3dViaLayerSpan.renderMode(via)
            if (!renderMode) return

            const point = normalizeBoardPoint(
                Number(via?.x || 0),
                Number(via?.y || 0)
            )
            const copperSpans = PcbScene3dViaFactory.#resolveCopperSpans(
                via,
                renderMode,
                thicknessMil,
                Boolean(options?.surfaceMaterial)
            )
            for (const copperSpan of copperSpans) {
                const geometry = PcbScene3dViaFactory.#resolveGeometry(
                    THREE,
                    geometryCache,
                    via,
                    copperSpan.depth
                )
                const mesh = new THREE.Mesh(geometry, copperMaterial)
                mesh.position.set(point.x, point.y, copperSpan.centerZ)
                if (geometry.type === 'CylinderGeometry') {
                    mesh.rotation.x = Math.PI / 2
                }
                group.add(mesh)
            }
            PcbScene3dViaFactory.#appendMaskSurfaceMeshes(
                THREE,
                group,
                surfaceGeometryCache,
                via,
                renderMode,
                thicknessMil,
                point,
                options?.surfaceMaterial
            )
        })

        return group
    }

    /**
     * Resolves visible copper spans without carrying an open-side barrel
     * through a solder-mask-covered board face.
     * @param {object} via Via primitive.
     * @param {'through' | 'top' | 'bottom'} renderMode Via geometry mode.
     * @param {number} thicknessMil Board thickness in mil.
     * @param {boolean} hasSurfaceMask Whether mask surface geometry is rendered.
     * @returns {{ depth: number, centerZ: number }[]}
     */
    static #resolveCopperSpans(via, renderMode, thicknessMil, hasSurfaceMask) {
        const fullSpan = {
            depth: PcbScene3dViaFactory.#geometryDepth(
                renderMode,
                thicknessMil
            ),
            centerZ: PcbScene3dViaFactory.#centerZ(renderMode, thicknessMil)
        }
        if (!hasSurfaceMask) {
            return [fullSpan]
        }

        if (renderMode === 'top') {
            return PcbScene3dViaFactory.#isSideTented(via, 'top')
                ? []
                : [fullSpan]
        }
        if (renderMode === 'bottom') {
            return PcbScene3dViaFactory.#isSideTented(via, 'bottom')
                ? []
                : [fullSpan]
        }

        const isTopTented = PcbScene3dViaFactory.#isSideTented(via, 'top')
        const isBottomTented = PcbScene3dViaFactory.#isSideTented(via, 'bottom')
        if (isTopTented && isBottomTented) {
            return []
        }
        if (!isTopTented && !isBottomTented) {
            return [fullSpan]
        }

        const halfDepth = fullSpan.depth / 2
        const centerDistance = halfDepth / 2
        return [
            {
                depth: halfDepth,
                centerZ: isTopTented ? -centerDistance : centerDistance
            }
        ]
    }

    /**
     * Resolves the via material.
     * @param {any} THREE
     * @param {{ material?: any }} options
     * @returns {any}
     */
    static #resolveMaterial(THREE, options) {
        return (
            options?.material ||
            new THREE.MeshStandardMaterial({
                color: 0xcaa24e,
                roughness: 0.48,
                metalness: 0.42,
                side: THREE.DoubleSide
            })
        )
    }

    /**
     * Adds side-specific solder-mask rings above the copper via surface.
     * @param {any} THREE Three.js namespace.
     * @param {any} group Output group.
     * @param {Map<string, any>} geometryCache Surface geometry cache.
     * @param {object} via Via primitive.
     * @param {'through' | 'top' | 'bottom'} renderMode Via geometry mode.
     * @param {number} thicknessMil Board thickness in mil.
     * @param {{ x: number, y: number }} point Normalized board point.
     * @param {any | undefined} material Solder-mask material.
     * @returns {void}
     */
    static #appendMaskSurfaceMeshes(
        THREE,
        group,
        geometryCache,
        via,
        renderMode,
        thicknessMil,
        point,
        material
    ) {
        if (!material) {
            return
        }

        const geometry = PcbScene3dViaFactory.#resolveSurfaceGeometry(
            THREE,
            geometryCache,
            via
        )
        if (!geometry) {
            return
        }

        for (const side of ['top', 'bottom']) {
            if (
                !PcbScene3dViaFactory.#renderModeTouchesSide(
                    renderMode,
                    side
                ) ||
                !PcbScene3dViaFactory.#isSideTented(via, side)
            ) {
                continue
            }

            const mesh = new THREE.Mesh(geometry, material)
            mesh.position.set(
                point.x,
                point.y,
                PcbScene3dViaFactory.#surfaceZ(side, thicknessMil)
            )
            group.add(mesh)
        }
    }

    /**
     * Resolves one reusable annular surface geometry.
     * @param {any} THREE Three.js namespace.
     * @param {Map<string, any>} geometryCache Surface geometry cache.
     * @param {object} via Via primitive.
     * @returns {any | null}
     */
    static #resolveSurfaceGeometry(THREE, geometryCache, via) {
        const diameter = Number(via?.diameter || 0)
        const holeDiameter = Number(via?.holeDiameter || 0)
        if (diameter <= 0 || holeDiameter < 0 || diameter <= holeDiameter) {
            return null
        }

        const key = `${diameter.toFixed(4)}:${holeDiameter.toFixed(4)}`
        const cached = geometryCache.get(key)
        if (cached) {
            return cached
        }

        const shape = PcbScene3dViaFactory.#buildCircleShape(
            THREE,
            diameter / 2
        )
        if (holeDiameter > 0) {
            shape.holes.push(
                PcbScene3dViaFactory.#buildCirclePath(THREE, holeDiameter / 2)
            )
        }
        const geometry = new THREE.ShapeGeometry(shape, 24)
        geometryCache.set(key, geometry)
        return geometry
    }

    /**
     * Checks whether one rendered via span reaches a board side.
     * @param {'through' | 'top' | 'bottom'} renderMode Via geometry mode.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {boolean}
     */
    static #renderModeTouchesSide(renderMode, side) {
        return renderMode === 'through' || renderMode === side
    }

    /**
     * Checks whether one via surface is tented on a board side.
     * @param {object} via Via primitive.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {boolean}
     */
    static #isSideTented(via, side) {
        const fieldName = side === 'bottom' ? 'isTentingBottom' : 'isTentingTop'
        return via?.[fieldName] !== false
    }

    /**
     * Resolves the solder-mask surface Z above the exposed copper stack.
     * @param {'top' | 'bottom'} side Board side.
     * @param {number} thicknessMil Board thickness in mil.
     * @returns {number}
     */
    static #surfaceZ(side, thicknessMil) {
        const distance =
            Math.max(Number(thicknessMil) || 0, 0) / 2 +
            PcbScene3dViaFactory.#SURFACE_MASK_Z_OFFSET_MIL
        return side === 'bottom' ? -distance : distance
    }

    /**
     * Resolves one reusable via geometry from the via drill spec.
     * @param {any} THREE
     * @param {Map<string, any>} geometryCache
     * @param {{ diameter?: number, holeDiameter?: number, barrelOnly?: boolean }} via
     * @param {number} depth Copper span depth in mil.
     * @returns {any}
     */
    static #resolveGeometry(THREE, geometryCache, via, depth) {
        const outerRadius = Math.max(Number(via?.diameter || 0) / 2, 1.2)
        const holeDiameter = Math.max(Number(via?.holeDiameter || 0), 0)
        const isBarrelOnly = Boolean(via?.barrelOnly)
        const cacheKey = [
            isBarrelOnly ? 'barrel' : 'annulus',
            outerRadius.toFixed(4),
            holeDiameter.toFixed(4),
            depth.toFixed(4)
        ].join(':')
        const cached = geometryCache.get(cacheKey)
        if (cached) {
            return cached
        }

        let geometry
        if (isBarrelOnly && holeDiameter > 0) {
            geometry = PcbScene3dViaFactory.#buildPadBarrelGeometry(
                THREE,
                holeDiameter,
                depth
            )
        } else if (holeDiameter > 0 && holeDiameter < outerRadius * 2 - 0.001) {
            const shape = new THREE.Shape()
            shape.moveTo(outerRadius, 0)
            shape.absarc(0, 0, outerRadius, 0, Math.PI, false)
            shape.absarc(0, 0, outerRadius, Math.PI, Math.PI * 2, false)
            const drillHole = PcbScene3dDrillPathFactory.buildViaHolePath(
                THREE,
                via
            )
            if (drillHole) {
                shape.holes.push(drillHole)
            }
            geometry = new THREE.ExtrudeGeometry(shape, {
                depth,
                bevelEnabled: false,
                curveSegments: 24,
                steps: 1
            })
            geometry.translate?.(0, 0, -depth / 2)
        } else {
            geometry = new THREE.CylinderGeometry(
                outerRadius,
                outerRadius,
                depth,
                18
            )
        }

        geometryCache.set(cacheKey, geometry)
        return geometry
    }

    /**
     * Resolves copper geometry depth without extending blind vias through-board.
     * @param {'through' | 'top' | 'bottom'} renderMode Via geometry mode.
     * @param {number} thicknessMil Board thickness in mil.
     * @returns {number}
     */
    static #geometryDepth(renderMode, thicknessMil) {
        if (renderMode !== 'through') {
            return PcbScene3dViaFactory.#SURFACE_COPPER_DEPTH_MIL
        }
        return Math.max(Number(thicknessMil) || 0, 0) + 2
    }

    /**
     * Resolves the world-space Z center for one via geometry mode.
     * @param {'through' | 'top' | 'bottom'} renderMode Via geometry mode.
     * @param {number} thicknessMil Board thickness in mil.
     * @returns {number}
     */
    static #centerZ(renderMode, thicknessMil) {
        const halfThickness = Math.max(Number(thicknessMil) || 0, 0) / 2
        if (renderMode === 'top') return halfThickness
        if (renderMode === 'bottom') return -halfThickness
        return 0
    }

    /**
     * Builds a visible copper sleeve for through-hole pads.
     * @param {any} THREE
     * @param {number} holeDiameter
     * @param {number} depth
     * @returns {any}
     */
    static #buildPadBarrelGeometry(THREE, holeDiameter, depth) {
        const holeRadius = Math.max(Number(holeDiameter || 0) / 2, 0.8)
        const outerRadius = Math.max(
            holeRadius * PcbScene3dViaFactory.#PAD_BARREL_OUTER_RADIUS_SCALE,
            0.8
        )
        const wallThickness = Math.max(
            Number(holeDiameter || 0) *
                PcbScene3dViaFactory.#PAD_BARREL_WALL_FRACTION,
            PcbScene3dViaFactory.#PAD_BARREL_MIN_WALL_MIL
        )
        const innerRadius = Math.max(outerRadius - wallThickness, 0.6)
        const shape = PcbScene3dViaFactory.#buildCircleShape(THREE, outerRadius)
        shape.holes.push(
            PcbScene3dViaFactory.#buildCirclePath(THREE, innerRadius)
        )

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: false,
            curveSegments: 24,
            steps: 1
        })
        geometry.translate?.(0, 0, -depth / 2)
        return geometry
    }

    /**
     * Builds one filled circular shape centered on the origin.
     * @param {any} THREE
     * @param {number} radius
     * @returns {any}
     */
    static #buildCircleShape(THREE, radius) {
        const shape = new THREE.Shape()
        shape.moveTo(radius, 0)
        shape.absarc(0, 0, radius, 0, Math.PI, false)
        shape.absarc(0, 0, radius, Math.PI, Math.PI * 2, false)
        return shape
    }

    /**
     * Builds one circular hole path centered on the origin.
     * @param {any} THREE
     * @param {number} radius
     * @returns {any}
     */
    static #buildCirclePath(THREE, radius) {
        const path = new THREE.Path()
        path.moveTo(radius, 0)
        path.absarc(0, 0, radius, 0, Math.PI, false)
        path.absarc(0, 0, radius, Math.PI, Math.PI * 2, false)
        path.closePath()
        return path
    }
}
