import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dBoardMaterialPalette } from '../src/PcbScene3dBoardMaterialPalette.mjs'

test('PcbScene3dBoardMaterialPalette keeps authored surface color without board assembly', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveSurfaceColor(
            { surfaceColor: 0x17396b },
            { hasBoardAssemblyModel: false }
        ),
        0x17396b
    )
})

test('PcbScene3dBoardMaterialPalette keeps Altium board assembly surface color', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveSurfaceColor(
            { surfaceColor: 0x17396b },
            { hasBoardAssemblyModel: true, sourceFormat: 'altium' }
        ),
        0x17396b
    )
})

test('PcbScene3dBoardMaterialPalette darkens authored board face color only for display', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveBoardSurfaceColor(
            { surfaceColor: 0x17396b },
            { hasBoardAssemblyModel: true, sourceFormat: 'altium' }
        ),
        0x14325e
    )
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveSurfaceColor(
            { surfaceColor: 0x17396b },
            { hasBoardAssemblyModel: true, sourceFormat: 'altium' }
        ),
        0x17396b
    )
})

test('PcbScene3dBoardMaterialPalette uses procedural mask color with generated board assembly', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveSurfaceColor(
            { surfaceColor: 0x17396b },
            { hasBoardAssemblyModel: true, sourceFormat: 'gerber' }
        ),
        0x2a5f27
    )
})

test('PcbScene3dBoardMaterialPalette darkens procedural board face color only for display', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveBoardSurfaceColor(
            { surfaceColor: 0x17396b },
            { hasBoardAssemblyModel: true, sourceFormat: 'gerber' }
        ),
        0x255422
    )
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveSurfaceColor(
            { surfaceColor: 0x17396b },
            { hasBoardAssemblyModel: true, sourceFormat: 'gerber' }
        ),
        0x2a5f27
    )
})

test('PcbScene3dBoardMaterialPalette falls back to procedural mask color', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveSurfaceColor(
            {},
            { hasBoardAssemblyModel: false }
        ),
        0x2a5f27
    )
})

test('PcbScene3dBoardMaterialPalette uses the FR-4 substrate edge when no edge color is authored', () => {
    assert.equal(PcbScene3dBoardMaterialPalette.resolveEdgeColor({}), 0xc9ca78)
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveEdgeColor({ edgeColor: null }),
        0xc9ca78
    )
})

test('PcbScene3dBoardMaterialPalette keeps an authored substrate edge color', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.resolveEdgeColor({
            edgeColor: 0xf7f9d1
        }),
        0xf7f9d1
    )
})

test('PcbScene3dBoardMaterialPalette shows generated face with board assembly', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.isGeneratedSurfaceVisible({
            hasBoardAssemblyModel: true
        }),
        true
    )
})

test('PcbScene3dBoardMaterialPalette shows generated face without board assembly', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.isGeneratedSurfaceVisible(),
        true
    )
})

test('PcbScene3dBoardMaterialPalette shows generated body with board assembly', () => {
    assert.equal(
        PcbScene3dBoardMaterialPalette.isGeneratedBodyVisible({
            hasBoardAssemblyModel: true
        }),
        true
    )
})

test('PcbScene3dBoardMaterialPalette shows generated body without board assembly', () => {
    assert.equal(PcbScene3dBoardMaterialPalette.isGeneratedBodyVisible(), true)
})
