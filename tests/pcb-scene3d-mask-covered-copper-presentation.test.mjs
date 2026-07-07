import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'
import * as THREE from 'three'

/**
 * Finds a scene object by name.
 * @param {any} root Root object.
 * @param {string} name Object name.
 * @returns {any | null}
 */
function findObjectByName(root, name) {
    let found = null
    root.traverse?.((child) => {
        if (!found && child.name === name) {
            found = child
        }
    })
    return found
}

/**
 * Resolves bounds for a packed XYZ position array.
 * @param {ArrayLike<number>} positions Position buffer.
 * @returns {{ minZ: number, maxZ: number }}
 */
function resolveZBounds(positions) {
    let minZ = Infinity
    let maxZ = -Infinity
    for (let index = 2; index < positions.length; index += 3) {
        minZ = Math.min(minZ, Number(positions[index]))
        maxZ = Math.max(maxZ, Number(positions[index]))
    }
    return { minZ, maxZ }
}

/**
 * Resolves one RGB channel tuple from a hex color.
 * @param {number} color Hex color.
 * @returns {{ red: number, green: number, blue: number }}
 */
function resolveRgb(color) {
    return {
        red: (color >> 16) & 255,
        green: (color >> 8) & 255,
        blue: color & 255
    }
}

/**
 * Resolves the dominant RGB channel name.
 * @param {number} color Hex color.
 * @returns {'red' | 'green' | 'blue'}
 */
function resolveDominantChannel(color) {
    const rgb = resolveRgb(color)
    return Object.entries(rgb).sort((left, right) => right[1] - left[1])[0][0]
}

/**
 * Measures RGB distance between two hex colors.
 * @param {number} first First hex color.
 * @param {number} second Second hex color.
 * @returns {number}
 */
function colorDistance(first, second) {
    const firstRgb = resolveRgb(first)
    const secondRgb = resolveRgb(second)

    return Math.hypot(
        firstRgb.red - secondRgb.red,
        firstRgb.green - secondRgb.green,
        firstRgb.blue - secondRgb.blue
    )
}

/**
 * Verifies that mask-covered copper keeps the solder-mask palette dominant.
 * @param {number} color Covered-copper color.
 * @param {number} solderMaskColor Solder-mask color.
 * @param {number} exposedCopperColor Exposed-copper color.
 * @returns {void}
 */
function assertMaskDominantCoveredColor(
    color,
    solderMaskColor,
    exposedCopperColor
) {
    assert.equal(
        resolveDominantChannel(color),
        resolveDominantChannel(solderMaskColor)
    )
    assert.ok(
        colorDistance(color, solderMaskColor) <
            colorDistance(color, exposedCopperColor)
    )
    const rgb = resolveRgb(color)
    assert.ok(rgb.red / Math.max(rgb.green, 1) < 0.72)
}

/**
 * Verifies that broad covered copper pours remain visible on solder mask.
 * @param {number} color Covered-copper fill color.
 * @param {number} solderMaskColor Solder-mask color.
 * @returns {void}
 */
function assertVisibleCoveredPourColor(color, solderMaskColor) {
    assert.ok(colorDistance(color, solderMaskColor) >= 10)
}

/**
 * Verifies that non-green solder mask palettes do not inherit the green tint.
 * @param {number} color Covered-copper color.
 * @param {number} solderMaskColor Solder-mask color.
 * @returns {void}
 */
function assertKeepsMaskHue(color, solderMaskColor) {
    assert.equal(
        resolveDominantChannel(color),
        resolveDominantChannel(solderMaskColor)
    )
    assert.ok(colorDistance(color, solderMaskColor) < 70)
}

test('PcbScene3dCopperFactory keeps mask-covered traces readable over fills', () => {
    const solderMaskColor = 0x2a5f27
    const exposedCopperColor = 0xd9a61d
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [
                {
                    x1: 10,
                    y1: 25,
                    x2: 70,
                    y2: 25,
                    width: 12,
                    layerId: 1
                }
            ],
            arcs: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 80, y: 0 },
                        { x: 80, y: 50 },
                        { x: 0, y: 50 }
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        { solderMaskColor }
    )

    const trackMesh = findObjectByName(group, 'mask-covered-copper-tracks')
    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')
    const trackBounds = resolveZBounds(
        trackMesh.geometry.attributes.position.array
    )
    const fillBounds = resolveZBounds(
        fillMesh.geometry.attributes.position.array
    )

    assert.notEqual(
        trackMesh.material.color.getHex(),
        fillMesh.material.color.getHex()
    )
    assertMaskDominantCoveredColor(
        trackMesh.material.color.getHex(),
        solderMaskColor,
        exposedCopperColor
    )
    assertMaskDominantCoveredColor(
        fillMesh.material.color.getHex(),
        solderMaskColor,
        exposedCopperColor
    )
    assertVisibleCoveredPourColor(
        fillMesh.material.color.getHex(),
        solderMaskColor
    )
    assert.ok(
        colorDistance(trackMesh.material.color.getHex(), solderMaskColor) >
            colorDistance(fillMesh.material.color.getHex(), solderMaskColor)
    )
    assert.ok(trackBounds.maxZ > fillBounds.maxZ)
    assert.ok(trackMesh.renderOrder > fillMesh.renderOrder)
})

test('PcbScene3dCopperFactory keeps blue mask-covered copper in the blue palette', () => {
    const solderMaskColor = 0x17396b
    const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
        THREE,
        {
            tracks: [
                {
                    x1: 10,
                    y1: 25,
                    x2: 70,
                    y2: 25,
                    width: 12,
                    layerId: 1
                }
            ],
            arcs: [],
            fills: [
                {
                    layerId: 1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 80, y: 0 },
                        { x: 80, y: 50 },
                        { x: 0, y: 50 }
                    ]
                }
            ]
        },
        5,
        -5,
        (x, y) => ({ x, y }),
        { solderMaskColor }
    )

    const trackMesh = findObjectByName(group, 'mask-covered-copper-tracks')
    const fillMesh = findObjectByName(group, 'mask-covered-copper-fills')

    assertKeepsMaskHue(trackMesh.material.color.getHex(), solderMaskColor)
    assertKeepsMaskHue(fillMesh.material.color.getHex(), solderMaskColor)
    assertVisibleCoveredPourColor(
        fillMesh.material.color.getHex(),
        solderMaskColor
    )
})
