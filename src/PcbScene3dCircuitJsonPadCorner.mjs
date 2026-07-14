import { CircuitJsonUnits } from 'circuitjson-toolkit'

const RECTANGULAR_PAD_SHAPE = 2

/**
 * Normalizes CircuitJSON rounded-pad metadata for scene pad faces.
 */
export class PcbScene3dCircuitJsonPadCorner {
    /**
     * Builds rounded-rectangle metadata for one or both pad faces.
     * @param {object} pad Pad element.
     * @param {{ width: number, height: number }} size Pad copper size in mils.
     * @param {boolean | null} isBottom Bottom side, or null for both sides.
     * @returns {object}
     */
    static metadata(pad, size, isBottom) {
        if (
            !String(pad?.shape || '').endsWith('pill') &&
            !(PcbScene3dCircuitJsonPadCorner.#radius(pad) > 0)
        ) {
            return {}
        }
        const cornerRadius =
            PcbScene3dCircuitJsonPadCorner.#cornerRadiusPercent(pad, size)
        const hasTop = isBottom !== true
        const hasBottom = isBottom !== false
        return {
            hasRoundedRect: true,
            roundedRectShapeTop: hasTop ? RECTANGULAR_PAD_SHAPE : null,
            roundedRectShapeBottom: hasBottom ? RECTANGULAR_PAD_SHAPE : null,
            cornerRadiusTop: hasTop ? cornerRadius : null,
            cornerRadiusBottom: hasBottom ? cornerRadius : null
        }
    }

    /**
     * Resolves a corner radius as a percentage of the shortest pad side.
     * @param {object} pad Pad element.
     * @param {{ width: number, height: number }} size Pad copper size in mils.
     * @returns {number}
     */
    static #cornerRadiusPercent(pad, size) {
        const width = CircuitJsonUnits.optionalLength(pad?.width)
        const height = CircuitJsonUnits.optionalLength(pad?.height)
        const radius = PcbScene3dCircuitJsonPadCorner.#radius(pad)
        if (width > 0 && height > 0 && radius > 0) {
            return Math.min((radius / Math.min(width, height)) * 100, 50)
        }

        const shortestSide = Math.min(Number(size.width), Number(size.height))
        const radiusMil = CircuitJsonUnits.mmToMil(radius, 0)
        if (shortestSide > 0 && radiusMil > 0) {
            return Math.min((radiusMil / shortestSide) * 100, 50)
        }

        return 50
    }

    /**
     * Resolves canonical and compatibility corner-radius fields.
     * @param {object} pad Pad element.
     * @returns {number}
     */
    static #radius(pad) {
        return CircuitJsonUnits.optionalLength(
            pad?.radius ??
                pad?.corner_radius ??
                pad?.rect_border_radius ??
                pad?.cornerRadius
        )
    }
}
