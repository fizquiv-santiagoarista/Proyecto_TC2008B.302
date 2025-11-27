/*
 * Base program for a 3D scene that connects to an API to get the movement
 * of agents.
 * The scene shows colored cubes
 *
 * Gilberto Echeverria
 * 2025-11-08
 */


'use strict';

import * as twgl from 'twgl-base.js';
import GUI from 'lil-gui';
import { M4 } from '../libs/3d-lib';
import { Scene3D } from '../libs/scene3d';
import { Object3D } from '../libs/object3d';
import { Camera3D } from '../libs/camera3d';

// Model loader for OBJ files
import { createModelObject } from '../libs/model_loader.js';

// Functions and arrays for the communication with the API
import {
  agents, obstacles, trafficLights, initAgentsModel,
  update, getAgents, getObstacles, getTrafficLights, setNAgents, initData
} from '../libs/api_connection.js';

// Define the shader code, using GLSL 3.00
import vsGLSL from '../assets/shaders/vs_color.glsl?raw';
import fsGLSL from '../assets/shaders/fs_color.glsl?raw';
import vsFlatGLSL from '../assets/shaders/vs_flat.glsl?raw';
import fsFlatGLSL from '../assets/shaders/fs_flat.glsl?raw';

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
let gl = undefined;
const duration = 1000; // ms
let elapsed = 0;
let then = 0;


