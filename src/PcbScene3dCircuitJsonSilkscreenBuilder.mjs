import { CircuitJsonUnits } from 'circuitjson-toolkit'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'
import { PcbScene3dCircuitJsonDocumentationArtworkBuilder } from './PcbScene3dCircuitJsonDocumentationArtworkBuilder.mjs'
import { PcbScene3dCircuitJsonSourceLayer } from './PcbScene3dCircuitJsonSourceLayer.mjs'

const CURVE_SEGMENTS = 32
const CAP_SEGMENTS = 16

/**
 * Converts CircuitJSON silkscreen and opted-in note elements into scene detail.
 */
export class PcbScene3dCircuitJsonSilkscreenBuilder {
    /**
     * Builds basic silkscreen detail from known CircuitJSON drawing elements.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {{ showPcbNotes?: boolean }} [options] Builder options.
     * @returns {{ top: object, bottom: object }}
     */
    static build(index, options = {}) {
        const top = { tracks: [], arcs: [], fills: [], texts: [] }
        const bottom = { tracks: [], arcs: [], fills: [], texts: [] }

        PcbScene3dCircuitJsonSilkscreenBuilder.#appendLines(index, top, bottom)
        PcbScene3dCircuitJsonSilkscreenBuilder.#appendPaths(index, top, bottom)
        PcbScene3dCircuitJsonDocumentationArtworkBuilder.append(
            index,
            top,
            bottom,
            { sourceLayerFilter: 'silkscreen' }
        )
        PcbScene3dCircuitJsonSilkscreenBuilder.#appendCircles(
            index,
            top,
            bottom
        )
        PcbScene3dCircuitJsonSilkscreenBuilder.#appendShapeOutlines(
            index,
            top,
            bottom
        )
        PcbScene3dCircuitJsonSilkscreenBuilder.#appendTexts(
            index.elementsByType.get('pcb_silkscreen_text') || [],
            top,
            bottom
        )
        PcbScene3dCircuitJsonSilkscreenBuilder.#appendTexts(
            (index.elementsByType.get('pcb_note_text') || []).filter(
                PcbScene3dCircuitJsonSourceLayer.isSilkscreen
            ),
            top,
            bottom
        )
        if (options?.showPcbNotes === true) {
            PcbScene3dCircuitJsonDocumentationArtworkBuilder.append(
                index,
                top,
                bottom,
                { sourceLayerFilter: 'non-silkscreen' }
            )
            PcbScene3dCircuitJsonSilkscreenBuilder.#appendTexts(
                [
                    ...(index.elementsByType.get('pcb_note_text') || []),
                    ...(index.elementsByType.get('pcb_fabrication_note_text') ||
                        [])
                ].filter(
                    (text) =>
                        !PcbScene3dCircuitJsonSourceLayer.isSilkscreen(text) &&
                        !PcbScene3dCircuitJsonSourceLayer.isCopperOrSolderMask(
                            text
                        )
                ),
                top,
                bottom
            )
        }

        return { top, bottom }
    }

    /**
     * Appends silkscreen line strokes.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendLines(index, top, bottom) {
        ;(index.elementsByType.get('pcb_silkscreen_line') || []).forEach(
            (line) => {
                const target =
                    PcbScene3dCircuitJsonSilkscreenBuilder.#sideDetail(
                        line?.layer,
                        top,
                        bottom
                    )
                target.tracks.push({
                    x1: CircuitJsonUnits.mmToMil(line?.x1, 0),
                    y1: CircuitJsonUnits.mmToMil(line?.y1, 0),
                    x2: CircuitJsonUnits.mmToMil(line?.x2, 0),
                    y2: CircuitJsonUnits.mmToMil(line?.y2, 0),
                    width: CircuitJsonUnits.mmToMil(line?.stroke_width, 0.12)
                })
            }
        )
    }

    /**
     * Appends routed silkscreen path strokes.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendPaths(index, top, bottom) {
        ;(index.elementsByType.get('pcb_silkscreen_path') || []).forEach(
            (path, pathIndex) => {
                const target =
                    PcbScene3dCircuitJsonSilkscreenBuilder.#sideDetail(
                        path?.layer,
                        top,
                        bottom
                    )
                PcbScene3dCircuitJsonSilkscreenBuilder.#appendPath(
                    target,
                    path,
                    PcbScene3dCircuitJsonSilkscreenBuilder.#sourceId(
                        path,
                        ['pcb_silkscreen_path_id', 'silkscreen_path_id'],
                        'pcb_silkscreen_path',
                        pathIndex
                    )
                )
            }
        )
    }

    /**
     * Appends one filled polygon or stroke path to a side detail container.
     * @param {object} target Side-specific silkscreen detail.
     * @param {object} path CircuitJSON path element.
     * @param {string} sourceId Stable source ID.
     * @returns {void}
     */
    static #appendPath(target, path, sourceId) {
        const points = PcbScene3dCircuitJsonSilkscreenBuilder.#pathPoints(path)
        if (points.length < 2) {
            return
        }

        const fillPoints =
            PcbScene3dCircuitJsonSilkscreenBuilder.#distinctPathPoints(points)
        if (path?.fill === true && fillPoints.length >= 3) {
            target.fills.push({
                sourceId,
                points: fillPoints
            })
            return
        }

        const width =
            PcbScene3dCircuitJsonSilkscreenBuilder.#pathStrokeWidth(path)
        for (let index = 0; index < points.length - 1; index += 1) {
            const start = points[index]
            const end = points[index + 1]
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
     * Converts one path route into valid millimeter-to-mil points.
     * @param {object} path CircuitJSON path element.
     * @returns {{ x: number, y: number }[]}
     */
    static #pathPoints(path) {
        return PcbScene3dCircuitJsonSilkscreenBuilder.#array(
            path?.route || path?.points
        )
            .map((point) =>
                PcbScene3dCircuitJsonSilkscreenBuilder.#point(point)
            )
            .filter(Boolean)
    }

    /**
     * Removes a duplicate closing point from one polygon route.
     * @param {{ x: number, y: number }[]} points Route points.
     * @returns {{ x: number, y: number }[]}
     */
    static #distinctPathPoints(points) {
        if (points.length < 2) return points
        const first = points[0]
        const last = points[points.length - 1]
        return first.x === last.x && first.y === last.y
            ? points.slice(0, -1)
            : points
    }

    /**
     * Resolves a positive stroke width with the standard silkscreen fallback.
     * @param {object} path CircuitJSON path element.
     * @returns {number}
     */
    static #pathStrokeWidth(path) {
        const width = Number(path?.stroke_width ?? path?.strokeWidth)
        return Number.isFinite(width) && width > 0
            ? CircuitJsonUnits.mmToMil(width, 0)
            : CircuitJsonUnits.mmToMil(0.12, 0)
    }

    /**
     * Appends circular silkscreen strokes as full-circle arcs.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendCircles(index, top, bottom) {
        ;(index.elementsByType.get('pcb_silkscreen_circle') || []).forEach(
            (circle, circleIndex) => {
                const center = PcbScene3dCircuitJsonSilkscreenBuilder.#point(
                    circle?.center ||
                        circle?.position || {
                            x: circle?.x,
                            y: circle?.y
                        }
                )
                const radius =
                    PcbScene3dCircuitJsonSilkscreenBuilder.#circleRadius(circle)
                if (!center || radius <= 0) {
                    return
                }

                const target =
                    PcbScene3dCircuitJsonSilkscreenBuilder.#sideDetail(
                        circle?.layer,
                        top,
                        bottom
                    )
                target.arcs.push({
                    sourceId:
                        PcbScene3dCircuitJsonSilkscreenBuilder.#circleSourceId(
                            circle,
                            circleIndex
                        ),
                    x: center.x,
                    y: center.y,
                    radius,
                    width: CircuitJsonUnits.mmToMil(
                        circle?.stroke_width ?? circle?.strokeWidth,
                        0.12
                    ),
                    startAngle: 0,
                    endAngle: 360,
                    sweepAngle: 360
                })
            }
        )
    }

    /**
     * Appends closed silkscreen shape outlines as stroke loops.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendShapeOutlines(index, top, bottom) {
        const specs = [
            {
                type: 'pcb_silkscreen_rect',
                fallbackPrefix: 'pcb_silkscreen_rect',
                idFields: ['pcb_silkscreen_rect_id', 'silkscreen_rect_id'],
                points: (element) =>
                    PcbScene3dCircuitJsonSilkscreenBuilder.#rectanglePoints(
                        element
                    )
            },
            {
                type: 'pcb_silkscreen_oval',
                fallbackPrefix: 'pcb_silkscreen_oval',
                idFields: ['pcb_silkscreen_oval_id', 'silkscreen_oval_id'],
                points: (element) =>
                    PcbScene3dCircuitJsonSilkscreenBuilder.#ovalPoints(element)
            },
            {
                type: 'pcb_silkscreen_pill',
                fallbackPrefix: 'pcb_silkscreen_pill',
                idFields: ['pcb_silkscreen_pill_id', 'silkscreen_pill_id'],
                points: (element) =>
                    PcbScene3dCircuitJsonSilkscreenBuilder.#pillPoints(element)
            }
        ]

        specs.forEach((spec) => {
            ;(index.elementsByType.get(spec.type) || []).forEach(
                (element, elementIndex) => {
                    const points = spec.points(element)
                    if (points.length < 3) {
                        return
                    }

                    const target =
                        PcbScene3dCircuitJsonSilkscreenBuilder.#sideDetail(
                            element?.layer,
                            top,
                            bottom
                        )
                    PcbScene3dCircuitJsonSilkscreenBuilder.#appendLoopTracks(
                        target,
                        points,
                        PcbScene3dCircuitJsonSilkscreenBuilder.#sourceId(
                            element,
                            spec.idFields,
                            spec.fallbackPrefix,
                            elementIndex
                        ),
                        CircuitJsonUnits.mmToMil(
                            element?.stroke_width ?? element?.strokeWidth,
                            0.12
                        )
                    )
                }
            )
        })
    }

    /**
     * Appends text primitives to side-specific silkscreen detail.
     * @param {object[]} texts Source text elements.
     * @param {object} top Top-side silkscreen detail.
     * @param {object} bottom Bottom-side silkscreen detail.
     * @returns {void}
     */
    static #appendTexts(texts, top, bottom) {
        texts.forEach((text) => {
            if (text?.is_hidden === true || text?.isHidden === true) return
            const target = PcbScene3dCircuitJsonSilkscreenBuilder.#sideDetail(
                text?.layer,
                top,
                bottom
            )
            target.texts.push(
                PcbScene3dCircuitJsonSilkscreenBuilder.#textPrimitive(text)
            )
        })
    }

    /**
     * Builds one normalized text primitive.
     * @param {object} text CircuitJSON text element.
     * @returns {object}
     */
    static #textPrimitive(text) {
        const position =
            PcbScene3dCircuitJsonSilkscreenBuilder.#textPosition(text)
        const sizeX = CircuitJsonUnits.mmToMil(
            text?.font_width ??
                text?.fontWidth ??
                text?.font_size ??
                text?.fontSize ??
                text?.height ??
                text?.size,
            1
        )
        const sizeY = CircuitJsonUnits.mmToMil(
            text?.font_height ??
                text?.fontHeight ??
                text?.font_size ??
                text?.fontSize ??
                text?.height ??
                text?.size,
            1
        )
        const strokeWidth = CircuitJsonUnits.mmToMil(
            text?.stroke_width ?? text?.strokeWidth,
            0.12
        )
        const alignment =
            PcbScene3dCircuitJsonSilkscreenBuilder.#textAlignment(text)

        return {
            sourceId:
                PcbScene3dCircuitJsonSilkscreenBuilder.#textSourceId(text),
            value: String(text?.text ?? text?.value ?? ''),
            x: position.x,
            y: position.y,
            rotation: Number(text?.ccw_rotation ?? text?.rotation ?? 0),
            sizeX,
            sizeY,
            width: strokeWidth,
            strokeWidth,
            thickness: strokeWidth,
            hAlign: alignment.hAlign,
            vAlign: alignment.vAlign,
            mirrored:
                text?.is_mirrored === true ||
                text?.is_mirrored_from_top_view === true ||
                text?.mirrored === true
        }
    }

    /**
     * Resolves the insertion point for one text element.
     * @param {object} text CircuitJSON text element.
     * @returns {{ x: number, y: number }}
     */
    static #textPosition(text) {
        const position = PcbScene3dCircuitJsonSilkscreenBuilder.#point(
            text?.anchor_position ||
                text?.position || {
                    x: text?.x,
                    y: text?.y
                }
        )
        return position || { x: 0, y: 0 }
    }

    /**
     * Resolves normalized text alignment from CircuitJSON anchor metadata.
     * @param {object} text CircuitJSON text element.
     * @returns {{ hAlign: 'left' | 'center' | 'right', vAlign: 'top' | 'center' | 'bottom' }}
     */
    static #textAlignment(text) {
        const value = String(
            text?.source_anchor_alignment || text?.anchor_alignment || ''
        )
            .trim()
            .toLowerCase()
            .replaceAll('-', '_')
        const hAlign = value.includes('left')
            ? 'left'
            : value.includes('right')
              ? 'right'
              : 'center'
        const vAlign = value.includes('bottom')
            ? 'bottom'
            : value.includes('center') || value.includes('middle')
              ? 'center'
              : 'top'

        return { hAlign, vAlign }
    }

    /**
     * Resolves a stable source ID for one text element.
     * @param {object} text CircuitJSON text element.
     * @returns {string}
     */
    static #textSourceId(text) {
        return String(
            text?.pcb_silkscreen_text_id ||
                text?.pcb_note_text_id ||
                text?.pcb_fabrication_note_text_id ||
                text?.id ||
                ''
        )
    }

    /**
     * Returns the side-specific detail container.
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
     * Resolves a circle radius in mils.
     * @param {object} circle CircuitJSON circle element.
     * @returns {number}
     */
    static #circleRadius(circle) {
        const radius = PcbScene3dCircuitJsonSilkscreenBuilder.#positiveMmToMil(
            circle?.radius
        )
        if (radius > 0) {
            return radius
        }

        const diameter =
            PcbScene3dCircuitJsonSilkscreenBuilder.#positiveMmToMil(
                circle?.diameter
            )
        return diameter > 0 ? diameter / 2 : 0
    }

    /**
     * Resolves one oval outline in mils.
     * @param {object} oval CircuitJSON oval element.
     * @returns {{ x: number, y: number }[]}
     */
    static #ovalPoints(oval) {
        const size =
            PcbScene3dCircuitJsonSilkscreenBuilder.#centeredShapeSize(oval)
        const center = PcbScene3dCircuitJsonSilkscreenBuilder.#shapeCenter(oval)
        if (!center || size.width <= 0 || size.height <= 0) {
            return []
        }

        return Array.from({ length: CURVE_SEGMENTS }, (_entry, index) => {
            const angle = (Math.PI * 2 * index) / CURVE_SEGMENTS
            return PcbScene3dCircuitJsonSilkscreenBuilder.#rotatePoint(
                {
                    x: (Math.cos(angle) * size.width) / 2,
                    y: (Math.sin(angle) * size.height) / 2
                },
                center,
                oval
            )
        })
    }

    /**
     * Resolves one pill outline in mils.
     * @param {object} pill CircuitJSON pill element.
     * @returns {{ x: number, y: number }[]}
     */
    static #pillPoints(pill) {
        const size =
            PcbScene3dCircuitJsonSilkscreenBuilder.#centeredShapeSize(pill)
        const center = PcbScene3dCircuitJsonSilkscreenBuilder.#shapeCenter(pill)
        if (!center || size.width <= 0 || size.height <= 0) {
            return []
        }

        const localPoints =
            size.width >= size.height
                ? PcbScene3dCircuitJsonSilkscreenBuilder.#horizontalPillPoints(
                      size.width,
                      size.height
                  )
                : PcbScene3dCircuitJsonSilkscreenBuilder.#verticalPillPoints(
                      size.width,
                      size.height
                  )
        return localPoints.map((point) =>
            PcbScene3dCircuitJsonSilkscreenBuilder.#rotatePoint(
                point,
                center,
                pill
            )
        )
    }

    /**
     * Builds local horizontal pill outline points.
     * @param {number} width Pill width.
     * @param {number} height Pill height.
     * @returns {{ x: number, y: number }[]}
     */
    static #horizontalPillPoints(width, height) {
        const radius = height / 2
        const capOffset = Math.max((width - height) / 2, 0)
        return [
            ...PcbScene3dCircuitJsonSilkscreenBuilder.#arcPoints(
                { x: capOffset, y: 0 },
                radius,
                -90,
                90
            ),
            ...PcbScene3dCircuitJsonSilkscreenBuilder.#arcPoints(
                { x: -capOffset, y: 0 },
                radius,
                90,
                270
            )
        ]
    }

    /**
     * Builds local vertical pill outline points.
     * @param {number} width Pill width.
     * @param {number} height Pill height.
     * @returns {{ x: number, y: number }[]}
     */
    static #verticalPillPoints(width, height) {
        const radius = width / 2
        const capOffset = Math.max((height - width) / 2, 0)
        return [
            ...PcbScene3dCircuitJsonSilkscreenBuilder.#arcPoints(
                { x: 0, y: capOffset },
                radius,
                0,
                180
            ),
            ...PcbScene3dCircuitJsonSilkscreenBuilder.#arcPoints(
                { x: 0, y: -capOffset },
                radius,
                180,
                360
            )
        ]
    }

    /**
     * Builds local arc sample points.
     * @param {{ x: number, y: number }} center Arc center.
     * @param {number} radius Arc radius.
     * @param {number} startDeg Start angle in degrees.
     * @param {number} endDeg End angle in degrees.
     * @returns {{ x: number, y: number }[]}
     */
    static #arcPoints(center, radius, startDeg, endDeg) {
        return Array.from({ length: CAP_SEGMENTS + 1 }, (_entry, index) => {
            const angle =
                ((startDeg + ((endDeg - startDeg) * index) / CAP_SEGMENTS) *
                    Math.PI) /
                180
            return {
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius
            }
        })
    }

    /**
     * Resolves one note rectangle outline in mils.
     * @param {object} rect CircuitJSON note rectangle element.
     * @returns {{ x: number, y: number }[]}
     */
    static #rectanglePoints(rect) {
        const centered =
            PcbScene3dCircuitJsonSilkscreenBuilder.#centeredRectanglePoints(
                rect
            )
        if (centered.length) {
            return centered
        }

        return PcbScene3dCircuitJsonSilkscreenBuilder.#cornerRectanglePoints(
            rect
        )
    }

    /**
     * Resolves center/size rectangle points in mils.
     * @param {object} rect CircuitJSON note rectangle element.
     * @returns {{ x: number, y: number }[]}
     */
    static #centeredRectanglePoints(rect) {
        const size =
            PcbScene3dCircuitJsonSilkscreenBuilder.#centeredShapeSize(rect)
        const center = PcbScene3dCircuitJsonSilkscreenBuilder.#shapeCenter(rect)
        if (!center || size.width <= 0 || size.height <= 0) {
            return []
        }

        return [
            { x: -size.width / 2, y: -size.height / 2 },
            { x: size.width / 2, y: -size.height / 2 },
            { x: size.width / 2, y: size.height / 2 },
            { x: -size.width / 2, y: size.height / 2 }
        ].map((point) =>
            PcbScene3dCircuitJsonSilkscreenBuilder.#rotatePoint(
                point,
                center,
                rect
            )
        )
    }

    /**
     * Resolves corner-defined rectangle points in mils.
     * @param {object} rect CircuitJSON note rectangle element.
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
        ].map((point) => PcbScene3dCircuitJsonSilkscreenBuilder.#point(point))
    }

    /**
     * Appends one closed point loop as connected stroke tracks.
     * @param {object} target Side-specific silkscreen detail.
     * @param {{ x: number, y: number }[]} points Outline points.
     * @param {string} sourceId Source element ID.
     * @param {number} width Stroke width in mils.
     * @returns {void}
     */
    static #appendLoopTracks(target, points, sourceId, width) {
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
     * Resolves a centered shape size in mils.
     * @param {object} element CircuitJSON shape element.
     * @returns {{ width: number, height: number }}
     */
    static #centeredShapeSize(element) {
        return {
            width: PcbScene3dCircuitJsonSilkscreenBuilder.#positiveMmToMil(
                element?.width
            ),
            height: PcbScene3dCircuitJsonSilkscreenBuilder.#positiveMmToMil(
                element?.height
            )
        }
    }

    /**
     * Resolves a centered shape position in mils.
     * @param {object} element CircuitJSON shape element.
     * @returns {{ x: number, y: number } | null}
     */
    static #shapeCenter(element) {
        return PcbScene3dCircuitJsonSilkscreenBuilder.#point(
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
     * Resolves a stable source ID for one circle element.
     * @param {object} circle CircuitJSON silkscreen circle element.
     * @param {number} circleIndex Source element index.
     * @returns {string}
     */
    static #circleSourceId(circle, circleIndex) {
        return PcbScene3dCircuitJsonSilkscreenBuilder.#sourceId(
            circle,
            ['pcb_silkscreen_circle_id', 'silkscreen_circle_id'],
            'pcb_silkscreen_circle',
            circleIndex
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
