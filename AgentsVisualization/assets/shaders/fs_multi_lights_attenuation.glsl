#version 300 es
precision highp float;

const int NUM_LIGHTS = 30;

in vec3 v_normal;
in vec3 v_surfaceWorldPosition;
in vec3 v_surfaceToView;
in vec2 v_texCoord;

uniform float u_shininess;

uniform sampler2D u_texture;
uniform vec4 u_color;
uniform bool u_useTexture;

uniform vec3 u_lightWorldPosition[NUM_LIGHTS];
uniform vec4 u_ambientLight;
uniform vec4 u_diffuseLight[NUM_LIGHTS];
uniform vec4 u_specularLight[NUM_LIGHTS];

// Attenuation values for the lights
uniform float u_constant;
uniform float u_linear;
uniform float u_quadratic;

out vec4 outColor;

void main() {
    // Use texture if available, otherwise use solid color
    vec4 color = u_useTexture ? texture(u_texture, v_texCoord) : u_color;

    // v_normal must be normalized because the shader will interpolate
    // it for each pixel
    vec3 normal = normalize(v_normal);

    vec3 surfToViewDirection = normalize(v_surfaceToView);

    // Compute the three parts of the Phong lighting model
    vec4 ambientColor = color * u_ambientLight;
    vec4 diffuseColor = vec4(0, 0, 0, 1);
    vec4 specularColor = vec4(0, 0, 0, 1);

    for (int i=0; i<NUM_LIGHTS; i++) {
        // Calculate surface to light direction and distance squared
        vec3 surfaceToLight = u_lightWorldPosition[i] - v_surfaceWorldPosition;
        float distanceSquared = dot(surfaceToLight, surfaceToLight);
        float attenuation = 1.0 / (u_constant + u_linear * sqrt(distanceSquared) + u_quadratic * distanceSquared);

        vec3 surfToLigthDirection = normalize(surfaceToLight);
        // Finding the reflection vector
        // https://en.wikipedia.org/wiki/Phong_reflection_model
        vec3 reflectionVector = (2.0 * dot(surfToLigthDirection, normal)
            * normal - surfToLigthDirection);

        float light = max(dot(normal, surfToLigthDirection), 0.0);
        float specular = 0.0;
        if (light > 0.0) {
            float specular_dot = dot(surfToViewDirection, reflectionVector);
            specular = pow(max(specular_dot, 0.0), u_shininess);
        }

        diffuseColor += (light * color * u_diffuseLight[i]) * attenuation;
        specularColor += (specular * color * u_specularLight[i]) * attenuation;
    }

    // Use the color of the texture on the object
    outColor = ambientColor + diffuseColor + specularColor;
}
