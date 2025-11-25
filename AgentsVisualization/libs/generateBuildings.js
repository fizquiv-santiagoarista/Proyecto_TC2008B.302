/*
 * Building Generator in OBJ Format
 * Generates a truncated cone (building) with customizable parameters
 *
 * Usage: node generateBuilding.js [sides] [height] [baseRadius] [topRadius]
 * Default values: 8 sides, 6.0 height, 1.0 base radius, 0.8 top radius
 *
 * Santiago Arista Viramontes
 * 2025-11-24
 */

'use strict';

/**
 * V3 class for 3D vector operations using Float32Array
 */
class V3 {
    static create(x, y, z) {
        const v = new Float32Array(3);
        v[0] = x
        v[1] = y
        v[2] = z
        return v;
    }

    static length(v) {
        return Math.hypot(v[0], v[1], v[2]);
    }

    static normalize(v, dest) {
        dest = dest || new Float32Array(3);
        const len = V3.length(v);
        if (len > 0) {
            dest[0] = v[0] / len;
            dest[1] = v[1] / len;
            dest[2] = v[2] / len;
        }else{
            dest[0] = 0;
            dest[1] = 0;
            dest[2] = 0;
        }
        return dest;
    }

    static dot(u, v) {
        return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
    }

    static cross(u, v, dest) {
        dest = dest || new Float32Array(3)
        dest[0] = (u[1] * v[2] - u[2] * v[1])
        dest[1] = (u[2] * v[0] - u[0] * v[2])
        dest[2] = (u[0] * v[1] - u[1] * v[0])
        return dest;
    }

    static add(u, v, dest) {
        dest = dest || new Float32Array(3)
        dest[0] = u[0] + v[0]
        dest[1] = u[1] + v[1]
        dest[2] = u[2] + v[2]
        return dest;
    }

    static subtract(u, v, dest) {
        dest = dest || new Float32Array(3)
        dest[0] = u[0] - v[0]
        dest[1] = u[1] - v[1]
        dest[2] = u[2] - v[2]
        return dest;
    }
}

// =============================================================================
// Main Configuration and Parameters
// =============================================================================

// Parse command line arguments
const args = process.argv.slice(2);
const sides = args[0] ? parseInt(args[0]) : 8;
const height = args[1] ? parseFloat(args[1]) : 6.0;
const baseRadius = args[2] ? parseFloat(args[2]) : 1.0;
const topRadius = args[3] ? parseFloat(args[3]) : 0.8;

// Validate input
if (sides < 3 || sides > 36) {
    console.error('Error: Number of sides must be between 3 and 36');
    process.exit(1);
}

if (height <= 0 || baseRadius <= 0 || topRadius <= 0) {
    console.error('Error: Height and radii must be positive numbers');
    process.exit(1);
}

// =============================================================================
// Geometry Generation Functions
// =============================================================================

/**
 * Generate vertices for the building
 */
function generateVertices(sides, height, baseRadius, topRadius) {
    const vertices = [];
    
    // Center vertices
    vertices.push(V3.create(0, 0, 0)); // Base center (index 0)
    vertices.push(V3.create(0, height, 0)); // Top center (index 1)
    
    // Generate vertices around the base and top circles
    for (let i = 0; i < sides; i++) {
        const angle = (2 * Math.PI * i) / sides;
        const x = Math.cos(angle);
        const z = Math.sin(angle);
        
        // Base circle vertices
        vertices.push(V3.create(x * baseRadius, 0, z * baseRadius));
        
        // Top circle vertices
        vertices.push(V3.create(x * topRadius, height, z * topRadius));
    }
    
    return vertices;
}

/**
 * Generate faces for the building
 * Faces are defined counter-clockwise when viewed from outside
 */
