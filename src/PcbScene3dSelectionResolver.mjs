/**
 * Resolves selection payloads from picked Three.js object trees.
 */
export class PcbScene3dSelectionResolver {
    /**
     * Resolves the picked selection record from raycast intersections.
     * @param {{ object?: any }[]} intersections Intersections from a raycast.
     * @returns {{ designator?: string, sourceType?: string } | null}
     */
    static fromIntersections(intersections) {
        for (const intersection of intersections) {
            const selection = PcbScene3dSelectionResolver.fromObject(
                intersection?.object
            )
            if (selection) {
                return selection
            }
        }

        return null
    }

    /**
     * Resolves one selection payload by walking up a picked object tree.
     * @param {any} object Picked object.
     * @returns {{ designator?: string, sourceType?: string } | null}
     */
    static fromObject(object) {
        let current = object

        while (current) {
            const selection = current?.userData?.scene3dSelection
            if (selection) {
                return selection
            }

            current = current.parent || null
        }

        return null
    }
}
