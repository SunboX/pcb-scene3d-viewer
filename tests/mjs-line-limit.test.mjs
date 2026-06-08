import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const LINE_LIMIT = 1000
const root = new URL('../', import.meta.url)

/**
 * Recursively collects .mjs files below one package-relative directory.
 * @param {string} relativeDirectory Package-relative directory path.
 * @returns {Promise<string[]>}
 */
async function collectMjsFiles(relativeDirectory) {
    const directory = new URL(relativeDirectory, root)
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(
        entries.map(async (entry) => {
            const relativePath = path.posix.join(relativeDirectory, entry.name)
            if (entry.isDirectory()) {
                return collectMjsFiles(relativePath)
            }
            return entry.isFile() && entry.name.endsWith('.mjs')
                ? [relativePath]
                : []
        })
    )

    return files.flat()
}

/**
 * Verifies all source and test modules stay below the max line limit.
 */
test('all package .mjs files stay below line limit', async () => {
    const packageFiles = (
        await Promise.all(['src', 'tests'].map(collectMjsFiles))
    ).flat()
    const oversized = []

    for (const relativePath of packageFiles) {
        const source = await readFile(new URL(relativePath, root), 'utf8')
        const lineCount = source.split('\n').length
        if (lineCount >= LINE_LIMIT) {
            oversized.push(relativePath + ' (' + lineCount + ' lines)')
        }
    }

    assert.deepEqual(
        oversized,
        [],
        'Found modules at or above ' +
            LINE_LIMIT +
            ' lines:\n' +
            oversized.join('\n')
    )
})
