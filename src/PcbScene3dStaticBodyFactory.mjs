import { PcbScene3dComponentAdjustment } from './PcbScene3dComponentAdjustment.mjs'
import { PcbScene3dMountRig } from './PcbScene3dMountRig.mjs'

/**
 * Builds authored static component-body render roots.
 */
export class PcbScene3dStaticBodyFactory {
    static #DEFAULT_COLOR = 0x808080

    /**
     * Builds all renderable static body roots.
     * @param {any} THREE Three.js namespace.
     * @param {object[]} placements Static body placements.
     * @returns {{ rootGroup: any, adjustmentGroup: any, placement: object }[]}
     */
    static buildMany(THREE, placements) {
        return (Array.isArray(placements) ? placements : [])
            .map((placement) =>
                PcbScene3dStaticBodyFactory.build(THREE, placement)
            )
            .filter(Boolean)
    }

    /**
     * Builds one authored static body root.
     * @param {any} THREE Three.js namespace.
     * @param {{ designator?: string, mountSide?: string, rotationDeg?: number, positionMil?: { x?: number, y?: number, z?: number }, geometry?: object, bodyColor?: object, bodyOpacity?: number }} placement Static body placement.
     * @returns {{ rootGroup: any, adjustmentGroup: any, placement: object } | null}
     */
    static build(THREE, placement) {
        const geometry = PcbScene3dStaticBodyFactory.#buildGeometry(
            THREE,
            placement?.geometry
        )
        if (!geometry) {
            return null
        }

        const material = new THREE.MeshStandardMaterial({
            color: PcbScene3dStaticBodyFactory.#resolveColor(placement),
            roughness: 0.7,
            metalness: 0.08,
            transparent:
                PcbScene3dStaticBodyFactory.#resolveOpacity(placement) < 1,
            opacity: PcbScene3dStaticBodyFactory.#resolveOpacity(placement)
        })
        const mesh = new THREE.Mesh(geometry, material)
        const mountRig = PcbScene3dMountRig.create(THREE, placement)
        const adjustmentGroup =
            PcbScene3dStaticBodyFactory.#buildAdjustmentGroup(THREE, placement)

