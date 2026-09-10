import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair as Repair } from '../src/PcbScene3dExternalModelRepeatedOwnerPackageCenterRepair.mjs'
import { PcbScene3dRepeatedOwnerPackageFixture as Fixture } from './helpers/PcbScene3dRepeatedOwnerPackageFixture.mjs'

test('repeated package centering bounds full-board pad scans independently of owner count', () => {
    const scene = Fixture.createScene(60)
    let ownerReads = 0
    for (const pad of scene.detail.pads) {
        const componentIndex = pad.componentIndex
        Object.defineProperty(pad, 'componentIndex', {
            get() {
                ownerReads += 1
                return componentIndex
            }
        })
    }
    for (const placement of scene.externalPlacements) {
        const group = Fixture.createGroup(placement)
        Repair.apply(THREE, scene, structuredClone(placement), group)
        assert.deepEqual(
            group.userData.scene3dRepeatedOwnerModelBoundsCenterOffsetMil,
            { x: -17, y: -11 }
        )
    }
    assert.ok(
        ownerReads <=
            scene.detail.pads.length * scene.externalPlacements.length * 2,
        `owner resolution read ${ownerReads} pad owners for ${scene.detail.pads.length} pads and ${scene.externalPlacements.length} placements`
    )
})

for (const side of ['top', 'bottom']) {
    test(`repeated package centering retains ${side} surface selection and board-relative geometry`, () => {
        const scene = Fixture.createScene(3, side)
        scene.detail.pads.push(
            {
                ...scene.detail.pads[0],
                x: 9000,
                hasTopPasteMaskOpening: side !== 'top',
                hasBottomPasteMaskOpening: side !== 'bottom'
            },
            { ...scene.detail.pads[0], x: NaN },
            { ...scene.detail.pads[0], x: 9000, sizeTopX: 0, sizeBottomX: 0 },
            { ...scene.detail.pads[0], x: 9000, componentIndex: 9000 }
        )
        for (const [index, placement] of scene.externalPlacements.entries()) {
            const group = Fixture.createGroup(placement)
            Repair.apply(THREE, scene, structuredClone(placement), group)
            assert.deepEqual(Fixture.snapshot(group), {
                position: [index * 200, 0, 32],
                minimum: [index * 200 - 50, -40, 22],
                maximum: [index * 200 + 50, 40, 42],
                userData: {
                    scene3dRepeatedOwnerModelBoundsCenterRepair: true,
                    scene3dRepeatedOwnerModelBoundsCenterOffsetMil: {
                        x: -17,
                        y: -11
                    }
                }
            })
        }
    })
}

test('repeated package centering resolves the first component with a trimmed designator', () => {
    const scene = Fixture.createScene()
    scene.components[0].designator = ' U1 '
    scene.components.push({
        designator: 'U1',
        componentIndex: 999,
        body: { family: 'connector' }
    })
    const placement = scene.externalPlacements[0]
    const group = Fixture.createGroup(placement)
    Repair.apply(THREE, scene, placement, group)
    assert.deepEqual(group.position.toArray(), [0, 0, 32])
})

test('repeated package centering observes owner pad edits between applications', () => {
    const scene = Fixture.createScene()
    const placement = scene.externalPlacements[0]
    Repair.apply(THREE, scene, placement, Fixture.createGroup(placement))
    for (const pad of scene.detail.pads) {
        pad.x += 5
    }
    const group = Fixture.createGroup(placement)
    Repair.apply(THREE, scene, placement, group)
    assert.deepEqual(group.position.toArray(), [5, 0, 32])
})

test('repeated package centering retains inconsistent owner anchors', () => {
    const scene = Fixture.createScene()
    scene.externalPlacements[1].positionMil.x += 3
    for (const placement of scene.externalPlacements) {
        const group = Fixture.createGroup(placement)
        const before = Fixture.snapshot(group)
        Repair.apply(THREE, scene, placement, group)
        assert.deepEqual(Fixture.snapshot(group), before)
    }
})

test('repeated package centering matches rendered copies by position', () => {
    const scene = Fixture.createScene()
    const placement = structuredClone(scene.externalPlacements[0])
    placement.positionMil.z += 1
    const group = Fixture.createGroup(placement)
    const before = Fixture.snapshot(group)
    Repair.apply(THREE, scene, placement, group)
    assert.deepEqual(Fixture.snapshot(group), before)
})
