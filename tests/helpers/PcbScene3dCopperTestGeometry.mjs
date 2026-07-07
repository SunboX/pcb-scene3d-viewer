/**
 * Resolves axis-aligned bounds from one position attribute array.
 * @param {ArrayLike<number>} positions
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }}
 */
export function resolveBounds(positions) {
    const bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity
    }

    for (let index = 0; index < positions.length; index += 3) {
        bounds.minX = Math.min(bounds.minX, positions[index])
        bounds.maxX = Math.max(bounds.maxX, positions[index])
        bounds.minY = Math.min(bounds.minY, positions[index + 1])
        bounds.maxY = Math.max(bounds.maxY, positions[index + 1])
        bounds.minZ = Math.min(bounds.minZ, positions[index + 2])
        bounds.maxZ = Math.max(bounds.maxZ, positions[index + 2])
    }

    return bounds
}

/**
 * Finds a nested Three object by name.
 * @param {any} object Root object.
 * @param {string} name Object name.
 * @returns {any | null}
 */
export function findObjectByName(object, name) {
    if (object?.name === name) {
        return object
    }

    for (const child of object?.children || []) {
        const match = findObjectByName(child, name)
        if (match) {
            return match
        }
    }

    return null
}

/**
 * Checks whether any triangle contains a vertical wall through one point.
 * @param {ArrayLike<number>} positions Position attribute array.
 * @param {number} x Point X.
 * @param {number} y Point Y.
 * @returns {boolean}
 */
export function hasVerticalWallThroughPoint(positions, x, y) {
    for (let index = 0; index < positions.length; index += 9) {
        const matches = [0, 3, 6]
            .map((offset) => ({
                x: positions[index + offset],
                y: positions[index + offset + 1],
                z: positions[index + offset + 2]
            }))
            .filter(
                (point) =>
                    Math.abs(point.x - x) < 0.001 &&
                    Math.abs(point.y - y) < 0.001
            )

        if (
            matches.some((point) => point.z > 5) &&
            matches.some((point) => point.z < 5)
        ) {
            return true
        }
    }

    return false
}

/**
 * Checks whether any triangle centroid lies inside the supplied bounds.
 * @param {ArrayLike<number>} positions Position attribute array.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Bounds to test.
 * @returns {boolean}
 */
export function hasTriangleCentroidInsideBounds(positions, bounds) {
    for (let index = 0; index < positions.length; index += 9) {
        const centroidX =
            (positions[index] + positions[index + 3] + positions[index + 6]) / 3
        const centroidY =
            (positions[index + 1] +
                positions[index + 4] +
                positions[index + 7]) /
            3

        if (
            centroidX >= bounds.minX &&
            centroidX <= bounds.maxX &&
            centroidY >= bounds.minY &&
            centroidY <= bounds.maxY
        ) {
            return true
        }
    }

    return false
}

/**
 * Counts surface triangles covering one XY point.
 * @param {any} geometry Geometry to inspect.
 * @param {{ x: number, y: number }} point Point to sample.
 * @returns {number}
 */
export function countTrianglesCoveringPoint(geometry, point) {
    const position = geometry.getAttribute('position')
    let count = 0

    for (let index = 0; index < position.count; index += 3) {
        const triangle = [0, 1, 2].map((offset) => ({
            x: position.getX(index + offset),
            y: position.getY(index + offset)
        }))

        if (
            triangleArea(triangle) > 0.001 &&
            pointInTriangle(point, triangle)
        ) {
            count += 1
        }
    }

    return count
}

/**
 * Checks whether any triangle intersects or covers a circle.
 * @param {any} geometry Geometry to inspect.
 * @param {{ x: number, y: number }} center Circle center.
 * @param {number} radius Circle radius.
 * @returns {boolean}
 */
export function hasTriangleOverlappingCircle(geometry, center, radius) {
    const position = geometry.getAttribute('position')

    for (let index = 0; index < position.count; index += 3) {
        const triangle = [0, 1, 2].map((offset) => ({
            x: position.getX(index + offset),
            y: position.getY(index + offset)
        }))

        if (triangleOverlapsCircle(triangle, center, radius)) {
            return true
        }
    }

    return false
}

/**
 * Builds one sampled circular cutout polygon.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radius Circle radius.
 * @returns {{ x: number, y: number }[]}
 */
export function createCircularCutout(centerX, centerY, radius) {
    return Array.from({ length: 64 }, (_unused, index) => {
        const angle = (index / 64) * Math.PI * 2

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

/**
 * Returns true when one triangle overlaps a circular area.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @param {{ x: number, y: number }} center Circle center.
 * @param {number} radius Circle radius.
 * @returns {boolean}
 */
function triangleOverlapsCircle(triangle, center, radius) {
    const radiusSquared = (Number(radius || 0) - 0.001) ** 2

    return (
        triangle.some(
            (point) =>
                (point.x - center.x) ** 2 + (point.y - center.y) ** 2 <=
                radiusSquared
        ) ||
        isPointInsideTriangle(center, triangle) ||
        triangle.some(
            (point, index) =>
                squaredDistanceToSegment(
                    center,
                    point,
                    triangle[(index + 1) % triangle.length]
                ) <= radiusSquared
        )
    )
}

/**
 * Returns true when a point lies inside one triangle.
 * @param {{ x: number, y: number }} point Point to inspect.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {boolean}
 */
function isPointInsideTriangle(point, triangle) {
    let hasNegative = false
    let hasPositive = false

    for (let index = 0; index < triangle.length; index += 1) {
        const current = triangle[index]
        const next = triangle[(index + 1) % triangle.length]
        const sign =
            (next.x - current.x) * (point.y - current.y) -
            (next.y - current.y) * (point.x - current.x)

        hasNegative ||= sign < -0.001
        hasPositive ||= sign > 0.001
    }

    return !(hasNegative && hasPositive)
}

/**
 * Resolves squared distance from a point to a finite segment.
 * @param {{ x: number, y: number }} point Point to inspect.
 * @param {{ x: number, y: number }} start Segment start.
 * @param {{ x: number, y: number }} end Segment end.
 * @returns {number}
 */
function squaredDistanceToSegment(point, start, end) {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const ratio = lengthSquared
        ? Math.max(
              0,
              Math.min(
                  1,
                  ((point.x - start.x) * dx + (point.y - start.y) * dy) /
                      lengthSquared
              )
          )
        : 0
    const projected = {
        x: start.x + dx * ratio,
        y: start.y + dy * ratio
    }

    return (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2
}

/**
 * Computes one 2D triangle area.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {number}
 */
function triangleArea(triangle) {
    const [first, second, third] = triangle
    return (
        Math.abs(
            (second.x - first.x) * (third.y - first.y) -
                (third.x - first.x) * (second.y - first.y)
        ) / 2
    )
}

/**
 * Checks whether one point is inside a 2D triangle.
 * @param {{ x: number, y: number }} point Point to test.
 * @param {{ x: number, y: number }[]} triangle Triangle points.
 * @returns {boolean}
 */
function pointInTriangle(point, triangle) {
    const signs = triangle.map((start, index) => {
        const end = triangle[(index + 1) % triangle.length]
        return (
            (point.x - end.x) * (start.y - end.y) -
            (start.x - end.x) * (point.y - end.y)
        )
    })

    return (
        signs.every((sign) => sign >= -0.001) ||
        signs.every((sign) => sign <= 0.001)
    )
}
