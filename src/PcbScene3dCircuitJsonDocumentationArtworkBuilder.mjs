import { CircuitJsonUnits } from 'circuitjson-toolkit'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'

const CIRCLE_SEGMENTS = 32

/**
 * Appends optional documentation artwork to side-specific silkscreen detail.
 */
export class PcbScene3dCircuitJsonDocumentationArtworkBuilder {
    /**
     * Appends opted-in notes, fabrication paths, and courtyard artwork.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static append(index, top, bottom) {
        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#appendRectOutlines(
            index,
            top,
            bottom
        )
        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#appendCircleOutlines(
            index,
            top,
            bottom
        )
        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#appendPointOutlines(
            index,
            top,
            bottom
        )
        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#appendLines(
            index,
            top,
            bottom
        )
        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#appendPaths(
            index,
            top,
            bottom
        )
    }

    /**
     * Appends rectangular documentation outlines.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendRectOutlines(index, top, bottom) {
        const specs = [
            {
                type: 'pcb_note_rect',
                fallbackPrefix: 'pcb_note_rect',
                idFields: ['pcb_note_rect_id', 'note_rect_id']
            },
            {
                type: 'pcb_courtyard_rect',
                fallbackPrefix: 'pcb_courtyard_rect',
                idFields: ['pcb_courtyard_rect_id', 'courtyard_rect_id']
            }
        ]

        specs.forEach((spec) => {
            ;(index.elementsByType.get(spec.type) || []).forEach(
                (element, elementIndex) => {
                    const points =
                        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#rectanglePoints(
                            element
                        )
                    PcbScene3dCircuitJsonDocumentationArtworkBuilder.#appendClosedLoop(
                        top,
                        bottom,
                        element,
                        points,
                        spec,
                        elementIndex
                    )
                }
            )
        })
    }

    /**
     * Appends circular documentation outlines as sampled stroke loops.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendCircleOutlines(index, top, bottom) {
        ;(index.elementsByType.get('pcb_courtyard_circle') || []).forEach(
            (circle, circleIndex) => {
                const points =
                    PcbScene3dCircuitJsonDocumentationArtworkBuilder.#circlePoints(
                        circle
                    )
                PcbScene3dCircuitJsonDocumentationArtworkBuilder.#appendClosedLoop(
                    top,
                    bottom,
                    circle,
                    points,
                    {
                        fallbackPrefix: 'pcb_courtyard_circle',
                        idFields: [
                            'pcb_courtyard_circle_id',
                            'courtyard_circle_id'
                        ]
                    },
                    circleIndex
                )
            }
        )
    }

    /**
     * Appends point-defined documentation outlines.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendPointOutlines(index, top, bottom) {
        ;(index.elementsByType.get('pcb_courtyard_outline') || []).forEach(
            (outline, outlineIndex) => {
                const points =
                    PcbScene3dCircuitJsonDocumentationArtworkBuilder.#pointList(
                        outline?.outline || outline?.points
                    )
                PcbScene3dCircuitJsonDocumentationArtworkBuilder.#appendClosedLoop(
                    top,
                    bottom,
                    outline,
                    points,
                    {
                        fallbackPrefix: 'pcb_courtyard_outline',
                        idFields: [
                            'pcb_courtyard_outline_id',
                            'courtyard_outline_id'
                        ]
                    },
                    outlineIndex
                )
            }
        )
    }

    /**
     * Appends line-shaped documentation strokes.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendLines(index, top, bottom) {
        ;(index.elementsByType.get('pcb_note_line') || []).forEach(
            (line, lineIndex) => {
                const start =
                    PcbScene3dCircuitJsonDocumentationArtworkBuilder.#lineStart(
                        line
                    )
                const end =
                    PcbScene3dCircuitJsonDocumentationArtworkBuilder.#lineEnd(
                        line
                    )
                if (!start || !end) {
                    return
                }

                const target =
                    PcbScene3dCircuitJsonDocumentationArtworkBuilder.#sideDetail(
                        line?.layer,
                        top,
                        bottom
                    )
                target.tracks.push({
                    sourceId:
                        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#sourceId(
                            line,
                            ['pcb_note_line_id', 'note_line_id'],
                            'pcb_note_line',
                            lineIndex
                        ),
                    x1: start.x,
                    y1: start.y,
                    x2: end.x,
                    y2: end.y,
                    width: PcbScene3dCircuitJsonDocumentationArtworkBuilder.#strokeWidth(
                        line
                    )
                })
            }
        )
    }

    /**
     * Appends routed documentation path strokes.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendPaths(index, top, bottom) {
        const specs = [
            {
                type: 'pcb_note_path',
                fallbackPrefix: 'pcb_note_path',
                idFields: ['pcb_note_path_id', 'note_path_id']
            },
            {
                type: 'pcb_fabrication_note_path',
                fallbackPrefix: 'pcb_fabrication_note_path',
                idFields: [
                    'pcb_fabrication_note_path_id',
                    'fabrication_note_path_id'
                ]
            }
        ]

        specs.forEach((spec) => {
            ;(index.elementsByType.get(spec.type) || []).forEach(
                (path, pathIndex) => {
                    const target =
                        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#sideDetail(
                            path?.layer,
                            top,
                            bottom
                        )
                    const route =
                        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#array(
                            path?.route || path?.points
                        )
                    const sourceId =
                        PcbScene3dCircuitJsonDocumentationArtworkBuilder.#sourceId(
                            path,
                            spec.idFields,
                            spec.fallbackPrefix,
                            pathIndex
                        )
                    for (let index = 0; index < route.length - 1; index += 1) {
                        const start =
                            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#point(
                                route[index]
                            )
                        const end =
                            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#point(
                                route[index + 1]
                            )
                        if (!start || !end) {
                            continue
                        }
                        target.tracks.push({
                            sourceId,
                            x1: start.x,
                            y1: start.y,
                            x2: end.x,
                            y2: end.y,
                            width: PcbScene3dCircuitJsonDocumentationArtworkBuilder.#strokeWidth(
                                path
                            )
                        })
                    }
                }
            )
        })
    }

    /**
     * Appends one closed point loop as connected stroke tracks.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @param {object} element Source element.
     * @param {{ x: number, y: number }[]} points Outline points.
     * @param {{ idFields: string[], fallbackPrefix: string }} spec ID spec.
     * @param {number} elementIndex Source element index.
     * @returns {void}
     */
    static #appendClosedLoop(top, bottom, element, points, spec, elementIndex) {
        if (points.length < 3) {
            return
        }

