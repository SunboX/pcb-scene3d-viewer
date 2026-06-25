import assert from 'node:assert/strict'
import test from 'node:test'
import * as viewer from '../src/index.mjs'
import * as scene3d from '../src/scene3d.mjs'

test('index exports scene3d viewer APIs', () => {
    assert.equal(typeof viewer.PcbScene3dController, 'function')
    assert.equal(typeof viewer.PcbScene3dRuntime, 'function')
    assert.equal(typeof viewer.PcbScene3dShellRenderer.render, 'function')
    assert.equal(typeof viewer.PcbScene3dWorkerClient, 'function')
    assert.equal(typeof viewer.PcbModelArchiveExporter.buildArchive, 'function')
})

test('scene3d entrypoint exports the same runtime APIs', () => {
    assert.equal(typeof scene3d.CircuitJsonCadModelAssetResolver, 'function')
    assert.equal(scene3d.PcbScene3dRuntime, viewer.PcbScene3dRuntime)
    assert.equal(
        scene3d.PcbScene3dShellRenderer,
        viewer.PcbScene3dShellRenderer
    )
    assert.equal(
        scene3d.PcbScene3dExternalModels,
        viewer.PcbScene3dExternalModels
    )
})
