import { zipSync } from 'fflate'
import { PcbAssemblyMeshUtils } from './PcbAssemblyMeshUtils.mjs'
import { PcbAssemblyModelMeshLoader } from './PcbAssemblyModelMeshLoader.mjs'
import { PcbAssemblyStepWriter } from './PcbAssemblyStepWriter.mjs'

const STATIC_BODY_COLOR = [0.5, 0.5, 0.5]

/**
 * Builds browser-downloadable ZIP archives from resolved PCB component model
 * data.
 */
export class PcbModelArchiveExporter {
    /**
     * Builds one ZIP archive from the resolved scene description.
     * @param {{ archiveBaseName?: string, sceneDescription?: { components?: any[], externalPlacements?: any[], staticBodyPlacements?: any[] }, modelMeshLoader?: ((placement: object) => Promise<object | object[]> | object | object[]) | PcbAssemblyModelMeshLoader, includeRawModels?: boolean, includeStitchedComponents?: boolean, stitchedDesignators?: string[] }} [options]
     * @returns {Promise<{ archiveName: string, archiveBytes: Uint8Array, exportedEntries: { archivePath: string, pattern: string, designator: string, format: string, modelName: string, kind?: string }[], skippedEntries: { designator: string, reason: string }[] }>}
     */
    static async buildArchive(options = {}) {
        const archiveName = PcbModelArchiveExporter.#resolveArchiveName(
            options.archiveBaseName
        )
        const resolvedEntries =
            options.includeRawModels === false
                ? []
                : PcbModelArchiveExporter.#collectResolvedEntries(
                      options.sceneDescription
                  )
        const exportedEntries = []
        const skippedEntries = []
        const archiveInput = {}

        for (const entry of resolvedEntries) {
            try {
                const archivePath = PcbModelArchiveExporter.#resolveArchivePath(
                    entry,
                    exportedEntries
                )
                const modelBytes =
                    await PcbModelArchiveExporter.#readModelBytes(entry.model)
                archiveInput[archivePath] = modelBytes
                exportedEntries.push({
                    archivePath,
                    pattern: entry.pattern,
                    designator: entry.designator,
                    format: entry.model.format,
                    modelName: entry.model.name
                })
            } catch (error) {
                skippedEntries.push({
                    designator: entry.designator,
                    reason: String(
                        error?.message || error || 'Model export failed.'
                    )
                })
            }
        }

        const stitchedEntries =
            options.includeStitchedComponents === false
                ? { entries: [], skippedEntries: [] }
                : await PcbModelArchiveExporter.#buildStitchedEntries(
                      options.sceneDescription,
                      options.modelMeshLoader,
                      options.stitchedDesignators
                  )
        skippedEntries.push(...stitchedEntries.skippedEntries)
        for (const entry of stitchedEntries.entries) {
            try {
                const archivePath =
                    PcbModelArchiveExporter.#resolveStitchedArchivePath(
                        entry,
                        exportedEntries
                    )
                archiveInput[archivePath] = new TextEncoder().encode(
                    entry.payloadText
                )
                exportedEntries.push({
                    archivePath,
                    pattern: entry.pattern,
                    designator: entry.designator,
                    format: 'step',
                    modelName: entry.modelName,
                    kind: 'stitched-component'
                })
            } catch (error) {
                skippedEntries.push({
                    designator: entry.designator,
                    reason: String(
                        error?.message ||
                            error ||
                            'Stitched component export failed.'
                    )
                })
            }
        }

        return {
            archiveName,
            archiveBytes: zipSync(archiveInput),
            exportedEntries,
            skippedEntries
        }
    }

    /**
     * Collects one deduplicated list of exportable resolved models from the
     * same scene description shape used by the 3D runtime.
     * @param {{ components?: any[], externalPlacements?: any[] } | undefined} sceneDescription
     * @returns {{ pattern: string, designator: string, model: any, identityKey: string }[]}
     */
    static #collectResolvedEntries(sceneDescription) {
        const components = Array.isArray(sceneDescription?.components)
            ? sceneDescription.components
            : []
        const explicitPlacements = Array.isArray(
            sceneDescription?.externalPlacements
        )
            ? sceneDescription.externalPlacements
            : []
        const componentByDesignator = new Map()
        const explicitDesignators = new Set()

        components.forEach((component) => {
            const designator = String(component?.designator || '').trim()
            if (!designator) {
                return
            }

            componentByDesignator.set(designator, component)
        })

        const collectedEntries = []
        explicitPlacements.forEach((placement) => {
            const designator = String(placement?.designator || '').trim()
            if (!designator || !placement?.externalModel) {
                return
            }

            explicitDesignators.add(designator)
            const component = componentByDesignator.get(designator) || null
            collectedEntries.push({
                pattern: PcbModelArchiveExporter.#resolvePattern(
                    component,
                    placement
                ),
                designator,
                model: placement.externalModel,
                identityKey: PcbModelArchiveExporter.#resolveModelIdentity(
                    placement.externalModel
                )
            })
        })

        components.forEach((component) => {
            const designator = String(component?.designator || '').trim()
            if (
                !designator ||
                explicitDesignators.has(designator) ||
                !component?.externalModel
            ) {
                return
            }

            collectedEntries.push({
                pattern: PcbModelArchiveExporter.#resolvePattern(
                    component,
                    null
                ),
                designator,
                model: component.externalModel,
                identityKey: PcbModelArchiveExporter.#resolveModelIdentity(
                    component.externalModel
                )
            })
        })

        const dedupedEntries = []
        const seenKeys = new Set()
        collectedEntries.forEach((entry) => {
            const dedupeKey =
                PcbModelArchiveExporter.#normalizeToken(entry.pattern) +
                '::' +
                entry.identityKey
            if (seenKeys.has(dedupeKey)) {
                return
            }

            seenKeys.add(dedupeKey)
            dedupedEntries.push(entry)
        })

        return dedupedEntries
    }

    /**
     * Builds generated STEP entries for authored multi-body components.
     * @param {{ components?: object[], externalPlacements?: object[], staticBodyPlacements?: object[] } | undefined} sceneDescription Scene data.
     * @param {((placement: object) => Promise<object | object[]> | object | object[]) | PcbAssemblyModelMeshLoader | undefined} modelMeshLoader Mesh loader override.
     * @param {string[] | undefined} stitchedDesignators Optional designator filter.
     * @returns {Promise<{ entries: { pattern: string, designator: string, modelName: string, payloadText: string }[], skippedEntries: { designator: string, reason: string }[] }>}
     */
    static async #buildStitchedEntries(
        sceneDescription,
        modelMeshLoader,
        stitchedDesignators
    ) {
        const candidates = PcbModelArchiveExporter.#collectStitchedCandidates(
            sceneDescription,
            stitchedDesignators
        )
        if (!candidates.length) {
            return { entries: [], skippedEntries: [] }
        }

        const loader =
            PcbModelArchiveExporter.#resolveModelMeshLoader(modelMeshLoader)
        const ownsLoader =
            !(
                typeof modelMeshLoader === 'function' ||
                modelMeshLoader instanceof PcbAssemblyModelMeshLoader
            ) && loader instanceof PcbAssemblyModelMeshLoader
        try {
            const entries = []
            const skippedEntries = []
            for (const candidate of candidates) {
                try {
                    const meshes =
                        await PcbModelArchiveExporter.#buildStitchedMeshes(
                            candidate,
                            loader
                        )
                    if (!meshes.length) {
                        continue
                    }

                    const modelName =
                        candidate.designator + ' stitched component'
                    entries.push({
                        pattern: candidate.pattern,
                        designator: candidate.designator,
                        modelName,
                        payloadText: PcbAssemblyStepWriter.write({
                            name: modelName,
                            meshes
                        })
                    })
                } catch (error) {
                    skippedEntries.push({
                        designator: candidate.designator,
                        reason: String(
                            error?.message ||
                                error ||
                                'Stitched component export failed.'
                        )
                    })
                }
            }

            return { entries, skippedEntries }
        } finally {
            if (ownsLoader) {
                loader.dispose?.()
            }
        }
    }

    /**
     * Collects component stack candidates keyed by designator.
     * @param {{ components?: object[], externalPlacements?: object[], staticBodyPlacements?: object[] } | undefined} sceneDescription Scene data.
     * @param {string[] | undefined} stitchedDesignators Optional designator filter.
     * @returns {{ designator: string, pattern: string, externalPlacements: object[], staticBodyPlacements: object[] }[]}
     */
    static #collectStitchedCandidates(sceneDescription, stitchedDesignators) {
        const componentByDesignator =
            PcbModelArchiveExporter.#componentByDesignator(sceneDescription)
        const designatorSet =
            PcbModelArchiveExporter.#normalizedDesignatorSet(
                stitchedDesignators
            )
        const groups = new Map()

        PcbModelArchiveExporter.#array(
            sceneDescription?.staticBodyPlacements
        ).forEach((placement) => {
            const designator = String(placement?.designator || '').trim()
            if (!designator) {
                return
            }

            PcbModelArchiveExporter.#stitchedGroup(
                groups,
                designator
            ).staticBodyPlacements.push(placement)
        })

        PcbModelArchiveExporter.#array(sceneDescription?.externalPlacements)
            .filter((placement) => placement?.externalModel)
            .forEach((placement) => {
                const designator = String(placement?.designator || '').trim()
                if (!designator) {
                    return
                }

                PcbModelArchiveExporter.#stitchedGroup(
                    groups,
                    designator
                ).externalPlacements.push(placement)
            })

        return [...groups.values()]
            .filter(
                (group) =>
                    !designatorSet ||
                    designatorSet.has(
                        PcbModelArchiveExporter.#normalizeDesignator(
                            group.designator
                        )
                    )
            )
            .filter((group) =>
                PcbModelArchiveExporter.#isStitchedCandidate(group)
            )
            .map((group) => ({
                ...group,
                pattern: PcbModelArchiveExporter.#resolvePattern(
                    componentByDesignator.get(group.designator) || null,
                    group.externalPlacements[0] || null
                )
            }))
            .sort((left, right) =>
                left.designator.localeCompare(right.designator)
            )
    }

    /**
     * Builds a normalized designator filter set.
     * @param {unknown} designators Candidate designator list.
     * @returns {Set<string> | null}
     */
    static #normalizedDesignatorSet(designators) {
        if (!Array.isArray(designators) || !designators.length) {
            return null
        }

        const normalized = designators
            .map((designator) =>
                PcbModelArchiveExporter.#normalizeDesignator(designator)
            )
            .filter(Boolean)

        return normalized.length ? new Set(normalized) : null
    }

    /**
     * Normalizes a component designator for matching.
     * @param {unknown} designator Candidate designator.
     * @returns {string}
     */
    static #normalizeDesignator(designator) {
        return String(designator || '')
            .trim()
            .toUpperCase()
    }

    /**
     * Returns true when one designator represents a multi-body component.
     * @param {{ externalPlacements: object[], staticBodyPlacements: object[] }} group Candidate group.
     * @returns {boolean}
     */
    static #isStitchedCandidate(group) {
        const hasVariantMetadata = [
            ...group.externalPlacements,
            ...group.staticBodyPlacements
        ].some((placement) =>
            String(placement?.coLocatedVariantGroupKey || '').trim()
        )
        return (
            group.externalPlacements.length > 0 &&
            (group.externalPlacements.length > 1 ||
                group.staticBodyPlacements.length > 0 ||
                hasVariantMetadata)
        )
    }

    /**
     * Builds transformed, component-local meshes for one stitched component.
     * @param {{ designator: string, externalPlacements: object[], staticBodyPlacements: object[] }} candidate Stitched component candidate.
     * @param {((placement: object) => Promise<object | object[]> | object | object[]) | PcbAssemblyModelMeshLoader} loader Mesh loader.
     * @returns {Promise<object[]>}
     */
    static async #buildStitchedMeshes(candidate, loader) {
        const anchor = PcbModelArchiveExporter.#stitchedAnchor(candidate)
        const staticMeshes = candidate.staticBodyPlacements
            .map((placement) =>
                PcbModelArchiveExporter.#staticBodyMesh(
                    candidate.designator,
                    placement
                )
            )
            .filter(Boolean)
        const externalMeshes = []

        for (const placement of candidate.externalPlacements) {
            const loaded = await PcbModelArchiveExporter.#loadPlacementMeshes(
                loader,
                placement
            )
            loaded.filter(Boolean).forEach((mesh, index) => {
                externalMeshes.push(
                    PcbAssemblyMeshUtils.transformMesh(
                        {
                            ...mesh,
                            name:
                                mesh.name ||
                                candidate.designator + '-model-' + (index + 1)
                        },
                        placement
                    )
                )
            })
        }

        return PcbModelArchiveExporter.#translateMeshes(
            [...staticMeshes, ...externalMeshes],
            {
                x: -anchor.x,
                y: -anchor.y,
                z: -anchor.z
            }
        )
    }

    /**
     * Builds one mesh for an authored static carrier body.
     * @param {string} designator Component designator.
     * @param {object} placement Static body placement.
     * @returns {object | null}
     */
    static #staticBodyMesh(designator, placement) {
        const geometry = placement?.geometry || {}
        const kind = String(geometry?.kind || '').toLowerCase()
        const height = Number(geometry?.heightMil || 0)
        if (!(height > 0)) {
            return null
        }

        let mesh = null
        if (kind === 'extruded-polygon') {
            const points = PcbModelArchiveExporter.#array(
                geometry.verticesMil
            ).map((point) => [Number(point?.x || 0), Number(point?.y || 0)])
            mesh = PcbAssemblyMeshUtils.prism(
                'static-' + PcbAssemblyMeshUtils.safeName(designator),
                points,
                0,
                height,
                PcbModelArchiveExporter.#bodyColor(placement)
            )
        } else if (kind === 'cylinder') {
            mesh = PcbAssemblyMeshUtils.cylinder(
                'static-' + PcbAssemblyMeshUtils.safeName(designator),
                {
                    radius: Number(geometry?.radiusMil || 0),
                    height,
                    color: PcbModelArchiveExporter.#bodyColor(placement)
                }
            )
        }

        return mesh ? PcbAssemblyMeshUtils.transformMesh(mesh, placement) : null
    }

    /**
     * Resolves a mesh loader for generated stitched components.
     * @param {((placement: object) => Promise<object | object[]> | object | object[]) | PcbAssemblyModelMeshLoader | undefined} modelMeshLoader Loader option.
     * @returns {((placement: object) => Promise<object | object[]> | object | object[]) | PcbAssemblyModelMeshLoader}
     */
    static #resolveModelMeshLoader(modelMeshLoader) {
        if (
            typeof modelMeshLoader === 'function' ||
            modelMeshLoader instanceof PcbAssemblyModelMeshLoader
        ) {
            return modelMeshLoader
        }

        return new PcbAssemblyModelMeshLoader()
    }

    /**
     * Loads meshes for one external placement.
     * @param {((placement: object) => Promise<object | object[]> | object | object[]) | PcbAssemblyModelMeshLoader} loader Mesh loader.
     * @param {object} placement External placement.
     * @returns {Promise<object[]>}
     */
    static async #loadPlacementMeshes(loader, placement) {
        const loaded =
            loader instanceof PcbAssemblyModelMeshLoader
                ? await loader.loadPlacement(placement)
                : await loader(placement)
        return Array.isArray(loaded) ? loaded : [loaded]
    }

    /**
     * Translates meshes by a fixed offset.
     * @param {object[]} meshes Source meshes.
     * @param {{ x?: number, y?: number, z?: number }} offset Translation.
     * @returns {object[]}
     */
    static #translateMeshes(meshes, offset) {
        return meshes.map((mesh) => ({
            ...mesh,
            vertices: PcbModelArchiveExporter.#array(mesh.vertices).map(
                (vertex) => [
                    Number(vertex?.[0] || 0) + Number(offset.x || 0),
                    Number(vertex?.[1] || 0) + Number(offset.y || 0),
                    Number(vertex?.[2] || 0) + Number(offset.z || 0)
                ]
            )
        }))
    }

    /**
     * Resolves one component-local origin for a stitched export.
     * @param {{ externalPlacements: object[], staticBodyPlacements: object[] }} candidate Stitched component candidate.
     * @returns {{ x: number, y: number, z: number }}
     */
    static #stitchedAnchor(candidate) {
        const placement =
            candidate.externalPlacements[0] ||
            candidate.staticBodyPlacements[0] ||
            {}
        return {
            x: Number(placement?.positionMil?.x || 0),
            y: Number(placement?.positionMil?.y || 0),
            z: Number(placement?.positionMil?.z || 0)
        }
    }

    /**
     * Gets or creates one stitched candidate group.
     * @param {Map<string, { designator: string, externalPlacements: object[], staticBodyPlacements: object[] }>} groups Mutable groups.
     * @param {string} designator Component designator.
     * @returns {{ designator: string, externalPlacements: object[], staticBodyPlacements: object[] }}
     */
    static #stitchedGroup(groups, designator) {
        if (!groups.has(designator)) {
            groups.set(designator, {
                designator,
                externalPlacements: [],
                staticBodyPlacements: []
            })
        }

        return groups.get(designator)
    }

    /**
     * Builds a designator lookup for scene components.
     * @param {{ components?: object[] } | undefined} sceneDescription Scene data.
     * @returns {Map<string, object>}
     */
    static #componentByDesignator(sceneDescription) {
        const componentByDesignator = new Map()
        PcbModelArchiveExporter.#array(sceneDescription?.components).forEach(
            (component) => {
                const designator = String(component?.designator || '').trim()
                if (designator) {
                    componentByDesignator.set(designator, component)
                }
            }
        )

        return componentByDesignator
    }

    /**
     * Resolves one archive file name for the exported model.
     * @param {{ pattern: string, model: { format?: string } }} entry
     * @param {{ archivePath: string }[]} exportedEntries
     * @returns {string}
     */
    static #resolveArchivePath(entry, exportedEntries) {
        const sanitizedPattern = PcbModelArchiveExporter.#sanitizeFileToken(
            entry.pattern
        )
        const extension = PcbModelArchiveExporter.#resolveExtension(
            entry.model?.format
        )
        const basePath = sanitizedPattern + '.' + extension
        let archivePath = basePath
        let duplicateIndex = 2

        while (
            exportedEntries.some(
                (exportedEntry) => exportedEntry.archivePath === archivePath
            )
        ) {
            archivePath =
                sanitizedPattern + '--' + duplicateIndex + '.' + extension
            duplicateIndex += 1
        }

        return archivePath
    }

    /**
     * Resolves one archive path for a stitched component STEP.
     * @param {{ designator: string }} entry Stitched entry.
     * @param {{ archivePath: string }[]} exportedEntries Existing entries.
     * @returns {string}
     */
    static #resolveStitchedArchivePath(entry, exportedEntries) {
        const sanitizedDesignator = PcbModelArchiveExporter.#sanitizeFileToken(
            entry.designator
        )
        const basePath = 'stitched-components/' + sanitizedDesignator + '.step'
        let archivePath = basePath
        let duplicateIndex = 2

        while (
            exportedEntries.some(
                (exportedEntry) => exportedEntry.archivePath === archivePath
            )
        ) {
            archivePath =
                'stitched-components/' +
                sanitizedDesignator +
                '--' +
                duplicateIndex +
                '.step'
            duplicateIndex += 1
        }

        return archivePath
    }

    /**
     * Reads one resolved model into ZIP-ready bytes.
     * @param {{ origin?: string, payloadText?: string, file?: Blob | File | null }} model
     * @returns {Promise<Uint8Array>}
     */
    static async #readModelBytes(model) {
        if (model?.origin === 'embedded') {
            const payloadText = String(model?.payloadText || '')
            if (!payloadText) {
                throw new Error('Embedded STEP payload is unavailable.')
            }

            return new TextEncoder().encode(payloadText)
        }

        if (typeof model?.file?.arrayBuffer === 'function') {
            return new Uint8Array(await model.file.arrayBuffer())
        }

        throw new Error('Session model bytes are unavailable.')
    }

    /**
     * Resolves one user-facing archive name from the provided base name.
     * @param {string | undefined} archiveBaseName
     * @returns {string}
     */
    static #resolveArchiveName(archiveBaseName) {
        const sanitizedBaseName = PcbModelArchiveExporter.#sanitizeFileToken(
            archiveBaseName || 'pcb-models'
        )

        return sanitizedBaseName + '-models.zip'
    }

    /**
     * Resolves the preferred export label for one model placement.
     * @param {{ pattern?: string, designator?: string, externalModel?: any } | null} component
     * @param {{ designator?: string, externalModel?: any } | null} placement
     * @returns {string}
     */
    static #resolvePattern(component, placement) {
        const componentPattern = String(component?.pattern || '').trim()
        if (componentPattern) {
            return componentPattern
        }

        const designator = String(
            component?.designator || placement?.designator || ''
        ).trim()
        if (designator) {
            return designator
        }

        return PcbModelArchiveExporter.#stripExtension(
            String(
                component?.externalModel?.name ||
                    placement?.externalModel?.name ||
                    'model'
            )
        )
    }

    /**
     * Resolves a stable identity key for one model so repeated placements can
     * be deduplicated.
     * @param {{ origin?: string, relativePath?: string, sourceStream?: string, name?: string, checksum?: number | null, format?: string }} model
     * @returns {string}
     */
    static #resolveModelIdentity(model) {
        if (String(model?.origin || '') === 'embedded') {
            return [
                'embedded',
                String(model?.sourceStream || ''),
                String(model?.name || ''),
                String(model?.checksum || ''),
                String(model?.format || '')
            ].join('::')
        }

        return [
            'session',
            String(model?.relativePath || ''),
            String(model?.name || ''),
            String(model?.format || '')
        ].join('::')
    }

    /**
     * Resolves a safe archive extension from the model format.
     * @param {string | undefined} format
     * @returns {string}
     */
    static #resolveExtension(format) {
        const normalizedFormat = String(format || '')
            .trim()
            .toLowerCase()
        if (normalizedFormat === 'wrl') {
            return 'wrl'
        }

        return 'step'
    }

    /**
     * Resolves a normalized RGB color for a static body mesh.
     * @param {{ bodyColor?: object, geometry?: object }} placement Static body placement.
     * @returns {number[]}
     */
    static #bodyColor(placement) {
        const rgb =
            placement?.bodyColor?.rgb || placement?.geometry?.bodyColor?.rgb
        if (rgb) {
            return [
                PcbModelArchiveExporter.#colorChannel(rgb.red),
                PcbModelArchiveExporter.#colorChannel(rgb.green),
                PcbModelArchiveExporter.#colorChannel(rgb.blue)
            ]
        }

        return STATIC_BODY_COLOR
    }

    /**
     * Normalizes one 8-bit color channel to [0, 1].
     * @param {number | undefined} channel Source channel.
     * @returns {number}
     */
    static #colorChannel(channel) {
        const value = Number(channel)
        return Number.isFinite(value)
            ? Math.min(1, Math.max(0, value / 255))
            : 0.5
    }

    /**
     * Normalizes a value to an array.
     * @param {unknown} value Candidate value.
     * @returns {any[]}
     */
    static #array(value) {
        return Array.isArray(value) ? value : []
    }

    /**
     * Removes the trailing extension from one file name.
     * @param {string} value
     * @returns {string}
     */
    static #stripExtension(value) {
        return String(value || '').replace(/\.[^.]+$/, '')
    }

    /**
     * Normalizes one token for internal dedupe keys.
     * @param {string} value
     * @returns {string}
     */
    static #normalizeToken(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
    }

    /**
     * Sanitizes one archive token so pattern-derived names stay readable and
     * cannot introduce nested paths.
     * @param {string} value
     * @returns {string}
     */
    static #sanitizeFileToken(value) {
        const sanitizedValue = String(value || '')
            .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
            .replace(/\s+/g, ' ')
            .trim()

        if (sanitizedValue) {
            return sanitizedValue
        }

        return 'model'
    }
}
