import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCameraRig } from '../src/PcbScene3dCameraRig.mjs'

/**
 * Resolves one preset pose into normalized screen-space basis vectors.
 * @param {{ position: { x: number, y: number, z: number }, target: { x: number, y: number, z: number }, up: { x: number, y: number, z: number } }} preset
 * @returns {{ right: { x: number, y: number, z: number }, up: { x: number, y: number, z: number } }}
 */
const resolveScreenBasis = (preset) => {
    const forwardX = preset.target.x - preset.position.x
    const forwardY = preset.target.y - preset.position.y
    const forwardZ = preset.target.z - preset.position.z
    const forwardLength = Math.hypot(forwardX, forwardY, forwardZ) || 1
    const normalizedForward = {
        x: forwardX / forwardLength,
        y: forwardY / forwardLength,
        z: forwardZ / forwardLength
    }
    const right = {
        x:
            normalizedForward.y * preset.up.z -
            normalizedForward.z * preset.up.y,
        y:
            normalizedForward.z * preset.up.x -
            normalizedForward.x * preset.up.z,
        z: normalizedForward.x * preset.up.y - normalizedForward.y * preset.up.x
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
 * Projects one point onto the preset's screen basis.
 * @param {{ x: number, y: number, z: number }} point
 * @param {{ right: { x: number, y: number, z: number }, up: { x: number, y: number, z: number } }} basis
 * @returns {{ x: number, y: number }}
 */
const projectPointToScreen = (point, basis) => ({
    x:
        point.x * basis.right.x +
        point.y * basis.right.y +
        point.z * basis.right.z,
    y: point.x * basis.up.x + point.y * basis.up.y + point.z * basis.up.z
})

/**
 * Verifies the 3D camera rig uses a z-up basis for PCB scenes so interaction
 * controls align with the board's XY plane and Z height axis.
 */
test('PcbScene3dCameraRig resolves presets with a z-up camera basis', () => {
    const preset = PcbScene3dCameraRig.resolvePreset('isometric', {
        board: {
            widthMil: 1000,
            heightMil: 500
        }
    })

    assert.deepEqual(preset.target, { x: 0, y: 0, z: 0 })
    assert.deepEqual(preset.up, { x: 0, y: 0, z: 1 })
    assert.equal(preset.radius, 1900)
    assert.ok(preset.position.x > 0)
    assert.ok(preset.position.y < 0)
    assert.ok(preset.position.z > 0)
})

/**
 * Verifies top and bottom presets are flat orthogonal portrait views along the
 * board normal with stable screen-up vectors.
 */
test('PcbScene3dCameraRig keeps top and bottom presets flat to the board', () => {
    const topPreset = PcbScene3dCameraRig.resolvePreset('top', {
        board: {
            widthMil: 2200,
            heightMil: 1400
        }
    })
    const bottomPreset = PcbScene3dCameraRig.resolvePreset('bottom', {
        board: {
            widthMil: 2200,
            heightMil: 1400
        }
    })
    const topBasis = resolveScreenBasis(topPreset)
    const bottomBasis = resolveScreenBasis(bottomPreset)
    assert.deepEqual(topPreset.up, { x: 0, y: 1, z: 0 })
    assert.deepEqual(bottomPreset.up, { x: 0, y: -1, z: 0 })
    assert.equal(topPreset.position.x, 0)
    assert.equal(topPreset.position.y, 0)
    assert.equal(bottomPreset.position.x, 0)
    assert.equal(bottomPreset.position.y, 0)
    assert.ok(topPreset.position.z > 0)
    assert.ok(bottomPreset.position.z < 0)
    assert.ok(topBasis.right.x > 0.99)
    assert.ok(Math.abs(topBasis.right.y) < 0.01)
    assert.ok(bottomBasis.right.x > 0.99)
    assert.ok(Math.abs(bottomBasis.right.y) < 0.01)
    assert.ok(bottomBasis.up.y < -0.99)
})

/**
 * Verifies KiCad's y-up scene descriptions use the same back-side screen
 * convention as the 2D PCB renderer: bottom view mirrors X while preserving
 * board-up Y, so labels do not appear upside down.
 */
test('PcbScene3dCameraRig keeps KiCad bottom view upright', () => {
    const sceneDescription = {
        coordinateSystem: 'kicad-3d-y-up',
        board: {
            widthMil: 2200,
            heightMil: 1400
        }
    }
    const topPreset = PcbScene3dCameraRig.resolvePreset('top', sceneDescription)
    const bottomPreset = PcbScene3dCameraRig.resolvePreset(
        'bottom',
        sceneDescription
    )
    const topBasis = resolveScreenBasis(topPreset)
    const bottomBasis = resolveScreenBasis(bottomPreset)
    const topScreenPoint = projectPointToScreen({ x: 1, y: 1, z: 0 }, topBasis)
    const bottomScreenPoint = projectPointToScreen(
        { x: 1, y: 1, z: 0 },
        bottomBasis
    )

    assert.deepEqual(bottomPreset.up, { x: 0, y: 1, z: 0 })
    assert.ok(topScreenPoint.x > 0)
    assert.ok(topScreenPoint.y > 0)
    assert.ok(bottomScreenPoint.x < 0)
    assert.ok(bottomScreenPoint.y > 0)
})

/**
 * Builds a perspective camera matching the browser runtime defaults.
 * @returns {THREE.PerspectiveCamera}
 */
function createCamera() {
    return new THREE.PerspectiveCamera(38, 16 / 9, 10, 25000)
}

/**
 * Builds a minimal controls stand-in for preset application.
 * @returns {{ target: THREE.Vector3, maxDistance: number, update: () => void }}
 */
function createControls() {
    return {
        target: new THREE.Vector3(0, 0, 0),
        maxDistance: 8000,
        update() {}
    }
}

/**
 * Builds a synthetic scene description.
 * @returns {object}
 */
function createSceneDescription() {
    return {
        board: {
            widthMil: 1000,
            heightMil: 600,
            thicknessMil: 80
        }
    }
}

/**
 * Projects the same XY point at two heights and measures screen-space drift.
 * @param {THREE.Camera} camera Camera to inspect.
 * @returns {number}
 */
function projectionHeightDrift(camera) {
    camera.updateMatrixWorld(true)
    const lower = new THREE.Vector3(500, 100, 0).project(camera)
    const upper = new THREE.Vector3(500, 100, 120).project(camera)

    return Math.hypot(lower.x - upper.x, lower.y - upper.y)
}

/**
 * Resolves camera distance from the current controls target.
 * @param {THREE.Camera} camera Camera to inspect.
 * @param {{ target: THREE.Vector3 }} controls Controls stand-in.
 * @returns {number}
 */
function cameraTargetDistance(camera, controls) {
    return camera.position.distanceTo(controls.target)
}

test('PcbScene3dCameraRig suppresses height parallax in top inspection preset', () => {
    const camera = createCamera()
    const controls = createControls()
    const sceneDescription = createSceneDescription()

    PcbScene3dCameraRig.applyPreset(
        camera,
        controls,
        'isometric',
        sceneDescription
    )
    PcbScene3dCameraRig.applyPreset(camera, controls, 'top', sceneDescription)

    assert.ok(projectionHeightDrift(camera) < 0.001)

    const lowerBeforeZoom = new THREE.Vector3(500, 100, 0).project(camera)
    camera.zoom = 2
    camera.updateProjectionMatrix()
    const lowerAfterZoom = new THREE.Vector3(500, 100, 0).project(camera)

    assert.ok(Math.abs(lowerAfterZoom.x) > Math.abs(lowerBeforeZoom.x))
    assert.ok(projectionHeightDrift(camera) < 0.001)
})

test('PcbScene3dCameraRig keeps inspection pan scale zoom-aware once', () => {
    const camera = createCamera()
    const controls = createControls()
    const sceneDescription = createSceneDescription()

    PcbScene3dCameraRig.applyPreset(
        camera,
        controls,
        'isometric',
        sceneDescription
    )
    PcbScene3dCameraRig.applyPreset(camera, controls, 'top', sceneDescription)
    const visibleHeight = camera.top - camera.bottom
    const visibleWidth = camera.right - camera.left
    const lowerBeforeZoom = new THREE.Vector3(500, 100, 0).project(camera)

    camera.zoom = 2
    camera.updateProjectionMatrix()
    const lowerAfterZoom = new THREE.Vector3(500, 100, 0).project(camera)

    assert.equal(camera.top - camera.bottom, visibleHeight)
    assert.equal(camera.right - camera.left, visibleWidth)
    assert.ok(Math.abs(lowerAfterZoom.x) > Math.abs(lowerBeforeZoom.x))
    assert.equal((camera.top - camera.bottom) / camera.zoom, visibleHeight / 2)
})

test('PcbScene3dCameraRig inspection projection does not compound', () => {
    const camera = createCamera()
    const controls = createControls()
    const sceneDescription = createSceneDescription()

    PcbScene3dCameraRig.applyPreset(
        camera,
        controls,
        'isometric',
        sceneDescription
    )
    PcbScene3dCameraRig.applyPreset(camera, controls, 'top', sceneDescription)
    const firstDistance = cameraTargetDistance(camera, controls)
    const firstZoom = camera.zoom

    PcbScene3dCameraRig.applyPreset(camera, controls, 'top', sceneDescription)

    assert.equal(cameraTargetDistance(camera, controls), firstDistance)
    assert.equal(camera.zoom, firstZoom)
})

test('PcbScene3dCameraRig restores perspective projection after inspection', () => {
    const camera = createCamera()
    const controls = createControls()
    const sceneDescription = createSceneDescription()

    PcbScene3dCameraRig.applyPreset(
        camera,
        controls,
        'isometric',
        sceneDescription
    )
    PcbScene3dCameraRig.applyPreset(camera, controls, 'top', sceneDescription)
    assert.equal(camera.isPerspectiveCamera, false)
    assert.equal(camera.isOrthographicCamera, true)

    PcbScene3dCameraRig.applyPreset(
        camera,
        controls,
        'isometric',
        sceneDescription
    )

    assert.equal(camera.zoom, 1)
    assert.equal(camera.isPerspectiveCamera, true)
    assert.equal(Boolean(camera.isOrthographicCamera), false)
    assert.equal(camera.near, 10)
    assert.equal(camera.far, 25000)
    assert.equal(controls.maxDistance, 8000)
})
