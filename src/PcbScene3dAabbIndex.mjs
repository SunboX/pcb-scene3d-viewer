/**
 * @typedef {object} PcbScene3dAabbBounds
 * @property {number} minX
 * @property {number} maxX
 * @property {number} minY
 * @property {number} maxY
 */

/**
 * @typedef {object} PcbScene3dAabbEntry
 * @property {*} item
 * @property {PcbScene3dAabbBounds} bounds
 * @property {number} sourceIndex
 */

/**
 * @typedef {object} PcbScene3dAabbNode
 * @property {PcbScene3dAabbBounds} bounds
 * @property {number} start
 * @property {number} end
 * @property {PcbScene3dAabbNode | null} left
 * @property {PcbScene3dAabbNode | null} right
 */

/**
 * Immutable broad-phase index for axis-aligned two-dimensional bounds.
 */
export class PcbScene3dAabbIndex {
    static #DEFAULT_LEAF_SIZE = 12

    /** @type {PcbScene3dAabbEntry[]} */
    #entries

    /** @type {PcbScene3dAabbEntry[]} */
    #overflow

    /** @type {PcbScene3dAabbNode | null} */
    #root

    /** @type {number} */
    #leafSize

    /**
     * Builds an index without mutating the source items or their bounds.
     * @param {Iterable<*>} items
     * @param {{ resolveBounds?: (item: *, index: number) => PcbScene3dAabbBounds, resolveSourceIndex?: (item: *, index: number) => number, leafSize?: number }} [options]
     */
    constructor(items, options = {}) {
        const resolveBounds =
            options.resolveBounds || PcbScene3dAabbIndex.#defaultResolveBounds
        const resolveSourceIndex =
            options.resolveSourceIndex ||
            PcbScene3dAabbIndex.#defaultResolveSourceIndex
        const requestedLeafSize =
            options.leafSize ?? PcbScene3dAabbIndex.#DEFAULT_LEAF_SIZE

        this.#entries = []
        this.#overflow = []
        this.#leafSize =
            Number.isFinite(requestedLeafSize) && requestedLeafSize > 0
                ? Math.max(1, Math.floor(requestedLeafSize))
                : PcbScene3dAabbIndex.#DEFAULT_LEAF_SIZE

        const sourceItems = Array.from(items || [])
        for (let index = 0; index < sourceItems.length; index += 1) {
            const item = sourceItems[index]
            const resolvedBounds = resolveBounds(item, index)
            const bounds = {
                minX: resolvedBounds?.minX,
                maxX: resolvedBounds?.maxX,
                minY: resolvedBounds?.minY,
                maxY: resolvedBounds?.maxY
            }
            const entry = {
                item,
                bounds,
                sourceIndex: resolveSourceIndex(item, index)
            }

            if (PcbScene3dAabbIndex.#isFiniteBounds(bounds)) {
                this.#entries.push(entry)
            } else {
                this.#overflow.push(entry)
            }
        }

        this.#root = this.#buildTree(0, this.#entries.length)
    }

    /**
     * Returns items whose bounds overlap the requested bounds.
     * @param {PcbScene3dAabbBounds} bounds
     * @param {{ epsilon?: number, stable?: boolean }} [options]
     * @returns {*[]}
     */
    query(bounds, options = {}) {
        const result = []
        return this.queryInto(bounds, result, options)
    }

