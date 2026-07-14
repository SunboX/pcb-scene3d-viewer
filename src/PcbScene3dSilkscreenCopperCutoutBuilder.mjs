import earcut from 'earcut'
import { PcbAssemblyFillGeometryResolver } from './PcbAssemblyFillGeometryResolver.mjs'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'
import { PcbScene3dCopperTextFactory } from './PcbScene3dCopperTextFactory.mjs'
import { PcbScene3dPadFactory } from './PcbScene3dPadFactory.mjs'
import { PcbScene3dCopperDrillCutoutBuilder } from './PcbScene3dCopperDrillCutoutBuilder.mjs'
import { PcbScene3dStrokeCutoutBuilder } from './PcbScene3dStrokeCutoutBuilder.mjs'
import { PcbScene3dViaLayerSpan } from './PcbScene3dViaLayerSpan.mjs'

/**
 * Builds board-space surface keepouts used to clip silkscreen primitives.
 */
export class PcbScene3dSilkscreenCopperCutoutBuilder {
    static #CIRCLE_SEGMENTS = 48
    static #ROUNDED_CORNER_SEGMENTS = 12

    /**
     * Adds generated copper and drill keepouts to renderable silkscreen faces.
     * @param {{ top?: object, bottom?: object } | undefined} silkscreen Silkscreen detail.
     * @param {{ pads?: object[], vias?: object[], tracks?: object[], fills?: object[], polygons?: object[], copperTexts?: object[] }} detail Scene detail.
     * @returns {{ top: object, bottom: object }}
     */
    static apply(silkscreen, detail) {
        const topHasSilkscreen =
            PcbScene3dSilkscreenCopperCutoutBuilder.#hasRenderableSilkscreen(
                silkscreen?.top
            )
        const bottomHasSilkscreen =
            PcbScene3dSilkscreenCopperCutoutBuilder.#hasRenderableSilkscreen(
                silkscreen?.bottom
            )
        const copperCutouts = PcbScene3dSilkscreenCopperCutoutBuilder.build(
            detail,
            {
                top: topHasSilkscreen,
                bottom: bottomHasSilkscreen
            }
        )
        const drillCutouts = {
            top: topHasSilkscreen
                ? PcbScene3dSilkscreenCopperCutoutBuilder.#buildDrillCutouts(
                      detail,
                      'top'
                  )
                : [],
            bottom: bottomHasSilkscreen
                ? PcbScene3dSilkscreenCopperCutoutBuilder.#buildDrillCutouts(
                      detail,
                      'bottom'
                  )
                : []
        }

        return {
            ...silkscreen,
            top: PcbScene3dSilkscreenCopperCutoutBuilder.#composeSide(
                silkscreen?.top,
                copperCutouts.top,
                drillCutouts.top,
                topHasSilkscreen
            ),
            bottom: PcbScene3dSilkscreenCopperCutoutBuilder.#composeSide(
                silkscreen?.bottom,
                copperCutouts.bottom,
                drillCutouts.bottom,
                bottomHasSilkscreen
            )
        }
    }

    /**
     * Builds side-specific copper keepouts from normalized scene detail.
     * @param {{ pads?: object[], vias?: object[], tracks?: object[], fills?: object[], polygons?: object[], copperTexts?: object[] }} detail Scene detail.
     * @param {{ top?: boolean, bottom?: boolean }} [sides] Faces that contain renderable silkscreen.
     * @returns {{ top: { x: number, y: number }[][], bottom: { x: number, y: number }[][] }}
     */
    static build(detail, sides = {}) {
        const pads = Array.isArray(detail?.pads) ? detail.pads : []
        const vias = Array.isArray(detail?.vias) ? detail.vias : []
        const tracks = Array.isArray(detail?.tracks) ? detail.tracks : []
        const fills = [
            ...(Array.isArray(detail?.fills) ? detail.fills : []),
            ...(Array.isArray(detail?.polygons) ? detail.polygons : [])
        ]
        const copperTexts = Array.isArray(detail?.copperTexts)
            ? detail.copperTexts
            : []
        const surfaceDetail = { pads, vias, tracks, fills, copperTexts }

        return {
            top:
                sides.top === false
                    ? []
                    : PcbScene3dSilkscreenCopperCutoutBuilder.#buildSide(
                          surfaceDetail,
                          'top'
                      ),
            bottom:
                sides.bottom === false
                    ? []
                    : PcbScene3dSilkscreenCopperCutoutBuilder.#buildSide(
                          surfaceDetail,
                          'bottom'
                      )
        }
    }

    /**
     * Returns true when one face contains silkscreen geometry to clip.
     * @param {object | undefined} silkscreen Face-specific silkscreen detail.
     * @returns {boolean}
     */
    static #hasRenderableSilkscreen(silkscreen) {
        return ['fills', 'tracks', 'arcs', 'texts'].some(
            (name) =>
                Array.isArray(silkscreen?.[name]) && silkscreen[name].length > 0
        )
    }

    /**
     * Merges generated keepouts with authored face detail.
     * @param {object | undefined} silkscreen Face-specific silkscreen detail.
     * @param {{ x: number, y: number }[][]} copperCutouts Generated copper keepouts.
     * @param {{ x: number, y: number }[][]} drillCutouts Generated drill keepouts.
     * @param {boolean} hasSilkscreen Whether the face contains geometry to clip.
     * @returns {object}
     */
    static #composeSide(
        silkscreen,
        copperCutouts,
        drillCutouts,
        hasSilkscreen
    ) {
        return {
            ...silkscreen,
            copperCutouts: [
                ...(silkscreen?.copperCutouts || []),
                ...(hasSilkscreen ? copperCutouts : [])
            ],
            drillCutouts: [
                ...(silkscreen?.drillCutouts || []),
                ...(hasSilkscreen ? drillCutouts : [])
            ]
        }
    }

    /**
     * Builds copper keepouts for one board face.
     * @param {{ pads: object[], vias: object[], tracks: object[], fills: object[], copperTexts: object[] }} detail Normalized surface detail.
     * @param {'top' | 'bottom'} side Board face.
     * @returns {{ x: number, y: number }[][]}
     */
    static #buildSide(detail, side) {
        return [
            ...detail.pads
                .filter((pad) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#hasVisiblePadSurface(
                        pad,
                        side
                    )
                )
                .map((pad) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#buildPadCutout(
                        pad,
                        side
                    )
                ),
            ...detail.vias
                .filter((via) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#hasVisibleViaSurface(
                        via,
                        side
                    )
                )
                .map((via) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#buildViaCutout(via)
                ),
            ...detail.tracks
                .filter((track) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#isOpenOnSide(
                        track,
                        side
                    )
                )
                .map((track) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#buildTrackCutout(
                        track
                    )
                ),
            ...detail.fills
                .filter((fill) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#isOpenOnSide(
                        fill,
                        side
                    )
                )
                .flatMap((fill) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#buildFillCutouts(
                        fill
                    )
                ),
            ...detail.copperTexts
                .filter((text) =>
                    PcbScene3dSilkscreenCopperCutoutBuilder.#isOpenOnSide(
                        text,
                        side
                    )
                )
                .flatMap((text) =>
                    PcbScene3dCopperTextFactory.strokeCutouts(text)
                )
        ].filter((points) => points.length >= 3)
    }

    /**
     * Builds one round-capped track keepout.
     * @param {object} track Normalized track.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildTrackCutout(track) {
        return PcbScene3dStrokeCutoutBuilder.build(
            { x: Number(track?.x1), y: Number(track?.y1) },
            { x: Number(track?.x2), y: Number(track?.y2) },
            Number(track?.width || 0),
            { minWidth: 1 }
        )
    }

    /**
     * Builds exact filled-area keepouts, triangulating only shapes with holes.
     * @param {object} fill Normalized copper fill or polygon.
     * @returns {{ x: number, y: number }[][]}
     */
    static #buildFillCutouts(fill) {
        return PcbAssemblyFillGeometryResolver.resolveAll(fill).flatMap(
            (loops) =>
                loops.holes.length
                    ? PcbScene3dSilkscreenCopperCutoutBuilder.#triangulateLoopSet(
                          loops
                      )
                    : [
                          loops.outer.map((point) => ({
                              x: Number(point?.[0]),
                              y: Number(point?.[1])
                          }))
                      ]
        )
    }

    /**
     * Triangulates a filled loop set so authored voids remain printable.
     * @param {{ outer: number[][], holes: number[][][] }} loops Fill loops.
     * @returns {{ x: number, y: number }[][]}
     */
    static #triangulateLoopSet(loops) {
        const rings = [loops.outer, ...(loops.holes || [])]
        const points = rings.flat()
        const flatPoints = points.flatMap((point) => [
            Number(point?.[0]),
            Number(point?.[1])
        ])
        const holeIndexes = []
        let vertexIndex = loops.outer.length
        for (const hole of loops.holes || []) {
            holeIndexes.push(vertexIndex)
            vertexIndex += hole.length
        }
        const indexes = earcut(flatPoints, holeIndexes, 2)
        const triangles = []
        for (let index = 0; index < indexes.length; index += 3) {
            triangles.push(
                indexes.slice(index, index + 3).map((pointIndex) => ({
                    x: Number(points[pointIndex]?.[0]),
                    y: Number(points[pointIndex]?.[1])
                }))
            )
        }
        return triangles
    }

    /**
     * Returns true when copper is exposed on the requested board face.
     * @param {object} primitive Normalized surface primitive.
     * @param {'top' | 'bottom'} side Board face.
     * @returns {boolean}
     */
    static #isOpenOnSide(primitive, side) {
        const isOpen =
            primitive?.solderMaskOpening === true ||
            primitive?.hasSolderMask === false
        return (
            isOpen &&
            PcbScene3dSilkscreenCopperCutoutBuilder.#primitiveSide(
                primitive
            ) === side
        )
    }

    /**
     * Resolves one normalized primitive side.
     * @param {object} primitive Surface primitive.
     * @returns {'top' | 'bottom'}
     */
    static #primitiveSide(primitive) {
        const layerId = Number(primitive?.layerId)
        if (layerId === 32) return 'bottom'
        if (layerId === 1) return 'top'

        return (
            PcbScene3dCircuitJsonLayer.surfaceSide(
                primitive?.side ?? primitive?.layer
            ) ||
            PcbScene3dCircuitJsonLayer.side(primitive?.side ?? primitive?.layer)
        )
    }

    /**
     * Builds physical drill cutouts for the vias that reach one board face.
     * Through-hole pad drills continue to apply to both faces.
     * @param {{ pads?: object[], vias?: object[] }} detail Scene detail.
     * @param {'top' | 'bottom'} side Board face.
     * @returns {{ x: number, y: number }[][]}
     */
    static #buildDrillCutouts(detail, side) {
        return PcbScene3dCopperDrillCutoutBuilder.resolve({
            ...detail,
            vias: (Array.isArray(detail?.vias) ? detail.vias : []).filter(
                (via) => PcbScene3dViaLayerSpan.reachesSide(via, side)
            )
        })
    }

    /**
     * Returns true when a pad exposes copper on one board face.
     * @param {object} pad Normalized pad.
     * @param {'top' | 'bottom'} side Board face.
     * @returns {boolean}
     */
    static #hasVisiblePadSurface(pad, side) {
        const openingField =
            side === 'bottom'
                ? 'hasBottomSolderMaskOpening'
                : 'hasTopSolderMaskOpening'
        if (pad?.[openingField] === false) {
            return false
        }

        if (
            PcbScene3dSilkscreenCopperCutoutBuilder.#hasPadSideSize(pad, side)
        ) {
            return true
        }

        const alternateSide = side === 'bottom' ? 'top' : 'bottom'
        const alternateSideHasSize =
            PcbScene3dSilkscreenCopperCutoutBuilder.#hasPadSideSize(
                pad,
                alternateSide
            )
        const midHasSize =
            Number(pad?.sizeMidX || 0) > 0 || Number(pad?.sizeMidY || 0) > 0

        return (
            !alternateSideHasSize &&
            (midHasSize || Number(pad?.holeDiameter || 0) > 0)
        )
    }

    /**
     * Returns true when a pad has an explicit copper size on one face.
     * @param {object} pad Normalized pad.
     * @param {'top' | 'bottom'} side Board face.
     * @returns {boolean}
     */
    static #hasPadSideSize(pad, side) {
        if (side === 'bottom') {
            return (
                Number(pad?.sizeBottomX || 0) > 0 ||
                Number(pad?.sizeBottomY || 0) > 0
            )
        }

        return Number(pad?.sizeTopX || 0) > 0 || Number(pad?.sizeTopY || 0) > 0
    }

    /**
     * Returns true when a via exposes copper on one board face.
     * @param {object} via Normalized via.
     * @param {'top' | 'bottom'} side Board face.
     * @returns {boolean}
     */
    static #hasVisibleViaSurface(via, side) {
        if (!PcbScene3dViaLayerSpan.reachesSide(via, side)) {
            return false
        }

        const openingField =
            side === 'bottom'
                ? 'hasBottomSolderMaskOpening'
                : 'hasTopSolderMaskOpening'
        if (typeof via?.[openingField] === 'boolean') {
            return via[openingField] && Number(via?.diameter || 0) > 0
        }

        const tentingField =
            side === 'bottom' ? 'isTentingBottom' : 'isTentingTop'
        return via?.[tentingField] !== true && Number(via?.diameter || 0) > 0
    }

    /**
     * Builds one transformed pad keepout in board coordinates.
     * @param {object} pad Normalized pad.
     * @param {'top' | 'bottom'} side Board face.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildPadCutout(pad, side) {
        const spec = PcbScene3dPadFactory.resolvePadSurfaceSpec(pad, side)
        const rotationRad = (Number(pad?.rotation || 0) * Math.PI) / 180
        const cosine = Math.cos(rotationRad)
        const sine = Math.sin(rotationRad)
        const centerX = Number(pad?.x || 0)
        const centerY = Number(pad?.y || 0)

        return PcbScene3dSilkscreenCopperCutoutBuilder.#buildPadLocalPoints(
            spec
        ).map((point) => {
            const x = point.x + spec.offsetX
            const y = point.y + spec.offsetY
            return {
                x: centerX + x * cosine - y * sine,
                y: centerY + x * sine + y * cosine
            }
        })
    }

    /**
     * Builds one circular via keepout in board coordinates.
     * @param {object} via Normalized via.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildViaCutout(via) {
        const radius = Math.max(Number(via?.diameter || 0) / 2, 0)
        const centerX = Number(via?.x || 0)
        const centerY = Number(via?.y || 0)

        return PcbScene3dSilkscreenCopperCutoutBuilder.#buildCirclePoints(
            radius
        ).map((point) => ({
            x: centerX + point.x,
            y: centerY + point.y
        }))
    }

    /**
     * Builds local outline points for one pad surface.
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', cornerRadius: number }} spec Pad surface.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildPadLocalPoints(spec) {
        if (spec.kind === 'circle') {
            return PcbScene3dSilkscreenCopperCutoutBuilder.#buildCirclePoints(
                Math.max(spec.width, spec.height) / 2
            )
        }

        if (spec.kind === 'rounded-rect') {
            return PcbScene3dSilkscreenCopperCutoutBuilder.#buildRoundedRectPoints(
                spec.width,
                spec.height,
                spec.cornerRadius
            )
        }

        return PcbScene3dSilkscreenCopperCutoutBuilder.#buildRectPoints(
            spec.width,
            spec.height
        )
    }

    /**
     * Builds local circular outline points.
     * @param {number} radius Circle radius.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildCirclePoints(radius) {
        return Array.from(
            {
                length: PcbScene3dSilkscreenCopperCutoutBuilder.#CIRCLE_SEGMENTS
            },
            (_, index) => {
                const angle =
                    (Math.PI * 2 * index) /
                    PcbScene3dSilkscreenCopperCutoutBuilder.#CIRCLE_SEGMENTS
                return {
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius
                }
            }
        )
    }

    /**
     * Builds local rectangular outline points.
     * @param {number} width Rectangle width.
     * @param {number} height Rectangle height.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildRectPoints(width, height) {
        const halfWidth = Math.max(Number(width || 0) / 2, 0)
        const halfHeight = Math.max(Number(height || 0) / 2, 0)
        return [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ]
    }

    /**
     * Builds local rounded-rectangle outline points.
     * @param {number} width Rectangle width.
     * @param {number} height Rectangle height.
     * @param {number} cornerRadius Corner radius.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildRoundedRectPoints(width, height, cornerRadius) {
        const halfWidth = Math.max(Number(width || 0) / 2, 0)
        const halfHeight = Math.max(Number(height || 0) / 2, 0)
        const radius = Math.min(
            Math.max(Number(cornerRadius || 0), 0),
            halfWidth,
            halfHeight
        )
        if (radius <= 0.001) {
            return PcbScene3dSilkscreenCopperCutoutBuilder.#buildRectPoints(
                width,
                height
            )
        }

        const corners = [
            {
                x: halfWidth - radius,
                y: halfHeight - radius,
                start: 0
            },
            {
                x: -halfWidth + radius,
                y: halfHeight - radius,
                start: Math.PI / 2
            },
            {
                x: -halfWidth + radius,
                y: -halfHeight + radius,
                start: Math.PI
            },
            {
                x: halfWidth - radius,
                y: -halfHeight + radius,
                start: (Math.PI * 3) / 2
            }
        ]
        const points = []

        corners.forEach((corner) => {
            for (
                let index = 0;
                index <
                PcbScene3dSilkscreenCopperCutoutBuilder
                    .#ROUNDED_CORNER_SEGMENTS;
                index += 1
            ) {
                const angle =
                    corner.start +
                    (Math.PI / 2) *
                        (index /
                            PcbScene3dSilkscreenCopperCutoutBuilder
                                .#ROUNDED_CORNER_SEGMENTS)
                points.push({
                    x: corner.x + Math.cos(angle) * radius,
                    y: corner.y + Math.sin(angle) * radius
                })
            }
        })

        return points
    }
}
