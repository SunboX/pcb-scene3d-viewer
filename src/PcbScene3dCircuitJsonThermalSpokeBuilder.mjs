import { CircuitJsonUnits } from 'circuitjson-toolkit'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'

/**
 * Converts thermal-spoke metadata into surface copper track details.
 */
export class PcbScene3dCircuitJsonThermalSpokeBuilder {
    /**
     * Builds thermal spoke tracks around referenced plated holes.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static build(index) {
        const holeById = PcbScene3dCircuitJsonThermalSpokeBuilder.#elementById(
            index,
            'pcb_plated_hole',
            'pcb_plated_hole_id'
        )
        const regionsByPlaneId =
            PcbScene3dCircuitJsonThermalSpokeBuilder.#regionsByPlaneId(index)

        return (index.elementsByType.get('pcb_thermal_spoke') || []).flatMap(
            (spoke) =>
                PcbScene3dCircuitJsonThermalSpokeBuilder.#spokeTracks(
                    spoke,
                    holeById,
                    regionsByPlaneId
                )
        )
    }

    /**
     * Builds tracks for one thermal-spoke row.
     * @param {object} spoke Thermal spoke row.
     * @param {Map<string, object>} holeById Plated-hole lookup.
     * @param {Map<string, object[]>} regionsByPlaneId Ground-plane regions.
     * @returns {object[]}
     */
    static #spokeTracks(spoke, holeById, regionsByPlaneId) {
        const hole = holeById.get(String(spoke?.pcb_plated_hole_id || ''))
        const center = PcbScene3dCircuitJsonThermalSpokeBuilder.#point({
            x: hole?.x ?? spoke?.x,
            y: hole?.y ?? spoke?.y
        })
        const side = PcbScene3dCircuitJsonThermalSpokeBuilder.#spokeSide(
            spoke,
            hole,
            regionsByPlaneId
        )
        const count = Math.max(1, Math.round(Number(spoke?.spoke_count || 0)))
        const width = CircuitJsonUnits.mmToMil(spoke?.spoke_thickness, 0)
        const innerRadius = CircuitJsonUnits.mmToMil(
            Number(spoke?.spoke_inner_diameter || 0) / 2,
            0
        )
        const outerRadius = CircuitJsonUnits.mmToMil(
            Number(spoke?.spoke_outer_diameter || 0) / 2,
            0
        )
        if (
            !center ||
            !side ||
            count <= 0 ||
            width <= 0 ||
            outerRadius <= innerRadius
        ) {
            return []
        }

        const rotation =
            (Number(spoke?.rotation ?? spoke?.ccw_rotation ?? 0) * Math.PI) /
            180
        return Array.from({ length: count }, (_entry, index) => {
            const angle = rotation + (Math.PI * 2 * index) / count
            const cos = Math.cos(angle)
            const sin = Math.sin(angle)
            return {
                sourceType: 'pcb_thermal_spoke',
                sourceId: String(spoke?.pcb_thermal_spoke_id || ''),
                x1: center.x + cos * innerRadius,
                y1: center.y + sin * innerRadius,
                x2: center.x + cos * outerRadius,
                y2: center.y + sin * outerRadius,
                width,
                layerId: PcbScene3dCircuitJsonLayer.layerId(side),
                solderMaskOpening: true
            }
        })
    }

    /**
     * Resolves the surface side for a thermal spoke.
     * @param {object} spoke Thermal spoke row.
     * @param {object | undefined} hole Referenced plated hole.
     * @param {Map<string, object[]>} regionsByPlaneId Ground-plane regions.
     * @returns {'top' | 'bottom' | null}
     */
    static #spokeSide(spoke, hole, regionsByPlaneId) {
        const regions =
            regionsByPlaneId.get(String(spoke?.pcb_ground_plane_id || '')) || []
        return (
            regions
                .map((region) =>
                    PcbScene3dCircuitJsonLayer.surfaceSide(region?.layer)
                )
                .find(Boolean) ||
            PcbScene3dCircuitJsonLayer.surfaceSide(spoke?.layer) ||
            PcbScene3dCircuitJsonLayer.surfaceSide(hole?.layer) ||
            PcbScene3dCircuitJsonLayer.surfaceSide(hole?.layers?.[0]) ||
            'top'
        )
    }

    /**
     * Builds a map keyed by an element id field.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {string} type Element type.
     * @param {string} idField Element id field.
     * @returns {Map<string, object>}
     */
    static #elementById(index, type, idField) {
        const map = new Map()
        ;(index.elementsByType.get(type) || []).forEach((element) => {
            const id = String(element?.[idField] || '')
            if (id) {
                map.set(id, element)
            }
        })
        return map
    }

    /**
     * Builds ground-plane region rows keyed by parent ground-plane id.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {Map<string, object[]>}
     */
    static #regionsByPlaneId(index) {
        const map = new Map()
        ;(index.elementsByType.get('pcb_ground_plane_region') || []).forEach(
            (region) => {
                const id = String(region?.pcb_ground_plane_id || '')
                if (!id) {
                    return
                }
                map.set(id, [...(map.get(id) || []), region])
            }
        )
        return map
    }

    /**
     * Converts a point from millimeters to mils.
     * @param {object} point Source point.
     * @returns {{ x: number, y: number } | null}
     */
    static #point(point) {
        const x = Number(point?.x)
        const y = Number(point?.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null
        }
        return {
            x: CircuitJsonUnits.mmToMil(x, 0),
            y: CircuitJsonUnits.mmToMil(y, 0)
        }
    }
}
