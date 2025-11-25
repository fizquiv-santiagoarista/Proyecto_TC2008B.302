/*
 * Script to read a model stored in Wavefront OBJ format
 *
 * Gilberto Echeverria
 * 2025-07-29
 */


'use strict';

// Global variable for all materials loaded
// NOTE: This is a bad idea. When materials have the same names,
// it could cause confusion in the scene.
let materials = {};
let materialInUse = undefined;

/*
 * Extract the elements in a face as encoded in an OBJ file
 * As faces are read, pass the information into the array that will be used
 * to draw the object in WebGL
 */
function parseFace(parts, objData, arrays) {
    // This will produce an array of arrays
    // Each arrays corresponds has the vertices
    // Each vertex is an array with its vertex, texture and normal indices
    let faceVerts = parts.slice(1).map(face => face.split('/'));
    faceVerts.forEach(vert => {
        // Skip empty vertices
        if (!vert || vert.length === 0 || vert[0] === '') {
            return;
        }

        const vertexIndex = Number(vert[0]);
        
        // Validate vertex index
        if (!vertexIndex || !objData.vertices[vertexIndex]) {
            console.warn(`Invalid vertex index: ${vert[0]}`);
            return;
        }

        // First element is the vertex index
        arrays.a_position.data.push(...objData.vertices[vertexIndex]);
        
        // Second element is the texture index
        if (vert.length > 1 && vert[1] != "") {
            const texIndex = Number(vert[1]);
            if (objData.textures[texIndex]) {
                arrays.a_texCoord.data.push(...objData.textures[texIndex]);
            } else {
                // Default texture coords if not available
                arrays.a_texCoord.data.push(0, 0);
            }
        } else {
            // Default texture coords
            arrays.a_texCoord.data.push(0, 0);
        }
        
        // Third element is the normal index
        if (vert.length > 2 && vert[2] != "") {
            const normalIndex = Number(vert[2]);
            if (objData.normals[normalIndex]) {
                arrays.a_normal.data.push(...objData.normals[normalIndex]);
            } else {
                // Default normal if not available
                arrays.a_normal.data.push(0, 1, 0);
            }
        } else {
            // Default normal
            arrays.a_normal.data.push(0, 1, 0);
        }

        if (materialInUse && materialInUse['Kd']) {
            arrays.a_color.data.push(...materialInUse['Kd'], 1);
        } else {
            // Force a color for each vertex
            arrays.a_color.data.push(0.4, 0.4, 0.4, 1);
        }
        
        // This is not really necessary, but just in case
        objData.faces.push({v: vert[0], t: vert[1], n: vert[2]});
    });
}

/*
 * Read the contents of an OBJ file received as a string
 * Return an object called arrays, with the arrays necessary to build a
 * Vertex Array Object (VAO) for WebGL.
 */
function loadObj(objString) {

    // Initialize a dummy item in the lists as index 0
    // This will make it easier to handle indices starting at 1 as used by OBJ
    let objData = {
        vertices: [ [0, 0, 0] ],
        normals: [ [0, 0, 0] ],
        textures: [ [0, 0, 0] ],
        faces: [ ],
    };

    // The array with the attributes that will be passed to WebGL
    let arrays = {
        a_position: {
            numComponents: 3,
            data: [ ]
        },
        a_color: {
            numComponents: 4,
            data: [ ]
        },
        a_normal: {
            numComponents: 3,
            data: [ ]
        },
        a_texCoord: {
            numComponents: 2,
            data: [ ]
        }
    };

    let partInfo;
    let lines = objString.split('\n');
    lines.forEach(line => {
        let parts = line.split(/\s+/);
        switch (parts[0]) {
            case 'v':
                // Ignore the first part (the keyword),
                // remove any empty elements and convert them into a number
                partInfo = parts.slice(1).filter(v => v != '').map(Number);
                objData.vertices.push(partInfo);
                break;
            case 'vn':
                partInfo = parts.slice(1).filter(vn => vn != '').map(Number);
                objData.normals.push(partInfo);
                break;
            case 'vt':
                partInfo = parts.slice(1).filter(f => f != '').map(Number);
                objData.textures.push(partInfo);
                break;
            case 'f':
                parseFace(parts, objData, arrays);
                break;
            case 'usemtl':
                if (materials.hasOwnProperty(parts[1])) {
                    materialInUse = materials[parts[1]];
                }
                break;
        }
    });

    //console.log("ATTRIBUTES:")
    //console.log(arrays);

    //console.log("OBJ DATA:")
    //console.log(objData);

    return arrays;
}

/*
 * Read the contents of an MTL file received as a string
 * Return an object containing all the materials described inside,
 * with their illumination attributes.
 */
function loadMtl(mtlString) {

    let currentMtl = {};

    let partInfo;
    let lines = mtlString.split('\n');
    lines.forEach(line => {
        let parts = line.split(/\s+/);
        switch (parts[0]) {
            case 'newmtl':
                // Add a new entry into the object
                materials[parts[1]] = {};
                currentMtl = materials[parts[1]];
                break;
            case 'Ns':  // Specular coefficient ("Shininess")
                currentMtl['Ns'] = Number(parts[1]);
                break;
            case 'Kd':  // The specular color
                partInfo = parts.slice(1).filter(v => v != '').map(Number);
                currentMtl['Kd'] = partInfo;
                break;
        }
    });

    return materials;
}

export { loadObj, loadMtl };
