import { CircuitJsonDocumentContext } from 'circuitjson-toolkit'
import { CircuitJsonBomBuilder } from 'circuitjson-toolkit/extensions'
import { PcbScene3dCircuitJsonGeometry } from './PcbScene3dCircuitJsonGeometry.mjs'
import { PcbScene3dCircuitJsonInput } from './PcbScene3dCircuitJsonInput.mjs'
import { PcbScene3dText } from './PcbScene3dText.mjs'

/**
 * Renders the interactive 3D scene shell.
 */
export class PcbScene3dShellRenderer {
    /**
     * Renders the interactive 3D scene shell.
     * @param {{ pcb?: { boardOutline: { widthMil: number, heightMil: number }, components: { designator: string }[] }, bom: { quantity: number }[] }} documentModel
     * @param {((key: string) => string) | null} [translate] Translation lookup.
     * @param {{ initialToggles?: { 'external-models'?: boolean, 'fallback-bodies'?: boolean, copper?: boolean } }} [options] Rendering options.
     * @returns {string}
     */
    static render(documentModel, translate = null, options = {}) {
        const t = PcbScene3dText.createTranslator(translate)
        const summary = PcbScene3dShellRenderer.#summary(documentModel, options)
        if (!summary) {
            return (
                '<section class="viewer-empty">' +
                PcbScene3dShellRenderer.#escapeHtml(t('scene3d.noPcb')) +
                '</section>'
            )
        }

        const widthMil = Math.round(summary.widthMil || 0)
        const heightMil = Math.round(summary.heightMil || 0)
        const componentCount = summary.componentCount
        const bomRows = summary.bomRows

        return (
            '<section class="scene-3d"><header class="svg-panel__header"><h3>' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.title')) +
            '</h3><p>' +
            widthMil +
            ' x ' +
            heightMil +
            ' ' +
            PcbScene3dShellRenderer.#escapeHtml(
                t('scene3d.boardEnvelopeSuffix')
            ) +
            '</p></header>' +
            '<div class="scene-3d__toolbar" aria-label="' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.toolbarAria')) +
            '">' +
            '<button class="scene-3d__preset" type="button" data-scene-3d-preset="top">' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.top')) +
            '</button>' +
            '<button class="scene-3d__preset" type="button" data-scene-3d-preset="bottom">' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.bottom')) +
            '</button>' +
            '<button class="scene-3d__preset" type="button" data-scene-3d-preset="isometric">' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.isometric')) +
            '</button>' +
            '<button class="scene-3d__preset scene-3d__action" type="button" data-scene-3d-export="models-zip">' +
            PcbScene3dShellRenderer.#escapeHtml(
                t('scene3d.downloadModelsZip')
            ) +
            '</button>' +
            '</div>' +
            '<div class="scene-3d__stage">' +
            '<div class="scene-3d__viewport" aria-label="' +
            PcbScene3dShellRenderer.#escapeHtml(
                t('scene3d.interactiveViewAria')
            ) +
            '">' +
            '<div class="scene-3d__canvas-mount" data-scene-3d-viewport></div>' +
            '<div class="scene-3d__loading" data-scene-3d-loading aria-live="polite">' +
            '<div class="scene-3d__loading-content"><div class="viewer-loading__pulse"></div><p>' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.loading')) +
            '</p></div></div>' +
            '</div>' +
            '<aside class="scene-3d__controls" aria-label="' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.controlsAria')) +
            '">' +
            '<label class="scene-3d__toggle"><input type="checkbox"' +
            PcbScene3dShellRenderer.#checkedAttribute(
                options,
                'external-models',
                true
            ) +
            ' data-scene-3d-toggle="external-models" />' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.externalModels')) +
            '</label>' +
            '<label class="scene-3d__toggle"><input type="checkbox"' +
            PcbScene3dShellRenderer.#checkedAttribute(
                options,
                'fallback-bodies',
                false
            ) +
            ' data-scene-3d-toggle="fallback-bodies" />' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.fallbackBodies')) +
            '</label>' +
            '<label class="scene-3d__toggle"><input type="checkbox"' +
            PcbScene3dShellRenderer.#checkedAttribute(options, 'copper', true) +
            ' data-scene-3d-toggle="copper" />' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.copperDetail')) +
            '</label>' +
            '<section class="scene-3d__selection" aria-live="polite"><h4 class="scene-3d__selection-title">' +
            PcbScene3dShellRenderer.#escapeHtml(
                t('scene3d.componentInspector')
            ) +
            '</h4><p class="scene-3d__selection-empty">' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.inspectPrompt')) +
            '</p></section>' +
            '</aside>' +
            '</div>' +
            '<div class="scene-3d__diagnostics" aria-live="polite">' +
            PcbScene3dShellRenderer.#escapeHtml(
                t('scene3d.companionModelsHint')
            ) +
            '</div>' +
            '<dl class="scene-3d__stats"><div><dt>' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.footprint')) +
            '</dt><dd>' +
            widthMil +
            ' x ' +
            heightMil +
            ' mil</dd></div><div><dt>' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.placements')) +
            '</dt><dd>' +
            componentCount +
            ' ' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.componentsSuffix')) +
            '</dd></div><div><dt>' +
            PcbScene3dShellRenderer.#escapeHtml(t('scene3d.bomGroups')) +
            '</dt><dd>' +
            bomRows +
            '</dd></div></dl></section>'
        )
    }

    /**
     * Resolves shell statistics from legacy or canonical CircuitJSON input.
     * @param {unknown} documentModel Document input.
     * @param {{ drawFauxBoard?: boolean }} options Shell and adapter options.
     * @returns {{ widthMil: number, heightMil: number, componentCount: number, bomRows: number } | null}
     */
    static #summary(documentModel, options) {
        const legacyPcb = PcbScene3dShellRenderer.#ownData(documentModel, 'pcb')
        if (legacyPcb && typeof legacyPcb === 'object') {
            const boardOutline = legacyPcb.boardOutline || {}
            const components = Array.isArray(legacyPcb.components)
                ? legacyPcb.components
                : []
            const bom = PcbScene3dShellRenderer.#ownData(documentModel, 'bom')
            return {
                widthMil: Number(boardOutline.widthMil || 0),
                heightMil: Number(boardOutline.heightMil || 0),
                componentCount: components.length,
                bomRows: Array.isArray(bom) ? bom.length : 0
            }
        }
        if (!PcbScene3dCircuitJsonInput.isModel(documentModel)) return null

        const context = CircuitJsonDocumentContext.prepare(documentModel, {
            indexes: ['elements']
        })
        const index = context.getIndex('elements')
        if (
            !index.elementsByType.get('pcb_board')?.length &&
            !index.elementsByType.get('pcb_panel')?.length &&
            !(
                options?.drawFauxBoard === true &&
                index.elementsByType.get('pcb_component')?.length
            )
        ) {
            return null
        }
        const board = PcbScene3dCircuitJsonGeometry.buildBoard(index, options)
        return {
            widthMil: board.widthMil,
            heightMil: board.heightMil,
            componentCount: (index.elementsByType.get('pcb_component') || [])
                .length,
            bomRows: CircuitJsonBomBuilder.build(context.model).length
        }
    }

    /**
     * Reads one own data property without invoking accessors.
     * @param {unknown} value Record candidate.
     * @param {PropertyKey} key Property key.
     * @returns {unknown}
     */
    static #ownData(value, key) {
        if (!value || typeof value !== 'object') return undefined
        try {
            const descriptor = Object.getOwnPropertyDescriptor(value, key)
            return descriptor && Object.hasOwn(descriptor, 'value')
                ? descriptor.value
                : undefined
        } catch {
            return undefined
        }
    }

    /**
     * Returns the checkbox checked attribute for one scene toggle.
     * @param {{ initialToggles?: Record<string, boolean> }} options Renderer options.
     * @param {string} toggleName Toggle identifier.
     * @param {boolean} defaultChecked Package default state.
     * @returns {string}
     */
    static #checkedAttribute(options, toggleName, defaultChecked) {
        const initialToggles = options?.initialToggles || {}
        const checked = Object.prototype.hasOwnProperty.call(
            initialToggles,
            toggleName
        )
            ? initialToggles[toggleName] === true
            : defaultChecked

        return checked ? ' checked' : ''
    }

    /**
     * Escapes markup text.
     * @param {string} value Raw text.
     * @returns {string}
     */
    static #escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
    }
}

export { PcbScene3dShellRenderer as Scene3dRenderer }
