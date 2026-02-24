const fileInput = document.getElementById('fileInput');
const sourceSelect = document.getElementById('sourceFilter');
const sinkSelect = document.getElementById('sinkFilter');
const moduleSelect = document.getElementById('moduleFilter');
const infoElement = document.getElementById('info');

let cy;

const nodeDataById = new Map();
let nodeIdsInOrder = [];
let edgeData = [];
let functionIds = [];
let moduleIds = [];
let adjacency = new Map();
let reverseAdjacency = new Map();
let ancestorsById = new Map();

initializeCytoscape();
attachEventListeners();

setInfoMessage('Upload a JSON file with nodes and edges to visualize the call graph.');

function initializeCytoscape() {
  if (typeof cytoscape !== 'undefined' && typeof cytoscapeDagre !== 'undefined') {
    cytoscape.use(cytoscapeDagre);
  }

  const container = document.getElementById('graph');
  if (!container || typeof cytoscape === 'undefined') {
    console.warn('Cytoscape container not found or library missing.');
    return;
  }

  cy = cytoscape({
    container,
    elements: [],
    boxSelectionEnabled: true,
    wheelSensitivity: 0.2,
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'font-size': '11px',
          'text-wrap': 'wrap',
          'text-max-width': '160px',
          'text-valign': 'center',
          'text-halign': 'center',
          'color': '#1f2933',
          'background-color': '#90caf9',
          'border-color': '#42a5f5',
          'border-width': 1,
          'shape': 'round-rectangle',
          'padding': '6px',
          'width': 'label',
          'height': 'label',
          'compound-sizing-wrt-labels': 'exclude'
        }
      },
      {
        selector: 'node[type="function"]',
        style: {
          'background-color': '#bbdefb',
          'border-color': '#64b5f6'
        }
      },
      {
        selector: 'node[type="module"]',
        style: {
          'background-color': '#e3f2fd',
          'border-color': '#90caf9',
          'font-weight': 'bold'
        }
      },
      {
        selector: ':parent',
        style: {
          'background-opacity': 0.2,
          'padding': '12px',
          'text-valign': 'top',
          'text-halign': 'center',
          'text-margin-y': -10
        }
      },
      {
        selector: 'edge',
        style: {
          'curve-style': 'bezier',
          'width': 1.5,
          'line-color': '#78909c',
          'target-arrow-color': '#78909c',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 1,
          'opacity': 0.9
        }
      },
      {
        selector: 'edge:hover',
        style: {
          'line-color': '#1e88e5',
          'target-arrow-color': '#1e88e5'
        }
      }
    ]
  });

  window.addEventListener('resize', () => {
    if (cy) {
      cy.resize();
    }
  });
}

function attachEventListeners() {
  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }
  if (sourceSelect) {
    sourceSelect.addEventListener('change', applyFilters);
  }
  if (sinkSelect) {
    sinkSelect.addEventListener('change', applyFilters);
  }
  if (moduleSelect) {
    moduleSelect.addEventListener('change', applyFilters);
  }

  window.clearFilters = () => {
    resetSelections();
    applyFilters();
  };
}

function handleFileUpload(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target && typeof e.target.result === 'string' ? e.target.result : null;
    if (text) {
      loadGraphData(text);
    }
  };
  reader.onerror = () => {
    setInfoMessage('Unable to read the selected file.');
  };
  reader.readAsText(file);
}

function loadGraphData(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) {
      setInfoMessage('Invalid JSON: expected an array of Cytoscape elements.');
      clearCytoscape();
      return;
    }

    resetGraphState();

    const nodes = [];
    const edges = [];

    parsed.forEach((element) => {
      if (element.group === 'nodes') {
        nodes.push(element);
      } else {
        edges.push(element);
      }
    });

    if (nodes.length === 0) {
      setInfoMessage('No nodes found in the provided JSON.');
      clearCytoscape();
      return;
    }

    nodes.sort((a, b) => a.data.id.localeCompare(b.data.id));
    nodeIdsInOrder = nodes.map((node) => node.data.id);
    nodeDataById.clear();
    nodes.forEach((node) => nodeDataById.set(node.data.id, node));

    edgeData = edges.filter(
      (edge) => nodeDataById.has(edge.data.source) && nodeDataById.has(edge.data.target)
    );

    functionIds = nodeIdsInOrder.filter(
      (id) => nodeDataById.get(id)?.data.type === 'function'
    );
    moduleIds = nodeIdsInOrder.filter(
      (id) => nodeDataById.get(id)?.data.type === 'module'
    );

    buildAdjacency();
    buildAncestors();

    initializeFilters();
    resetSelections();
    applyFilters();
  } catch (error) {
    console.error('Error parsing JSON:', error);
    setInfoMessage(`Error parsing JSON: ${error.message}`);
    clearCytoscape();
  }
}

