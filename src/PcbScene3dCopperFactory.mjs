import { PcbScene3dArcUtils } from './PcbScene3dArcUtils.mjs'
import { PcbScene3dPadFactory } from './PcbScene3dPadFactory.mjs'
import { PcbScene3dCopperTextFactory } from './PcbScene3dCopperTextFactory.mjs'
import { PcbScene3dMaskCoveredCopperMaterial } from './PcbScene3dMaskCoveredCopperMaterial.mjs'
import { PcbScene3dGeometryZCompressor } from './PcbScene3dGeometryZCompressor.mjs'
import { PcbScene3dCopperOcclusionClipper } from './PcbScene3dCopperOcclusionClipper.mjs'
import { PcbScene3dCopperLayerFilter } from './PcbScene3dCopperLayerFilter.mjs'

/**
 * Builds copper-detail meshes for the interactive 3D PCB scene.
 */
export class PcbScene3dCopperFactory {
    static #ARC_SEGMENT_DEGREES = 3
    static #FULL_CIRCLE_EPSILON = 0.001
    static #ROUND_CAP_SEGMENTS = 16
    static #COPPER_THICKNESS_MIL = 2.2
    static #COPPER_COLOR = 0xd9a61d

    /**
     * Returns half the visual copper extrusion thickness.
     * @returns {number}
     */
    static visualHalfThicknessMil() {
        return PcbScene3dCopperFactory.#COPPER_THICKNESS_MIL / 2
    }

