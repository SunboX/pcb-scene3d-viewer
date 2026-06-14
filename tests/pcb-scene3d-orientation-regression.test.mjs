import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dCameraRig } from '../src/PcbScene3dCameraRig.mjs'
import { PcbScene3dDetailCoordinateNormalizer } from '../src/PcbScene3dDetailCoordinateNormalizer.mjs'
import { PcbScene3dExternalModels } from '../src/PcbScene3dExternalModels.mjs'
import { PcbScene3dRuntime } from '../src/PcbScene3dRuntime.mjs'

/**
 * Minimal mutable scale object used by the view-compensation regression test.
 */
class FakeScale {
    /** @type {number} */
    x = 1

    /** @type {number} */
    y = 1

    /** @type {number} */
    z = 1

    /**
     * @param {number} x X scale.
     * @param {number} y Y scale.
     * @param {number} z Z scale.
     * @returns {void}
     */
    set(x, y, z) {
        this.x = x
        this.y = y
        this.z = z
    }
}

/**
 * Minimal group node used by the view-compensation regression test.
 */
class FakeGroup {
    /** @type {FakeGroup[]} */
    children = []

    /** @type {FakeScale} */
    scale = new FakeScale()

    /** @type {Record<string, any>} */
    userData = {}
}

/**
 * Builds a small asymmetric generated-Altium scene that is independent of any
 * source project fixture.
 * @returns {{ sourceFormat: string, board: { widthMil: number, heightMil: number, centerX: number, centerY: number }, components: { designator: string, positionMil: { x: number, y: number, z: number } }[] }}
 */
const createGeneratedAltiumScene = () => ({
    sourceFormat: 'altium',
    board: {
        widthMil: 1000,
        heightMil: 1000,
        centerX: 500,
        centerY: 500
    },
    components: [
        {
            designator: 'U_A',
            positionMil: {
                x: -180,
                y: 220,
                z: 0
            }
        }
    ]
})

/**
 * Resolves one preset pose into screen-space basis vectors.
 * @param {{ position: { x: number, y: number, z: number }, target: { x: number, y: number, z: number }, up: { x: number, y: number, z: number } }} preset Camera preset.
 * @returns {{ right: { x: number, y: number, z: number }, up: { x: number, y: number, z: number } }}
 */
const resolveScreenBasis = (preset) => {
    const forward = {
        x: preset.target.x - preset.position.x,
        y: preset.target.y - preset.position.y,
        z: preset.target.z - preset.position.z
    }
    const forwardLength = Math.hypot(forward.x, forward.y, forward.z) || 1
    forward.x /= forwardLength
    forward.y /= forwardLength
    forward.z /= forwardLength

    const right = {
        x: forward.y * preset.up.z - forward.z * preset.up.y,
        y: forward.z * preset.up.x - forward.x * preset.up.z,
        z: forward.x * preset.up.y - forward.y * preset.up.x
    }
    const rightLength = Math.hypot(right.x, right.y, right.z) || 1

    return {
        right: {
            x: right.x / rightLength,
            y: right.y / rightLength,
            z: right.z / rightLength
        },
        up: {
            x: preset.up.x,
            y: preset.up.y,
            z: preset.up.z
        }
    }
}

/**
 * Converts a generated-detail scene point back into source PCB coordinates.
 * @param {{ board: { centerX: number, centerY: number } }} sceneDescription Scene metadata.
 * @param {{ x: number, y: number }} point Centered scene point.
 * @returns {{ x: number, y: number }}
 */
const toGeneratedSourcePoint = (sceneDescription, point) => ({
    x: sceneDescription.board.centerX + point.x,
    y: sceneDescription.board.centerY + point.y
})

/**
 * Projects one already-centered scene point through the active preset.
 * @param {'top' | 'bottom' | 'isometric'} presetName Camera preset.
 * @param {object} sceneDescription Scene metadata.
 * @param {{ x: number, y: number, z?: number }} point Centered scene point.
 * @returns {{ x: number, y: number }}
 */
const projectScenePoint = (presetName, sceneDescription, point) => {
    const scale = PcbScene3dRuntime.resolveViewScale(
        presetName,
        sceneDescription
    )
    const preset = PcbScene3dCameraRig.resolvePreset(
        presetName,
        sceneDescription
    )
    const basis = resolveScreenBasis(preset)
    const scaledPoint = {
        x: Number(point.x || 0) * scale.x,
        y: Number(point.y || 0) * scale.y,
        z: Number(point.z || 0) * scale.z
    }

    return {
        x:
            scaledPoint.x * basis.right.x +
            scaledPoint.y * basis.right.y +
            scaledPoint.z * basis.right.z,
        y:
            scaledPoint.x * basis.up.x +
            scaledPoint.y * basis.up.y +
            scaledPoint.z * basis.up.z
    }
}

