import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dSelectionInspectorRenderer } from '../src/PcbScene3dSelectionInspectorRenderer.mjs'
import { PcbScene3dText } from '../src/PcbScene3dText.mjs'

/**
 * Builds the minimal selected component render options.
 * @param {boolean} hidden Whether the component is hidden.
 * @returns {object}
 */
function buildSelectedOptions(hidden) {
    return {
        designator: 'C8',
        hidden,
        selection: {
            sourceType: 'external-model'
        },
        selectionEntry: {
            component: {
                designator: 'C8',
                mountSide: 'top',
                rotationDeg: 90,
                boardPositionMil: { x: 100, y: 200, z: 0 },
                pattern: 'SMT_C_0402'
            },
            externalPlacement: {
                mountSide: 'top',
                externalModel: {
                    name: 'chip.step',
                    format: 'step'
                }
            }
        },
        adjustment: {
            scale: { x: 1, y: 1, z: 1 },
            rotationDeg: { x: 0, y: 0, z: 0 },
            offsetMil: { x: 0, y: 0, z: 0 }
        },
        includeControls: false,
        translate: (key) => PcbScene3dText.fallback(key)
    }
}

test('PcbScene3dSelectionInspectorRenderer renders selected component hide toggle', () => {
    const visibleMarkup = PcbScene3dSelectionInspectorRenderer.renderSelected(
        buildSelectedOptions(false)
    )

    assert.match(visibleMarkup, /data-scene-3d-component-visibility="C8"/)
    assert.match(visibleMarkup, /aria-label="Hide selected component"/)
    assert.match(visibleMarkup, /aria-pressed="false"/)
    assert.match(visibleMarkup, /scene-3d__selection-eye-icon/)

    const hiddenMarkup = PcbScene3dSelectionInspectorRenderer.renderSelected(
        buildSelectedOptions(true)
    )

    assert.match(hiddenMarkup, /aria-label="Show selected component"/)
    assert.match(hiddenMarkup, /aria-pressed="true"/)
    assert.match(hiddenMarkup, /scene-3d__selection-eye-off-icon/)
})