    /**
     * Builds the combined top and bottom copper group.
     * @param {any} THREE
     * @param {{ tracks?: any[], arcs?: any[], pads?: any[], vias?: any[], copperTexts?: any[] }} detail
     * @param {number} topZ
     * @param {number} bottomZ
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {{ coordinateSystem?: string }} [options]
     * @returns {any}
     */
    static buildGroup(
        THREE,
        detail,
        topZ,
        bottomZ,
        normalizeBoardPoint,
        options = {}
    ) {
        const group = new THREE.Group()
        const topGroup = PcbScene3dCopperFactory.#buildSideGroup(
            THREE,
            {
                tracks: PcbScene3dCopperLayerFilter.tracks(
                    detail?.tracks,
                    'top'
                ),
                arcs: PcbScene3dCopperLayerFilter.arcs(detail?.arcs, 'top'),
                pads: detail?.pads || [],
                vias: detail?.vias || [],
                copperTexts: detail?.copperTexts || []
            },
            Math.abs(Number(topZ || 0)),
            normalizeBoardPoint,
            false,
            options
        )
        const bottomGroup = PcbScene3dCopperFactory.#buildSideGroup(
            THREE,
            {
                tracks: PcbScene3dCopperLayerFilter.tracks(
                    detail?.tracks,
                    'bottom'
                ),
                arcs: PcbScene3dCopperLayerFilter.arcs(detail?.arcs, 'bottom'),
                pads: detail?.pads || [],
                vias: detail?.vias || [],
                copperTexts: detail?.copperTexts || []
            },
            Math.abs(Number(bottomZ || 0)),
            normalizeBoardPoint,
            true,
            options
        )

        if (topGroup.children.length) {
            group.add(topGroup)
        }
        if (bottomGroup.children.length) {
            group.add(bottomGroup)
        }

        return group
    }

    /**
     * Builds top and bottom traces that are covered by solder mask.
     * @param {any} THREE
     * @param {{ tracks?: any[], arcs?: any[] }} detail Mask-covered detail.
     * @param {number} topZ
     * @param {number} bottomZ
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {{ solderMaskColor?: number, occlusionCutouts?: { top?: { x: number, y: number }[][], bottom?: { x: number, y: number }[][] } }} [options]
     * @returns {any}
     */
    static buildMaskCoveredGroup(
        THREE,
        detail,
        topZ,
        bottomZ,
        normalizeBoardPoint,
        options = {}
    ) {
        const group = new THREE.Group()
        const material = PcbScene3dMaskCoveredCopperMaterial.build(
            THREE,
            options
        )
        const topGroup = PcbScene3dCopperFactory.#buildMaskCoveredSideGroup(
            THREE,
            {
                tracks: PcbScene3dCopperLayerFilter.tracks(
                    detail?.tracks,
                    'top'
                ),
                arcs: PcbScene3dCopperLayerFilter.arcs(detail?.arcs, 'top')
            },
            Math.abs(Number(topZ || 0)),
            normalizeBoardPoint,
            false,
            material,
            PcbScene3dCopperOcclusionClipper.normalizeCutouts(
                options?.occlusionCutouts?.top,
                normalizeBoardPoint,
                false
            )
        )
        const bottomGroup = PcbScene3dCopperFactory.#buildMaskCoveredSideGroup(
            THREE,
            {
                tracks: PcbScene3dCopperLayerFilter.tracks(
                    detail?.tracks,
                    'bottom'
                ),
                arcs: PcbScene3dCopperLayerFilter.arcs(detail?.arcs, 'bottom')
            },
            Math.abs(Number(bottomZ || 0)),
            normalizeBoardPoint,
            true,
            material,
            PcbScene3dCopperOcclusionClipper.normalizeCutouts(
                options?.occlusionCutouts?.bottom,
                normalizeBoardPoint,
                true
            )
        )

        if (topGroup.children.length) {
            group.add(topGroup)
        }
        if (bottomGroup.children.length) {
            group.add(bottomGroup)
        }

        return group
    }

    /**
     * Builds one side-specific copper group.
     * @param {any} THREE
     * @param {{ tracks?: any[], arcs?: any[], pads?: any[], vias?: any[], copperTexts?: any[] }} detail
     * @param {number} z
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {boolean} mirrorY
     * @param {{ coordinateSystem?: string }} [options]
     * @returns {any}
     */
    static #buildSideGroup(
        THREE,
        detail,
        z,
        normalizeBoardPoint,
        mirrorY,
        options = {}
    ) {
        const group = new THREE.Group()
        const trackMesh = PcbScene3dCopperFactory.#buildTrackMesh(
            THREE,
            detail?.tracks || [],
            z,
            normalizeBoardPoint,
            mirrorY
        )
        const arcMesh = PcbScene3dCopperFactory.#buildArcMesh(
            THREE,
            detail?.arcs || [],
            z,
            normalizeBoardPoint,
            mirrorY
        )
        const padGroup = PcbScene3dPadFactory.buildGroup(
            THREE,
            detail?.pads || [],
            z,
            normalizeBoardPoint,
            {
                side: mirrorY ? 'bottom' : 'top',
                mirrorY
            }
        )
        const textGroup = PcbScene3dCopperTextFactory.buildGroup(
            THREE,
            detail?.copperTexts || [],
            z + 0.25,
            normalizeBoardPoint,
            {
                glyphYUp: PcbScene3dCopperFactory.#usesYUpGlyphs(options),
                side: mirrorY ? 'bottom' : 'top',
                mirrorY
            }
        )

        if (trackMesh) {
            group.add(trackMesh)
        }
        if (arcMesh) {
            group.add(arcMesh)
        }
        if (padGroup.children.length) {
            group.add(padGroup)
        }
        if (textGroup.children.length) {
            group.add(textGroup)
        }
        if (mirrorY && group.children.length) {
            group.rotation.x = Math.PI
        }

        return group
    }

    /**
     * Builds one side of the mask-covered trace relief.
     * @param {any} THREE
     * @param {{ tracks?: any[], arcs?: any[] }} detail Mask-covered detail.
     * @param {number} z
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {boolean} mirrorY
     * @param {any} material Shared covered-trace material.
     * @param {{ x: number, y: number }[][]} occlusionCutouts Silkscreen ink polygons covering this copper.
     * @returns {any}
     */
    static #buildMaskCoveredSideGroup(
        THREE,
        detail,
        z,
        normalizeBoardPoint,
        mirrorY,
        material,
        occlusionCutouts
    ) {
        const group = new THREE.Group()
        const trackMesh = PcbScene3dCopperFactory.#buildTrackMesh(
            THREE,
            detail?.tracks || [],
            z,
            normalizeBoardPoint,
            mirrorY,
            material,
            occlusionCutouts
        )
        const arcMesh = PcbScene3dCopperFactory.#buildArcMesh(
            THREE,
            detail?.arcs || [],
            z,
            normalizeBoardPoint,
            mirrorY,
            material,
            occlusionCutouts
        )

        if (trackMesh) {
            PcbScene3dGeometryZCompressor.compressMaskCoveredCopperMesh(
                trackMesh,
                z
            )
            trackMesh.name = 'mask-covered-copper-tracks'
            group.add(trackMesh)
        }
        if (arcMesh) {
            PcbScene3dGeometryZCompressor.compressMaskCoveredCopperMesh(
                arcMesh,
                z
            )
            arcMesh.name = 'mask-covered-copper-arcs'
            group.add(arcMesh)
        }
        if (mirrorY && group.children.length) {
            group.rotation.x = Math.PI
        }

        return group
    }

    /**
     * Checks whether copper text glyph strokes are already in y-up scene space.
     * @param {{ coordinateSystem?: string } | undefined} options
     * @returns {boolean}
     */
    static #usesYUpGlyphs(options) {
        return String(options?.coordinateSystem || '') === 'kicad-3d-y-up'
    }

    /**
     * Builds one widened copper-track mesh for one face.
     * @param {any} THREE
     * @param {{ x1?: number, y1?: number, x2?: number, y2?: number, width?: number, capStartRound?: boolean, capEndRound?: boolean, capStartSideWall?: boolean, capEndSideWall?: boolean }[]} tracks
     * @param {number} z
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {boolean} mirrorY
     * @param {any | null} [material] Optional material override.
     * @param {{ x: number, y: number }[][]} [cutouts] Optional geometry cutouts.
     * @returns {any | null}
     */
    static #buildTrackMesh(
        THREE,
        tracks,
        z,
        normalizeBoardPoint,
        mirrorY,
        material = null,
        cutouts = []
    ) {
        const positions = []

        for (const track of tracks) {
            const start = PcbScene3dCopperFactory.#normalizePoint(
                normalizeBoardPoint,
                Number(track?.x1 || 0),
                Number(track?.y1 || 0),
                mirrorY
            )
            const end = PcbScene3dCopperFactory.#normalizePoint(
                normalizeBoardPoint,
                Number(track?.x2 || 0),
                Number(track?.y2 || 0),
                mirrorY
            )
            PcbScene3dCopperFactory.#appendTrackTriangles(
                positions,
                start,
                end,
                Number(track?.width || 0),
                z,
                track
            )
        }

        return PcbScene3dCopperFactory.#buildStrokeMesh(
            THREE,
            positions,
            material,
            cutouts
        )
    }

    /**
     * Builds one widened copper-arc mesh for one face.
     * @param {any} THREE
     * @param {{ x?: number, y?: number, radius?: number, startAngle?: number, endAngle?: number, width?: number }[]} arcs
     * @param {number} z
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {boolean} mirrorY
     * @param {any | null} [material] Optional material override.
     * @param {{ x: number, y: number }[][]} [cutouts] Optional geometry cutouts.
     * @returns {any | null}
     */
    static #buildArcMesh(
        THREE,
        arcs,
        z,
        normalizeBoardPoint,
        mirrorY,
        material = null,
        cutouts = []
    ) {
        const positions = []

        for (const arc of arcs) {
            const center = PcbScene3dCopperFactory.#normalizePoint(
                normalizeBoardPoint,
                Number(arc?.x || 0),
                Number(arc?.y || 0),
                mirrorY
            )
            PcbScene3dCopperFactory.#appendArcTriangles(
                positions,
                center,
                arc,
                z,
                mirrorY
            )
        }

        return PcbScene3dCopperFactory.#buildStrokeMesh(
            THREE,
            positions,
            material,
            cutouts
        )
    }

    /**
     * Builds one copper stroke mesh from triangle positions.
     * @param {any} THREE
     * @param {number[]} positions
     * @param {any | null} [material] Optional material override.
     * @param {{ x: number, y: number }[][]} [cutouts] Optional geometry cutouts.
     * @returns {any | null}
     */
    static #buildStrokeMesh(THREE, positions, material = null, cutouts = []) {
        if (!positions.length) {
            return null
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        )
        const clippedGeometry = PcbScene3dCopperOcclusionClipper.filter(
            THREE,
            geometry,
            cutouts
        )

        if (!clippedGeometry) {
            return null
        }

        return new THREE.Mesh(
            clippedGeometry,
            material || PcbScene3dCopperFactory.#buildMaterial(THREE)
        )
    }

    /**
     * Builds the shared copper material.
     * @param {any} THREE
     * @returns {any}
     */
    static #buildMaterial(THREE) {
        return new THREE.MeshStandardMaterial({
            color: PcbScene3dCopperFactory.#COPPER_COLOR,
            roughness: 0.38,
            metalness: 0.55,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        })
    }

    /**
     * Appends one widened track quad as two triangles.
     * @param {number[]} positions
     * @param {{ x: number, y: number }} start
     * @param {{ x: number, y: number }} end
     * @param {number} width
     * @param {number} z
     * @param {{ capStartRound?: boolean, capEndRound?: boolean, capStartSideWall?: boolean, capEndSideWall?: boolean }} [options]
     * @returns {void}
     */
    static #appendTrackTriangles(
        positions,
        start,
        end,
        width,
        z,
        options = {}
    ) {
        const dx = end.x - start.x
        const dy = end.y - start.y
        const length = Math.hypot(dx, dy)
        const halfWidth = Math.max(Number(width || 0), 1) / 2

        if (length <= 0.001) {
            const minX = start.x - halfWidth
            const maxX = start.x + halfWidth
            const minY = start.y - halfWidth
            const maxY = start.y + halfWidth

            PcbScene3dCopperFactory.#appendDiscTriangles(
                positions,
                { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
                halfWidth,
                z
            )
            return
        }

        const normalX = (-dy / length) * halfWidth
        const normalY = (dx / length) * halfWidth

        PcbScene3dCopperFactory.#appendQuadTriangles(
            positions,
            { x: start.x + normalX, y: start.y + normalY },
            { x: end.x + normalX, y: end.y + normalY },
            { x: end.x - normalX, y: end.y - normalY },
            { x: start.x - normalX, y: start.y - normalY },
            z
        )
        PcbScene3dCopperFactory.#appendBoundarySideTriangles(
            positions,
            { x: start.x + normalX, y: start.y + normalY },
            { x: end.x + normalX, y: end.y + normalY },
            z
        )
        PcbScene3dCopperFactory.#appendBoundarySideTriangles(
            positions,
            { x: end.x - normalX, y: end.y - normalY },
            { x: start.x - normalX, y: start.y - normalY },
            z
        )
        if (options?.capStartRound !== false) {
            PcbScene3dCopperFactory.#appendRoundCapTriangles(
                positions,
                start,
                halfWidth,
                z,
                -dx / length,
                -dy / length,
                options?.capStartSideWall !== false
            )
        }
        if (options?.capEndRound !== false) {
            PcbScene3dCopperFactory.#appendRoundCapTriangles(
                positions,
                end,
                halfWidth,
                z,
                dx / length,
                dy / length,
                options?.capEndSideWall !== false
            )
        }
    }

    /**
     * Appends one widened arc band as triangles.
     * @param {number[]} positions
     * @param {{ x: number, y: number }} center
     * @param {{ radius?: number, width?: number, startAngle?: number, endAngle?: number, sweepAngle?: number }} arc
     * @param {number} z
     * @param {boolean} mirrorY
     * @returns {void}
     */
    static #appendArcTriangles(positions, center, arc, z, mirrorY) {
        const strokeWidth = Math.max(Number(arc?.width || 0), 1)
        const radius = Math.max(Number(arc?.radius || 0), strokeWidth / 2, 0.8)
        const outerRadius = radius + strokeWidth / 2
        const innerRadius = Math.max(radius - strokeWidth / 2, 0)
        const startAngleRad = (Number(arc?.startAngle || 0) * Math.PI) / 180
        const deltaAngleDeg = PcbScene3dArcUtils.resolveArcSweepDelta(arc)
        const isFullCircle =
            Math.abs(deltaAngleDeg) <=
                PcbScene3dCopperFactory.#FULL_CIRCLE_EPSILON ||
            Math.abs(deltaAngleDeg) >=
                360 - PcbScene3dCopperFactory.#FULL_CIRCLE_EPSILON
        const deltaAngleRad = isFullCircle
            ? Math.PI * 2
            : (deltaAngleDeg * Math.PI) / 180
        const segments = Math.max(
            isFullCircle ? 20 : 8,
            Math.ceil(
                Math.abs(deltaAngleDeg) /
                    PcbScene3dCopperFactory.#ARC_SEGMENT_DEGREES
            )
        )
        const yDirection = mirrorY ? -1 : 1

        for (let index = 0; index < segments; index += 1) {
            const startAngle =
                startAngleRad + (deltaAngleRad * index) / segments
            const endAngle =
                startAngleRad + (deltaAngleRad * (index + 1)) / segments
            const outerStart = {
                x: center.x + Math.cos(startAngle) * outerRadius,
                y: center.y + Math.sin(startAngle) * outerRadius * yDirection
            }
            const outerEnd = {
                x: center.x + Math.cos(endAngle) * outerRadius,
                y: center.y + Math.sin(endAngle) * outerRadius * yDirection
            }

            if (innerRadius <= 0.001) {
                PcbScene3dCopperFactory.#appendTriangle(
                    positions,
                    { x: center.x, y: center.y },
                    outerStart,
                    outerEnd,
                    z
                )
                PcbScene3dCopperFactory.#appendBoundarySideTriangles(
                    positions,
                    outerStart,
                    outerEnd,
                    z
                )
                continue
            }

            const innerStart = {
                x: center.x + Math.cos(startAngle) * innerRadius,
                y: center.y + Math.sin(startAngle) * innerRadius * yDirection
            }
            const innerEnd = {
                x: center.x + Math.cos(endAngle) * innerRadius,
                y: center.y + Math.sin(endAngle) * innerRadius * yDirection
            }

            PcbScene3dCopperFactory.#appendQuadTriangles(
                positions,
                outerStart,
                outerEnd,
                innerEnd,
                innerStart,
                z
            )
            PcbScene3dCopperFactory.#appendBoundarySideTriangles(
                positions,
                outerStart,
                outerEnd,
                z
            )
            PcbScene3dCopperFactory.#appendBoundarySideTriangles(
                positions,
                innerEnd,
                innerStart,
                z
            )
        }

        if (!isFullCircle) {
            const sweepDirection = deltaAngleRad < 0 ? -1 : 1
            const startTangent = PcbScene3dCopperFactory.#resolveArcTangent(
                startAngleRad,
                yDirection,
                sweepDirection
            )
            const endTangent = PcbScene3dCopperFactory.#resolveArcTangent(
                startAngleRad + deltaAngleRad,
                yDirection,
                sweepDirection
            )

            PcbScene3dCopperFactory.#appendRoundCapTriangles(
                positions,
                {
                    x: center.x + Math.cos(startAngleRad) * radius,
                    y: center.y + Math.sin(startAngleRad) * radius * yDirection
                },
                strokeWidth / 2,
                z,
                -startTangent.x,
                -startTangent.y
            )
            PcbScene3dCopperFactory.#appendRoundCapTriangles(
                positions,
                {
                    x:
                        center.x +
                        Math.cos(startAngleRad + deltaAngleRad) * radius,
                    y:
                        center.y +
                        Math.sin(startAngleRad + deltaAngleRad) *
                            radius *
                            yDirection
                },
                strokeWidth / 2,
                z,
                endTangent.x,
                endTangent.y
            )
        }
    }

    /**
     * Appends one rectangle as two triangles.
     * @param {number[]} positions
     * @param {{ x: number, y: number }} a
     * @param {{ x: number, y: number }} b
     * @param {{ x: number, y: number }} c
     * @param {{ x: number, y: number }} d
     * @param {number} z
     * @returns {void}
     */
    static #appendQuadTriangles(positions, a, b, c, d, z) {
        PcbScene3dCopperFactory.#appendTriangle(positions, a, b, c, z)
        PcbScene3dCopperFactory.#appendTriangle(positions, a, c, d, z)
    }

    /**
     * Appends one filled circle fan.
     * @param {number[]} positions
     * @param {{ x: number, y: number }} center
     * @param {number} radius
     * @param {number} z
     * @returns {void}
     */
    static #appendDiscTriangles(positions, center, radius, z) {
        const safeRadius = Math.max(Number(radius || 0), 0)
        if (safeRadius <= 0) {
            return
        }

        for (
            let index = 0;
            index < PcbScene3dCopperFactory.#ROUND_CAP_SEGMENTS;
            index += 1
        ) {
            const startAngle =
                (Math.PI * 2 * index) /
                PcbScene3dCopperFactory.#ROUND_CAP_SEGMENTS
            const endAngle =
                (Math.PI * 2 * (index + 1)) /
                PcbScene3dCopperFactory.#ROUND_CAP_SEGMENTS

            PcbScene3dCopperFactory.#appendTriangle(
                positions,
                center,
                {
                    x: center.x + Math.cos(startAngle) * safeRadius,
                    y: center.y + Math.sin(startAngle) * safeRadius
                },
                {
                    x: center.x + Math.cos(endAngle) * safeRadius,
                    y: center.y + Math.sin(endAngle) * safeRadius
                },
                z
            )
            PcbScene3dCopperFactory.#appendBoundarySideTriangles(
                positions,
                {
                    x: center.x + Math.cos(startAngle) * safeRadius,
                    y: center.y + Math.sin(startAngle) * safeRadius
                },
                {
                    x: center.x + Math.cos(endAngle) * safeRadius,
                    y: center.y + Math.sin(endAngle) * safeRadius
                },
                z
            )
        }
    }

    /**
     * Appends only the exposed half of one rounded stroke endpoint.
     * @param {number[]} positions Position buffer.
     * @param {{ x: number, y: number }} center Cap center.
     * @param {number} radius Cap radius.
     * @param {number} z Center Z position.
     * @param {number} outwardX Unit X direction pointing out of the stroke.
     * @param {number} outwardY Unit Y direction pointing out of the stroke.
     * @param {boolean} [includeSideWall] Whether to emit the cap perimeter wall.
     * @returns {void}
     */
    static #appendRoundCapTriangles(
        positions,
        center,
        radius,
        z,
        outwardX,
        outwardY,
        includeSideWall = true
    ) {
        const safeRadius = Math.max(Number(radius || 0), 0)
        const outwardLength = Math.hypot(outwardX, outwardY)
        if (safeRadius <= 0) {
            return
        }
        if (outwardLength <= 0.001) {
            PcbScene3dCopperFactory.#appendDiscTriangles(
                positions,
                center,
                safeRadius,
                z
            )
            return
        }

        const unitX = outwardX / outwardLength
        const unitY = outwardY / outwardLength
        const normalX = -unitY
        const normalY = unitX

        for (
            let index = 0;
            index < PcbScene3dCopperFactory.#ROUND_CAP_SEGMENTS;
            index += 1
        ) {
            const startAngle =
                -Math.PI / 2 +
                (Math.PI * index) / PcbScene3dCopperFactory.#ROUND_CAP_SEGMENTS
            const endAngle =
                -Math.PI / 2 +
                (Math.PI * (index + 1)) /
                    PcbScene3dCopperFactory.#ROUND_CAP_SEGMENTS
            const start = PcbScene3dCopperFactory.#resolveCapPoint(
                center,
                safeRadius,
                unitX,
                unitY,
                normalX,
                normalY,
                startAngle
            )
            const end = PcbScene3dCopperFactory.#resolveCapPoint(
                center,
                safeRadius,
                unitX,
                unitY,
                normalX,
                normalY,
                endAngle
            )

            PcbScene3dCopperFactory.#appendTriangle(
                positions,
                center,
                start,
                end,
                z
            )
            if (includeSideWall) {
                PcbScene3dCopperFactory.#appendBoundarySideTriangles(
                    positions,
                    start,
                    end,
                    z
                )
            }
        }
    }

    /**
     * Resolves one point on an oriented round cap boundary.
     * @param {{ x: number, y: number }} center Cap center.
     * @param {number} radius Cap radius.
     * @param {number} unitX Outward X direction.
     * @param {number} unitY Outward Y direction.
     * @param {number} normalX Cap normal X direction.
     * @param {number} normalY Cap normal Y direction.
     * @param {number} angle Local cap angle.
     * @returns {{ x: number, y: number }}
     */
    static #resolveCapPoint(
        center,
        radius,
        unitX,
        unitY,
        normalX,
        normalY,
        angle
    ) {
        return {
            x:
                center.x +
                unitX * Math.cos(angle) * radius +
                normalX * Math.sin(angle) * radius,
            y:
                center.y +
                unitY * Math.cos(angle) * radius +
                normalY * Math.sin(angle) * radius
        }
    }

    /**
     * Resolves one normalized centerline tangent for an arc endpoint.
     * @param {number} angle Endpoint angle in radians.
     * @param {number} yDirection Mirrored Y direction.
     * @param {number} sweepDirection Arc sweep direction.
     * @returns {{ x: number, y: number }}
     */
    static #resolveArcTangent(angle, yDirection, sweepDirection) {
        return {
            x: -Math.sin(angle) * sweepDirection,
            y: Math.cos(angle) * yDirection * sweepDirection
        }
    }

    /**
     * Normalizes one board point and optionally mirrors it around the local
     * X axis so underside copper keeps its world position after the face flip
     * rotates it below the board.
     * @param {(x: number, y: number) => { x: number, y: number }} normalizeBoardPoint
     * @param {number} x
     * @param {number} y
     * @param {boolean} mirrorY
     * @returns {{ x: number, y: number }}
     */
    static #normalizePoint(normalizeBoardPoint, x, y, mirrorY) {
        const point = normalizeBoardPoint(x, y)

        return {
            x: point.x,
            y: mirrorY ? -point.y : point.y
        }
    }

    /**
     * Appends one shallow triangular prism into the position buffer.
     * @param {number[]} positions Position buffer.
     * @param {{ x: number, y: number }} a First point.
     * @param {{ x: number, y: number }} b Second point.
     * @param {{ x: number, y: number }} c Third point.
     * @param {number} z Center Z position.
     * @returns {void}
     */
    static #appendTriangle(positions, a, b, c, z) {
        const halfThickness = PcbScene3dCopperFactory.#COPPER_THICKNESS_MIL / 2
        const topZ = z + halfThickness
        const bottomZ = z - halfThickness

        positions.push(
            a.x,
            a.y,
            topZ,
            b.x,
            b.y,
            topZ,
            c.x,
            c.y,
            topZ,
            c.x,
            c.y,
            bottomZ,
            b.x,
            b.y,
            bottomZ,
            a.x,
            a.y,
            bottomZ
        )
    }

    /**
     * Appends a side wall for one actual copper boundary edge.
     * @param {number[]} positions Position buffer.
     * @param {{ x: number, y: number }} start Wall start point.
     * @param {{ x: number, y: number }} end Wall end point.
     * @param {number} z Center Z position.
     * @returns {void}
     */
    static #appendBoundarySideTriangles(positions, start, end, z) {
        const halfThickness = PcbScene3dCopperFactory.#COPPER_THICKNESS_MIL / 2
        const topZ = z + halfThickness
        const bottomZ = z - halfThickness

        positions.push(
            start.x,
            start.y,
            topZ,
            end.x,
            end.y,
            topZ,
            end.x,
            end.y,
            bottomZ,
            start.x,
            start.y,
            topZ,
            end.x,
            end.y,
            bottomZ,
            start.x,
            start.y,
            bottomZ
        )
    }
}
