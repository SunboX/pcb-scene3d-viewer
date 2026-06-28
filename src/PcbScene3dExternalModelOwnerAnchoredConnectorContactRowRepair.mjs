/**
 * Aligns owner-anchored connector model-bounds bodies to their owned contact
 * pad row when the embedded STEP origin is biased away from the solder tails.
 */
export class PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair {
    static #SOURCE_ROW_BUCKET_MIL = 5
    static #SOURCE_ROW_WINDOW_MIL = 90
    static #SOURCE_ROW_MIN_SPAN_MIL = 80
    static #SOURCE_ROW_MAX_PAD_SPAN_RATIO = 1.4
    static #SOURCE_ROW_MAX_EXTRA_SPAN_MIL = 80
    static #SOURCE_ROW_MIN_POINTS_PER_PAD = 2
    static #MIN_CONTACT_PAD_COUNT = 3
    static #MIN_REPAIR_OFFSET_MIL = 0.01
    static #CONTACT_PAD_MARGIN_MIL = 8
    static #CONTACT_PAD_MIN_VERTEX_COUNT = 6
    static #CONTACT_PAD_MIN_OFFSET_MIL = 0.5
    static #CONNECTOR_OWNER_PATTERN =
        /(?:^|[^a-z0-9])(?:conn|connector|flex|fpc|header|jack|jtag|pinheader|pin\s*header|socket|terminal|usb)(?:$|[^a-z0-9])/i

