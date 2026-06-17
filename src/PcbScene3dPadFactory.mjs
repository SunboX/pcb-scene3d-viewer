import { PcbScene3dDrillPathFactory } from './PcbScene3dDrillPathFactory.mjs'
import { PcbScene3dBoardEdgeCutoutBuilder } from './PcbScene3dBoardEdgeCutoutBuilder.mjs'
import { PcbScene3dCutoutGeometryFilter } from './PcbScene3dCutoutGeometryFilter.mjs'
import { PcbScene3dGeometryFaceRefiner } from './PcbScene3dGeometryFaceRefiner.mjs'
import { PcbScene3dPadSurfaceStack } from './PcbScene3dPadSurfaceStack.mjs'

/**
 * Builds copper pad meshes for the interactive 3D PCB scene.
 */
export class PcbScene3dPadFactory {
    static #PAD_SHAPE_RECTANGULAR = 2
    static #PAD_THICKNESS_MIL = 2.2
    static #DRILL_SAMPLE_POINTS = 72
    static #CUTOUT_MAX_EDGE_LENGTH = 1.5
    static #CUTOUT_FACE_MAX_EDGE_LENGTH = 8

    /**
     * Builds the pad mesh group for one scene.
     * @param {any} THREE
     * @param {any[]} pads
     * @param {number} z
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {{ side?: 'top' | 'bottom', mirrorY?: boolean }} [options]
     * @returns {any}
     */
    static buildGroup(THREE, pads, z, normalizeBoardPoint, options = {}) {
        const group = new THREE.Group()
        const material = new THREE.MeshStandardMaterial({
            color: 0xd9a61d,
            roughness: 0.38,
            metalness: 0.55,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        })
        const geometryCache = new Map()
        const side = PcbScene3dPadFactory.#normalizeSide(options?.side)
        const mirrorY = Boolean(options?.mirrorY)
        const normalizedPads = pads || []
        const boardDrills = PcbScene3dDrillPathFactory.resolveBoardDrillSpecs({
            pads: normalizedPads
        })
        const surfaceStack = []

        ;(normalizedPads || []).forEach((pad) => {
            if (!PcbScene3dPadFactory.#hasVisibleSurface(pad, side)) {
                return
            }

            const spec = PcbScene3dPadFactory.resolvePadSurfaceSpec(pad, side)
            const drillCutouts = PcbScene3dPadFactory.#resolvePadDrillCutouts(
                pad,
                spec,
                boardDrills,
                mirrorY
            )
            const geometry = PcbScene3dPadFactory.#resolveGeometry(
                THREE,
                geometryCache,
                spec,
                drillCutouts
            )
            const point = PcbScene3dPadFactory.#normalizePoint(
                normalizeBoardPoint,
                Number(pad?.x || 0),
                Number(pad?.y || 0),
                mirrorY
            )
            const zOffset = PcbScene3dPadSurfaceStack.resolveLift(
                surfaceStack,
                point,
                pad,
                spec,
                mirrorY
            )
            const root = new THREE.Group()
            const mesh = new THREE.Mesh(geometry, material)
            root.position.set(point.x, point.y, 0)
            root.rotation.z = (Number(pad?.rotation || 0) * Math.PI) / 180
            mesh.position.set(
                spec.offsetX,
                mirrorY ? -spec.offsetY : spec.offsetY,
                z + zOffset
            )
            if (geometry.type === 'CylinderGeometry') {
                mesh.rotation.x = Math.PI / 2
            }
            root.add(mesh)
            group.add(root)
        })

        return group
    }

    /**
     * Resolves the visible copper shape for one pad face.
     * @param {{ sizeTopX?: number, sizeTopY?: number, sizeMidX?: number, sizeMidY?: number, sizeBottomX?: number, sizeBottomY?: number, holeDiameter?: number, holeShape?: number | null, holeSlotLength?: number | null, holeRotation?: number | null, shapeTop?: number, shapeMid?: number, shapeBottom?: number, hasRoundedRect?: boolean, roundedRectShapeTop?: number | null, roundedRectShapeBottom?: number | null, cornerRadiusTop?: number | null, cornerRadiusBottom?: number | null, offsetTopX?: number, offsetTopY?: number, offsetBottomX?: number, offsetBottomY?: number }} pad
     * @param {'top' | 'bottom'} [side]
     * @returns {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', radius: number, cornerRadius: number, offsetX: number, offsetY: number, hasHole: boolean, holeDiameter: number, holeSlotLength: number | null, holeRotation: number }}
     */
    static resolvePadSurfaceSpec(pad, side = 'top') {
        const normalizedSide = PcbScene3dPadFactory.#normalizeSide(side)
        const size = PcbScene3dPadFactory.#resolvePadSurfaceSize(
            pad,
            normalizedSide
        )
        const cornerRadius = PcbScene3dPadFactory.#resolvePadCornerRadius(
            pad,
            size,
            normalizedSide
        )
        const offset = PcbScene3dPadFactory.#resolvePadOffset(
            pad,
            normalizedSide
        )

        return {
            width: size.width,
            height: size.height,
            kind: PcbScene3dPadFactory.#resolvePadKind(
                pad,
                size,
                cornerRadius,
                normalizedSide
            ),
            radius: Math.max(size.width, size.height) / 2,
            cornerRadius,
            offsetX: offset.x,
            offsetY: offset.y,
            hasHole: Number(pad?.holeDiameter || 0) > 0,
            holeDiameter: Math.max(Number(pad?.holeDiameter || 0), 0),
            holeSlotLength:
                Number(pad?.holeSlotLength || 0) >
                Number(pad?.holeDiameter || 0)
                    ? Number(pad?.holeSlotLength || 0)
                    : null,
            holeRotation: Number(pad?.holeRotation || 0)
        }
    }

    /**
     * Resolves the visible copper size for one pad face.
     * @param {{ sizeTopX?: number, sizeTopY?: number, sizeMidX?: number, sizeMidY?: number, sizeBottomX?: number, sizeBottomY?: number, holeDiameter?: number }} pad
     * @param {'top' | 'bottom'} side
     * @returns {{ width: number, height: number }}
     */
    static #resolvePadSurfaceSize(pad, side) {
        const preferredWidth =
            side === 'bottom'
                ? Number(pad?.sizeBottomX || 0)
                : Number(pad?.sizeTopX || 0)
        const preferredHeight =
            side === 'bottom'
                ? Number(pad?.sizeBottomY || 0)
                : Number(pad?.sizeTopY || 0)
        const width =
            Number(
                preferredWidth ||
                    pad?.sizeMidX ||
                    (side === 'bottom' ? pad?.sizeTopX : pad?.sizeBottomX) ||
                    pad?.holeDiameter ||
                    0
            ) || 0
        const height =
            Number(
                preferredHeight ||
                    pad?.sizeMidY ||
                    (side === 'bottom' ? pad?.sizeTopY : pad?.sizeBottomY) ||
                    pad?.holeDiameter ||
                    0
            ) || 0
        const holeDiameter = Number(pad?.holeDiameter || 0)

        return {
            width: Math.max(width, holeDiameter, 1),
            height: Math.max(height, holeDiameter, 1)
        }
    }

    /**
     * Resolves the authored pad kind for one face.
     * @param {{ shapeTop?: number, shapeMid?: number, shapeBottom?: number, hasRoundedRect?: boolean, roundedRectShapeTop?: number | null, roundedRectShapeBottom?: number | null }} pad
     * @param {{ width: number, height: number }} size
     * @param {number} cornerRadius
     * @param {'top' | 'bottom'} side
     * @returns {'circle' | 'rect' | 'rounded-rect'}
     */
    static #resolvePadKind(pad, size, cornerRadius, side) {
        if (PcbScene3dPadFactory.#isCircularPad(pad, size, side)) {
            return 'circle'
        }

        if (cornerRadius > 0.001) {
            return 'rounded-rect'
        }

        return 'rect'
    }

    /**
     * Returns true when one pad should render as a circular copper disc.
     * @param {{ shapeTop?: number, shapeMid?: number, shapeBottom?: number, hasRoundedRect?: boolean, roundedRectShapeTop?: number | null, roundedRectShapeBottom?: number | null }} pad
     * @param {{ width: number, height: number }} size
     * @param {'top' | 'bottom'} side
     * @returns {boolean}
     */
    static #isCircularPad(pad, size, side) {
        if (
            PcbScene3dPadFactory.#resolvePadShape(pad, side) ===
            PcbScene3dPadFactory.#PAD_SHAPE_RECTANGULAR
        ) {
            return false
        }

        return Math.abs(Number(size.width) - Number(size.height)) < 0.001
    }

    /**
     * Resolves the effective pad shape code for one face, including any
     * rounded-rect extension override when present.
     * @param {{ shapeTop?: number, shapeMid?: number, shapeBottom?: number, hasRoundedRect?: boolean, roundedRectShapeTop?: number | null, roundedRectShapeBottom?: number | null }} pad
     * @param {'top' | 'bottom'} side
     * @returns {number}
     */
    static #resolvePadShape(pad, side) {
        if (side === 'bottom') {
            if (
                pad?.hasRoundedRect &&
                Number.isInteger(pad?.roundedRectShapeBottom)
            ) {
                return Number(pad.roundedRectShapeBottom)
            }

            return Number(
                pad?.shapeBottom || pad?.shapeMid || pad?.shapeTop || 0
            )
        }

        if (pad?.hasRoundedRect && Number.isInteger(pad?.roundedRectShapeTop)) {
            return Number(pad.roundedRectShapeTop)
        }

        return Number(pad?.shapeTop || pad?.shapeMid || pad?.shapeBottom || 0)
    }

    /**
     * Resolves the visible corner radius for one pad face.
     * @param {{ shapeTop?: number, shapeMid?: number, shapeBottom?: number, hasRoundedRect?: boolean, roundedRectShapeTop?: number | null, roundedRectShapeBottom?: number | null, cornerRadiusTop?: number | null, cornerRadiusBottom?: number | null }} pad
     * @param {{ width: number, height: number }} size
     * @param {'top' | 'bottom'} side
     * @returns {number}
     */
    static #resolvePadCornerRadius(pad, size, side) {
        const roundedRectCornerRadius =
            PcbScene3dPadFactory.#resolveRoundedRectCornerRadius(
                pad,
                size,
                side
            )
        if (roundedRectCornerRadius > 0) {
            return roundedRectCornerRadius
        }

        if (PcbScene3dPadFactory.#resolvePadShape(pad, side) === 1) {
            return Math.min(size.width, size.height) / 2
        }

        return 0
    }

    /**
     * Resolves one optional explicit rounded-rect corner radius.
     * @param {{ hasRoundedRect?: boolean, cornerRadiusTop?: number | null, cornerRadiusBottom?: number | null }} pad
     * @param {{ width: number, height: number }} size
     * @param {'top' | 'bottom'} side
     * @returns {number}
     */
    static #resolveRoundedRectCornerRadius(pad, size, side) {
        const rawCornerRadius =
            side === 'bottom'
                ? Number(pad?.cornerRadiusBottom)
                : Number(pad?.cornerRadiusTop)
        if (
            pad?.hasRoundedRect &&
            Number.isFinite(rawCornerRadius) &&
            rawCornerRadius > 0
        ) {
            return Math.min(size.width, size.height) * (rawCornerRadius / 100)
        }

        return 0
    }

    /**
     * Resolves the local copper offset for one face.
     * @param {{ offsetTopX?: number, offsetTopY?: number, offsetBottomX?: number, offsetBottomY?: number }} pad
     * @param {'top' | 'bottom'} side
     * @returns {{ x: number, y: number }}
     */
    static #resolvePadOffset(pad, side) {
        if (side === 'bottom') {
            return {
                x: Number(pad?.offsetBottomX ?? pad?.offsetTopX ?? 0),
                y: Number(pad?.offsetBottomY ?? pad?.offsetTopY ?? 0)
            }
        }

        return {
            x: Number(pad?.offsetTopX ?? pad?.offsetBottomX ?? 0),
            y: Number(pad?.offsetTopY ?? pad?.offsetBottomY ?? 0)
        }
    }

    /**
     * Returns true when one pad has visible copper on the requested face.
     * @param {{ sizeTopX?: number, sizeTopY?: number, sizeMidX?: number, sizeMidY?: number, sizeBottomX?: number, sizeBottomY?: number, holeDiameter?: number, hasTopSolderMaskOpening?: boolean, hasBottomSolderMaskOpening?: boolean }} pad
     * @param {'top' | 'bottom'} side
     * @returns {boolean}
     */
    static #hasVisibleSurface(pad, side) {
        const maskOpening = PcbScene3dPadFactory.#resolveSolderMaskOpening(
            pad,
            side
        )
        if (maskOpening === false) {
            return false
        }

        const preferredSideHasSize = PcbScene3dPadFactory.#hasSideSize(
            pad,
            side
        )
        if (preferredSideHasSize) {
            return true
        }

        const alternateSideHasSize = PcbScene3dPadFactory.#hasSideSize(
            pad,
            side === 'bottom' ? 'top' : 'bottom'
        )
        const midHasSize =
            Number(pad?.sizeMidX || 0) > 0 || Number(pad?.sizeMidY || 0) > 0

        return (
            (!alternateSideHasSize && midHasSize) ||
            (!alternateSideHasSize &&
                !midHasSize &&
                Number(pad?.holeDiameter || 0) > 0)
        )
    }

    /**
     * Resolves an explicit side-specific solder-mask opening when available.
     * @param {{ hasTopSolderMaskOpening?: boolean, hasBottomSolderMaskOpening?: boolean }} pad
     * @param {'top' | 'bottom'} side
     * @returns {boolean | null}
     */
    static #resolveSolderMaskOpening(pad, side) {
        const fieldName =
            side === 'bottom'
                ? 'hasBottomSolderMaskOpening'
                : 'hasTopSolderMaskOpening'

        if (typeof pad?.[fieldName] === 'boolean') {
            return pad[fieldName]
        }

        return null
    }

    /**
     * Returns true when one face has an explicit copper size.
     * @param {{ sizeTopX?: number, sizeTopY?: number, sizeBottomX?: number, sizeBottomY?: number }} pad
     * @param {'top' | 'bottom'} side
     * @returns {boolean}
     */
    static #hasSideSize(pad, side) {
        if (side === 'bottom') {
            return (
                Number(pad?.sizeBottomX || 0) > 0 ||
                Number(pad?.sizeBottomY || 0) > 0
            )
        }

        return Number(pad?.sizeTopX || 0) > 0 || Number(pad?.sizeTopY || 0) > 0
    }

    /**
     * Normalizes one face selector to a supported side.
     * @param {string | undefined} side
     * @returns {'top' | 'bottom'}
     */
    static #normalizeSide(side) {
        return String(side || 'top').toLowerCase() === 'bottom'
            ? 'bottom'
            : 'top'
    }

    /**
     * Normalizes one board point and optionally mirrors it for underside
     * copper groups before the parent face flip rotates them below the board.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {number} x
     * @param {number} y
     * @param {boolean} mirrorY
     * @returns {{ x: number, y: number }}
     */
    static #normalizePoint(normalizeBoardPoint, x, y, mirrorY) {
        const point = normalizeBoardPoint(x, y)

        return {
            x: point.x,
            y: mirrorY ? -point.y : point.y
        }
    }

    /**
     * Resolves or creates one reusable geometry for the pad spec.
     * @param {any} THREE
     * @param {Map<string, any>} geometryCache
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', radius: number, cornerRadius: number, hasHole: boolean, holeDiameter: number, holeSlotLength: number | null, holeRotation: number }} spec
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }[]} drillCutouts
     * @returns {any}
     */
    static #resolveGeometry(THREE, geometryCache, spec, drillCutouts) {
        const cacheKey = PcbScene3dPadFactory.#buildGeometryCacheKey(
            spec,
            drillCutouts
        )
        const cached = geometryCache.get(cacheKey)
        if (cached) {
            return cached
        }

        let geometry
        if (spec.kind === 'circle' && !drillCutouts.length) {
            geometry = new THREE.CylinderGeometry(
                spec.radius,
                spec.radius,
                PcbScene3dPadFactory.#PAD_THICKNESS_MIL,
                28
            )
        } else {
            const { shape, shapeHoleCutouts, clippingCutouts } =
                PcbScene3dPadFactory.#buildShapeCutoutPlan(
                    THREE,
                    spec,
                    drillCutouts
                )
            for (const drillCutout of shapeHoleCutouts) {
                const drillHole = PcbScene3dDrillPathFactory.buildDrillPath(
                    THREE,
                    drillCutout
                )
                if (drillHole) {
                    shape.holes.push(drillHole)
                }
            }
            geometry = new THREE.ExtrudeGeometry(shape, {
                depth: PcbScene3dPadFactory.#PAD_THICKNESS_MIL,
                bevelEnabled: false,
                curveSegments: 16,
                steps: 1
            })
            geometry.translate?.(
                0,
                0,
                -PcbScene3dPadFactory.#PAD_THICKNESS_MIL / 2
            )
            geometry = PcbScene3dCutoutGeometryFilter.filter(
                THREE,
                geometry,
                clippingCutouts,
                {
                    maxDepth: 10,
                    maxEdgeLength: PcbScene3dPadFactory.#CUTOUT_MAX_EDGE_LENGTH,
                    discardTerminalOverlaps: true
                }
            )
            if (clippingCutouts.length) {
                geometry = PcbScene3dGeometryFaceRefiner.refine(
                    THREE,
                    geometry,
                    {
                        maxDepth: 8,
                        maxEdgeLength:
                            PcbScene3dPadFactory.#CUTOUT_FACE_MAX_EDGE_LENGTH
                    }
                )
            }
        }

        geometryCache.set(cacheKey, geometry)
        return geometry
    }

    /**
     * Builds the outer pad shape and classifies drill cutouts.
     * @param {any} THREE
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', radius: number, cornerRadius: number }} spec
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }[]} drillCutouts
     * @returns {{ shape: any, shapeHoleCutouts: { x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }[], clippingCutouts: { x: number, y: number }[][] }}
     */
    static #buildShapeCutoutPlan(THREE, spec, drillCutouts) {
        let baseShape = PcbScene3dPadFactory.#buildOuterShape(THREE, spec)
        if (!drillCutouts.length) {
            return {
                shape: baseShape,
                shapeHoleCutouts: [],
                clippingCutouts: []
            }
        }

        let contourPoints =
            PcbScene3dBoardEdgeCutoutBuilder.resolveShapePoints(baseShape)
        const shapeHoleCutouts = []
        const clippingCutouts = []

        for (const drillCutout of drillCutouts) {
            const cutoutPoints = PcbScene3dPadFactory.#resolveDrillCutoutPoints(
                THREE,
                drillCutout
            )
            if (
                PcbScene3dBoardEdgeCutoutBuilder.isHoleInsideContour(
                    cutoutPoints,
                    contourPoints
                )
            ) {
                shapeHoleCutouts.push(drillCutout)
                continue
            }

            const circularCutout =
                PcbScene3dPadFactory.#resolveCircularDrillCutout(drillCutout)
            if (circularCutout) {
                const notchedContour =
                    PcbScene3dBoardEdgeCutoutBuilder.applyCircularEdgeCutouts(
                        contourPoints,
                        [circularCutout]
                    )
                if (
                    !PcbScene3dPadFactory.#sameContourPoints(
                        contourPoints,
                        notchedContour
                    )
                ) {
                    contourPoints = notchedContour
                    baseShape =
                        PcbScene3dBoardEdgeCutoutBuilder.buildShapeFromPoints(
                            THREE,
                            contourPoints
                        )
                    continue
                }
            }

            clippingCutouts.push(cutoutPoints)
        }

        const finalShapeHoleCutouts = []
        const finalClippingCutouts = [...clippingCutouts]

        for (const drillCutout of shapeHoleCutouts) {
            const cutoutPoints = PcbScene3dPadFactory.#resolveDrillCutoutPoints(
                THREE,
                drillCutout
            )
            if (
                PcbScene3dBoardEdgeCutoutBuilder.isHoleInsideContour(
                    cutoutPoints,
                    contourPoints
                )
            ) {
                finalShapeHoleCutouts.push(drillCutout)
            } else {
                finalClippingCutouts.push(cutoutPoints)
            }
        }

        return {
            shape: baseShape,
            shapeHoleCutouts: finalShapeHoleCutouts,
            clippingCutouts: finalClippingCutouts
        }
    }

    /**
     * Checks whether two sampled contours have the same vertices.
     * @param {{ x: number, y: number }[]} first
     * @param {{ x: number, y: number }[]} second
     * @returns {boolean}
     */
    static #sameContourPoints(first, second) {
        if (!Array.isArray(first) || !Array.isArray(second)) {
            return false
        }

        if (first.length !== second.length) {
            return false
        }

        return first.every(
            (point, index) =>
                Math.hypot(
                    Number(point?.x || 0) - Number(second[index]?.x || 0),
                    Number(point?.y || 0) - Number(second[index]?.y || 0)
                ) <= 0.001
        )
    }

    /**
     * Resolves polygon points for one local drill cutout.
     * @param {any} THREE
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }} drillCutout
     * @returns {{ x: number, y: number }[]}
     */
    static #resolveDrillCutoutPoints(THREE, drillCutout) {
        const circularCutout =
            PcbScene3dPadFactory.#resolveCircularDrillCutout(drillCutout)
        if (circularCutout) {
            return PcbScene3dBoardEdgeCutoutBuilder.buildCircularCutoutPoints(
                circularCutout.centerX,
                circularCutout.centerY,
                circularCutout.radius
            )
        }

        return (
            PcbScene3dDrillPathFactory.buildDrillPath(
                THREE,
                drillCutout
            )?.getPoints?.(PcbScene3dPadFactory.#DRILL_SAMPLE_POINTS) || []
        ).map((point) => ({
            x: Number(point.x || 0),
            y: Number(point.y || 0)
        }))
    }

    /**
     * Resolves one local circular drill descriptor.
     * @param {{ x?: number, y?: number, diameter?: number, slotLength?: number | null }} drillCutout
     * @returns {{ centerX: number, centerY: number, radius: number } | null}
     */
    static #resolveCircularDrillCutout(drillCutout) {
        const diameter = Number(drillCutout?.diameter || 0)
        if (
            diameter <= 0 ||
            Number(drillCutout?.slotLength || 0) > diameter + 0.001
        ) {
            return null
        }

        return {
            centerX: Number(drillCutout?.x || 0),
            centerY: Number(drillCutout?.y || 0),
            radius: Math.max(diameter / 2, 0.6)
        }
    }

    /**
     * Resolves drill apertures that intersect one pad's local copper face.
     * @param {{ x?: number, y?: number, rotation?: number | null }} pad
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', radius: number, offsetX: number, offsetY: number }} spec
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }[]} boardDrills
     * @param {boolean} mirrorY
     * @returns {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }[]}
     */
    static #resolvePadDrillCutouts(pad, spec, boardDrills, mirrorY) {
        return (boardDrills || [])
            .map((drillSpec) =>
                PcbScene3dPadFactory.#toPadLocalDrillCutout(
                    pad,
                    spec,
                    drillSpec,
                    mirrorY
                )
            )
            .filter((drillSpec) =>
                PcbScene3dPadFactory.#drillTouchesPadSurface(drillSpec, spec)
            )
    }

    /**
     * Converts one board-space drill aperture into pad-local shape space.
     * @param {{ x?: number, y?: number, rotation?: number | null }} pad
     * @param {{ offsetX: number, offsetY: number }} spec
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }} drillSpec
     * @param {boolean} mirrorY
     * @returns {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }}
     */
    static #toPadLocalDrillCutout(pad, spec, drillSpec, mirrorY) {
        const padRotationDeg = Number(pad?.rotation || 0)
        const relative = {
            x: Number(drillSpec?.x || 0) - Number(pad?.x || 0),
            y: Number(drillSpec?.y || 0) - Number(pad?.y || 0)
        }
        if (mirrorY) {
            relative.y *= -1
        }

        const local = PcbScene3dPadFactory.#rotatePoint(
            relative,
            -padRotationDeg
        )
        const localOffsetY = mirrorY ? -spec.offsetY : spec.offsetY
        const diameter = Number(drillSpec?.diameter || 0)
        const slotLength =
            Number(drillSpec?.slotLength || 0) > diameter
                ? Number(drillSpec.slotLength || 0)
                : null

        return {
            x: local.x - spec.offsetX,
            y: local.y - localOffsetY,
            diameter,
            slotLength,
            rotationDeg: PcbScene3dPadFactory.#normalizeAngle(
                Number(drillSpec?.rotationDeg || 0) - padRotationDeg
            )
        }
    }

    /**
     * Checks whether a local drill aperture overlaps the pad's surface bounds.
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }} drillSpec
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', radius: number }} spec
     * @returns {boolean}
     */
    static #drillTouchesPadSurface(drillSpec, spec) {
        if (Number(drillSpec?.diameter || 0) <= 0) {
            return false
        }

        const bounds = PcbScene3dPadFactory.#resolveDrillBounds(drillSpec)
        const halfWidth = Number(spec.width || 0) / 2
        const halfHeight = Number(spec.height || 0) / 2
        const boundsOverlap =
            bounds.maxX >= -halfWidth &&
            bounds.minX <= halfWidth &&
            bounds.maxY >= -halfHeight &&
            bounds.minY <= halfHeight
        if (!boundsOverlap) {
            return false
        }

        if (spec.kind !== 'circle') {
            return true
        }

        return (
            Math.hypot(Number(drillSpec.x || 0), Number(drillSpec.y || 0)) <=
            Number(spec.radius || 0) +
                PcbScene3dPadFactory.#resolveDrillReach(drillSpec)
        )
    }

    /**
     * Resolves the axis-aligned local bounds of one drill aperture.
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }} drillSpec
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveDrillBounds(drillSpec) {
        const radius = Math.max(Number(drillSpec.diameter || 0) / 2, 0)
        const halfTrack = Math.max(
            (Number(drillSpec.slotLength || 0) -
                Number(drillSpec.diameter || 0)) /
                2,
            0
        )
        const rotationRad = (Number(drillSpec.rotationDeg || 0) * Math.PI) / 180
        const extentX = Math.abs(Math.cos(rotationRad)) * halfTrack + radius
        const extentY = Math.abs(Math.sin(rotationRad)) * halfTrack + radius

        return {
            minX: Number(drillSpec.x || 0) - extentX,
            maxX: Number(drillSpec.x || 0) + extentX,
            minY: Number(drillSpec.y || 0) - extentY,
            maxY: Number(drillSpec.y || 0) + extentY
        }
    }

    /**
     * Resolves a conservative radial reach for one drill aperture.
     * @param {{ diameter: number, slotLength?: number | null }} drillSpec
     * @returns {number}
     */
    static #resolveDrillReach(drillSpec) {
        return (
            Math.max(
                Number(drillSpec.diameter || 0),
                Number(drillSpec.slotLength || 0)
            ) / 2
        )
    }

    /**
     * Rotates one 2D point around the origin.
     * @param {{ x: number, y: number }} point
     * @param {number} angleDeg
     * @returns {{ x: number, y: number }}
     */
    static #rotatePoint(point, angleDeg) {
        const angleRad = (Number(angleDeg || 0) * Math.PI) / 180
        const cos = Math.cos(angleRad)
        const sin = Math.sin(angleRad)

        return {
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos
        }
    }

    /**
     * Builds a cache key that includes pad geometry and local drill cutouts.
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', cornerRadius: number, holeDiameter: number, holeSlotLength: number | null, holeRotation: number }} spec
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }[]} drillCutouts
     * @returns {string}
     */
    static #buildGeometryCacheKey(spec, drillCutouts) {
        const drillKey = (drillCutouts || [])
            .map((drillSpec) =>
                [
                    Number(drillSpec.x || 0).toFixed(4),
                    Number(drillSpec.y || 0).toFixed(4),
                    Number(drillSpec.diameter || 0).toFixed(4),
                    Number(drillSpec.slotLength || 0).toFixed(4),
                    Number(drillSpec.rotationDeg || 0).toFixed(4)
                ].join(',')
            )
            .join('|')

        return [
            spec.kind,
            spec.width.toFixed(4),
            spec.height.toFixed(4),
            spec.cornerRadius.toFixed(4),
            spec.holeDiameter.toFixed(4),
            Number(spec.holeSlotLength || 0).toFixed(4),
            spec.holeRotation.toFixed(4),
            drillKey
        ].join(':')
    }

    /**
     * Normalizes one angle into the inclusive `[0, 360)` range.
     * @param {number} angleDeg
     * @returns {number}
     */
    static #normalizeAngle(angleDeg) {
        const normalized = Number(angleDeg || 0) % 360
        return normalized < 0 ? normalized + 360 : normalized
    }

    /**
     * Builds one pad outline shape for extrusion.
     * @param {any} THREE
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', radius: number, cornerRadius: number }} spec
     * @returns {any}
     */
    static #buildOuterShape(THREE, spec) {
        if (spec.kind === 'circle') {
            const shape = new THREE.Shape()
            shape.moveTo(spec.radius, 0)
            shape.absarc(0, 0, spec.radius, 0, Math.PI, false)
            shape.absarc(0, 0, spec.radius, Math.PI, Math.PI * 2, false)
            shape.closePath()
            return shape
        }

        if (spec.kind === 'rounded-rect') {
            return PcbScene3dPadFactory.#buildRoundedRectShape(THREE, spec)
        }

        return PcbScene3dPadFactory.#buildRectShape(THREE, spec)
    }

    /**
     * Builds one rectangular pad profile.
     * @param {any} THREE
     * @param {{ width: number, height: number }} spec
     * @returns {any}
     */
    static #buildRectShape(THREE, spec) {
        const halfWidth = spec.width / 2
        const halfHeight = spec.height / 2
        const shape = new THREE.Shape()

        shape.moveTo(-halfWidth, -halfHeight)
        shape.lineTo(halfWidth, -halfHeight)
        shape.lineTo(halfWidth, halfHeight)
        shape.lineTo(-halfWidth, halfHeight)
        shape.closePath()
        return shape
    }

    /**
     * Builds one rounded rectangular pad profile.
     * @param {any} THREE
     * @param {{ width: number, height: number, cornerRadius: number }} spec
     * @returns {any}
     */
    static #buildRoundedRectShape(THREE, spec) {
        const halfWidth = spec.width / 2
        const halfHeight = spec.height / 2
        const radius = Math.max(
            0,
            Math.min(spec.cornerRadius, halfWidth, halfHeight)
        )
        const shape = new THREE.Shape()

        if (radius <= 0.001) {
            shape.moveTo(-halfWidth, -halfHeight)
            shape.lineTo(halfWidth, -halfHeight)
            shape.lineTo(halfWidth, halfHeight)
            shape.lineTo(-halfWidth, halfHeight)
            shape.closePath()
            return shape
        }

        shape.moveTo(-halfWidth + radius, -halfHeight)
        shape.lineTo(halfWidth - radius, -halfHeight)
        shape.absarc(
            halfWidth - radius,
            -halfHeight + radius,
            radius,
            -Math.PI / 2,
            0,
            false
        )
        shape.lineTo(halfWidth, halfHeight - radius)
        shape.absarc(
            halfWidth - radius,
            halfHeight - radius,
            radius,
            0,
            Math.PI / 2,
            false
        )
        shape.lineTo(-halfWidth + radius, halfHeight)
        shape.absarc(
            -halfWidth + radius,
            halfHeight - radius,
            radius,
            Math.PI / 2,
            Math.PI,
            false
        )
        shape.lineTo(-halfWidth, -halfHeight + radius)
        shape.absarc(
            -halfWidth + radius,
            -halfHeight + radius,
            radius,
            Math.PI,
            (Math.PI * 3) / 2,
            false
        )
        shape.closePath()
        return shape
    }
}