function buildAdjacency() {
  adjacency = new Map();
  reverseAdjacency = new Map();

  nodeDataById.forEach((_, id) => {
    adjacency.set(id, new Set());
    reverseAdjacency.set(id, new Set());
  });

  edgeData.forEach((edge) => {
    adjacency.get(edge.data.source)?.add(edge.data.target);
    reverseAdjacency.get(edge.data.target)?.add(edge.data.source);
  });
}

function buildAncestors() {
  ancestorsById = new Map();

  const computeAncestors = (id, stack = new Set()) => {
    if (ancestorsById.has(id)) {
      return ancestorsById.get(id);
    }

    if (stack.has(id)) {
      return [];
    }

    const node = nodeDataById.get(id);
    if (!node || !node.data.parent) {
      ancestorsById.set(id, []);
      return [];
    }

    stack.add(id);
    const parentAncestors = computeAncestors(node.data.parent, stack);
    stack.delete(id);

    const results = [node.data.parent, ...parentAncestors];
    ancestorsById.set(id, results);
    return results;
  };

  nodeDataById.forEach((_, id) => {
    computeAncestors(id);
  });
}

function initializeFilters() {
  populateSelect(sourceSelect, functionIds);
  populateSelect(sinkSelect, functionIds);
  populateSelect(moduleSelect, moduleIds);
}

function populateSelect(select, ids) {
  if (!select) {
    return;
  }

  const fragment = document.createDocumentFragment();
  ids.forEach((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    fragment.appendChild(option);
  });

  select.innerHTML = '';
  select.appendChild(fragment);
}

function resetSelections() {
  [sourceSelect, sinkSelect, moduleSelect].forEach((select) => {
    if (!select) {
      return;
    }
    Array.from(select.options).forEach((option) => {
      option.selected = false;
    });
  });
}

function applyFilters() {
  if (!cy || nodeDataById.size === 0) {
    return;
  }

  const selectedSources = new Set(selectedOptionValues(sourceSelect));
  const selectedSinks = new Set(selectedOptionValues(sinkSelect));
  const selectedModules = new Set(selectedOptionValues(moduleSelect));

  let visibleFunctions = new Set(functionIds);

  visibleFunctions = filterFunctionsByModules(visibleFunctions, selectedModules);

  if (selectedSources.size > 0) {
    visibleFunctions = filterFunctionsBySources(visibleFunctions, selectedSources);
  }

  if (selectedSinks.size > 0) {
    visibleFunctions = filterFunctionsBySinks(visibleFunctions, selectedSinks);
  }

  const nodesToRender = new Set();
  visibleFunctions.forEach((id) => {
    nodesToRender.add(id);
    const ancestors = ancestorsById.get(id) || [];
    ancestors.forEach((ancestorId) => nodesToRender.add(ancestorId));
  });

  if (nodesToRender.size === 0) {
    clearCytoscape();
    setInfoMessage('No functions match the current filters.');
    return;
  }

  renderGraph(nodesToRender, visibleFunctions, selectedSources, selectedSinks, selectedModules);
}

function filterFunctionsBySources(functionSet, sourceSet) {
    const reachableFromSources = new Set();
    sourceSet.forEach((id) => {
        if (nodeDataById.get(id)?.data.type !== 'function') {
            return;
        }
        const reachable = traverseGraph(id, adjacency);
        reachable.forEach((nodeId) => {
            if (nodeDataById.get(nodeId)?.data.type === 'function') {
                reachableFromSources.add(nodeId);
            }
        });
    });
    return intersectSets(functionSet, reachableFromSources);
}

