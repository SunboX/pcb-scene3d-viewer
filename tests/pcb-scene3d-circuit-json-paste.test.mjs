import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbAssemblyGeometryBuilder,
    PcbScene3dCircuitJsonAdapter
} from '../src/scene3d.mjs'

/**
 * Builds a minimal CircuitJSON board.
 * @returns {object}
 */
function createBoard() {
    return {
        type: 'pcb_board',
        pcb_board_id: 'board_1',
        center: { x: 0, y: 0 },
        width: 10,
        height: 10,
        thickness: 1.6
    }
}

/**
 * Resolves one mesh by name.
 * @param {object[]} meshes Mesh list.
 * @param {string} name Mesh name.
 * @returns {object | undefined}
 */
function findMesh(meshes, name) {
    return meshes.find((mesh) => mesh?.name === name)
}

/**
 * Computes mesh center coordinates from vertex bounds.
 * @param {{ vertices?: number[][] }} mesh Mesh to inspect.
 * @returns {{ x: number, y: number }}
 */
function meshCenter(mesh) {
    const bounds = (mesh?.vertices || []).reduce(
        (current, vertex) => ({
            minX: Math.min(current.minX, Number(vertex?.[0] || 0)),
            maxX: Math.max(current.maxX, Number(vertex?.[0] || 0)),
            minY: Math.min(current.minY, Number(vertex?.[1] || 0)),
            maxY: Math.max(current.maxY, Number(vertex?.[1] || 0))
        }),
        {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity
        }
    )

    return {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2
    }
}

test('PcbScene3dCircuitJsonAdapter maps solder paste only when enabled', () => {
    const circuitJson = [
        createBoard(),
        {
            type: 'pcb_solder_paste',
            pcb_solder_paste_id: 'paste_1',
            layer: 'top',
            shape: 'rect',
            x: 1,
            y: 2,
            width: 2,
            height: 1
        }
    ]
    const hiddenPaste = PcbScene3dCircuitJsonAdapter.build(circuitJson)
    const visiblePaste = PcbScene3dCircuitJsonAdapter.build(circuitJson, {
        showPcbPaste: true
    })

    assert.equal(hiddenPaste.detail.paste, undefined)
    assert.ok(visiblePaste.detail.paste)
    const [fill] = visiblePaste.detail.paste.top.fills

    assert.equal(visiblePaste.detail.paste.top.fillColor, 0xc7c2b7)
    assert.equal(visiblePaste.detail.paste.top.fills.length, 1)
    assert.equal(visiblePaste.detail.paste.bottom.fills.length, 0)
    assert.equal(fill.sourceId, 'paste_1')
    assert.equal(fill.points.length, 4)
    assert.deepEqual(
        fill.points.map((point) => Math.round(point.x)),
        [0, 79, 79, 0]
    )
    assert.deepEqual(
        fill.points.map((point) => Math.round(point.y)),
        [59, 59, 98, 98]
    )
})

test('PcbAssemblyGeometryBuilder exports enabled solder paste as distinct meshes', async () => {
    const scene = PcbScene3dCircuitJsonAdapter.build(
        [
            createBoard(),
            {
                type: 'pcb_solder_paste',
                pcb_solder_paste_id: 'paste_1',
                layer: 'top',
                shape: 'rect',
                x: 0,
                y: 0,
                width: 1,
                height: 1
            }
        ],
        { showPcbPaste: true }
    )
    const geometry = await PcbAssemblyGeometryBuilder.build(scene, {
        includeModels: false
    })
    const pasteMesh = findMesh(geometry.meshes, 'paste-top-fill-1')

    assert.ok(pasteMesh)
    assert.deepEqual(pasteMesh.color, [0.78, 0.76, 0.72])
    assert.equal(findMesh(geometry.meshes, 'silkscreen-top-fill-1'), undefined)
})

test('PcbAssemblyGeometryBuilder rotates generated header pins with component placement', async () => {
    const scene = PcbScene3dCircuitJsonAdapter.build([
        createBoard(),
        {
            type: 'source_component',
            source_component_id: 'source_j1',
            name: 'J1',
            ftype: 'simple_pin_header'
        },
        {
            type: 'pcb_component',
            pcb_component_id: 'pcb_j1',
            source_component_id: 'source_j1',
            center: { x: 0, y: 0 },
            layer: 'top',
            rotation: 90
        },
        {
            type: 'cad_component',
            cad_component_id: 'cad_j1',
            pcb_component_id: 'pcb_j1',
            footprinter_string: 'pinrow4_nopinlabels'
        }
    ])
    const geometry = await PcbAssemblyGeometryBuilder.build(scene, {
        includeModels: false
    })
    const pinCenters = geometry.meshes
        .filter((mesh) =>
            String(mesh.name || '').startsWith('component-J1-pin-')
        )
        .map(meshCenter)
    const roundedX = new Set(pinCenters.map((center) => Math.round(center.x)))
    const roundedY = new Set(pinCenters.map((center) => Math.round(center.y)))

    assert.equal(pinCenters.length, 4)
    assert.equal(roundedX.size, 4)
    assert.equal(roundedY.size, 1)
})
