import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)

/**
 * Checks whether a project-relative file exists.
 * @param {string} relativePath Project-relative file path.
 * @returns {Promise<boolean>}
 */
async function exists(relativePath) {
    try {
        await access(new URL(relativePath, root), constants.F_OK)
        return true
    } catch {
        return false
    }
}

test('required project files exist', async () => {
    const required = [
        'README.md',
        'AGENTS.md',
        'COMMERCIAL-LICENSE.md',
        'CONTRIBUTING.md',
        'package.json',
        'LICENSE',
        'LICENSES/AGPL-3.0-or-later.txt',
        'LICENSES/CC-BY-SA-4.0.txt',
        'LICENSES/LGPL-2.1-or-later.txt',
        'LICENSES/LicenseRef-PolyForm-Noncommercial-1.0.0.txt',
        'REUSE.toml',
        'NOTICE.md',
        'docs/api.md',
        'docs/circuitjson.md',
        'docs/model-format.md',
        'docs/release-notes-v1.2.0.md',
        'docs/release-notes-v1.2.1.md',
        'docs/testing.md',
        'spec/library-scope.md',
        'scripts/benchmark-context-model-assets.mjs',
        'src/index.mjs',
        'src/scene3d.mjs',
        'src/CircuitJsonCadModelAssetResolver.mjs',
        'src/PcbScene3dCircuitJsonInput.mjs',
        'src/PcbScene3dCircuitJsonModelAsset.mjs',
        'src/PcbScene3dDescriptorSafeRecord.mjs',
        'src/PcbScene3dController.mjs',
        'src/PcbScene3dRuntime.mjs',
        'src/PcbScene3dExternalModels.mjs',
        'src/PcbScene3dFacetedModelGroupBuilder.mjs',
        'src/PcbModelArchiveSourceBundle.mjs',
        'src/PcbScene3dModelContent.mjs',
        'src/PcbScene3dModelFetchPolicy.mjs',
        'src/PcbScene3dModelIdentity.mjs',
        'src/PcbScene3dOcctImporterLoader.mjs',
        'src/PcbScene3dStepLoader.mjs',
        'src/PcbScene3dShellRenderer.mjs',
        'src/styles/scene3d.css'
    ]

    for (const relativePath of required) {
        assert.equal(
            await exists(relativePath),
            true,
            'Missing file: ' + relativePath
        )
    }
})

test('package exports public entrypoints', async () => {
    const raw = await readFile(new URL('package.json', root), 'utf8')
    const pkg = JSON.parse(raw)

    assert.equal(pkg.name, 'pcb-scene3d-viewer')
    assert.equal(pkg.version, '1.3.0')
    assert.equal(pkg.type, 'module')
    assert.equal(pkg.exports['.'], './src/index.mjs')
    assert.equal(pkg.exports['./scene3d'], './src/scene3d.mjs')
    assert.equal(
        pkg.exports['./styles/scene3d.css'],
        './src/styles/scene3d.css'
    )
    assert.equal(
        pkg.repository.url,
        'git+https://github.com/SunboX/pcb-scene3d-viewer.git'
    )
    assert.equal(pkg.dependencies['circuitjson-toolkit'], '^1.2.0')
    assert.equal(pkg.dependencies['@sunbox/occt-import-js'], '^0.0.28')
    assert.equal(pkg.dependencies.earcut, '3.0.2')
    assert.equal(pkg.files.includes('docs/circuitjson.md'), true)
    assert.equal(pkg.files.includes('docs/release-notes-v1.2.0.md'), true)
    assert.equal(pkg.files.includes('docs/release-notes-v1.2.1.md'), true)
    assert.equal(pkg.files.includes('docs/release-notes-v1.2.2.md'), true)
    assert.equal(pkg.files.includes('REUSE.toml'), true)
    assert.equal(pkg.scripts.test, 'node --test')
    assert.equal(
        pkg.scripts['benchmark:context-assets'],
        'node scripts/benchmark-context-model-assets.mjs'
    )
})