function filterFunctionsBySinks(functionSet, sinkSet) {
    const callersOfSinks = new Set();
    sinkSet.forEach((id) => {
        if (nodeDataById.get(id)?.data.type !== 'function') {
            return;
        }
        const callers = traverseGraph(id, reverseAdjacency);
        callers.forEach((nodeId) => {
            if (nodeDataById.get(nodeId)?.data.type === 'function') {
                callersOfSinks.add(nodeId);
            }
        });
    });
    return intersectSets(functionSet, callersOfSinks);
}

function filterFunctionsByModules(functionSet, selectedModules) {
  const result = new Set();
  functionSet.forEach((id) => {
    const ancestors = ancestorsById.get(id) || [];
    if (ancestors.some((ancestorId) => selectedModules.has(ancestorId))) {
      result.add(id);
    }
  });
  return result;
}

function traverseGraph(startId, graph) {
  const visited = new Set();
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) {
      continue;
    }

    visited.add(current);
    const neighbors = graph.get(current);
    if (!neighbors) {
      continue;
    }

    neighbors.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    });
  }

  return visited;
}

function intersectSets(a, b) {
  const result = new Set();
  a.forEach((value) => {
    if (b.has(value)) {
      result.add(value);
    }
  });
  return result;
}

function renderGraph(nodeIdSet, visibleFunctions, selectedSources, selectedSinks, selectedModules) {
  if (!cy) {
    return;
  }

  const nodeElements = [];
  nodeIdSet.forEach((id) => {
    const node = nodeDataById.get(id);
    if (node) {
      nodeElements.push({ data: { ...node.data } });
    }
  });

  const edgeElements = edgeData
    .filter((edge) => nodeIdSet.has(edge.data.source) && nodeIdSet.has(edge.data.target))
    .map((edge) => ({ data: { ...edge.data } }));

  cy.startBatch();
  cy.elements().remove();
  cy.add([...nodeElements, ...edgeElements]);
  cy.endBatch();

  const layout = cy.layout({
    name: 'dagre',
    rankDir: 'LR',
    nodeSep: 40,
    rankSep: 120,
    edgeSep: 20,
    spacingFactor: 1.1,
    padding: 24,
    animate: false
  });

  layout.run();
  cy.fit(cy.nodes(), 50);

  const moduleCount = [...nodeIdSet].filter(
    (id) => nodeDataById.get(id)?.data.type === 'module'
  ).length;
  const functionCount = visibleFunctions.size;
  const callCount = edgeElements.length;

  const filtersSummary = summarizeFilters(
    selectedSources,
    selectedSinks,
    selectedModules
  );

  const infoText = `Visualizing ${functionCount} function${functionCount === 1 ? '' : 's'} across ${moduleCount} module${moduleCount === 1 ? '' : 's'} with ${callCount} call${callCount === 1 ? '' : 's'}. ${filtersSummary}`;

  setInfoMessage(infoText.trim());
}

function summarizeFilters(selectedSources, selectedSinks, selectedModules) {
  const parts = [];
  if (selectedSources.size > 0) {
    parts.push(`callees of ${selectedSources.size} source${selectedSources.size === 1 ? '' : 's'}`);
  }
  if (selectedSinks.size > 0) {
    parts.push(`callers of ${selectedSinks.size} sink${selectedSinks.size === 1 ? '' : 's'}`);
  }
  if (selectedModules.size > 0) {
    parts.push(`within ${selectedModules.size} module${selectedModules.size === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    return 'No filters applied.';
  }

  return `Filters: ${parts.join(', ')}.`;
}

function selectedOptionValues(select) {
  if (!select) {
    return [];
  }
  return Array.from(select.selectedOptions || []).map((option) => option.value);
}

function setInfoMessage(message) {
  if (infoElement) {
    infoElement.textContent = message;
  }
}

function clearCytoscape() {
  if (cy) {
    cy.elements().remove();
  }
}

function resetGraphState() {
  nodeDataById.clear();
  nodeIdsInOrder = [];
  edgeData = [];
  functionIds = [];
  moduleIds = [];
  adjacency = new Map();
  reverseAdjacency = new Map();
  ancestorsById = new Map();
}
