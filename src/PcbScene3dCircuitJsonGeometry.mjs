import { CircuitJsonUnits } from 'circuitjson-toolkit'

const DEFAULT_BOARD_WIDTH_MM = 25.4
const DEFAULT_BOARD_HEIGHT_MM = 25.4
const DEFAULT_BOARD_THICKNESS_MM = 1.6
const DEFAULT_FAUX_BOARD_SIZE_MM = 10
const FAUX_BOARD_MARGIN_MM = 2
const CIRCLE_CUTOUT_POINTS = 32
const DRILL_QUALITY_POINTS = {
    low: 16,
    medium: 24,
    high: 48
}

/**
 * Resolves direct CircuitJSON board geometry, cutouts, and drill metadata.
 */
export class PcbScene3dCircuitJsonGeometry {
    /**
     * Builds the render-model board from a `pcb_panel` or `pcb_board` element.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {{ boardDrillQuality?: string }} options Adapter options.
     * @returns {object}
     */
    static buildBoard(index, options = {}) {
        const explicitBoardElement =
            index.elementsByType.get('pcb_panel')?.[0] ||
            index.elementsByType.get('pcb_board')?.[0]
        const boardElement =
            explicitBoardElement ||
            PcbScene3dCircuitJsonGeometry.#fauxBoardElement(index, options) ||
            {}
        const widthMil = CircuitJsonUnits.mmToMil(
            boardElement.width,
            DEFAULT_BOARD_WIDTH_MM
        )
        const heightMil = CircuitJsonUnits.mmToMil(
            boardElement.height,
            DEFAULT_BOARD_HEIGHT_MM
        )
        const thicknessMil = CircuitJsonUnits.mmToMil(
            boardElement.thickness,
            DEFAULT_BOARD_THICKNESS_MM
        )
        const center = CircuitJsonUnits.pointMmToMil(boardElement.center || {})
        const minX = center.x - widthMil / 2
        const minY = center.y - heightMil / 2
        const segments = PcbScene3dCircuitJsonGeometry.#buildBoardSegments(
            boardElement,
            {
                minX,
                minY,
                widthMil,
                heightMil
            }
        )

