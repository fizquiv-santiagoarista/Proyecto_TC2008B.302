/*
 * Base program for a 3D scene that connects to an API to get the movement
 * of agents.
 * The scene shows colored cubes
 *
 * Gilberto Echeverria
 * 2025-11-08
 */

"use strict";

import * as twgl from "twgl-base.js";
import GUI from "lil-gui";
import { M4 } from "../libs/3d-lib";
import { Scene3D } from "../libs/scene3d";
import { Object3D } from "../libs/object3d";
import { Camera3D } from "../libs/camera3d";
import { Light3D } from "../libs/light3d.js";
// import vsGLSL from "../assets/shaders/vs_color.glsl?raw";
// import fsGLSL from "../assets/shaders/fs_color.glsl?raw";
// import vsFlatGLSL from "../assets/shaders/vs_flat.glsl?raw";
// import fsFlatGLSL from "../assets/shaders/fs_flat.glsl?raw";
// import vsLightGLSL from "../assets/shaders/vs_multi_lights_attenuation.glsl?raw";
// import fsLightGLSL from "../assets/shaders/fs_multi_lights_attenuation.glsl?raw";

// Model loader for OBJ files
import { createModelObject } from "../libs/model_loader.js";

// Functions and arrays for the communication with the API
import {
  agents,
  obstacles,
  destinations,
  trafficLights,
  initAgentsModel,
  update,
  getAgents,
  getObstacles,
  getTrafficLights,
  getDestinations,
} from "../libs/api_connection.js";

// Define the shader code, using GLSL 3.00
import vsGLSL from "../assets/shaders/vs_color.glsl?raw";
import fsGLSL from "../assets/shaders/fs_color.glsl?raw";
import vsFlatGLSL from "../assets/shaders/vs_flat.glsl?raw";
import fsFlatGLSL from "../assets/shaders/fs_flat.glsl?raw";
import vsLightGLSL from "../assets/shaders/vs_multi_lights.glsl?raw";
import fsLightGLSL from "../assets/shaders/fs_multi_lights.glsl?raw";

const scene = new Scene3D();

/*
// Variable for the scene settings
const settings = {
    // Speed in degrees
    rotationSpeed: {
        x: 0,
        y: 0,
        z: 0,
    },
};
*/

// Global variables
let colorProgramInfo = undefined;
let flatProgramInfo = undefined;
let lightProgramInfo = undefined;
let gl = undefined;
const duration = 1000; // ms
let elapsed = 0;
let then = 0;

// Traffic light point lights using Light3D class
const trafficLightLights = []; // Array of Light3D instances

// Main function is async to be able to make the requests
async function main() {
  // Setup the canvas area
  const canvas = document.querySelector("canvas");
  gl = canvas.getContext("webgl2");
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Prepare the program with the shaders
  colorProgramInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);
  flatProgramInfo = twgl.createProgramInfo(gl, [vsFlatGLSL, fsFlatGLSL]);
  lightProgramInfo = twgl.createProgramInfo(gl, [vsLightGLSL, fsLightGLSL]);

  // Check if shaders compiled successfully
  if (!colorProgramInfo || !flatProgramInfo || !lightProgramInfo) {
    console.error("Failed to create shader programs");
    console.error("colorProgramInfo:", colorProgramInfo);
    console.error("flatProgramInfo:", flatProgramInfo);
    console.error("lightProgramInfo:", lightProgramInfo);
    return;
  }

  // Initialize the agents model
  await initAgentsModel();

  // Get the agents and obstacles
  await getAgents();
  await getObstacles();
  await getTrafficLights();
  await getDestinations();

  // Initialize the scene
  setupScene();

  // Position the objects in the scene
  await setupObjects(scene, gl, colorProgramInfo);

  // Prepare the user interface
  setupUI();

  // Fisrt call to the drawing loop
  drawScene();
}

