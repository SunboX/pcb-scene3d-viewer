import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dPadFactory } from '../src/PcbScene3dPadFactory.mjs'

/**
 * Builds a minimal Three-compatible test double set for pad mesh assertions.
 * @returns {any}
 */
function createFakeThree() {
    class FakeVector3 {
        constructor() {
            this.x = 0
            this.y = 0
            this.z = 0
        }

        /**
         * @param {number} x
         * @param {number} y
         * @param {number} z
         * @returns {void}
         */
        set(x, y, z) {
            this.x = x
            this.y = y
            this.z = z
        }
    }

    class FakeEuler {
        constructor() {
            this.x = 0
            this.y = 0
            this.z = 0
        }
    }

    class FakeGroup {
        constructor() {
            this.children = []
            this.position = new FakeVector3()
            this.rotation = new FakeEuler()
        }

        /**
         * @param {...any} children
         * @returns {void}
         */
        add(...children) {
            this.children.push(...children)
        }
    }

    class FakeMesh {
        /**
         * @param {any} geometry
         * @param {any} material
         */
        constructor(geometry, material) {
            this.geometry = geometry
            this.material = material
            this.position = new FakeVector3()
            this.rotation = new FakeEuler()
        }
    }

    class FakeMeshStandardMaterial {
        /**
         * @param {Record<string, unknown>} options
         */
        constructor(options) {
            this.options = options
        }
    }

    class FakeBoxGeometry {
        /**
         * @param {number} width
         * @param {number} height
         * @param {number} depth
         */
        constructor(width, height, depth) {
            this.type = 'BoxGeometry'
            this.parameters = { width, height, depth }
        }
    }

    class FakeCylinderGeometry {
        /**
         * @param {number} radiusTop
         * @param {number} radiusBottom
         * @param {number} height
         * @param {number} segments
         */
        constructor(radiusTop, radiusBottom, height, segments) {
            this.type = 'CylinderGeometry'
            this.parameters = {
                radiusTop,
                radiusBottom,
                height,
                segments
            }
        }
    }

    class FakeShape {
        constructor() {
            this.commands = []
        }

        /**
         * @param {number} x
         * @param {number} y
         * @returns {void}
         */
        moveTo(x, y) {
            this.commands.push(['moveTo', x, y])
        }

        /**
         * @param {number} x
         * @param {number} y
         * @returns {void}
         */
        lineTo(x, y) {
            this.commands.push(['lineTo', x, y])
        }

        /**
         * @param {number} x
         * @param {number} y
         * @param {number} radius
         * @param {number} startAngle
         * @param {number} endAngle
         * @param {boolean} clockwise
         * @returns {void}
         */
        absarc(x, y, radius, startAngle, endAngle, clockwise) {
            this.commands.push([
                'absarc',
                x,
                y,
                radius,
                startAngle,
                endAngle,
                clockwise
            ])
        }

        /**
         * @returns {void}
         */
        closePath() {
            this.commands.push(['closePath'])
        }
    }

    class FakeExtrudeGeometry {
        /**
         * @param {any} shape
         * @param {Record<string, unknown>} options
         */
        constructor(shape, options) {
            this.type = 'ExtrudeGeometry'
            this.shape = shape
            this.options = options
        }
    }

    return {
        Group: FakeGroup,
        Mesh: FakeMesh,
        MeshStandardMaterial: FakeMeshStandardMaterial,
        BoxGeometry: FakeBoxGeometry,
        CylinderGeometry: FakeCylinderGeometry,
        Shape: FakeShape,
        ExtrudeGeometry: FakeExtrudeGeometry
    }
}

test('resolvePadSurfaceSpec keeps circular and rounded-rect pad detail', () => {
    const circular = PcbScene3dPadFactory.resolvePadSurfaceSpec({
        sizeTopX: 64,
        sizeTopY: 64,
        shapeTop: 1
    })
    const roundedRect = PcbScene3dPadFactory.resolvePadSurfaceSpec({
        sizeTopX: 80,
        sizeTopY: 40,
        shapeTop: 2,
        hasRoundedRect: true,
        roundedRectShapeTop: 2,
        cornerRadiusTop: 25,
        offsetTopX: 6,
        offsetTopY: -4
    })

    assert.deepEqual(circular, {
        width: 64,
        height: 64,
        kind: 'circle',
        radius: 32,
        cornerRadius: 32,
        offsetX: 0,
        offsetY: 0,
        hasHole: false,
        holeDiameter: 0,
        holeSlotLength: null,
        holeRotation: 0
    })
    assert.deepEqual(roundedRect, {
        width: 80,
        height: 40,
        kind: 'rounded-rect',
        radius: 40,
        cornerRadius: 10,
        offsetX: 6,
        offsetY: -4,
        hasHole: false,
        holeDiameter: 0,
        holeSlotLength: null,
        holeRotation: 0
    })
})

