import * as THREE from 'three'

/**
 * Creates synthetic package owners and their independent rendered bodies.
 */
export class PcbScene3dRepeatedOwnerPackageFixture {
    /**
     * Builds repeated packages with an authored offset from their pad centers.
     * @param {number} [ownerCount] Number of package owners.
     * @param {'top' | 'bottom'} [mountSide] Active board side.
     * @returns {object}
     */
    static createScene(ownerCount = 3, mountSide = 'top') {
        const scene = {
            sourceFormat: 'altium',
            board: { centerX: 1000, centerY: -2000 },
            components: [],
            externalPlacements: [],
            detail: { pads: [] }
        }
        for (let index = 0; index < ownerCount; index += 1) {
            const x = (index % 20) * 200
            const y = Math.floor(index / 20) * 200
            const designator = 'U' + (index + 1)
            scene.components.push({
                designator,
                componentIndex: index,
                body: { family: 'generic' }
            })
            scene.externalPlacements.push({
                designator,
                mountSide,
                rotationDeg: 180,
                positionMil: { x: x + 17, y: y + 11, z: 32 },
                projection: {
                    source: 'model-bounds',
                    boundsMil: { width: 100, depth: 80 }
                },
                externalModel: {
                    origin: 'embedded',
                    name: 'fake-package.step',
                    format: 'step'
                }
            })
            for (let padIndex = 0; padIndex < 12; padIndex += 1) {
                scene.detail.pads.push({
                    componentIndex: String(index),
                    x: scene.board.centerX + x + (padIndex % 2 ? 40 : -40),
                    y: scene.board.centerY + y + ((padIndex % 3) - 1) * 30,
                    hasTopPasteMaskOpening: mountSide === 'top',
                    hasBottomPasteMaskOpening: mountSide === 'bottom',
                    sizeTopX: 8,
                    sizeTopY: 8,
                    sizeBottomX: 8,
                    sizeBottomY: 8
                })
            }
        }
        return scene
    }

    /**
     * Builds one independent body at its source anchor.
     * @param {object} placement External placement.
     * @returns {THREE.Group}
     */
    static createGroup(placement) {
        const group = new THREE.Group()
        group.position.set(
            placement.positionMil.x,
            placement.positionMil.y,
            placement.positionMil.z
        )
        group.add(
            new THREE.Mesh(
                new THREE.BoxGeometry(100, 80, 20),
                new THREE.MeshBasicMaterial()
            )
        )
        return group
    }

    /**
     * Captures placement decisions, position, and bounds after a repair.
     * @param {THREE.Group} group Rendered body.
     * @returns {object}
     */
    static snapshot(group) {
        const bounds = new THREE.Box3().setFromObject(group)
        return {
            position: group.position.toArray(),
            minimum: bounds.min.toArray(),
            maximum: bounds.max.toArray(),
            userData: structuredClone(group.userData)
        }
    }
}
