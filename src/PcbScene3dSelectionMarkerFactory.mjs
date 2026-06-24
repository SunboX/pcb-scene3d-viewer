/**
 * Builds flat board-surface markers for the currently selected component.
 */
export class PcbScene3dSelectionMarkerFactory {
    static #MARKER_PADDING_MIL = 8
    static #MARKER_Z_OFFSET_MIL = 8
    static #MIN_MARKER_SPAN_MIL = 24

    /**
     * Builds one selected-component outline marker.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Normalized scene description.
     * @param {string} designator Selected component designator.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint Board/detail coordinate normalizer.
     * @param {{ color?: number }} [options] Marker options.
     * @returns {any | null}
     */
    static build(
        THREE,
        sceneDescription,
        designator,
        normalizePoint,
        options = {}
    ) {
        if (!THREE || typeof normalizePoint !== 'function') {
            return null
        }

        const component =
            PcbScene3dSelectionMarkerFactory.#componentByDesignator(
                sceneDescription,
                designator
            )
        if (!component) {
            return null
        }

        const bounds =
            PcbScene3dSelectionMarkerFactory.#boundsFromPads(
                PcbScene3dSelectionMarkerFactory.#componentPads(
                    sceneDescription,
                    component
                )
            ) ||
            PcbScene3dSelectionMarkerFactory.#boundsFromComponentBody(
                component,
                sceneDescription?.board
            )
        const paddedBounds =
            PcbScene3dSelectionMarkerFactory.#expandBounds(bounds)
        if (!paddedBounds) {
            return null
        }

        const z = PcbScene3dSelectionMarkerFactory.#markerZ(
            sceneDescription?.board,
            component
        )
        const points = PcbScene3dSelectionMarkerFactory.#markerPoints(
            paddedBounds,
            z,
            normalizePoint
        )
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(points.flat(), 3)
        )
        const material = new THREE.LineBasicMaterial({
            color: Number(options?.color || 0x14c5e6),
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false
        })
        const line = new THREE.LineLoop(geometry, material)
        line.renderOrder = 1000

        const root = new THREE.Group()
        root.userData.scene3dSelectionMarker = {
            designator: String(component.designator || designator)
        }
        root.add(line)
        return root
    }

    /**
     * Finds one component by designator.
     * @param {object} sceneDescription Normalized scene description.
     * @param {string} designator Component designator.
     * @returns {object | null}
     */
    static #componentByDesignator(sceneDescription, designator) {
        const selectedDesignator = String(designator || '').trim()
        if (!selectedDesignator) {
            return null
        }

        return (
            (Array.isArray(sceneDescription?.components)
                ? sceneDescription.components
                : []
            ).find(
                (component) =>
                    String(component?.designator || '').trim() ===
                    selectedDesignator
            ) || null
        )
    }

    /**
     * Resolves pads owned by one scene component.
     * @param {object} sceneDescription Normalized scene description.
     * @param {{ componentIndex?: number | null }} component Scene component.
     * @returns {object[]}
     */
    static #componentPads(sceneDescription, component) {
        const componentIndex = Number(component?.componentIndex)
        if (!Number.isFinite(componentIndex)) {
            return []
        }

        return (
            Array.isArray(sceneDescription?.detail?.pads)
                ? sceneDescription.detail.pads
                : []
        ).filter((pad) => Number(pad?.componentIndex) === componentIndex)
    }

    /**
     * Resolves an axis-aligned board-space bounds box from owned pad surfaces.
     * @param {object[]} pads Pad records.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static #boundsFromPads(pads) {
        const points = []
        ;(pads || []).forEach((pad) => {
            points.push(...PcbScene3dSelectionMarkerFactory.#padCorners(pad))
        })

        return PcbScene3dSelectionMarkerFactory.#boundsFromPoints(points)
    }

    /**
     * Resolves conservative board-space corners for one pad.
     * @param {object} pad Pad record.
     * @returns {{ x: number, y: number }[]}
     */
    static #padCorners(pad) {
        const x = Number(pad?.x)
        const y = Number(pad?.y)
        const width = PcbScene3dSelectionMarkerFactory.#maxPositive([
            pad?.sizeTopX,
            pad?.sizeMidX,
            pad?.sizeBottomX,
            pad?.holeDiameter
        ])
        const height = PcbScene3dSelectionMarkerFactory.#maxPositive([
            pad?.sizeTopY,
            pad?.sizeMidY,
            pad?.sizeBottomY,
            pad?.holeDiameter
        ])
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !(width > 0) ||
            !(height > 0)
        ) {
            return []
        }

        const offsetX = Number(pad?.offsetTopX ?? pad?.offsetBottomX ?? 0) || 0
        const offsetY = Number(pad?.offsetTopY ?? pad?.offsetBottomY ?? 0) || 0
        const angle = (Number(pad?.rotation || 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        return [
            { x: -width / 2 + offsetX, y: -height / 2 + offsetY },
            { x: width / 2 + offsetX, y: -height / 2 + offsetY },
            { x: width / 2 + offsetX, y: height / 2 + offsetY },
            { x: -width / 2 + offsetX, y: height / 2 + offsetY }
        ].map((corner) => ({
            x: x + corner.x * cos - corner.y * sin,
            y: y + corner.x * sin + corner.y * cos
        }))
    }

    /**
     * Resolves an axis-aligned board-space bounds box from component body data.
     * @param {object} component Scene component.
     * @param {object | undefined} board Board metadata.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static #boundsFromComponentBody(component, board) {
        const centerX =
            Number(component?.boardPositionMil?.x) ||
            Number(component?.positionMil?.x || 0) + Number(board?.centerX || 0)
        const centerY =
            Number(component?.boardPositionMil?.y) ||
            Number(component?.positionMil?.y || 0) + Number(board?.centerY || 0)
        const width = Number(component?.body?.sizeMil?.width || 0)
        const depth = Number(component?.body?.sizeMil?.depth || 0)
        if (
            !Number.isFinite(centerX) ||
            !Number.isFinite(centerY) ||
            !(width > 0) ||
            !(depth > 0)
        ) {
            return null
        }

        const angle = (Number(component?.rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return PcbScene3dSelectionMarkerFactory.#boundsFromPoints(
            [
                { x: -width / 2, y: -depth / 2 },
                { x: width / 2, y: -depth / 2 },
                { x: width / 2, y: depth / 2 },
                { x: -width / 2, y: depth / 2 }
            ].map((corner) => ({
                x: centerX + corner.x * cos - corner.y * sin,
                y: centerY + corner.x * sin + corner.y * cos
            }))
        )
    }

    /**
     * Resolves a bounds box from finite points.
     * @param {{ x: number, y: number }[]} points Candidate points.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static #boundsFromPoints(points) {
        const finitePoints = (points || []).filter(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
        )
        if (!finitePoints.length) {
            return null
        }

        const xs = finitePoints.map((point) => point.x)
        const ys = finitePoints.map((point) => point.y)
        return {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys)
        }
    }

    /**
     * Adds marker padding and a minimum clickable/visible span.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number } | null} bounds Bounds.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static #expandBounds(bounds) {
        if (!bounds) {
            return null
        }

        const centerX = (bounds.minX + bounds.maxX) / 2
        const centerY = (bounds.minY + bounds.maxY) / 2
        const width = Math.max(
            bounds.maxX -
                bounds.minX +
                PcbScene3dSelectionMarkerFactory.#MARKER_PADDING_MIL * 2,
            PcbScene3dSelectionMarkerFactory.#MIN_MARKER_SPAN_MIL
        )
        const height = Math.max(
            bounds.maxY -
                bounds.minY +
                PcbScene3dSelectionMarkerFactory.#MARKER_PADDING_MIL * 2,
            PcbScene3dSelectionMarkerFactory.#MIN_MARKER_SPAN_MIL
        )

        return {
            minX: centerX - width / 2,
            minY: centerY - height / 2,
            maxX: centerX + width / 2,
            maxY: centerY + height / 2
        }
    }

    /**
     * Builds normalized marker line points.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds Board-space bounds.
     * @param {number} z Marker z position.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint Coordinate normalizer.
     * @returns {number[][]}
     */
    static #markerPoints(bounds, z, normalizePoint) {
        return [
            [bounds.minX, bounds.minY],
            [bounds.maxX, bounds.minY],
            [bounds.maxX, bounds.maxY],
            [bounds.minX, bounds.maxY]
        ].map(([x, y]) => {
            const point = normalizePoint(x, y)
            return [point.x, point.y, z]
        })
    }

    /**
     * Resolves marker z above the mounted board face.
     * @param {{ thicknessMil?: number } | undefined} board Board metadata.
     * @param {{ mountSide?: string }} component Scene component.
     * @returns {number}
     */
    static #markerZ(board, component) {
        const topZ =
            Number(board?.thicknessMil || 0) / 2 +
            PcbScene3dSelectionMarkerFactory.#MARKER_Z_OFFSET_MIL
        return String(component?.mountSide || 'top').toLowerCase() === 'bottom'
            ? -topZ
            : topZ
    }

    /**
     * Resolves the maximum positive finite value from a candidate list.
     * @param {unknown[]} values Candidate values.
     * @returns {number}
     */
    static #maxPositive(values) {
        return Math.max(
            0,
            ...(values || [])
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value) && value > 0)
        )
    }
}
