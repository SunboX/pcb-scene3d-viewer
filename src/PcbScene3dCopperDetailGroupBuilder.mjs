import { PcbScene3dBoardMaterialPalette } from './PcbScene3dBoardMaterialPalette.mjs'
import { PcbScene3dCopperDetailFilter } from './PcbScene3dCopperDetailFilter.mjs'
import { PcbScene3dCopperDrillCutoutBuilder } from './PcbScene3dCopperDrillCutoutBuilder.mjs'
import { PcbScene3dCopperFactory } from './PcbScene3dCopperFactory.mjs'
import { PcbScene3dMaskCoveredCopperMaterial } from './PcbScene3dMaskCoveredCopperMaterial.mjs'
import { PcbScene3dPadFactory } from './PcbScene3dPadFactory.mjs'
import { PcbScene3dViaFactory } from './PcbScene3dViaFactory.mjs'

/**
 * Builds deferred copper-detail groups for the 3D runtime.
 */
export class PcbScene3dCopperDetailGroupBuilder {
    static #CIRCLE_SEGMENTS = 64
    static #COVERED_COPPER_UNDERLAP_MIL = 6
    static #MAX_SILKSCREEN_OCCLUSION_SPAN_MIL = 500
    static #ROUNDED_CORNER_SEGMENTS = 12