function generateFaces(sides) {
    const faces = [];
    
    // Helper function to add a face
    function addFace(v1, v2, v3) {
        faces.push({ v1, v2, v3 });
    }
    
    // Base faces (bottom cap) - looking from below, counter-clockwise
    for (let i = 0; i < sides; i++) {
        const current = 3 + i * 2;
        const next = 3 + ((i + 1) % sides) * 2;
        
        // Triangle: center, next, current (counter-clockwise from below)
        addFace(1, next, current);
    }
    
    // Top faces (top cap) - looking from above, counter-clockwise
    for (let i = 0; i < sides; i++) {
        const current = 2 + i * 2;
        const next = 2 + ((i + 1) % sides) * 2;
        
        // Triangle: center, current, next (counter-clockwise from above)
        addFace(0, current, next);
    }
    
    // Side faces (walls) - counter-clockwise from outside
    for (let i = 0; i < sides; i++) {
        const currentBase = 2 + i * 2;
        const currentTop = 3 + i * 2;
        const nextBase = 2 + ((i + 1) % sides) * 2;
        const nextTop = 3 + ((i + 1) % sides) * 2;
        
        // First triangle of the quad
        addFace(currentBase, currentTop, nextTop);
        
        // Second triangle of the quad
        addFace(currentBase, nextTop, nextBase);
    }
    
    return faces;
}

// =============================================================================
// Normal Calculation Functions
// =============================================================================

/**
 * Calculate normal for a triangle face
 */
function calculateFaceNormal(v1, v2, v3) {
    const edge1 = V3.subtract(v2, v1);
    const edge2 = V3.subtract(v3, v1);
    const normal = V3.cross(edge1, edge2);
    return V3.normalize(normal);
}

/**
 * Generate vertex normals by averaging face normals
 */
function generateVertexNormals(vertices, faces) {
    const normals = [];
    
    // Initialize normals to zero

    for (let i = 0; i < vertices.length; i++) {
        normals.push(V3.create(0, 0, 0));
    }
    
    // Accumulate face normals to vertex normals
    for (const face of faces) {
        const v1 = vertices[face.v1];
        const v2 = vertices[face.v2];
        const v3 = vertices[face.v3];
        const faceNormal = calculateFaceNormal(v1, v2, v3);
        
        V3.add(normals[face.v1], faceNormal, normals[face.v1]);
        V3.add(normals[face.v2], faceNormal, normals[face.v2]);
        V3.add(normals[face.v3], faceNormal, normals[face.v3]);
    }
    
    // Normalize all normals
    for (let i = 0; i < normals.length; i++) {
        normals[i] = V3.normalize(normals[i]);
    }
    
    return normals;
}

// =============================================================================
// OBJ File Generation
// =============================================================================

/**
 * Generate OBJ file content
 */
function generateOBJ(vertices, normals, faces) {
    let obj = '# Building Generator\n';
    obj += `# Sides: ${sides}, Height: ${height}, Base Radius: ${baseRadius}, Top Radius: ${topRadius}\n`;
    obj += '\n';
    
    // Write vertices
    obj += '# Vertices\n';
    for (const v of vertices) {
        obj += `v ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}\n`;
    }
    obj += '\n';
    
    // Write normals
    obj += '# Normals\n';
    for (const n of normals) {
        obj += `vn ${n[0].toFixed(6)} ${n[1].toFixed(6)} ${n[2].toFixed(6)}\n`;
    }
    obj += '\n';
    
    // Write faces
    obj += '# Faces\n';
    for (const f of faces) {
        // OBJ indices are 1-based
        // Format: f v1//vn1 v2//vn2 v3//vn3
        obj += `f ${f.v1 + 1}//${f.v1 + 1} ${f.v2 + 1}//${f.v2 + 1} ${f.v3 + 1}//${f.v3 + 1}\n`;
    }
    
    return obj;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Main function
 */
async function main() {
    console.log('Generating building...');
    console.log(`Sides: ${sides}`);
    console.log(`Height: ${height}`);
    console.log(`Base Radius: ${baseRadius}`);
    console.log(`Top Radius: ${topRadius}`);
    
    // Generate geometry
    const vertices = generateVertices(sides, height, baseRadius, topRadius);
    const faces = generateFaces(sides);
    const normals = generateVertexNormals(vertices, faces);
    
    // Generate OBJ content
    const objContent = generateOBJ(vertices, normals, faces);
    
    // Create filename
    const filename = `building_${sides}_${height}_${baseRadius}_${topRadius}.obj`;
    
    // Write to file
    const fs = await import('fs');
    fs.writeFileSync(filename, objContent);
    
    console.log(`Successfully generated: ${filename}`);
    console.log(`Vertices: ${vertices.length}`);
    console.log(`Faces: ${faces.length}`);
}

// =============================================================================
// Run Program
// =============================================================================

// Run main function
main();
