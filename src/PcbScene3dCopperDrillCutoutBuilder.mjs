import { PcbScene3dDrillPathFactory } from './PcbScene3dDrillPathFactory.mjs'

/**
 * Builds normalized board drill cutouts for copper surface meshes.
 */
export class PcbScene3dCopperDrillCutoutBuilder {
    static #DRILL_CUTOUT_SEGMENTS = 48
    static #SLOT_CAP_SEGMENTS = 12

    /**
     * Resolves board drill cutouts for copper fill apertures.
     * @param {{ pads?: any[], vias?: any[] }} detail Copper detail.
     * @param {(x: number, y: number) => { x: number, y: number }} [normalizeBoardPoint]
     * @param {boolean} [mirrorY] Whether to mirror underside primitives.
     * @returns {{ x: number, y: number }[][]}
     */
    static resolve(
        detail,
        normalizeBoardPoint = (x, y) => ({ x, y }),
        mirrorY = false
    ) {
        return PcbScene3dDrillPathFactory.resolveBoardDrillSpecs(detail)
            .map((drillSpec) =>
                PcbScene3dCopperDrillCutoutBuilder.#resolveCutoutPoints(
                    drillSpec,
                    normalizeBoardPoint,
                    mirrorY
                )
            )
            .filter((points) => points.length >= 3)
    }

    /**
     * Resolves cutouts from explicit options or fallback drill detail.
     * @param {{ drillCutouts?: any[], drillDetail?: object } | undefined} options
     * @param {{ pads?: any[], vias?: any[] }} fallbackDetail Fallback detail.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {boolean} mirrorY Whether to mirror underside primitives.
     * @returns {{ x: number, y: number }[][]}
     */
    static resolveFromOptions(
        options,
        fallbackDetail,
        normalizeBoardPoint,
        mirrorY
    ) {
        if (Array.isArray(options?.drillCutouts)) {
            return PcbScene3dCopperDrillCutoutBuilder.#normalizeCutouts(
                options.drillCutouts,
                normalizeBoardPoint,
                mirrorY
            )
        }

        return PcbScene3dCopperDrillCutoutBuilder.resolve(
            options?.drillDetail || fallbackDetail,
            normalizeBoardPoint,
            mirrorY
        )
    }

    /**
     * Resolves one drill cutout point loop.
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }} drillSpec
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {boolean} mirrorY Whether to mirror underside primitives.
     * @returns {{ x: number, y: number }[]}
     */
    static #resolveCutoutPoints(drillSpec, normalizeBoardPoint, mirrorY) {
        const points =
            Number(drillSpec?.slotLength || 0) >
            Number(drillSpec?.diameter || 0) + 0.001
                ? PcbScene3dCopperDrillCutoutBuilder.#buildSlotPoints(drillSpec)
                : PcbScene3dCopperDrillCutoutBuilder.#buildCirclePoints(
                      drillSpec
                  )

        return points.map((point) =>
            PcbScene3dCopperDrillCutoutBuilder.#normalizePoint(
                point,
                normalizeBoardPoint,
                mirrorY
            )
        )
    }

    /**
     * Normalizes cutout point loops.
     * @param {{ x?: number, y?: number }[][]} cutouts Cutout loops.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {boolean} mirrorY Whether to mirror underside primitives.
     * @returns {{ x: number, y: number }[][]}
     */
    static #normalizeCutouts(cutouts, normalizeBoardPoint, mirrorY) {
        return cutouts
            .map((cutout) =>
                (Array.isArray(cutout) ? cutout : []).map((point) =>
                    PcbScene3dCopperDrillCutoutBuilder.#normalizePoint(
                        point,
                        normalizeBoardPoint,
                        mirrorY
                    )
                )
            )
            .filter((cutout) => cutout.length >= 3)
    }

    /**
     * Normalizes one cutout point.
     * @param {{ x?: number, y?: number }} point Source point.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {boolean} mirrorY Whether to mirror underside primitives.
     * @returns {{ x: number, y: number }}
     */
    static #normalizePoint(point, normalizeBoardPoint, mirrorY) {
        const normalized = normalizeBoardPoint(
            Number(point?.x || 0),
            Number(point?.y || 0)
        )

        return {
            x: Number(normalized?.x || 0),
            y: mirrorY
                ? -Number(normalized?.y || 0)
                : Number(normalized?.y || 0)
        }
    }

    /**
     * Builds one sampled circular drill loop.
     * @param {{ x: number, y: number, diameter: number }} drillSpec Drill spec.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildCirclePoints(drillSpec) {
        const radius = Math.max(Number(drillSpec?.diameter || 0) / 2, 0.6)
        const centerX = Number(drillSpec?.x || 0)
        const centerY = Number(drillSpec?.y || 0)

        return Array.from(
            {
                length: PcbScene3dCopperDrillCutoutBuilder
                    .#DRILL_CUTOUT_SEGMENTS
            },
            (_, index) => {
                const angle =
                    (Math.PI * 2 * index) /
                    PcbScene3dCopperDrillCutoutBuilder.#DRILL_CUTOUT_SEGMENTS

                return {
                    x: centerX + Math.cos(angle) * radius,
                    y: centerY + Math.sin(angle) * radius
                }
            }
        )
    }

    /**
     * Builds one sampled slotted drill loop.
     * @param {{ x: number, y: number, diameter: number, slotLength?: number | null, rotationDeg?: number | null }} drillSpec Drill spec.
     * @returns {{ x: number, y: number }[]}
     */
    static #buildSlotPoints(drillSpec) {
        const diameter = Math.max(Number(drillSpec?.diameter || 0), 1.2)
        const radius = Math.max(diameter / 2, 0.6)
        const slotLength = Math.max(
            Number(drillSpec?.slotLength || 0),
            diameter
        )
        const straightHalf = Math.max(slotLength / 2 - radius, 0)
        const rotationRad =
            (Number(drillSpec?.rotationDeg || 0) * Math.PI) / 180
        const points = []

        PcbScene3dCopperDrillCutoutBuilder.#appendArcPoints(
            points,
            straightHalf,
            0,
            radius,
            -Math.PI / 2,
            Math.PI / 2
        )
        PcbScene3dCopperDrillCutoutBuilder.#appendArcPoints(
            points,
            -straightHalf,
            0,
            radius,
            Math.PI / 2,
            (Math.PI * 3) / 2,
            true
        )

        return points.map((point) =>
            PcbScene3dCopperDrillCutoutBuilder.#rotateAndTranslatePoint(
                point,
                rotationRad,
                Number(drillSpec?.x || 0),
                Number(drillSpec?.y || 0)
            )
        )
    }

    /**
     * Appends sampled points for one slot cap arc.
     * @param {{ x: number, y: number }[]} points Output point list.
     * @param {number} cx Arc center X.
     * @param {number} cy Arc center Y.
     * @param {number} radius Arc radius.
     * @param {number} startAngle Start angle in radians.
     * @param {number} endAngle End angle in radians.
     * @param {boolean} [skipFirst] Whether to skip the first sample.
     * @returns {void}
     */
    static #appendArcPoints(
        points,
        cx,
        cy,
        radius,
        startAngle,
        endAngle,
        skipFirst = false
    ) {
        for (
            let index = 0;
            index <= PcbScene3dCopperDrillCutoutBuilder.#SLOT_CAP_SEGMENTS;
            index += 1
        ) {
            if (skipFirst && index === 0) {
                continue
            }

            const t =
                index / PcbScene3dCopperDrillCutoutBuilder.#SLOT_CAP_SEGMENTS
            const angle = startAngle + (endAngle - startAngle) * t
            points.push({
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius
            })
        }
    }

    /**
     * Rotates one local point around the origin and translates it into place.
     * @param {{ x: number, y: number }} point Local point.
     * @param {number} rotationRad Rotation in radians.
     * @param {number} dx Translation X.
     * @param {number} dy Translation Y.
     * @returns {{ x: number, y: number }}
     */
    static #rotateAndTranslatePoint(point, rotationRad, dx, dy) {
        const cos = Math.cos(rotationRad)
        const sin = Math.sin(rotationRad)

        return {
            x: point.x * cos - point.y * sin + dx,
            y: point.x * sin + point.y * cos + dy
        }
    }
}