    /**
     * Appends items whose bounds overlap the requested bounds to a target.
     * @param {PcbScene3dAabbBounds} bounds
     * @param {*[]} target
     * @param {{ epsilon?: number, stable?: boolean }} [options]
     * @returns {*[]}
     */
    queryInto(bounds, target, options = {}) {
        const epsilon = options.epsilon ?? 0
        const stable = options.stable === true
        const includeAll = !PcbScene3dAabbIndex.#isFiniteBounds(bounds)
        const matches = stable ? [] : target

        this.#collectTreeMatches(
            this.#root,
            bounds,
            epsilon,
            includeAll,
            stable,
            matches
        )
        this.#collectOverflowMatches(
            bounds,
            epsilon,
            includeAll,
            stable,
            matches
        )

        if (stable) {
            matches.sort(PcbScene3dAabbIndex.#compareSourceIndexes)
            for (let index = 0; index < matches.length; index += 1) {
                target.push(matches[index].item)
            }
        }

        return target
    }

    /**
     * Builds a median-split tree for an entry range.
     * @param {number} start Inclusive entry offset.
     * @param {number} end Exclusive entry offset.
     * @returns {PcbScene3dAabbNode | null}
     */
    #buildTree(start, end) {
        if (start >= end) {
            return null
        }

        const bounds = this.#resolveRangeBounds(start, end)
        const node = {
            bounds,
            start,
            end,
            left: null,
            right: null
        }

        if (end - start <= this.#leafSize) {
            return node
        }

        const width = bounds.maxX - bounds.minX
        const height = bounds.maxY - bounds.minY
        const axis = width >= height ? 'x' : 'y'
        const medianIndex = start + Math.floor((end - start) / 2)

        this.#quickselect(start, end - 1, medianIndex, axis)
        node.left = this.#buildTree(start, medianIndex)
        node.right = this.#buildTree(medianIndex, end)
        return node
    }

    /**
     * Resolves aggregate bounds for a non-empty entry range.
     * @param {number} start Inclusive entry offset.
     * @param {number} end Exclusive entry offset.
     * @returns {PcbScene3dAabbBounds}
     */
    #resolveRangeBounds(start, end) {
        const first = this.#entries[start].bounds
        const bounds = {
            minX: first.minX,
            maxX: first.maxX,
            minY: first.minY,
            maxY: first.maxY
        }

        for (let index = start + 1; index < end; index += 1) {
            const entryBounds = this.#entries[index].bounds
            bounds.minX = Math.min(bounds.minX, entryBounds.minX)
            bounds.maxX = Math.max(bounds.maxX, entryBounds.maxX)
            bounds.minY = Math.min(bounds.minY, entryBounds.minY)
            bounds.maxY = Math.max(bounds.maxY, entryBounds.maxY)
        }

        return bounds
    }

    /**
     * Places the requested entry at its sorted position along one axis.
     * @param {number} left Inclusive lower entry offset.
     * @param {number} right Inclusive upper entry offset.
     * @param {number} targetIndex Desired sorted entry offset.
     * @param {'x' | 'y'} axis Split axis.
     * @returns {void}
     */
    #quickselect(left, right, targetIndex, axis) {
        let lowerBound = left
        let upperBound = right

        while (lowerBound < upperBound) {
            const pivot =
                this.#entries[
                    lowerBound + Math.floor((upperBound - lowerBound) / 2)
                ]
            const partition = this.#partition(
                lowerBound,
                upperBound,
                pivot,
                axis
            )

            if (targetIndex < partition.lower) {
                upperBound = partition.lower - 1
            } else if (targetIndex > partition.upper) {
                lowerBound = partition.upper + 1
            } else {
                return
            }
        }
    }

    /**
     * Partitions an entry range around one pivot coordinate in place.
     * @param {number} left Inclusive lower entry offset.
     * @param {number} right Inclusive upper entry offset.
     * @param {PcbScene3dAabbEntry} pivot Pivot entry.
     * @param {'x' | 'y'} axis Split axis.
     * @returns {{ lower: number, upper: number }} Equal partition offsets.
     */
    #partition(left, right, pivot, axis) {
        const pivotCoordinate = PcbScene3dAabbIndex.#entryCoordinate(
            pivot,
            axis
        )
        let lower = left
        let index = left
        let upper = right

        while (index <= upper) {
            const coordinate = PcbScene3dAabbIndex.#entryCoordinate(
                this.#entries[index],
                axis
            )

            if (coordinate < pivotCoordinate) {
                this.#swapEntries(lower, index)
                lower += 1
                index += 1
            } else if (coordinate > pivotCoordinate) {
                this.#swapEntries(index, upper)
                upper -= 1
            } else {
                index += 1
            }
        }

        return { lower, upper }
    }

    /**
     * Swaps two entries while building the tree.
     * @param {number} firstIndex
     * @param {number} secondIndex
     * @returns {void}
     */
    #swapEntries(firstIndex, secondIndex) {
        if (firstIndex === secondIndex) {
            return
        }

        const first = this.#entries[firstIndex]
        this.#entries[firstIndex] = this.#entries[secondIndex]
        this.#entries[secondIndex] = first
    }

    /**
     * Collects matching tree entries or items into a target.
     * @param {PcbScene3dAabbNode | null} node
     * @param {PcbScene3dAabbBounds} queryBounds
     * @param {number} epsilon
     * @param {boolean} includeAll
     * @param {boolean} collectEntries
     * @param {(PcbScene3dAabbEntry | *)[]} target
     * @returns {void}
     */
    #collectTreeMatches(
        node,
        queryBounds,
        epsilon,
        includeAll,
        collectEntries,
        target
    ) {
        if (
            !node ||
            (!includeAll &&
                !PcbScene3dAabbIndex.#overlaps(
                    node.bounds,
                    queryBounds,
                    epsilon
                ))
        ) {
            return
        }

        if (node.left || node.right) {
            this.#collectTreeMatches(
                node.left,
                queryBounds,
                epsilon,
                includeAll,
                collectEntries,
                target
            )
            this.#collectTreeMatches(
                node.right,
                queryBounds,
                epsilon,
                includeAll,
                collectEntries,
                target
            )
            return
        }

        for (let index = node.start; index < node.end; index += 1) {
            const entry = this.#entries[index]
            if (
                includeAll ||
                PcbScene3dAabbIndex.#overlaps(
                    entry.bounds,
                    queryBounds,
                    epsilon
                )
            ) {
                target.push(collectEntries ? entry : entry.item)
            }
        }
    }

    /**
     * Collects matching overflow entries or items into a target.
     * @param {PcbScene3dAabbBounds} queryBounds
     * @param {number} epsilon
     * @param {boolean} includeAll
     * @param {boolean} collectEntries
     * @param {(PcbScene3dAabbEntry | *)[]} target
     * @returns {void}
     */
    #collectOverflowMatches(
        queryBounds,
        epsilon,
        includeAll,
        collectEntries,
        target
    ) {
        for (let index = 0; index < this.#overflow.length; index += 1) {
            const entry = this.#overflow[index]
            if (
                includeAll ||
                PcbScene3dAabbIndex.#overlaps(
                    entry.bounds,
                    queryBounds,
                    epsilon
                )
            ) {
                target.push(collectEntries ? entry : entry.item)
            }
        }
    }

    /**
     * Resolves an entry midpoint without overflowing finite coordinates.
     * @param {PcbScene3dAabbEntry} entry
     * @param {'x' | 'y'} axis
     * @returns {number}
     */
    static #entryCoordinate(entry, axis) {
        if (axis === 'x') {
            return entry.bounds.minX * 0.5 + entry.bounds.maxX * 0.5
        }

        return entry.bounds.minY * 0.5 + entry.bounds.maxY * 0.5
    }

    /**
     * Compares entry source indexes for stable query results.
     * @param {PcbScene3dAabbEntry} first
     * @param {PcbScene3dAabbEntry} second
     * @returns {number}
     */
    static #compareSourceIndexes(first, second) {
        if (first.sourceIndex < second.sourceIndex) {
            return -1
        }
        if (first.sourceIndex > second.sourceIndex) {
            return 1
        }
        return 0
    }

    /**
     * Returns true when every bound coordinate is finite.
     * @param {PcbScene3dAabbBounds | null | undefined} bounds
     * @returns {boolean}
     */
    static #isFiniteBounds(bounds) {
        return Boolean(
            bounds &&
            Number.isFinite(bounds.minX) &&
            Number.isFinite(bounds.maxX) &&
            Number.isFinite(bounds.minY) &&
            Number.isFinite(bounds.maxY)
        )
    }

    /**
     * Returns true when two bounds touch or overlap within an epsilon.
     * @param {PcbScene3dAabbBounds} first
     * @param {PcbScene3dAabbBounds} second
     * @param {number} epsilon
     * @returns {boolean}
     */
    static #overlaps(first, second, epsilon) {
        return !(
            first.maxX < second.minX - epsilon ||
            first.minX > second.maxX + epsilon ||
            first.maxY < second.minY - epsilon ||
            first.minY > second.maxY + epsilon
        )
    }

    /**
     * Resolves bounds from an item's bounds property.
     * @param {{ bounds: PcbScene3dAabbBounds }} item
     * @returns {PcbScene3dAabbBounds}
     */
    static #defaultResolveBounds(item) {
        return item.bounds
    }

    /**
     * Resolves the source position of an item.
     * @param {*} _item
     * @param {number} index
     * @returns {number}
     */
    static #defaultResolveSourceIndex(_item, index) {
        return index
    }
}
