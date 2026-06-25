const LEAD_COLOR = [0.74, 0.73, 0.68]
const PIN_COLOR = [0.82, 0.78, 0.66]
const TERMINAL_COLOR = [0.78, 0.76, 0.7]
const HEADER_PIN_PITCH_MIL = 100
const PUSHBUTTON_PIN_PITCH_MIL = 100
const TO_LEAD_PITCH_MIL = 50
const DUAL_ROW_FAMILIES = new Set(['soic', 'sop', 'ssop', 'tssop', 'msop'])
const QUAD_ROW_FAMILIES = new Set(['qfn', 'qfp', 'tqfp', 'lqfp'])
const PASSIVE_SIZES = new Map([
    ['0201', { width: 24, depth: 12, height: 10 }],
    ['0402', { width: 40, depth: 20, height: 14 }],
    ['0603', { width: 60, depth: 30, height: 18 }],
    ['0805', { width: 80, depth: 50, height: 24 }],
    ['1206', { width: 120, depth: 60, height: 28 }],
    ['1210', { width: 120, depth: 100, height: 34 }],
    ['2512', { width: 250, depth: 120, height: 42 }]
])

/**
 * Builds lightweight component body descriptors from package footprint text.
 */
export class PcbScene3dFootprintBodyBuilder {
    /**
     * Resolves a component body descriptor from component metadata.
     * @param {{ cadComponent?: object | null, component?: object | null, sourceComponent?: object | null, fallbackSizeMil?: object, hasExternalModel?: boolean }} metadata Component metadata.
     * @returns {object}
     */
    static resolveComponentBody(metadata = {}) {
        const fallbackSizeMil = metadata?.fallbackSizeMil || {}
        if (metadata?.hasExternalModel !== true) {
            const footprintBody = PcbScene3dFootprintBodyBuilder.resolve(
                PcbScene3dFootprintBodyBuilder.#footprintText(
                    metadata?.cadComponent,
                    metadata?.component,
                    metadata?.sourceComponent
                ),
                fallbackSizeMil
            )
            if (footprintBody) {
                return footprintBody
            }
        }

