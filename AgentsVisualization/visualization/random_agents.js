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

// Model loader for OBJ files
import { createModelObject } from "../libs/model_loader.js";

// Functions and arrays for the communication with the API
import {
  agents,
  obstacles,
  destinations,
  trafficLights,
  carStats,
  initAgentsModel,
  update,
  getAgents,
  getObstacles,
  getTrafficLights,
  getDestinations,
  setNAgents,
  setSpawnInterval,
  initData,
} from "../libs/api_connection.js";

// Define the shader code, using GLSL 3.00
import vsLightGLSL from "../assets/shaders/vs_multi_lights.glsl?raw";
import fsLightGLSL from "../assets/shaders/fs_multi_lights.glsl?raw";

const scene = new Scene3D();

// Global variables
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
  lightProgramInfo = twgl.createProgramInfo(gl, [vsLightGLSL, fsLightGLSL]);

  // Check if shaders compiled successfully
  if (!lightProgramInfo) {
    console.error("Failed to create shader programs");
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
  await setupObjects(scene, gl);

  // Prepare the user interface
  setupUI();

  // First call to the drawing loop
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
  camera.panOffset = [0, 8, 0];
  scene.setCamera(camera);
  scene.camera.setupControls();
}

async function setupObjects(scene, gl) {
  // Create VAOs for the different shapes

  // Create lit cube for objects affected by traffic light glow
  const litCube = new Object3D(-4);
  litCube.prepareVAO(gl, lightProgramInfo);

  // Cube below the floor - Large green ground plane
  const underground = new Object3D(-100);
  underground.arrays = litCube.arrays;
  underground.bufferInfo = litCube.bufferInfo;
  underground.vao = litCube.vao;
  underground.scale = {
    x: initData.width / 1.5,
    y: 12,
    z: initData.height / 1.5,
  };
  underground.position.x = initData.width / 1.6;
  underground.position.z = initData.height / 1.6;
  underground.position.y = -15;

  underground.isUnderground = true; // Mark as underground for special lighting
  underground.color = [0.55, 0.27, 0.07, 1]; // Brown color
  // const textureImage = await loadImage("/assets/models/blue.png");
  // underground.texture = createTexture(gl, textureImage);
  scene.addObject(underground);

  // FLOOR - Large green ground plane
  const ground = new Object3D(-100);
  ground.arrays = litCube.arrays;
  ground.bufferInfo = litCube.bufferInfo;
  ground.vao = litCube.vao;
  ground.scale = { x: initData.width / 1.5, y: 2, z: initData.height / 1.5 };
  ground.position.x = initData.width / 1.6;
  ground.position.z = initData.height / 1.6;
  ground.position.y = -1;
  ground.isFloor = true; // Mark as floor for special lighting
  ground.color = [0.5, 0.8, 0.5, 1]; // Fallback green color
  // const textureImage = await loadImage("/assets/models/blue.png");
  // ground.texture = createTexture(gl, textureImage);
  scene.addObject(ground);

  // GRASS - Randomly placed grass patches across the scene
  console.log("Loading grass model...");
  const grassModel = await createModelObject(gl, lightProgramInfo, "grass.obj");

  console.log("Grass model loaded successfully!");

  // Define different shades of green for grass variation (super dark green to yellow green)
  const grassGreenShades = [
    [0.05, 0.2, 0.05, 1.0], // Super dark green
    [0.1, 0.3, 0.1, 1.0], // Very dark green
    [0.15, 0.4, 0.1, 1.0], // Dark green
    [0.2, 0.5, 0.15, 1.0], // Medium dark green
    [0.25, 0.6, 0.2, 1.0], // Medium green
    [0.3, 0.65, 0.25, 1.0], // Light medium green
    [0.4, 0.7, 0.3, 1.0], // Light green
    [0.5, 0.75, 0.35, 1.0], // Bright green
    [0.6, 0.8, 0.3, 1.0], // Yellow-ish green
    [0.65, 0.75, 0.2, 1.0], // Yellow green
  ];

  const numGrassPatches = 100;

  // Calculate ground bounds based on position and scale
  const edgeMargin = 2; // Empty zone width at edges
  const groundMinX = ground.position.x - ground.scale.x + edgeMargin;
  const groundMaxX = ground.position.x + ground.scale.x - edgeMargin;
  const groundMinZ = ground.position.z - ground.scale.z + edgeMargin;
  const groundMaxZ = ground.position.z + ground.scale.z - edgeMargin;

  for (let i = 0; i < numGrassPatches; i++) {
    // Random position within the ground bounds (excluding edge margin)
    const randomX = groundMinX + Math.random() * (groundMaxX - groundMinX);
    const randomZ = groundMinZ + Math.random() * (groundMaxZ - groundMinZ);

    // Random green shade
    const randomGreen =
      grassGreenShades[Math.floor(Math.random() * grassGreenShades.length)];

    // Random rotation around Y axis for variety
    const randomRotation = Math.random() * Math.PI * 2;

    const grass = new Object3D(
      `grass_${i}`,
      [randomX, 1, randomZ],
      [0, randomRotation, 0],
      [1, 0.5, 1],
      randomGreen
    );
    grass.arrays = grassModel.arrays;
    grass.bufferInfo = grassModel.bufferInfo;
    grass.vao = grassModel.vao;
    grass.disableCulling = true; // Grass should be visible from both sides
    scene.addObject(grass);
  }

  // SKYBOX - Large blue sky using skybox.obj model
  try {
    console.log("Loading skybox model...");
    const skybox = await createModelObject(gl, lightProgramInfo, "skybox.obj");

    const skyboxImage = await loadImage("/assets/models/skybox.png");

    skybox.texture = createTexture(gl, skyboxImage);

    skybox.position.x = 14;
    skybox.position.y = 0; // Reverted to 0
    skybox.position.z = 14;

    skybox.scale = { x: 8, y: 8, z: 8 };
    skybox.color = [1, 1, 1, 1.0];
    skybox.isSkybox = true;

    scene.addObject(skybox);
    console.log("Skybox loaded successfully!");
  } catch (error) {
    console.error("Failed to load skybox model:", error);
  }

  // AGENTS (Butterflies) - Using butterfly 3D model with separate wings
  try {
    const butterflyBodyModel = await createModelObject(
      gl,
      lightProgramInfo,
      "butteryfly/body.obj"
    );

    // Load left wing components
    const butterflyLeftWingBlackModel = await createModelObject(
      gl,
      lightProgramInfo,
      "butteryfly/left_wing_black.obj"
    );
    const butterflyLeftWingOrangeModel = await createModelObject(
      gl,
      lightProgramInfo,
      "butteryfly/left_wing_orange.obj"
    );
    const butterflyLeftWingWhiteModel = await createModelObject(
      gl,
      lightProgramInfo,
      "butteryfly/left_wing_white.obj"
    );

    // Load right wing components
    const butterflyRightWingBlackModel = await createModelObject(
      gl,
      lightProgramInfo,
      "butteryfly/right_wing_black.obj"
    );
    const butterflyRightWingOrangeModel = await createModelObject(
      gl,
      lightProgramInfo,
      "butteryfly/right_wing_orange.obj"
    );
    const butterflyRightWingWhiteModel = await createModelObject(
      gl,
      lightProgramInfo,
      "butteryfly/right_wing_white.obj"
    );

    console.log("Butterfly models loaded successfully!");

    // Store butterfly templates for later use
    scene.butterflyBody = butterflyBodyModel;
    scene.butterflyLeftWingBlack = butterflyLeftWingBlackModel;
    scene.butterflyLeftWingOrange = butterflyLeftWingOrangeModel;
    scene.butterflyLeftWingWhite = butterflyLeftWingWhiteModel;
    scene.butterflyRightWingBlack = butterflyRightWingBlackModel;
    scene.butterflyRightWingOrange = butterflyRightWingOrangeModel;
    scene.butterflyRightWingWhite = butterflyRightWingWhiteModel;
  } catch (error) {
    console.error(
      "Failed to load butterfly model, falling back to cubes:",
      error
    );
  }

  // OBSTACLES (Trees and Bushes) - Using OBJ models with lighting
  try {
    console.log("Loading tree and rock models...");
    // Tree1 models (with apples)
    const tree1LogModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree1/tree1_log.obj"
    );
    const tree1LeavesModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree1/tree1_leaves.obj"
    );
    const tree1ApplesModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree1/tree1_apples.obj"
    );

    // Tree2 models
    const tree2LogModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree2/tree2_log.obj"
    );
    const tree2LeavesModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree2/tree2_leaves.obj"
    );

    // Tree3 models
    const tree3LogModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree3/tree3_log.obj"
    );
    const tree3LeavesModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree3/tree3_leaves.obj"
    );

    // Tree4 models (with apples, same as tree1)
    const tree4LogModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree4/tree4_log.obj"
    );
    const tree4LeavesModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree4/tree4_leaves.obj"
    );
    const tree4ApplesModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree4/tree4_apples.obj"
    );

    // Tree5 models
    const tree5LogModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree5/tree5_log.obj"
    );
    const tree5LeavesModel = await createModelObject(
      gl,
      lightProgramInfo,
      "tree5/tree5_leaves.obj"
    );

    // Bush models
    const bushLogModel = await createModelObject(
      gl,
      lightProgramInfo,
      "bush/bush_log.obj"
    );
    const bushLeavesModel = await createModelObject(
      gl,
      lightProgramInfo,
      "bush/bush_leaves.obj"
    );

    const rockModel = await createModelObject(gl, lightProgramInfo, "rock.obj");

    console.log("Tree and rock models loaded successfully!");

    // Define apple colors for tree1 (bright red, yellow, orange)
    const appleColors = [
      [1.0, 0.0, 0.0, 1.0], // Bright red
      [1.0, 1.0, 0.0, 1.0], // Bright yellow
      [1.0, 0.5, 0.0, 1.0], // Bright orange
    ];

    // For each obstacle, randomly choose between tree1, tree2, tree3, tree5, bush, and rock
    for (let i = 0; i < obstacles.length; i++) {
      const obstacle = obstacles[i];
      const obstacleType = Math.floor(Math.random() * 6); // Random 0-5: tree1, tree2, tree3, tree5, bush, rock

      if (obstacleType === 0) {
        // Tree1 - Very dark green leaves, bright red/yellow/orange apples, dark brown log
        obstacle.arrays = tree1LogModel.arrays;
        obstacle.bufferInfo = tree1LogModel.bufferInfo;
        obstacle.vao = tree1LogModel.vao;
        obstacle.position.y = 1;
        obstacle.scale = { x: 1.2, y: 1.5, z: 1.2 };
        obstacle.color = [0.35, 0.16, 0.04, 1.0]; // Dark brown
        scene.addObject(obstacle);

        // Very dark green leaves
        const leaves = new Object3D(
          `${obstacle.id}_leaves`,
          [obstacle.position.x, obstacle.position.y, obstacle.position.z],
          [0, 0, 0],
          [obstacle.scale.x, obstacle.scale.y, obstacle.scale.z],
          [0.05, 0.2, 0.05, 1.0] // Very dark green
        );
        leaves.arrays = tree1LeavesModel.arrays;
        leaves.bufferInfo = tree1LeavesModel.bufferInfo;
        leaves.vao = tree1LeavesModel.vao;
        scene.addObject(leaves);

        // Random bright apple color
        const randomAppleColor =
          appleColors[Math.floor(Math.random() * appleColors.length)];

        const apples = new Object3D(
          `${obstacle.id}_apples`,
          [obstacle.position.x, obstacle.position.y, obstacle.position.z],
          [0, 0, 0],
          [obstacle.scale.x, obstacle.scale.y, obstacle.scale.z],
          randomAppleColor
        );
        apples.arrays = tree1ApplesModel.arrays;
        apples.bufferInfo = tree1ApplesModel.bufferInfo;
        apples.vao = tree1ApplesModel.vao;
        scene.addObject(apples);
      } else if (obstacleType === 1) {
        // Tree2 - Yellow green leaves, very light brown log (#80471C)
        obstacle.arrays = tree2LogModel.arrays;
        obstacle.bufferInfo = tree2LogModel.bufferInfo;
        obstacle.vao = tree2LogModel.vao;
        obstacle.position.y = 1;
        obstacle.scale = { x: 0.2, y: 0.3, z: 0.2 };
        obstacle.color = [0.5, 0.28, 0.11, 1.0]; // #80471C (very light brown)
        scene.addObject(obstacle);

        const leaves = new Object3D(
          `${obstacle.id}_leaves`,
          [obstacle.position.x, obstacle.position.y, obstacle.position.z],
          [0, 0, 0],
          [obstacle.scale.x, obstacle.scale.y, obstacle.scale.z],
          [0.6, 0.7, 0.2, 1.0] // Yellow green
        );
        leaves.arrays = tree2LeavesModel.arrays;
        leaves.bufferInfo = tree2LeavesModel.bufferInfo;
        leaves.vao = tree2LeavesModel.vao;
        scene.addObject(leaves);
      } else if (obstacleType === 2) {
        // Tree3 - Green blue leaves, cinnamon brown log
        obstacle.arrays = tree3LogModel.arrays;
        obstacle.bufferInfo = tree3LogModel.bufferInfo;
        obstacle.vao = tree3LogModel.vao;
        obstacle.position.y = 1;
        obstacle.scale = { x: 1, y: 1.4, z: 1 };
        obstacle.color = [0.52, 0.26, 0.12, 1.0]; // Cinnamon brown
        scene.addObject(obstacle);

        const leaves = new Object3D(
          `${obstacle.id}_leaves`,
          [obstacle.position.x, obstacle.position.y, obstacle.position.z],
          [0, 0, 0],
          [obstacle.scale.x, obstacle.scale.y, obstacle.scale.z],
          [0.03, 0.6, 0.4, 1.0] // Green blue
        );
        leaves.arrays = tree3LeavesModel.arrays;
        leaves.bufferInfo = tree3LeavesModel.bufferInfo;
        leaves.vao = tree3LeavesModel.vao;
        scene.addObject(leaves);
      } else if (obstacleType === 3) {
        // Tree5 - Bright pink leaves, very very light brown log
        obstacle.arrays = tree5LogModel.arrays;
        obstacle.bufferInfo = tree5LogModel.bufferInfo;
        obstacle.vao = tree5LogModel.vao;
        obstacle.position.y = 1;
        obstacle.scale = { x: 1, y: 1.2, z: 1 };
        obstacle.color = [0.7, 0.5, 0.35, 1.0]; // Very very light brown
        scene.addObject(obstacle);

        const leaves = new Object3D(
          `${obstacle.id}_leaves`,
          [obstacle.position.x, obstacle.position.y, obstacle.position.z],
          [0, 0, 0],
          [obstacle.scale.x, obstacle.scale.y, obstacle.scale.z],
          [1.0, 0.4, 0.5, 1.0] // Bright pink
        );
        leaves.arrays = tree5LeavesModel.arrays;
        leaves.bufferInfo = tree5LeavesModel.bufferInfo;
        leaves.vao = tree5LeavesModel.vao;
        scene.addObject(leaves);
      } else if (obstacleType === 4) {
        // Bush - Very dark green leaves, very dark brown log
        obstacle.arrays = bushLogModel.arrays;
        obstacle.bufferInfo = bushLogModel.bufferInfo;
        obstacle.vao = bushLogModel.vao;
        obstacle.position.y = 1;
        obstacle.scale = { x: 1.3, y: 1.3, z: 1.3 };
        obstacle.color = [0.2, 0.1, 0.05, 1.0]; // Very dark brown
        scene.addObject(obstacle);

        const leaves = new Object3D(
          `${obstacle.id}_leaves`,
          [obstacle.position.x, obstacle.position.y, obstacle.position.z],
          [0, 0, 0],
          [obstacle.scale.x, obstacle.scale.y, obstacle.scale.z],
          [0.05, 0.2, 0.05, 1.0] // Very dark green
        );
        leaves.arrays = bushLeavesModel.arrays;
        leaves.bufferInfo = bushLeavesModel.bufferInfo;
        leaves.vao = bushLeavesModel.vao;
        scene.addObject(leaves);
      } else if (obstacleType === 5) {
        // Rock (gray)
        obstacle.arrays = rockModel.arrays;
        obstacle.bufferInfo = rockModel.bufferInfo;
        obstacle.vao = rockModel.vao;
        obstacle.position.y = 1;
        obstacle.scale = { x: 0.3, y: 0.3, z: 0.3 };
        obstacle.color = [0.5, 0.5, 0.5, 1.0]; // Gray
        scene.addObject(obstacle);
      }
    }
  } catch (error) {
    console.error("Failed to load tree models, falling back to cubes:", error);
    // Fallback to lit cubes if models fail to load
    for (const obstacle of obstacles) {
      obstacle.arrays = litCube.arrays;
      obstacle.bufferInfo = litCube.bufferInfo;
      obstacle.vao = litCube.vao;
      obstacle.scale = { x: 0.5, y: 0.5, z: 0.5 };
      obstacle.color = [0.7, 0.7, 0.7, 1.0];
      scene.addObject(obstacle);
    }
  }

  // Define different shades of green for flower stems (reuse from trees)
  const greenShades = [
    [0.05, 0.4, 0.05, 1.0], // Very dark green
    [0.15, 0.6, 0.15, 1.0], // Medium green
    [0.25, 0.75, 0.25, 1.0], // Bright green
    [0.1, 0.55, 0.2, 1.0], // Forest green with more blue
    [0.2, 0.65, 0.1, 1.0], // Yellow-green
    [0.08, 0.5, 0.3, 1.0], // Teal-green
  ];

  // Define vibrant, non-green colors for flower caps
  const flowerCapColors = [
    [1.0, 0.1, 0.5, 1.0], // Hot pink
    [1.0, 0.0, 1.0, 1.0], // Magenta
    [0.5, 0.0, 1.0, 1.0], // Purple
    [0.2, 0.3, 1.0, 1.0], // Blue
    [1.0, 0.6, 0.0, 1.0], // Orange
    [1.0, 0.0, 0.7, 1.0], // Pink-purple
    [1.0, 0.4, 0.7, 1.0], // Coral
    [0.0, 0.8, 1.0, 1.0], // Cyan
    [0.7, 0.0, 1.0, 1.0], // Violet
  ];

  try {
    console.log("Loading flower models...");
    const flowerCapModel = await createModelObject(
      gl,
      lightProgramInfo,
      "flower/flower_cap.obj"
    );
    const flowerStemModel = await createModelObject(
      gl,
      lightProgramInfo,
      "flower/flower.obj"
    );

    console.log("Flower models loaded successfully!");

    for (let i = 0; i < destinations.length; i++) {
      const destination = destinations[i];
      console.log(`loading flower at ${destination.position}`);

      // Pick a random green shade for the flower stem
      const randomGreen =
        greenShades[Math.floor(Math.random() * greenShades.length)];

      // Set up the flower stem (random green) - using the existing destination object
      destination.arrays = flowerStemModel.arrays;
      destination.bufferInfo = flowerStemModel.bufferInfo;
      destination.vao = flowerStemModel.vao;
      destination.scale = { x: 0.3, y: 0.3, z: 0.3 };
      destination.color = randomGreen; // Random green shade
      scene.addObject(destination);

      // Pick a random vibrant, non-green color for the flower cap
      const randomCapColor =
        flowerCapColors[Math.floor(Math.random() * flowerCapColors.length)];

      // Create the flower cap (random color) as a NEW separate object at the same position
      const cap = new Object3D(
        `${destination.id}_cap`,
        [
          destination.position.x,
          destination.position.y,
          destination.position.z,
        ],
        [0, 0, 0],
        [0.3, 0.3, 0.3],
        randomCapColor
      );
      cap.arrays = flowerCapModel.arrays;
      cap.bufferInfo = flowerCapModel.bufferInfo;
      cap.vao = flowerCapModel.vao;
      cap.disableCulling = true;
      cap.isFlowerCap = true;

      scene.addObject(cap);
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
      scene.addObject(destination);
    }
  }

  // TRAFFIC LIGHTS

  console.log("Loading mushroom models for traffic lights...");
  const mushroomCapModel = await createModelObject(
    gl,
    lightProgramInfo,
    "mushroom/mushroom_cap.obj"
  );
  const mushroomLogModel = await createModelObject(
    gl,
    lightProgramInfo,
    "mushroom/mushroom_log.obj"
  );

  console.log("Mushroom models loaded successfully!");

  for (const light of trafficLights) {
    // Set up the mushroom log (white) - using the existing light object
    light.arrays = mushroomLogModel.arrays;
    light.bufferInfo = mushroomLogModel.bufferInfo;
    light.vao = mushroomLogModel.vao;
    light.position.y = 1; // Set Y to 1 directly
    light.scale = { x: 1, y: 1, z: 1 };
    light.color = [1.0, 1.0, 1.0, 1.0]; // White color
    scene.addObject(light);

    // Create the mushroom cap with color based on traffic light state
    const capColor = light.state ? [0, 0.8, 0, 1.0] : [0.8, 0, 0, 1.0]; // Green or red
    const cap = new Object3D(
      `${light.id}_cap`,
      [light.position.x, 1, light.position.z],
      [0, 0, 0],
      [1, 1, 1],
      capColor
    );
    cap.arrays = mushroomCapModel.arrays;
    cap.bufferInfo = mushroomCapModel.bufferInfo;
    cap.vao = mushroomCapModel.vao;
    cap.color = capColor;
    scene.addObject(cap);

    // Store reference to cap for updating color
    light.mushroomCap = cap;

    // Create Light3D object for this traffic light
    const pointLight = new Light3D(
      `trafficLight_${trafficLightLights.length}`,
      [light.position.x, light.position.y + 0.5, light.position.z], // position at cap level
      light.state ? [0.3, 0.5, 0, 1] : [0.5, 0.2, 0, 1], // diffuse - green when on, red when off
      light.state ? [0.3, 0.5, 0, 1] : [0.5, 0.2, 0, 1] // specular - green when on, red when off
    );
    trafficLightLights.push(pointLight);
  }
}

