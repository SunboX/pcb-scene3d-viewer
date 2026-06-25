import { CircuitJsonUnits } from 'circuitjson-toolkit'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'

/**
 * Converts CircuitJSON copper pour elements into scene copper polygons.
 */
export class PcbScene3dCircuitJsonCopperPourBuilder {
    /**
     * Builds renderer-ready copper pour primitives.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static build(index) {
        return (index.elementsByType.get('pcb_copper_pour') || [])
            .map((pour, pourIndex) =>
                PcbScene3dCircuitJsonCopperPourBuilder.#buildPour(
                    pour,
                    pourIndex
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one copper pour primitive.
     * @param {object} pour CircuitJSON copper pour element.
     * @param {number} pourIndex Source element index.
     * @returns {object | null}
     */
    static #buildPour(pour, pourIndex) {
        const geometry =
            PcbScene3dCircuitJsonCopperPourBuilder.#buildGeometry(pour)
        if (!geometry) {
            return null
        }

        const side = PcbScene3dCircuitJsonLayer.side(pour?.layer)
        const covered =
            PcbScene3dCircuitJsonCopperPourBuilder.#isCoveredWithMask(pour)

        return {
            sourceId: PcbScene3dCircuitJsonCopperPourBuilder.#sourceId(
                pour,
                pourIndex
            ),
            layer: side,
            layerId: PcbScene3dCircuitJsonLayer.layerId(side),
            hasSolderMask: covered,
            solderMaskOpening: !covered,
            ...geometry
        }
    }

    /**
     * Builds geometry metadata for one copper pour.
     * @param {object} pour CircuitJSON copper pour element.
     * @returns {object | null}
     */
    static #buildGeometry(pour) {
        const brepGeometry =
            PcbScene3dCircuitJsonCopperPourBuilder.#brepGeometry(pour)
        if (brepGeometry) {
            return brepGeometry
        }

        const points =
            PcbScene3dCircuitJsonCopperPourBuilder.#polygonPoints(pour)
        if (points.length >= 3) {
            return { points }
        }

        const rectangle =
            PcbScene3dCircuitJsonCopperPourBuilder.#rectanglePoints(pour)
        return rectangle.length >= 3 ? { points: rectangle } : null
    }

    /**
     * Builds normalized B-Rep geometry metadata.
     * @param {object} pour CircuitJSON copper pour element.
     * @returns {object | null}
     */
    static #brepGeometry(pour) {
        const shapes = PcbScene3dCircuitJsonCopperPourBuilder.#array(
            pour?.brep_shapes ||
                pour?.brepShapes ||
                pour?.brep_shape_array ||
                pour?.brepShapeArray
        )
            .map((shape) =>
                PcbScene3dCircuitJsonCopperPourBuilder.#normalizeBrepShape(
                    shape
                )
            )
            .filter(Boolean)

        if (shapes.length) {
            return { brep_shapes: shapes }
        }

        const shape =
            PcbScene3dCircuitJsonCopperPourBuilder.#normalizeBrepShape(
                pour?.brep_shape || pour?.brepShape
            )
        return shape ? { brep_shape: shape } : null
    }

    /**
     * Normalizes one B-Rep shape from millimeters to mils.
     * @param {object | undefined} shape Source B-Rep shape.
     * @returns {object | null}
     */
    static #normalizeBrepShape(shape) {
        if (!shape) {
            return null
        }

        const outerRing =
            PcbScene3dCircuitJsonCopperPourBuilder.#normalizeBrepRing(
                shape.outer_ring ||
                    shape.outerRing ||
                    shape.outer ||
                    shape.outer_loop ||
                    shape.outerLoop
            )
        if (!outerRing) {
            return null
        }

        return {
            outer_ring: outerRing,
            inner_rings: PcbScene3dCircuitJsonCopperPourBuilder.#array(
                shape.inner_rings ||
                    shape.innerRings ||
                    shape.holes ||
                    shape.inner ||
                    shape.cutouts
            )
                .map((ring) =>
                    PcbScene3dCircuitJsonCopperPourBuilder.#normalizeBrepRing(
                        ring
                    )
                )
                .filter(Boolean)
        }
    }

    /**
     * Normalizes one B-Rep ring from millimeters to mils.
     * @param {object | object[]} ring Source ring.
     * @returns {{ vertices: object[] } | null}
     */
    static #normalizeBrepRing(ring) {
        const vertices = PcbScene3dCircuitJsonCopperPourBuilder.#array(
            ring?.vertices ||
                ring?.cwVertices ||
                ring?.cw_vertices ||
                ring?.points ||
                ring
        )
            .map((point) =>
                PcbScene3dCircuitJsonCopperPourBuilder.#pointWithBulge(point)
            )
            .filter(Boolean)

        return vertices.length >= 3 ? { vertices } : null
    }

    /**
     * Resolves polygon loop points from a copper pour.
     * @param {object} pour CircuitJSON copper pour element.
     * @returns {{ x: number, y: number }[]}
     */
    static #polygonPoints(pour) {
        return PcbScene3dCircuitJsonCopperPourBuilder.#array(
            pour?.points || pour?.vertices || pour?.polygon
        )
            .map((point) =>
                PcbScene3dCircuitJsonCopperPourBuilder.#point(point)
            )
            .filter(Boolean)
    }

    /**
     * Resolves rotated rectangular copper pour points.
     * @param {object} pour CircuitJSON copper pour element.
     * @returns {{ x: number, y: number }[]}
     */
    static #rectanglePoints(pour) {
        const width = PcbScene3dCircuitJsonCopperPourBuilder.#positiveMmToMil(
            pour?.width
        )
        const height = PcbScene3dCircuitJsonCopperPourBuilder.#positiveMmToMil(
            pour?.height
        )
        const center = PcbScene3dCircuitJsonCopperPourBuilder.#point(
            pour?.center || {
                x: pour?.x,
                y: pour?.y
            }
        )
        if (!center || width <= 0 || height <= 0) {
            return []
        }

        const angle =
            (Number(pour?.rotation ?? pour?.ccw_rotation ?? 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return [
            { x: -width / 2, y: -height / 2 },
            { x: width / 2, y: -height / 2 },
            { x: width / 2, y: height / 2 },
            { x: -width / 2, y: height / 2 }
        ].map((point) => ({
            x: center.x + point.x * cos - point.y * sin,
            y: center.y + point.x * sin + point.y * cos
        }))
    }

    /**
     * Converts one point from millimeters to mils.
     * @param {unknown} point Candidate point.
     * @returns {{ x: number, y: number } | null}
     */
    static #point(point) {
        const x = Array.isArray(point) ? point[0] : point?.x
        const y = Array.isArray(point) ? point[1] : point?.y
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
            return null
        }

        return {
            x: CircuitJsonUnits.mmToMil(x, 0),
            y: CircuitJsonUnits.mmToMil(y, 0)
        }
    }

    /**
     * Converts one B-Rep vertex from millimeters to mils.
     * @param {unknown} point Candidate vertex.
     * @returns {{ x: number, y: number, bulge?: number } | null}
     */
    static #pointWithBulge(point) {
        const normalized = PcbScene3dCircuitJsonCopperPourBuilder.#point(point)
        if (!normalized) {
            return null
        }

        const bulge = Number(Array.isArray(point) ? point[2] : point?.bulge)
        return Number.isFinite(bulge) ? { ...normalized, bulge } : normalized
    }

    /**
     * Resolves whether one pour is covered by solder mask.
     * @param {object} pour CircuitJSON copper pour element.
     * @returns {boolean}
     */
    static #isCoveredWithMask(pour) {
        const value = pour?.covered_with_solder_mask
        return value === true || String(value).toLowerCase() === 'true'
    }

    /**
     * Resolves a stable source ID for one pour.
     * @param {object} pour CircuitJSON copper pour element.
     * @param {number} pourIndex Source element index.
     * @returns {string}
     */
    static #sourceId(pour, pourIndex) {
        return String(
            pour?.pcb_copper_pour_id ||
                pour?.copper_pour_id ||
                pour?.id ||
                `pcb_copper_pour_${pourIndex + 1}`
        )
    }

    /**
     * Converts a positive millimeter value to mils.
     * @param {unknown} value Candidate value.
     * @returns {number}
     */
    static #positiveMmToMil(value) {
        const number = Number(value)
        return Number.isFinite(number) && number > 0
            ? CircuitJsonUnits.mmToMil(number, 0)
            : 0
    }

    /**
     * Normalizes a value to an array.
     * @param {unknown} value Candidate value.
     * @returns {any[]}
     */
    static #array(value) {
        return Array.isArray(value) ? value : []
    }
}
