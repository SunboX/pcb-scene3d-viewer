import { CircuitJsonUnits } from 'circuitjson-toolkit'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'
import { PcbScene3dViaLayerSpan } from './PcbScene3dViaLayerSpan.mjs'

/**
 * Converts CircuitJSON trace routes into scene copper tracks and vias.
 */
export class PcbScene3dCircuitJsonTraceRouteBuilder {
    /**
     * Builds via detail primitives from standalone vias and route via entries.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static buildVias(index) {
        return [
            ...PcbScene3dCircuitJsonTraceRouteBuilder.#standaloneVias(index),
            ...PcbScene3dCircuitJsonTraceRouteBuilder.#routeVias(index)
        ]
    }

    /**
     * Builds copper track detail primitives from trace routes.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static buildTracks(index) {
        const tracks = []
        ;(index.elementsByType.get('pcb_trace') || []).forEach((trace) => {
            const route = Array.isArray(trace?.route) ? trace.route : []
            route
                .map((entry) =>
                    PcbScene3dCircuitJsonTraceRouteBuilder.#throughPadTrack(
                        entry,
                        trace
                    )
                )
                .filter(Boolean)
                .forEach((track) => tracks.push(track))
            for (let index = 0; index < route.length - 1; index += 1) {
                const track =
                    PcbScene3dCircuitJsonTraceRouteBuilder.#trackFromPair(
                        route[index],
                        route[index + 1],
                        trace
                    )
                if (track) {
                    tracks.push(track)
                }
            }
        })
        return tracks
    }

    /**
     * Builds a surface track from one through-pad route entry.
     * @param {object} entry Route entry.
     * @param {object} trace Parent trace.
     * @returns {object | null}
     */
    static #throughPadTrack(entry, trace) {
        if (
            PcbScene3dCircuitJsonTraceRouteBuilder.#routeType(entry) !==
            'through_pad'
        ) {
            return null
        }
        const start = PcbScene3dCircuitJsonTraceRouteBuilder.#point(
            entry?.start
        )
        const end = PcbScene3dCircuitJsonTraceRouteBuilder.#point(entry?.end)
        const side = PcbScene3dCircuitJsonTraceRouteBuilder.#throughPadSide(
            entry,
            trace
        )
        if (!start || !end || !side) {
            return null
        }

        return {
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            width: CircuitJsonUnits.mmToMil(
                entry?.width ?? trace?.width,
                0.1524
            ),
            layerId: PcbScene3dCircuitJsonLayer.layerId(side),
            solderMaskOpening:
                PcbScene3dCircuitJsonTraceRouteBuilder.#solderMaskOpening(
                    entry,
                    trace
                )
        }
    }

    /**
     * Builds standalone `pcb_via` primitives.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static #standaloneVias(index) {
        return (index.elementsByType.get('pcb_via') || []).map((via) => {
            const isTented =
                PcbScene3dCircuitJsonTraceRouteBuilder.#isSolderMaskCovered(via)
            return {
                x: CircuitJsonUnits.mmToMil(via?.x, 0),
                y: CircuitJsonUnits.mmToMil(via?.y, 0),
                diameter: CircuitJsonUnits.mmToMil(
                    via?.outer_diameter ?? via?.diameter ?? via?.via_diameter,
                    0
                ),
                holeDiameter: CircuitJsonUnits.mmToMil(
                    via?.hole_diameter ?? via?.via_hole_diameter,
                    0
                ),
                isTentingTop: isTented,
                isTentingBottom: isTented,
                ...PcbScene3dViaLayerSpan.fields(via)
            }
        })
    }

    /**
     * Builds via primitives embedded inside trace routes.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static #routeVias(index) {
        const vias = []
        ;(index.elementsByType.get('pcb_trace') || []).forEach((trace) => {
            const route = Array.isArray(trace?.route) ? trace.route : []
            route.forEach((entry) => {
                if (
                    PcbScene3dCircuitJsonTraceRouteBuilder.#routeType(entry) !==
                        'via' ||
                    !PcbScene3dCircuitJsonTraceRouteBuilder.#touchesSurface(
                        entry
                    )
                ) {
                    return
                }
                vias.push(
                    PcbScene3dCircuitJsonTraceRouteBuilder.#routeVia(entry)
                )
            })
        })
        return vias
    }

    /**
     * Builds one route via primitive.
     * @param {object} via Route via entry.
     * @returns {object}
     */
    static #routeVia(via) {
        const diameter = CircuitJsonUnits.mmToMil(
            via?.via_diameter ?? via?.diameter ?? via?.outer_diameter,
            0
        )
        const holeDiameter =
            CircuitJsonUnits.mmToMil(
                via?.hole_diameter ??
                    via?.via_hole_diameter ??
                    via?.drill_diameter,
                0
            ) || diameter / 2
        const isTented =
            PcbScene3dCircuitJsonTraceRouteBuilder.#isSolderMaskCovered(via)

        return {
            x: CircuitJsonUnits.mmToMil(via?.x, 0),
            y: CircuitJsonUnits.mmToMil(via?.y, 0),
            diameter,
            holeDiameter,
            isTentingTop: isTented,
            isTentingBottom: isTented,
            ...PcbScene3dViaLayerSpan.fields(via)
        }
    }

    /**
     * Builds a copper track from one adjacent route pair when visible.
     * @param {object} start Start route entry.
     * @param {object} end End route entry.
     * @param {object} trace Parent trace.
     * @returns {object | null}
     */
    static #trackFromPair(start, end, trace) {
        const side = PcbScene3dCircuitJsonTraceRouteBuilder.#trackSide(
            start,
            end,
            trace
        )
        if (!side) {
            return null
        }

        return {
            x1: CircuitJsonUnits.mmToMil(start?.x, 0),
            y1: CircuitJsonUnits.mmToMil(start?.y, 0),
            x2: CircuitJsonUnits.mmToMil(end?.x, 0),
            y2: CircuitJsonUnits.mmToMil(end?.y, 0),
            width: CircuitJsonUnits.mmToMil(
                start?.width ?? end?.width ?? trace?.width,
                0.1524
            ),
            layerId: PcbScene3dCircuitJsonLayer.layerId(side),
            solderMaskOpening:
                PcbScene3dCircuitJsonTraceRouteBuilder.#solderMaskOpening(
                    start,
                    end,
                    trace
                )
        }
    }

    /**
     * Resolves the visible outer side for one adjacent route pair.
     * @param {object} start Start route entry.
     * @param {object} end End route entry.
     * @param {object} trace Parent trace.
     * @returns {'top' | 'bottom' | null}
     */
    static #trackSide(start, end, trace) {
        const startType =
            PcbScene3dCircuitJsonTraceRouteBuilder.#routeType(start)
        const endType = PcbScene3dCircuitJsonTraceRouteBuilder.#routeType(end)

        if (startType === 'wire' && endType === 'wire') {
            return PcbScene3dCircuitJsonTraceRouteBuilder.#trackLayerSide(
                start?.layer ?? end?.layer ?? trace?.layer
            )
        }
        if (startType === 'wire' && endType === 'via') {
            return PcbScene3dCircuitJsonTraceRouteBuilder.#trackLayerSide(
                start?.layer ?? trace?.layer
            )
        }
        if (startType === 'via' && endType === 'wire') {
            return PcbScene3dCircuitJsonTraceRouteBuilder.#trackLayerSide(
                end?.layer ?? trace?.layer
            )
        }
        return null
    }

    /**
     * Resolves the visible side for one through-pad route.
     * @param {object} entry Through-pad route entry.
     * @param {object} trace Parent trace.
     * @returns {'top' | 'bottom' | null}
     */
    static #throughPadSide(entry, trace) {
        return (
            PcbScene3dCircuitJsonTraceRouteBuilder.#surfaceLayerSide(
                entry?.start_layer
            ) ||
            PcbScene3dCircuitJsonTraceRouteBuilder.#surfaceLayerSide(
                entry?.end_layer
            ) ||
            PcbScene3dCircuitJsonTraceRouteBuilder.#trackLayerSide(trace?.layer)
        )
    }

    /**
     * Resolves an explicit outer copper side without defaulting unknown layers.
     * @param {unknown} layer Layer value.
     * @returns {'top' | 'bottom' | null}
     */
    static #surfaceLayerSide(layer) {
        return PcbScene3dCircuitJsonLayer.surfaceSide(layer)
    }

    /**
     * Resolves a track layer while preserving the prior top-side default.
     * @param {unknown} layer Layer value.
     * @returns {'top' | 'bottom' | null}
     */
    static #trackLayerSide(layer) {
        if (PcbScene3dCircuitJsonLayer.isInner(layer)) {
            return null
        }
        return (
            PcbScene3dCircuitJsonLayer.surfaceSide(layer) ||
            PcbScene3dCircuitJsonLayer.side(layer)
        )
    }

    /**
     * Returns true when a route via connects to an outer copper layer.
     * @param {object} via Route via entry.
     * @returns {boolean}
     */
    static #touchesSurface(via) {
        return PcbScene3dViaLayerSpan.surfaceSides(via).length > 0
    }

    /**
     * Resolves the route entry type.
     * @param {object} entry Route entry.
     * @returns {string}
     */
    static #routeType(entry) {
        return String(entry?.route_type || 'wire')
    }

    /**
     * Checks whether a via is covered by solder mask.
     * @param {object} via CircuitJSON via or route-via element.
     * @returns {boolean}
     */
    static #isSolderMaskCovered(via) {
        if (typeof via?.is_tented === 'boolean') {
            return via.is_tented
        }
        return (
            PcbScene3dCircuitJsonTraceRouteBuilder.#solderMaskCoveredValue(
                via
            ) ?? true
        )
    }

    /**
     * Resolves whether trace-like copper has an explicitly authored opening.
     * @param {...object} elements Route entries followed by their trace.
     * @returns {boolean}
     */
    static #solderMaskOpening(...elements) {
        for (const element of elements) {
            const covered =
                PcbScene3dCircuitJsonTraceRouteBuilder.#solderMaskCoveredValue(
                    element
                )
            if (covered !== null) return !covered
        }
        return false
    }

    /**
     * Reads one explicit solder-mask coverage value.
     * @param {object} element CircuitJSON copper element.
     * @returns {boolean | null}
     */
    static #solderMaskCoveredValue(element) {
        const value =
            element?.is_covered_with_solder_mask ??
            element?.covered_with_solder_mask
        if (typeof value === 'boolean') return value
        if (value === undefined || value === null || value === '') return null

        const text = String(value).trim().toLowerCase()
        if (text === 'true') return true
        if (text === 'false') return false
        return null
    }

    /**
     * Converts a route point from millimeters to mils.
     * @param {object | undefined} point Source point.
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
