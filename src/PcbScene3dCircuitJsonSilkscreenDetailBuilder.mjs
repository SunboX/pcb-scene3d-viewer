import { PcbScene3dCircuitJsonSilkscreenBuilder } from './PcbScene3dCircuitJsonSilkscreenBuilder.mjs'
import { PcbScene3dSilkscreenCopperCutoutBuilder } from './PcbScene3dSilkscreenCopperCutoutBuilder.mjs'

/**
 * Builds complete CircuitJSON silkscreen detail with surface keepouts.
 */
export class PcbScene3dCircuitJsonSilkscreenDetailBuilder {
    /**
     * Builds and clips side-specific silkscreen detail.
     * @param {{ elementsByType: Map<string, object[]> }} index CircuitJSON index.
     * @param {{ pads?: object[], vias?: object[], tracks?: object[], fills?: object[], polygons?: object[], copperTexts?: object[] }} detail Scene detail.
     * @param {{ showPcbNotes?: boolean }} [options] Builder options.
     * @returns {{ top: object, bottom: object }}
     */
    static build(index, detail, options = {}) {
        return PcbScene3dSilkscreenCopperCutoutBuilder.apply(
            PcbScene3dCircuitJsonSilkscreenBuilder.build(index, options),
            detail
        )
    }
}
