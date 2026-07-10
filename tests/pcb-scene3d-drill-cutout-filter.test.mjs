import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dDrillCutoutFilter } from '../src/PcbScene3dDrillCutoutFilter.mjs'

const GEOMETRY_EPSILON = 0.001

/**
 * Builds one rounded-rectangle contour.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} width Width.
 * @param {number} height Height.
 * @param {number} radius Corner radius.
 * @returns {{ x: number, y: number }[]}
 */
function roundedRectangle(centerX, centerY, width, height, radius) {
    const halfWidth = width / 2
    const halfHeight = height / 2

    return [
        ...cornerPoints(
            centerX + halfWidth - radius,
            centerY - halfHeight + radius,
            radius,
            -90,
            0
        ),
        ...cornerPoints(
            centerX + halfWidth - radius,
            centerY + halfHeight - radius,
            radius,
            0,
            90
        ),
        ...cornerPoints(
            centerX - halfWidth + radius,
            centerY + halfHeight - radius,
            radius,
            90,
            180
        ),
        ...cornerPoints(
            centerX - halfWidth + radius,
            centerY - halfHeight + radius,
            radius,
            180,
            270
        )
    ]
}

/**
 * Builds sampled circular corner points.
 * @param {number} centerX Corner center X.
 * @param {number} centerY Corner center Y.
 * @param {number} radius Corner radius.
 * @param {number} startAngle Start angle in degrees.
 * @param {number} endAngle End angle in degrees.
 * @returns {{ x: number, y: number }[]}
 */
function cornerPoints(centerX, centerY, radius, startAngle, endAngle) {
    return Array.from({ length: 17 }, (_, index) => {
        const fraction = index / 16
        const angle =
            ((startAngle + (endAngle - startAngle) * fraction) * Math.PI) / 180

        return {
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius
        }
    })
}

/**
 * Builds a square contour.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radius Half side length.
 * @returns {{ x: number, y: number }[]}
 */
function square(centerX, centerY, radius) {
    return [
        { x: centerX - radius, y: centerY - radius },
        { x: centerX + radius, y: centerY - radius },
        { x: centerX + radius, y: centerY + radius },
        { x: centerX - radius, y: centerY + radius }
    ]
}

/**
 * Builds a circle whose coordinate reads are counted.
 * @param {number} centerX Center X.
 * @param {number} centerY Center Y.
 * @param {number} radius Circle radius.
 * @param {{ count: number }} readCounter Coordinate read counter.
 * @returns {{ x: number, y: number }[]}
 */
function countedCircle(centerX, centerY, radius, readCounter) {
    return Array.from({ length: 16 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 16
        const x = centerX + Math.cos(angle) * radius
        const y = centerY + Math.sin(angle) * radius

        return {
            get x() {
                readCounter.count += 1
                return x
            },
            get y() {
                readCounter.count += 1
                return y
            }
        }
    })
}

/**
 * Builds a dense, non-circular container polygon.
 * @param {number} pointCount Boundary point count.
 * @param {number} radius Base radius.
 * @returns {{ x: number, y: number }[]}
 */
function denseContainer(pointCount, radius) {
    return Array.from({ length: pointCount }, (_, index) => {
        const angle = (index / pointCount) * Math.PI * 2
        const distance =
            radius *
            (1 + Math.sin(angle * 5) * 0.04 + Math.sin(angle * 11) * 0.02)

        return {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance
        }
    })
}

/**
 * Builds reference metadata using the filter's established coercion rules.
 * @param {{ x: number, y: number }[]} polygon Source polygon.
 * @param {number} index Polygon index among valid sources.
 * @returns {{ source: { x: number, y: number }[], points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number }, area: number, index: number }}
 */
