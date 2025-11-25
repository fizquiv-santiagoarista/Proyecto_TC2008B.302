from mesa.discrete_space import CellAgent, FixedAgent

class Car(CellAgent):
    """
    Car agent that moves following road directions to reach a destination.
    """
    def __init__(self, model, cell, destination=None):
        """
        Creates a new car agent.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
            destination: Target destination cell (randomly assigned if None)
        """
        super().__init__(model)
        self.cell = cell
        
        # Assign a random destination if not provided
        if destination is None and model.destinations:
            self.destination = self.model.random.choice(model.destinations)
        else:
            self.destination = destination
        
        self.reached_destination = False
        self.last_direction = None  # Track the last direction the car moved

    def get_road_direction(self, cell):
        """
        Get the direction of the road at the given cell.
        Returns the Road agent's direction or None if no road exists.
        """
        for agent in cell.agents:
            if isinstance(agent, Road):
                return agent.direction
        return None

    def get_next_cell_by_direction(self, direction):
        """
        Calculate the next cell based on road direction.
        """
        current_pos = self.cell.coordinate
        x, y = current_pos
        
        if direction == "Up":
            next_pos = (x, y + 1)
        elif direction == "Down":
            next_pos = (x, y - 1)
        elif direction == "Left":
            next_pos = (x - 1, y)
        elif direction == "Right":
            next_pos = (x + 1, y)
        else:
            return None
        
        # Check if next position is within grid bounds
        if (0 <= next_pos[0] < self.model.grid.dimensions[0] and 
            0 <= next_pos[1] < self.model.grid.dimensions[1]):
            return self.model.grid[next_pos]
        return None

    def is_cell_blocked(self, cell):
        """
        Check if a cell is blocked by another car or an obstacle.
        """
        for agent in cell.agents:
            if isinstance(agent, Car) or isinstance(agent, Obstacle):
                return True
        return False
    
    def is_traffic_light_red(self, cell):
        """
        Check if there's a red traffic light in the cell.
        Red light means state == False (False = Red, True = Green)
        """
        for agent in cell.agents:
            if isinstance(agent, Traffic_Light):
                if agent.state == False:
                    return True
        return False

    def step(self):
        """ 
        Move the car following the road direction, respecting traffic lights and obstacles.
        """
        # Check if already at destination
        if self.cell == self.destination.cell:
            self.reached_destination = True
            # Remove car from simulation when it reaches destination
            self.remove()
            return
        
        # Check if we're on a traffic light - if so, use last direction
        on_traffic_light = any(isinstance(agent, Traffic_Light) for agent in self.cell.agents)
        
        if on_traffic_light and self.last_direction is not None:
            # Continue in the same direction as before when on a traffic light
            current_direction = self.last_direction
        else:
            # Get current road direction from the road
            current_direction = self.get_road_direction(self.cell)
        
        if current_direction is None:
            # Not on a road, stay in place
            print(f"Car {self.unique_id}: No road direction found at current cell")
            return
        
        # Calculate next cell based on road direction
        next_cell = self.get_next_cell_by_direction(current_direction)
        
        if next_cell is None:
            # Out of bounds, stay in place
            print(f"Car {self.unique_id}: Next cell out of bounds")
            return
        
        # Check if next cell has a red traffic light (state = False means red)
        if self.is_traffic_light_red(next_cell):
            # Stop before entering the red light
            return
        
        # Check if next cell is blocked
        if self.is_cell_blocked(next_cell):
            # Can't move, stay in place
            print(f"Car {self.unique_id}: Next cell is blocked")
            return
        
        # Check if next cell is a road or destination
        has_road = any(isinstance(agent, Road) for agent in next_cell.agents)
        is_destination = any(isinstance(agent, Destination) for agent in next_cell.agents)
        
        if has_road or is_destination:
            # Move to next cell and save the direction we moved
            self.cell = next_cell
            self.last_direction = current_direction
        else:
            print(f"Car {self.unique_id}: Next cell has no road or destination")

class Traffic_Light(FixedAgent):
    """
    Traffic light. Where the traffic lights are in the grid.
    """
    def __init__(self, model, cell, state = False, timeToChange = 10):
        """
        Creates a new Traffic light.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
            state: Whether the traffic light is green or red
            timeToChange: After how many step should the traffic light change color 
        """
        super().__init__(model)
        self.cell = cell
        self.state = state
        self.timeToChange = timeToChange

    def step(self):
        """ 
        To change the state (green or red) of the traffic light in case you consider the time to change of each traffic light.
        """
        # Skip step 0 to avoid immediate toggle, then toggle every timeToChange steps
        if self.model.steps > 0 and self.model.steps % self.timeToChange == 0:
            self.state = not self.state

class Destination(FixedAgent):
    """
    Destination agent. Where each car should go.
    """
    def __init__(self, model, cell):
        """
        Creates a new destination agent
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

class Obstacle(FixedAgent):
    """
    Obstacle agent. Just to add obstacles to the grid.
    """
    def __init__(self, model, cell):
        """
        Creates a new obstacle.
        
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell

class Road(FixedAgent):
    """
    Road agent. Determines where the cars can move, and in which direction.
    """
    def __init__(self, model, cell, direction= "Left"):
        """
        Creates a new road.
        Args:
            model: Model reference for the agent
            cell: The initial position of the agent
        """
        super().__init__(model)
        self.cell = cell
        self.direction = direction