/**
 * Resolves PCB substrate material colors for the 3D runtime.
 */
export class PcbScene3dBoardMaterialPalette {
    static #DEFAULT_SURFACE_COLOR = 0x2a5f27
    static #DEFAULT_EDGE_COLOR = 0xc9ca78
    static #BOARD_SURFACE_DARKEN_RATIO = 0.88

    /**
     * Resolves the solder-mask face color for the generated board shell.
     * @param {{ surfaceColor?: number } | undefined} board Board metadata.
     * @param {{ hasBoardAssemblyModel?: boolean, sourceFormat?: string }} [options] Scene options.
     * @returns {number}
     */
    static resolveSurfaceColor(board, options = {}) {
        if (
            options.hasBoardAssemblyModel &&
            !PcbScene3dBoardMaterialPalette.#shouldPreserveAuthoredSurfaceColor(
                options
            )
        ) {
            return PcbScene3dBoardMaterialPalette.#DEFAULT_SURFACE_COLOR
        }

        return Number.isInteger(board?.surfaceColor)
            ? board.surfaceColor
            : PcbScene3dBoardMaterialPalette.#DEFAULT_SURFACE_COLOR
    }

    /**
     * Resolves the darker display color for visible board solder-mask faces.
     * @param {{ surfaceColor?: number } | undefined} board Board metadata.
     * @param {{ hasBoardAssemblyModel?: boolean, sourceFormat?: string }} [options] Scene options.
     * @returns {number}
     */
    static resolveBoardSurfaceColor(board, options = {}) {
        return PcbScene3dBoardMaterialPalette.#darkenHexColor(
            PcbScene3dBoardMaterialPalette.resolveSurfaceColor(board, options),
            PcbScene3dBoardMaterialPalette.#BOARD_SURFACE_DARKEN_RATIO
        )
    }

    /**
     * Resolves the visible substrate-core color for board edge faces.
     * @param {{ edgeColor?: number } | null | undefined} board Board metadata.
     * @returns {number}
     */
    static resolveEdgeColor(board) {
        return Number.isInteger(board?.edgeColor)
            ? board.edgeColor
            : PcbScene3dBoardMaterialPalette.#DEFAULT_EDGE_COLOR
    }

    /**
     * Returns true when the source format supplies display-stable board colors.
     * @param {{ sourceFormat?: string }} options Scene options.
     * @returns {boolean}
     */
    static #shouldPreserveAuthoredSurfaceColor(options) {
        const sourceFormat = String(options?.sourceFormat || '').toLowerCase()
        return sourceFormat === 'altium' || sourceFormat.startsWith('altium-')
    }

    /**
     * Resolves whether the generated board face should render.
     * @param {{ hasBoardAssemblyModel?: boolean }} [options] Scene options.
     * @returns {boolean}
     */
    static isGeneratedSurfaceVisible(options = {}) {
        return PcbScene3dBoardMaterialPalette.isGeneratedBodyVisible(options)
    }

    /**
     * Resolves whether the generated board body should render.
     * @param {{ hasBoardAssemblyModel?: boolean }} [options] Scene options.
     * @returns {boolean}
     */
    static isGeneratedBodyVisible(options = {}) {
        return true
    }

    /**
     * Darkens a packed RGB color while preserving its hue.
     * @param {number} color Packed RGB color.
     * @param {number} ratio Channel multiplier.
     * @returns {number}
     */
    static #darkenHexColor(color, ratio) {
        const multiplier = Math.min(Math.max(Number(ratio || 0), 0), 1)

        return [16, 8, 0].reduce((output, shift) => {
            const channel = Math.round(((color >> shift) & 255) * multiplier)
            return output | (channel << shift)
        }, 0)
    }
}