        mountRig.rootGroup.userData.scene3dSelection = {
            designator: String(placement?.designator || 'static-body'),
            sourceType: 'static-body'
        }
        PcbScene3dStaticBodyFactory.#applyVariantMetadata(
            mountRig.rootGroup,
            placement
        )
        adjustmentGroup.add(mesh)
        mountRig.faceGroup.add(adjustmentGroup)

        return {
            rootGroup: mountRig.rootGroup,
            adjustmentGroup,
            placement
        }
    }

    /**
     * Builds the geometry for one supported static body.
     * @param {any} THREE Three.js namespace.
     * @param {{ kind?: string, verticesMil?: { x?: number, y?: number }[], heightMil?: number, radiusMil?: number }} geometry Static body geometry.
     * @returns {any | null}
     */
    static #buildGeometry(THREE, geometry) {
        const kind = String(geometry?.kind || '').toLowerCase()
        if (kind === 'extruded-polygon') {
            return PcbScene3dStaticBodyFactory.#buildExtrudedPolygon(
                THREE,
                geometry
            )
        }
        if (kind === 'cylinder') {
            return PcbScene3dStaticBodyFactory.#buildCylinder(THREE, geometry)
        }
        if (kind === 'cone') {
            return PcbScene3dStaticBodyFactory.#buildCone(THREE, geometry)
        }
        if (kind === 'sphere') {
            return PcbScene3dStaticBodyFactory.#buildSphere(THREE, geometry)
        }

        return null
    }

    /**
     * Builds an extruded polygon geometry centered on its authored Z midpoint.
     * @param {any} THREE Three.js namespace.
     * @param {{ verticesMil?: { x?: number, y?: number }[], heightMil?: number }} geometry Static body geometry.
     * @returns {any | null}
     */
    static #buildExtrudedPolygon(THREE, geometry) {
        const vertices = Array.isArray(geometry?.verticesMil)
            ? geometry.verticesMil
            : []
        const heightMil = Number(geometry?.heightMil || 0)
        if (vertices.length < 3 || !(heightMil > 0)) {
            return null
        }

        const shape = new THREE.Shape()
        shape.moveTo(Number(vertices[0].x || 0), Number(vertices[0].y || 0))
        vertices.slice(1).forEach((vertex) => {
            shape.lineTo(Number(vertex.x || 0), Number(vertex.y || 0))
        })
        shape.closePath()

        const extrudedGeometry = new THREE.ExtrudeGeometry(shape, {
            depth: heightMil,
            bevelEnabled: false
        })
        extrudedGeometry.translate?.(0, 0, -heightMil / 2)
        return extrudedGeometry
    }

    /**
     * Builds a cylinder body geometry.
     * @param {any} THREE Three.js namespace.
     * @param {{ radiusMil?: number, heightMil?: number }} geometry Static body geometry.
     * @returns {any | null}
     */
    static #buildCylinder(THREE, geometry) {
        const radiusMil = Number(geometry?.radiusMil || 0)
        const heightMil = Number(geometry?.heightMil || 0)
        if (!(radiusMil > 0) || !(heightMil > 0)) {
            return null
        }

        return new THREE.CylinderGeometry(radiusMil, radiusMil, heightMil, 32)
    }

    /**
     * Builds a cone body geometry.
     * @param {any} THREE Three.js namespace.
     * @param {{ radiusMil?: number, heightMil?: number }} geometry Static body geometry.
     * @returns {any | null}
     */
    static #buildCone(THREE, geometry) {
        const radiusMil = Number(geometry?.radiusMil || 0)
        const heightMil = Number(geometry?.heightMil || 0)
        if (!(radiusMil > 0) || !(heightMil > 0)) {
            return null
        }

        if (typeof THREE.ConeGeometry === 'function') {
            return new THREE.ConeGeometry(radiusMil, heightMil, 32)
        }

        return new THREE.CylinderGeometry(0, radiusMil, heightMil, 32)
    }

    /**
     * Builds a sphere body geometry.
     * @param {any} THREE Three.js namespace.
     * @param {{ radiusMil?: number }} geometry Static body geometry.
     * @returns {any | null}
     */
    static #buildSphere(THREE, geometry) {
        const radiusMil = Number(geometry?.radiusMil || 0)
        if (!(radiusMil > 0) || typeof THREE.SphereGeometry !== 'function') {
            return null
        }

        return new THREE.SphereGeometry(radiusMil, 32, 16)
    }

    /**
     * Builds the transform node used by live component adjustments.
     * @param {any} THREE Three.js namespace.
     * @param {{ designator?: string }} placement Static body placement.
     * @returns {any}
     */
    static #buildAdjustmentGroup(THREE, placement) {
        const adjustmentGroup = new THREE.Group()
        adjustmentGroup.userData.scene3dAdjustmentTarget = true
        adjustmentGroup.userData.scene3dAdjustmentDesignator = String(
            placement?.designator || 'static-body'
        )
        adjustmentGroup.userData.scene3dAdjustmentBaseline =
            PcbScene3dComponentAdjustment.neutral()
        return adjustmentGroup
    }

    /**
     * Copies authored variant grouping metadata onto the selectable root.
     * @param {any} rootGroup Static body root group.
     * @param {{ coLocatedVariantGroupKey?: string }} placement Static body placement.
     * @returns {void}
     */
    static #applyVariantMetadata(rootGroup, placement) {
        const groupKey = String(
            placement?.coLocatedVariantGroupKey || ''
        ).trim()
        if (groupKey) {
            rootGroup.userData.scene3dVariantGroupKey = groupKey
        }
    }

    /**
     * Resolves static body display color.
     * @param {{ bodyColor?: object, geometry?: object }} placement Static body placement.
     * @returns {number}
     */
    static #resolveColor(placement) {
        const rawColor = Number(
            placement?.bodyColor?.raw ??
                placement?.geometry?.bodyColor?.raw ??
                placement?.geometry?.color
        )
        return Number.isInteger(rawColor)
            ? rawColor
            : PcbScene3dStaticBodyFactory.#DEFAULT_COLOR
    }

    /**
     * Resolves static body opacity.
     * @param {{ bodyOpacity?: number, geometry?: object }} placement Static body placement.
     * @returns {number}
     */
    static #resolveOpacity(placement) {
        const opacity = Number(
            placement?.bodyOpacity ?? placement?.geometry?.bodyOpacity
        )
        if (!Number.isFinite(opacity)) {
            return 1
        }

        return Math.min(1, Math.max(0, opacity))
    }
}