function referencePolygonInfo(polygon, index) {
    const points = polygon.map((point) => ({
        x: Number(point?.x || 0),
        y: Number(point?.y || 0)
    }))
    const bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
    }
    let area = 0
    let totalX = 0
    let totalY = 0

    points.forEach((point, pointIndex) => {
        const next = points[(pointIndex + 1) % points.length]

        bounds.minX = Math.min(bounds.minX, point.x)
        bounds.maxX = Math.max(bounds.maxX, point.x)
        bounds.minY = Math.min(bounds.minY, point.y)
        bounds.maxY = Math.max(bounds.maxY, point.y)
        totalX += point.x
        totalY += point.y
        area += point.x * next.y - next.x * point.y
    })

    return {
        source: polygon,
        points,
        bounds,
        centroid: {
            x: totalX / Math.max(points.length, 1),
            y: totalY / Math.max(points.length, 1)
        },
        area: Math.abs(area) / 2,
        index
    }
}

/**
 * Builds reference metadata for every valid source polygon.
 * @param {{ x: number, y: number }[][]} polygons Source polygons.
 * @returns {{ source: { x: number, y: number }[], points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number }, area: number, index: number }[]}
 */
function referencePolygonInfos(polygons) {
    return (Array.isArray(polygons) ? polygons : [])
        .filter((polygon) => Array.isArray(polygon) && polygon.length >= 3)
        .map((polygon, index) => referencePolygonInfo(polygon, index))
}

/**
 * Returns true when one reference bounds contains another.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} outer
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} inner
 * @returns {boolean}
 */
function referenceBoundsContain(outer, inner) {
    return (
        outer.minX <= inner.minX + GEOMETRY_EPSILON &&
        outer.maxX >= inner.maxX - GEOMETRY_EPSILON &&
        outer.minY <= inner.minY + GEOMETRY_EPSILON &&
        outer.maxY >= inner.maxY - GEOMETRY_EPSILON
    )
}

/**
 * Returns true when a point lies on one finite segment.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @returns {boolean}
 */
function referencePointOnSegment(point, start, end) {
    const cross =
        (point.y - start.y) * (end.x - start.x) -
        (point.x - start.x) * (end.y - start.y)

    if (Math.abs(cross) > GEOMETRY_EPSILON) {
        return false
    }

    const dot =
        (point.x - start.x) * (end.x - start.x) +
        (point.y - start.y) * (end.y - start.y)

    if (dot < -GEOMETRY_EPSILON) {
        return false
    }

    const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2
    return dot <= lengthSquared + GEOMETRY_EPSILON
}

/**
 * Returns true when a point lies on a reference polygon boundary.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }[]} polygon
 * @returns {boolean}
 */
function referencePointOnBoundary(point, polygon) {
    return polygon.some((start, index) =>
        referencePointOnSegment(
            point,
            start,
            polygon[(index + 1) % polygon.length]
        )
    )
}

/**
 * Returns true when a point lies strictly inside a reference polygon.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }[]} polygon
 * @returns {boolean}
 */
function referencePointStrictlyInside(point, polygon) {
    let inside = false
    for (
        let index = 0, previousIndex = polygon.length - 1;
        index < polygon.length;
        previousIndex = index, index += 1
    ) {
        const current = polygon[index]
        const previous = polygon[previousIndex]
        const intersects =
            current.y > point.y !== previous.y > point.y &&
            point.x <
                ((previous.x - current.x) * (point.y - current.y)) /
                    (previous.y - current.y) +
                    current.x

        if (intersects) {
            inside = !inside
        }
    }

    return inside
}

/**
 * Returns true when a point lies inside or on a reference polygon.
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }[]} polygon
 * @returns {boolean}
 */
function referencePointInsideOrOn(point, polygon) {
    return (
        referencePointOnBoundary(point, polygon) ||
        referencePointStrictlyInside(point, polygon)
    )
}

/**
 * Returns true when a reference hole fully covers a cutout.
 * @param {{ points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number } }} holeInfo
 * @param {{ points: { x: number, y: number }[], bounds: { minX: number, maxX: number, minY: number, maxY: number }, centroid: { x: number, y: number } }} cutoutInfo
 * @returns {boolean}
 */
function referenceHoleCoversCutout(holeInfo, cutoutInfo) {
    return (
        referenceBoundsContain(holeInfo.bounds, cutoutInfo.bounds) &&
        referencePointInsideOrOn(cutoutInfo.centroid, holeInfo.points) &&
        cutoutInfo.points.every((point) =>
            referencePointInsideOrOn(point, holeInfo.points)
        )
    )
}

