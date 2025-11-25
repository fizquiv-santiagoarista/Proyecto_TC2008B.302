from traffic_base.agent import *
from traffic_base.model import CityModel

from mesa.visualization import Slider, SolaraViz, make_space_component
from mesa.visualization.components import AgentPortrayalStyle


def agent_portrayal(agent):

    if agent is None:
        return

    portrayal = AgentPortrayalStyle(
        marker="s",
    )

    if isinstance(agent, Road):
        portrayal.color = "#aaa"

    if isinstance(agent, Destination):
        portrayal.color = "lightgreen"

    if isinstance(agent, Traffic_Light):
        portrayal.color = "red" if not agent.state else "green"

    if isinstance(agent, Obstacle):
        portrayal.color = "#555"
    
    if isinstance(agent, Car):
        portrayal.color = "blue"
        portrayal.size = 15

    return portrayal


def post_process(ax):
    ax.set_aspect("equal")


model_params = {
    "N": {
        "type": "SliderInt",
        "value": 2,
        "label": "Cars Added Per Spawn (every 10 steps)",
        "min": 1,
        "max": 10,
        "step": 1,
    },
    "seed": {
        "type": "InputText",
        "value": 42,
        "label": "Random Seed",
    },
}

model = CityModel(model_params["N"])

space_component = make_space_component(
    agent_portrayal, draw_grid=False, post_process=post_process
)

page = SolaraViz(
    model,
    components=[space_component],
    model_params=model_params,
    name="Random Model",
)
