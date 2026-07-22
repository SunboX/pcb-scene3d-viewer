import { SelfAdjustingComputation } from 'circuitjson-toolkit'
import { PcbScene3dComponentVisibility } from './PcbScene3dComponentVisibility.mjs'
import { PcbScene3dRenderGroupVisibility } from './PcbScene3dRenderGroupVisibility.mjs'

/**
 * Repairs ordered PCB visibility effects from explicit mutable-state changes.
 */
export class PcbScene3dVisibilityGraph {
    /** @type {SelfAdjustingComputation} */
    #computation

    /** @type {number} */
    #groupRevision

    /** @type {number} */
    #componentRevision

    /**
     * Creates an empty visibility trace graph.
     */
    constructor() {
        this.#computation = new SelfAdjustingComputation()
        this.#groupRevision = 0
        this.#componentRevision = 0
    }

    /**
     * Applies affected visibility computations in observable effect order.
     * Revision paths represent mutations inside otherwise atomic maps and sets.
     * A null change set conservatively advances both structural revisions.
     * @param {object} state Current visibility state.
     * @param {PropertyKey[][] | null} changedPaths Changed roots or null when unknown.
     * @returns {Map<string, { value: any, recomputed: boolean }>} Stage results.
     */
    apply(state, changedPaths = null) {
        const normalizedPaths = this.#advanceRevisions(changedPaths)
        const input = {
            ...state,
            groupRevision: this.#groupRevision,
            componentRevision: this.#componentRevision
        }
        return this.#computation.propagate(input, normalizedPaths, [
            {
                name: 'render-groups',
                computation: (current) => {
                    void current.groupRevision
                    PcbScene3dRenderGroupVisibility.apply(current)
                }
            },
            {
                name: 'components',
                computation: (current) => {
                    void current.componentRevision
                    PcbScene3dComponentVisibility.apply(current)
                }
            }
        ])
    }

    /**
     * Removes all stored visibility traces and reverse-reader edges.
     * @returns {void}
     */
    clear() {
        this.#computation.clear()
        this.#groupRevision = 0
        this.#componentRevision = 0
    }

    /**
     * Advances revision roots named by a visibility change set.
     * @param {PropertyKey[][] | null} changedPaths Changed roots or null.
     * @returns {PropertyKey[][]} Conservative normalized change paths.
     */
    #advanceRevisions(changedPaths) {
        const normalizedPaths =
            changedPaths === null
                ? [['groupRevision'], ['componentRevision']]
                : changedPaths
        if (!Array.isArray(normalizedPaths)) {
            throw new TypeError(
                'Visibility change sets must be arrays of property paths.'
            )
        }
        const revisionRoots = new Set()
        normalizedPaths.forEach((path) => {
            if (!Array.isArray(path)) {
                throw new TypeError(
                    'Visibility change-set entries must be property paths.'
                )
            }
            revisionRoots.add(path[0])
        })
        if (revisionRoots.has('groupRevision')) {
            this.#groupRevision += 1
        }
        if (revisionRoots.has('componentRevision')) {
            this.#componentRevision += 1
        }
        return normalizedPaths
    }
}
