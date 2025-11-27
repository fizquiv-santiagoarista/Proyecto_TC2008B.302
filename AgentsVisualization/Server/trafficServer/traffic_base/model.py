from mesa import Model
from mesa.discrete_space import OrthogonalMooreGrid
from .agent import *
import json
import random


class CityModel(Model):
    """
    Creates a model based on a city map.

    Args:
        N: Number of cars to add per spawn cycle
        width: Width of the map (not used, kept for compatibility)
        height: Height of the map (not used, kept for compatibility)
        seed: Random seed for the model
    """

    def __init__(self, N, width=None, height=None, seed=42):

        super().__init__(seed=seed)

        # Load the map dictionary. The dictionary maps the characters in the map file to the corresponding agent.
        dataDictionary = json.load(open("city_files/mapDictionary.json"))

        self.cars_per_spawn = N  # Number of cars to add each spawn cycle
        self.traffic_lights = []
        self.destinations = []
        self.road_cells = []
        self.obstacles = []

        # Load the map file. The map file is a text file where each character represents an agent.
        with open("city_files/2022_base.txt") as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0])
            self.height = len(lines)

            self.grid = OrthogonalMooreGrid(
                [self.width, self.height], capacity=100, torus=False
            )

            # Goes through each character in the map file and creates the corresponding agent.
            for r, row in enumerate(lines):
                for c, col in enumerate(row):

                    cell = self.grid[(c, self.height - r - 1)]

                    if col in ["v", "^", ">", "<"]:
                        agent = Road(self, cell, dataDictionary[col])
                        self.road_cells.append(cell)

                    elif col in ["S", "s"]:
                        # Traffic lights need to also have a Road underneath
                        # The direction doesn't matter much since cars use their last_direction when on a traffic light
                        # Just use a default direction
                        Road(self, cell, "Right")
                        self.road_cells.append(cell)
                        
                        # Then create the traffic light on top
                        traffic_light = Traffic_Light(
                            self,
                            cell,
                            True,  # All traffic lights start green
                            int(dataDictionary[col]),
                        )
                        self.traffic_lights.append(traffic_light)

                    elif col == "#":
                        agent = Obstacle(self, cell)

                    elif col == "D":
                        agent = Destination(self, cell)
                        self.destinations.append(agent)

        # Define corner positions for car spawning
        corners = [
            (0, 0),                          # Bottom-left
            (self.width - 1, 0),             # Bottom-right
            (0, self.height - 1),            # Top-left
            (self.width - 1, self.height - 1) # Top-right
        ]
        
        # Get corner cells that are roads and have valid next cells
        self.corner_road_cells = []
        for corner_pos in corners:
            cell = self.grid[corner_pos]
            # Check if the cell has a Road agent
            has_road = any(isinstance(agent, Road) for agent in cell.agents)
            if not has_road:
                continue
            
            # Check if this road leads to a valid cell (not out of bounds)
            # Get the road direction
            road_dir = None
            for agent in cell.agents:
                if isinstance(agent, Road):
                    road_dir = agent.direction
                    break
            
            if road_dir:
                # Calculate next position based on direction
                x, y = corner_pos
                if road_dir == "Up":
                    next_pos = (x, y + 1)
                elif road_dir == "Down":
                    next_pos = (x, y - 1)
                elif road_dir == "Left":
                    next_pos = (x - 1, y)
                elif road_dir == "Right":
                    next_pos = (x + 1, y)
                else:
                    continue
                
                # Only add if next position is within bounds
                if (0 <= next_pos[0] < self.width and 
                    0 <= next_pos[1] < self.height):
                    self.corner_road_cells.append(cell)
        
        if not self.corner_road_cells:
            print("Warning: No road cells found at map corners. Cars cannot be spawned.")
        
        self.spawn_interval = 10  # Spawn cars every 10 steps

        self.running = True

    def step(self):
        """Advance the model by one step."""
        self.agents.shuffle_do("step")
        
        # Spawn cars every spawn_interval steps
        if self.steps % self.spawn_interval == 0:
            if self.corner_road_cells and self.destinations:
                # Spawn the specified number of cars
                for i in range(self.cars_per_spawn):
                    # Select a corner to spawn the car (cycle through corners)
                    starting_cell = self.corner_road_cells[i % len(self.corner_road_cells)]
                    
                    # Assign a random destination to the car
                    destination = self.random.choice(self.destinations)
                    car = Car(self, starting_cell, destination)
