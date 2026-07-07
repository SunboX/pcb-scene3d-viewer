/**
 * Appends shallow copper-prism triangles to packed position buffers.
 */
export class PcbScene3dCopperPrismBuilder {
    static #COPPER_THICKNESS_MIL = 2.2

    /**
     * Returns the visual copper extrusion thickness.
     * @returns {number}
     */
    static thicknessMil() {
        return PcbScene3dCopperPrismBuilder.#COPPER_THICKNESS_MIL
    }

    /**
     * Returns half the visual copper extrusion thickness.
     * @returns {number}
     */
    static halfThicknessMil() {
        return PcbScene3dCopperPrismBuilder.#COPPER_THICKNESS_MIL / 2
    }

    /**
     * Appends one shallow triangular prism into the position buffer.
     * @param {number[]} positions Position buffer.
     * @param {{ x: number, y: number }} a First point.
     * @param {{ x: number, y: number }} b Second point.
     * @param {{ x: number, y: number }} c Third point.
     * @param {number} z Center Z position.
     * @returns {void}
     */
    static appendTriangle(positions, a, b, c, z) {
        const halfThickness = PcbScene3dCopperPrismBuilder.halfThicknessMil()
        const topZ = z + halfThickness
        const bottomZ = z - halfThickness
        positions.push(
            a.x,
            a.y,
            topZ,
            b.x,
            b.y,
            topZ,
            c.x,
            c.y,
            topZ,
            c.x,
            c.y,
            bottomZ,
            b.x,
            b.y,
            bottomZ,
            a.x,
            a.y,
            bottomZ
        )
    }

    /**
     * Appends a side wall for one actual copper boundary edge.
     * @param {number[]} positions Position buffer.
     * @param {{ x: number, y: number }} start Wall start point.
     * @param {{ x: number, y: number }} end Wall end point.
     * @param {number} z Center Z position.
     * @returns {void}
     */
    static appendBoundarySideTriangles(positions, start, end, z) {
        const halfThickness = PcbScene3dCopperPrismBuilder.halfThicknessMil()
        const topZ = z + halfThickness
        const bottomZ = z - halfThickness

        positions.push(
            start.x,
            start.y,
            topZ,
            end.x,
            end.y,
            topZ,
            end.x,
            end.y,
            bottomZ,
            start.x,
            start.y,
            topZ,
            end.x,
            end.y,
            bottomZ,
            start.x,
            start.y,
            bottomZ
        )
    }
}