/**
 * Projects one generated detail source point through the runtime detail path.
 * @param {'top' | 'bottom' | 'isometric'} presetName Camera preset.
 * @param {object} sceneDescription Scene metadata.
 * @param {{ x: number, y: number }} sourcePoint Source PCB point.
 * @returns {{ x: number, y: number }}
 */
const projectDetailPoint = (presetName, sceneDescription, sourcePoint) =>
    projectScenePoint(
        presetName,
        sceneDescription,
        PcbScene3dDetailCoordinateNormalizer.normalize(
            sceneDescription,
            sourcePoint.x,
            sourcePoint.y
        )
    )

/**
 * Asserts two projected points are equal within floating-point tolerance.
 * @param {{ x: number, y: number }} actual Actual projected point.
 * @param {{ x: number, y: number }} expected Expected projected point.
 * @returns {void}
 */
const assertProjectedPointEqual = (actual, expected) => {
    assert.equal(Math.abs(actual.x - expected.x) < 0.000001, true)
    assert.equal(Math.abs(actual.y - expected.y) < 0.000001, true)
}

test('Altium top view keeps fake component, copper, and silkscreen anchors aligned', () => {
    const sceneDescription = createGeneratedAltiumScene()
    const componentPoint = sceneDescription.components[0].positionMil
    const sourcePoint = toGeneratedSourcePoint(sceneDescription, componentPoint)
    const componentScreenPoint = projectScenePoint(
        'top',
        sceneDescription,
        componentPoint
    )
    const copperScreenPoint = projectDetailPoint(
        'top',
        sceneDescription,
        sourcePoint
    )
    const silkscreenScreenPoint = projectDetailPoint(
        'top',
        sceneDescription,
        sourcePoint
    )
    const silkscreenUpperMark = projectDetailPoint(
        'top',
        sceneDescription,
        toGeneratedSourcePoint(sceneDescription, {
            x: componentPoint.x,
            y: componentPoint.y + 40
        })
    )

    assertProjectedPointEqual(copperScreenPoint, componentScreenPoint)
    assertProjectedPointEqual(silkscreenScreenPoint, componentScreenPoint)
    assert.equal(componentScreenPoint.x < 0, true)
    assert.equal(componentScreenPoint.y < 0, true)
    assert.equal(silkscreenUpperMark.y < silkscreenScreenPoint.y, true)
})

test('Altium isometric view keeps fake component, copper, and silkscreen anchors aligned', () => {
    const sceneDescription = createGeneratedAltiumScene()
    const componentPoint = sceneDescription.components[0].positionMil
    const sourcePoint = toGeneratedSourcePoint(sceneDescription, componentPoint)
    const componentScreenPoint = projectScenePoint(
        'isometric',
        sceneDescription,
        componentPoint
    )
    const copperScreenPoint = projectDetailPoint(
        'isometric',
        sceneDescription,
        sourcePoint
    )
    const silkscreenScreenPoint = projectDetailPoint(
        'isometric',
        sceneDescription,
        sourcePoint
    )
    const silkscreenUpperMark = projectDetailPoint(
        'isometric',
        sceneDescription,
        toGeneratedSourcePoint(sceneDescription, {
            x: componentPoint.x,
            y: componentPoint.y + 40
        })
    )

    assertProjectedPointEqual(copperScreenPoint, componentScreenPoint)
    assertProjectedPointEqual(silkscreenScreenPoint, componentScreenPoint)
    assert.equal(componentScreenPoint.x < 0, true)
    assert.equal(silkscreenUpperMark.x < silkscreenScreenPoint.x, true)
})

test('Gerber bottom view keeps board-up markers upright', () => {
    const sceneDescription = {
        sourceFormat: 'gerber',
        coordinateSystem: 'gerber-3d-y-up',
        board: {
            widthMil: 1000,
            heightMil: 1000,
            centerX: 500,
            centerY: 500
        }
    }
    const topUpperMark = projectScenePoint('top', sceneDescription, {
        x: 0,
        y: 100
    })
    const bottomUpperMark = projectScenePoint('bottom', sceneDescription, {
        x: 0,
        y: 100
    })

    assert.equal(topUpperMark.y < 0, true)
    assert.equal(bottomUpperMark.y < 0, true)
})

test('Altium top view compensates fake silkscreen glyphs without moving their anchor', () => {
    const sceneDescription = createGeneratedAltiumScene()
    const viewScale = PcbScene3dRuntime.resolveViewScale(
        'top',
        sceneDescription
    )
    const glyphGroup = new FakeGroup()
    glyphGroup.userData.scene3dViewCompensation = true

    PcbScene3dExternalModels.applyViewCompensation(glyphGroup, viewScale)

    assert.equal(viewScale.y, -1)
    assert.equal(glyphGroup.scale.y, -1)
    assert.equal(viewScale.y * glyphGroup.scale.y, 1)
})
