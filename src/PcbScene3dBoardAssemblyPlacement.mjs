/**
 * Builds the synthetic external placement for a full board assembly model.
 */
export class PcbScene3dBoardAssemblyPlacement {
    /**
     * Builds the synthetic placement for a full board assembly model.
     * @param {{ board?: { widthMil?: number, heightMil?: number, thicknessMil?: number, surfaceColor?: number }, boardAssemblyModel?: any, sourceFormat?: string }} sceneDescription
     * @returns {any | null}
     */
    static build(sceneDescription) {
        const model = sceneDescription?.boardAssemblyModel || null
        if (!model) {
            return null
        }

        const board = sceneDescription?.board || {}
        const mirrorsSourceY =
            String(sceneDescription?.sourceFormat || '').toLowerCase() ===
            'altium'
        const sourceFrameScale = {
            x: 1,
            y: mirrorsSourceY ? -1 : 1,
            z: 1
        }

        return {
            designator: 'Board assembly',
            sourceType: 'board-assembly',
            mountSide: 'board-assembly',
            rotationDeg: 0,
            positionMil: {
                x: -Number(board.widthMil || 0) / 2,
                y:
                    (mirrorsSourceY ? 1 : -1) *
                    (Number(board.heightMil || 0) / 2),
                z: 0
            },
            sourceFrameScale,
            board: {
                widthMil: Number(board.widthMil || 0),
                heightMil: Number(board.heightMil || 0),
                thicknessMil: Number(board.thicknessMil || 0),
                surfaceColor: Number(board.surfaceColor)
            },
            externalModel: model
        }
    }
}