    /**
     * Applies contact-row repair to one rendered placement.
     * @param {any} THREE Three.js namespace.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static apply(THREE, sceneDescription, placement, placementGroup) {
        const modelGroup =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#findAdjustmentModelGroup(
                placementGroup
            )
        const context =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#resolveContactContext(
                sceneDescription,
                placement
            )
        if (
            !modelGroup?.position ||
            !PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#isCandidate(
                sceneDescription,
                placement,
                context
            )
        ) {
            return
        }

        const sourceContactCenter =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#sourceContactRowCenter(
                modelGroup,
                context
            )
        if (!sourceContactCenter) {
            return
        }

        const offset =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#contactRowOffset(
                modelGroup,
                sourceContactCenter,
                context.targetLocal
            )
        if (
            Math.hypot(offset.x, offset.y) <=
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                .#MIN_REPAIR_OFFSET_MIL
        ) {
            return
        }

        modelGroup.position.x += offset.x
        modelGroup.position.y += offset.y
        modelGroup.userData.scene3dOwnerAnchoredConnectorContactRowOffsetMil =
            offset
        modelGroup.userData.scene3dOwnerAnchoredConnectorContactRowRepair = true
        placementGroup.userData.scene3dOwnerAnchoredConnectorContactRowOffsetMil =
            offset
        placementGroup.userData.scene3dOwnerAnchoredConnectorContactRowRepair = true
        modelGroup.updateMatrixWorld?.(true)
        placementGroup.updateMatrixWorld?.(true)
        PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#seatContactRowOnMountPlane(
            THREE,
            modelGroup,
            context,
            placementGroup
        )
    }

    /**
     * Checks whether one placement has the specific owner-anchored connector
     * shape that needs loaded source contact-row alignment.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null} context Contact-row context.
     * @returns {boolean}
     */
    static #isCandidate(sceneDescription, placement, context) {
        return (
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#isAltiumScene(
                sceneDescription
            ) &&
            String(placement?.projection?.source || '').toLowerCase() ===
                'model-bounds' &&
            String(placement?.externalModel?.origin || '').toLowerCase() ===
                'embedded' &&
            Boolean(placement?.modelTransform?.ownerAnchorOffsetMil) &&
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#isConnectorOwner(
                sceneDescription,
                placement
            ) &&
            Boolean(context)
        )
    }

    /**
     * Resolves target local contact coordinates from owned surface pads.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {{ targetLocal: { x: number, y: number }, localPads: { x: number, y: number, radius: number }[], padSpanX: number, padCount: number } | null}
     */
    static #resolveContactContext(sceneDescription, placement) {
        const component =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#resolveComponent(
                sceneDescription,
                placement
            )
        const pads =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#ownedSurfacePads(
                sceneDescription,
                placement,
                component
            )
        if (pads.length < this.#MIN_CONTACT_PAD_COUNT) {
            return null
        }

        const isBottom =
            String(placement?.mountSide || '').toLowerCase() === 'bottom'
        const localPads = pads.map((pad) => {
            const center =
                PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#toPlacementLocal(
                    {
                        x:
                            Number(pad?.x || 0) -
                            Number(sceneDescription?.board?.centerX || 0),
                        y:
                            Number(pad?.y || 0) -
                            Number(sceneDescription?.board?.centerY || 0)
                    },
                    placement
                )
            const size =
                PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#surfacePadSize(
                    pad,
                    isBottom
                )

            return {
                ...center,
                radius:
                    Math.max(size.width, size.depth) / 2 +
                    PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                        .#CONTACT_PAD_MARGIN_MIL
            }
        })
        const xs = localPads.map((pad) => pad.x)
        const ys = localPads.map((pad) => pad.y)

        return {
            targetLocal: {
                x: (Math.min(...xs) + Math.max(...xs)) / 2,
                y: (Math.min(...ys) + Math.max(...ys)) / 2
            },
            localPads,
            padSpanX: Math.max(...xs) - Math.min(...xs),
            padCount: localPads.length
        }
    }

    /**
     * Returns owned surface pads for the placement side.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @param {object | null} component Owning component.
     * @returns {object[]}
     */
    static #ownedSurfacePads(sceneDescription, placement, component) {
        const componentIndex = Number(component?.componentIndex)
        if (!Number.isFinite(componentIndex)) {
            return []
        }

        const isBottom =
            String(placement?.mountSide || '').toLowerCase() === 'bottom'

        return (
            Array.isArray(sceneDescription?.detail?.pads)
                ? sceneDescription.detail.pads
                : []
        ).filter(
            (pad) =>
                Number(pad?.componentIndex) === componentIndex &&
                Boolean(
                    isBottom
                        ? pad?.hasBottomPasteMaskOpening
                        : pad?.hasTopPasteMaskOpening
                ) &&
                PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#hasPadSize(
                    pad,
                    isBottom
                )
        )
    }

    /**
     * Checks whether one pad has side-specific surface geometry.
     * @param {object} pad Source pad.
     * @param {boolean} isBottom Whether bottom paste is being considered.
     * @returns {boolean}
     */
    static #hasPadSize(pad, isBottom) {
        const { width, depth } =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#surfacePadSize(
                pad,
                isBottom
            )

        return width > 0 && depth > 0
    }

    /**
     * Resolves the side-specific surface pad size.
     * @param {object} pad Source pad.
     * @param {boolean} isBottom Whether bottom paste is being considered.
     * @returns {{ width: number, depth: number }}
     */
    static #surfacePadSize(pad, isBottom) {
        return {
            width: Number(
                (isBottom ? pad?.sizeBottomX : pad?.sizeTopX) ||
                    pad?.sizeMidX ||
                    0
            ),
            depth: Number(
                (isBottom ? pad?.sizeBottomY : pad?.sizeTopY) ||
                    pad?.sizeMidY ||
                    0
            )
        }
    }

    /**
     * Converts a scene-local point into the placement-local source frame.
     * @param {{ x: number, y: number }} point Scene-local point.
     * @param {object | null | undefined} placement External placement.
     * @returns {{ x: number, y: number }}
     */
    static #toPlacementLocal(point, placement) {
        const position = placement?.positionMil || {}
        const dx = Number(point?.x || 0) - Number(position?.x || 0)
        const dy = Number(point?.y || 0) - Number(position?.y || 0)
        const rotationRad =
            (-Number(placement?.rotationDeg || 0) * Math.PI) / 180
        const cos = Math.cos(rotationRad)
        const sin = Math.sin(rotationRad)

        return {
            x: dx * cos - dy * sin,
            y: dx * sin + dy * cos
        }
    }

    /**
     * Resolves the repeated source row that represents connector contacts.
     * @param {any} modelGroup Loaded model group.
     * @param {{ padSpanX?: number, padCount?: number }} context Contact context.
     * @returns {{ x: number, y: number } | null}
     */
    static #sourceContactRowCenter(modelGroup, context) {
        const points =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#sourcePointsMil(
                modelGroup
            )
        const significantRows =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#significantSourceRows(
                points,
                context
            )
        if (!significantRows.length) {
            return null
        }

        const highestY = Math.max(...significantRows.map((row) => row.maxY))
        const contactRows = significantRows.filter(
            (row) =>
                row.maxY >=
                highestY -
                    PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                        .#SOURCE_ROW_WINDOW_MIL
        )
        const rowPoints = contactRows.flatMap((row) => row.points)
        const xs = rowPoints.map((point) => point.x)
        const ys = rowPoints.map((point) => point.y)

        return {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2
        }
    }

    /**
     * Collects raw source points in mil from loaded geometry buffers.
     * @param {any} modelGroup Loaded model group.
     * @returns {{ x: number, y: number }[]}
     */
    static #sourcePointsMil(modelGroup) {
        const scaleX = Number(modelGroup?.scale?.x || 1)
        const scaleY = Number(modelGroup?.scale?.y || scaleX || 1)
        const points = []

        modelGroup?.traverse?.((object) => {
            const position = object?.geometry?.attributes?.position
            if (!position || typeof position.getX !== 'function') {
                return
            }

            for (let index = 0; index < position.count; index += 1) {
                points.push({
                    x: Number(position.getX(index) || 0) * scaleX,
                    y: Number(position.getY(index) || 0) * scaleY
                })
            }
        })

        return points
    }

    /**
     * Resolves source rows that span the connector contact width.
     * @param {{ x: number, y: number }[]} points Source points.
     * @param {{ padSpanX?: number, padCount?: number }} context Contact context.
     * @returns {{ minY: number, maxY: number, points: { x: number, y: number }[] }[]}
     */
    static #significantSourceRows(points, context) {
        const bucketSize =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                .#SOURCE_ROW_BUCKET_MIL
        const rows = new Map()

        points.forEach((point) => {
            const key =
                Math.round(Number(point.y || 0) / bucketSize) * bucketSize
            if (!rows.has(key)) {
                rows.set(key, [])
            }
            rows.get(key)?.push(point)
        })

        const padSpanX = Math.abs(Number(context?.padSpanX || 0))
        const minSpan = Math.max(
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                .#SOURCE_ROW_MIN_SPAN_MIL,
            padSpanX * 0.7
        )
        const maxSpan = Math.max(
            minSpan,
            padSpanX *
                PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                    .#SOURCE_ROW_MAX_PAD_SPAN_RATIO,
            padSpanX +
                PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                    .#SOURCE_ROW_MAX_EXTRA_SPAN_MIL
        )
        const minPointCount = Math.max(
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                .#MIN_CONTACT_PAD_COUNT,
            Number(context?.padCount || 0) *
                PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                    .#SOURCE_ROW_MIN_POINTS_PER_PAD
        )

        return [...rows.values()]
            .map((rowPoints) => {
                const xs = rowPoints.map((point) => point.x)
                const ys = rowPoints.map((point) => point.y)

                return {
                    minY: Math.min(...ys),
                    maxY: Math.max(...ys),
                    spanX: Math.max(...xs) - Math.min(...xs),
                    points: rowPoints
                }
            })
            .filter(
                (row) =>
                    row.points.length >= minPointCount &&
                    row.spanX >= minSpan &&
                    row.spanX <= maxSpan
            )
    }

    /**
     * Resolves the local offset that places source contacts on target pads.
     * @param {any} modelGroup Loaded model group.
     * @param {{ x: number, y: number }} sourceContactCenter Source contact center.
     * @param {{ x: number, y: number }} targetLocal Target local pad center.
     * @returns {{ x: number, y: number }}
     */
    static #contactRowOffset(modelGroup, sourceContactCenter, targetLocal) {
        return {
            x:
                Number(targetLocal?.x || 0) -
                (Number(modelGroup?.position?.x || 0) +
                    Number(sourceContactCenter?.x || 0)),
            y:
                Number(targetLocal?.y || 0) -
                (Number(modelGroup?.position?.y || 0) +
                    Number(sourceContactCenter?.y || 0))
        }
    }

    /**
     * Seats the aligned contact row on the mount plane without using sparse
     * connector legs or shell edges as the vertical support.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {{ localPads?: { x: number, y: number, radius: number }[] } | null} context Contact context.
     * @param {any} placementGroup Rendered placement root.
     * @returns {void}
     */
    static #seatContactRowOnMountPlane(
        THREE,
        modelGroup,
        context,
        placementGroup
    ) {
        const values =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#collectContactPadVertexZ(
                THREE,
                modelGroup,
                context?.localPads
            )
        if (
            values.length <
                PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                    .#CONTACT_PAD_MIN_VERTEX_COUNT ||
            !modelGroup?.position
        ) {
            return
        }

        const contactPlane = Math.min(...values)
        const currentContactZ =
            Number(modelGroup.position.z || 0) + Number(contactPlane)
        if (
            !Number.isFinite(contactPlane) ||
            !Number.isFinite(currentContactZ) ||
            Math.abs(currentContactZ) <
                PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair
                    .#CONTACT_PAD_MIN_OFFSET_MIL
        ) {
            return
        }

        modelGroup.position.z = -contactPlane
        modelGroup.userData.scene3dOwnerAnchoredConnectorContactRowSeatingRepair = true
        modelGroup.userData.scene3dOwnerAnchoredConnectorContactRowSeatingOffsetMil =
            -currentContactZ
        placementGroup.userData.scene3dOwnerAnchoredConnectorContactRowSeatingRepair = true
        placementGroup.userData.scene3dOwnerAnchoredConnectorContactRowSeatingOffsetMil =
            -currentContactZ
        modelGroup.updateMatrixWorld?.(true)
        placementGroup.updateMatrixWorld?.(true)
    }

    /**
     * Collects transformed Z values for vertices over owned contact pads.
     * @param {any} THREE Three.js namespace.
     * @param {any} modelGroup Loaded model group.
     * @param {{ x: number, y: number, radius: number }[] | null | undefined} pads Contact pads in placement-local coordinates.
     * @returns {number[]}
     */
    static #collectContactPadVertexZ(THREE, modelGroup, pads) {
        if (
            !THREE?.Vector3 ||
            typeof modelGroup?.traverse !== 'function' ||
            !Array.isArray(pads) ||
            !pads.length
        ) {
            return []
        }

        modelGroup.updateMatrixWorld?.(true)
        modelGroup.parent?.updateMatrixWorld?.(true)
        const currentZ = Number(modelGroup?.position?.z || 0)
        const parentInverse =
            THREE?.Matrix4 && modelGroup.parent?.matrixWorld
                ? new THREE.Matrix4()
                      .copy(modelGroup.parent.matrixWorld)
                      .invert()
                : null
        const vertex = new THREE.Vector3()
        const values = []

        modelGroup.traverse((object) => {
            const position = object?.geometry?.attributes?.position
            if (!position || !object?.matrixWorld) {
                return
            }

            for (
                let index = 0;
                index < Number(position.count || 0);
                index += 1
            ) {
                vertex.fromBufferAttribute(position, index)
                vertex.applyMatrix4(object.matrixWorld)
                if (parentInverse) {
                    vertex.applyMatrix4(parentInverse)
                }
                if (
                    PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#isInsideContactPad(
                        vertex,
                        pads
                    )
                ) {
                    values.push(vertex.z - currentZ)
                }
            }
        })

        return values.filter((value) => Number.isFinite(value))
    }

    /**
     * Checks whether one transformed vertex falls inside a contact pad.
     * @param {{ x?: number, y?: number }} vertex Transformed vertex.
     * @param {{ x: number, y: number, radius: number }[]} pads Contact pads.
     * @returns {boolean}
     */
    static #isInsideContactPad(vertex, pads) {
        return pads.some((pad) => {
            const radius = Math.max(Number(pad?.radius || 0), 0)

            return (
                Math.abs(Number(vertex?.x || 0) - Number(pad?.x || 0)) <=
                    radius &&
                Math.abs(Number(vertex?.y || 0) - Number(pad?.y || 0)) <= radius
            )
        })
    }

    /**
     * Checks whether the owning component describes connector hardware.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @param {object | null | undefined} placement External placement.
     * @returns {boolean}
     */
    static #isConnectorOwner(sceneDescription, placement) {
        const component =
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#resolveComponent(
                sceneDescription,
                placement
            )
        if (
            String(component?.body?.family || '').toLowerCase() === 'connector'
        ) {
            return true
        }

        return PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#CONNECTOR_OWNER_PATTERN.test(
            [
                component?.designator,
                component?.pattern,
                component?.source,
                component?.description,
                ...Object.values(component?.parameters || {}),
                placement?.externalModel?.name,
                placement?.externalModel?.relativePath
            ]
                .map((value) => String(value || ''))
                .join(' ')
        )
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
        PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#visitObjects(
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
            PcbScene3dExternalModelOwnerAnchoredConnectorContactRowRepair.#visitObjects(
                child,
                visitor
            )
        )
    }

    /**
     * Checks whether one scene was parsed from Altium sources.
     * @param {object | null | undefined} sceneDescription Scene description.
     * @returns {boolean}
     */
    static #isAltiumScene(sceneDescription) {
        return String(sceneDescription?.sourceFormat || '')
            .trim()
            .toLowerCase()
            .startsWith('altium')
    }
}
