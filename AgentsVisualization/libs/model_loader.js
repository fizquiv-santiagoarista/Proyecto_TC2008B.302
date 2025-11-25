/*
 * Model Loader for OBJ files
 * Provides utilities to load OBJ models and create Object3D instances
 * with proper geometry and materials
 *
 * Santiago Arista Viramontes
 * 2025-11-25
 */

'use strict';

import * as twgl from 'twgl-base.js';
import { Object3D } from './object3d.js';
import { loadObj, loadMtl } from './obj_loader.js';

/**
 * Model cache to avoid loading the same model multiple times
 */
const modelCache = {};

/**
 * Load an OBJ file from a URL
 * @param {string} url - The URL to the OBJ file
 * @returns {Promise<string>} The OBJ file content
 */
async function fetchOBJ(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load OBJ: ${url} (${response.status})`);
        }
        return await response.text();
    } catch (error) {
        console.error(`Error loading OBJ file: ${url}`, error);
        throw error;
    }
}

/**
 * Load an MTL file from a URL
 * @param {string} url - The URL to the MTL file
 * @returns {Promise<string>} The MTL file content
 */
async function fetchMTL(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Could not load MTL: ${url} (${response.status})`);
            return null;
        }
        return await response.text();
    } catch (error) {
        console.warn(`Error loading MTL file: ${url}`, error);
        return null;
    }
}

/**
 * Load a model from an OBJ file with optional MTL file
 * @param {string} objPath - Path to the OBJ file (relative to assets/models/)
 * @param {string} mtlPath - Optional path to the MTL file (relative to assets/models/)
 * @returns {Promise<Object>} Model data with arrays for WebGL
 */
async function loadModel(objPath, mtlPath = null) {
    // Check cache first
    const cacheKey = `${objPath}:${mtlPath || 'none'}`;
    if (modelCache[cacheKey]) {
        console.log(`✓ Using cached model: ${objPath}`);
        return modelCache[cacheKey];
    }

    console.log(`⏳ Loading model: ${objPath}`);

    // Construct full URLs
    const objUrl = `/assets/models/${objPath}`;
    const mtlUrl = mtlPath ? `/assets/models/${mtlPath}` : null;

    try {
        // Load MTL first if provided
        if (mtlUrl) {
            console.log(`  Loading MTL: ${mtlPath}`);
            const mtlContent = await fetchMTL(mtlUrl);
            if (mtlContent) {
                loadMtl(mtlContent);
                console.log(`  ✓ MTL loaded`);
            }
        }

        // Load OBJ
        console.log(`  Loading OBJ: ${objPath}`);
        const objContent = await fetchOBJ(objUrl);
        const arrays = loadObj(objContent);

        // Validate the arrays
        if (!arrays || !arrays.a_position || arrays.a_position.data.length === 0) {
            throw new Error(`Model has no vertex data: ${objPath}`);
        }

        // Cache the model data
        modelCache[cacheKey] = arrays;

        console.log(`✓ Successfully loaded model: ${objPath} (${arrays.a_position.data.length / 3} vertices)`);
        return arrays;
    } catch (error) {
        console.error(`❌ Failed to load model: ${objPath}`, error);
        console.error(`   URL tried: ${objUrl}`);
        throw error;
    }
}

/**
 * Create an Object3D with a loaded model
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {Object} programInfo - Shader program info
 * @param {string} objPath - Path to the OBJ file
 * @param {string} mtlPath - Optional path to the MTL file
 * @param {number} id - Object ID
 * @param {Array} position - Initial position [x, y, z]
 * @param {Array} rotation - Initial rotation [x, y, z] in degrees
 * @param {Array} scale - Initial scale [x, y, z]
 * @returns {Promise<Object3D>} Configured Object3D instance
 */
async function createModelObject(
    gl,
    programInfo,
    objPath,
    mtlPath = null,
    id = -1,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1]
) {
    try {
        // Load the model (returns arrays, not string)
        const modelData = await loadModel(objPath, mtlPath);

        // Create Object3D
        const obj = new Object3D(id, position, rotation, scale);

        // Don't use prepareVAO since we already have the arrays
        // Instead, set the arrays directly and create buffer info
        obj.arrays = modelData;
        obj.bufferInfo = twgl.createBufferInfoFromArrays(gl, obj.arrays);
        obj.vao = twgl.createVAOFromBufferInfo(gl, programInfo, obj.bufferInfo);

        return obj;
    } catch (error) {
        console.error(`❌ Failed to create model object: ${objPath}`, error);
        throw error;
    }
}

/**
 * Create multiple instances of the same model
 * Useful for creating many objects that share the same geometry
 * @param {WebGL2RenderingContext} gl - WebGL context
 * @param {Object} programInfo - Shader program info
 * @param {string} objPath - Path to the OBJ file
 * @param {string} mtlPath - Optional path to the MTL file
 * @param {Array} instances - Array of instance configs [{id, position, rotation, scale}, ...]
 * @returns {Promise<Array<Object3D>>} Array of configured Object3D instances
 */
async function createModelInstances(
    gl,
    programInfo,
    objPath,
    mtlPath = null,
    instances = []
) {
    // Load the model once
    const modelData = await loadModel(objPath, mtlPath);

    // Create base object with VAO
    const baseObject = new Object3D(-1);
    baseObject.prepareVAO(gl, programInfo, modelData);

    // Create instances that share the same VAO
    const objects = instances.map(config => {
        const obj = new Object3D(
            config.id || -1,
            config.position || [0, 0, 0],
            config.rotation || [0, 0, 0],
            config.scale || [1, 1, 1]
        );

        // Share the VAO and buffer data
        obj.arrays = baseObject.arrays;
        obj.bufferInfo = baseObject.bufferInfo;
        obj.vao = baseObject.vao;

        // Set custom color if provided
        if (config.color) {
            obj.color = config.color;
        }

        return obj;
    });

    console.log(`Created ${objects.length} instances of model: ${objPath}`);
    return objects;
}

/**
 * Preload multiple models at once
 * @param {Array<Object>} models - Array of {objPath, mtlPath} objects
 * @returns {Promise<void>}
 */
async function preloadModels(models) {
    console.log(`Preloading ${models.length} models...`);
    const promises = models.map(model => loadModel(model.objPath, model.mtlPath));
    await Promise.all(promises);
    console.log('All models preloaded successfully');
}

/**
 * Clear the model cache
 */
function clearModelCache() {
    Object.keys(modelCache).forEach(key => delete modelCache[key]);
    console.log('Model cache cleared');
}

export {
    loadModel,
    createModelObject,
    createModelInstances,
    preloadModels,
    clearModelCache
};