test('buildGroup preserves pad-specific geometry kinds and local offsets', () => {
    const THREE = createFakeThree()
    const group = PcbScene3dPadFactory.buildGroup(
        THREE,
        [
            {
                x: 110,
                y: 210,
                sizeTopX: 60,
                sizeTopY: 60,
                shapeTop: 1,
                rotation: 90
            },
            {
                x: 220,
                y: 320,
                sizeTopX: 100,
                sizeTopY: 40,
                shapeTop: 1,
                rotation: 45,
                offsetTopX: 8,
                offsetTopY: -5
            }
        ],
        14.2,
        (x, y) => ({ x: x - 10, y: y - 20 })
    )

    assert.equal(group.children.length, 2)

    const circularRoot = group.children[0]
    const circularMesh = circularRoot.children[0]
    assert.equal(circularRoot.position.x, 100)
    assert.equal(circularRoot.position.y, 190)
    assert.equal(circularRoot.rotation.z, Math.PI / 2)
    assert.equal(circularMesh.geometry.type, 'CylinderGeometry')
    assert.equal(circularMesh.rotation.x, Math.PI / 2)
    assert.equal(circularMesh.position.z, 14.2)

    const roundedRoot = group.children[1]
    const roundedMesh = roundedRoot.children[0]
    assert.equal(roundedRoot.position.x, 210)
    assert.equal(roundedRoot.position.y, 300)
    assert.equal(roundedRoot.rotation.z, Math.PI / 4)
    assert.equal(roundedMesh.geometry.type, 'ExtrudeGeometry')
    assert.equal(roundedMesh.position.x, 8)
    assert.equal(roundedMesh.position.y, -5)
    assert.equal(roundedMesh.position.z, 14.2)
    assert.equal(
        roundedMesh.geometry.shape.commands.filter(
            (command) => command[0] === 'absarc'
        ).length,
        4
    )
})

test('buildGroup respects explicit side solder-mask openings', () => {
    const THREE = createFakeThree()
    const pads = [
        {
            x: 100,
            y: 100,
            sizeTopX: 60,
            sizeTopY: 40,
            sizeBottomX: 60,
            sizeBottomY: 40,
            shapeTop: 2,
            shapeBottom: 2,
            hasTopSolderMaskOpening: true,
            hasBottomSolderMaskOpening: false
        },
        {
            x: 200,
            y: 100,
            sizeTopX: 50,
            sizeTopY: 50,
            sizeBottomX: 50,
            sizeBottomY: 50,
            shapeTop: 1,
            shapeBottom: 1,
            hasTopSolderMaskOpening: true,
            hasBottomSolderMaskOpening: true
        }
    ]
    const topGroup = PcbScene3dPadFactory.buildGroup(
        THREE,
        pads,
        14.2,
        (x, y) => ({ x, y }),
        { side: 'top' }
    )
    const bottomGroup = PcbScene3dPadFactory.buildGroup(
        THREE,
        pads,
        14.2,
        (x, y) => ({ x, y }),
        { side: 'bottom' }
    )

    assert.equal(topGroup.children.length, 2)
    assert.equal(bottomGroup.children.length, 1)
    assert.equal(bottomGroup.children[0].position.x, 200)
})

test('buildGroup extrudes drilled pads as annular rings', () => {
    const group = PcbScene3dPadFactory.buildGroup(
        THREE,
        [
            {
                x: 110,
                y: 210,
                sizeTopX: 60,
                sizeTopY: 60,
                shapeTop: 1,
                holeDiameter: 28,
                rotation: 90
            }
        ],
        14.2,
        (x, y) => ({ x: x - 10, y: y - 20 })
    )

    assert.equal(group.children.length, 1)

    const root = group.children[0]
    const mesh = root.children[0]

    assert.equal(root.position.x, 100)
    assert.equal(root.position.y, 190)
    assert.equal(root.rotation.z, Math.PI / 2)
    assert.equal(mesh.geometry.type, 'ExtrudeGeometry')
    assert.equal(mesh.geometry.parameters.shapes.holes.length, 1)
    assert.equal(mesh.position.z, 14.2)
    assert.equal(mesh.rotation.x, 0)
})

