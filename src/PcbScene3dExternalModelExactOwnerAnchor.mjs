/**
 * Detects pad-fallback placements that already use the owner's authored source
 * anchor.
 */
export class PcbScene3dExternalModelExactOwnerAnchor {
    static #TOLERANCE_MIL = 1

    /**
     * Checks whether one placement should keep its authored source anchor.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null | undefined} component Scene component.
     * @returns {boolean}
     */
    static matches(placement, component) {
        if (
            String(placement?.projection?.source || '').toLowerCase() !==
                'pad-fallback' ||
            placement?.modelTransform?.ownerAnchorOffsetMil
        ) {
            return false
        }

        return (
            PcbScene3dExternalModelExactOwnerAnchor.#isNearSamePoint(
                placement?.positionMil,
                component?.positionMil
            ) ||
            PcbScene3dExternalModelExactOwnerAnchor.#isNearSamePoint(
                placement?.bodyPositionMil,
                component?.boardPositionMil
            )
        )
    }

    /**
     * Checks whether two XY points are effectively the same authored anchor.
     * @param {{ x?: number, y?: number } | null | undefined} first First point.
     * @param {{ x?: number, y?: number } | null | undefined} second Second point.
     * @returns {boolean}
     */
    static #isNearSamePoint(first, second) {
        const firstX = Number(first?.x)
        const firstY = Number(first?.y)
        const secondX = Number(second?.x)
        const secondY = Number(second?.y)
        if (
            !Number.isFinite(firstX) ||
            !Number.isFinite(firstY) ||
            !Number.isFinite(secondX) ||
            !Number.isFinite(secondY)
        ) {
            return false
        }

        return (
            Math.hypot(firstX - secondX, firstY - secondY) <=
            PcbScene3dExternalModelExactOwnerAnchor.#TOLERANCE_MIL
        )
    }
}
