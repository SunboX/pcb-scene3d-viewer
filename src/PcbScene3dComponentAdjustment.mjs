/**
 * Normalizes and applies live 3D component transform adjustments.
 */
export class PcbScene3dComponentAdjustment {
    /**
     * Finds transform adjustment targets beneath one scene object.
     * @param {any} rootObject Root object.
     * @returns {any[]}
     */
    static findTargets(rootObject) {
        if (!rootObject) {
            return []
        }

        const targets = rootObject?.userData?.scene3dAdjustmentTarget
            ? [rootObject]
            : []
        ;(rootObject?.children || []).forEach((child) => {
            targets.push(...PcbScene3dComponentAdjustment.findTargets(child))
        })

        return targets
    }

    /**
     * Applies one live transform to a target relative to its original baseline.
     * @param {any} THREE Three.js namespace.
     * @param {any} target Target object.
     * @param {{ scale?: { x?: number, y?: number, z?: number }, rotationDeg?: { x?: number, y?: number, z?: number }, offsetMil?: { x?: number, y?: number, z?: number } }} adjustment Adjustment.
     * @returns {void}
     */
    static applyToTarget(THREE, target, adjustment) {
        const current = PcbScene3dComponentAdjustment.normalize(adjustment)
        const baseline = PcbScene3dComponentAdjustment.normalize(
            target?.userData?.scene3dAdjustmentBaseline ||
                PcbScene3dComponentAdjustment.neutral()
        )
        const delta = {
            scale: {
                x: PcbScene3dComponentAdjustment.#scaleRatio(
                    current.scale.x,
                    baseline.scale.x
                ),
                y: PcbScene3dComponentAdjustment.#scaleRatio(
                    current.scale.y,
                    baseline.scale.y
                ),
                z: PcbScene3dComponentAdjustment.#scaleRatio(
                    current.scale.z,
                    baseline.scale.z
                )
            },
            rotationDeg: {
                x: current.rotationDeg.x - baseline.rotationDeg.x,
                y: current.rotationDeg.y - baseline.rotationDeg.y,
                z: current.rotationDeg.z - baseline.rotationDeg.z
            },
            offsetMil: {
                x: current.offsetMil.x - baseline.offsetMil.x,
                y: current.offsetMil.y - baseline.offsetMil.y,
                z: current.offsetMil.z - baseline.offsetMil.z
            }
        }

        target?.position?.set?.(
            delta.offsetMil.x,
            delta.offsetMil.y,
            delta.offsetMil.z
        )
        target?.scale?.set?.(delta.scale.x, delta.scale.y, delta.scale.z)
        PcbScene3dComponentAdjustment.#applyRotation(THREE, target, delta)
    }

    /**
     * Normalizes one adjustment object.
     * @param {{ scale?: { x?: number, y?: number, z?: number }, rotationDeg?: { x?: number, y?: number, z?: number }, offsetMil?: { x?: number, y?: number, z?: number }, dxMil?: number, dyMil?: number, dzMil?: number } | null | undefined} adjustment Raw adjustment.
     * @returns {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }}
     */
    static normalize(adjustment) {
        const scale = adjustment?.scale || {}
        const rotationDeg = adjustment?.rotationDeg || {}
        const offsetMil = adjustment?.offsetMil || {}

        return {
            scale: {
                x: PcbScene3dComponentAdjustment.#numberOr(scale.x, 1),
                y: PcbScene3dComponentAdjustment.#numberOr(scale.y, 1),
                z: PcbScene3dComponentAdjustment.#numberOr(scale.z, 1)
            },
            rotationDeg: {
                x: PcbScene3dComponentAdjustment.#numberOr(rotationDeg.x, 0),
                y: PcbScene3dComponentAdjustment.#numberOr(rotationDeg.y, 0),
                z: PcbScene3dComponentAdjustment.#numberOr(rotationDeg.z, 0)
            },
            offsetMil: {
                x: PcbScene3dComponentAdjustment.#numberOr(
                    offsetMil.x ?? adjustment?.dxMil,
                    0
                ),
                y: PcbScene3dComponentAdjustment.#numberOr(
                    offsetMil.y ?? adjustment?.dyMil,
                    0
                ),
                z: PcbScene3dComponentAdjustment.#numberOr(
                    offsetMil.z ?? adjustment?.dzMil,
                    0
                )
            }
        }
    }

    /**
     * Returns a neutral transform adjustment.
     * @returns {{ scale: { x: number, y: number, z: number }, rotationDeg: { x: number, y: number, z: number }, offsetMil: { x: number, y: number, z: number } }}
     */
    static neutral() {
        return {
            scale: { x: 1, y: 1, z: 1 },
            rotationDeg: { x: 0, y: 0, z: 0 },
            offsetMil: { x: 0, y: 0, z: 0 }
        }
    }

    /**
     * Applies KiCad-style model-local rotation order to an adjustment target.
     * @param {any} THREE Three.js namespace.
     * @param {any} target Target object.
     * @param {{ rotationDeg: { x: number, y: number, z: number } }} adjustment Rotation adjustment.
     * @returns {void}
     */
    static #applyRotation(THREE, target, adjustment) {
        const x = (-Number(adjustment.rotationDeg.x || 0) * Math.PI) / 180
        const y = (-Number(adjustment.rotationDeg.y || 0) * Math.PI) / 180
        const z = (-Number(adjustment.rotationDeg.z || 0) * Math.PI) / 180

        if (THREE?.Matrix4 && target?.quaternion?.setFromRotationMatrix) {
            const rotationMatrix = new THREE.Matrix4()
                .makeRotationZ(z)
                .multiply(new THREE.Matrix4().makeRotationY(y))
                .multiply(new THREE.Matrix4().makeRotationX(x))
            target.quaternion.setFromRotationMatrix(rotationMatrix)
            return
        }

        if (!target?.rotation) {
            return
        }

        target.rotation.x = x
        target.rotation.y = y
        target.rotation.z = z
    }

    /**
     * Returns a finite number or a fallback.
     * @param {unknown} value Source value.
     * @param {number} fallback Fallback value.
     * @returns {number}
     */
    static #numberOr(value, fallback) {
        const numericValue = Number(value)
        return Number.isFinite(numericValue) ? numericValue : fallback
    }

    /**
     * Computes a safe scale ratio.
     * @param {number} value Current value.
     * @param {number} baseline Baseline value.
     * @returns {number}
     */
    static #scaleRatio(value, baseline) {
        return baseline === 0 ? value : value / baseline
    }
}
