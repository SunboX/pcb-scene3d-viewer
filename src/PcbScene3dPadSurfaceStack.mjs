/**
 * Tracks exposed pad footprints that already occupy one board face.
 */
export class PcbScene3dPadSurfaceStack {
    static #COPLANAR_PAD_LIFT_MIL = 0.04
    static #SURFACE_Z_PRIORITY_DEFAULT = 0
    static #SURFACE_Z_PRIORITY_DRILLED = 1

    /**
     * Resolves a small lift for a pad face that overlaps previous pad faces.
     * @param {{ bounds: { minX: number, maxX: number, minY: number, maxY: number }, zIndex: number, priority?: number }[]} stack
     * @param {{ x: number, y: number }} point Normalized pad anchor.
     * @param {{ rotation?: number | null, holeDiameter?: number | null }} pad Source pad.
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', radius: number, offsetX: number, offsetY: number, hasHole?: boolean, holeDiameter?: number | null }} spec Pad face spec.
     * @param {boolean} mirrorY Whether underside coordinates are mirrored.
     * @returns {number}
     */
    static resolveLift(stack, point, pad, spec, mirrorY) {
        const surface = PcbScene3dPadSurfaceStack.#resolveFootprint(
            point,
            pad,
            spec,
            mirrorY
        )
        const priority = PcbScene3dPadSurfaceStack.#resolveSurfacePriority(
            pad,
            spec
        )
        let zIndex = priority

        for (const previous of stack) {
            if (
                PcbScene3dPadSurfaceStack.#boundsOverlap(
                    surface.bounds,
                    previous.bounds
                ) &&
                priority >=
                    Number(
                        previous.priority ??
                            PcbScene3dPadSurfaceStack
                                .#SURFACE_Z_PRIORITY_DEFAULT
                    )
            ) {
                zIndex = Math.max(zIndex, previous.zIndex + 1)
            }
        }

        stack.push({ bounds: surface.bounds, zIndex, priority })
        return zIndex * PcbScene3dPadSurfaceStack.#COPLANAR_PAD_LIFT_MIL
    }

    /**
     * Resolves stable visual priority for overlapping pad surfaces.
     * @param {{ holeDiameter?: number | null }} pad Source pad.
     * @param {{ hasHole?: boolean, holeDiameter?: number | null }} spec Pad face spec.
     * @returns {number}
     */
    static #resolveSurfacePriority(pad, spec) {
        if (
            spec?.hasHole === true ||
            Number(spec?.holeDiameter || pad?.holeDiameter || 0) > 0
        ) {
            return PcbScene3dPadSurfaceStack.#SURFACE_Z_PRIORITY_DRILLED
        }

        return PcbScene3dPadSurfaceStack.#SURFACE_Z_PRIORITY_DEFAULT
    }

    /**
     * Resolves the projected board-space footprint for one pad face.
     * @param {{ x: number, y: number }} point Normalized pad anchor.
     * @param {{ rotation?: number | null }} pad Source pad.
     * @param {{ width: number, height: number, kind: 'circle' | 'rect' | 'rounded-rect', radius: number, offsetX: number, offsetY: number }} spec Pad face spec.
     * @param {boolean} mirrorY Whether underside coordinates are mirrored.
     * @returns {{ bounds: { minX: number, maxX: number, minY: number, maxY: number } }}
     */
    static #resolveFootprint(point, pad, spec, mirrorY) {
        const rotation = Number(pad?.rotation || 0)
        const offset = PcbScene3dPadSurfaceStack.#rotatePoint(
            { x: spec.offsetX, y: mirrorY ? -spec.offsetY : spec.offsetY },
            rotation
        )
        const center = { x: point.x + offset.x, y: point.y + offset.y }

        if (spec.kind === 'circle') {
            return {
                bounds: {
                    minX: center.x - spec.radius,
                    maxX: center.x + spec.radius,
                    minY: center.y - spec.radius,
                    maxY: center.y + spec.radius
                }
            }
        }

        return {
            bounds: PcbScene3dPadSurfaceStack.#boundsFromRect(
                center,
                spec,
                rotation
            )
        }
    }

    /**
     * Resolves rotated rectangular bounds for non-circular pad faces.
     * @param {{ x: number, y: number }} center Surface center.
     * @param {{ width: number, height: number }} spec Pad face spec.
     * @param {number} rotation Rotation in degrees.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #boundsFromRect(center, spec, rotation) {
        const halfWidth = Number(spec.width || 0) / 2
        const halfHeight = Number(spec.height || 0) / 2
        const points = [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ].map((corner) => {
            const rotated = PcbScene3dPadSurfaceStack.#rotatePoint(
                corner,
                rotation
            )
            return { x: center.x + rotated.x, y: center.y + rotated.y }
        })

        return PcbScene3dPadSurfaceStack.#boundsFromPoints(points)
    }

    /**
     * Resolves axis-aligned bounds for a point list.
     * @param {{ x: number, y: number }[]} points
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static #boundsFromPoints(points) {
        return points.reduce(
            (bounds, point) => ({
                minX: Math.min(bounds.minX, point.x),
                maxX: Math.max(bounds.maxX, point.x),
                minY: Math.min(bounds.minY, point.y),
                maxY: Math.max(bounds.maxY, point.y)
            }),
            {
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity
            }
        )
    }

    /**
     * Returns true when two projected surface bounds overlap.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} first
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} second
     * @returns {boolean}
     */
    static #boundsOverlap(first, second) {
        return (
            first.maxX >= second.minX &&
            first.minX <= second.maxX &&
            first.maxY >= second.minY &&
            first.minY <= second.maxY
        )
    }

    /**
     * Rotates one 2D point around the origin.
     * @param {{ x: number, y: number }} point
     * @param {number} angleDeg
     * @returns {{ x: number, y: number }}
     */
    static #rotatePoint(point, angleDeg) {
        const angleRad = (Number(angleDeg || 0) * Math.PI) / 180
        const cos = Math.cos(angleRad)
        const sin = Math.sin(angleRad)

        return {
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos
        }
    }
}