/**
 * Applies the established area and source-index nested-cutout rules.
 * @param {{ points: { x: number, y: number }[], bounds: object, centroid: { x: number, y: number }, area: number, index: number }} cutoutInfo
 * @param {{ points: { x: number, y: number }[], bounds: object, centroid: { x: number, y: number }, area: number, index: number }[]} cutoutInfos
 * @returns {boolean}
 */
function referenceIsNestedCutout(cutoutInfo, cutoutInfos) {
    return cutoutInfos.some((otherCutoutInfo) => {
        if (otherCutoutInfo.index === cutoutInfo.index) {
            return false
        }
        if (!referenceHoleCoversCutout(otherCutoutInfo, cutoutInfo)) {
            return false
        }

        return (
            otherCutoutInfo.area > cutoutInfo.area + GEOMETRY_EPSILON ||
            (Math.abs(otherCutoutInfo.area - cutoutInfo.area) <=
                GEOMETRY_EPSILON &&
                otherCutoutInfo.index < cutoutInfo.index)
        )
    })
}

/**
 * Removes nested cutouts with the pre-index brute-force rules.
 * @param {{ x: number, y: number }[][]} cutouts
 * @returns {{ x: number, y: number }[][]}
 */
function referenceRemoveNestedCutouts(cutouts) {
    const cutoutInfos = referencePolygonInfos(cutouts)
    return cutoutInfos
        .filter(
            (cutoutInfo) => !referenceIsNestedCutout(cutoutInfo, cutoutInfos)
        )
        .map((cutoutInfo) => cutoutInfo.source)
}

/**
 * Splits fill holes with the pre-index brute-force rules.
 * @param {{ x: number, y: number }[][]} drillCutouts
 * @param {{ x: number, y: number }[][]} fillHoles
 * @returns {{ authoredHoles: { x: number, y: number }[][], drillHoles: { x: number, y: number }[][], uncoveredCutouts: { x: number, y: number }[][] }}
 */
function referencePartitionFillHoles(drillCutouts, fillHoles) {
    const cutouts = Array.isArray(drillCutouts) ? drillCutouts : []
    const holes = Array.isArray(fillHoles) ? fillHoles : []

    if (!holes.length) {
        return {
            authoredHoles: [],
            drillHoles: [],
            uncoveredCutouts: cutouts
        }
    }
    if (!cutouts.length) {
        return {
            authoredHoles: holes,
            drillHoles: [],
            uncoveredCutouts: []
        }
    }

    const cutoutInfos = referencePolygonInfos(cutouts)
    const holeInfos = referencePolygonInfos(holes)
    const cutoutInfoMap = new Map(
        cutoutInfos.map((cutoutInfo) => [cutoutInfo.source, cutoutInfo])
    )
    const holeInfoMap = new Map(
        holeInfos.map((holeInfo) => [holeInfo.source, holeInfo])
    )
    const authoredHoles = []
    const drillHoles = []

    for (const hole of holes) {
        const holeInfo = holeInfoMap.get(hole)
        if (
            holeInfo &&
            cutoutInfos.some((cutoutInfo) =>
                referenceHoleCoversCutout(holeInfo, cutoutInfo)
            )
        ) {
            drillHoles.push(hole)
        } else {
            authoredHoles.push(hole)
        }
    }

    return {
        authoredHoles,
        drillHoles,
        uncoveredCutouts: cutouts.filter((cutout) => {
            const cutoutInfo = cutoutInfoMap.get(cutout)
            return (
                !cutoutInfo ||
                !holeInfos.some((holeInfo) =>
                    referenceHoleCoversCutout(holeInfo, cutoutInfo)
                )
            )
        })
    }
}

/**
 * Asserts exact source identities and order.
 * @param {string} label Assertion label.
 * @param {*[]} actual Actual source list.
 * @param {*[]} expected Expected source list.
 * @returns {void}
 */
function assertIdentityOrder(label, actual, expected) {
    assert.equal(actual.length, expected.length, `${label}: length`)
    expected.forEach((source, index) => {
        assert.strictEqual(actual[index], source, `${label}: source ${index}`)
    })
}

