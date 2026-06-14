/**
 * Geometry helpers for PCB arc sweep calculations.
 */
export class PcbScene3dArcUtils {
    static #FULL_CIRCLE_EPSILON = 0.001

    /**
     * Resolves one arc record's sweep, preserving explicit long-arc sweeps.
     * @param {{ startAngle?: number, endAngle?: number, sweepAngle?: number }} arc
     * Arc record.
     * @returns {number}
     */
    static resolveArcSweepDelta(arc) {
        const sweepAngle = Number(arc?.sweepAngle)
        if (Number.isFinite(sweepAngle)) {
            return sweepAngle
        }

        return PcbScene3dArcUtils.resolveSweepDelta(
            Number(arc?.startAngle || 0),
            Number(arc?.endAngle || 0)
        )
    }

    /**
     * Normalizes one PCB arc delta to the intended short wrapped sweep.
     * @param {number} startAngle Start angle in degrees.
     * @param {number} endAngle End angle in degrees.
     * @returns {number}
     */
    static resolveSweepDelta(startAngle, endAngle) {
        const rawDelta = Number(endAngle || 0) - Number(startAngle || 0)
        let normalizedDelta = ((rawDelta + 540) % 360) - 180

        if (
            Math.abs(normalizedDelta + 180) <=
                PcbScene3dArcUtils.#FULL_CIRCLE_EPSILON &&
            rawDelta > 0
        ) {
            normalizedDelta = 180
        }

        return normalizedDelta
    }
}