        return {
            widthMil,
            heightMil,
            thicknessMil,
            minX,
            minY,
            centerX: center.x,
            centerY: center.y,
            segments,
            cutouts: PcbScene3dCircuitJsonGeometry.#buildBoardCutouts(
                index,
                boardElement,
                options
            ),
            surfaceColor: null,
            edgeColor: null
        }
    }

    /**
     * Builds a generated board element around component bounds when requested.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {{ drawFauxBoard?: boolean }} options Adapter options.
     * @returns {object | null}
     */
    static #fauxBoardElement(index, options) {
        if (options?.drawFauxBoard !== true) {
            return null
        }

        const bounds = PcbScene3dCircuitJsonGeometry.#componentBoundsMm(
            index.elementsByType.get('pcb_component') || []
        )
        if (!bounds) {
            return {
                type: 'pcb_board',
                center: { x: 0, y: 0 },
                width: DEFAULT_FAUX_BOARD_SIZE_MM,
                height: DEFAULT_FAUX_BOARD_SIZE_MM,
                thickness: DEFAULT_BOARD_THICKNESS_MM
            }
        }

        const width = Math.max(
            bounds.maxX - bounds.minX + FAUX_BOARD_MARGIN_MM * 2,
            DEFAULT_FAUX_BOARD_SIZE_MM
        )
        const height = Math.max(
            bounds.maxY - bounds.minY + FAUX_BOARD_MARGIN_MM * 2,
            DEFAULT_FAUX_BOARD_SIZE_MM
        )

        return {
            type: 'pcb_board',
            center: {
                x: (bounds.minX + bounds.maxX) / 2,
                y: (bounds.minY + bounds.maxY) / 2
            },
            width,
            height,
            thickness: DEFAULT_BOARD_THICKNESS_MM
        }
    }

    /**
     * Resolves component bounds in millimeters.
     * @param {object[]} components CircuitJSON PCB components.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static #componentBoundsMm(components) {
        const bounds = {
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        }

        components.forEach((component) => {
            const center =
                PcbScene3dCircuitJsonGeometry.#componentCenterMm(component)
            if (!center) {
                return
            }

            const width = PcbScene3dCircuitJsonGeometry.#firstPositive([
                component?.width
            ])
            const height = PcbScene3dCircuitJsonGeometry.#firstPositive([
                component?.height
            ])
            bounds.minX = Math.min(bounds.minX, center.x - width / 2)
            bounds.maxX = Math.max(bounds.maxX, center.x + width / 2)
            bounds.minY = Math.min(bounds.minY, center.y - height / 2)
            bounds.maxY = Math.max(bounds.maxY, center.y + height / 2)
        })

        return Number.isFinite(bounds.minX + bounds.minY) ? bounds : null
    }

    /**
     * Resolves a component center in millimeters.
     * @param {object} component CircuitJSON PCB component.
     * @returns {{ x: number, y: number } | null}
     */
    static #componentCenterMm(component) {
        const x = component?.center?.x ?? component?.x
        const y = component?.center?.y ?? component?.y
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
            return null
        }

        return {
            x: Number(x),
            y: Number(y)
        }
    }

    /**
     * Resolves drill opening metadata from circular, pill, and offset fields.
     * @param {object} hole CircuitJSON hole-like element.
     * @returns {{ center: { x: number, y: number }, diameter: number, slotLength: number, rotationDeg: number }}
     */
    static holeDrillSpec(hole) {
        const center = CircuitJsonUnits.pointMmToMil({
            x: Number(hole?.x || 0) + Number(hole?.hole_offset_x || 0),
            y: Number(hole?.y || 0) + Number(hole?.hole_offset_y || 0)
        })
        const width = CircuitJsonUnits.mmToMil(
            hole?.hole_width || hole?.hole_diameter,
            0
        )
        const height = CircuitJsonUnits.mmToMil(
            hole?.hole_height || hole?.hole_diameter || hole?.hole_width,
            0
        )
        const diameter = PcbScene3dCircuitJsonGeometry.#firstPositive([
            hole?.hole_diameter
                ? CircuitJsonUnits.mmToMil(hole.hole_diameter, 0)
                : 0,
            Math.min(width || Infinity, height || Infinity),
            width,
            height
        ])
        const isPill =
            String(hole?.hole_shape || '')
                .toLowerCase()
                .includes('pill') ||
            (width > 0 && height > 0 && Math.abs(width - height) > 0.001)
        const slotLength = isPill ? Math.max(width, height, diameter) : 0
        const axisRotation = isPill && height > width ? 90 : 0

        return {
            center,
            diameter,
            slotLength: slotLength > diameter ? slotLength : 0,
            rotationDeg:
                PcbScene3dCircuitJsonGeometry.#rotationDeg(hole) + axisRotation
        }
    }

    /**
     * Resolves the configured drill quality label.
     * @param {unknown} value Candidate quality.
     * @returns {'low' | 'medium' | 'high'}
     */
    static normalizeDrillQuality(value) {
        const quality = String(value || 'medium').toLowerCase()
        return Object.hasOwn(DRILL_QUALITY_POINTS, quality)
            ? /** @type {'low' | 'medium' | 'high'} */ (quality)
            : 'medium'
    }

    /**
     * Builds closed board line segments from outline points or rectangle size.
     * @param {object} boardElement CircuitJSON board element.
     * @param {{ minX: number, minY: number, widthMil: number, heightMil: number }} fallback Fallback rectangle.
     * @returns {object[]}
     */
    static #buildBoardSegments(boardElement, fallback) {
        const outlinePoints = Array.isArray(boardElement?.outline)
            ? boardElement.outline
                  .map((point) => CircuitJsonUnits.pointMmToMil(point))
                  .filter((point) => Number.isFinite(point.x + point.y))
            : []
        const points =
            outlinePoints.length >= 3
                ? outlinePoints
                : [
                      { x: fallback.minX, y: fallback.minY },
                      {
                          x: fallback.minX + fallback.widthMil,
                          y: fallback.minY
                      },
                      {
                          x: fallback.minX + fallback.widthMil,
                          y: fallback.minY + fallback.heightMil
                      },
                      {
                          x: fallback.minX,
                          y: fallback.minY + fallback.heightMil
                      }
                  ]

        return points.map((point, index) => {
            const next = points[(index + 1) % points.length]
            return {
                type: 'line',
                x1: point.x,
                y1: point.y,
                x2: next.x,
                y2: next.y
            }
        })
    }

    /**
     * Builds explicit through-board cutout loops.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {object} boardElement Selected board or panel element.
     * @param {{ boardDrillQuality?: string }} options Adapter options.
     * @returns {{ points: { x: number, y: number }[], sourceId?: string }[]}
     */
    static #buildBoardCutouts(index, boardElement, options) {
        return (index.elementsByType.get('pcb_cutout') || [])
            .filter((cutout) =>
                PcbScene3dCircuitJsonGeometry.#cutoutAppliesToBoard(
                    cutout,
                    boardElement
                )
            )
            .map((cutout) =>
                PcbScene3dCircuitJsonGeometry.#buildCutout(cutout, options)
            )
            .filter(Boolean)
    }

    /**
     * Returns true when a cutout targets the selected board or panel.
     * @param {object} cutout Cutout element.
     * @param {object} boardElement Selected board or panel element.
     * @returns {boolean}
     */
    static #cutoutAppliesToBoard(cutout, boardElement) {
        const boardIds = PcbScene3dCircuitJsonGeometry.#targetIds(cutout, [
            'pcb_board_id',
            'board_id',
            'pcb_board_ids',
            'board_ids'
        ])
        const panelIds = PcbScene3dCircuitJsonGeometry.#targetIds(cutout, [
            'pcb_panel_id',
            'panel_id',
            'pcb_panel_ids',
            'panel_ids'
        ])
        if (!boardIds.length && !panelIds.length) {
            return true
        }

        const boardId = String(
            boardElement?.pcb_board_id || boardElement?.board_id || ''
        )
        const panelId = String(
            boardElement?.pcb_panel_id || boardElement?.panel_id || ''
        )
        if (String(boardElement?.type || '') === 'pcb_panel') {
            return !panelIds.length || panelIds.includes(panelId)
        }

        return Boolean(boardId && boardIds.includes(boardId))
    }

    /**
     * Builds one cutout loop.
     * @param {object} cutout Cutout element.
     * @param {{ boardDrillQuality?: string }} options Adapter options.
     * @returns {{ points: { x: number, y: number }[], sourceId?: string } | null}
     */
    static #buildCutout(cutout, options) {
        const outline = PcbScene3dCircuitJsonGeometry.#cutoutOutlinePoints(
            cutout,
            options
        )
        if (outline.length < 3) {
            return null
        }

        return {
            points: outline,
            sourceId: String(cutout?.pcb_cutout_id || cutout?.cutout_id || '')
        }
    }

    /**
     * Resolves cutout outline points from polygon, rectangle, or circle fields.
     * @param {object} cutout Cutout element.
     * @param {{ boardDrillQuality?: string }} options Adapter options.
     * @returns {{ x: number, y: number }[]}
     */
    static #cutoutOutlinePoints(cutout, options) {
        const points = PcbScene3dCircuitJsonGeometry.#array(
            cutout?.points || cutout?.outline || cutout?.polygon || []
        )
            .map((point) => CircuitJsonUnits.pointMmToMil(point))
            .filter((point) => Number.isFinite(point.x + point.y))
        if (points.length >= 3) {
            return points
        }

        const shape = String(cutout?.shape || '').toLowerCase()
        if (shape.includes('circle') || Number(cutout?.radius || 0) > 0) {
            return PcbScene3dCircuitJsonGeometry.#circleCutoutPoints(
                cutout,
                options
            )
        }

        return PcbScene3dCircuitJsonGeometry.#rectCutoutPoints(cutout)
    }

    /**
     * Builds a rectangular cutout loop.
     * @param {object} cutout Cutout element.
     * @returns {{ x: number, y: number }[]}
     */
    static #rectCutoutPoints(cutout) {
        const center = CircuitJsonUnits.pointMmToMil(
            cutout?.center || {
                x: cutout?.x,
                y: cutout?.y
            }
        )
        const width = CircuitJsonUnits.mmToMil(cutout?.width, 0)
        const height = CircuitJsonUnits.mmToMil(cutout?.height, 0)
        if (width <= 0 || height <= 0) {
            return []
        }

        const halfWidth = width / 2
        const halfHeight = height / 2
        return PcbScene3dCircuitJsonGeometry.#rotatePointObjects(
            [
                { x: center.x - halfWidth, y: center.y - halfHeight },
                { x: center.x + halfWidth, y: center.y - halfHeight },
                { x: center.x + halfWidth, y: center.y + halfHeight },
                { x: center.x - halfWidth, y: center.y + halfHeight }
            ],
            center,
            PcbScene3dCircuitJsonGeometry.#rotationDeg(cutout)
        )
    }

    /**
     * Builds a circular cutout loop.
     * @param {object} cutout Cutout element.
     * @param {{ boardDrillQuality?: string }} options Adapter options.
     * @returns {{ x: number, y: number }[]}
     */
    static #circleCutoutPoints(cutout, options) {
        const center = CircuitJsonUnits.pointMmToMil(
            cutout?.center || {
                x: cutout?.x,
                y: cutout?.y
            }
        )
        const radius = CircuitJsonUnits.mmToMil(
            cutout?.radius || Number(cutout?.diameter || 0) / 2,
            0
        )
        if (radius <= 0) {
            return []
        }

        const pointCount =
            PcbScene3dCircuitJsonGeometry.#drillQualityPointCount(
                options?.boardDrillQuality,
                CIRCLE_CUTOUT_POINTS
            )
        return Array.from({ length: pointCount }, (_entry, index) => {
            const angle = (Math.PI * 2 * index) / pointCount
            return {
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius
            }
        })
    }

    /**
     * Resolves one rotation value in degrees.
     * @param {object} source Source object.
     * @returns {number}
     */
    static #rotationDeg(source) {
        const rotation = source?.ccw_rotation ?? source?.rotation ?? 0
        if (rotation && typeof rotation === 'object') {
            return Number(
                rotation.degrees ?? rotation.degree ?? rotation.deg ?? 0
            )
        }
        return Number(rotation || 0)
    }

    /**
     * Rotates point objects around a center.
     * @param {{ x: number, y: number }[]} points Source points.
     * @param {{ x: number, y: number }} center Rotation center.
     * @param {number} rotationDeg Rotation angle in degrees.
     * @returns {{ x: number, y: number }[]}
     */
    static #rotatePointObjects(points, center, rotationDeg) {
        if (Math.abs(Number(rotationDeg || 0)) < 0.001) {
            return points
        }

        const angle = (Number(rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return points.map((point) => {
            const dx = Number(point.x || 0) - Number(center.x || 0)
            const dy = Number(point.y || 0) - Number(center.y || 0)
            return {
                x: Number(center.x || 0) + dx * cos - dy * sin,
                y: Number(center.y || 0) + dx * sin + dy * cos
            }
        })
    }

    /**
     * Resolves a point count from a drill quality label.
     * @param {unknown} quality Candidate quality.
     * @param {number} fallback Fallback point count.
     * @returns {number}
     */
    static #drillQualityPointCount(quality, fallback) {
        return (
            DRILL_QUALITY_POINTS[
                PcbScene3dCircuitJsonGeometry.normalizeDrillQuality(quality)
            ] || fallback
        )
    }

    /**
     * Returns all string ids from singular or array target fields.
     * @param {object} source Source object.
     * @param {string[]} fields Target field names.
     * @returns {string[]}
     */
    static #targetIds(source, fields) {
        return fields
            .flatMap((field) =>
                PcbScene3dCircuitJsonGeometry.#array(source?.[field])
            )
            .concat(
                fields
                    .filter((field) => !Array.isArray(source?.[field]))
                    .map((field) => source?.[field])
            )
            .map((value) => String(value || '').trim())
            .filter(Boolean)
    }

    /**
     * Returns the first positive finite number.
     * @param {unknown[]} values Candidate values.
     * @returns {number}
     */
    static #firstPositive(values) {
        for (const value of values) {
            const number = Number(value)
            if (Number.isFinite(number) && number > 0) {
                return number
            }
        }
        return 0
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