/**
 * Asserts exact source identities for every partition result.
 * @param {{ authoredHoles: *[], drillHoles: *[], uncoveredCutouts: *[] }} actual
 * @param {{ authoredHoles: *[], drillHoles: *[], uncoveredCutouts: *[] }} expected
 * @returns {void}
 */
function assertPartitionIdentity(actual, expected) {
    assertIdentityOrder(
        'authored holes',
        actual.authoredHoles,
        expected.authoredHoles
    )
    assertIdentityOrder('drill holes', actual.drillHoles, expected.drillHoles)
    assertIdentityOrder(
        'uncovered cutouts',
        actual.uncoveredCutouts,
        expected.uncoveredCutouts
    )
}

test('PcbScene3dDrillCutoutFilter keeps separated rounded pad cutouts', () => {
    const cutouts = [
        roundedRectangle(0, 0, 60, 120, 30),
        roundedRectangle(0, 256, 60, 120, 30)
    ]

    assert.equal(
        PcbScene3dDrillCutoutFilter.removeNestedCutouts(cutouts).length,
        2
    )
})

test('PcbScene3dDrillCutoutFilter removes truly nested cutouts', () => {
    const cutouts = [square(0, 0, 4), square(0, 0, 8)]

    assert.equal(
        PcbScene3dDrillCutoutFilter.removeNestedCutouts(cutouts).length,
        1
    )
})

test('PcbScene3dDrillCutoutFilter reuses polygon metadata for dense separated cutouts', () => {
    const readCounter = { count: 0 }
    const cutouts = Array.from({ length: 80 }, (_, index) =>
        countedCircle(
            (index % 20) * 100,
            Math.floor(index / 20) * 100,
            20,
            readCounter
        )
    )

    assert.equal(
        PcbScene3dDrillCutoutFilter.removeNestedCutouts(cutouts).length,
        80
    )
    assert.ok(
        readCounter.count < 20000,
        'Expected bounded coordinate reads, got ' + readCounter.count
    )
})

test('PcbScene3dDrillCutoutFilter matches brute-force nesting for complex source order', () => {
    const concaveContainer = [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: 3, y: 10 },
        { x: 3, y: -3 },
        { x: -3, y: -3 },
        { x: -3, y: 10 },
        { x: -10, y: 10 }
    ]
    const nestedInArm = square(-6, 1, 1)
    const insideBoundsButInNotch = square(0, 4, 1)
    const overlapFirst = square(20, 0, 4)
    const overlapSecond = square(23, 0, 4)
    const duplicateFirst = square(40, 0, 3)
    const duplicateSecond = duplicateFirst.map((point) => ({ ...point }))
    const shortPolygon = [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
    ]
    const cutouts = [
        nestedInArm,
        concaveContainer,
        insideBoundsButInNotch,
        overlapFirst,
        overlapSecond,
        duplicateFirst,
        duplicateSecond,
        null,
        shortPolygon
    ]
    const expected = referenceRemoveNestedCutouts(cutouts)
    const actual = PcbScene3dDrillCutoutFilter.removeNestedCutouts(cutouts)

    assertIdentityOrder('complex cutouts', actual, expected)
    assert.ok(actual.includes(concaveContainer))
    assert.ok(actual.includes(insideBoundsButInNotch))
    assert.ok(actual.includes(overlapFirst))
    assert.ok(actual.includes(overlapSecond))
    assert.ok(actual.includes(duplicateFirst))
    assert.ok(!actual.includes(duplicateSecond))
    assert.ok(!actual.includes(nestedInArm))
    assert.ok(!actual.includes(shortPolygon))
})

