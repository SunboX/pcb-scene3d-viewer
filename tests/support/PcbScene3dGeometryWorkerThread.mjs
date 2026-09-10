import { parentPort } from 'node:worker_threads'

globalThis.addEventListener = (_name, listener) => {
    parentPort.on('message', (data) => listener({ data }))
}
globalThis.postMessage = (payload, transferables) => {
    parentPort.postMessage(payload, transferables)
}
await import('../../src/PcbScene3dGeometryWorker.mjs')