function setupScene() {
  let camera = new Camera3D(
    0,
    10, // Distance to target
    4, // Azimut
    0.8, // Elevation
    [0, 0, 10],
    [0, 0, 0]
  );
  // These values are empyrical.
  // Maybe find a better way to determine them
  camera.panOffset = [0, 8, 0];
  scene.setCamera(camera);
  scene.camera.setupControls();
}

async function setupObjects(scene, gl, programInfo) {
  // Create VAOs for the different shapes
  const baseCube = new Object3D(-1);
  baseCube.prepareVAO(gl, programInfo);

  // Create lit cube for objects affected by traffic light glow
  const litCube = new Object3D(-4);
  litCube.prepareVAO(gl, lightProgramInfo);

  // Create a separate cube for flat-shaded objects (traffic lights)
  const flatCube = new Object3D(-2);
  flatCube.prepareVAO(gl, flatProgramInfo);

  // Background - skyblock
  // const bground = await createModelObject(gl, lightProgramInfo, "skybox.obj");
  // bground.arrays = litCube.arrays;
  // bground.bufferInfo = litCube.bufferInfo;
  // bground.vao = litCube.vao;
  // bground.scale = { x: 50, y: 0.1, z: 50 };

  // GROUND - Flat cube with texture
  const ground = new Object3D(-100);
  ground.arrays = litCube.arrays;
  ground.bufferInfo = litCube.bufferInfo;
  ground.vao = litCube.vao;
  ground.scale = { x: 50, y: 0.1, z: 50 };
  ground.usesLighting = true;

  // Load and apply texture to the ground
  try {
    const textureImage = await loadImage("/assets/models/grass_texture.png");
    ground.texture = createTexture(gl, textureImage);
    console.log("Ground texture loaded successfully!");
  } catch (error) {
    console.error("Failed to load ground texture:", error);
    ground.color = [0.5, 0.8, 0.5, 1]; // Fallback green color
  }

  scene.addObject(ground);

  // AGENTS (Cars) - Using simple cubes
  for (const agent of agents) {
    agent.arrays = baseCube.arrays;
    agent.bufferInfo = baseCube.bufferInfo;
    agent.vao = baseCube.vao;
    agent.scale = { x: 0.5, y: 0.5, z: 0.5 };
    scene.addObject(agent);
  }

  /* 
  // ALTERNATIVE: Use 3D car models instead of cubes
  // Uncomment this section and comment out the cube version above
  const carModel = await createModelObject(
    gl, 
    programInfo,
    'car-2024-301.obj',      // OBJ file in assets/models/
    'car-2024-301.mtl'       // MTL file (optional)
  );
  
  for (const agent of agents) {
    agent.arrays = carModel.arrays;
    agent.bufferInfo = carModel.bufferInfo;
    agent.vao = carModel.vao;
    agent.scale = { x: 0.3, y: 0.3, z: 0.3 };
    scene.addObject(agent);
  }
  */

  // OBSTACLES (Trees and Bushes) - Using OBJ models with lighting
  try {
    console.log("Loading tree and bush models...");
    const treeModel = await createModelObject(
      gl,
      lightProgramInfo,
      "Treeobj.obj"
    );
    const bushModel = await createModelObject(
      gl,
      lightProgramInfo,
      "78-hazelnutbush/Hazelnut.obj"
    );

    console.log("Tree and bush models loaded successfully!");

    // Split obstacles: half trees, half bushes
    for (let i = 0; i < obstacles.length; i++) {
      const obstacle = obstacles[i];
      const isTree = i % 2 === 0; // Even indices = trees, odd indices = bushes

      if (isTree) {
        obstacle.arrays = treeModel.arrays;
        obstacle.bufferInfo = treeModel.bufferInfo;
        obstacle.vao = treeModel.vao;
        obstacle.position.y = 1;
        obstacle.scale = { x: 0.2, y: 0.2, z: 0.2 };
      } else {
        obstacle.arrays = bushModel.arrays;
        obstacle.bufferInfo = bushModel.bufferInfo;
        obstacle.vao = bushModel.vao;
        obstacle.scale = { x: 0.1, y: 0.1, z: 0.1 };
      }

      obstacle.usesLighting = true;
      scene.addObject(obstacle);
    }
  } catch (error) {
    console.error(
      "Failed to load tree/bush models, falling back to cubes:",
      error
    );
    // Fallback to lit cubes if models fail to load
    for (const obstacle of obstacles) {
      obstacle.arrays = litCube.arrays;
      obstacle.bufferInfo = litCube.bufferInfo;
      obstacle.vao = litCube.vao;
      obstacle.scale = { x: 0.5, y: 0.5, z: 0.5 };
      obstacle.color = [0.7, 0.7, 0.7, 1.0];
      obstacle.usesLighting = true; // Enable lighting
      scene.addObject(obstacle);
    }
  }

  try {
    const destModel = await createModelObject(
      gl,
      lightProgramInfo,
      "mushroom.obj"
    );

    for (let i = 0; i < destinations.length; i++) {
      const destination = destinations[i];
      console.log(`loading mushroom at ${destination.position}`);

      destination.arrays = destModel.arrays;
      destination.bufferInfo = destModel.bufferInfo;
      destination.vao = destModel.vao;
      destination.scale = { x: 0.1, y: 0.1, z: 0.1 };
      destination.rotRad = {
        x: (270 * Math.PI) / 180,
        y: (0 * Math.PI) / 180,
        z: 0,
      }; // 270° rotation on Y axis
      destination.usesLighting = true;
      scene.addObject(destination);
    }
  } catch (error) {
    console.error(
      "Failed to load mushroom model, falling back to cubes:",
      error
    );
    // Fallback to lit cubes if models fail to load
    for (const destination of destinations) {
      destination.arrays = litCube.arrays;
      destination.bufferInfo = litCube.bufferInfo;
      destination.vao = litCube.vao;
      destination.scale = { x: 0.2, y: 0.2, z: 0.2 };
      destination.color = [0.7, 0.7, 0.7, 1.0];
      destination.usesLighting = true; // Enable lighting
      scene.addObject(destination);
    }
  }

  /*
  // ALTERNATIVE: Use simple cubes for obstacles
  for (const agent of obstacles) {
    agent.arrays = baseCube.arrays;
    agent.bufferInfo = baseCube.bufferInfo;
    agent.vao = baseCube.vao;
    agent.scale = { x: 0.5, y: 0.5, z: 0.5 };
    agent.color = [0.7, 0.7, 0.7, 1.0];
    scene.addObject(agent);
  }
  */

  // TRAFFIC LIGHTS - Using 3D traffic light model
  // try {
  //   console.log('Loading traffic light model...');
  //   const trafficLightModel = await createModelObject(
  //     gl,
  //     programInfo,
  //     'trafficLight/trfcLight.obj',
  //     'trafficLight/trfcLight.mtl'
  //   );

  //   console.log('Traffic light model loaded successfully!');

  //   for (const light of trafficLights) {
  //     light.arrays = trafficLightModel.arrays;
  //     light.bufferInfo = trafficLightModel.bufferInfo;
  //     light.vao = trafficLightModel.vao;
  //     light.scale = { x: 0.5, y: 0.8, z: 0.5 };
  //     // Adjust Y position to place traffic light on the ground
  //     light.position.y = 1;  // Set to ground level
  //     scene.addObject(light);
  //   }
  // } catch (error) {
  //   console.error('Failed to load traffic light model, falling back to colored cubes:', error);
  //   // Fallback to flat shader cubes with dynamic colors
  //   for (const light of trafficLights) {
  //     light.arrays = flatCube.arrays;
  //     light.bufferInfo = flatCube.bufferInfo;
  //     light.vao = flatCube.vao;
  //     light.scale = { x: 0.3, y: 1.2, z: 0.3 };
  //     light.usesFlatShader = true;
  //     scene.addObject(light);
  //   }
  // }

  // TRAFFIC LIGHTS - Using anemone flower models with dynamic colors
  try {
    console.log("Loading anemone flower model...");
    const flowerModel = await createModelObject(
      gl,
      lightProgramInfo,
      "anemone_flower_v1_L2.123c1a49de8d-31b0-4a7e-a943-aec52dc74b75/12973_anemone_flower_v1_l2.obj"
    );

    console.log("Anemone flower model loaded successfully!");

    for (const light of trafficLights) {
      light.arrays = flowerModel.arrays;
      light.bufferInfo = flowerModel.bufferInfo;
      light.vao = flowerModel.vao;
      light.position.y = 0.5;
      light.scale = { x: 0.05, y: 0.05, z: 0.05 };
      light.rotRad = {
        x: (270 * Math.PI) / 180,
        y: (0 * Math.PI) / 180,
        z: 0,
      }; // 270° rotation on Y axis
      light.usesLighting = true;
      scene.addObject(light);

      // Create Light3D object for this traffic light
      const pointLight = new Light3D(
        `trafficLight_${trafficLightLights.length}`,
        [light.position.x, light.position.y + 0.5, light.position.z], // position
        [0.3, 0.3, 0.3, 1.0], // ambient
        light.state ? [0, 2.5, 0, 1] : [2.5, 0, 0, 1], // diffuse - bright green or red
        light.state ? [0, 1.5, 0, 1] : [1.5, 0, 0, 1] // specular
      );
      trafficLightLights.push(pointLight);
    }
  } catch (error) {
    console.error("Failed to load flower model, falling back to cubes:", error);
    // Fallback to flat shader cubes with dynamic colors
    for (const light of trafficLights) {
      light.arrays = flatCube.arrays;
      light.bufferInfo = flatCube.bufferInfo;
      light.vao = flatCube.vao;
      light.position.y = 1;
      light.scale = { x: 0.3, y: 0.3, z: 0.3 };
      light.usesFlatShader = true;
      scene.addObject(light);

      // Create Light3D object for this traffic light
      const pointLight = new Light3D(
        `trafficLight_${trafficLightLights.length}`,
        [light.position.x, light.position.y + 0.5, light.position.z], // position
        [0.3, 0.3, 0.3, 1.0], // ambient
        light.state ? [0, 2.5, 0, 1] : [2.5, 0, 0, 1], // diffuse - bright green or red
        light.state ? [0, 1.5, 0, 1] : [1.5, 0, 0, 1] // specular
      );
      trafficLightLights.push(pointLight);
    }
  }

  /*
  // ALTERNATIVE: Use 3D stoplight models
  // Note: Won't support dynamic color changes unless using custom shader
  const stoplightModel = await createModelObject(
    gl,
    programInfo,
    'stoplight_1.obj',
    'stoplight_1.mtl'
  );
*/
  // for (const light of trafficLights) {
  //   light.arrays = stoplightModel.arrays;
  //   light.bufferInfo = stoplightModel.bufferInfo;
  //   light.vao = stoplightModel.vao;
  //   light.scale = { x: 0.3, y: 0.3, z: 0.3 };
  //   scene.addObject(light);
  // }
}

