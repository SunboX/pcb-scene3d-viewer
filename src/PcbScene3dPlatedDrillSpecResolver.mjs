import { PcbScene3dDrillPathFactory } from './PcbScene3dDrillPathFactory.mjs'

/** Resolves the exact board-space drill descriptors that have copper annuli. */
export class PcbScene3dPlatedDrillSpecResolver {
    static #RECTANGULAR_HOLE_SHAPE = 1
    static #SLOTTED_HOLE_SHAPE = 2

    /**
     * Resolves deduplicated plated drill descriptors.
     * @param {{ pads?: any[], vias?: any[] }} detail Viewer PCB detail.
     * @returns {{ x: number, y: number, diameter: number, width?: number, height?: number, shape?: 'circle' | 'pill' | 'rect', slotLength?: number | null, rotationDeg?: number | null }[]} Plated drill descriptors.
     */
    static resolve(detail) {
        const platedKeys = new Set()

        for (const via of detail?.vias || []) {
            const diameter = Number(via?.holeDiameter || 0)
            if (diameter <= 0) continue
            platedKeys.add(
                PcbScene3dPlatedDrillSpecResolver.#key({
                    x: Number(via?.x || 0),
                    y: Number(via?.y || 0),
                    diameter,
                    width: diameter,
                    height: diameter,
                    shape: 'circle',
                    slotLength: null,
                    rotationDeg: 0
                })
            )
        }

        for (const pad of detail?.pads || []) {
            const diameter = Number(pad?.holeDiameter || 0)
            if (
                diameter <= 0 ||
                !PcbScene3dPlatedDrillSpecResolver.#hasCopperAnnulus(
                    pad,
                    diameter
                )
            ) {
                continue
            }
            const holeShape = Number(pad?.holeShape)
            const shape =
                holeShape ===
                PcbScene3dPlatedDrillSpecResolver.#RECTANGULAR_HOLE_SHAPE
                    ? 'rect'
                    : holeShape ===
                        PcbScene3dPlatedDrillSpecResolver.#SLOTTED_HOLE_SHAPE
                      ? 'pill'
                      : 'circle'
            const width = Number(pad?.holeWidth || diameter)
            const height = Number(pad?.holeHeight || diameter)
            const slotLength =
                shape === 'pill' && Number(pad?.holeSlotLength || 0) > diameter
                    ? Number(pad?.holeSlotLength || 0)
                    : null
            platedKeys.add(
                PcbScene3dPlatedDrillSpecResolver.#key({
                    x: Number(pad?.x || 0),
                    y: Number(pad?.y || 0),
                    diameter,
                    width,
                    height,
                    shape,
                    slotLength,
                    rotationDeg:
                        shape === 'circle'
                            ? 0
                            : PcbScene3dPlatedDrillSpecResolver.#normalizeAngle(
                                  Number(
                                      pad?.holeRotation ?? pad?.rotation ?? 0
                                  )
                              )
                })
            )
        }

        return PcbScene3dDrillPathFactory.resolveBoardDrillSpecs(detail).filter(
            (drillSpec) =>
                platedKeys.has(
                    PcbScene3dPlatedDrillSpecResolver.#key(drillSpec)
                )
        )
    }

    /**
     * Checks whether a through-hole pad has copper beyond its aperture.
     * @param {object} pad Viewer pad detail.
     * @param {number} diameter Drill diameter.
     * @returns {boolean} Whether copper surrounds the drill.
     */
    static #hasCopperAnnulus(pad, diameter) {
        const drillSpan = Math.max(
            diameter,
            Number(pad?.holeWidth || 0),
            Number(pad?.holeHeight || 0),
            Number(pad?.holeSlotLength || 0)
        )
        return [
            pad?.sizeTopX,
            pad?.sizeTopY,
            pad?.sizeMidX,
            pad?.sizeMidY,
            pad?.sizeBottomX,
            pad?.sizeBottomY
        ].some((size) => Number(size || 0) > drillSpan + 0.001)
    }

    /**
     * Builds a stable drill identity.
     * @param {object} drillSpec Drill descriptor.
     * @returns {string} Stable identity.
     */
    static #key(drillSpec) {
        return [
            Number(drillSpec.x || 0).toFixed(4),
            Number(drillSpec.y || 0).toFixed(4),
            Number(drillSpec.diameter || 0).toFixed(4),
            String(drillSpec.shape || 'circle'),
            Number(drillSpec.width || drillSpec.diameter || 0).toFixed(4),
            Number(drillSpec.height || drillSpec.diameter || 0).toFixed(4),
            Number(drillSpec.slotLength || 0).toFixed(4),
            Number(drillSpec.rotationDeg || 0).toFixed(4)
        ].join(':')
    }

    /**
     * Normalizes an angle to `[0, 360)`.
     * @param {number} angleDeg Raw angle.
     * @returns {number} Normalized angle.
     */
    static #normalizeAngle(angleDeg) {
        const normalized = Number(angleDeg || 0) % 360
        return normalized < 0 ? normalized + 360 : normalized
    }
}

Object.freeze(PcbScene3dPlatedDrillSpecResolver.prototype)
Object.freeze(PcbScene3dPlatedDrillSpecResolver)
