import { DocumentResult } from 'circuitjson-toolkit/parser'

/**
 * Builds canonical KiCad copper with omitted and explicit mask openings.
 * @returns {object}
 */
export function createCanonicalKicadMaskDocument() {
    const trace = (id, y, covered) => ({
        type: 'pcb_trace',
        pcb_trace_id: id,
        ...(covered === undefined ? {} : { covered_with_solder_mask: covered }),
        route: [1, 4].map((x) => ({
            route_type: 'wire',
            x,
            y,
            width: 0.25,
            layer: 'top'
        }))
    })
    const pour = (id, y, covered) => ({
        type: 'pcb_copper_pour',
        pcb_copper_pour_id: id,
        layer: 'top',
        shape: 'polygon',
        ...(covered === undefined ? {} : { covered_with_solder_mask: covered }),
        points: [
            { x: 1, y },
            { x: 4, y },
            { x: 4, y: y + 1 },
            { x: 1, y: y + 1 }
        ]
    })
    const via = (id, x, tented) => ({
        type: 'pcb_via',
        pcb_via_id: id,
        x,
        y: 7,
        outer_diameter: 0.8,
        hole_diameter: 0.3,
        layers: ['top', 'bottom'],
        from_layer: 'top',
        to_layer: 'bottom',
        ...(tented === undefined ? {} : { is_tented: tented })
    })
    return DocumentResult.create({
        format: 'kicad',
        fileName: 'mask-semantics.kicad_pcb',
        model: [
            {
                type: 'pcb_board',
                pcb_board_id: 'board_1',
                center: { x: 5, y: 5 },
                width: 10,
                height: 10,
                thickness: 1.6
            },
            trace('covered_trace', 1, undefined),
            trace('open_trace', 3, false),
            pour('covered_pour', 4, undefined),
            pour('open_pour', 5.5, false),
            via('covered_via', 2, undefined),
            via('open_via', 4, false)
        ]
    })
}