// Draw an object with lighting (traffic light glow effect)
function drawObjectWithLighting(gl, programInfo, object, viewProjectionMatrix) {
  // Prepare the vector for translation and scale
  let v3_tra = object.posArray;
  let v3_sca = object.scaArray;

  // Create the individual transform matrices
  const scaMat = M4.scale(v3_sca);
  const rotXMat = M4.rotationX(object.rotRad.x);
  const rotYMat = M4.rotationY(object.rotRad.y);
  const rotZMat = M4.rotationZ(object.rotRad.z);
  const traMat = M4.translation(v3_tra);

  // Create the composite matrix with all transformations
  let transforms = M4.identity();
  transforms = M4.multiply(scaMat, transforms);
  transforms = M4.multiply(rotXMat, transforms);
  transforms = M4.multiply(rotYMat, transforms);
  transforms = M4.multiply(rotZMat, transforms);
  transforms = M4.multiply(traMat, transforms);

  object.matrix = transforms;

  // Apply the projection to the final matrix
  const wvpMat = M4.multiply(viewProjectionMatrix, transforms);

  // Calculate world inverse transpose for normal transformation
  const worldInverseTranspose = M4.transpose(M4.inverse(transforms));

  // Prepare light arrays (shader expects arrays)
  const lightPositions = [];
  const diffuseLights = [];
  const specularLights = [];

  // Fill with traffic light data (up to 10 lights) using Light3D properties
  for (let i = 0; i < trafficLightLights.length; i++) {
    lightPositions.push(...trafficLightLights[i].posArray);
    diffuseLights.push(...trafficLightLights[i].diffuse);
    specularLights.push(...trafficLightLights[i].specular);
  }

  if (trafficLightLights.length == 0) {
    // Fill remaining slots with dummy lights (no contribution)
    lightPositions.push(0, 100, 0); // Far away
    diffuseLights.push(0, 0, 0, 1);
    specularLights.push(0, 0, 0, 1);
  }

  // Model uniforms
  let objectUniforms = {
    u_world: transforms,
    u_worldInverseTransform: worldInverseTranspose,
    u_worldViewProjection: wvpMat,
    u_lightWorldPosition: lightPositions,
    u_viewWorldPosition: scene.camera.posArray,
    u_ambientLight: [0.3, 0.3, 0.3, 1.0],
    u_diffuseLight: diffuseLights,
    u_specularLight: specularLights,
    u_shininess: 32.0,
    u_constant: 1.0,
    u_linear: 0.09,
    u_quadratic: 0.032,
  };

  twgl.setUniforms(programInfo, objectUniforms);

  // Handle textures
  if (object.texture) {
    // Single texture mode
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, object.texture);
  } else {
    // Create a simple 1x1 white texture as fallback
    if (!gl.defaultTexture) {
      gl.defaultTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gl.defaultTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255, 255])
      );
    } else {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gl.defaultTexture);
    }
  }

  gl.bindVertexArray(object.vao);
  twgl.drawBufferInfo(gl, object.bufferInfo);
}

