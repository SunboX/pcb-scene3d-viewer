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
        'docs/testing.md',
        'spec/library-scope.md',
        'src/index.mjs',
        'src/scene3d.mjs',
        'src/PcbScene3dController.mjs',
        'src/PcbScene3dRuntime.mjs',
        'src/PcbScene3dExternalModels.mjs',
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
    assert.equal(
        pkg.dependencies['circuitjson-toolkit'].startsWith('file:'),
        false
    )
    assert.equal(pkg.files.includes('docs/circuitjson.md'), true)
    assert.equal(pkg.files.includes('REUSE.toml'), true)
    assert.equal(pkg.scripts.test, 'node --test')
})