test('buildGroup keeps drilled pad barrels without filling the aperture', () => {
    const group = PcbScene3dPadFactory.buildGroup(
        THREE,
        [
            {
                x: 110,
                y: 210,
                sizeTopX: 60,
                sizeTopY: 60,
                shapeTop: 1,
                holeDiameter: 28
            }
        ],
        14.2,
        (x, y) => ({ x, y })
    )
    const mesh = group.children[0].children[0]

    assert.equal(
        countCircularDrillFaceCapTriangles(mesh.geometry, 14),
        0,
        'Expected pad hole center to stay uncapped'
    )
    assert.ok(
        countCircularDrillWallTriangles(mesh.geometry, 14),
        'Expected the drilled pad to keep a visible copper barrel'
    )
    assert.equal(
        mesh.material.side,
        THREE.DoubleSide,
        'Expected the drilled pad barrel to render from the underside'
    )
})

test('buildGroup cuts neighboring slotted drills out of overlapping pads', () => {
    const drilledPad = {
        x: 0,
        y: 0,
        sizeTopX: 58,
        sizeTopY: 42,
        shapeTop: 2,
        hasRoundedRect: true,
        roundedRectShapeTop: 2,
        cornerRadiusTop: 25,
        holeDiameter: 26,
        holeShape: 2,
        holeSlotLength: 42,
        rotation: 90
    }
    const overlappingPad = {
        x: 18,
        y: 0,
        sizeTopX: 80,
        sizeTopY: 56,
        shapeTop: 2
    }
    const group = PcbScene3dPadFactory.buildGroup(
        THREE,
        [drilledPad, overlappingPad],
        0,
        (x, y) => ({ x, y }),
        { side: 'top' }
    )
    const overlappingMesh = group.children[1].children[0]

    assert.equal(
        countSlottedDrillFaceCapTriangles(overlappingMesh.geometry, {
            centerX: -18,
            centerY: 0,
            diameter: 26,
            slotLength: 42,
            rotationDeg: 90
        }),
        0,
        'Expected overlapping copper to leave the neighboring slotted drill aperture open'
    )
})

test('buildGroup clips partial neighboring drills without deforming pads', () => {
    const drilledPad = {
        x: 0,
        y: -39.37,
        sizeTopX: 86,
        sizeTopY: 86,
        shapeTop: 1,
        holeDiameter: 59.055
    }
    const overlappingPad = {
        x: 0,
        y: 0,
        sizeTopX: 86,
        sizeTopY: 118.11,
        shapeTop: 2
    }
    const group = PcbScene3dPadFactory.buildGroup(
        THREE,
        [drilledPad, overlappingPad],
        0,
        (x, y) => ({ x, y }),
        { side: 'top' }
    )
    const overlappingMesh = group.children[1].children[0]
    const bounds = resolveGeometryBounds(overlappingMesh.geometry)

    assert.ok(bounds.minY >= -59.06)
    assert.equal(
        countCircularDrillFaceCapTriangles(overlappingMesh.geometry, 29.527, {
            centerX: 0,
            centerY: -39.37,
            inset: 1
        }),
        0,
        'Expected partial neighboring drill to stay open inside the overlapping pad'
    )
    assert.equal(
        countCircularDrillOverlappingTriangles(overlappingMesh.geometry, {
            centerX: 0,
            centerY: -39.37,
            radius: 29.527
        }),
        0,
        'Expected partial neighboring drill to leave no boundary-crossing pad slivers'
    )
    assert.ok(
        maxProjectedTriangleArea(overlappingMesh.geometry) < 80,
        'Expected the partial drill cutout to avoid visible wedge faces across the pad'
    )
})

