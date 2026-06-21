/**
 * Repairs loaded external-model placements using normalized scene metadata.
 */
export class PcbScene3dExternalModelPlacementRepair {
    static #DARK_COLORS = new Set([
        '#000000',
        '#0a0a0a',
        '#111111',
        '#1a1a1a',
        '#1c1c1c',
        '#262626',
        '#2d2d2d',
        '#333333',
        '#3f3f3f'
    ])
    static #MIN_CENTER_ERROR_MIL = 1
    static #MIN_TERMINAL_SIZE_MIL = 1
    static #SOURCE_ORIGIN_SHIFT_EPSILON_MIL = 0.01
    static #SOURCE_Z_DEPTH_MIN_RATIO = 1.5
    static #TERMINAL_PAD_DISTANCE_RATIO = 1.15

    /**
     * Applies placement repairs that need the final scene-graph parent frame.
     * @param {any} THREE Three.js namespace.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static apply(THREE, sceneDescription, placement, placementGroup) {
        if (
            !THREE ||
            !placementGroup ||
            !PcbScene3dExternalModelPlacementRepair.#isAltiumScene(
                sceneDescription
            )
        ) {
            return
        }

        PcbScene3dExternalModelPlacementRepair.#repairEmbeddedDepthAxisShift(
            placement,
            placementGroup
        )
        PcbScene3dExternalModelPlacementRepair.#repairEmbeddedHalfTurnSourceOriginShift(
            placement,
            placementGroup
        )
        PcbScene3dExternalModelPlacementRepair.#repairAsymmetricLeadYaw(
            THREE,
            sceneDescription,
            placement,
            placementGroup
        )
        PcbScene3dExternalModelPlacementRepair.#repairPadFallbackCenter(
            THREE,
            sceneDescription,
            placement,
            placementGroup
        )
    }

    /**
     * Clones material instances below one placement root.
     * @param {any} rootObject Placement root object.
     * @returns {void}
     */
    static isolatePlacementMaterials(rootObject) {
        PcbScene3dExternalModelPlacementRepair.#visitObjects(
            rootObject,
            (object) => {
                if (!object?.material) {
                    return
                }

                object.material = Array.isArray(object.material)
                    ? object.material.map((material) =>
                          PcbScene3dExternalModelPlacementRepair.#cloneMaterial(
                              material
                          )
                      )
                    : PcbScene3dExternalModelPlacementRepair.#cloneMaterial(
                          object.material
                      )
            }
        )
    }

    /**
     * Removes the generic embedded-source Y shift when source Z is depth.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static #repairEmbeddedDepthAxisShift(placement, placementGroup) {
        const modelGroup =
            PcbScene3dExternalModelPlacementRepair.#findAdjustmentModelGroup(
                placementGroup
            )
        const bounds = modelGroup?.userData?.scene3dSourceBoundsMil || null
        if (
            !modelGroup?.position ||
            !PcbScene3dExternalModelPlacementRepair.#usesEmbeddedDepthAxisShift(
                placement,
                bounds
            )
        ) {
            return
        }

        const authoredY =
            PcbScene3dExternalModelPlacementRepair.#resolveModelOffsetY(
                placement
            )
        const sourceShiftY = Number(bounds.centerZ || 0) * 2
        const currentY = Number(modelGroup.position.y || 0)
        if (
            Math.abs(currentY - (authoredY + sourceShiftY)) >
            PcbScene3dExternalModelPlacementRepair
                .#SOURCE_ORIGIN_SHIFT_EPSILON_MIL
        ) {
            return
        }

        modelGroup.position.y = authoredY
        modelGroup.userData.scene3dDepthAxisShiftMil = sourceShiftY
        modelGroup.updateMatrixWorld?.(true)
    }

    /**
     * Applies mirrored Y source-origin correction for half-turn package models.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static #repairEmbeddedHalfTurnSourceOriginShift(placement, placementGroup) {
        const modelGroup =
            PcbScene3dExternalModelPlacementRepair.#findAdjustmentModelGroup(
                placementGroup
            )
        const bounds = modelGroup?.userData?.scene3dSourceBoundsMil || null
        if (
            !modelGroup?.position ||
            !PcbScene3dExternalModelPlacementRepair.#usesEmbeddedHalfTurnSourceOriginShift(
                placement,
                bounds
            )
        ) {
            return
        }

        const authoredY =
            PcbScene3dExternalModelPlacementRepair.#resolveModelOffsetY(
                placement
            )
        const sourceShiftY = Number(bounds.centerY || 0) * 2
        const currentY = Number(modelGroup.position.y || 0)
        if (
            Math.abs(currentY - authoredY) >
            PcbScene3dExternalModelPlacementRepair
                .#SOURCE_ORIGIN_SHIFT_EPSILON_MIL
        ) {
            return
        }

        modelGroup.position.y = authoredY + sourceShiftY
        modelGroup.userData.scene3dHalfTurnSourceOriginShiftMil = sourceShiftY
        modelGroup.updateMatrixWorld?.(true)
    }

    /**
     * Checks whether a half-turn embedded model needs mirrored source Y.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null} bounds Source model bounds in mil.
     * @returns {boolean}
     */
    static #usesEmbeddedHalfTurnSourceOriginShift(placement, bounds) {
        const rotation = placement?.modelTransform?.rotationDeg || {}
        const centerX = Number(bounds?.centerX || 0)
        const centerY = Number(bounds?.centerY || 0)
        const sizeX = Math.abs(Number(bounds?.sizeX || 0))
        const sizeY = Math.abs(Number(bounds?.sizeY || 0))
        const sizeZ = Math.abs(Number(bounds?.sizeZ || 0))
        const maxDimension = Math.max(sizeX, sizeY, sizeZ)

        return (
            String(placement?.externalModel?.origin || '').toLowerCase() ===
                'embedded' &&
            PcbScene3dExternalModelPlacementRepair.#normalizeAngle(
                rotation.x
            ) === 180 &&
            Number.isFinite(centerX) &&
            Number.isFinite(centerY) &&
            Number.isFinite(sizeX) &&
            Number.isFinite(sizeY) &&
            Number.isFinite(sizeZ) &&
            maxDimension > 0 &&
            Math.abs(centerY) >
                PcbScene3dExternalModelPlacementRepair
                    .#SOURCE_ORIGIN_SHIFT_EPSILON_MIL &&
            Math.abs(centerX) <= maxDimension * 0.25 &&
            Math.abs(centerY) <= maxDimension * 0.25
        )
    }

    /**
     * Checks whether source-origin correction is acting on connector depth.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null} bounds Source model bounds in mil.
     * @returns {boolean}
     */
    static #usesEmbeddedDepthAxisShift(placement, bounds) {
        const rotation = placement?.modelTransform?.rotationDeg || {}
        const centerX = Number(bounds?.centerX || 0)
        const centerZ = Number(bounds?.centerZ || 0)
        const sizeX = Math.abs(Number(bounds?.sizeX || 0))
        const sizeY = Math.abs(Number(bounds?.sizeY || 0))
        const sizeZ = Math.abs(Number(bounds?.sizeZ || 0))
        const maxDimension = Math.max(sizeX, sizeY, sizeZ)

        return (
            String(placement?.externalModel?.origin || '').toLowerCase() ===
                'embedded' &&
            PcbScene3dExternalModelPlacementRepair.#normalizeAngle(
                rotation.x
            ) === 270 &&
            Number.isFinite(centerX) &&
            Number.isFinite(centerZ) &&
            Number.isFinite(sizeX) &&
            Number.isFinite(sizeY) &&
            Number.isFinite(sizeZ) &&
            maxDimension > 0 &&
            sizeY > 0 &&
            Math.abs(centerX) <= maxDimension * 0.2 &&
            Math.abs(centerZ) > maxDimension * 0.2 &&
            sizeZ >
                sizeY *
                    PcbScene3dExternalModelPlacementRepair
                        .#SOURCE_Z_DEPTH_MIN_RATIO &&
            sizeX >
                sizeY *
                    PcbScene3dExternalModelPlacementRepair
                        .#SOURCE_Z_DEPTH_MIN_RATIO
        )
    }

    /**
     * Repairs 180-degree yaw mistakes on asymmetric five-lead packages.
     * @param {any} THREE Three.js namespace.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static #repairAsymmetricLeadYaw(
        THREE,
        sceneDescription,
        placement,
        placementGroup
    ) {
        if (
            !PcbScene3dExternalModelPlacementRepair.#isAsymmetricLeadCandidate(
                sceneDescription,
                placement
            ) ||
            !placementGroup?.rotation
        ) {
            return
        }

        const pads = PcbScene3dExternalModelPlacementRepair.#resolvePads(
            sceneDescription,
            placement
        )
        if (pads.length !== 5) {
            return
        }

        const center = PcbScene3dExternalModelPlacementRepair.#centerOf(pads)
        const padSide = PcbScene3dExternalModelPlacementRepair.#dominantSide(
            pads,
            center
        )
        if (!padSide) {
            return
        }

        placementGroup.updateMatrixWorld?.(true)
        const terminalPoints =
            PcbScene3dExternalModelPlacementRepair.#resolveTerminalPoints(
                THREE,
                placementGroup,
                pads
            )
        const terminalSide =
            PcbScene3dExternalModelPlacementRepair.#dominantSide(
                terminalPoints,
                center
            )
        if (
            terminalSide &&
            terminalSide.side ===
                PcbScene3dExternalModelPlacementRepair.#oppositeSide(
                    padSide.side
                )
        ) {
            placementGroup.rotation.z += Math.PI
            placementGroup.userData.scene3dAsymmetricLeadYawRepair = true
            placementGroup.updateMatrixWorld?.(true)
        }
    }

    /**
     * Checks whether one placement has enough context for SOT-like repair.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static #isAsymmetricLeadCandidate(sceneDescription, placement) {
        const component =
            PcbScene3dExternalModelPlacementRepair.#resolveComponent(
                sceneDescription,
                placement
            )
        const family = String(component?.body?.family || '').toLowerCase()

        return (
            String(placement?.projection?.source || '').toLowerCase() ===
                'pad-fallback' && family === 'sot'
        )
    }

    /**
     * Re-centers pad-fallback models after package yaw correction.
     * @param {any} THREE Three.js namespace.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static #repairPadFallbackCenter(
        THREE,
        sceneDescription,
        placement,
        placementGroup
    ) {
        const component =
            PcbScene3dExternalModelPlacementRepair.#resolveComponent(
                sceneDescription,
                placement
            )
        if (
            !component ||
            !placementGroup?.position ||
            String(placement?.projection?.source || '').toLowerCase() !==
                'pad-fallback' ||
            !THREE?.Box3
        ) {
            return
        }

        placementGroup.parent?.updateWorldMatrix?.(true, false)
        placementGroup.updateMatrixWorld?.(true)
        const bounds = new THREE.Box3().setFromObject(placementGroup)
        if (bounds.isEmpty()) {
            return
        }

        const center = PcbScene3dExternalModelPlacementRepair.#toParentFrame(
            THREE,
            bounds.getCenter(new THREE.Vector3()),
            placementGroup
        )
        const target = component.positionMil || {}
        const dx = Number(target.x || 0) - center.x
        const dy = Number(target.y || 0) - center.y
        if (
            Math.hypot(dx, dy) <
            PcbScene3dExternalModelPlacementRepair.#MIN_CENTER_ERROR_MIL
        ) {
            return
        }

        placementGroup.position.x += dx
        placementGroup.position.y += dy
        placementGroup.userData.scene3dPadFallbackCenterRepair = true
        placementGroup.updateMatrixWorld?.(true)
    }

    /**
     * Converts a world-space point into the placement parent frame.
     * @param {any} THREE Three.js namespace.
     * @param {any} center World-space center.
     * @param {any} placementGroup Rendered placement root.
     * @returns {any}
     */
    static #toParentFrame(THREE, center, placementGroup) {
        const parent = placementGroup?.parent
        if (!THREE?.Matrix4 || !parent?.matrixWorld) {
            return center
        }

        return center.applyMatrix4(
            new THREE.Matrix4().copy(parent.matrixWorld).invert()
        )
    }

    /**
     * Resolves nearby surface pads in scene-local coordinates.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {{ x: number, y: number, width: number, depth: number }[]}
     */
    static #resolvePads(sceneDescription, placement) {
        const pads = Array.isArray(sceneDescription?.detail?.pads)
            ? sceneDescription.detail.pads
            : []
        const component =
            PcbScene3dExternalModelPlacementRepair.#resolveComponent(
                sceneDescription,
                placement
            )
        const position = placement?.positionMil || component?.positionMil || {}
        const centerX = Number(sceneDescription?.board?.centerX || 0)
        const centerY = Number(sceneDescription?.board?.centerY || 0)
        const maxDistance =
            PcbScene3dExternalModelPlacementRepair.#resolveSearchRadius(
                component
            )
        const isBottom =
            String(placement?.mountSide || '').toLowerCase() === 'bottom'

        const normalizedPads = pads
            .map((pad) =>
                PcbScene3dExternalModelPlacementRepair.#normalizePad(
                    pad,
                    centerX,
                    centerY,
                    isBottom
                )
            )
            .filter(Boolean)
        const ownerGroup =
            PcbScene3dExternalModelPlacementRepair.#nearestFivePadOwnerGroup(
                normalizedPads,
                position,
                maxDistance
            )
        if (ownerGroup) {
            return ownerGroup
        }

        return normalizedPads.filter(
            (pad) =>
                Math.hypot(
                    pad.x - Number(position.x || 0),
                    pad.y - Number(position.y || 0)
                ) <= maxDistance
        )
    }

    /**
     * Finds a five-pad owner group centered on the placement.
     * @param {object[]} pads Normalized pads.
     * @param {object} position Placement position.
     * @param {number} maxDistance Maximum group-center distance.
     * @returns {object[] | null}
     */
    static #nearestFivePadOwnerGroup(pads, position, maxDistance) {
        const groups = new Map()
        pads.forEach((pad) => {
            const key = String(pad.componentIndex ?? 'unowned')
            if (!groups.has(key)) {
                groups.set(key, [])
            }
            groups.get(key)?.push(pad)
        })

        const candidates = [...groups.values()]
            .filter((group) => group.length === 5)
            .map((group) => ({
                pads: group,
                distance:
                    PcbScene3dExternalModelPlacementRepair.#distanceToPosition(
                        PcbScene3dExternalModelPlacementRepair.#centerOf(group),
                        position
                    )
            }))
            .filter((candidate) => candidate.distance <= maxDistance)
            .sort((left, right) => left.distance - right.distance)

        return candidates[0]?.pads || null
    }

    /**
     * Measures a point's distance to a placement position.
     * @param {{ x: number, y: number }} point Point.
     * @param {object} position Placement position.
     * @returns {number}
     */
    static #distanceToPosition(point, position) {
        return Math.hypot(
            point.x - Number(position.x || 0),
            point.y - Number(position.y || 0)
        )
    }

    /**
     * Resolves the local search radius for one small package.
     * @param {object | null} component Scene component.
     * @returns {number}
     */
    static #resolveSearchRadius(component) {
        const size = component?.body?.sizeMil || {}
        const span = Math.max(Number(size.width || 0), Number(size.depth || 0))

        return Math.max(70, Math.min(180, span * 0.75 || 90))
    }

    /**
     * Converts one source pad to scene-local surface-pad geometry.
     * @param {object} pad Source pad.
     * @param {number} centerX Board center X.
     * @param {number} centerY Board center Y.
     * @param {boolean} isBottom Whether bottom pads are needed.
     * @returns {{ x: number, y: number, width: number, depth: number, componentIndex?: any } | null}
     */
    static #normalizePad(pad, centerX, centerY, isBottom) {
        const hasPaste = isBottom
            ? pad?.hasBottomPasteMaskOpening
            : pad?.hasTopPasteMaskOpening
        const width = Number(
            (isBottom ? pad?.sizeBottomX : pad?.sizeTopX) || pad?.sizeMidX || 0
        )
        const depth = Number(
            (isBottom ? pad?.sizeBottomY : pad?.sizeTopY) || pad?.sizeMidY || 0
        )
        if (!hasPaste || width <= 0 || depth <= 0) {
            return null
        }

        return {
            x: Number(pad?.x || 0) - centerX,
            y: Number(pad?.y || 0) - centerY,
            width,
            depth,
            componentIndex: pad?.componentIndex
        }
    }

    /**
     * Computes a bounding-box center for point-like records.
     * @param {{ x: number, y: number }[]} points Points.
     * @returns {{ x: number, y: number }}
     */
    static #centerOf(points) {
        const xs = points.map((point) => Number(point.x || 0))
        const ys = points.map((point) => Number(point.y || 0))

        return {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2
        }
    }

    /**
     * Resolves the side that has more points than its opposite side.
     * @param {{ x: number, y: number }[]} points Points.
     * @param {{ x: number, y: number }} center Center.
     * @returns {{ side: string, count: number } | null}
     */
    static #dominantSide(points, center) {
        if (!Array.isArray(points) || !points.length) {
            return null
        }

        const counts = { left: 0, right: 0, top: 0, bottom: 0 }
        points.forEach((point) => {
            const dx = Number(point.x || 0) - center.x
            const dy = Number(point.y || 0) - center.y
            if (Math.abs(dx) >= Math.abs(dy)) {
                counts[dx < 0 ? 'left' : 'right'] += 1
            } else {
                counts[dy < 0 ? 'bottom' : 'top'] += 1
            }
        })

        const [side, count] = Object.entries(counts).sort(
            (left, right) => right[1] - left[1]
        )[0]
        const opposite =
            counts[PcbScene3dExternalModelPlacementRepair.#oppositeSide(side)]

        return count > opposite ? { side, count } : null
    }

    /**
     * Resolves the opposite side label.
     * @param {string} side Side label.
     * @returns {string}
     */
    static #oppositeSide(side) {
        return (
            {
                left: 'right',
                right: 'left',
                top: 'bottom',
                bottom: 'top'
            }[side] || ''
        )
    }

    /**
     * Finds terminal-like model pieces near pad centers.
     * @param {any} THREE Three.js namespace.
     * @param {any} placementGroup Rendered placement group.
     * @param {{ x: number, y: number, width: number, depth: number }[]} pads Pads.
     * @returns {{ x: number, y: number }[]}
     */
    static #resolveTerminalPoints(THREE, placementGroup, pads) {
        const tolerance = Math.max(
            12,
            Math.max(...pads.map((pad) => Math.max(pad.width, pad.depth))) *
                PcbScene3dExternalModelPlacementRepair
                    .#TERMINAL_PAD_DISTANCE_RATIO
        )

        return PcbScene3dExternalModelPlacementRepair.#connectedBoxes(
            THREE,
            placementGroup
        )
            .filter((box) =>
                PcbScene3dExternalModelPlacementRepair.#isTerminalBox(
                    box,
                    pads,
                    tolerance
                )
            )
            .map((box) => ({ x: box.center.x, y: box.center.y }))
    }

    /**
     * Checks whether one connected model box is a terminal near a pad.
     * @param {object} box Connected box.
     * @param {object[]} pads Pads.
     * @param {number} tolerance Maximum terminal-pad distance.
     * @returns {boolean}
     */
    static #isTerminalBox(box, pads, tolerance) {
        const color = String(box.color || '').toLowerCase()
        const nearPad = pads.some(
            (pad) =>
                Math.hypot(box.center.x - pad.x, box.center.y - pad.y) <=
                tolerance
        )

        return (
            nearPad &&
            !PcbScene3dExternalModelPlacementRepair.#DARK_COLORS.has(color) &&
            box.size.x >
                PcbScene3dExternalModelPlacementRepair.#MIN_TERMINAL_SIZE_MIL &&
            box.size.y >
                PcbScene3dExternalModelPlacementRepair.#MIN_TERMINAL_SIZE_MIL
        )
    }

    /**
     * Builds connected bounding boxes for mesh material groups.
     * @param {any} THREE Three.js namespace.
     * @param {any} root Root object.
     * @returns {object[]}
     */
    static #connectedBoxes(THREE, root) {
        const boxes = []
        root.traverse?.((child) => {
            if (!child?.isMesh || !child.geometry?.attributes?.position) {
                return
            }

            const geometry = child.geometry
            const groups = geometry.groups?.length
                ? geometry.groups
                : [
                      {
                          start: 0,
                          count:
                              geometry.index?.count ||
                              geometry.attributes.position.count,
                          materialIndex: 0
                      }
                  ]
            groups.forEach((group) => {
                boxes.push(
                    ...PcbScene3dExternalModelPlacementRepair.#connectedGroupBoxes(
                        THREE,
                        child,
                        group
                    )
                )
            })
        })

        return boxes
    }

    /**
     * Builds connected boxes for one mesh group.
     * @param {any} THREE Three.js namespace.
     * @param {any} mesh Mesh.
     * @param {object} group Geometry group.
     * @returns {object[]}
     */
    static #connectedGroupBoxes(THREE, mesh, group) {
        const geometry = mesh.geometry
        const position = geometry.attributes.position
        const index = geometry.index
        const start = Number(group.start || 0)
        const count = Number(
            group.count || (index ? index.count : position.count)
        )
        const parent = new Map()
        const vertices = new Set()

        PcbScene3dExternalModelPlacementRepair.#visitTriangles(
            index,
            position,
            start,
            count,
            (a, b, c) => {
                vertices.add(a)
                vertices.add(b)
                vertices.add(c)
                PcbScene3dExternalModelPlacementRepair.#union(parent, a, b)
                PcbScene3dExternalModelPlacementRepair.#union(parent, b, c)
            }
        )

        const groups = new Map()
        vertices.forEach((vertex) => {
            const root = PcbScene3dExternalModelPlacementRepair.#find(
                parent,
                vertex
            )
            if (!groups.has(root)) {
                groups.set(root, [])
            }
            groups.get(root)?.push(vertex)
        })

        return [...groups.values()].map((groupVertices) =>
            PcbScene3dExternalModelPlacementRepair.#boxForVertices(
                THREE,
                mesh,
                group,
                groupVertices
            )
        )
    }

    /**
     * Visits triangle vertex indexes for one geometry group.
     * @param {any} index Geometry index.
     * @param {any} position Position attribute.
     * @param {number} start Start index.
     * @param {number} count Index count.
     * @param {(a: number, b: number, c: number) => void} visitor Visitor.
     * @returns {void}
     */
    static #visitTriangles(index, position, start, count, visitor) {
        if (index) {
            for (
                let i = start;
                i + 2 < start + count && i + 2 < index.count;
                i += 3
            ) {
                visitor(index.getX(i), index.getX(i + 1), index.getX(i + 2))
            }
            return
        }

        for (
            let i = start;
            i + 2 < start + count && i + 2 < position.count;
            i += 3
        ) {
            visitor(i, i + 1, i + 2)
        }
    }

    /**
     * Resolves a union-find root.
     * @param {Map<number, number>} parent Parent map.
     * @param {number} value Vertex index.
     * @returns {number}
     */
    static #find(parent, value) {
        if (!parent.has(value)) {
            parent.set(value, value)
            return value
        }

        let root = parent.get(value)
        while (root !== parent.get(root)) {
            root = parent.get(root)
        }

        return root
    }

    /**
     * Unions two vertex indexes.
     * @param {Map<number, number>} parent Parent map.
     * @param {number} first First vertex.
     * @param {number} second Second vertex.
     * @returns {void}
     */
    static #union(parent, first, second) {
        const firstRoot = PcbScene3dExternalModelPlacementRepair.#find(
            parent,
            first
        )
        const secondRoot = PcbScene3dExternalModelPlacementRepair.#find(
            parent,
            second
        )
        if (firstRoot !== secondRoot) {
            parent.set(secondRoot, firstRoot)
        }
    }

    /**
     * Builds one world-space box for connected vertices.
     * @param {any} THREE Three.js namespace.
     * @param {any} mesh Mesh.
     * @param {object} group Geometry group.
     * @param {number[]} vertices Vertex indexes.
     * @returns {object}
     */
    static #boxForVertices(THREE, mesh, group, vertices) {
        const position = mesh.geometry.attributes.position
        const box = new THREE.Box3()
        const point = new THREE.Vector3()

        vertices.forEach((vertex) => {
            point.fromBufferAttribute(position, vertex)
            mesh.localToWorld(point)
            box.expandByPoint(point)
        })

        const center = new THREE.Vector3()
        const size = new THREE.Vector3()
        box.getCenter(center)
        box.getSize(size)

        return {
            center,
            size,
            color: PcbScene3dExternalModelPlacementRepair.#materialColor(
                mesh,
                group
            )
        }
    }

    /**
     * Resolves a material color as a normalized hex string.
     * @param {any} mesh Mesh.
     * @param {object} group Geometry group.
     * @returns {string}
     */
    static #materialColor(mesh, group) {
        const material = Array.isArray(mesh.material)
            ? mesh.material[group.materialIndex || 0]
            : mesh.material

        return material?.color?.getHexString
            ? '#' + material.color.getHexString()
            : ''
    }

    /**
     * Finds the scene component for one external placement.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {object | null}
     */
    static #resolveComponent(sceneDescription, placement) {
        const designator = String(placement?.designator || '').trim()
        if (!designator || !Array.isArray(sceneDescription?.components)) {
            return null
        }

        return (
            sceneDescription.components.find(
                (component) =>
                    String(component?.designator || '').trim() === designator
            ) || null
        )
    }

    /**
     * Finds the loaded model child below a placement adjustment target.
     * @param {any} rootObject Placement root object.
     * @returns {any | null}
     */
    static #findAdjustmentModelGroup(rootObject) {
        let adjustmentGroup = null
        PcbScene3dExternalModelPlacementRepair.#visitObjects(
            rootObject,
            (object) => {
                if (
                    !adjustmentGroup &&
                    object?.userData?.scene3dAdjustmentTarget
                ) {
                    adjustmentGroup = object
                }
            }
        )

        return adjustmentGroup?.children?.[0] || null
    }

    /**
     * Visits every object below a root.
     * @param {any} rootObject Root object.
     * @param {(object: any) => void} visitor Object visitor.
     * @returns {void}
     */
    static #visitObjects(rootObject, visitor) {
        if (!rootObject) {
            return
        }

        visitor(rootObject)
        ;(Array.isArray(rootObject.children)
            ? rootObject.children
            : []
        ).forEach((child) =>
            PcbScene3dExternalModelPlacementRepair.#visitObjects(child, visitor)
        )
    }

    /**
     * Clones one material if supported.
     * @param {any} material Source material.
     * @returns {any}
     */
    static #cloneMaterial(material) {
        return typeof material?.clone === 'function'
            ? material.clone()
            : material
    }

    /**
     * Resolves authored model Y offset from current and legacy transform shapes.
     * @param {object | null | undefined} placement Current placement.
     * @returns {number}
     */
    static #resolveModelOffsetY(placement) {
        const offsetMil = placement?.modelTransform?.offsetMil || {}

        return Number(offsetMil.y ?? placement?.modelTransform?.dyMil ?? 0)
    }

    /**
     * Normalizes one angle into [0, 360).
     * @param {number | string | undefined} angle Source angle.
     * @returns {number}
     */
    static #normalizeAngle(angle) {
        const normalized = Number(angle || 0) % 360

        return normalized < 0 ? normalized + 360 : normalized
    }

    /**
     * Checks whether one scene was parsed from Altium sources.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {boolean}
     */
    static #isAltiumScene(sceneDescription) {
        return (
            String(sceneDescription?.sourceFormat || '')
                .trim()
                .toLowerCase() === 'altium'
        )
    }
}
