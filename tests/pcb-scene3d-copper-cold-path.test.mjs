import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dCopperFactory } from '../src/PcbScene3dCopperFactory.mjs'
import { PcbScene3dCopperFillMeshBuilder } from '../src/PcbScene3dCopperFillMeshBuilder.mjs'

const RUN_COLD_PATH_PERFORMANCE =
    process.env.PCB_SCENE3D_RUN_COPPER_COLD_PATH_PERFORMANCE === '1'

/**
 * Builds one dense, generated copper fill.
 * @param {number} count Vertex count.
 * @returns {object}
 */
function createDenseFill(count) {
    return {
        layerId: 1,
        points: Array.from({ length: count }, (_unused, index) => {
            const angle = (index / count) * Math.PI * 2
            return {
                x: Math.cos(angle) * 100,
                y: Math.sin(angle) * 100
            }
        })
    }
}

/**
 * Measures the warmed median of one operation.
 * @param {() => any} operation Operation under test.
 * @param {number} [iterations] Timed sample count.
 * @returns {{ milliseconds: number, result: any }}
 */
function measureMedian(operation, iterations = 5) {
    operation()
    const elapsed = []
    let result

    for (let index = 0; index < iterations; index += 1) {
        const startedAt = performance.now()
        result = operation()
        elapsed.push(performance.now() - startedAt)
    }

    elapsed.sort((left, right) => left - right)
    return {
        milliseconds: elapsed[Math.floor(elapsed.length / 2)],
        result
    }
}

test(
    'PcbScene3dCopperFactory keeps the first dense union-disabled build near direct cost',
    { skip: !RUN_COLD_PATH_PERFORMANCE },
    () => {
        const fill = createDenseFill(10000)
        const fills = [fill]
        const normalizeBoardPoint = (x, y) => ({ x, y })
        const startedAt = performance.now()
        const group = PcbScene3dCopperFactory.buildMaskCoveredGroup(
            THREE,
            { tracks: [], arcs: [], fills },
            5,
            -5,
            normalizeBoardPoint,
            { unionCoveredLayerPrimitives: false }
        )
        const factoryMilliseconds = performance.now() - startedAt
        const material = new THREE.MeshBasicMaterial()
        const direct = measureMedian(() =>
            PcbScene3dCopperFillMeshBuilder.build(
                THREE,
                fills,
                5,
                0.2,
                normalizeBoardPoint,
                false,
                material,
                [],
                { surfaceOnly: true }
            )
        )
        const maximumMilliseconds = Math.max(35, direct.milliseconds * 4 + 10)

        assert.ok(direct.result)
        assert.ok(group.children.length)
        assert.ok(
            factoryMilliseconds <= maximumMilliseconds,
            `factory ${factoryMilliseconds.toFixed(3)} ms exceeded ${maximumMilliseconds.toFixed(3)} ms for direct ${direct.milliseconds.toFixed(3)} ms`
        )
    }
)
