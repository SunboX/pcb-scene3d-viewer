/**
 * Resolves camera presets and basic rig state for the PCB 3D scene.
 */
export class PcbScene3dCameraRig {
    static #INSPECTION_PROJECTION_STATE_KEY = 'scene3dInspectionProjection'

    /**
     * Resolves the initial camera radius from the board size.
     * @param {{ board?: { widthMil?: number, heightMil?: number }, sourceFormat?: string }} sceneDescription
     * @returns {number}
     */
    static resolveInitialRadius(sceneDescription) {
        const width = Number(sceneDescription?.board?.widthMil || 0)
        const height = Number(sceneDescription?.board?.heightMil || 0)
        return Math.max(width, height, 800) * 1.9
    }

    /**
     * Resolves one named camera preset into a z-up camera pose.
     * @param {string} preset
     * @param {{ board?: { widthMil?: number, heightMil?: number }, sourceFormat?: string }} sceneDescription
     * @param {{ radius?: number, target?: { x?: number, y?: number, z?: number } }} [options]
     * @returns {{ radius: number, target: { x: number, y: number, z: number }, up: { x: number, y: number, z: number }, position: { x: number, y: number, z: number } }}
     */
    static resolvePreset(preset, sceneDescription, options = {}) {
        const normalizedPreset = String(preset || 'isometric').toLowerCase()
        const radius =
            Number(options.radius) ||
            PcbScene3dCameraRig.resolveInitialRadius(sceneDescription)
        const target = {
            x: Number(options.target?.x || 0),
            y: Number(options.target?.y || 0),
            z: Number(options.target?.z || 0)
        }

        if (normalizedPreset === 'top') {
            return {
                radius,
                target,
                up: { x: 0, y: 1, z: 0 },
                position: {
                    x: target.x,
                    y: target.y,
                    z: target.z + radius
                }
            }
        }

        if (normalizedPreset === 'bottom') {
            return {
                radius,
                target,
                up: PcbScene3dCameraRig.#bottomUpVector(sceneDescription),
                position: {
                    x: target.x,
                    y: target.y,
                    z: target.z - radius
                }
            }
        }

        const theta = -Math.PI / 4
        const phi = Math.PI / 3.3

        return {
            radius,
            target,
            up: { x: 0, y: 0, z: 1 },
            position: PcbScene3dCameraRig.#resolvePosition(
                theta,
                phi,
                radius,
                target
            )
        }
    }

    /**
     * Applies one preset to a Three camera and optional OrbitControls instance.
     * @param {{ position?: { set?: (x: number, y: number, z: number) => void }, up?: { set?: (x: number, y: number, z: number) => void }, lookAt?: (x: number, y: number, z: number) => void, updateProjectionMatrix?: () => void }} camera
     * @param {{ target?: { x?: number, y?: number, z?: number, set?: (x: number, y: number, z: number) => void }, update?: () => void }} [controls]
     * @param {string} preset
     * @param {{ board?: { widthMil?: number, heightMil?: number }, sourceFormat?: string }} sceneDescription
     * @returns {{ radius: number, target: { x: number, y: number, z: number }, up: { x: number, y: number, z: number }, position: { x: number, y: number, z: number } }}
     */
    static applyPreset(camera, controls, preset, sceneDescription) {
        const normalizedPreset = String(preset || 'isometric').toLowerCase()
        const resetsView =
            normalizedPreset === 'isometric' || normalizedPreset === 'reset'
        const pose = PcbScene3dCameraRig.resolvePreset(
            normalizedPreset,
            sceneDescription,
            {
                radius: resetsView
                    ? PcbScene3dCameraRig.resolveInitialRadius(sceneDescription)
                    : PcbScene3dCameraRig.#resolveCurrentRadius(
                          camera,
                          controls
                      ),
                target: resetsView
                    ? { x: 0, y: 0, z: 0 }
                    : PcbScene3dCameraRig.#resolveCurrentTarget(controls)
            }
        )

        camera?.up?.set?.(pose.up.x, pose.up.y, pose.up.z)
        controls?.target?.set?.(pose.target.x, pose.target.y, pose.target.z)
        camera?.position?.set?.(
            pose.position.x,
            pose.position.y,
            pose.position.z
        )
        camera?.lookAt?.(pose.target.x, pose.target.y, pose.target.z)
        controls?.update?.()
        camera?.updateProjectionMatrix?.()
        if (normalizedPreset === 'top' || normalizedPreset === 'bottom') {
            PcbScene3dCameraRig.#applyInspectionProjection(
                camera,
                controls,
                pose
            )
        } else {
            PcbScene3dCameraRig.#restoreProjection(camera, controls)
        }

        return pose
    }

    /**
     * Resolves one camera position from spherical coordinates in a z-up world.
     * @param {number} theta
     * @param {number} phi
     * @param {number} radius
     * @param {{ x: number, y: number, z: number }} target
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolvePosition(theta, phi, radius, target) {
        const sinPhi = Math.sin(phi)

        return {
            x: target.x + radius * sinPhi * Math.cos(theta),
            y: target.y + radius * sinPhi * Math.sin(theta),
            z: target.z + radius * Math.cos(phi)
        }
    }

    /**
     * Resolves the current camera radius from the camera-target distance.
     * @param {{ position?: { x?: number, y?: number, z?: number } }} [camera]
     * @param {{ target?: { x?: number, y?: number, z?: number } }} [controls]
     * @returns {number}
     */
    static #resolveCurrentRadius(camera, controls) {
        const position = camera?.position || {}
        const target = controls?.target || {}

        return Math.max(
            Math.hypot(
                Number(position.x || 0) - Number(target.x || 0),
                Number(position.y || 0) - Number(target.y || 0),
                Number(position.z || 0) - Number(target.z || 0)
            ),
            1
        )
    }

    /**
     * Resolves the current controls target into a plain object.
     * @param {{ target?: { x?: number, y?: number, z?: number } }} [controls]
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolveCurrentTarget(controls) {
        return {
            x: Number(controls?.target?.x || 0),
            y: Number(controls?.target?.y || 0),
            z: Number(controls?.target?.z || 0)
        }
    }

    /**
     * Replaces perspective projection with orthographic projection for
     * top/bottom inspection views.
     * @param {object} camera Three.js perspective camera.
     * @param {object} controls OrbitControls-like instance.
     * @param {object} pose Resolved camera pose.
     * @returns {void}
     */
    static #applyInspectionProjection(camera, controls, pose) {
        if (!camera || !pose?.target || !pose?.radius) {
            return
        }

        const state = PcbScene3dCameraRig.#captureProjectionState(
            camera,
            controls
        )
        const radius = Math.max(Number(pose.radius || 0), 1)
        const fovRadians = (Number(camera.fov || 38) * Math.PI) / 180

        state.active = true
        state.orthographicHeight = 2 * radius * Math.tan(fovRadians / 2)
        PcbScene3dCameraRig.#applyOrthographicProjection(camera, state)
        controls?.update?.()
    }

    /**
     * Captures the first unmodified projection settings for a camera.
     * @param {object} camera Three.js camera.
     * @param {object} controls OrbitControls-like instance.
     * @returns {object}
     */
    static #captureProjectionState(camera, controls) {
        const userData = PcbScene3dCameraRig.#userData(camera)
        const stateKey = PcbScene3dCameraRig.#INSPECTION_PROJECTION_STATE_KEY

        if (!userData[stateKey]) {
            userData[stateKey] = {
                active: false,
                orthographicHeight: 0,
                originalUpdateProjectionMatrix:
                    camera.updateProjectionMatrix?.bind?.(camera) || null,
                isPerspectiveCamera: camera.isPerspectiveCamera,
                isOrthographicCamera: camera.isOrthographicCamera,
                left: camera.left,
                right: camera.right,
                top: camera.top,
                bottom: camera.bottom,
                zoom: Number(camera?.zoom || 1),
                near: Number(camera?.near || 0),
                far: Number(camera?.far || 0),
                maxDistance: Number(controls?.maxDistance || 0)
            }
            PcbScene3dCameraRig.#patchCameraProjectionUpdater(camera)
        }

        return userData[stateKey]
    }

    /**
     * Patches projection updates so orthographic inspection survives resizes.
     * @param {object} camera Three.js camera.
     * @returns {void}
     */
    static #patchCameraProjectionUpdater(camera) {
        const state =
            camera.userData[
                PcbScene3dCameraRig.#INSPECTION_PROJECTION_STATE_KEY
            ]

        if (!state?.originalUpdateProjectionMatrix) {
            return
        }

        camera.updateProjectionMatrix = () => {
            state.originalUpdateProjectionMatrix()
            if (state.active) {
                PcbScene3dCameraRig.#applyOrthographicProjection(camera, state)
            }
        }
    }

    /**
     * Applies an orthographic projection matrix to the existing camera.
     * @param {object} camera Three.js camera.
     * @param {object} state Captured camera state.
     * @returns {void}
     */
    static #applyOrthographicProjection(camera, state) {
        const zoom = Math.max(Number(camera.zoom || 1), 0.0001)
        const height = Math.max(Number(state.orthographicHeight || 0) / zoom, 1)
        const width = height * Math.max(Number(camera.aspect || 1), 0.0001)
        const left = -width / 2
        const right = width / 2
        const top = height / 2
        const bottom = -height / 2

        camera.left = left
        camera.right = right
        camera.top = top
        camera.bottom = bottom
        camera.isPerspectiveCamera = false
        camera.isOrthographicCamera = true
        camera.projectionMatrix?.makeOrthographic?.(
            left,
            right,
            top,
            bottom,
            camera.near,
            camera.far
        )
        camera.projectionMatrixInverse
            ?.copy?.(camera.projectionMatrix)
            ?.invert?.()
    }

    /**
     * Restores perspective settings after leaving top/bottom inspection views.
     * @param {object} camera Three.js camera.
     * @param {object} controls OrbitControls-like instance.
     * @returns {void}
     */
    static #restoreProjection(camera, controls) {
        const state =
            camera?.userData?.[
                PcbScene3dCameraRig.#INSPECTION_PROJECTION_STATE_KEY
            ]

        if (!state) {
            return
        }

        if ('zoom' in camera) {
            camera.zoom = state.zoom
        }
        if ('near' in camera && state.near > 0) {
            camera.near = state.near
        }
        if ('far' in camera && state.far > 0) {
            camera.far = state.far
        }
        camera.isPerspectiveCamera = state.isPerspectiveCamera
        camera.isOrthographicCamera = state.isOrthographicCamera
        camera.left = state.left
        camera.right = state.right
        camera.top = state.top
        camera.bottom = state.bottom
        if (controls && 'maxDistance' in controls && state.maxDistance > 0) {
            controls.maxDistance = state.maxDistance
        }
        state.active = false
        controls?.update?.()
        camera.updateProjectionMatrix?.()
    }

    /**
     * Ensures a mutable user-data object exists on the camera.
     * @param {object} camera Three.js camera.
     * @returns {object}
     */
    static #userData(camera) {
        if (!camera.userData) {
            camera.userData = {}
        }

        return camera.userData
    }

    /**
     * Resolves screen-up for bottom views from the scene coordinate contract.
     * @param {{ coordinateSystem?: string }} sceneDescription Scene metadata.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #bottomUpVector(sceneDescription) {
        const coordinateSystem = String(
            sceneDescription?.coordinateSystem || ''
        ).toLowerCase()

        return coordinateSystem === 'kicad-3d-y-up'
            ? { x: 0, y: 1, z: 0 }
            : { x: 0, y: -1, z: 0 }
    }
}
