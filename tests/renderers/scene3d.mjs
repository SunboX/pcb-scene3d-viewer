import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { CircuitJsonDocumentContext } from 'circuitjson-toolkit'
import { DocumentResult } from 'circuitjson-toolkit/parser'
import { PcbScene3dShellRenderer } from '../../src/PcbScene3dShellRenderer.mjs'

/**
 * Builds one canonical model for shell input-shape parity.
 * @returns {object[]}
 */
function createShellCircuitJson() {
    return [
        {
            type: 'pcb_board',
            pcb_board_id: 'board_shell',
            center: { x: 0, y: 0 },
            width: 30.48,
            height: 20.32,
            thickness: 1.6
        },
        {
            type: 'source_component',
            source_component_id: 'source_u1',
            name: 'U1',
            ftype: 'simple_chip'
        },
        {
            type: 'source_component',
            source_component_id: 'source_r1',
            name: 'R1',
            ftype: 'simple_resistor',
            resistance: '10k'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_u1',
            source_component_id: 'source_u1',
            center: { x: 0, y: 0 },
            layer: 'top',
            rotation: 0,
            width: 2,
            height: 1
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_r1',
            source_component_id: 'source_r1',
            center: { x: 5, y: 0 },
            layer: 'top',
            rotation: 0,
            width: 2,
            height: 1
        }
    ]
}

/**
 * Reads the full application stylesheet in import order.
 * @returns {Promise<string>}
 */
async function readAppStylesheet() {
    const entryUrl = new URL('../../../src/style.css', import.meta.url)
    const entryCss = await readFile(entryUrl, 'utf8')
    const importPaths = [...entryCss.matchAll(/@import\s+'([^']+)';/g)].map(
        (match) => match[1]
    )
    const importedCss = await Promise.all(
        importPaths.map((importPath) => {
            return readFile(new URL(importPath, entryUrl), 'utf8')
        })
    )

    return [entryCss, ...importedCss].join('\n')
}

/**
 * Verifies the 3D renderer emits an interactive scene shell instead of a
 * presentational summary card.
 */
test('renderScene3d emits viewport and control chrome for the 3D scene', () => {
    const markup = PcbScene3dShellRenderer.render({
        pcb: {
            boardOutline: { widthMil: 1200, heightMil: 800, segments: [] },
            components: [{ designator: 'U1' }, { designator: 'R1' }]
        },
        bom: [{ quantity: 2 }]
    })

    assert.match(markup, /scene-3d__viewport/)
    assert.match(markup, /data-scene-3d-viewport/)
    assert.match(markup, /data-scene-3d-loading/)
    assert.match(markup, /scene-3d__loading-content/)
    assert.match(markup, /Preparing 3D scene/)
    assert.match(markup, /Top/)
    assert.match(markup, /Bottom/)
    assert.match(markup, /Isometric/)
    assert.match(markup, /Download Models ZIP/)
    assert.match(markup, /data-scene-3d-export="models-zip"/)
    assert.doesNotMatch(markup, /Reset/)
    assert.match(markup, /External models/)
    assert.match(
        markup,
        /<input type="checkbox" data-scene-3d-toggle="fallback-bodies" \/>Fallback bodies/
    )
    assert.match(markup, /scene-3d__selection/)
    assert.match(markup, /Click a component to inspect it\./)
    assert.match(markup, /scene-3d__diagnostics/)
})

test('renderScene3d renders legacy, raw, document, and context inputs with parity', () => {
    const legacy = {
        pcb: {
            boardOutline: { widthMil: 1200, heightMil: 800, segments: [] },
            components: [{ designator: 'U1' }, { designator: 'R1' }]
        },
        bom: [{ quantity: 1 }, { quantity: 1 }]
    }
    const raw = createShellCircuitJson()
    const document = DocumentResult.createValidated({
        model: createShellCircuitJson()
    })
    const context = CircuitJsonDocumentContext.prepare(document)

    const markups = [legacy, raw, document, context].map((input) =>
        PcbScene3dShellRenderer.render(input)
    )

    for (const markup of markups) {
        assert.match(markup, /1200 x 800 mil/)
        assert.match(markup, />2 components</)
        assert.match(markup, /<dt>BOM groups<\/dt><dd>2<\/dd>/)
    }
    assert.deepEqual(context.statistics.indexBuilds, { elements: 1 })
})

test('renderScene3d groups canonical BOM rows with CircuitJSON parity', () => {
    const model = createShellCircuitJson()
    model.push({
        type: 'source_component',
        source_component_id: 'source_r2',
        name: 'R2',
        ftype: 'simple_resistor',
        resistance: '10k'
    })

    const markup = PcbScene3dShellRenderer.render(model)

    assert.match(markup, /<dt>BOM groups<\/dt><dd>2<\/dd>/)
})

test('renderScene3d honors faux boards for component-only CircuitJSON', () => {
    const model = createShellCircuitJson().filter(
        (element) => element.type !== 'pcb_board'
    )

    const emptyMarkup = PcbScene3dShellRenderer.render(model)
    const fauxMarkup = PcbScene3dShellRenderer.render(model, null, {
        drawFauxBoard: true
    })

    assert.match(emptyMarkup, /viewer-empty/)
    assert.match(fauxMarkup, /scene-3d__viewport/)
    assert.match(fauxMarkup, />2 components</)
})

