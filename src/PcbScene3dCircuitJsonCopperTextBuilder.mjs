import { CircuitJsonUnits } from 'circuitjson-toolkit'
import { PcbScene3dCircuitJsonLayer } from './PcbScene3dCircuitJsonLayer.mjs'
import { PcbScene3dCircuitJsonSourceLayer } from './PcbScene3dCircuitJsonSourceLayer.mjs'
import { PcbScene3dCopperTextFactory } from './PcbScene3dCopperTextFactory.mjs'
import { PcbScene3dPreparedPolygon } from './PcbScene3dPreparedPolygon.mjs'

const TEXT_TYPES = [
    'pcb_copper_text',
    'pcb_note_text',
    'pcb_fabrication_note_text'
]

/**
 * Projects CircuitJSON text with outer-copper provenance into scene copper
 * primitives while resolving matching solder-mask openings.
 */
export class PcbScene3dCircuitJsonCopperTextBuilder {
    /**
     * Builds visible and mask-covered copper text primitives.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @returns {object[]}
     */
    static build(index) {
        const texts = TEXT_TYPES.flatMap(
            (type) => index.elementsByType.get(type) || []
        ).filter(PcbScene3dCircuitJsonCopperTextBuilder.#isVisibleText)
        const maskIndex =
            PcbScene3dCircuitJsonCopperTextBuilder.#buildMaskIndex(
                texts.filter((text) =>
                    PcbScene3dCircuitJsonCopperTextBuilder.#maskSide(text)
                )
            )

        return texts
            .map((text) =>
                PcbScene3dCircuitJsonCopperTextBuilder.#buildText(
                    text,
                    maskIndex
                )
            )
            .filter(Boolean)
    }

    /**
     * Indexes projected mask geometry by side and exact rendered text.
     * @param {object[]} maskTexts Solder-mask source text rows.
     * @returns {Map<string, object[]>}
     */
    static #buildMaskIndex(maskTexts) {
        const index = new Map()
        maskTexts.forEach((maskText) => {
            const side =
                PcbScene3dCircuitJsonCopperTextBuilder.#maskSide(maskText)
            const geometry =
                PcbScene3dCircuitJsonCopperTextBuilder.#textGeometry(maskText)
            const key = PcbScene3dCircuitJsonCopperTextBuilder.#maskIndexKey(
                side,
                geometry.value
            )
            if (!index.has(key)) index.set(key, [])
            index.get(key).push(geometry)
        })
        return index
    }

    /**
     * Builds a collision-safe mask lookup key.
     * @param {'top' | 'bottom'} side Board side.
     * @param {unknown} value Rendered text value.
     * @returns {string}
     */
    static #maskIndexKey(side, value) {
        return JSON.stringify([side, String(value ?? '')])
    }

    /**
     * Returns pre-indexed mask candidates for one copper text primitive.
     * @param {Map<string, object[]>} maskIndex Mask geometry index.
     * @param {'top' | 'bottom'} side Copper side.
     * @param {object} geometry Copper text geometry.
     * @returns {object[]}
     */
    static #maskCandidates(maskIndex, side, geometry) {
        return (
            maskIndex.get(
                PcbScene3dCircuitJsonCopperTextBuilder.#maskIndexKey(
                    side,
                    geometry?.value
                )
            ) || []
        )
    }

    /**
     * Builds one copper text primitive.
     * @param {object} text CircuitJSON text element.
     * @param {Map<string, object[]>} maskIndex Indexed solder-mask geometry.
     * @returns {object | null}
     */
    static #buildText(text, maskIndex) {
        const side = PcbScene3dCircuitJsonCopperTextBuilder.#copperSide(text)
        if (!side) return null

        const geometry =
            PcbScene3dCircuitJsonCopperTextBuilder.#textGeometry(text)
        const explicitOpening =
            PcbScene3dCircuitJsonCopperTextBuilder.#explicitMaskOpening(text)
        const solderMaskOpening =
            explicitOpening ??
            PcbScene3dCircuitJsonCopperTextBuilder.#maskCandidates(
                maskIndex,
                side,
                geometry
            ).some((maskGeometry) =>
                PcbScene3dCircuitJsonCopperTextBuilder.#maskCoversCopperText(
                    geometry,
                    maskGeometry
                )
            )

        return {
            sourceId: PcbScene3dCircuitJsonCopperTextBuilder.#sourceId(text),
            sourceType: String(text?.source_type || text?.sourceType || ''),
            ...geometry,
            layer: side === 'bottom' ? 'B.Cu' : 'F.Cu',
            side: side === 'bottom' ? 'back' : 'front',
            layerId: PcbScene3dCircuitJsonLayer.layerId(side),
            hasSolderMask: !solderMaskOpening,
            solderMaskOpening
        }
    }

    /**
     * Builds viewer text geometry in mils.
     * @param {object} text CircuitJSON text element.
     * @returns {object}
     */
    static #textGeometry(text) {
        const position =
            PcbScene3dCircuitJsonCopperTextBuilder.#textPosition(text)
        const alignment =
            PcbScene3dCircuitJsonCopperTextBuilder.#textAlignment(text)

        return {
            x: CircuitJsonUnits.mmToMil(position.x, 0),
            y: CircuitJsonUnits.mmToMil(position.y, 0),
            value: String(text?.text ?? text?.value ?? ''),
            rotation: Number(text?.ccw_rotation ?? text?.rotation ?? 0),
            mirrored:
                text?.is_mirrored === true ||
                text?.is_mirrored_from_top_view === true ||
                text?.mirrored === true,
            hAlign: alignment.hAlign,
            vAlign: alignment.vAlign,
            sizeX: CircuitJsonUnits.mmToMil(
                text?.font_width ??
                    text?.fontWidth ??
                    text?.font_size ??
                    text?.fontSize,
                1
            ),
            sizeY: CircuitJsonUnits.mmToMil(
                text?.font_height ??
                    text?.fontHeight ??
                    text?.font_size ??
                    text?.fontSize,
                1
            ),
            thickness: CircuitJsonUnits.mmToMil(
                text?.stroke_width ?? text?.strokeWidth,
                0.12
            )
        }
    }

    /**
     * Resolves the text insertion point in millimeters.
     * @param {object} text CircuitJSON text element.
     * @returns {{ x: number, y: number }}
     */
    static #textPosition(text) {
        const position = text?.anchor_position || text?.position || text
        const x = Number(position?.x)
        const y = Number(position?.y)
        return {
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0
        }
    }

    /**
     * Resolves viewer alignment from canonical anchor metadata.
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
        return {
            hAlign: value.includes('left')
                ? 'left'
                : value.includes('right')
                  ? 'right'
                  : 'center',
            vAlign: value.includes('bottom')
                ? 'bottom'
                : value.includes('center') || value.includes('middle')
                  ? 'center'
                  : 'top'
        }
    }

    /**
     * Checks whether a canonical text row is visible.
     * @param {object} text CircuitJSON text element.
     * @returns {boolean}
     */
    static #isVisibleText(text) {
        return text?.is_hidden !== true && text?.isHidden !== true
    }

    /**
     * Resolves a copper source layer to an outer board side.
     * @param {object} text CircuitJSON text element.
     * @returns {'top' | 'bottom' | null}
     */
    static #copperSide(text) {
        if (String(text?.type || '') === 'pcb_copper_text') {
            return PcbScene3dCircuitJsonLayer.surfaceSide(text?.layer)
        }
        return PcbScene3dCircuitJsonSourceLayer.outerCopperSide(text)
    }

    /**
     * Resolves a solder-mask source layer to an outer board side.
     * @param {object} text CircuitJSON text element.
     * @returns {'top' | 'bottom' | null}
     */
    static #maskSide(text) {
        return PcbScene3dCircuitJsonSourceLayer.solderMaskSide(text)
    }

    /**
     * Resolves explicit solder-mask coverage when provided.
     * @param {object} text CircuitJSON text element.
     * @returns {boolean | null} True when open, false when covered, or null.
     */
    static #explicitMaskOpening(text) {
        const value =
            text?.is_covered_with_solder_mask ?? text?.covered_with_solder_mask
        if (typeof value === 'boolean') return !value
        if (value === undefined || value === null || value === '') return null
        const normalized = String(value).trim().toLowerCase()
        if (normalized === 'true') return false
        if (normalized === 'false') return true
        return null
    }

    /**
     * Checks whether one mask text is a compatible geometric cover.
     * @param {object} copperGeometry Projected copper text geometry.
     * @param {object} maskGeometry Projected mask text geometry.
     * @returns {boolean}
     */
    static #maskCoversCopperText(copperGeometry, maskGeometry) {
        if (
            !PcbScene3dCircuitJsonCopperTextBuilder.#compatiblePlacement(
                copperGeometry,
                maskGeometry
            )
        ) {
            return false
        }

        return PcbScene3dCircuitJsonCopperTextBuilder.#strokeGeometryCovers(
            copperGeometry,
            maskGeometry
        )
    }

    /**
     * Checks non-size fields required for paired source text.
     * @param {object} copper Copper geometry.
     * @param {object} mask Mask geometry.
     * @returns {boolean}
     */
    static #compatiblePlacement(copper, mask) {
        return (
            String(copper?.value || '') === String(mask?.value || '') &&
            PcbScene3dCircuitJsonCopperTextBuilder.#near(copper?.x, mask?.x) &&
            PcbScene3dCircuitJsonCopperTextBuilder.#near(copper?.y, mask?.y) &&
            PcbScene3dCircuitJsonCopperTextBuilder.#nearRotation(
                copper?.rotation,
                mask?.rotation
            ) &&
            Boolean(copper?.mirrored) === Boolean(mask?.mirrored) &&
            copper?.hAlign === mask?.hAlign &&
            copper?.vAlign === mask?.vAlign
        )
    }

    /**
     * Checks whether mask stroke polygons fully cover copper stroke polygons.
     * @param {object} copper Copper geometry.
     * @param {object} mask Mask geometry.
     * @returns {boolean}
     */
    static #strokeGeometryCovers(copper, mask) {
        if (
            PcbScene3dCircuitJsonCopperTextBuilder.#near(
                copper?.sizeX,
                mask?.sizeX
            ) &&
            PcbScene3dCircuitJsonCopperTextBuilder.#near(
                copper?.sizeY,
                mask?.sizeY
            ) &&
            Number(mask?.thickness) + 0.001 >= Number(copper?.thickness)
        ) {
            return true
        }

        const copperCutouts = PcbScene3dCopperTextFactory.strokeCutouts(copper)
        const maskCutouts = PcbScene3dCopperTextFactory.strokeCutouts(mask, {
            alignmentStrokeWidth: copper?.thickness
        })
        if (
            !copperCutouts.length ||
            copperCutouts.length !== maskCutouts.length
        ) {
            return false
        }

        const preparedMasks = maskCutouts.map(
            (cutout) => new PcbScene3dPreparedPolygon(cutout)
        )
        // Glyph segments retain source order and each capsule is convex, so
        // vertex containment proves full coverage without sampling or unions.
        return copperCutouts.every((cutout, index) =>
            cutout.every((point) =>
                preparedMasks[index].containsPointOrBoundary(point)
            )
        )
    }

    /**
     * Checks two projected coordinates with float-conversion tolerance.
     * @param {unknown} left First value.
     * @param {unknown} right Second value.
     * @returns {boolean}
     */
    static #near(left, right) {
        return Math.abs(Number(left) - Number(right)) <= 0.001
    }

    /**
     * Checks two degree rotations modulo one full turn.
     * @param {unknown} left First rotation.
     * @param {unknown} right Second rotation.
     * @returns {boolean}
     */
    static #nearRotation(left, right) {
        const delta = Math.abs(Number(left) - Number(right)) % 360
        return Math.min(delta, 360 - delta) <= 0.001
    }

    /**
     * Resolves a stable source identifier.
     * @param {object} text CircuitJSON text element.
     * @returns {string}
     */
    static #sourceId(text) {
        return String(
            text?.pcb_copper_text_id ||
                text?.pcb_note_text_id ||
                text?.pcb_fabrication_note_text_id ||
                text?.id ||
                ''
        )
    }
}
