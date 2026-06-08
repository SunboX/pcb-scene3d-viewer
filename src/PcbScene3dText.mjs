const FALLBACK_MESSAGES = {
    'scene3d.boardEnvelopeSuffix': 'mil board envelope',
    'scene3d.boardPosition': 'Board position',
    'scene3d.bodyPosition': 'Body position',
    'scene3d.bodyRotation': 'Body rotation',
    'scene3d.bomGroups': 'BOM groups',
    'scene3d.bottom': 'Bottom',
    'scene3d.companionModelsHint':
        'Companion models will be used when matching WRL or STEP files are loaded in the session.',
    'scene3d.componentInspector': 'Component inspector',
    'scene3d.componentsSuffix': 'components',
    'scene3d.controlsAria': '3D detail toggles',
    'scene3d.copperDetail': 'Copper detail',
    'scene3d.designator': 'Designator',
    'scene3d.downloadModelsZip': 'Download Models ZIP',
    'scene3d.downloaded': 'Downloaded',
    'scene3d.entries': 'entries',
    'scene3d.entry': 'entry',
    'scene3d.exportFailed': 'Model ZIP export failed:',
    'scene3d.externalModel': 'External model',
    'scene3d.externalModels': 'External models',
    'scene3d.fallbackBody': 'Fallback body',
    'scene3d.fallbackBodies': 'Fallback bodies',
    'scene3d.footprint': 'Footprint',
    'scene3d.inspectPrompt': 'Click a component to inspect it.',
    'scene3d.interactiveViewAria': 'Interactive 3D PCB view',
    'scene3d.isometric': 'Isometric',
    'scene3d.loading': 'Preparing 3D scene...',
    'scene3d.model': 'Model',
    'scene3d.modelFile': 'model file',
    'scene3d.modelFiles': 'model files',
    'scene3d.modelRotation': 'Model rotation',
    'scene3d.mountSide': 'Mount side',
    'scene3d.noMetadataFor': 'No metadata is available for',
    'scene3d.noModelsForExport':
        'No STEP or WRL models were resolved for export.',
    'scene3d.noPcb': '3D preview is available after loading a PCB document.',
    'scene3d.pattern': 'Pattern',
    'scene3d.picked': 'Picked',
    'scene3d.placements': 'Placements',
    'scene3d.pointerHint':
        'Drag to orbit, right-drag to pan, and use the wheel to zoom.',
    'scene3d.rotation': 'Rotation',
    'scene3d.skipped': 'Skipped',
    'scene3d.source': 'Source',
    'scene3d.startFailed': '3D preview could not start:',
    'scene3d.stillPreparing': '3D scene is still preparing.',
    'scene3d.title': '3D preview',
    'scene3d.to': 'to',
    'scene3d.toolbarAria': '3D camera presets',
    'scene3d.top': 'Top',
    'scene3d.touchHint':
        'Drag with one finger to orbit, pinch to zoom, and drag with two fingers to pan.',
    'scene3d.unresolved': 'unresolved'
}

/**
 * Fallback-aware text helpers for viewer-owned UI copy.
 */
export class PcbScene3dText {
    /**
     * Translates one key with English fallback copy.
     * @param {((key: string) => string) | null | undefined} translate
     * Host translation lookup.
     * @param {string} key Message key.
     * @returns {string}
     */
    static translate(translate, key) {
        if (typeof translate !== 'function') {
            return PcbScene3dText.fallback(key)
        }

        const value = translate(key)
        if (!value || value === key) {
            return PcbScene3dText.fallback(key)
        }

        return value
    }

    /**
     * Creates a stable translator function with English fallback copy.
     * @param {((key: string) => string) | null | undefined} translate
     * Host translation lookup.
     * @returns {(key: string) => string}
     */
    static createTranslator(translate) {
        return (key) => PcbScene3dText.translate(translate, key)
    }

    /**
     * Returns English fallback copy for one key.
     * @param {string} key Message key.
     * @returns {string}
     */
    static fallback(key) {
        return FALLBACK_MESSAGES[key] || key
    }
}