/**
 * Verifies host applications can choose a conservative initial component
 * model state without removing the user-facing control.
 */
test('renderScene3d accepts an unchecked external model initial toggle', () => {
    const markup = PcbScene3dShellRenderer.render(
        {
            pcb: {
                boardOutline: { widthMil: 1200, heightMil: 800, segments: [] },
                components: [{ designator: 'U1' }]
            },
            bom: []
        },
        null,
        {
            initialToggles: {
                'external-models': false
            }
        }
    )

    assert.match(
        markup,
        /<input type="checkbox" data-scene-3d-toggle="external-models" \/>External models/
    )
    assert.doesNotMatch(
        markup,
        /<input type="checkbox" checked data-scene-3d-toggle="external-models" \/>External models/
    )
})

/**
 * Verifies the viewer stylesheet includes the interactive 3D scene shell.
 */
test('scene3d stylesheet defines viewport, controls, and canvas layout', async () => {
    const cssPath = new URL('../../src/styles/scene3d.css', import.meta.url)
    const css = await readFile(cssPath, 'utf8')

    assert.match(css, /\.scene-3d__toolbar\s*\{/)
    assert.match(
        css,
        /\.scene-3d__preset(?:\.is-active|\[aria-pressed='true'\])[\s\S]*\{/
    )
    assert.match(css, /\.scene-3d\s*\{[\s\S]*height:\s*100%;/)
    assert.match(css, /\.scene-3d\s*\{[\s\S]*min-width:\s*0;/)
    assert.match(css, /\.scene-3d\s*\{[\s\S]*width:\s*100%;/)
    assert.match(css, /\.scene-3d\s*\{[\s\S]*max-width:\s*100%;/)
    assert.match(
        css,
        /\.scene-3d\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+minmax\(\s*clamp\(520px,\s*62vh,\s*760px\),\s*1fr\s*\)\s+auto\s+auto;/
    )
    assert.match(css, /\.scene-3d__stage\s*\{[\s\S]*height:\s*100%;/)
    assert.match(css, /\.scene-3d__stage\s*\{[\s\S]*min-height:\s*0;/)
    assert.match(css, /\.scene-3d__stage\s*\{[\s\S]*min-width:\s*0;/)
    assert.match(css, /\.scene-3d__stage\s*\{[\s\S]*max-width:\s*100%;/)
    assert.match(css, /\.scene-3d__viewport\s*\{/)
    assert.match(css, /\.scene-3d__viewport\s*\{[\s\S]*height:\s*100%;/)
    assert.match(css, /\.scene-3d__viewport\s*\{[\s\S]*min-height:\s*0;/)
    assert.match(css, /\.scene-3d__viewport\s*\{[\s\S]*min-width:\s*0;/)
    assert.match(css, /\.scene-3d__viewport\s*\{[\s\S]*max-width:\s*100%;/)
    assert.doesNotMatch(css, /aspect-ratio:\s*4\s*\/\s*3;/)
    assert.match(css, /\.scene-3d__controls\s*\{/)
    assert.match(css, /\.scene-3d__selection\s*\{/)
    assert.match(css, /\.scene-3d__diagnostics\s*\{/)
    assert.match(css, /\.scene-3d__canvas\s*\{/)
    assert.match(css, /\.scene-3d__loading\s*\{[\s\S]*display:\s*flex;/)
    assert.match(css, /\.scene-3d__loading\s*\{[\s\S]*align-items:\s*center;/)
    assert.match(
        css,
        /\.scene-3d__loading\s*\{[\s\S]*justify-content:\s*center;/
    )
    assert.match(
        css,
        /\.scene-3d__loading-content\s*\{[\s\S]*justify-items:\s*center;/
    )
    assert.match(
        css,
        /@media \(max-width: 760px\)[\s\S]*\.scene-3d\s*\{[\s\S]*grid-template-rows:\s*auto auto auto auto auto;/
    )
    assert.match(
        css,
        /@media \(max-width: 760px\)[\s\S]*\.scene-3d__stage\s*\{[\s\S]*display:\s*block;/
    )
    assert.match(
        css,
        /@media \(max-width: 760px\)[\s\S]*\.scene-3d__viewport\s*\{[\s\S]*height:\s*clamp\(360px,\s*58vh,\s*560px\);/
    )
    assert.match(
        css,
        /@media \(max-width: 760px\)[\s\S]*\.scene-3d__controls\s*\{[\s\S]*max-height:\s*none;/
    )
    assert.match(
        css,
        /@media \(max-width: 760px\)[\s\S]*\.scene-3d \.svg-panel__header p\s*\{[\s\S]*flex:\s*1 1 100%;/
    )
    assert.match(
        css,
        /@media \(max-width: 760px\)[\s\S]*\.scene-3d__action\s*\{[\s\S]*flex-basis:\s*100%;/
    )
})
