import { PcbScene3dBufferAttributeFactory } from './PcbScene3dBufferAttributeFactory.mjs'

/**
 * Converts normalized faceted assembly meshes into live Three.js groups.
 */
export class PcbScene3dFacetedModelGroupBuilder {
    /**
     * Builds a Three.js group from normalized mesh rows.
     * @param {any} THREE Three.js namespace.
     * @param {object[]} meshes Normalized faceted meshes.
     * @returns {any}
     */
    static build(THREE, meshes) {
        const group = new THREE.Group()
        for (const mesh of Array.isArray(meshes) ? meshes : []) {
            const threeMesh = PcbScene3dFacetedModelGroupBuilder.#buildMesh(
                THREE,
                mesh
            )
            if (threeMesh) group.add(threeMesh)
        }
        if (!group.children.length) {
            throw new Error('External model contains no renderable meshes.')
        }
        return group
    }

    /**
     * Builds one Three.js mesh from normalized vertices and faces.
     * @param {any} THREE Three.js namespace.
     * @param {object} mesh Normalized faceted mesh.
     * @returns {any | null}
     */
    static #buildMesh(THREE, mesh) {
        const vertices = Array.isArray(mesh?.vertices) ? mesh.vertices : []
        const indices = PcbScene3dFacetedModelGroupBuilder.#indices(mesh?.faces)
        if (!vertices.length || !indices.length) return null

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute(
            'position',
            PcbScene3dBufferAttributeFactory.createFloat32(
                THREE,
                vertices.flatMap((vertex) => [
                    Number(vertex?.[0] || 0),
                    Number(vertex?.[1] || 0),
                    Number(vertex?.[2] || 0)
                ]),
                3
            )
        )
        geometry.setIndex(
            PcbScene3dBufferAttributeFactory.createUint32(THREE, indices, 1)
        )
        const colorAttribute = PcbScene3dFacetedModelGroupBuilder.#vertexColors(
            mesh,
            vertices
        )
        if (colorAttribute.values.length) {
            geometry.setAttribute(
                'color',
                PcbScene3dBufferAttributeFactory.createFloat32(
                    THREE,
                    colorAttribute.values,
                    colorAttribute.itemSize
                )
            )
        }
        geometry.computeVertexNormals()
        geometry.computeBoundingSphere()

        const result = new THREE.Mesh(
            geometry,
            PcbScene3dFacetedModelGroupBuilder.#material(
                THREE,
                mesh,
                colorAttribute
            )
        )
        result.name = String(mesh?.name || '')
        return result
    }

    /**
     * Triangulates polygon faces into a packed index array.
     * @param {unknown} faces Polygon face rows.
     * @returns {number[]}
     */
    static #indices(faces) {
        const indices = []
        for (const face of Array.isArray(faces) ? faces : []) {
            if (!Array.isArray(face) || face.length < 3) continue
            const first = Number(face[0])
            for (let index = 1; index + 1 < face.length; index += 1) {
                indices.push(
                    first,
                    Number(face[index]),
                    Number(face[index + 1])
                )
            }
        }
        return indices.filter((index) => Number.isInteger(index) && index >= 0)
    }

    /**
     * Flattens optional RGB or RGBA vertex colors into RGB attributes.
     * @param {object} mesh Normalized faceted mesh.
     * @param {unknown[]} vertices Mesh vertices.
     * @returns {{ values: number[], itemSize: number, transparent: boolean }}
     */
    static #vertexColors(mesh, vertices) {
        if (!Array.isArray(mesh?.vertexColors)) {
            return { values: [], itemSize: 3, transparent: false }
        }
        const fallback = PcbScene3dFacetedModelGroupBuilder.#color(mesh)
        const itemSize = mesh.vertexColors.some(
            (color) => Array.isArray(color) && color.length >= 4
        )
            ? 4
            : 3
        let transparent = false
        const values = vertices.flatMap((_vertex, index) => {
            const color = mesh.vertexColors[index]
            const channels = [0, 1, 2].map((channel) =>
                PcbScene3dFacetedModelGroupBuilder.#unit(
                    color?.[channel],
                    fallback[channel]
                )
            )
            if (itemSize === 4) {
                const alpha = PcbScene3dFacetedModelGroupBuilder.#unit(
                    color?.[3],
                    1
                )
                transparent ||= alpha < 1
                channels.push(alpha)
            }
            return channels
        })
        return { values, itemSize, transparent }
    }

    /**
     * Creates a color- and opacity-preserving Three.js material.
     * @param {any} THREE Three.js namespace.
     * @param {object} mesh Normalized faceted mesh.
     * @param {{ values: number[], transparent: boolean }} colorAttribute Vertex-color metadata.
     * @returns {any}
     */
    static #material(THREE, mesh, colorAttribute) {
        const color = PcbScene3dFacetedModelGroupBuilder.#color(mesh)
        const opacity = PcbScene3dFacetedModelGroupBuilder.#opacity(mesh)
        const options = {
            color: new THREE.Color(color[0], color[1], color[2]),
            opacity,
            transparent: opacity < 1 || colorAttribute.transparent,
            vertexColors: colorAttribute.values.length > 0
        }
        if (THREE.DoubleSide !== undefined) options.side = THREE.DoubleSide

        const source = mesh?.material || {}
        if (THREE.MeshPhongMaterial && Array.isArray(source.specularColor)) {
            options.specular = new THREE.Color(
                Number(source.specularColor[0] || 0),
                Number(source.specularColor[1] || 0),
                Number(source.specularColor[2] || 0)
            )
            options.shininess = Number(source.shininess || 30)
            return new THREE.MeshPhongMaterial(options)
        }
        return new THREE.MeshStandardMaterial({
            ...options,
            roughness: 0.56,
            metalness: 0.14
        })
    }

    /**
     * Resolves one normalized base color.
     * @param {object} mesh Normalized faceted mesh.
     * @returns {number[]}
     */
    static #color(mesh) {
        const color = Array.isArray(mesh?.color)
            ? mesh.color
            : [0.78, 0.78, 0.78]
        return [0, 1, 2].map((index) =>
            PcbScene3dFacetedModelGroupBuilder.#unit(color[index], 0.78)
        )
    }

    /**
     * Resolves normalized material opacity.
     * @param {object} mesh Normalized faceted mesh.
     * @returns {number}
     */
    static #opacity(mesh) {
        const colorAlpha = Array.isArray(mesh?.color) ? mesh.color[3] : null
        return PcbScene3dFacetedModelGroupBuilder.#unit(
            colorAlpha ?? mesh?.material?.alpha,
            1
        )
    }

    /**
     * Clamps one material channel into the unit interval.
     * @param {unknown} value Channel value.
     * @param {number} fallback Fallback channel value.
     * @returns {number}
     */
    static #unit(value, fallback) {
        const number = Number(value)
        return Number.isFinite(number)
            ? Math.min(Math.max(number, 0), 1)
            : fallback
    }
}