test('PcbScene3dDrillCutoutFilter matches brute-force authored-hole partitioning', () => {
    const coveredCutout = square(0, 0, 2)
    const uncoveredCutout = square(12, 0, 2)
    const shortCutout = [
        { x: 30, y: 0 },
        { x: 31, y: 0 }
    ]
    const coveringHole = square(0, 0, 3)
    const partialHole = square(14, 0, 3)
    const unrelatedHole = square(30, 10, 2)
    const shortHole = [{ x: 0, y: 0 }]
    const cutouts = [coveredCutout, shortCutout, uncoveredCutout]
    const holes = [partialHole, coveringHole, shortHole, unrelatedHole]
    const expected = referencePartitionFillHoles(cutouts, holes)
    const actual = PcbScene3dDrillCutoutFilter.partitionFillHoles(
        cutouts,
        holes
    )
    const uncovered = PcbScene3dDrillCutoutFilter.removeCoveredCutouts(
        cutouts,
        holes
    )

    assertPartitionIdentity(actual, expected)
    assertIdentityOrder(
        'removeCoveredCutouts',
        uncovered,
        expected.uncoveredCutouts
    )
    assertIdentityOrder('authored source order', actual.authoredHoles, [
        partialHole,
        shortHole,
        unrelatedHole
    ])
    assertIdentityOrder('drill source order', actual.drillHoles, [coveringHole])
    assertIdentityOrder('uncovered source order', actual.uncoveredCutouts, [
        shortCutout,
        uncoveredCutout
    ])
})

test('PcbScene3dDrillCutoutFilter preserves empty early-return identities', () => {
    const cutouts = [square(0, 0, 2)]
    const holes = [square(10, 0, 2)]
    const noHoles = PcbScene3dDrillCutoutFilter.partitionFillHoles(cutouts, [])
    const noCutouts = PcbScene3dDrillCutoutFilter.partitionFillHoles([], holes)

    assert.strictEqual(noHoles.uncoveredCutouts, cutouts)
    assert.strictEqual(noCutouts.authoredHoles, holes)
    assert.strictEqual(
        PcbScene3dDrillCutoutFilter.removeCoveredCutouts(cutouts, []),
        cutouts
    )
    assert.deepEqual(
        PcbScene3dDrillCutoutFilter.partitionFillHoles(null, null),
        { authoredHoles: [], drillHoles: [], uncoveredCutouts: [] }
    )
    assert.deepEqual(PcbScene3dDrillCutoutFilter.removeNestedCutouts(null), [])
})

test('PcbScene3dDrillCutoutFilter matches brute force for a high-vertex container', () => {
    const container = denseContainer(4096, 100)
    const innerFirst = square(-20, 0, 2)
    const outside = square(130, 0, 2)
    const innerSecond = square(30, 20, 3)
    const cutouts = [innerFirst, outside, container, innerSecond]
    const expected = referenceRemoveNestedCutouts(cutouts)
    const actual = PcbScene3dDrillCutoutFilter.removeNestedCutouts(cutouts)

    assertIdentityOrder('high-vertex cutouts', actual, expected)
    assertIdentityOrder('high-vertex expected survivors', actual, [
        outside,
        container
    ])
})

test('PcbScene3dDrillCutoutFilter populates and reuses request-scoped prepared caches', () => {
    const container = square(0, 0, 10)
    const nested = square(0, 0, 2)
    const authoredHole = square(30, 0, 2)
    const shortPolygon = [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
    ]
    const preparedPolygonCache = new Map()

    PcbScene3dDrillCutoutFilter.removeNestedCutouts(
        [container, shortPolygon, nested],
        { preparedPolygonCache }
    )

    assert.equal(preparedPolygonCache.size, 2)
    assert.ok(preparedPolygonCache.has(container))
    assert.ok(preparedPolygonCache.has(nested))
    assert.ok(!preparedPolygonCache.has(shortPolygon))
    const preparedContainer = preparedPolygonCache.get(container)

    PcbScene3dDrillCutoutFilter.partitionFillHoles(
        [nested],
        [container, authoredHole],
        { preparedPolygonCache }
    )

    assert.equal(preparedPolygonCache.size, 3)
    assert.strictEqual(preparedPolygonCache.get(container), preparedContainer)
    assert.ok(preparedPolygonCache.has(authoredHole))

    const coveredCache = new Map()
    PcbScene3dDrillCutoutFilter.removeCoveredCutouts([nested], [container], {
        preparedPolygonCache: coveredCache
    })
    assert.equal(coveredCache.size, 2)
    assert.ok(coveredCache.has(nested))
    assert.ok(coveredCache.has(container))
})