// Draw an object with its corresponding transformations
function drawObject(gl, programInfo, object, viewProjectionMatrix) {
  // Prepare the vector for translation and scale
  let v3_tra = object.posArray;
  let v3_sca = object.scaArray;

  /*
  // Animate the rotation of the objects
  object.rotDeg.x = (object.rotDeg.x + settings.rotationSpeed.x * fract) % 360;
  object.rotDeg.y = (object.rotDeg.y + settings.rotationSpeed.y * fract) % 360;
  object.rotDeg.z = (object.rotDeg.z + settings.rotationSpeed.z * fract) % 360;
  object.rotRad.x = object.rotDeg.x * Math.PI / 180;
  object.rotRad.y = object.rotDeg.y * Math.PI / 180;
  object.rotRad.z = object.rotDeg.z * Math.PI / 180;
  */

  // Create the individual transform matrices
  const scaMat = M4.scale(v3_sca);
  const rotXMat = M4.rotationX(object.rotRad.x);
  const rotYMat = M4.rotationY(object.rotRad.y);
  const rotZMat = M4.rotationZ(object.rotRad.z);
  const traMat = M4.translation(v3_tra);

  // Create the composite matrix with all transformations
  let transforms = M4.identity();
  transforms = M4.multiply(scaMat, transforms);
  transforms = M4.multiply(rotXMat, transforms);
  transforms = M4.multiply(rotYMat, transforms);
  transforms = M4.multiply(rotZMat, transforms);
  transforms = M4.multiply(traMat, transforms);

  object.matrix = transforms;

  // Apply the projection to the final matrix for the
  // World-View-Projection
  const wvpMat = M4.multiply(viewProjectionMatrix, transforms);

  // Model uniforms
  let objectUniforms = {
    u_transforms: wvpMat,
  };

  // If object uses flat shader, also pass the color uniform
  if (object.usesFlatShader) {
    objectUniforms.u_color = object.color;
  }

  twgl.setUniforms(programInfo, objectUniforms);

  gl.bindVertexArray(object.vao);
  twgl.drawBufferInfo(gl, object.bufferInfo);
}

