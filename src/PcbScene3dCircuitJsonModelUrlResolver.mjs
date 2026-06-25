const PACKAGE_DOWNLOAD_PATH = '/package_files/download'

/**
 * Resolves CircuitJSON model URL metadata without fetching model content.
 */
export class PcbScene3dCircuitJsonModelUrlResolver {
    /**
     * Resolves one model URL against an optional project base URL.
     * @param {string} sourceUrl Source model URL.
     * @param {unknown} projectBaseUrl Optional project base URL.
     * @returns {string}
     */
    static resolve(sourceUrl, projectBaseUrl) {
        const trimmedUrl = String(sourceUrl || '').trim()
        const baseUrl = String(projectBaseUrl || '').trim()
        if (!trimmedUrl || !baseUrl) {
            return ''
        }

        try {
            const packageModel =
                PcbScene3dCircuitJsonModelUrlResolver.#packageModelPath(
                    trimmedUrl
                )
            if (packageModel) {
                const downloadUrl = new URL(PACKAGE_DOWNLOAD_PATH, baseUrl)
                downloadUrl.searchParams.set(
                    'package_name_with_version',
                    PcbScene3dCircuitJsonModelUrlResolver.#packageNameWithVersion(
                        packageModel.packageName
                    )
                )
                downloadUrl.searchParams.set('file_path', packageModel.filePath)
                return downloadUrl.toString()
            }
            return new URL(trimmedUrl, baseUrl).toString()
        } catch (_error) {
            return ''
        }
    }

    /**
     * Extracts package and file path metadata from a package-style model path.
     * @param {string} sourceUrl Source model URL.
     * @returns {{ packageName: string, filePath: string } | null}
     */
    static #packageModelPath(sourceUrl) {
        const cleanUrl = String(sourceUrl || '')
            .split(/[?#]/u)[0]
            .replaceAll('\\', '/')
        const marker = 'node_modules/'
        const markerIndex = cleanUrl.indexOf(marker)
        if (markerIndex < 0) {
            return null
        }

        const parts = cleanUrl
            .slice(markerIndex + marker.length)
            .split('/')
            .filter(Boolean)
        if (!parts.length) {
            return null
        }

        const packageName = parts[0].startsWith('@')
            ? parts.length >= 2
                ? PcbScene3dCircuitJsonModelUrlResolver.#normalizedScopedPackageName(
                      parts[0],
                      parts[1]
                  )
                : ''
            : parts[0]
        const fileParts = parts.slice(packageName.startsWith('@') ? 2 : 1)
        const filePath =
            PcbScene3dCircuitJsonModelUrlResolver.#packageDownloadFilePath(
                fileParts.join('/')
            )
        if (!packageName || !filePath) {
            return null
        }

        return {
            packageName,
            filePath
        }
    }

    /**
     * Resolves scoped package aliases into registry package names.
     * @param {string} scope Package scope.
     * @param {string} scopedName Scoped package name segment.
     * @returns {string}
     */
    static #normalizedScopedPackageName(scope, scopedName) {
        if (scope === '@tsci' && String(scopedName || '').includes('.')) {
            const dotIndex = String(scopedName).indexOf('.')
            const author = String(scopedName).slice(0, dotIndex)
            const packageName = String(scopedName).slice(dotIndex + 1)
            if (author && packageName) {
                return `@${author}/${packageName}`
            }
        }

        return scope + '/' + scopedName
    }

    /**
     * Resolves a package download file path under the package dist folder.
     * @param {string} filePath Package-local model file path.
     * @returns {string}
     */
    static #packageDownloadFilePath(filePath) {
        const normalizedPath = String(filePath || '')
            .replaceAll('\\', '/')
            .split('/')
            .filter(Boolean)
            .join('/')
        if (!normalizedPath) {
            return ''
        }

        return normalizedPath.startsWith('dist/')
            ? normalizedPath
            : 'dist/' + normalizedPath
    }

    /**
     * Appends a default package version when the path did not include one.
     * @param {string} packageName Package name.
     * @returns {string}
     */
    static #packageNameWithVersion(packageName) {
        const name = String(packageName || '').trim()
        if (!name) {
            return ''
        }
        if (name.startsWith('@')) {
            return /^@[^/]+\/[^@]+@/u.test(name) ? name : name + '@latest'
        }
        return name.includes('@') ? name : name + '@latest'
    }
}
