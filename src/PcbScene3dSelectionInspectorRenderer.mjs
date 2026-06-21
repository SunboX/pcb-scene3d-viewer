/**
 * Renders selected-component inspector markup and normalizes live transform
 * adjustment values.
 */
export class PcbScene3dSelectionInspectorRenderer {
    /**
     * Renders the empty inspector state.
     * @param {(key: string) => string} translate Translation lookup.
     * @returns {string}
     */
    static renderEmpty(translate) {
        return (
            '<h4 class="scene-3d__selection-title">' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                translate('scene3d.componentInspector')
            ) +
            '</h4><p class="scene-3d__selection-empty">' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                translate('scene3d.inspectPrompt')
            ) +
            '</p>'
        )
    }

    /**
     * Renders a no-metadata state for a selected designator.
     * @param {string} designator Selected designator.
     * @param {(key: string) => string} translate Translation lookup.
     * @returns {string}
     */
    static renderMissing(designator, translate) {
        return (
            '<h4 class="scene-3d__selection-title">' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                translate('scene3d.componentInspector')
            ) +
            '</h4><p class="scene-3d__selection-empty">' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                translate('scene3d.noMetadataFor')
            ) +
            ' ' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(designator) +
            '.</p>'
        )
    }

    /**
     * Renders selected component details and optional editable transform controls.
     * @param {{ designator: string, hidden?: boolean, selection?: { sourceType?: string } | null, selectionEntry: { component: any | null, externalPlacement: any | null }, adjustment: { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }, includeControls?: boolean, translate: (key: string) => string }} options Render options.
     * @returns {string}
     */
    static renderSelected(options) {
        const component = options.selectionEntry.component
        const externalPlacement = options.selectionEntry.externalPlacement
        const hidden = options.hidden === true
        const fields = [
            [options.translate('scene3d.designator'), options.designator],
            [
                options.translate('scene3d.picked'),
                options.selection?.sourceType === 'external-model'
                    ? options.translate('scene3d.externalModel')
                    : options.translate('scene3d.fallbackBody')
            ],
            [
                options.translate('scene3d.mountSide'),
                externalPlacement?.mountSide || component?.mountSide || ''
            ],
            [
                options.translate('scene3d.rotation'),
                PcbScene3dSelectionInspectorRenderer.#formatValue(
                    component?.rotationDeg ?? externalPlacement?.rotationDeg,
                    'deg'
                )
            ],
            [
                options.translate('scene3d.boardPosition'),
                component?.boardPositionMil
                    ? PcbScene3dSelectionInspectorRenderer.#formatPoint(
                          component.boardPositionMil,
                          true
                      )
                    : ''
            ],
            [
                options.translate('scene3d.pattern'),
                String(component?.pattern || '')
            ],
            [
                options.translate('scene3d.source'),
                String(component?.source || '')
            ],
            [
                options.translate('scene3d.model'),
                PcbScene3dSelectionInspectorRenderer.#formatModelName(
                    externalPlacement,
                    component
                )
            ],
            [
                options.translate('scene3d.bodyPosition'),
                externalPlacement?.bodyPositionMil
                    ? PcbScene3dSelectionInspectorRenderer.#formatPoint(
                          externalPlacement.bodyPositionMil,
                          false
                      )
                    : ''
            ],
            [
                options.translate('scene3d.bodyRotation'),
                PcbScene3dSelectionInspectorRenderer.#formatValue(
                    externalPlacement?.bodyRotationDeg,
                    'deg'
                )
            ],
            [
                options.translate('scene3d.modelRotation'),
                PcbScene3dSelectionInspectorRenderer.#formatRotation(
                    externalPlacement?.modelTransform?.rotationDeg
                )
            ],
            [
                'dz',
                PcbScene3dSelectionInspectorRenderer.#formatValue(
                    externalPlacement?.modelTransform?.dzMil,
                    'mil'
                )
            ]
        ].filter(([, value]) => String(value || '').trim())

        return (
            '<div class="scene-3d__selection-header"><h4 class="scene-3d__selection-title">' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                options.translate('scene3d.componentInspector')
            ) +
            '</h4>' +
            PcbScene3dSelectionInspectorRenderer.#renderVisibilityToggle(
                options.designator,
                options.selection?.sourceType || '',
                hidden,
                options.translate
            ) +
            '</div><dl class="scene-3d__selection-list">' +
            fields
                .map(
                    ([label, value]) =>
                        '<div class="scene-3d__selection-field"><dt>' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                            label
                        ) +
                        '</dt><dd>' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                            String(value)
                        ) +
                        '</dd></div>'
                )
                .join('') +
            '</dl>' +
            (options.includeControls === false
                ? ''
                : PcbScene3dSelectionInspectorRenderer.renderControls(
                      options.adjustment,
                      options.translate
                  ))
        )
    }

    /**
     * Renders an empty transform-control host state.
     * @param {(key: string) => string} translate Translation lookup.
     * @returns {string}
     */
    static renderControlsEmpty(translate) {
        return (
            '<p class="scene-3d__selection-empty">' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                translate('scene3d.inspectPrompt')
            ) +
            '</p>'
        )
    }

    /**
     * Renders a missing-metadata transform-control host state.
     * @param {string} designator Selected designator.
     * @param {(key: string) => string} translate Translation lookup.
     * @returns {string}
     */
    static renderControlsMissing(designator, translate) {
        return (
            '<p class="scene-3d__selection-empty">' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                translate('scene3d.noMetadataFor')
            ) +
            ' ' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(designator) +
            '.</p>'
        )
    }

    /**
     * Renders selected component transform controls for an external host.
     * @param {{ designator: string, adjustment: { scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }, translate: (key: string) => string }} options Render options.
     * @returns {string}
     */
    static renderControlsPanel(options) {
        return (
            '<div class="scene-3d__adjustment-target"><span>' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                options.translate('scene3d.designator')
            ) +
            '</span><strong>' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                options.designator
            ) +
            '</strong></div>' +
            PcbScene3dSelectionInspectorRenderer.renderControls(
                options.adjustment,
                options.translate
            )
        )
    }

    /**
     * Renders editable transform controls.
     * @param {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }} adjustment Current adjustment.
     * @param {(key: string) => string} translate Translation lookup.
     * @returns {string}
     */
    static renderControls(adjustment, translate) {
        return (
            '<div class="scene-3d__adjustments">' +
            PcbScene3dSelectionInspectorRenderer.#renderGroup(
                translate('scene3d.scale'),
                [
                    ['scale.x', 'X', adjustment.scale.x, '0.0001', 4],
                    ['scale.y', 'Y', adjustment.scale.y, '0.0001', 4],
                    ['scale.z', 'Z', adjustment.scale.z, '0.0001', 4]
                ]
            ) +
            PcbScene3dSelectionInspectorRenderer.#renderGroup(
                translate('scene3d.rotation'),
                [
                    ['rotation.x', 'X', adjustment.rotationDeg.x, '0.01', 2],
                    ['rotation.y', 'Y', adjustment.rotationDeg.y, '0.01', 2],
                    ['rotation.z', 'Z', adjustment.rotationDeg.z, '0.01', 2]
                ]
            ) +
            PcbScene3dSelectionInspectorRenderer.#renderGroup(
                translate('scene3d.offset'),
                [
                    [
                        'offset.x',
                        'X',
                        PcbScene3dSelectionInspectorRenderer.milToMm(
                            adjustment.offsetMil.x
                        ),
                        '0.000001',
                        6
                    ],
                    [
                        'offset.y',
                        'Y',
                        PcbScene3dSelectionInspectorRenderer.milToMm(
                            adjustment.offsetMil.y
                        ),
                        '0.000001',
                        6
                    ],
                    [
                        'offset.z',
                        'Z',
                        PcbScene3dSelectionInspectorRenderer.milToMm(
                            adjustment.offsetMil.z
                        ),
                        '0.000001',
                        6
                    ]
                ]
            ) +
            '<button class="scene-3d__adjustment-reset" type="button" data-scene-3d-adjustment-reset>' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                translate('scene3d.resetTransform')
            ) +
            '</button></div>'
        )
    }

    /**
     * Resolves the original adjustment for one selected component.
     * @param {Map<string, { externalPlacement: any | null }>} selectionIndex Selection lookup.
     * @param {string} designator Selected designator.
     * @returns {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }}
     */
    static resolveBaseline(selectionIndex, designator) {
        const modelTransform =
            selectionIndex.get(designator)?.externalPlacement?.modelTransform ||
            null
        const rotationDeg = modelTransform?.rotationDeg || {}
        const scale = modelTransform?.scale || {}

        return {
            scale: {
                x: PcbScene3dSelectionInspectorRenderer.numberOr(scale.x, 1),
                y: PcbScene3dSelectionInspectorRenderer.numberOr(scale.y, 1),
                z: PcbScene3dSelectionInspectorRenderer.numberOr(scale.z, 1)
            },
            rotationDeg: {
                x: PcbScene3dSelectionInspectorRenderer.numberOr(
                    rotationDeg.x,
                    0
                ),
                y: PcbScene3dSelectionInspectorRenderer.numberOr(
                    rotationDeg.y,
                    0
                ),
                z: PcbScene3dSelectionInspectorRenderer.numberOr(
                    rotationDeg.z,
                    0
                )
            },
            offsetMil:
                PcbScene3dSelectionInspectorRenderer.resolveModelOffsetMil(
                    modelTransform
                )
        }
    }

    /**
     * Finds an adjustment input from an event target.
     * @param {any} target Event target.
     * @returns {any | null}
     */
    static closestInput(target) {
        const closest = target?.closest?.('[data-scene-3d-adjustment]')
        return closest || target?.getAttribute?.('data-scene-3d-adjustment')
            ? closest || target
            : null
    }

    /**
     * Writes one input value into a cloned adjustment object.
     * @param {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }} adjustment Mutable adjustment.
     * @param {string} path Adjustment path.
     * @param {number} value Input value.
     * @returns {boolean}
     */
    static writePath(adjustment, path, value) {
        const [group, axis] = String(path || '').split('.')
        if (!['x', 'y', 'z'].includes(axis)) return false
        if (group === 'scale') adjustment.scale[axis] = value
        else if (group === 'rotation') adjustment.rotationDeg[axis] = value
        else if (group === 'offset') {
            adjustment.offsetMil[axis] =
                PcbScene3dSelectionInspectorRenderer.mmToMil(value)
        } else return false
        return true
    }

    /**
     * Clones one adjustment object.
     * @param {{ scale: object, rotationDeg: object, offsetMil: object }} adjustment Source adjustment.
     * @returns {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }}
     */
    static cloneAdjustment(adjustment) {
        return {
            scale: { ...adjustment.scale },
            rotationDeg: { ...adjustment.rotationDeg },
            offsetMil: { ...adjustment.offsetMil }
        }
    }

    /**
     * Converts mil to millimeters.
     * @param {number} milValue Mil value.
     * @returns {number}
     */
    static milToMm(milValue) {
        return (
            Number(milValue || 0) /
            PcbScene3dSelectionInspectorRenderer.#milsPerMm()
        )
    }

    /**
     * Converts millimeters to mil.
     * @param {number} mmValue Millimeter value.
     * @returns {number}
     */
    static mmToMil(mmValue) {
        return (
            Number(mmValue || 0) *
            PcbScene3dSelectionInspectorRenderer.#milsPerMm()
        )
    }

    /**
     * Resolves model offset from current and legacy transform properties.
     * @param {object | null} modelTransform Model transform.
     * @returns {{ x: number, y: number, z: number }}
     */
    static resolveModelOffsetMil(modelTransform) {
        const offsetMil = modelTransform?.offsetMil || {}
        return {
            x: PcbScene3dSelectionInspectorRenderer.numberOr(
                offsetMil.x ?? modelTransform?.dxMil,
                0
            ),
            y: PcbScene3dSelectionInspectorRenderer.numberOr(
                offsetMil.y ?? modelTransform?.dyMil,
                0
            ),
            z: PcbScene3dSelectionInspectorRenderer.numberOr(
                offsetMil.z ?? modelTransform?.dzMil,
                0
            )
        }
    }

    /**
     * Returns a finite number or fallback.
     * @param {unknown} value Source value.
     * @param {number} fallback Fallback value.
     * @returns {number}
     */
    static numberOr(value, fallback) {
        const numericValue = Number(value)
        return Number.isFinite(numericValue) ? numericValue : fallback
    }

    /**
     * Renders one transform control group.
     * @param {string} title Group title.
     * @param {Array<[string, string, number, string, number]>} rows Rows.
     * @returns {string}
     */
    static #renderGroup(title, rows) {
        return (
            '<fieldset class="scene-3d__adjustment-group"><legend>' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(title) +
            '</legend>' +
            rows
                .map(
                    ([path, axis, value, step, decimals]) =>
                        '<label class="scene-3d__adjustment-row"><span>' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(axis) +
                        '</span><span class="scene-3d__adjustment-input-wrap"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" step="' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(step) +
                        '" value="' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                            PcbScene3dSelectionInspectorRenderer.#formatFixed(
                                value,
                                decimals
                            )
                        ) +
                        '" data-scene-3d-adjustment="' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(path) +
                        '" aria-label="' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(
                            title + ' ' + axis
                        ) +
                        '" /><span class="scene-3d__adjustment-stepper" aria-hidden="true"><button type="button" tabindex="-1" data-scene-3d-adjustment-step="up" data-scene-3d-adjustment-step-for="' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(path) +
                        '"></button><button type="button" tabindex="-1" data-scene-3d-adjustment-step="down" data-scene-3d-adjustment-step-for="' +
                        PcbScene3dSelectionInspectorRenderer.#escapeHtml(path) +
                        '"></button></span></span></label>'
                )
                .join('') +
            '</fieldset>'
        )
    }

    /**
     * Renders the selected-component visibility toggle.
     * @param {string} designator Selected component designator.
     * @param {string} sourceType Selection source type.
     * @param {boolean} hidden Whether the component is hidden.
     * @param {(key: string) => string} translate Translation lookup.
     * @returns {string}
     */
    static #renderVisibilityToggle(designator, sourceType, hidden, translate) {
        const label = hidden
            ? translate('scene3d.showSelectedComponent')
            : translate('scene3d.hideSelectedComponent')
        const iconClass = hidden
            ? 'scene-3d__selection-eye-icon scene-3d__selection-eye-off-icon'
            : 'scene-3d__selection-eye-icon'

        return (
            '<button class="scene-3d__selection-visibility" type="button" data-scene-3d-component-visibility="' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(designator) +
            '" data-scene-3d-component-source="' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(sourceType) +
            '" aria-label="' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(label) +
            '" title="' +
            PcbScene3dSelectionInspectorRenderer.#escapeHtml(label) +
            '" aria-pressed="' +
            (hidden ? 'true' : 'false') +
            '"><span class="' +
            iconClass +
            '" aria-hidden="true">' +
            PcbScene3dSelectionInspectorRenderer.#renderVisibilityIcon(
                !hidden
            ) +
            '</span></button>'
        )
    }

    /**
     * Renders an eye icon for component visibility state.
     * @param {boolean} visible Whether the component is visible.
     * @returns {string}
     */
    static #renderVisibilityIcon(visible) {
        const slash = visible ? '' : '<path d="M4 4l16 16" />'
        return (
            '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />' +
            '<circle cx="12" cy="12" r="2.5" />' +
            slash +
            '</svg>'
        )
    }

    /**
     * Formats a model file label.
     * @param {any} externalPlacement External placement.
     * @param {any} component Component.
     * @returns {string}
     */
    static #formatModelName(externalPlacement, component) {
        const model =
            externalPlacement?.externalModel || component?.externalModel
        return model
            ? String(model.name || '') + ' (' + String(model.format || '') + ')'
            : ''
    }

    /**
     * Formats one rotation triplet.
     * @param {{ x?: number, y?: number, z?: number } | null | undefined} rotationDeg Rotation.
     * @returns {string}
     */
    static #formatRotation(rotationDeg) {
        return rotationDeg
            ? 'X ' +
                  PcbScene3dSelectionInspectorRenderer.#formatNumber(
                      rotationDeg.x
                  ) +
                  ', Y ' +
                  PcbScene3dSelectionInspectorRenderer.#formatNumber(
                      rotationDeg.y
                  ) +
                  ', Z ' +
                  PcbScene3dSelectionInspectorRenderer.#formatNumber(
                      rotationDeg.z
                  )
            : ''
    }

    /**
     * Formats one point.
     * @param {{ x?: number, y?: number, z?: number }} point Point.
     * @param {boolean} includeZ Whether to include Z.
     * @returns {string}
     */
    static #formatPoint(point, includeZ) {
        const values = [
            'X ' + PcbScene3dSelectionInspectorRenderer.#formatNumber(point?.x),
            'Y ' + PcbScene3dSelectionInspectorRenderer.#formatNumber(point?.y)
        ]
        if (includeZ) {
            values.push(
                'Z ' +
                    PcbScene3dSelectionInspectorRenderer.#formatNumber(point?.z)
            )
        }
        return values.join(', ') + ' mil'
    }

    /**
     * Formats one value with a unit.
     * @param {number | undefined} value Value.
     * @param {string} unit Unit.
     * @returns {string}
     */
    static #formatValue(value, unit) {
        if (!Number.isFinite(Number(value))) return ''
        return (
            PcbScene3dSelectionInspectorRenderer.#formatNumber(value) +
            ' ' +
            unit
        )
    }

    /**
     * Formats one compact display number.
     * @param {number | undefined} value Value.
     * @returns {string}
     */
    static #formatNumber(value) {
        const numericValue = Number(value)
        return Number.isFinite(numericValue)
            ? numericValue.toFixed(2).replace(/\.00$/, '')
            : ''
    }

    /**
     * Formats one input number with fixed decimals.
     * @param {number} value Value.
     * @param {number} decimals Decimal places.
     * @returns {string}
     */
    static #formatFixed(value, decimals) {
        const numericValue = Number(value)
        return Number.isFinite(numericValue)
            ? numericValue.toFixed(decimals)
            : ''
    }

    /**
     * Escapes user-facing HTML values.
     * @param {string} value Raw value.
     * @returns {string}
     */
    static #escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    /**
     * Returns mils per millimeter.
     * @returns {number}
     */
    static #milsPerMm() {
        return 1000 / 25.4
    }
}
