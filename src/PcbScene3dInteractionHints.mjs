/**
 * Centralizes pointer and touch interaction defaults for the 3D PCB viewport.
 */
export class PcbScene3dInteractionHints {
    /**
     * Applies explicit OrbitControls input mappings for desktop and touch.
     * @param {{ mouseButtons?: any, touches?: any }} controls
     * @param {{ MOUSE?: any, TOUCH?: any }} THREE
     * @param {string} [preset] Active camera preset.
     * @returns {void}
     */
    static configureControls(controls, THREE, preset = 'isometric') {
        if (!controls) {
            return
        }

        const inspectionPreset =
            String(preset || '').toLowerCase() === 'top' ||
            String(preset || '').toLowerCase() === 'bottom'

        if (THREE?.MOUSE) {
            controls.mouseButtons = {
                LEFT: inspectionPreset ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: inspectionPreset ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
            }
        }

        if (THREE?.TOUCH) {
            controls.touches = {
                ONE:
                    inspectionPreset && THREE.TOUCH.PAN
                        ? THREE.TOUCH.PAN
                        : THREE.TOUCH.ROTATE,
                TWO: THREE.TOUCH.DOLLY_PAN
            }
        }
    }

    /**
     * Resolves the default interaction copy for the current pointer type.
     * @param {{ matchMedia?: (query: string) => { matches?: boolean } }} [environment]
     * @param {((key: string) => string) | null} [translate] Translation lookup.
     * @returns {string}
     */
    static resolveDefaultMessage(
        environment = globalThis.window,
        translate = null
    ) {
        if (environment?.matchMedia?.('(pointer: coarse)')?.matches) {
            if (typeof translate === 'function') {
                const value = translate('scene3d.touchHint')
                if (value && value !== 'scene3d.touchHint') return value
            }
            return 'One-finger drag pans in Top/Bottom and orbits in Isometric. Pinch to zoom.'
        }

        if (typeof translate === 'function') {
            const value = translate('scene3d.pointerHint')
            if (value && value !== 'scene3d.pointerHint') return value
        }
        return 'Drag pans in Top/Bottom and orbits in Isometric; right-drag uses the alternate action. Use the wheel to zoom.'
    }
}
