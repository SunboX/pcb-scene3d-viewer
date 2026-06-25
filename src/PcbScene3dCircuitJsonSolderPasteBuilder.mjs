import { CircuitJsonUnits } from 'circuitjson-toolkit'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'

const PASTE_COLOR = 0xc7c2b7
const CURVE_SEGMENTS = 32

/**
 * Converts optional CircuitJSON solder-paste shapes into surface artwork.
 */
export class PcbScene3dCircuitJsonSolderPasteBuilder {
    /**
     * Builds opt-in solder-paste overlay detail.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {{ showPcbPaste?: boolean }} options Adapter options.
     * @returns {{ top: object, bottom: object } | undefined}
     */
    static build(index, options = {}) {
        if (options?.showPcbPaste !== true) {
            return undefined
        }

        const top = PcbScene3dCircuitJsonSolderPasteBuilder.#sideDetail()
        const bottom = PcbScene3dCircuitJsonSolderPasteBuilder.#sideDetail()
        ;(index.elementsByType.get('pcb_solder_paste') || []).forEach(
            (paste, pasteIndex) => {
                const fill =
                    PcbScene3dCircuitJsonSolderPasteBuilder.#fillPrimitive(
                        paste,
                        pasteIndex
                    )
                if (!fill) {
                    return
                }

                PcbScene3dCircuitJsonSolderPasteBuilder.#targetSide(
                    paste?.layer,
                    top,
                    bottom
                ).fills.push(fill)
            }
        )

        return { top, bottom }
    }

    /**
     * Builds one side detail container.
     * @returns {object}
     */
    static #sideDetail() {
        return {
            tracks: [],
            arcs: [],
            fills: [],
            texts: [],
            fillColor: PASTE_COLOR,
            strokeColor: PASTE_COLOR
        }
    }

    /**
     * Builds one paste fill primitive.
     * @param {object} paste CircuitJSON solder-paste element.
     * @param {number} pasteIndex Paste element index.
     * @returns {object | null}
     */
    static #fillPrimitive(paste, pasteIndex) {
        const points =
            PcbScene3dCircuitJsonSolderPasteBuilder.#shapePoints(paste)
        if (points.length < 3) {
            return null
        }

        return {
            sourceType: 'pcb_solder_paste',
            sourceId: PcbScene3dCircuitJsonSolderPasteBuilder.#sourceId(
                paste,
                pasteIndex
            ),
            points
        }
    }

    /**
     * Resolves paste shape points in mils.
     * @param {object} paste CircuitJSON solder-paste element.
     * @returns {{ x: number, y: number }[]}
     */
    static #shapePoints(paste) {
        const shape = String(paste?.shape || '').toLowerCase()
        if (shape.includes('circle')) {
            return PcbScene3dCircuitJsonSolderPasteBuilder.#circlePoints(paste)
        }
        if (shape.includes('pill')) {
            return PcbScene3dCircuitJsonSolderPasteBuilder.#pillPoints(paste)
        }
        if (shape.includes('oval') || shape.includes('ellipse')) {
            return PcbScene3dCircuitJsonSolderPasteBuilder.#ovalPoints(paste)
        }

        return PcbScene3dCircuitJsonSolderPasteBuilder.#rectanglePoints(paste)
    }

    /**
     * Resolves one rectangular paste shape.
     * @param {object} paste CircuitJSON solder-paste element.
     * @returns {{ x: number, y: number }[]}
     */
    static #rectanglePoints(paste) {
        const size = PcbScene3dCircuitJsonSolderPasteBuilder.#sizeMil(paste)
        const center = PcbScene3dCircuitJsonSolderPasteBuilder.#centerMil(paste)
        if (!center || size.width <= 0 || size.height <= 0) {
            return []
        }

        return PcbScene3dCircuitJsonSolderPasteBuilder.#rotateLocalPoints(
            [
                { x: -size.width / 2, y: -size.height / 2 },
                { x: size.width / 2, y: -size.height / 2 },
                { x: size.width / 2, y: size.height / 2 },
                { x: -size.width / 2, y: size.height / 2 }
            ],
            center,
            paste
        )
    }

    /**
     * Resolves one circular paste shape.
     * @param {object} paste CircuitJSON solder-paste element.
     * @returns {{ x: number, y: number }[]}
     */
    static #circlePoints(paste) {
        const center = PcbScene3dCircuitJsonSolderPasteBuilder.#centerMil(paste)
        const radius =
            PcbScene3dCircuitJsonSolderPasteBuilder.#circleRadiusMil(paste)
        if (!center || radius <= 0) {
            return []
        }

        return Array.from({ length: CURVE_SEGMENTS }, (_entry, index) => {
            const angle = (Math.PI * 2 * index) / CURVE_SEGMENTS
            return {
                x: center.x + Math.cos(angle) * radius,
                y: center.y + Math.sin(angle) * radius
            }
        })
    }

    /**
     * Resolves one oval paste shape.
     * @param {object} paste CircuitJSON solder-paste element.
     * @returns {{ x: number, y: number }[]}
     */
    static #ovalPoints(paste) {
        const size = PcbScene3dCircuitJsonSolderPasteBuilder.#sizeMil(paste)
        const center = PcbScene3dCircuitJsonSolderPasteBuilder.#centerMil(paste)
        if (!center || size.width <= 0 || size.height <= 0) {
            return []
        }

        return PcbScene3dCircuitJsonSolderPasteBuilder.#rotateLocalPoints(
            Array.from({ length: CURVE_SEGMENTS }, (_entry, index) => {
                const angle = (Math.PI * 2 * index) / CURVE_SEGMENTS
                return {
                    x: Math.cos(angle) * (size.width / 2),
                    y: Math.sin(angle) * (size.height / 2)
                }
            }),
            center,
            paste
        )
    }

    /**
     * Resolves one pill paste shape.
     * @param {object} paste CircuitJSON solder-paste element.
     * @returns {{ x: number, y: number }[]}
     */
    static #pillPoints(paste) {
        const size = PcbScene3dCircuitJsonSolderPasteBuilder.#sizeMil(paste)
        const center = PcbScene3dCircuitJsonSolderPasteBuilder.#centerMil(paste)
        if (!center || size.width <= 0 || size.height <= 0) {
            return []
        }

        const horizontal = size.width >= size.height
        const radius = Math.min(size.width, size.height) / 2
        const span = Math.max(size.width, size.height) / 2 - radius
        const points = []
        for (let index = 0; index <= CURVE_SEGMENTS / 2; index += 1) {
            const angle =
                -Math.PI / 2 + (Math.PI * index) / (CURVE_SEGMENTS / 2)
            points.push(
                PcbScene3dCircuitJsonSolderPasteBuilder.#pillPoint(
                    horizontal,
                    span,
                    radius,
                    angle
                )
            )
        }
        for (let index = 0; index <= CURVE_SEGMENTS / 2; index += 1) {
            const angle = Math.PI / 2 + (Math.PI * index) / (CURVE_SEGMENTS / 2)
            points.push(
                PcbScene3dCircuitJsonSolderPasteBuilder.#pillPoint(
                    horizontal,
                    -span,
                    radius,
                    angle
                )
            )
        }

        return PcbScene3dCircuitJsonSolderPasteBuilder.#rotateLocalPoints(
            points,
            center,
            paste
        )
    }

    /**
     * Builds one local pill arc point.
     * @param {boolean} horizontal Whether the long axis is horizontal.
     * @param {number} span Arc center offset.
     * @param {number} radius Arc radius.
     * @param {number} angle Arc angle in radians.
     * @returns {{ x: number, y: number }}
     */
    static #pillPoint(horizontal, span, radius, angle) {
        return horizontal
            ? {
                  x: span + Math.cos(angle) * radius,
                  y: Math.sin(angle) * radius
              }
            : {
                  x: Math.sin(angle) * radius,
                  y: span + Math.cos(angle) * radius
              }
    }

    /**
     * Resolves one paste element center in mils.
     * @param {object} paste CircuitJSON solder-paste element.
     * @returns {{ x: number, y: number } | null}
     */
    static #centerMil(paste) {
        const point = paste?.center ||
            paste?.position || {
                x: paste?.x,
                y: paste?.y
            }
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

    /**
     * Resolves paste dimensions in mils.
     * @param {object} paste CircuitJSON solder-paste element.
     * @returns {{ width: number, height: number }}
     */
    static #sizeMil(paste) {
        return {
            width: PcbScene3dCircuitJsonSolderPasteBuilder.#positiveMmToMil(
                paste?.width
            ),
            height: PcbScene3dCircuitJsonSolderPasteBuilder.#positiveMmToMil(
                paste?.height
            )
        }
    }

    /**
     * Resolves circle radius in mils.
     * @param {object} paste CircuitJSON solder-paste element.
     * @returns {number}
     */
    static #circleRadiusMil(paste) {
        const radius = PcbScene3dCircuitJsonSolderPasteBuilder.#positiveMmToMil(
            paste?.radius
        )
        if (radius > 0) {
            return radius
        }

        const diameter =
            PcbScene3dCircuitJsonSolderPasteBuilder.#positiveMmToMil(
                paste?.diameter ?? paste?.width
            )
        return diameter > 0 ? diameter / 2 : 0
    }

    /**
     * Rotates and translates local points into board-space mils.
     * @param {{ x: number, y: number }[]} points Local points.
     * @param {{ x: number, y: number }} center Center in mils.
     * @param {object} paste Source paste element.
     * @returns {{ x: number, y: number }[]}
     */
    static #rotateLocalPoints(points, center, paste) {
        const angle =
            (Number(paste?.rotation ?? paste?.ccw_rotation ?? 0) * Math.PI) /
            180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return points.map((point) => ({
            x: center.x + point.x * cos - point.y * sin,
            y: center.y + point.x * sin + point.y * cos
        }))
    }

    /**
     * Resolves side-specific paste detail.
     * @param {unknown} layer Layer value.
     * @param {object} top Top-side paste detail.
     * @param {object} bottom Bottom-side paste detail.
     * @returns {object}
     */
    static #targetSide(layer, top, bottom) {
        return PcbScene3dCircuitJsonLayer.side(layer) === 'bottom'
            ? bottom
            : top
    }

    /**
     * Resolves a stable source ID.
     * @param {object} paste CircuitJSON solder-paste element.
     * @param {number} pasteIndex Paste element index.
     * @returns {string}
     */
    static #sourceId(paste, pasteIndex) {
        return String(
            paste?.pcb_solder_paste_id ||
                paste?.solder_paste_id ||
                paste?.id ||
                'pcb_solder_paste_' + (pasteIndex + 1)
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
}
