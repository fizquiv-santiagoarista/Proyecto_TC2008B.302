#version 300 es
in vec4 a_position;
in vec3 a_normal;
in vec2 a_texCoord;

uniform mat4 u_world;
uniform mat4 u_worldInverseTransform;
uniform mat4 u_worldViewProjection;

out vec3 v_normal;
out vec3 v_surfaceWorldPosition;
out vec2 v_texCoord;

void main() {
    // Pass along the texture coordinates
    v_texCoord = a_texCoord;

    // Transform the position of the vertices
    gl_Position = u_worldViewProjection * a_position;

    // Transform normal to world space
    v_normal = mat3(u_worldInverseTransform) * a_normal;

    // Pass world position to fragment shader for light calculations
    v_surfaceWorldPosition = (u_world * a_position).xyz;
}
