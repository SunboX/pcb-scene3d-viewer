/**
 * Resolves package body colors for generated fallback meshes.
 */
export class PcbScene3dBodyColor {
    /**
     * Resolves a simple body color by package family.
     * @param {string} family Package family.
     * @returns {number}
     */
    static resolve(family) {
        if (family === 'radial-capacitor') {
            return 0xa60f10
        }
        if (family === 'connector-block') {
            return 0xd5d6da
        }
        if (family === 'test-point') {
            return 0x0ea5a8
        }
        if (family === 'chip') {
            return 0xf5f5ef
        }

        return 0x232428
    }
}