        return {
            family: 'chip',
            sizeMil: fallbackSizeMil
        }
    }

    /**
     * Resolves a generated component body descriptor.
     * @param {string} footprintText Source footprint text.
     * @param {{ width?: number, depth?: number, height?: number }} fallbackSizeMil Fallback body size in mils.
     * @returns {{ family: string, sizeMil: { width: number, depth: number, height: number }, footprintModel: object } | null}
     */
    static resolve(footprintText, fallbackSizeMil = {}) {
        const normalized =
            PcbScene3dFootprintBodyBuilder.#normalizeText(footprintText)
        if (!normalized) {
            return null
        }

        return (
            PcbScene3dFootprintBodyBuilder.#passiveBody(
                normalized,
                fallbackSizeMil
            ) ||
            PcbScene3dFootprintBodyBuilder.#dualRowBody(
                normalized,
                fallbackSizeMil
            ) ||
            PcbScene3dFootprintBodyBuilder.#quadRowBody(
                normalized,
                fallbackSizeMil
            ) ||
            PcbScene3dFootprintBodyBuilder.#headerBody(
                normalized,
                fallbackSizeMil
            ) ||
            PcbScene3dFootprintBodyBuilder.#pushbuttonBody(
                normalized,
                fallbackSizeMil
            ) ||
            PcbScene3dFootprintBodyBuilder.#testPointBody(
                normalized,
                fallbackSizeMil
            ) ||
            PcbScene3dFootprintBodyBuilder.#toBody(
                normalized,
                fallbackSizeMil
            ) ||
            PcbScene3dFootprintBodyBuilder.#sotBody(normalized, fallbackSizeMil)
        )
    }

    /**
     * Builds package-local accessory boxes for a footprint-derived body.
     * @param {{ sizeMil?: { width?: number, depth?: number, height?: number }, footprintModel?: object }} body Body descriptor.
     * @returns {{ role: string, index: number, x: number, y: number, z: number, width: number, depth: number, height: number, color: number[] }[]}
     */
    static accessoryBoxes(body) {
        const model = body?.footprintModel || null
        if (!model) {
            return []
        }

        if (model.style === 'dual-row') {
            return PcbScene3dFootprintBodyBuilder.#dualRowLeadBoxes(body)
        }
        if (model.style === 'quad-row') {
            return PcbScene3dFootprintBodyBuilder.#quadRowLeadBoxes(body)
        }
        if (model.style === 'passive-chip') {
            return PcbScene3dFootprintBodyBuilder.#passiveTerminalBoxes(body)
        }
        if (model.style === 'pin-header') {
            return PcbScene3dFootprintBodyBuilder.#headerPinBoxes(body)
        }
        if (model.style === 'pushbutton') {
            return PcbScene3dFootprintBodyBuilder.#pushbuttonPinBoxes(body)
        }
        if (model.style === 'to-package') {
            return PcbScene3dFootprintBodyBuilder.#toLeadBoxes(body)
        }
        return []
    }

    /**
     * Resolves a passive chip descriptor.
     * @param {string} normalized Normalized footprint text.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @returns {object | null}
     */
    static #passiveBody(normalized, fallbackSizeMil) {
        const match = normalized.match(
            /(?:^|[-_])(0201|0402|0603|0805|1206|1210|2512)(?:$|[-_])/u
        )
        if (!match) {
            return null
        }

        const defaultSize = PASSIVE_SIZES.get(match[1])
        return {
            family: 'chip',
            sizeMil: PcbScene3dFootprintBodyBuilder.#maxSize(
                fallbackSizeMil,
                defaultSize
            ),
            footprintModel: {
                source: 'footprint',
                style: 'passive-chip',
                packageCode: match[1],
                terminalCount: 2,
                terminalColor: TERMINAL_COLOR
            }
        }
    }

    /**
     * Resolves a dual-row package descriptor.
     * @param {string} normalized Normalized footprint text.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @returns {object | null}
     */
    static #dualRowBody(normalized, fallbackSizeMil) {
        const match = normalized.match(
            /(?:^|[-_])(soic|sop|ssop|tssop|msop)[-_]?(\d{2,3}|\d)(?:$|[-_])/u
        )
        if (!match || !DUAL_ROW_FAMILIES.has(match[1])) {
            return null
        }

        const family = match[1]
        const leadCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            match[2],
            2,
            128
        )
        const pinsPerSide = Math.ceil(leadCount / 2)
        const leadPitch = family === 'soic' || family === 'sop' ? 50 : 25
        const defaultSize = {
            width: family === 'soic' || family === 'sop' ? 160 : 130,
            depth: Math.max(140, (pinsPerSide - 1) * leadPitch + 90),
            height: family === 'soic' || family === 'sop' ? 55 : 40
        }

        return {
            family,
            sizeMil: PcbScene3dFootprintBodyBuilder.#maxSize(
                fallbackSizeMil,
                defaultSize
            ),
            footprintModel: {
                source: 'footprint',
                style: 'dual-row',
                leadCount,
                leadPitchMil: leadPitch,
                leadColor: LEAD_COLOR
            }
        }
    }

    /**
     * Resolves a quad-row package descriptor.
     * @param {string} normalized Normalized footprint text.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @returns {object | null}
     */
    static #quadRowBody(normalized, fallbackSizeMil) {
        const match = normalized.match(
            /(?:^|[-_])(qfn|qfp|tqfp|lqfp)[-_]?(\d{2,3})(?:$|[-_])/u
        )
        if (!match || !QUAD_ROW_FAMILIES.has(match[1])) {
            return null
        }

        const leadCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            match[2],
            4,
            256
        )
        const pinsPerSide = Math.ceil(leadCount / 4)
        const defaultEdge = Math.max(160, (pinsPerSide - 1) * 20 + 120)

        return {
            family: match[1],
            sizeMil: PcbScene3dFootprintBodyBuilder.#maxSize(fallbackSizeMil, {
                width: defaultEdge,
                depth: defaultEdge,
                height: match[1] === 'qfn' ? 35 : 45
            }),
            footprintModel: {
                source: 'footprint',
                style: 'quad-row',
                leadCount,
                leadPitchMil: 20,
                leadColor: LEAD_COLOR
            }
        }
    }

    /**
     * Resolves a SOT-style package descriptor.
     * @param {string} normalized Normalized footprint text.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @returns {object | null}
     */
    static #sotBody(normalized, fallbackSizeMil) {
        const match = normalized.match(
            /(?:^|[-_])sot[-_]?23(?:[-_]?(\d))?(?:$|[-_])/u
        )
        if (!match) {
            return null
        }

        const leadCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            match[1] || 3,
            3,
            8
        )
        return {
            family: 'sot',
            sizeMil: PcbScene3dFootprintBodyBuilder.#maxSize(fallbackSizeMil, {
                width: 70,
                depth: 110,
                height: 45
            }),
            footprintModel: {
                source: 'footprint',
                style: 'dual-row',
                leadCount,
                leadPitchMil: 38,
                leadColor: LEAD_COLOR
            }
        }
    }

    /**
     * Resolves a through-hole pin header descriptor.
     * @param {string} normalized Normalized footprint text.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @returns {object | null}
     */
    static #headerBody(normalized, fallbackSizeMil) {
        const grid = normalized.match(/(?:^|[-_])([12])x(\d{1,3})(?:$|[-_])/u)
        const pinrow = normalized.match(
            /(?:^|[-_])pin(?:row|header|hdr)[-_]?(\d{1,3})?(?:$|[-_])/u
        )
        const simpleHeader =
            /(?:^|[-_])simple[-_]pin[-_]header(?:$|[-_])/u.test(normalized)
        if (!grid && !pinrow && !simpleHeader) {
            return null
        }

        const rowCount = PcbScene3dFootprintBodyBuilder.#headerRowCount(
            normalized,
            grid
        )
        const pinCount = PcbScene3dFootprintBodyBuilder.#headerPinCount(
            grid,
            pinrow,
            rowCount
        )
        const pinsPerRow = Math.ceil(pinCount / rowCount)
        const defaultSize = {
            width: Math.max(80, (rowCount - 1) * HEADER_PIN_PITCH_MIL + 80),
            depth: Math.max(80, (pinsPerRow - 1) * HEADER_PIN_PITCH_MIL + 80),
            height: 90
        }

        return {
            family: 'header',
            sizeMil: PcbScene3dFootprintBodyBuilder.#maxSize(
                fallbackSizeMil,
                defaultSize
            ),
            footprintModel: {
                source: 'footprint',
                style: 'pin-header',
                pinCount,
                rowCount,
                pinPitchMil: HEADER_PIN_PITCH_MIL,
                pinColor: PIN_COLOR
            }
        }
    }

    /**
     * Resolves the row count for a pin header footprint.
     * @param {string} normalized Normalized footprint text.
     * @param {RegExpMatchArray | null} grid Grid match.
     * @returns {number}
     */
    static #headerRowCount(normalized, grid) {
        const explicitRows = normalized.match(
            /(?:^|[-_])rows?[-_]?([12])(?:$|[-_])/u
        )
        if (explicitRows) {
            return PcbScene3dFootprintBodyBuilder.#clampedCount(
                explicitRows[1],
                1,
                2
            )
        }
        if (grid) {
            return PcbScene3dFootprintBodyBuilder.#clampedCount(grid[1], 1, 2)
        }
        return normalized.includes('double-row') ? 2 : 1
    }

    /**
     * Resolves the total pin count for a pin header footprint.
     * @param {RegExpMatchArray | null} grid Grid match.
     * @param {RegExpMatchArray | null} pinrow Pin-row match.
     * @param {number} rowCount Row count.
     * @returns {number}
     */
    static #headerPinCount(grid, pinrow, rowCount) {
        if (grid) {
            return (
                PcbScene3dFootprintBodyBuilder.#clampedCount(grid[1], 1, 2) *
                PcbScene3dFootprintBodyBuilder.#clampedCount(grid[2], 1, 80)
            )
        }
        if (pinrow?.[1]) {
            return PcbScene3dFootprintBodyBuilder.#clampedCount(
                pinrow[1],
                rowCount,
                160
            )
        }
        return rowCount * 2
    }

    /**
     * Resolves a pushbutton package descriptor.
     * @param {string} normalized Normalized footprint text.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @returns {object | null}
     */
    static #pushbuttonBody(normalized, fallbackSizeMil) {
        if (
            !/(?:^|[-_])(?:pushbutton|push[-_]button|button|tact|tactile)(?:$|[-_])/u.test(
                normalized
            )
        ) {
            return null
        }

        return {
            family: 'switch',
            sizeMil: PcbScene3dFootprintBodyBuilder.#maxSize(fallbackSizeMil, {
                width: 150,
                depth: 150,
                height: 45
            }),
            footprintModel: {
                source: 'footprint',
                style: 'pushbutton',
                pinCount: 4,
                pinPitchMil: PUSHBUTTON_PIN_PITCH_MIL,
                pinColor: PIN_COLOR
            }
        }
    }

    /**
     * Resolves a testpoint package descriptor.
     * @param {string} normalized Normalized footprint text.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @returns {object | null}
     */
    static #testPointBody(normalized, fallbackSizeMil) {
        if (
            !/(?:^|[-_])(?:testpoint|test[-_]point|tp\d*)(?:$|[-_])/u.test(
                normalized
            )
        ) {
            return null
        }

        return {
            family: 'test-point',
            sizeMil: PcbScene3dFootprintBodyBuilder.#maxSize(fallbackSizeMil, {
                width: 60,
                depth: 60,
                height: 18
            }),
            footprintModel: {
                source: 'footprint',
                style: 'test-point'
            }
        }
    }

    /**
     * Resolves a TO-style through-hole package descriptor.
     * @param {string} normalized Normalized footprint text.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @returns {object | null}
     */
    static #toBody(normalized, fallbackSizeMil) {
        const match = normalized.match(
            /(?:^|[-_])to[-_]?(18|39|92|126|220)(?:[-_]?(\d))?(?:$|[-_])/u
        )
        if (!match) {
            return null
        }

        const leadCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            match[2] || 3,
            2,
            5
        )
        return {
            family: 'transistor',
            sizeMil: PcbScene3dFootprintBodyBuilder.#maxSize(fallbackSizeMil, {
                width: 130,
                depth: 90,
                height: 150
            }),
            footprintModel: {
                source: 'footprint',
                style: 'to-package',
                leadCount,
                leadPitchMil: TO_LEAD_PITCH_MIL,
                leadColor: LEAD_COLOR
            }
        }
    }

    /**
     * Builds lead boxes for a dual-row package.
     * @param {object} body Body descriptor.
     * @returns {object[]}
     */
    static #dualRowLeadBoxes(body) {
        const size = PcbScene3dFootprintBodyBuilder.#size(body?.sizeMil)
        const model = body?.footprintModel || {}
        const leadCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            model.leadCount,
            2,
            128
        )
        const leftCount = Math.ceil(leadCount / 2)
        const rightCount = leadCount - leftCount
        const maxSideCount = Math.max(leftCount, rightCount)
        const pitch = Math.max(Number(model.leadPitchMil || 0), 10)
        const span = Math.min(size.depth * 0.78, (maxSideCount - 1) * pitch)
        const leadWidth = Math.max(Math.min(pitch * 0.42, 22), 8)
        const leadLength = Math.max(size.width * 0.16, 18)
        const leadHeight = Math.max(size.height * 0.22, 5)
        const boxes = []

        PcbScene3dFootprintBodyBuilder.#appendDualRowSide(
            boxes,
            -1,
            leftCount,
            span,
            size,
            leadWidth,
            leadLength,
            leadHeight,
            1,
            model.leadColor || LEAD_COLOR
        )
        PcbScene3dFootprintBodyBuilder.#appendDualRowSide(
            boxes,
            1,
            rightCount,
            span,
            size,
            leadWidth,
            leadLength,
            leadHeight,
            leftCount + 1,
            model.leadColor || LEAD_COLOR
        )
        return boxes
    }

    /**
     * Appends one side of dual-row lead boxes.
     * @param {object[]} boxes Mutable box output.
     * @param {number} sideSign Package side sign.
     * @param {number} count Lead count on this side.
     * @param {number} span Lead center span.
     * @param {object} size Body size.
     * @param {number} leadWidth Lead width.
     * @param {number} leadLength Lead length.
     * @param {number} leadHeight Lead height.
     * @param {number} startIndex One-based starting index.
     * @param {number[]} color Lead color.
     * @returns {void}
     */
    static #appendDualRowSide(
        boxes,
        sideSign,
        count,
        span,
        size,
        leadWidth,
        leadLength,
        leadHeight,
        startIndex,
        color
    ) {
        for (let index = 0; index < count; index += 1) {
            const fraction = count <= 1 ? 0.5 : index / (count - 1)
            boxes.push({
                role: 'lead',
                index: startIndex + index,
                x: sideSign * (size.width / 2 + leadLength / 2),
                y: -span / 2 + span * fraction,
                z: -size.height / 2 + leadHeight / 2,
                width: leadLength,
                depth: leadWidth,
                height: leadHeight,
                color
            })
        }
    }

    /**
     * Builds lead boxes for a quad-row package.
     * @param {object} body Body descriptor.
     * @returns {object[]}
     */
    static #quadRowLeadBoxes(body) {
        const size = PcbScene3dFootprintBodyBuilder.#size(body?.sizeMil)
        const model = body?.footprintModel || {}
        const leadCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            model.leadCount,
            4,
            256
        )
        const perSide = Math.ceil(leadCount / 4)
        const pitch = Math.max(Number(model.leadPitchMil || 0), 10)
        const width = Math.max(Math.min(pitch * 0.5, 16), 6)
        const length = Math.max(Math.min(size.width, size.depth) * 0.12, 12)
        const height = Math.max(size.height * 0.18, 4)
        const spanX = Math.min(size.width * 0.72, (perSide - 1) * pitch)
        const spanY = Math.min(size.depth * 0.72, (perSide - 1) * pitch)
        const color = model.leadColor || LEAD_COLOR
        const boxes = []

        for (let side = 0; side < 4; side += 1) {
            for (let index = 0; index < perSide; index += 1) {
                if (boxes.length >= leadCount) {
                    return boxes
                }
                boxes.push(
                    PcbScene3dFootprintBodyBuilder.#quadLeadBox(
                        side,
                        index,
                        perSide,
                        { size, width, length, height, spanX, spanY, color },
                        boxes.length + 1
                    )
                )
            }
        }
        return boxes
    }

    /**
     * Builds one quad-row lead box.
     * @param {number} side Side index.
     * @param {number} index Index on side.
     * @param {number} count Side count.
     * @param {object} spec Lead geometry specification.
     * @param {number} leadIndex One-based lead index.
     * @returns {object}
     */
    static #quadLeadBox(side, index, count, spec, leadIndex) {
        const fraction = count <= 1 ? 0.5 : index / (count - 1)
        const x = -spec.spanX / 2 + spec.spanX * fraction
        const y = -spec.spanY / 2 + spec.spanY * fraction
        const z = -spec.size.height / 2 + spec.height / 2
        if (side === 0 || side === 2) {
            const ySign = side === 0 ? -1 : 1
            return {
                role: 'lead',
                index: leadIndex,
                x,
                y: ySign * (spec.size.depth / 2 + spec.length / 2),
                z,
                width: spec.width,
                depth: spec.length,
                height: spec.height,
                color: spec.color
            }
        }

        const xSign = side === 1 ? 1 : -1
        return {
            role: 'lead',
            index: leadIndex,
            x: xSign * (spec.size.width / 2 + spec.length / 2),
            y,
            z,
            width: spec.length,
            depth: spec.width,
            height: spec.height,
            color: spec.color
        }
    }

    /**
     * Builds terminal boxes for passive chip packages.
     * @param {object} body Body descriptor.
     * @returns {object[]}
     */
    static #passiveTerminalBoxes(body) {
        const size = PcbScene3dFootprintBodyBuilder.#size(body?.sizeMil)
        const terminalLength = Math.max(size.width * 0.22, 8)
        const terminalHeight = Math.max(size.height * 1.04, 1)
        const color = body?.footprintModel?.terminalColor || TERMINAL_COLOR

        return [-1, 1].map((sideSign, index) => ({
            role: 'lead',
            index: index + 1,
            x: sideSign * (size.width / 2 - terminalLength / 2),
            y: 0,
            z: 0,
            width: terminalLength,
            depth: size.depth * 1.04,
            height: terminalHeight,
            color
        }))
    }

    /**
     * Builds vertical pin boxes for through-hole headers.
     * @param {object} body Body descriptor.
     * @returns {object[]}
     */
    static #headerPinBoxes(body) {
        const size = PcbScene3dFootprintBodyBuilder.#size(body?.sizeMil)
        const model = body?.footprintModel || {}
        const rowCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            model.rowCount,
            1,
            2
        )
        const pinCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            model.pinCount,
            rowCount,
            160
        )
        const pinsPerRow = Math.ceil(pinCount / rowCount)
        const pitch = Math.max(Number(model.pinPitchMil || 0), 40)
        const pinWidth = Math.max(Math.min(pitch * 0.24, 30), 16)
        const pinHeight = Math.max(size.height + 60, 100)
        const rowSpan = (rowCount - 1) * pitch
        const columnSpan = (pinsPerRow - 1) * pitch
        const boxes = []

        for (let row = 0; row < rowCount; row += 1) {
            for (let column = 0; column < pinsPerRow; column += 1) {
                if (boxes.length >= pinCount) {
                    return boxes
                }
                boxes.push({
                    role: 'pin',
                    index: boxes.length + 1,
                    x: rowCount <= 1 ? 0 : -rowSpan / 2 + row * pitch,
                    y: pinsPerRow <= 1 ? 0 : -columnSpan / 2 + column * pitch,
                    z: -size.height / 2,
                    width: pinWidth,
                    depth: pinWidth,
                    height: pinHeight,
                    color: model.pinColor || PIN_COLOR
                })
            }
        }
        return boxes
    }

    /**
     * Builds switch pin boxes for pushbutton packages.
     * @param {object} body Body descriptor.
     * @returns {object[]}
     */
    static #pushbuttonPinBoxes(body) {
        const size = PcbScene3dFootprintBodyBuilder.#size(body?.sizeMil)
        const model = body?.footprintModel || {}
        const pitch = Math.max(Number(model.pinPitchMil || 0), 50)
        const pinWidth = Math.max(Math.min(pitch * 0.22, 24), 14)
        const pinHeight = Math.max(size.height + 42, 70)
        const spanX = Math.min(size.width * 0.72, pitch)
        const spanY = Math.min(size.depth * 0.72, pitch)
        const color = model.pinColor || PIN_COLOR

        return [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1]
        ].map(([xSign, ySign], index) => ({
            role: 'pin',
            index: index + 1,
            x: (xSign * spanX) / 2,
            y: (ySign * spanY) / 2,
            z: -size.height / 2,
            width: pinWidth,
            depth: pinWidth,
            height: pinHeight,
            color
        }))
    }

    /**
     * Builds inline lead boxes for TO-style packages.
     * @param {object} body Body descriptor.
     * @returns {object[]}
     */
    static #toLeadBoxes(body) {
        const size = PcbScene3dFootprintBodyBuilder.#size(body?.sizeMil)
        const model = body?.footprintModel || {}
        const leadCount = PcbScene3dFootprintBodyBuilder.#clampedCount(
            model.leadCount,
            2,
            5
        )
        const pitch = Math.max(Number(model.leadPitchMil || 0), 30)
        const span = Math.min(size.width * 0.72, (leadCount - 1) * pitch)
        const leadWidth = Math.max(Math.min(pitch * 0.22, 18), 10)
        const leadDepth = Math.max(size.depth * 0.16, 14)
        const leadHeight = Math.max(size.height + 55, 95)
        const color = model.leadColor || LEAD_COLOR

        return Array.from({ length: leadCount }, (_entry, index) => {
            const fraction = leadCount <= 1 ? 0.5 : index / (leadCount - 1)
            return {
                role: 'lead',
                index: index + 1,
                x: -span / 2 + span * fraction,
                y: -size.depth / 2 + leadDepth / 2,
                z: -size.height / 2,
                width: leadWidth,
                depth: leadDepth,
                height: leadHeight,
                color
            }
        })
    }

    /**
     * Normalizes package text for matching.
     * @param {unknown} value Candidate text.
     * @returns {string}
     */
    static #normalizeText(value) {
        return (
            String(value || '')
                .trim()
                .toLowerCase()
                .replaceAll('\\', '/')
                .split('/')
                .filter(Boolean)
                .pop()
                ?.replace(/[^\w-]+/gu, '-') || ''
        )
    }

    /**
     * Resolves package footprint text from component metadata.
     * @param {object | null | undefined} cadComponent CAD component element.
     * @param {object | null | undefined} component PCB component element.
     * @param {object | null | undefined} sourceComponent Source component element.
     * @returns {string}
     */
    static #footprintText(cadComponent, component, sourceComponent) {
        return String(
            cadComponent?.footprinter_string ||
                cadComponent?.footprint_string ||
                cadComponent?.footprint ||
                cadComponent?.package ||
                sourceComponent?.ftype ||
                sourceComponent?.footprint ||
                component?.footprint ||
                component?.package ||
                ''
        )
    }

    /**
     * Merges fallback dimensions with package defaults.
     * @param {object} fallbackSizeMil Fallback size in mils.
     * @param {object} defaultSizeMil Default size in mils.
     * @returns {{ width: number, depth: number, height: number }}
     */
    static #maxSize(fallbackSizeMil, defaultSizeMil) {
        return {
            width: Math.max(
                PcbScene3dFootprintBodyBuilder.#positive(
                    fallbackSizeMil?.width
                ),
                PcbScene3dFootprintBodyBuilder.#positive(defaultSizeMil?.width)
            ),
            depth: Math.max(
                PcbScene3dFootprintBodyBuilder.#positive(
                    fallbackSizeMil?.depth
                ),
                PcbScene3dFootprintBodyBuilder.#positive(defaultSizeMil?.depth)
            ),
            height: Math.max(
                PcbScene3dFootprintBodyBuilder.#positive(
                    fallbackSizeMil?.height
                ),
                PcbScene3dFootprintBodyBuilder.#positive(defaultSizeMil?.height)
            )
        }
    }

    /**
     * Normalizes a body size object.
     * @param {object} size Candidate size.
     * @returns {{ width: number, depth: number, height: number }}
     */
    static #size(size) {
        return {
            width: Math.max(Number(size?.width || 0), 1),
            depth: Math.max(Number(size?.depth || 0), 1),
            height: Math.max(Number(size?.height || 0), 1)
        }
    }

    /**
     * Resolves a positive number.
     * @param {unknown} value Candidate value.
     * @returns {number}
     */
    static #positive(value) {
        const number = Number(value)
        return Number.isFinite(number) && number > 0 ? number : 0
    }

    /**
     * Resolves a bounded integer count.
     * @param {unknown} value Candidate value.
     * @param {number} min Minimum count.
     * @param {number} max Maximum count.
     * @returns {number}
     */
    static #clampedCount(value, min, max) {
        const number = Math.round(Number(value))
        if (!Number.isFinite(number)) {
            return min
        }
        return Math.min(Math.max(number, min), max)
    }
}
