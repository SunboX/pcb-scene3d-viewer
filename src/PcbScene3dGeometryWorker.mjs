import { PcbScene3dGeneratedGeometryBuilder } from './PcbScene3dGeneratedGeometryBuilder.mjs'
import { PcbScene3dGeometryTransfer } from './PcbScene3dGeometryTransfer.mjs'

/** Dedicated worker boundary for exact generated board and copper geometry. */
export class PcbScene3dGeometryWorker {
    /**
     * Builds and transfers one stage, returning serializable failures.
     * @param {object} payload Worker request.
     * @returns {Promise<void>}
     */
    static async handle(payload) {
        if (payload?.type !== 'scene3d:geometry-build') return
        let root = null
        try {
            const THREE = await import(payload.threeModuleUrl)
            root = PcbScene3dGeneratedGeometryBuilder.build(
                THREE,
                payload.kind,
                payload.sceneDescription
            )
            const { payload: geometry, transferables } =
                PcbScene3dGeometryTransfer.serialize(root)
            globalThis.postMessage(
                {
                    type: 'scene3d:geometry-success',
                    requestId: payload.requestId,
                    geometry
                },
                transferables
            )
        } catch (error) {
            globalThis.postMessage({
                type: 'scene3d:geometry-error',
                requestId: payload.requestId,
                message: String(error?.message || error)
            })
        } finally {
            PcbScene3dGeometryTransfer.dispose(root)
        }
    }
}

globalThis.addEventListener('message', (event) => {
    PcbScene3dGeometryWorker.handle(event.data)
})
