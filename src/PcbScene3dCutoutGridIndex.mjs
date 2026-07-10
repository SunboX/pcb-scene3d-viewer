/**
 * Stable cell-grid candidate index matching cutout filter broad-phase rules.
 */
export class PcbScene3dCutoutGridIndex {
    static #DEFAULT_MAX_EDGE_LENGTH = 4
    static #MIN_CELL_SIZE = 8
    static #MAX_CELLS_PER_CUTOUT = 128

    /** @type {*[]} */
    #cutouts

    /** @type {number} */
    #cellSize

    /** @type {Map<string, number[]>} */
    #cells

    /** @type {number[]} */
    #overflowIndexes

    /** @type {Uint32Array} */
    #marks

    /** @type {number} */
    #mark

    /**
     * Builds the established source-order cutout cell index.
     * @param {Iterable<{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }>} cutouts
     */
    constructor(cutouts) {
        this.#cutouts = Array.from(cutouts || [])
        this.#cellSize = PcbScene3dCutoutGridIndex.#resolveCellSize(
            this.#cutouts
        )
        this.#cells = new Map()
        this.#overflowIndexes = []
        this.#marks = new Uint32Array(this.#cutouts.length)
        this.#mark = 0

        this.#indexCutouts()
    }

    /**
     * Returns unique candidates in established cell traversal order.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
     * @returns {*[]}
     */
    query(bounds) {
        const candidates = []
        const range = PcbScene3dCutoutGridIndex.#resolveCellRange(
            bounds,
            this.#cellSize
        )

        this.#advanceMark()
        for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
            for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
                const bucket = this.#cells.get(
                    PcbScene3dCutoutGridIndex.#cellKey(cellX, cellY)
                )
                if (bucket) {
                    for (const index of bucket) {
                        this.#appendCandidate(candidates, index)
                    }
                }
            }
        }

        for (const index of this.#overflowIndexes) {
            this.#appendCandidate(candidates, index)
        }
        return candidates
    }

    /**
     * Inserts finite-size cutouts into source-order cell buckets.
     * @returns {void}
     */
    #indexCutouts() {
        this.#cutouts.forEach((cutout, index) => {
            const range = PcbScene3dCutoutGridIndex.#resolveCellRange(
                cutout.bounds,
                this.#cellSize
            )
            const cellCount =
                (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1)

            if (cellCount > PcbScene3dCutoutGridIndex.#MAX_CELLS_PER_CUTOUT) {
                this.#overflowIndexes.push(index)
                return
            }

            for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
                for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
                    const key = PcbScene3dCutoutGridIndex.#cellKey(cellX, cellY)
                    const bucket = this.#cells.get(key)
                    if (bucket) {
                        bucket.push(index)
                    } else {
                        this.#cells.set(key, [index])
                    }
                }
            }
        })
    }

    /**
     * Advances the query marker, clearing marks before integer rollover.
     * @returns {void}
     */
    #advanceMark() {
        this.#mark += 1
        if (this.#mark >= 0xffffffff) {
            this.#marks.fill(0)
            this.#mark = 1
        }
    }

    /**
     * Appends one source-index candidate at most once per query.
     * @param {*[]} candidates
     * @param {number} index
     * @returns {void}
     */
    #appendCandidate(candidates, index) {
        if (this.#marks[index] === this.#mark) {
            return
        }

        this.#marks[index] = this.#mark
        candidates.push(this.#cutouts[index])
    }

    /**
     * Resolves cell size from the established median-span policy.
     * @param {{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }[]} cutouts
     * @returns {number}
     */
    static #resolveCellSize(cutouts) {
        const spans = cutouts
            .map((cutout) =>
                Math.max(
                    Number(cutout.bounds.maxX) - Number(cutout.bounds.minX),
                    Number(cutout.bounds.maxY) - Number(cutout.bounds.minY),
                    0
                )
            )
            .filter((span) => Number.isFinite(span))
            .sort((left, right) => left - right)
        const medianSpan = spans[Math.floor(spans.length / 2)] || 0

        return Math.max(
            medianSpan * 4,
            PcbScene3dCutoutGridIndex.#DEFAULT_MAX_EDGE_LENGTH * 2,
            PcbScene3dCutoutGridIndex.#MIN_CELL_SIZE
        )
    }

    /**
     * Resolves an inclusive cell range without coordinate epsilon expansion.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds
     * @param {number} cellSize
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #resolveCellRange(bounds, cellSize) {
        return {
            minX: Math.floor(Number(bounds.minX) / cellSize),
            maxX: Math.floor(Number(bounds.maxX) / cellSize),
            minY: Math.floor(Number(bounds.minY) / cellSize),
            maxY: Math.floor(Number(bounds.maxY) / cellSize)
        }
    }

    /**
     * Builds one deterministic cell key.
     * @param {number} cellX
     * @param {number} cellY
     * @returns {string}
     */
    static #cellKey(cellX, cellY) {
        return `${cellX}:${cellY}`
    }
}