// Draw an object with lighting (traffic light glow effect)
function drawObjectWithLighting(gl, programInfo, object, viewProjectionMatrix) {
  // Prepare the vector for translation and scale
  // Use interpolated position for agents to enable smooth movement
  let v3_tra = object.isButterfly
    ? object.interpolatedPosArray
    : object.posArray;

  // Apply Y offset for butterflies
  if (object.isButterfly && object.yOffset !== undefined) {
    v3_tra = [v3_tra[0], v3_tra[1] + object.yOffset, v3_tra[2]];
  }

  let v3_sca = object.scaArray;

  // Calculate rotation for butterflies based on movement direction

  let rotYAngle = object.rotRad.y;
  let rotZAngle = object.rotRad.z;

  // Use discrete direction state for butterflies
  if (object.isButterfly && object.direction !== undefined) {
    rotYAngle = object.direction;
  }

  // Handle butterfly wing flapping animation
  let flapRotMat = M4.identity();
  if (object.isButterflyWing) {
    // Sync position with parent butterfly
    v3_tra = object.parentButterfly.interpolatedPosArray;

    // Apply parent's Y offset

    v3_tra = [v3_tra[0], v3_tra[1] + object.parentButterfly.yOffset, v3_tra[2]];

    // Match parent butterfly's direction
    if (object.parentButterfly.direction !== undefined) {
      rotYAngle = object.parentButterfly.direction;
    }

    // Add flapping animation before directional rotation
    const flapRange = Math.PI / 4; // 45 degrees flapping range
    const flapAngle = Math.sin(object.flapPhase) * flapRange;
    // Flap around Z axis in local space (up and down motion)
    flapRotMat = M4.rotationZ(object.isLeftWing ? flapAngle : -flapAngle);
  }

  // Create the individual transform matrices
  const scaMat = M4.scale(v3_sca);
  const rotXMat = M4.rotationX(object.rotRad.x);
  const rotYMat = M4.rotationY(rotYAngle);
  const rotZMat = M4.rotationZ(rotZAngle);
  const traMat = M4.translation(v3_tra);

  // Create the composite matrix with all transformations
  // For wings: apply flapping first (local space), then directional rotation (world space)
  let transforms = M4.identity();
  transforms = M4.multiply(scaMat, transforms);
  transforms = M4.multiply(flapRotMat, transforms); // Flap
  transforms = M4.multiply(rotXMat, transforms);
  transforms = M4.multiply(rotYMat, transforms); // Direction
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

  // --- CUSTOM LIGHTING OVERRIDES ---
  let ambientLight = [0.1, 0.1, 0.1, 1.0];
  let diffuseFactor = 1.0;
  let specularFactor = 1.0;
  let shininess = 32.0;

  if (object.isSkybox) {
    ambientLight = [1, 1, 1, 1.0];
  }

  if (object.isFloor) {
    // ambientLight = [0.2, 0.2, 0.2, 1.0]; // Bright ambient for floor
    diffuseFactor = 0.5;
    specularFactor = 0;
  }

  if (object.isButterfly || object.isButterflyWing) {
    ambientLight = [1.0, 1.0, 1.0, 1.0]; // Maximum ambient light for butterflies - fully bright
    diffuseFactor = 2.0; // Very high diffuse lighting
    specularFactor = 1.5; // Strong specular for shine
  }

  if (object.isFlowerCap) {
    ambientLight = [0.15, 0.15, 0.15, 1.0];
    diffuseFactor = 1.2;
    specularFactor = 0.5;
  }

  if (object.isUnderground) {
    ambientLight = [0.15, 0.1, 0.05, 1.0]; // Dark brown ambient
    diffuseFactor = 0.5;
    specularFactor = 0.3;
  }
  // ----------------------------------

  // Model uniforms
  let objectUniforms = {
    u_world: transforms,
    u_worldInverseTransform: worldInverseTranspose,
    u_worldViewProjection: wvpMat,
    u_lightWorldPosition: lightPositions,
    u_viewWorldPosition: scene.camera.posArray,
    u_ambientLight: ambientLight, // Increased so it's visible even with bright traffic lights
    u_diffuseLight: diffuseLights.map((l) => l * diffuseFactor),
    u_specularLight: specularLights.map((l) => l * specularFactor),
    u_shininess: shininess,
    // FIX: Use the variable attenuation values
    u_constant: 1,
    u_linear: 0.5,
    u_quadratic: 0.3,
    u_color: object.color || [1, 1, 1, 1],
    u_useTexture: object.texture ? true : false,
  };

  twgl.setUniforms(programInfo, objectUniforms);

  // Handle culling - disable for objects that need to be visible from both sides
  if (object.disableCulling) {
    gl.disable(gl.CULL_FACE);
  } else {
    gl.enable(gl.CULL_FACE);
  }

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

// Function to update the statistics display in the DOM
function updateStatsDisplay() {
  document.getElementById("stat-steps").textContent = carStats.totalSteps;
  document.getElementById("stat-total").textContent = carStats.totalSpawned;
  document.getElementById("stat-active").textContent = carStats.currentActive;
  document.getElementById("stat-reached").textContent =
    carStats.reachedDestination;
  
  // Show/hide simulation stopped status
  const statusElement = document.getElementById("simulation-status");
  if (carStats.simulationStopped) {
    statusElement.style.display = "flex";
    // Optional: Show browser alert once
    if (!window.simulationStoppedAlertShown) {
      alert("SIMULATION STOPPED\n\nAll entry points are blocked. No more butterflies can spawn.\n\nThe simulation will continue running existing butterflies.");
      window.simulationStoppedAlertShown = true;
    }
  } else {
    statusElement.style.display = "none";
  }
}

// Function to do the actual display of the objects
async function drawScene(currentTime = 0) {
  // Compute time elapsed since last frame
  let deltaTime = currentTime - then;
  elapsed += deltaTime;
  let fract = Math.min(1.0, elapsed / duration);
  then = currentTime;

  // Update agent interpolation every frame for smooth movement
  const deltaProgress = deltaTime / duration;
  for (const agent of agents) {
    agent.updateInterpolation(deltaProgress);

    // Update direction based on movement (discrete 90-degree rotations)
    if (agent.oldPosition) {
      const dx = agent.position.x - agent.oldPosition.x;
      const dz = agent.position.z - agent.oldPosition.z;

      if (Math.abs(dx) > Math.abs(dz)) {
        // Moving primarily along X axis
        agent.direction = dx > 0 ? Math.PI / 2 : -Math.PI / 2; // 90° or -90°
      } else if (Math.abs(dz) > 0.01) {
        // Moving primarily along Z axis
        agent.direction = dz > 0 ? 0 : Math.PI; // 180° or 0°
      }
      // If no significant movement, keep previous direction
    }
  }

  // Update wing flapping animation
  const flapSpeed = 0.01; // Speed of wing flapping
  for (const object of scene.objects) {
    if (object.isButterflyWing) {
      object.flapPhase += flapSpeed * deltaTime;
    }
  }

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

  // Update traffic light colors based on their current state
  for (
    let i = 0;
    i < Math.min(trafficLights.length, trafficLightLights.length);
    i++
  ) {
    const light = trafficLights[i];
    trafficLightLights[i].diffuse = light.state
      ? [0.3, 0.6, 0.3, 1] // Green specular
      : [0.6, 0.3, 0.3, 1]; // Red specular
    trafficLightLights[i].specular = light.state
      ? [0.3, 0.6, 0.3, 1] // Green specular
      : [0.6, 0.3, 0.3, 1]; // Red specular

    // Update mushroom cap color to match traffic light state
    if (light.mushroomCap) {
      light.mushroomCap.color = light.state
        ? [0, 0.8, 0, 1.0]
        : [0.8, 0, 0, 1.0]; // Green or red
    }
  }

  const viewProjectionMatrix = setupViewProjection(gl);

  // Draw all objects with lighting
  if (trafficLightLights.length > 0) {
    gl.useProgram(lightProgramInfo.program);
    for (let object of scene.objects) {
      drawObjectWithLighting(
        gl,
        lightProgramInfo,
        object,
        viewProjectionMatrix
      );
    }

    // Update the scene after the elapsed duration
    if (elapsed >= duration) {
      elapsed = 0;

      // Remove cars from scene that are no longer in the agents array (reached destination)
      for (let i = scene.objects.length - 1; i >= 0; i--) {
        const sceneObject = scene.objects[i];
        // Check if this is a car (has the car template properties)
        if (sceneObject.isButterfly) {
          // Check if this car still exists in the agents array
          const stillExists = agents.some(
            (agent) => agent.id === sceneObject.id
          );
          if (!stillExists) {
            console.log("Removing car from scene:", sceneObject.id);

            // Remove associated wing components
            if (sceneObject.wingComponents) {
              for (const wingComponent of sceneObject.wingComponents) {
                const wingIndex = scene.objects.indexOf(wingComponent);
                if (wingIndex !== -1) scene.objects.splice(wingIndex, 1);
              }
            }

            scene.objects.splice(i, 1);
          }
        }
      }

      // Check for newly spawned cars and add them to the scene
      // Counter for alternating colors
      if (scene.butterflyColorIndex === undefined) {
        scene.butterflyColorIndex = 0;
      }

      for (const agent of agents) {
        if (!scene.objects.includes(agent)) {
          // Alternate between blue and orange
          const isBlue = scene.butterflyColorIndex % 2 === 0;
          const bodyColor = isBlue ? [0, 0, 1, 1] : [1, 0.5, 0, 1];
          scene.butterflyColorIndex++;

          // New car detected, set up its visual properties (simple object like initial agents)
          agent.arrays = scene.butterflyBody.arrays;
          agent.bufferInfo = scene.butterflyBody.bufferInfo;
          agent.vao = scene.butterflyBody.vao;
          agent.scale = { x: 0.005, y: 0.005, z: 0.005 };
          agent.yOffset = 1; // Add Y offset to elevate butterfly above ground
          agent.color = bodyColor;
          agent.isButterfly = true;
          agent.direction = 0; // Initialize direction (0° = facing forward)
          scene.addObject(agent);

          // Wing colors based on butterfly type
          const wingOrangeColor = isBlue ? [0, 0.3, 0.6, 1] : [1, 0.5, 0, 1];
          const wingBlackColor = [0, 0, 0, 1];
          const wingWhiteColor = [1, 1, 1, 1];

          // Create left wing components for the butterfly
          const leftWingBlack = new Object3D(
            `${agent.id}_left_wing_black`,
            [agent.position.x, agent.position.y, agent.position.z],
            [0, 0, 0],
            [0.005, 0.005, 0.005],
            wingBlackColor
          );
          leftWingBlack.arrays = scene.butterflyLeftWingBlack.arrays;
          leftWingBlack.bufferInfo = scene.butterflyLeftWingBlack.bufferInfo;
          leftWingBlack.vao = scene.butterflyLeftWingBlack.vao;
          leftWingBlack.isButterflyWing = true;
          leftWingBlack.isLeftWing = true;
          leftWingBlack.parentButterfly = agent;
          leftWingBlack.flapPhase = 0;
          scene.addObject(leftWingBlack);

          const leftWingOrange = new Object3D(
            `${agent.id}_left_wing_orange`,
            [agent.position.x, agent.position.y, agent.position.z],
            [0, 0, 0],
            [0.005, 0.005, 0.005],
            wingOrangeColor
          );
          leftWingOrange.arrays = scene.butterflyLeftWingOrange.arrays;
          leftWingOrange.bufferInfo = scene.butterflyLeftWingOrange.bufferInfo;
          leftWingOrange.vao = scene.butterflyLeftWingOrange.vao;
          leftWingOrange.isButterflyWing = true;
          leftWingOrange.isLeftWing = true;
          leftWingOrange.parentButterfly = agent;
          leftWingOrange.flapPhase = 0;
          scene.addObject(leftWingOrange);

          const leftWingWhite = new Object3D(
            `${agent.id}_left_wing_white`,
            [agent.position.x, agent.position.y, agent.position.z],
            [0, 0, 0],
            [0.005, 0.005, 0.005],
            wingWhiteColor
          );
          leftWingWhite.arrays = scene.butterflyLeftWingWhite.arrays;
          leftWingWhite.bufferInfo = scene.butterflyLeftWingWhite.bufferInfo;
          leftWingWhite.vao = scene.butterflyLeftWingWhite.vao;
          leftWingWhite.isButterflyWing = true;
          leftWingWhite.isLeftWing = true;
          leftWingWhite.parentButterfly = agent;
          leftWingWhite.flapPhase = 0;
          scene.addObject(leftWingWhite);

          // Create right wing components for the butterfly
          const rightWingBlack = new Object3D(
            `${agent.id}_right_wing_black`,
            [agent.position.x, agent.position.y, agent.position.z],
            [0, 0, 0],
            [0.005, 0.005, 0.005],
            wingBlackColor
          );
          rightWingBlack.arrays = scene.butterflyRightWingBlack.arrays;
          rightWingBlack.bufferInfo = scene.butterflyRightWingBlack.bufferInfo;
          rightWingBlack.vao = scene.butterflyRightWingBlack.vao;
          rightWingBlack.isButterflyWing = true;
          rightWingBlack.isLeftWing = false;
          rightWingBlack.parentButterfly = agent;
          rightWingBlack.flapPhase = 0;
          scene.addObject(rightWingBlack);

          const rightWingOrange = new Object3D(
            `${agent.id}_right_wing_orange`,
            [agent.position.x, agent.position.y, agent.position.z],
            [0, 0, 0],
            [0.005, 0.005, 0.005],
            wingOrangeColor
          );
          rightWingOrange.arrays = scene.butterflyRightWingOrange.arrays;
          rightWingOrange.bufferInfo =
            scene.butterflyRightWingOrange.bufferInfo;
          rightWingOrange.vao = scene.butterflyRightWingOrange.vao;
          rightWingOrange.isButterflyWing = true;
          rightWingOrange.isLeftWing = false;
          rightWingOrange.parentButterfly = agent;
          rightWingOrange.flapPhase = 0;
          scene.addObject(rightWingOrange);

          const rightWingWhite = new Object3D(
            `${agent.id}_right_wing_white`,
            [agent.position.x, agent.position.y, agent.position.z],
            [0, 0, 0],
            [0.005, 0.005, 0.005],
            wingWhiteColor
          );
          rightWingWhite.arrays = scene.butterflyRightWingWhite.arrays;
          rightWingWhite.bufferInfo = scene.butterflyRightWingWhite.bufferInfo;
          rightWingWhite.vao = scene.butterflyRightWingWhite.vao;
          rightWingWhite.isButterflyWing = true;
          rightWingWhite.isLeftWing = false;
          rightWingWhite.parentButterfly = agent;
          rightWingWhite.flapPhase = 0;
          scene.addObject(rightWingWhite);

          // Store references to all wing components
          agent.wingComponents = [
            leftWingBlack,
            leftWingOrange,
            leftWingWhite,
            rightWingBlack,
            rightWingOrange,
            rightWingWhite,
          ];

          console.log("Added new car to scene:", agent.id);
        }
      }

      await update();
    }

    updateStatsDisplay(); // Update the statistics display
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
}

// Setup a ui.
function setupUI() {
  const gui = new GUI();

  // Set default cars per spawn to 4 (every 10 steps)
  setNAgents(4);

  // Settings for car spawning
  const spawnSettings = {
    spawnInterval: 10,
  };

  const spawnFolder = gui.addFolder("Car Spawning");
  spawnFolder
    .add(spawnSettings, "spawnInterval", 1, 50, 1)
    .name("Steps between spawns")
    .onChange(async (value) => {
      await setSpawnInterval(value);
      console.log("Spawn interval set to:", value, "steps");
    });
  spawnFolder.open();
}

// Helper to load an image asynchronously
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Helper to create a WebGL texture from an image
function createTexture(gl, image) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // FIX: RESTORED Flip Y axis for OBJ textures
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return texture;
}

main();
