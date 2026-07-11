/**
 * Maps canonical drill descriptors onto the viewer's compact pad-detail shape.
 */
export class PcbScene3dCircuitJsonDrillDetail {
    static #RECTANGULAR_HOLE_SHAPE = 1
    static #SLOTTED_HOLE_SHAPE = 2

    /**
     * Builds common viewer drill fields without losing canonical aperture shape.
     * @param {{ diameter: number, width: number, height: number, shape: 'circle' | 'pill' | 'rect', slotLength: number, rotationDeg: number }} drill Canonical drill descriptor.
     * @returns {{ holeDiameter: number, holeSlotLength: number, holeWidth: number, holeHeight: number, holeShape: number | null, holeRotation: number }} Viewer drill fields.
     */
    static fields(drill) {
        return {
            holeDiameter: drill.diameter,
            holeSlotLength: drill.slotLength,
            holeWidth: drill.width,
            holeHeight: drill.height,
            holeShape:
                drill.shape === 'rect'
                    ? PcbScene3dCircuitJsonDrillDetail.#RECTANGULAR_HOLE_SHAPE
                    : drill.slotLength > drill.diameter
                      ? PcbScene3dCircuitJsonDrillDetail.#SLOTTED_HOLE_SHAPE
                      : null,
            holeRotation: drill.rotationDeg
        }
    }
}

Object.freeze(PcbScene3dCircuitJsonDrillDetail.prototype)
Object.freeze(PcbScene3dCircuitJsonDrillDetail)