    /**
     * Builds visible exposed and mask-covered copper detail.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {number} topZ Top copper center Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @returns {any}
     */
    static build(THREE, sceneDescription, topZ, normalizePoint) {
        const group = new THREE.Group()
        const drillCutouts = [
            ...PcbScene3dCopperDrillCutoutBuilder.resolve(
                sceneDescription?.detail
            ),
            ...PcbScene3dCopperDetailGroupBuilder.#resolveBoardCutouts(
                sceneDescription?.board
            )
        ]
        const coveredGroup =
            PcbScene3dCopperDetailGroupBuilder.#buildCoveredGroup(
                THREE,
                sceneDescription,
                topZ,
                normalizePoint,
                drillCutouts
            )
        const coveredViaGroup =
            PcbScene3dCopperDetailGroupBuilder.#buildCoveredViaGroup(
                THREE,
                sceneDescription,
                normalizePoint
            )
        const exposedGroup =
            PcbScene3dCopperDetailGroupBuilder.#buildExposedGroup(
                THREE,
                sceneDescription,
                topZ,
                normalizePoint,
                drillCutouts
            )
        const viaGroup = PcbScene3dCopperDetailGroupBuilder.#buildViaGroup(
            THREE,
            sceneDescription,
            normalizePoint
        )

        ;[coveredGroup, coveredViaGroup, exposedGroup, viaGroup]
            .filter((child) => child.children.length)
            .forEach((child) => group.add(child))

        return group
    }

    /**
     * Builds traces covered by solder mask.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {number} topZ Top copper center Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @param {{ x: number, y: number }[][]} drillCutouts Board drill cutouts.
     * @returns {any}
     */
    static #buildCoveredGroup(
        THREE,
        sceneDescription,
        topZ,
        normalizePoint,
        drillCutouts
    ) {
        return PcbScene3dCopperFactory.buildMaskCoveredGroup(
            THREE,
            PcbScene3dCopperDetailFilter.resolveCoveredByMask(sceneDescription),
            topZ,
            -topZ,
            normalizePoint,
            {
                ...PcbScene3dCopperDetailGroupBuilder.#coveredCopperMaterialOptions(
                    sceneDescription
                ),
                drillCutouts,
                drillDetail: sceneDescription?.detail,
                unionCoveredLayerPrimitives:
                    PcbScene3dCopperDetailGroupBuilder.#usesGerberLayerUnion(
                        sceneDescription
                    ),
                occlusionCutouts:
                    PcbScene3dCopperDetailGroupBuilder.#resolveCoveredCopperOcclusions(
                        sceneDescription?.detail
                    )
            }
        )
    }

    /**
     * Builds solder-mask-covered via annuli.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @returns {any}
     */
    static #buildCoveredViaGroup(THREE, sceneDescription, normalizePoint) {
        const vias =
            PcbScene3dCopperDetailFilter.resolveCoveredStandaloneVias(
                sceneDescription
            )
        if (!vias.length) {
            return new THREE.Group()
        }

        return PcbScene3dViaFactory.buildGroup(
            THREE,
            vias,
            sceneDescription?.board?.thicknessMil,
            normalizePoint,
            {
                material: PcbScene3dMaskCoveredCopperMaterial.build(
                    THREE,
                    PcbScene3dCopperDetailGroupBuilder.#coveredCopperMaterialOptions(
                        sceneDescription
                    )
                )
            }
        )
    }

    /**
     * Checks whether the source format represents copper as Gerber polarity union.
     * @param {object | undefined} sceneDescription Scene description.
     * @returns {boolean}
     */
    static #usesGerberLayerUnion(sceneDescription) {
        return (
            String(sceneDescription?.sourceFormat || '').toLowerCase() ===
            'gerber'
        )
    }

    /**
     * Builds exposed copper detail.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {number} topZ Top copper center Z.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @param {{ x: number, y: number }[][]} drillCutouts Board drill cutouts.
     * @returns {any}
     */
    static #buildExposedGroup(
        THREE,
        sceneDescription,
        topZ,
        normalizePoint,
        drillCutouts
    ) {
        return PcbScene3dCopperFactory.buildGroup(
            THREE,
            PcbScene3dCopperDetailFilter.resolve(sceneDescription),
            topZ,
            -topZ,
            normalizePoint,
            {
                coordinateSystem: sceneDescription?.coordinateSystem,
                drillCutouts,
                drillDetail: sceneDescription?.detail
            }
        )
    }

    /**
     * Builds exposed via and through-hole barrel detail.
     * @param {any} THREE Three.js namespace.
     * @param {object} sceneDescription Scene description.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizePoint
     * @returns {any}
     */
    static #buildViaGroup(THREE, sceneDescription, normalizePoint) {
        if (
            !PcbScene3dCopperDetailFilter.shouldRenderStandaloneVias(
                sceneDescription
            )
        ) {
            return new THREE.Group()
        }

        return PcbScene3dViaFactory.buildGroup(
            THREE,
            PcbScene3dCopperDetailFilter.resolveStandaloneVias(
                sceneDescription
            ),
            sceneDescription?.board?.thicknessMil,
            normalizePoint
        )
    }

    /**
     * Resolves explicit through-board cutouts that copper detail must not cover.
     * @param {{ cutouts?: any[] } | undefined} board Board metadata.
     * @returns {{ x: number, y: number }[][]}
     */
    static #resolveBoardCutouts(board) {
        return (Array.isArray(board?.cutouts) ? board.cutouts : [])
            .map((cutout) =>
                PcbScene3dCopperDetailGroupBuilder.#resolveBoardCutoutPoints(
                    cutout
                )
            )
            .filter((points) => points.length >= 3)
    }

    /**
     * Resolves one explicit board cutout loop in source board coordinates.
     * @param {any} cutout Cutout source.
     * @returns {{ x: number, y: number }[]}
     */
    static #resolveBoardCutoutPoints(cutout) {
        const points = Array.isArray(cutout?.points)
            ? cutout.points
            : Array.isArray(cutout?.vertices)
              ? cutout.vertices
              : Array.isArray(cutout)
                ? cutout
                : []

        return points
            .map((point) => ({
                x: Number(point?.x ?? point?.[0]),
                y: Number(point?.y ?? point?.[1])
            }))
            .filter((point) => Number.isFinite(point.x + point.y))
    }

    /**
     * Resolves solder-mask material options for covered copper relief.
     * @param {object} sceneDescription Scene description.
     * @returns {{ solderMaskColor: number }}
     */
    static #coveredCopperMaterialOptions(sceneDescription) {
        return {
            solderMaskColor: PcbScene3dBoardMaterialPalette.resolveSurfaceColor(
                sceneDescription?.board,
                {
                    hasBoardAssemblyModel: Boolean(
                        sceneDescription?.boardAssemblyModel
                    ),
                    sourceFormat: sceneDescription?.sourceFormat
                }
            )
        }
    }

    /**
     * Resolves opaque silkscreen fill polygons that should hide covered copper.
     * @param {{ top?: object, bottom?: object } | undefined} silkscreen Scene silkscreen detail.
     * @returns {{ top: { x: number, y: number }[][], bottom: { x: number, y: number }[][] }}
     */
    static #resolveSilkscreenFillOcclusions(silkscreen) {
        return {
            top: PcbScene3dCopperDetailGroupBuilder.#resolveSideFillOcclusions(
                silkscreen?.top
            ),
            bottom: PcbScene3dCopperDetailGroupBuilder.#resolveSideFillOcclusions(
                silkscreen?.bottom
            )
        }
    }

    /**
     * Resolves fill contours on one silkscreen side.
     * @param {{ fills?: any[] } | undefined} side Side-specific silkscreen detail.
     * @returns {{ x: number, y: number }[][]}
     */
    static #resolveSideFillOcclusions(side) {
        return (Array.isArray(side?.fills) ? side.fills : [])
            .map((fill) =>
                Array.isArray(fill?.points) && fill.points.length >= 3
                    ? fill.points
                    : PcbScene3dCopperDetailGroupBuilder.#resolveBoxFillPoints(
                          fill
                      )
            )
            .map((points) =>
                points
                    .map((point) => ({
                        x: Number(point?.x),
                        y: Number(point?.y)
                    }))
                    .filter(
                        (point) =>
                            Number.isFinite(point.x) && Number.isFinite(point.y)
                    )
            )
            .filter((points) => points.length >= 3)
            .filter((points) =>
                PcbScene3dCopperDetailGroupBuilder.#isBoundedSilkscreenOcclusion(
                    points
                )
            )
    }

    /**
     * Resolves a rectangular fill as a polygon contour.
     * @param {{ x1?: number, y1?: number, x2?: number, y2?: number } | undefined} fill Fill record.
     * @returns {{ x: number, y: number }[]}
     */
    static #resolveBoxFillPoints(fill) {
        const x1 = Number(fill?.x1)
        const y1 = Number(fill?.y1)
        const x2 = Number(fill?.x2)
        const y2 = Number(fill?.y2)

        if (
            !Number.isFinite(x1) ||
            !Number.isFinite(y1) ||
            !Number.isFinite(x2) ||
            !Number.isFinite(y2)
        ) {
            return []
        }

        return [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 }
        ]
    }

    /**
     * Checks whether a silkscreen fill is small enough for copper clipping.
     * @param {{ x: number, y: number }[]} points Fill contour points.
     * @returns {boolean}
     */
    static #isBoundedSilkscreenOcclusion(points) {
        const bounds =
            PcbScene3dCopperDetailGroupBuilder.#resolveSilkscreenBounds(points)
        const span = Math.max(
            bounds.maxX - bounds.minX,
            bounds.maxY - bounds.minY
        )

        return (
            Number.isFinite(span) &&
            span <=
                PcbScene3dCopperDetailGroupBuilder
                    .#MAX_SILKSCREEN_OCCLUSION_SPAN_MIL
        )
    }

    /**
     * Resolves the bounds for one silkscreen fill contour.
     * @param {{ x: number, y: number }[]} points Fill contour points.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveSilkscreenBounds(points) {
        return points.reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, point.x),
                maxX: Math.max(bounds.maxX, point.x),
                minY: Math.min(bounds.minY, point.y),
                maxY: Math.max(bounds.maxY, point.y)
            }),
            { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        )
    }

    /**
     * Resolves opaque geometry that should hide mask-covered copper.
     * @param {object | undefined} detail Scene detail.
     * @returns {{ top: { x: number, y: number }[][], bottom: { x: number, y: number }[][] }}
     */
    static #resolveCoveredCopperOcclusions(detail) {
        const silkscreenOcclusions =
            PcbScene3dCopperDetailGroupBuilder.#resolveSilkscreenFillOcclusions(
                detail?.silkscreen
            )

        return {
            top: silkscreenOcclusions.top.concat(
                PcbScene3dCopperDetailGroupBuilder.#resolvePadSurfaceOcclusions(
                    detail?.pads,
                    'top'
                )
            ),
            bottom: silkscreenOcclusions.bottom.concat(
                PcbScene3dCopperDetailGroupBuilder.#resolvePadSurfaceOcclusions(
                    detail?.pads,
                    'bottom'
                )
            )
        }
    }

    /**
     * Resolves exposed pad faces on one side as occlusion polygons.
     * @param {object[] | undefined} pads Pad detail rows.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {{ x: number, y: number }[][]}
     */
    static #resolvePadSurfaceOcclusions(pads, side) {
        return (Array.isArray(pads) ? pads : [])
            .filter((pad) =>
                PcbScene3dCopperDetailGroupBuilder.#hasVisiblePadSurface(
                    pad,
                    side
                )
            )
            .map((pad) =>
                PcbScene3dCopperDetailGroupBuilder.#resolvePadSurfacePolygon(
                    pad,
                    side
                )
            )
            .filter((points) => points.length >= 3)
    }

    /**
     * Checks whether one pad face has exposed copper on a side.
     * @param {object} pad Pad detail row.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {boolean}
     */
    static #hasVisiblePadSurface(pad, side) {
        if (
            PcbScene3dCopperDetailGroupBuilder.#resolveSolderMaskOpening(
                pad,
                side
            ) === false
        ) {
            return false
        }

        if (PcbScene3dCopperDetailGroupBuilder.#hasSideSize(pad, side)) {
            return true
        }

        const oppositeSide = side === 'bottom' ? 'top' : 'bottom'
        if (
            PcbScene3dCopperDetailGroupBuilder.#hasSideSize(pad, oppositeSide)
        ) {
            return false
        }

        return (
            Number(pad?.sizeMidX || 0) > 0 ||
            Number(pad?.sizeMidY || 0) > 0 ||
            Number(pad?.holeDiameter || 0) > 0
        )
    }

    /**
     * Resolves one side-specific solder mask opening flag.
     * @param {object} pad Pad detail row.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {boolean | null}
     */
    static #resolveSolderMaskOpening(pad, side) {
        const fieldName =
            side === 'bottom'
                ? 'hasBottomSolderMaskOpening'
                : 'hasTopSolderMaskOpening'

        return typeof pad?.[fieldName] === 'boolean' ? pad[fieldName] : null
    }

    /**
     * Checks whether one pad has an explicit copper size for a side.
     * @param {object} pad Pad detail row.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {boolean}
     */
    static #hasSideSize(pad, side) {
        return side === 'bottom'
            ? Number(pad?.sizeBottomX || 0) > 0 ||
                  Number(pad?.sizeBottomY || 0) > 0
            : Number(pad?.sizeTopX || 0) > 0 || Number(pad?.sizeTopY || 0) > 0
    }

    /**
     * Resolves one pad surface as a board-coordinate polygon.
     * @param {object} pad Pad detail row.
     * @param {'top' | 'bottom'} side Board side.
     * @returns {{ x: number, y: number }[]}
     */
    static #resolvePadSurfacePolygon(pad, side) {
        const spec = PcbScene3dPadFactory.resolvePadSurfaceSpec(pad, side)
        const occlusionSpec =
            PcbScene3dCopperDetailGroupBuilder.#insetPadSurfaceSpec(spec)
        const center = {
            x: Number(pad?.x || 0) + spec.offsetX,
            y: Number(pad?.y || 0) + spec.offsetY
        }

        if (!occlusionSpec) {
            return []
        }

        return PcbScene3dCopperDetailGroupBuilder.#transformPoints(
            PcbScene3dCopperDetailGroupBuilder.#buildPadLocalPoints(
                occlusionSpec
            ),
            center,
            Number(pad?.rotation || 0)
        )
    }

    /**
     * Insets a pad occlusion so mask-covered traces can visually tuck below
     * exposed copper sidewalls instead of ending at the same vertical plane.
     * @param {{ width: number, height: number, kind: string, cornerRadius: number }} spec Pad surface spec.
     * @returns {{ width: number, height: number, kind: string, cornerRadius: number } | null}
     */
    static #insetPadSurfaceSpec(spec) {
        const inset = PcbScene3dCopperDetailGroupBuilder.#resolvePadInset(spec)
        const width = Math.max(Number(spec?.width || 0) - inset * 2, 0)
        const height = Math.max(Number(spec?.height || 0) - inset * 2, 0)

        if (width <= 0 || height <= 0) {
            return null
        }

        return {
            ...spec,
            width,
            height,
            radius: Math.max(width, height) / 2,
            cornerRadius: Math.max(Number(spec?.cornerRadius || 0) - inset, 0)
        }
    }

    /**
     * Resolves a bounded pad occlusion inset.
     * @param {{ width: number, height: number }} spec Pad surface spec.
     * @returns {number}
     */
    static #resolvePadInset(spec) {
        return Math.min(
            PcbScene3dCopperDetailGroupBuilder.#COVERED_COPPER_UNDERLAP_MIL,
            Math.max(
                Math.min(Number(spec?.width || 0), Number(spec?.height || 0)) /
                    2 -
                    0.001,
                0
            )
        )
    }

    /**
     * Builds local points for one pad face.
     * @param {{ width: number, height: number, kind: string, cornerRadius: number }} spec Pad surface spec.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildPadLocalPoints(spec) {
        if (spec.kind === 'circle') {
            return PcbScene3dCopperDetailGroupBuilder.#buildCirclePoints(
                Math.max(spec.width, spec.height) / 2
            )
        }

        if (spec.kind === 'rounded-rect' && Number(spec.cornerRadius) > 0) {
            return PcbScene3dCopperDetailGroupBuilder.#buildRoundedRectPoints(
                spec.width,
                spec.height,
                spec.cornerRadius
            )
        }

        return PcbScene3dCopperDetailGroupBuilder.#buildRectPoints(
            spec.width,
            spec.height
        )
    }

    /**
     * Builds a circular polygon centered at the origin.
     * @param {number} radius Circle radius.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildCirclePoints(radius) {
        return Array.from(
            { length: PcbScene3dCopperDetailGroupBuilder.#CIRCLE_SEGMENTS },
            (_unused, index) => {
                const angle =
                    (Math.PI * 2 * index) /
                    PcbScene3dCopperDetailGroupBuilder.#CIRCLE_SEGMENTS

                return {
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius
                }
            }
        )
    }

    /**
     * Builds a rectangle polygon centered at the origin.
     * @param {number} width Rectangle width.
     * @param {number} height Rectangle height.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildRectPoints(width, height) {
        const halfWidth = Number(width || 0) / 2
        const halfHeight = Number(height || 0) / 2

        return [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ]
    }

    /**
     * Builds a rounded rectangle polygon centered at the origin.
     * @param {number} width Rectangle width.
     * @param {number} height Rectangle height.
     * @param {number} radius Corner radius.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildRoundedRectPoints(width, height, radius) {
        const halfWidth = Number(width || 0) / 2
        const halfHeight = Number(height || 0) / 2
        const cornerRadius = Math.min(
            Math.max(Number(radius || 0), 0),
            halfWidth,
            halfHeight
        )
        const corners = [
            { x: halfWidth - cornerRadius, y: halfHeight - cornerRadius },
            { x: -halfWidth + cornerRadius, y: halfHeight - cornerRadius },
            { x: -halfWidth + cornerRadius, y: -halfHeight + cornerRadius },
            { x: halfWidth - cornerRadius, y: -halfHeight + cornerRadius }
        ]
        const angleRanges = [
            [0, Math.PI / 2],
            [Math.PI / 2, Math.PI],
            [Math.PI, (Math.PI * 3) / 2],
            [(Math.PI * 3) / 2, Math.PI * 2]
        ]

        return corners.flatMap((corner, cornerIndex) =>
            PcbScene3dCopperDetailGroupBuilder.#buildCornerPoints(
                corner,
                cornerRadius,
                angleRanges[cornerIndex]
            )
        )
    }

    /**
     * Builds sampled points for one rounded corner.
     * @param {{ x: number, y: number }} center Corner arc center.
     * @param {number} radius Corner radius.
     * @param {number[]} angleRange Start and end angle.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildCornerPoints(center, radius, angleRange) {
        const [startAngle, endAngle] = angleRange

        return Array.from(
            {
                length:
                    PcbScene3dCopperDetailGroupBuilder
                        .#ROUNDED_CORNER_SEGMENTS + 1
            },
            (_unused, index) => {
                const ratio =
                    index /
                    PcbScene3dCopperDetailGroupBuilder.#ROUNDED_CORNER_SEGMENTS
                const angle = startAngle + (endAngle - startAngle) * ratio

                return {
                    x: center.x + Math.cos(angle) * radius,
                    y: center.y + Math.sin(angle) * radius
                }
            }
        )
    }

    /**
     * Rotates and translates local points into board coordinates.
     * @param {{ x: number, y: number }[]} points Local points.
     * @param {{ x: number, y: number }} center Board center.
     * @param {number} rotationDeg Rotation in degrees.
     * @returns {{ x: number, y: number }[]}
     */
    static #transformPoints(points, center, rotationDeg) {
        const angle = (Number(rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        return points.map((point) => ({
            x: center.x + point.x * cos - point.y * sin,
            y: center.y + point.x * sin + point.y * cos
        }))
    }
}
