import { CircuitJsonUnits } from 'circuitjson-toolkit'

/**
 * Normalizes CAD component model placement hints from CircuitJSON.
 */
export class PcbScene3dCircuitJsonModelTransform {
    /**
     * Builds optional model-local transforms.
     * @param {object} cadComponent CAD component element.
     * @returns {object | null}
     */
    static build(cadComponent) {
        const offset = cadComponent?.model_offset || cadComponent?.offset
        const rotation =
            cadComponent?.model_rotation || cadComponent?.model_rotation_deg
        const rawScale = cadComponent?.model_scale
        const unitScale = PcbScene3dCircuitJsonModelTransform.#positiveFinite(
            cadComponent?.model_unit_to_mm_scale_factor,
            1
        )
        const originPositionMil =
            PcbScene3dCircuitJsonModelTransform.#pointMmToMil(
                cadComponent?.model_origin_position
            )
        const originAlignment =
            PcbScene3dCircuitJsonModelTransform.#stringValue(
                cadComponent?.model_origin_alignment
            )
        const objectFit = PcbScene3dCircuitJsonModelTransform.#stringValue(
            cadComponent?.model_object_fit
        )
        const boardNormalDirection =
            PcbScene3dCircuitJsonModelTransform.#stringValue(
                cadComponent?.model_board_normal_direction
            )
        const targetSizeMil = PcbScene3dCircuitJsonModelTransform.#sizeMmToMil(
            cadComponent?.model_size || cadComponent?.size
        )

        if (
            !offset &&
            !rotation &&
            rawScale === undefined &&
            unitScale === 1 &&
            !originPositionMil &&
            !originAlignment &&
            !objectFit &&
            !boardNormalDirection &&
            !targetSizeMil
        ) {
            return null
        }

        return {
            offsetMil: PcbScene3dCircuitJsonModelTransform.#offsetMil(offset),
            rotationDeg:
                PcbScene3dCircuitJsonModelTransform.#rotationDeg(rotation),
            scale: PcbScene3dCircuitJsonModelTransform.#modelScale(
                rawScale,
                unitScale
            ),
            ...PcbScene3dCircuitJsonModelTransform.#optionalFields({
                originPositionMil,
                originAlignment,
                objectFit,
                boardNormalDirection,
                targetSizeMil
            })
        }
    }

    /**
     * Builds display metadata for a CAD component placement.
     * @param {object} cadComponent CAD component element.
     * @returns {{ bodyOpacity?: number }}
     */
    static displayMetadata(cadComponent) {
        const opacity =
            PcbScene3dCircuitJsonModelTransform.#displayOpacity(cadComponent)
        return opacity === null ? {} : { bodyOpacity: opacity }
    }

    /**
     * Builds optional transform fields from populated metadata.
     * @param {object} fields Candidate optional fields.
     * @returns {object}
     */
    static #optionalFields(fields) {
        return Object.fromEntries(
            Object.entries(fields).filter((entry) => entry[1] !== null)
        )
    }

    /**
     * Resolves model-local offset fields in mils.
     * @param {object | undefined} offset Offset source in millimeters.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #offsetMil(offset) {
        return {
            x: CircuitJsonUnits.mmToMil(offset?.x, 0),
            y: CircuitJsonUnits.mmToMil(offset?.y, 0),
            z: CircuitJsonUnits.mmToMil(offset?.z, 0)
        }
    }

    /**
     * Resolves model-local rotation fields.
     * @param {object | number | undefined} rotation Rotation metadata.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #rotationDeg(rotation) {
        if (typeof rotation === 'number') {
            return { x: 0, y: 0, z: Number(rotation || 0) }
        }

        return {
            x: Number(rotation?.x || 0),
            y: Number(rotation?.y || 0),
            z: Number(rotation?.z || 0)
        }
    }

    /**
     * Normalizes model scale fields and unit scale.
     * @param {unknown} scale Scale metadata.
     * @param {number} unitScale Unit-to-millimeter scale factor.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #modelScale(scale, unitScale) {
        if (typeof scale === 'number') {
            const value = Number(scale) || 1
            return {
                x: value * unitScale,
                y: value * unitScale,
                z: value * unitScale
            }
        }

        return {
            x: (Number(scale?.x ?? 1) || 1) * unitScale,
            y: (Number(scale?.y ?? 1) || 1) * unitScale,
            z: (Number(scale?.z ?? 1) || 1) * unitScale
        }
    }

    /**
     * Converts an optional point from millimeters to mils.
     * @param {object | undefined} point Point metadata.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #pointMmToMil(point) {
        if (
            !Number.isFinite(Number(point?.x)) &&
            !Number.isFinite(Number(point?.y)) &&
            !Number.isFinite(Number(point?.z))
        ) {
            return null
        }

        return {
            x: CircuitJsonUnits.mmToMil(point?.x, 0),
            y: CircuitJsonUnits.mmToMil(point?.y, 0),
            z: CircuitJsonUnits.mmToMil(point?.z, 0)
        }
    }

    /**
     * Converts optional model target size from millimeters to mils.
     * @param {object | undefined} size Size metadata.
     * @returns {{ x: number, y: number, z: number } | null}
     */
    static #sizeMmToMil(size) {
        const x = size?.x ?? size?.width
        const y = size?.y ?? size?.height
        const z = size?.z ?? size?.depth
        if (
            !Number.isFinite(Number(x)) &&
            !Number.isFinite(Number(y)) &&
            !Number.isFinite(Number(z))
        ) {
            return null
        }

        return {
            x: CircuitJsonUnits.mmToMil(x, 0),
            y: CircuitJsonUnits.mmToMil(y, 0),
            z: CircuitJsonUnits.mmToMil(z, 0)
        }
    }

    /**
     * Resolves optional display opacity.
     * @param {object} cadComponent CAD component element.
     * @returns {number | null}
     */
    static #displayOpacity(cadComponent) {
        for (const value of [
            cadComponent?.bodyOpacity,
            cadComponent?.body_opacity,
            cadComponent?.model_opacity
        ]) {
            const opacity = Number(value)
            if (Number.isFinite(opacity) && opacity > 0 && opacity < 1) {
                return opacity
            }
        }

        return cadComponent?.show_as_translucent_model === true ? 0.5 : null
    }

    /**
     * Returns a non-empty string or null.
     * @param {unknown} value Candidate string value.
     * @returns {string | null}
     */
    static #stringValue(value) {
        const text = String(value || '').trim()
        return text ? text : null
    }

    /**
     * Returns a positive finite number or fallback.
     * @param {unknown} value Candidate value.
     * @param {number} fallback Fallback value.
     * @returns {number}
     */
    static #positiveFinite(value, fallback) {
        const number = Number(value)
        return Number.isFinite(number) && number > 0 ? number : fallback
    }
}