        const target =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#sideDetail(
                element?.layer,
                top,
                bottom
            )
        const sourceId =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#sourceId(
                element,
                spec.idFields,
                spec.fallbackPrefix,
                elementIndex
            )
        const width =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#strokeWidth(
                element
            )

        for (let index = 0; index < points.length; index += 1) {
            const start = points[index]
            const end = points[(index + 1) % points.length]
            target.tracks.push({
                sourceId,
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                width
            })
        }
    }

    /**
     * Resolves one rectangle outline in mils.
     * @param {object} rect CircuitJSON rectangle element.
     * @returns {{ x: number, y: number }[]}
     */
    static #rectanglePoints(rect) {
        const centered =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#centeredRectanglePoints(
                rect
            )
        if (centered.length) {
            return centered
        }

        return PcbScene3dCircuitJsonDocumentationArtworkBuilder.#cornerRectanglePoints(
            rect
        )
    }

    /**
     * Resolves center/size rectangle points in mils.
     * @param {object} rect CircuitJSON rectangle element.
     * @returns {{ x: number, y: number }[]}
     */
    static #centeredRectanglePoints(rect) {
        const width =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#positiveMmToMil(
                rect?.width
            )
        const height =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#positiveMmToMil(
                rect?.height
            )
        const center =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#shapeCenter(rect)
        if (!center || width <= 0 || height <= 0) {
            return []
        }

        return [
            { x: -width / 2, y: -height / 2 },
            { x: width / 2, y: -height / 2 },
            { x: width / 2, y: height / 2 },
            { x: -width / 2, y: height / 2 }
        ].map((point) =>
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#rotatePoint(
                point,
                center,
                rect
            )
        )
    }

    /**
     * Resolves corner-defined rectangle points in mils.
     * @param {object} rect CircuitJSON rectangle element.
     * @returns {{ x: number, y: number }[]}
     */
    static #cornerRectanglePoints(rect) {
        const x1 = Number(rect?.x1)
        const y1 = Number(rect?.y1)
        const x2 = Number(rect?.x2)
        const y2 = Number(rect?.y2)
        if (
            !Number.isFinite(x1) ||
            !Number.isFinite(y1) ||
            !Number.isFinite(x2) ||
            !Number.isFinite(y2)
        ) {
            return []
        }

        return [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 }
        ]
            .map((point) =>
                PcbScene3dCircuitJsonDocumentationArtworkBuilder.#point(point)
            )
            .filter(Boolean)
    }

    /**
     * Resolves one circle outline in mils.
     * @param {object} circle CircuitJSON circle element.
     * @returns {{ x: number, y: number }[]}
     */
    static #circlePoints(circle) {
        const center =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#shapeCenter(
                circle
            )
        const radius =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#circleRadius(
                circle
            )
        if (!center || radius <= 0) {
            return []
        }

        return Array.from({ length: CIRCLE_SEGMENTS }, (_entry, index) => {
            const angle = (Math.PI * 2 * index) / CIRCLE_SEGMENTS
            return {
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius
            }
        })
    }

    /**
     * Resolves one circle radius in mils.
     * @param {object} circle CircuitJSON circle element.
     * @returns {number}
     */
    static #circleRadius(circle) {
        const radius =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#positiveMmToMil(
                circle?.radius
            )
        if (radius > 0) {
            return radius
        }

        const diameter =
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.#positiveMmToMil(
                circle?.diameter
            )
        return diameter > 0 ? diameter / 2 : 0
    }

    /**
     * Resolves a point list from millimeters to mils.
     * @param {unknown} value Candidate point list.
     * @returns {{ x: number, y: number }[]}
     */
    static #pointList(value) {
        return PcbScene3dCircuitJsonDocumentationArtworkBuilder.#array(value)
            .map((point) =>
                PcbScene3dCircuitJsonDocumentationArtworkBuilder.#point(point)
            )
            .filter(Boolean)
    }

    /**
     * Resolves a centered shape position in mils.
     * @param {object} element CircuitJSON shape element.
     * @returns {{ x: number, y: number } | null}
     */
    static #shapeCenter(element) {
        return PcbScene3dCircuitJsonDocumentationArtworkBuilder.#point(
            element?.center ||
                element?.position || {
                    x: element?.x,
                    y: element?.y
                }
        )
    }

    /**
     * Rotates a local point around a shape center.
     * @param {{ x: number, y: number }} point Local point.
     * @param {{ x: number, y: number }} center Shape center.
     * @param {object} element Source element with optional rotation.
     * @returns {{ x: number, y: number }}
     */
    static #rotatePoint(point, center, element) {
        const angle =
            (Number(element?.rotation ?? element?.ccw_rotation ?? 0) *
                Math.PI) /
            180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return {
            x: center.x + point.x * cos - point.y * sin,
            y: center.y + point.x * sin + point.y * cos
        }
    }

    /**
     * Resolves the start point for one line element.
     * @param {object} line CircuitJSON line element.
     * @returns {{ x: number, y: number } | null}
     */
    static #lineStart(line) {
        return PcbScene3dCircuitJsonDocumentationArtworkBuilder.#point(
            line?.start ||
                line?.from || {
                    x: line?.x1,
                    y: line?.y1
                }
        )
    }

    /**
     * Resolves the end point for one line element.
     * @param {object} line CircuitJSON line element.
     * @returns {{ x: number, y: number } | null}
     */
    static #lineEnd(line) {
        return PcbScene3dCircuitJsonDocumentationArtworkBuilder.#point(
            line?.end ||
                line?.to || {
                    x: line?.x2,
                    y: line?.y2
                }
        )
    }

    /**
     * Resolves a stable source ID from known field names.
     * @param {object} element CircuitJSON element.
     * @param {string[]} idFields Candidate ID field names.
     * @param {string} fallbackPrefix Fallback ID prefix.
     * @param {number} elementIndex Source element index.
     * @returns {string}
     */
    static #sourceId(element, idFields, fallbackPrefix, elementIndex) {
        const value =
            idFields.map((field) => element?.[field]).find(Boolean) ||
            element?.id ||
            `${fallbackPrefix}_${elementIndex + 1}`
        return String(value)
    }

    /**
     * Resolves the side-specific detail container.
     * @param {unknown} layer Layer value.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {object}
     */
    static #sideDetail(layer, top, bottom) {
        return PcbScene3dCircuitJsonLayer.side(layer) === 'bottom'
            ? bottom
            : top
    }

    /**
     * Resolves one stroke width in mils.
     * @param {object} element Stroke source element.
     * @returns {number}
     */
    static #strokeWidth(element) {
        return CircuitJsonUnits.mmToMil(
            element?.stroke_width ?? element?.strokeWidth,
            0.12
        )
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