// Function to do the actual display of the objects
async function drawScene() {
  // Compute time elapsed since last frame
  let now = Date.now();
  let deltaTime = now - then;
  elapsed += deltaTime;
  let fract = Math.min(1.0, elapsed / duration);
  then = now;

  // Clear the canvas
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // tell webgl to cull faces
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  // Enable alpha blending for transparent textures
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  scene.camera.checkKeys();
  //console.log(scene.camera);

  // Update traffic light colors based on their current state
  for (
    let i = 0;
    i < Math.min(trafficLights.length, trafficLightLights.length);
    i++
  ) {
    const light = trafficLights[i];
    trafficLightLights[i].diffuse = light.state
      ? [0, 2.5, 0, 1]
      : [2.5, 0, 0, 1]; // Bright green or red
    trafficLightLights[i].specular = light.state
      ? [0, 1.5, 0, 1]
      : [1.5, 0, 0, 1];
  }

  const viewProjectionMatrix = setupViewProjection(gl);

  // Draw objects with lighting (trees, buildings, floor)
  if (trafficLightLights.length > 0) {
    gl.useProgram(lightProgramInfo.program);
    for (let object of scene.objects) {
      if (object.usesLighting) {
        drawObjectWithLighting(
          gl,
          lightProgramInfo,
          object,
          viewProjectionMatrix
        );
      }
    }
  }

  // Draw the objects with color shader
  gl.useProgram(colorProgramInfo.program);
  for (let object of scene.objects) {
    if (!object.usesFlatShader && !object.usesLighting) {
      drawObject(gl, colorProgramInfo, object, viewProjectionMatrix, fract);
    }
  }

  // Draw the objects with flat shader (traffic lights)
  gl.useProgram(flatProgramInfo.program);
  for (let object of scene.objects) {
    if (object.usesFlatShader) {
      drawObject(gl, flatProgramInfo, object, viewProjectionMatrix, fract);
    }
  }

  // Update the scene after the elapsed duration
  if (elapsed >= duration) {
    elapsed = 0;
    await update();
  }

  requestAnimationFrame(drawScene);
}

function setupViewProjection(gl) {
  // Field of view of 60 degrees vertically, in radians
  const fov = (60 * Math.PI) / 180;
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

  // Matrices for the world view
  const projectionMatrix = M4.perspective(fov, aspect, 1, 200);

  const cameraPosition = scene.camera.posArray;
  const target = scene.camera.targetArray;
  const up = [0, 1, 0];

  const cameraMatrix = M4.lookAt(cameraPosition, target, up);
  const viewMatrix = M4.inverse(cameraMatrix);
  const viewProjectionMatrix = M4.multiply(projectionMatrix, viewMatrix);

  return viewProjectionMatrix;
}

// Setup a ui.
function setupUI() {
  /*
  const gui = new GUI();

  // Settings for the animation
  const animFolder = gui.addFolder('Animation:');
  animFolder.add( settings.rotationSpeed, 'x', 0, 360)
      .decimals(2)
  animFolder.add( settings.rotationSpeed, 'y', 0, 360)
      .decimals(2)
  animFolder.add( settings.rotationSpeed, 'z', 0, 360)
      .decimals(2)
  */
}

// Helper function to load an image
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Helper function to create a WebGL texture from an image
function createTexture(gl, image) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Upload the image to the texture
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Set texture parameters
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}

main();