test('buildGroup separates overlapping pad surfaces from shared depth planes', () => {
    const drilledPad = {
        x: 0,
        y: -39.37,
        sizeTopX: 86,
        sizeTopY: 86,
        shapeTop: 1,
        holeDiameter: 59.055
    }
    const overlappingPad = {
        x: 0,
        y: 0,
        sizeTopX: 86,
        sizeTopY: 118.11,
        shapeTop: 2
    }
    const group = PcbScene3dPadFactory.buildGroup(
        THREE,
        [drilledPad, overlappingPad],
        14.2,
        (x, y) => ({ x, y }),
        { side: 'top' }
    )
    const annularMesh = group.children[0].children[0]
    const overlappingMesh = group.children[1].children[0]

    assert.ok(
        overlappingMesh.position.z > annularMesh.position.z,
        'Expected overlapping exposed pad faces to avoid coplanar rendering artifacts'
    )
})

/**
 * Counts side-wall triangles that lie on a circular drill contour.
 * @param {any} geometry
 * @param {number} radius
 * @returns {number}
 */
function countCircularDrillWallTriangles(geometry, radius) {
    const position = geometry.getAttribute('position')
    let count = 0

    for (const group of geometry.groups) {
        if (Number(group.materialIndex) === 0) {
            continue
        }

        const end = Number(group.start || 0) + Number(group.count || 0)
        for (let index = Number(group.start || 0); index < end; index += 3) {
            if (triangleMatchesCircularContour(position, index, radius)) {
                count += 1
            }
        }
    }

    return count
}

/**
 * Counts face triangles whose centroid sits inside a circular drill.
 * @param {any} geometry
 * @param {number} radius
 * @param {{ centerX?: number, centerY?: number, inset?: number }} [options]
 * @returns {number}
 */
function countCircularDrillFaceCapTriangles(geometry, radius, options = {}) {
    const position = geometry.getAttribute('position')
    let count = 0
    const centerX = Number(options?.centerX || 0)
    const centerY = Number(options?.centerY || 0)
    const inset = Number(options?.inset || 0)
    const groups = geometry.groups.length
        ? geometry.groups
        : [{ start: 0, count: position.count, materialIndex: 0 }]

    for (const group of groups) {
        if (Number(group.materialIndex) !== 0) {
            continue
        }

        const end = Number(group.start || 0) + Number(group.count || 0)
        for (let index = Number(group.start || 0); index < end; index += 3) {
            const point = triangleCentroidPoint(position, index)
            if (
                Math.hypot(point.x - centerX, point.y - centerY) <
                radius - Math.max(inset, 0.01)
            ) {
                count += 1
            }
        }
    }

    return count
}

/**
 * Counts triangles that intersect or cover a circular drill opening.
 * @param {any} geometry Geometry to inspect.
 * @param {{ centerX: number, centerY: number, radius: number }} circle Circle bounds.
 * @returns {number}
 */
function countCircularDrillOverlappingTriangles(geometry, circle) {
    const position = geometry.getAttribute('position')
    let count = 0

    for (let index = 0; index + 2 < position.count; index += 3) {
        if (triangleOverlapsCircle(position, index, circle)) {
            count += 1
        }
    }

    return count
}

/**
 * Returns true when one triangle intersects or covers a circle.
 * @param {any} position Position buffer.
 * @param {number} vertexIndex First triangle vertex index.
 * @param {{ centerX: number, centerY: number, radius: number }} circle Circle bounds.
 * @returns {boolean}
 */