// Main function is async to be able to make the requests
async function main() {
  // Setup the canvas area
  const canvas = document.querySelector('canvas');
  gl = canvas.getContext('webgl2');
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Prepare the program with the shaders
  colorProgramInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);
  flatProgramInfo = twgl.createProgramInfo(gl, [vsFlatGLSL, fsFlatGLSL]);

  // Initialize the agents model
  await initAgentsModel();

  // Get the agents and obstacles
  await getAgents();
  await getObstacles();
  await getTrafficLights();


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
  let camera = new Camera3D(0,
    10,             // Distance to target
    4,              // Azimut
    0.8,              // Elevation
    [0, 0, 10],
    [0, 0, 0]);
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

  // Create a separate cube for flat-shaded objects (traffic lights)
  const flatCube = new Object3D(-2);
  flatCube.prepareVAO(gl, flatProgramInfo);

  /*
  // A scaled cube to use as the ground
  const ground = new Object3D(-3, [14, 0, 14]);
  ground.arrays = baseCube.arrays;
  ground.bufferInfo = baseCube.bufferInfo;
  ground.vao = baseCube.vao;
  ground.scale = {x: 50, y: 0.1, z: 50};
  ground.color = [0.6, 0.6, 0.6, 1];
  scene.addObject(ground);
  */

  // AGENTS (Cars) - Using simple cubes
  const carTemplate = {
    arrays: baseCube.arrays,
    bufferInfo: baseCube.bufferInfo,
    vao: baseCube.vao,
    scale: { x: 0.5, y: 0.5, z: 0.5 }
  };

  for (const agent of agents) {
    agent.arrays = carTemplate.arrays;
    agent.bufferInfo = carTemplate.bufferInfo;
    agent.vao = carTemplate.vao;
    agent.scale = { ...carTemplate.scale };
    agent.color = [0, 0, 1, 1]; // Blue color for cars
    scene.addObject(agent);
  }

  // Store the car template for dynamically spawned cars
  scene.carTemplate = carTemplate;

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

  // OBSTACLES (Buildings) - Using 3D models
  try {
    console.log('Loading building models...');
    // Load two different building models
    const building1 = await createModelObject(
      gl, 
      programInfo,
      'building_1.obj',
      'building_1.mtl'
    );
    
    const building2 = await createModelObject(
      gl, 
      programInfo,
      'building_2.obj',
      'building_2.mtl'
    );

    console.log('Building models loaded successfully!');

    // Alternate between the two building models
    for (let i = 0; i < obstacles.length; i++) {
      const obstacle = obstacles[i];
      const model = i % 2 === 0 ? building1 : building2;
      
      obstacle.arrays = model.arrays;
      obstacle.bufferInfo = model.bufferInfo;
      obstacle.vao = model.vao;
      obstacle.scale = { x: 0.5, y: 1, z: 0.5 }; // Increased y (height) to make buildings taller
      scene.addObject(obstacle);
    }
  } catch (error) {
    console.error('Failed to load building models, falling back to cubes:', error);
    // Fallback to cubes if models fail to load
    for (const agent of obstacles) {
      agent.arrays = baseCube.arrays;
      agent.bufferInfo = baseCube.bufferInfo;
      agent.vao = baseCube.vao;
      agent.scale = { x: 0.5, y: 0.5, z: 0.5 };
      agent.color = [0.7, 0.7, 0.7, 1.0];
      scene.addObject(agent);
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
  try {
    console.log('Loading traffic light model...');
    const trafficLightModel = await createModelObject(
      gl,
      programInfo,
      'trafficLight/trfcLight.obj',
      'trafficLight/trfcLight.mtl'
    );

    console.log('Traffic light model loaded successfully!');

    for (const light of trafficLights) {
      light.arrays = trafficLightModel.arrays;
      light.bufferInfo = trafficLightModel.bufferInfo;
      light.vao = trafficLightModel.vao;
      light.scale = { x: 0.5, y: 0.8, z: 0.5 };
      // Adjust Y position to place traffic light on the ground
      light.position.y = 1;  // Set to ground level
      scene.addObject(light);
    }
  } catch (error) {
    console.error('Failed to load traffic light model, falling back to colored cubes:', error);
    // Fallback to flat shader cubes with dynamic colors
    for (const light of trafficLights) {
      light.arrays = flatCube.arrays;
      light.bufferInfo = flatCube.bufferInfo;
      light.vao = flatCube.vao;
      light.scale = { x: 0.3, y: 1.2, z: 0.3 };
      light.usesFlatShader = true;
      scene.addObject(light);
    }
  }

  /*
  // ALTERNATIVE: Use simple colored cubes for dynamic traffic lights
  for (const light of trafficLights) {
    light.arrays = flatCube.arrays;
    light.bufferInfo = flatCube.bufferInfo;
    light.vao = flatCube.vao;
    light.scale = { x: 0.3, y: 1.2, z: 0.3 }; // Taller to look like a traffic light
    light.usesFlatShader = true; // Flag to use flat shader with u_color uniform
    // Color is already set in getTrafficLights based on state
    scene.addObject(light);
  }
  */

  /*
  // ALTERNATIVE: Use 3D stoplight models
  // Note: Won't support dynamic color changes unless using custom shader
  const stoplightModel = await createModelObject(
    gl,
    programInfo,
    'stoplight_1.obj',
    'stoplight_1.mtl'
  );

  for (const light of trafficLights) {
    light.arrays = stoplightModel.arrays;
    light.bufferInfo = stoplightModel.bufferInfo;
    light.vao = stoplightModel.vao;
    light.scale = { x: 0.3, y: 0.3, z: 0.3 };
    scene.addObject(light);
  }
  */

}

// Draw an object with its corresponding transformations
function drawObject(gl, programInfo, object, viewProjectionMatrix, fract) {
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
    u_transforms: wvpMat
  }
  
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

  scene.camera.checkKeys();
  //console.log(scene.camera);
  const viewProjectionMatrix = setupViewProjection(gl);

  // Draw the objects with color shader
  gl.useProgram(colorProgramInfo.program);
  for (let object of scene.objects) {
    if (!object.usesFlatShader) {
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
    
    // Remove cars from scene that are no longer in the agents array (reached destination)
    for (let i = scene.objects.length - 1; i >= 0; i--) {
      const sceneObject = scene.objects[i];
      // Check if this is a car (has the car template properties)
      if (sceneObject.scale && sceneObject.scale.x === 0.5 && sceneObject.scale.y === 0.5) {
        // Check if this car still exists in the agents array
        const stillExists = agents.some(agent => agent.id === sceneObject.id);
        if (!stillExists) {
          console.log("Removing car from scene:", sceneObject.id);
          scene.objects.splice(i, 1);
        }
      }
    }
    
    // Check for newly spawned cars and add them to the scene
    for (const agent of agents) {
      if (!scene.objects.includes(agent)) {
        // New car detected, set up its visual properties
        agent.arrays = scene.carTemplate.arrays;
        agent.bufferInfo = scene.carTemplate.bufferInfo;
        agent.vao = scene.carTemplate.vao;
        agent.scale = { ...scene.carTemplate.scale };
        agent.color = [0, 0, 1, 1]; // Blue color for cars
        scene.addObject(agent);
        console.log("Added new car to scene:", agent.id);
      }
    }
    
    await update();
  }

  requestAnimationFrame(drawScene);
}

function setupViewProjection(gl) {
  // Field of view of 60 degrees vertically, in radians
  const fov = 60 * Math.PI / 180;
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
  const gui = new GUI();

  // Settings for car spawning
  const spawnFolder = gui.addFolder('Car Spawning:');
  spawnFolder.add(initData, 'NAgents', 1, 10, 1)
      .name('Cars per spawn (every 10 steps)')
      .onChange((value) => {
        setNAgents(value);
        console.log('Cars per spawn set to:', value);
      });
  spawnFolder.open();

  /*
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

main();
