import { PcbAssemblyMeshUtils } from './PcbAssemblyMeshUtils.mjs'

const GEOMETRY_EPSILON = 0.001

/**
 * Builds PCB assembly copper pad meshes.
 */
export class PcbAssemblyPadMeshBuilder {
    /**
     * Builds one pad mesh for an assembly export.
     * @param {string} name Mesh name.
     * @param {object} pad Pad primitive.
     * @param {'top' | 'bottom'} side Pad side.
     * @param {number} z Center Z.
     * @param {number} thickness Extrusion thickness.
     * @param {number[]} color Mesh color.
     * @returns {object | null}
     */
    static build(name, pad, side, z, thickness, color) {
        const size = PcbAssemblyPadMeshBuilder.#padSize(pad, side)
        if (!size) {
            return null
        }

        const offset = PcbAssemblyPadMeshBuilder.#padOffset(pad, side)
        const x = Number(pad?.x || 0) + offset.x
        const y = Number(pad?.y || 0) + offset.y
        const shape = PcbAssemblyPadMeshBuilder.#padShape(pad, side)
        const isCircle =
            Math.abs(size.width - size.height) < GEOMETRY_EPSILON && shape !== 2
        const hole = PcbAssemblyPadMeshBuilder.#holeLoop(pad, x, y)
        const mesh = hole
            ? PcbAssemblyPadMeshBuilder.#drilledMesh(
                  name,
                  x,
                  y,
                  size,
                  isCircle,
                  hole,
                  z,
                  thickness,
                  color
              )
            : PcbAssemblyPadMeshBuilder.#solidMesh(
                  name,
                  x,
                  y,
                  size,
                  isCircle,
                  z,
                  thickness,
                  color
              )

        return PcbAssemblyPadMeshBuilder.#rotateMeshAroundZ(
            mesh,
            Number(pad?.rotation || 0),
            x,
            y
        )
    }

    /**
     * Builds one solid pad mesh.
     * @param {string} name Mesh name.
     * @param {number} x Pad center X.
     * @param {number} y Pad center Y.
     * @param {{ width: number, height: number }} size Pad size.
     * @param {boolean} isCircle Whether the pad is circular.
     * @param {number} z Center Z.
     * @param {number} thickness Extrusion thickness.
     * @param {number[]} color Mesh color.
     * @returns {object}
     */
    static #solidMesh(name, x, y, size, isCircle, z, thickness, color) {
        return isCircle
            ? PcbAssemblyMeshUtils.cylinder(name, {
                  x,
                  y,
                  z,
                  radius: size.width / 2,
                  height: thickness,
                  color
              })
            : PcbAssemblyMeshUtils.box(name, {
                  x,
                  y,
                  z,
                  width: size.width,
                  depth: size.height,
                  height: thickness,
                  color
              })
    }

    /**
     * Builds one drilled pad mesh.
     * @param {string} name Mesh name.
     * @param {number} x Pad center X.
     * @param {number} y Pad center Y.
     * @param {{ width: number, height: number }} size Pad size.
     * @param {boolean} isCircle Whether the pad is circular.
     * @param {number[][]} hole Hole loop.
     * @param {number} z Center Z.
     * @param {number} thickness Extrusion thickness.
     * @param {number[]} color Mesh color.
     * @returns {object | null}
     */
    static #drilledMesh(name, x, y, size, isCircle, hole, z, thickness, color) {
        if (
            PcbAssemblyPadMeshBuilder.#holeConsumesPad(
                x,
                y,
                size,
                isCircle,
                hole
            )
        ) {
            return null
        }

        const outer = isCircle
            ? PcbAssemblyMeshUtils.circlePoints(x, y, size.width / 2, 32)
            : PcbAssemblyPadMeshBuilder.#rectanglePoints(x, y, size)

        return PcbAssemblyMeshUtils.prismWithHoles(
            name,
            outer,
            [hole],
            z,
            thickness,
            color
        )
    }

    /**
     * Returns true when a drill leaves no meaningful copper surface.
     * @param {number} x Pad center X.
     * @param {number} y Pad center Y.
     * @param {{ width: number, height: number }} size Pad size.
     * @param {boolean} isCircle Whether the pad is circular.
     * @param {number[][]} hole Hole loop.
     * @returns {boolean}
     */
    static #holeConsumesPad(x, y, size, isCircle, hole) {
        if (isCircle) {
            const outerRadius = Math.min(size.width, size.height) / 2
            const innerRadius = hole.reduce(
                (minRadius, point) =>
                    Math.min(minRadius, Math.hypot(point[0] - x, point[1] - y)),
                Infinity
            )
            return innerRadius >= outerRadius - GEOMETRY_EPSILON
        }

        const outerArea = Math.max(size.width, 0) * Math.max(size.height, 0)
        const holeArea = Math.abs(PcbAssemblyPadMeshBuilder.#polygonArea(hole))
        return holeArea >= outerArea - GEOMETRY_EPSILON
    }

    /**
     * Builds a drill loop when a pad has a usable hole.
     * @param {object} pad Pad primitive.
     * @param {number} x Pad center X.
     * @param {number} y Pad center Y.
     * @returns {number[][] | null}
     */
    static #holeLoop(pad, x, y) {
        const diameter = PcbAssemblyPadMeshBuilder.#firstPositive([
            pad?.holeDiameter,
            pad?.drillDiameter,
            pad?.holeSize,
            pad?.drill,
            pad?.holeGeometry?.diameter,
            pad?.holeGeometry?.width
        ])
        if (!diameter) {
            return null
        }

        const holeX = x + Number(pad?.holeOffsetX || 0)
        const holeY = y + Number(pad?.holeOffsetY || 0)
        if (Number(pad?.holeShape) === 1) {
            const width = PcbAssemblyPadMeshBuilder.#firstPositive([
                pad?.holeWidth,
                pad?.holeGeometry?.width,
                diameter
            ])
            const height = PcbAssemblyPadMeshBuilder.#firstPositive([
                pad?.holeHeight,
                pad?.holeGeometry?.height,
                diameter
            ])
            return PcbAssemblyPadMeshBuilder.#rotatedPoints(
                PcbAssemblyPadMeshBuilder.#rectanglePoints(holeX, holeY, {
                    width,
                    height
                }),
                holeX,
                holeY,
                Number(pad?.holeRotation ?? pad?.rotation ?? 0) -
                    Number(pad?.rotation || 0)
            )
        }
        const slotLength = PcbAssemblyPadMeshBuilder.#firstPositive([
            pad?.holeSlotLength,
            pad?.slotLength,
            pad?.holeGeometry?.slotLength,
            pad?.holeGeometry?.length
        ])
        if (slotLength > diameter + GEOMETRY_EPSILON) {
            return PcbAssemblyPadMeshBuilder.#rotatedPoints(
                PcbAssemblyMeshUtils.capsulePoints(
                    holeX - (slotLength - diameter) / 2,
                    holeY,
                    holeX + (slotLength - diameter) / 2,
                    holeY,
                    diameter / 2
                ),
                holeX,
                holeY,
                Number(pad?.holeRotation ?? pad?.rotation ?? 0) -
                    Number(pad?.rotation || 0)
            )
        }

        return PcbAssemblyMeshUtils.circlePoints(holeX, holeY, diameter / 2, 24)
    }

    /**
     * Resolves side-specific pad dimensions.
     * @param {object} pad Pad primitive.
     * @param {'top' | 'bottom'} side Pad side.
     * @returns {{ width: number, height: number } | null}
     */
    static #padSize(pad, side) {
        const prefix = side === 'bottom' ? 'Bottom' : 'Top'
        let width = PcbAssemblyPadMeshBuilder.#firstPositive([
            pad?.['size' + prefix + 'X']
        ])
        let height = PcbAssemblyPadMeshBuilder.#firstPositive([
            pad?.['size' + prefix + 'Y']
        ])

        if (side === 'top' && !width) {
            width = PcbAssemblyPadMeshBuilder.#firstPositive([
                pad?.width,
                pad?.sizeX,
                pad?.diameter,
                pad?.sizeMidX,
                pad?.sizeBottomX
            ])
        }
        if (side === 'top' && !height) {
            height = PcbAssemblyPadMeshBuilder.#firstPositive([
                pad?.height,
                pad?.sizeY,
                pad?.diameter,
                pad?.sizeMidY,
                pad?.sizeBottomY,
                width
            ])
        }
        if (width && !height) {
            height = width
        }

        return width && height
            ? {
                  width: Math.max(width, 1),
                  height: Math.max(height, 1)
              }
            : null
    }

    /**
     * Resolves side-specific pad center offset.
     * @param {object} pad Pad primitive.
     * @param {'top' | 'bottom'} side Pad side.
     * @returns {{ x: number, y: number }}
     */
    static #padOffset(pad, side) {
        const prefix = side === 'bottom' ? 'Bottom' : 'Top'

        return {
            x: Number(pad?.['offset' + prefix + 'X'] || 0),
            y: Number(pad?.['offset' + prefix + 'Y'] || 0)
        }
    }

    /**
     * Resolves the renderer pad shape code for one side.
     * @param {object} pad Pad primitive.
     * @param {'top' | 'bottom'} side Pad side.
     * @returns {number}
     */
    static #padShape(pad, side) {
        const prefix = side === 'bottom' ? 'Bottom' : 'Top'
        const rounded = pad?.['roundedRectShape' + prefix]
        if (Number.isInteger(Number(rounded))) {
            return Number(rounded)
        }

        return Number(
            pad?.['shape' + prefix] ||
                pad?.shapeMid ||
                (side === 'top' ? pad?.shapeBottom : pad?.shapeTop) ||
                0
        )
    }

    /**
     * Builds rectangle points for an axis-aligned pad.
     * @param {number} x Center X.
     * @param {number} y Center Y.
     * @param {{ width: number, height: number }} size Pad size.
     * @returns {number[][]}
     */
    static #rectanglePoints(x, y, size) {
        const halfWidth = size.width / 2
        const halfHeight = size.height / 2
        return [
            [x - halfWidth, y - halfHeight],
            [x + halfWidth, y - halfHeight],
            [x + halfWidth, y + halfHeight],
            [x - halfWidth, y + halfHeight]
        ]
    }

    /**
     * Rotates points around a center.
     * @param {number[][]} points Source points.
     * @param {number} centerX Center X.
     * @param {number} centerY Center Y.
     * @param {number} rotationDeg Rotation in degrees.
     * @returns {number[][]}
     */
    static #rotatedPoints(points, centerX, centerY, rotationDeg) {
        if (Math.abs(Number(rotationDeg || 0)) < GEOMETRY_EPSILON) {
            return points
        }

        const angle = (Number(rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return points.map((point) => {
            const dx = point[0] - centerX
            const dy = point[1] - centerY
            return [
                centerX + dx * cos - dy * sin,
                centerY + dx * sin + dy * cos
            ]
        })
    }

    /**
     * Calculates polygon area using the shoelace formula.
     * @param {number[][]} points Polygon points.
     * @returns {number}
     */
    static #polygonArea(points) {
        let area = 0
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index]
            const next = points[(index + 1) % points.length]
            area += point[0] * next[1] - next[0] * point[1]
        }

        return area / 2
    }

    /**
     * Rotates one mesh around a Z-axis origin.
     * @param {object | null} mesh Mesh to rotate.
     * @param {number} rotationDeg Rotation angle.
     * @param {number} originX Origin X.
     * @param {number} originY Origin Y.
     * @returns {object | null}
     */
    static #rotateMeshAroundZ(mesh, rotationDeg, originX, originY) {
        if (!mesh || Math.abs(Number(rotationDeg || 0)) < GEOMETRY_EPSILON) {
            return mesh
        }

        const rotationRad = (Number(rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(rotationRad)
        const sin = Math.sin(rotationRad)

        return {
            ...mesh,
            vertices: mesh.vertices.map((vertex) => {
                const dx = Number(vertex[0] || 0) - originX
                const dy = Number(vertex[1] || 0) - originY
                return [
                    originX + dx * cos - dy * sin,
                    originY + dx * sin + dy * cos,
                    Number(vertex[2] || 0)
                ]
            })
        }
    }

    /**
     * Returns the first positive finite number.
     * @param {unknown[]} values Candidate values.
     * @returns {number}
     */
    static #firstPositive(values) {
        for (const value of values) {
            const number = Number(value)
            if (Number.isFinite(number) && number > 0) {
                return number
            }
        }

        return 0
    }
}
