# Descripción del Reto

La movilidad urbana, se define como la habilidad de transportarse de un lugar a otro¹ y es fundamental para el desarrollo económico y social y la calidad de vida de los habitantes de una ciudad. Desde hace un tiempo, asociar la movilidad con el uso del automóvil ha sido un signo distintivo de progreso. Sin embargo, esta asociación ya no es posible hoy. El crecimiento y uso indiscriminado del automóvil —que fomenta políticas públicas erróneamente asociadas con la movilidad sostenible—genera efectos negativos enormes en los niveles económico, ambiental y social en México.

Durante las últimas décadas, ha existido una tendencia alarmante de un incremento en el uso de automóviles en México. Los Kilómetros-Auto Recorridos (VKT por sus siglas en Inglés) se han triplicado, de 106 millones en 1990, a 339 millones en 2010. Ésto se correlaciona simultáneamente con un incremento en los impactos negativos asociados a los autos, como el smog, accidentes, enfermedades y congestión vehicular².

Para que México pueda estar entre las economías más grandes del mundo, es necesario mejorar la movilidad en sus ciudades, lo que es crítico para las actividades económicas y la calidad de vida de millones de personas.

Este reto te permitirá proponer una solución al problema de movilidad urbana en México, mediante un enfoque que reduzca la congestión vehicular al simular de manera gráfica el tráfico, representando la salida de un sistema multi agentes.

## Instrucciones de Instalación y Ejecución

### 1. Configurar el entorno virtual de Python

En la raíz del proyecto, crea un entorno virtual llamado `.agents`:

```bash
python3.13 -m venv .agents
```

Activa el entorno virtual:

```bash
source .agents/bin/activate
```

Instala las dependencias de Python necesarias:

```bash
pip install "mesa[all]"
pip install flask-cors
```

### 2. Instalar dependencias de visualización

Navega a la carpeta `AgentsVisualization` e instala las dependencias de npm:

```bash
cd AgentsVisualization
npm i
```

### 3. Ejecutar el servidor de visualización

Desde la carpeta `AgentsVisualization`, ejecuta el servidor de desarrollo con Vite:

```bash
npx vite
```

### 4. Ejecutar el servidor de tráfico

En una nueva terminal, desde la raíz del proyecto, activa el entorno virtual:

```bash
source .agents/bin/activate
```

Luego navega a la carpeta del servidor de tráfico:

```bash
cd AgentsVisualization/Server/trafficServer
```

Y ejecuta el servidor:

```bash
python3.13 traffic_server.py
```

Ahora ambos servidores deberían estar corriendo y la simulación estará lista para usar.