function triangleOverlapsCircle(position, vertexIndex, circle) {
    const triangle = [0, 1, 2].map((offset) => ({
        x: position.getX(vertexIndex + offset),
        y: position.getY(vertexIndex + offset)
    }))
    const center = { x: circle.centerX, y: circle.centerY }
    const radiusSquared = (circle.radius - 0.001) ** 2

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
 * Resolves axis-aligned bounds for one geometry position buffer.
 * @param {any} geometry Geometry to inspect.
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
function resolveGeometryBounds(geometry) {
    const position = geometry.getAttribute('position')
    const bounds = {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
    }

    for (let index = 0; index < position.count; index += 1) {
        bounds.minX = Math.min(bounds.minX, position.getX(index))
        bounds.maxX = Math.max(bounds.maxX, position.getX(index))
        bounds.minY = Math.min(bounds.minY, position.getY(index))
        bounds.maxY = Math.max(bounds.maxY, position.getY(index))
    }

    return bounds
}

/**
 * Resolves the largest projected XY triangle area in one geometry.
 * @param {any} geometry Geometry to inspect.
 * @returns {number}
 */
function maxProjectedTriangleArea(geometry) {
    const position = geometry.getAttribute('position')
    let maxArea = 0

    for (let index = 0; index + 2 < position.count; index += 3) {
        maxArea = Math.max(maxArea, projectedTriangleArea(position, index))
    }

    return maxArea
}

/**
 * Resolves one triangle's projected XY area.
 * @param {any} position Position buffer.
 * @param {number} vertexIndex First triangle vertex index.
 * @returns {number}
 */
function projectedTriangleArea(position, vertexIndex) {
    const first = {
        x: position.getX(vertexIndex),
        y: position.getY(vertexIndex)
    }
    const second = {
        x: position.getX(vertexIndex + 1),
        y: position.getY(vertexIndex + 1)
    }
    const third = {
        x: position.getX(vertexIndex + 2),
        y: position.getY(vertexIndex + 2)
    }

    return (
        Math.abs(
            (second.x - first.x) * (third.y - first.y) -
                (second.y - first.y) * (third.x - first.x)
        ) / 2
    )
}

/**
 * Counts face triangles whose centroid sits inside a slotted drill.
 * @param {any} geometry
 * @param {{centerX: number, centerY: number, diameter: number, slotLength: number, rotationDeg: number}} slot
 * @returns {number}
 */
function countSlottedDrillFaceCapTriangles(geometry, slot) {
    const position = geometry.getAttribute('position')
    let count = 0

    for (const group of geometry.groups) {
        if (Number(group.materialIndex) !== 0) {
            continue
        }

        const end = Number(group.start || 0) + Number(group.count || 0)
        for (let index = Number(group.start || 0); index < end; index += 3) {
            if (
                isPointInsideSlot(
                    triangleCentroidPoint(position, index),
                    slot,
                    0.5
                )
            ) {
                count += 1
            }
        }
    }

    return count
}

/**
 * Resolves one triangle centroid point.
 * @param {any} position
 * @param {number} vertexIndex
 * @returns {{x: number, y: number, z: number}}
 */
function triangleCentroidPoint(position, vertexIndex) {
    let x = 0
    let y = 0
    let z = 0

    for (let offset = 0; offset < 3; offset += 1) {
        const index = vertexIndex + offset
        x += position.getX(index)
        y += position.getY(index)
        z += position.getZ(index)
    }

    return { x: x / 3, y: y / 3, z: z / 3 }
}

/**
 * Resolves the XY radius of one triangle centroid.
 * @param {any} position
 * @param {number} vertexIndex
 * @returns {number}
 */
function triangleCentroidRadius(position, vertexIndex) {
    const { x, y } = triangleCentroidPoint(position, vertexIndex)
    return Math.hypot(x, y)
}

/**
 * Checks whether a point falls inside a rotated slotted drill aperture.
 * @param {{x: number, y: number}} point
 * @param {{centerX: number, centerY: number, diameter: number, slotLength: number, rotationDeg: number}} slot
 * @param {number} inset
 * @returns {boolean}
 */
function isPointInsideSlot(point, slot, inset) {
    const radius = Math.max(0, slot.diameter / 2 - inset)
    const halfTrack = Math.max(0, (slot.slotLength - slot.diameter) / 2)
    const angle = (-slot.rotationDeg * Math.PI) / 180
    const dx = point.x - slot.centerX
    const dy = point.y - slot.centerY
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle)

    if (Math.abs(localX) <= halfTrack && Math.abs(localY) <= radius) {
        return true
    }

    const capX = localX < 0 ? -halfTrack : halfTrack
    return Math.hypot(localX - capX, localY) <= radius
}

/**
 * Checks whether one triangle is part of a circular drill wall.
 * @param {any} position
 * @param {number} vertexIndex
 * @param {number} radius
 * @returns {boolean}
 */
function triangleMatchesCircularContour(position, vertexIndex, radius) {
    let matchedVertices = 0

    for (let offset = 0; offset < 3; offset += 1) {
        const index = vertexIndex + offset
        const vertexRadius = Math.hypot(
            position.getX(index),
            position.getY(index)
        )
        if (Math.abs(vertexRadius - radius) < 0.01) {
            matchedVertices += 1
        }
    }

    return matchedVertices >= 2
}
