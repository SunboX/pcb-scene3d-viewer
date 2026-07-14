import { PcbScene3dGeometryZCompressor } from './PcbScene3dGeometryZCompressor.mjs'
import { PcbScene3dMaskCoveredCopperSurfaceFilter } from './PcbScene3dMaskCoveredCopperSurfaceFilter.mjs'

/**
 * Builds side-specific copper relief groups that sit below solder mask.
 */
export class PcbScene3dMaskCoveredCopperSideGroupBuilder {
    static #GREEN_MASKED_COPPER_TINT = 0x1f7a34
    static #FILL_COPPER_BLEND = 0.45
    static #TRACK_COPPER_BLEND = 0.7
    static #FILL_RENDER_ORDER = 10
    static #TRACK_RENDER_ORDER = 12
    static #TRACK_CENTER_OFFSET_MIL = 0.25
    static #TRACK_THICKNESS_MIL = 1.05

    /**
     * Builds one side group from prepared mask-covered copper meshes.
     * @param {any} THREE Three.js namespace.
     * @param {{ trackMesh?: any | null, arcMesh?: any | null, fillMesh?: any | null, textMesh?: any | null, z?: number, mirrorY?: boolean }} options
     * @returns {any}
     */
    static build(
        THREE,
        {
            trackMesh = null,
            arcMesh = null,
            fillMesh = null,
            textMesh = null,
            z = 0,
            mirrorY = false
        } = {}
    ) {
        const group = new THREE.Group()

        PcbScene3dMaskCoveredCopperSideGroupBuilder.#addCompressedMesh(
            group,
            trackMesh,
            'mask-covered-copper-tracks',
            z,
            {
                centerOffsetMil:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_CENTER_OFFSET_MIL,
                thicknessMil:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_THICKNESS_MIL,
                keepSideWalls: true,
                copperBlend:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_COPPER_BLEND,
                renderOrder:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_RENDER_ORDER
            }
        )
        PcbScene3dMaskCoveredCopperSideGroupBuilder.#addCompressedMesh(
            group,
            arcMesh,
            'mask-covered-copper-arcs',
            z,
            {
                centerOffsetMil:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_CENTER_OFFSET_MIL,
                thicknessMil:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_THICKNESS_MIL,
                keepSideWalls: true,
                copperBlend:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_COPPER_BLEND,
                renderOrder:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_RENDER_ORDER
            }
        )
        PcbScene3dMaskCoveredCopperSideGroupBuilder.#addCompressedMesh(
            group,
            fillMesh,
            'mask-covered-copper-fills',
            z,
            {
                copperBlend:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#FILL_COPPER_BLEND,
                renderOrder:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#FILL_RENDER_ORDER
            }
        )
        PcbScene3dMaskCoveredCopperSideGroupBuilder.#addCompressedMesh(
            group,
            textMesh,
            'mask-covered-copper-text',
            z,
            {
                copperBlend:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_COPPER_BLEND,
                renderOrder:
                    PcbScene3dMaskCoveredCopperSideGroupBuilder
                        .#TRACK_RENDER_ORDER
            }
        )

        if (mirrorY && group.children.length) {
            group.rotation.x = Math.PI
        }

        return group
    }

    /**
     * Compresses one mesh into mask relief space before adding it to a group.
     * @param {any} group Parent group.
     * @param {any | null} mesh Mesh to add.
     * @param {string} name Scene object name.
     * @param {number} z Source center Z.
     * @param {{ centerOffsetMil?: number, thicknessMil?: number, keepSideWalls?: boolean, copperBlend?: number, renderOrder?: number }} [options] Presentation options.
     * @returns {void}
     */
    static #addCompressedMesh(group, mesh, name, z, options = {}) {
        if (!mesh) {
            return
        }
        PcbScene3dGeometryZCompressor.compressMaskCoveredCopperMesh(mesh, z, {
            centerOffsetMil: options.centerOffsetMil,
            thicknessMil: options.thicknessMil
        })
        if (options.keepSideWalls === true) {
            PcbScene3dMaskCoveredCopperSurfaceFilter.keepOuterRelief(mesh)
        } else {
            PcbScene3dMaskCoveredCopperSurfaceFilter.keepOuterSurface(mesh)
        }
        mesh.name = name
        mesh.renderOrder = Number(options.renderOrder || 0)
        PcbScene3dMaskCoveredCopperSideGroupBuilder.#applyCopperTint(
            mesh,
            options.copperBlend
        )
        group.add(mesh)
    }

    /**
     * Applies a role-specific covered-copper tint without mutating sibling meshes.
     * @param {any} mesh Source mesh.
     * @param {number | undefined} copperBlend Blend ratio.
     * @returns {void}
     */
    static #applyCopperTint(mesh, copperBlend) {
        const material = mesh?.material?.clone?.() || mesh?.material
        const baseColor = material?.color?.getHex?.()
        if (!material || !Number.isInteger(baseColor)) {
            return
        }

        material.color.setHex(
            PcbScene3dMaskCoveredCopperSideGroupBuilder.#blendHexColor(
                baseColor,
                PcbScene3dMaskCoveredCopperSideGroupBuilder.#resolveMaskedCopperTint(
                    baseColor
                ),
                copperBlend
            )
        )
        mesh.material = material
    }

    /**
     * Resolves a mask-covered copper tint that stays in the solder-mask hue.
     * @param {number} baseColor Base mask-covered copper color.
     * @returns {number}
     */
    static #resolveMaskedCopperTint(baseColor) {
        const channels =
            PcbScene3dMaskCoveredCopperSideGroupBuilder.#rgbChannels(baseColor)
        const dominant =
            PcbScene3dMaskCoveredCopperSideGroupBuilder.#dominantChannel(
                channels
            )
        if (dominant === 'green') {
            return PcbScene3dMaskCoveredCopperSideGroupBuilder
                .#GREEN_MASKED_COPPER_TINT
        }

        return PcbScene3dMaskCoveredCopperSideGroupBuilder.#rgbToHex({
            red: PcbScene3dMaskCoveredCopperSideGroupBuilder.#tintChannel(
                channels.red,
                dominant === 'red'
            ),
            green: PcbScene3dMaskCoveredCopperSideGroupBuilder.#tintChannel(
                channels.green,
                dominant === 'green'
            ),
            blue: PcbScene3dMaskCoveredCopperSideGroupBuilder.#tintChannel(
                channels.blue,
                dominant === 'blue'
            )
        })
    }

    /**
     * Resolves one RGB channel from a packed color.
     * @param {number} color Packed hex color.
     * @returns {{ red: number, green: number, blue: number }}
     */
    static #rgbChannels(color) {
        return {
            red: (color >> 16) & 255,
            green: (color >> 8) & 255,
            blue: color & 255
        }
    }

    /**
     * Resolves the dominant color channel.
     * @param {{ red: number, green: number, blue: number }} channels RGB channels.
     * @returns {'red' | 'green' | 'blue'}
     */
    static #dominantChannel(channels) {
        return Object.entries(channels).sort(
            (left, right) => right[1] - left[1]
        )[0][0]
    }

    /**
     * Builds a tint channel that preserves the source mask hue.
     * @param {number} channel Source channel value.
     * @param {boolean} dominant Whether this channel is dominant.
     * @returns {number}
     */
    static #tintChannel(channel, dominant) {
        const value = dominant ? channel * 1.25 + 16 : channel * 0.84
        return Math.min(255, Math.max(0, Math.round(value)))
    }

    /**
     * Packs RGB channels into a hex color.
     * @param {{ red: number, green: number, blue: number }} channels RGB channels.
     * @returns {number}
     */
    static #rgbToHex(channels) {
        return (channels.red << 16) | (channels.green << 8) | channels.blue
    }

    /**
     * Blends two integer RGB colors.
     * @param {number} baseColor Base color.
     * @param {number} overlayColor Overlay color.
     * @param {number | undefined} overlayRatio Overlay ratio.
     * @returns {number}
     */
    static #blendHexColor(baseColor, overlayColor, overlayRatio) {
        const ratio = Math.min(Math.max(Number(overlayRatio || 0), 0), 1)
        const inverse = 1 - ratio

        return [16, 8, 0].reduce((output, shift) => {
            const channel = Math.round(
                ((baseColor >> shift) & 255) * inverse +
                    ((overlayColor >> shift) & 255) * ratio
            )
            return output | (channel << shift)
        }, 0)
    }
}
