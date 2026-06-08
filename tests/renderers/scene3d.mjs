import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PcbScene3dShellRenderer } from '../../src/PcbScene3dShellRenderer.mjs'

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
