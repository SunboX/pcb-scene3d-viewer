import { PcbScene3dExternalCompanionFallback } from './PcbScene3dExternalCompanionFallback.mjs'

/**
 * Lifts authored model placements that sit on companion fallback bases.
 */
export class PcbScene3dCompanionBasePlacementAdjuster {
    static #ENVELOPE_MARGIN_RATIO = 0.25
    static #ENVELOPE_MIN_MARGIN_MIL = 20
    static #POSITION_EPSILON = 1e-6

    /**
     * Returns a scene copy with placements seated on companion fallback bases.
     * @param {object} sceneDescription Scene description.
     * @returns {object}
     */
    static adjust(sceneDescription) {
        const bases =
            PcbScene3dCompanionBasePlacementAdjuster.#companionBases(
                sceneDescription
            )
        if (!bases.length) {
            return sceneDescription
        }

        return {
            ...sceneDescription,
            externalPlacements:
                PcbScene3dCompanionBasePlacementAdjuster.#adjustPlacements(
                    sceneDescription?.externalPlacements,
                    bases
                ),
            staticBodyPlacements:
                PcbScene3dCompanionBasePlacementAdjuster.#adjustPlacements(
                    sceneDescription?.staticBodyPlacements,
                    bases
                )
        }
    }

    /**
     * Resolves companion fallback bases from components in one scene.
     * @param {object} sceneDescription Scene description.
     * @returns {object[]}
     */
    static #companionBases(sceneDescription) {
        return (
            Array.isArray(sceneDescription?.components)
                ? sceneDescription.components
                : []
        )
            .filter((component) =>
                PcbScene3dExternalCompanionFallback.shouldKeepFallback(
                    sceneDescription,
                    component
                )
            )
            .map((component) =>
                PcbScene3dCompanionBasePlacementAdjuster.#buildBase(component)
            )
            .filter(Boolean)
    }

    /**
     * Builds one companion base descriptor from a component.
     * @param {object} component Scene component.
     * @returns {object | null}
     */
    static #buildBase(component) {
        const size = component?.body?.sizeMil || {}
        const heightMil = Number(size.height || 0)
        const widthMil = Number(size.width || 0)
        const depthMil = Number(size.depth || 0)
        if (!(heightMil > 0) || !(widthMil > 0) || !(depthMil > 0)) {
            return null
        }

        return {
            designator: String(component?.designator || '').trim(),
            mountSide: String(component?.mountSide || 'top').toLowerCase(),
            positionMil: {
                x: Number(component?.positionMil?.x || 0),
                y: Number(component?.positionMil?.y || 0),
                z: Number(component?.positionMil?.z || 0)
            },
            rotationDeg: Number(component?.rotationDeg || 0),
            widthMil,
            depthMil,
            heightMil,
            signedLiftMil:
                (PcbScene3dCompanionBasePlacementAdjuster.#isBottomSide(
                    component?.mountSide
                )
                    ? -1
                    : 1) * heightMil
        }
    }

    /**
     * Adjusts one placement list against all companion bases.
     * @param {object[] | undefined} placements Original placements.
     * @param {object[]} bases Companion bases.
     * @returns {object[]}
     */
    static #adjustPlacements(placements, bases) {
        return (Array.isArray(placements) ? placements : []).map((placement) =>
            PcbScene3dCompanionBasePlacementAdjuster.#adjustPlacement(
                placement,
                bases
            )
        )
    }

    /**
     * Adjusts one placement when it overlaps a companion base.
     * @param {object} placement Original placement.
     * @param {object[]} bases Companion bases.
     * @returns {object}
     */
    static #adjustPlacement(placement, bases) {
        const base = bases.find((candidate) =>
            PcbScene3dCompanionBasePlacementAdjuster.#isPlacementOnBase(
                placement,
                candidate
            )
        )
        if (!base) {
            return placement
        }

        return {
            ...placement,
            positionMil: {
                ...(placement?.positionMil || {}),
                z: PcbScene3dCompanionBasePlacementAdjuster.#roundMil(
                    Number(placement?.positionMil?.z || 0) + base.signedLiftMil
                )
            }
        }
    }

    /**
     * Checks whether a placement should be lifted onto one companion base.
     * @param {object} placement Candidate placement.
     * @param {object} base Companion base descriptor.
     * @returns {boolean}
     */
    static #isPlacementOnBase(placement, base) {
        if (
            !PcbScene3dCompanionBasePlacementAdjuster.#isSameSide(
                placement,
                base
            )
        ) {
            return false
        }

        const local =
            PcbScene3dCompanionBasePlacementAdjuster.#toBaseLocalPosition(
                placement,
                base
            )
        const envelopeMarginMil =
            PcbScene3dCompanionBasePlacementAdjuster.#envelopeMarginMil(base)

        return (
            Math.abs(local.x) <= base.widthMil / 2 + envelopeMarginMil &&
            Math.abs(local.y) <= base.depthMil / 2 + envelopeMarginMil
        )
    }

    /**
     * Checks whether a placement and base are on the same board side.
     * @param {object} placement Candidate placement.
     * @param {object} base Companion base descriptor.
     * @returns {boolean}
     */
    static #isSameSide(placement, base) {
        return (
            String(placement?.mountSide || 'top').toLowerCase() ===
            String(base?.mountSide || 'top').toLowerCase()
        )
    }

    /**
     * Converts a placement anchor into a companion-base local frame.
     * @param {object} placement Candidate placement.
     * @param {object} base Companion base descriptor.
     * @returns {{ x: number, y: number }}
     */
    static #toBaseLocalPosition(placement, base) {
        const dx =
            Number(placement?.positionMil?.x || 0) -
            Number(base?.positionMil?.x || 0)
        const dy =
            Number(placement?.positionMil?.y || 0) -
            Number(base?.positionMil?.y || 0)
        const radians = -((Number(base?.rotationDeg || 0) * Math.PI) / 180)
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)

        return {
            x: dx * cos - dy * sin,
            y: dx * sin + dy * cos
        }
    }

    /**
     * Resolves loose matching margin for authored parts near a base edge.
     * @param {object} base Companion base descriptor.
     * @returns {number}
     */
    static #envelopeMarginMil(base) {
        return Math.max(
            PcbScene3dCompanionBasePlacementAdjuster.#ENVELOPE_MIN_MARGIN_MIL,
            Math.min(Number(base?.widthMil || 0), Number(base?.depthMil || 0)) *
                PcbScene3dCompanionBasePlacementAdjuster.#ENVELOPE_MARGIN_RATIO
        )
    }

    /**
     * Checks whether a mount side is bottom.
     * @param {string | undefined} mountSide Mount side.
     * @returns {boolean}
     */
    static #isBottomSide(mountSide) {
        return String(mountSide || 'top').toLowerCase() === 'bottom'
    }

    /**
     * Rounds one mil coordinate.
     * @param {number} value Candidate value.
     * @returns {number}
     */
    static #roundMil(value) {
        const rounded =
            Math.round(
                Number(value || 0) /
                    PcbScene3dCompanionBasePlacementAdjuster.#POSITION_EPSILON
            ) * PcbScene3dCompanionBasePlacementAdjuster.#POSITION_EPSILON
        return Object.is(rounded, -0) ? 0 : rounded
    }
}
