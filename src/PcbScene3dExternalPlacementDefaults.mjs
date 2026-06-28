const DEFAULT_Z_CLEARANCE_MM = 0.03
const MIL_PER_MM = 1000 / 25.4
const DEFAULT_Z_CLEARANCE_MIL = DEFAULT_Z_CLEARANCE_MM * MIL_PER_MM
const DEFAULT_Z_CLEARANCE_MARKER = 'scene3dDefaultZClearanceMil'

/**
 * Applies source-format defaults for external component model placements.
 */
export class PcbScene3dExternalPlacementDefaults {
    /**
     * Adds default component model clearances to supported scene descriptions.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {object | null | undefined}
     */
    static apply(sceneDescription) {
        if (
            !sceneDescription ||
            !PcbScene3dExternalPlacementDefaults.#usesDefaultZClearance(
                sceneDescription
            )
        ) {
            return sceneDescription
        }

        let changed = false
        const externalPlacements = Array.isArray(
            sceneDescription.externalPlacements
        )
            ? sceneDescription.externalPlacements.map((placement) => {
                  const normalized =
                      PcbScene3dExternalPlacementDefaults.applyPlacement(
                          placement
                      )
                  changed = changed || normalized !== placement
                  return normalized
              })
            : sceneDescription.externalPlacements
        const components = Array.isArray(sceneDescription.components)
            ? sceneDescription.components.map((component) => {
                  const normalized =
                      PcbScene3dExternalPlacementDefaults.applyComponent(
                          component
                      )
                  changed = changed || normalized !== component
                  return normalized
              })
            : sceneDescription.components

        return changed
            ? {
                  ...sceneDescription,
                  externalPlacements,
                  components
              }
            : sceneDescription
    }

    /**
     * Adds the default clearance to one external placement.
     * @param {object | null | undefined} placement External placement.
     * @returns {object | null | undefined}
     */
    static applyPlacement(placement) {
        if (
            !PcbScene3dExternalPlacementDefaults.#isComponentModelPlacement(
                placement
            )
        ) {
            return placement
        }

        const modelTransform =
            PcbScene3dExternalPlacementDefaults.#modelTransformWithDefaultZ(
                placement?.modelTransform
            )
        return modelTransform === placement?.modelTransform
            ? placement
            : {
                  ...placement,
                  modelTransform
              }
    }

    /**
     * Adds the default clearance to one component-backed model placement.
     * @param {object | null | undefined} component Scene component.
     * @returns {object | null | undefined}
     */
    static applyComponent(component) {
        if (!component?.externalModel) {
            return component
        }

        const modelTransform =
            PcbScene3dExternalPlacementDefaults.#modelTransformWithDefaultZ(
                component?.modelTransform
            )
        return modelTransform === component?.modelTransform
            ? component
            : {
                  ...component,
                  modelTransform
              }
    }

    /**
     * Returns the default external-model Z clearance in mil.
     * @returns {number}
     */
    static defaultZClearanceMil() {
        return DEFAULT_Z_CLEARANCE_MIL
    }

    /**
     * Resolves the source-authored Z offset excluding renderer defaults.
     * @param {object | null | undefined} modelTransform Model transform.
     * @returns {number}
     */
    static authoredOffsetZMil(modelTransform) {
        const offsetMil =
            PcbScene3dExternalPlacementDefaults.#resolveOffsetMil(
                modelTransform
            )
        const defaultClearance = Number(
            modelTransform?.[DEFAULT_Z_CLEARANCE_MARKER]
        )

        return Number.isFinite(defaultClearance)
            ? offsetMil.z - defaultClearance
            : offsetMil.z
    }

    /**
     * Checks whether a scene source uses the shared component Z clearance.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {boolean}
     */
    static #usesDefaultZClearance(sceneDescription) {
        const sourceFormat = String(sceneDescription?.sourceFormat || '')
            .trim()
            .toLowerCase()
        const coordinateSystem = String(
            sceneDescription?.coordinateSystem || ''
        )
            .trim()
            .toLowerCase()

        return (
            sourceFormat === 'altium' ||
            sourceFormat.startsWith('altium-') ||
            sourceFormat === 'kicad' ||
            sourceFormat.startsWith('kicad-') ||
            coordinateSystem === 'kicad-3d-y-up'
        )
    }

    /**
     * Checks whether one placement represents a component-level model.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static #isComponentModelPlacement(placement) {
        if (!placement?.externalModel) {
            return false
        }

        return (
            String(placement?.sourceType || '').toLowerCase() !==
            'board-assembly'
        )
    }

    /**
     * Adds default Z clearance to one model transform if not already applied.
     * @param {object | null | undefined} modelTransform Model transform.
     * @returns {object}
     */
    static #modelTransformWithDefaultZ(modelTransform) {
        const currentTransform = modelTransform || {}
        const marker = Number(currentTransform[DEFAULT_Z_CLEARANCE_MARKER])
        if (
            Number.isFinite(marker) &&
            Math.abs(marker - DEFAULT_Z_CLEARANCE_MIL) < 1e-9
        ) {
            return currentTransform
        }

        const offsetMil =
            PcbScene3dExternalPlacementDefaults.#resolveOffsetMil(
                currentTransform
            )
        const nextOffsetMil = {
            ...offsetMil,
            z: offsetMil.z + DEFAULT_Z_CLEARANCE_MIL
        }

        return {
            ...currentTransform,
            [DEFAULT_Z_CLEARANCE_MARKER]: DEFAULT_Z_CLEARANCE_MIL,
            offsetMil: nextOffsetMil,
            dxMil: nextOffsetMil.x,
            dyMil: nextOffsetMil.y,
            dzMil: nextOffsetMil.z
        }
    }

    /**
     * Resolves current and legacy model offset fields.
     * @param {object | null | undefined} modelTransform Model transform.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #resolveOffsetMil(modelTransform) {
        const offsetMil = modelTransform?.offsetMil || {}

        return {
            x: PcbScene3dExternalPlacementDefaults.#numberOr(
                offsetMil.x ?? modelTransform?.dxMil,
                0
            ),
            y: PcbScene3dExternalPlacementDefaults.#numberOr(
                offsetMil.y ?? modelTransform?.dyMil,
                0
            ),
            z: PcbScene3dExternalPlacementDefaults.#numberOr(
                offsetMil.z ?? modelTransform?.dzMil,
                0
            )
        }
    }

    /**
     * Returns a finite number or fallback.
     * @param {unknown} value Candidate value.
     * @param {number} fallback Fallback value.
     * @returns {number}
     */
    static #numberOr(value, fallback) {
        const numericValue = Number(value)
        return Number.isFinite(numericValue) ? numericValue : fallback
    }
}
