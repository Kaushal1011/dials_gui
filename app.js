/*******************************************************
 * app.js - Core logic for the DIALS model designer
 *******************************************************/

/*******************************************************
 * GLOBAL DATA STRUCTURES
 *******************************************************/
// We'll keep track of model name in a simple global:
let currentModelName = '';

// We'll track all nodes (agents, channels, messages, states, actions, etc.)
let nodes = [];
// Each node is an object like:
//   {
//     id: 'uniqueID',
//     type: 'Agent' | 'Channel' | 'Message' | 'State' | 'Action',
//     label: 'A1',   // user can rename in the UI
//     x: number, y: number,
//     dom: HTMLDivElement, // the actual DOM element
//     customCode: string    // a chunk of code the user can define or modify
//   }

// We'll keep track of connections: each is { fromID, toID }
let connections = [];

// For drag state
let draggingNode = null;
let offsetX = 0,
	offsetY = 0;

// For selection
let selectedNodes = [];

/*******************************************************
 * ON LOAD
 *******************************************************/
document.addEventListener('DOMContentLoaded', () => {
	// Make sidebar elements draggable
	const draggableItems = document.querySelectorAll('.draggable-element');
	draggableItems.forEach((item) => {
		item.addEventListener('dragstart', onDragStart);
	});

	// Canvas setup
	const canvas = document.getElementById('canvas-container');
	canvas.addEventListener('dragover', (e) => e.preventDefault());
	canvas.addEventListener('drop', onCanvasDrop);
	// For detecting clicks on the empty canvas to unselect
	canvas.addEventListener('mousedown', onCanvasMouseDown);

	// Buttons
	document.getElementById('btn-define-model').addEventListener('click', showDefineModelModal);
	document.getElementById('btn-connect').addEventListener('click', connectSelectedNodes);
	document.getElementById('btn-generate').addEventListener('click', generateCode);
	document.getElementById('btn-clear').addEventListener('click', clearDiagram);

	// "Define Model" modal
	document.getElementById('saveModelNameBtn').addEventListener('click', saveModelName);

	// Node Edit modal
	document.getElementById('saveNodeCodeBtn').addEventListener('click', saveNodeProperties);
});

/*******************************************************
 * DRAG AND DROP: SIDEBAR -> CANVAS
 *******************************************************/
function onDragStart(e) {
	e.dataTransfer.setData('elementType', e.target.getAttribute('data-type'));
}

function onCanvasDrop(e) {
	e.preventDefault();
	const elementType = e.dataTransfer.getData('elementType');

	const canvasRect = e.currentTarget.getBoundingClientRect();
	const x = e.clientX - canvasRect.left;
	const y = e.clientY - canvasRect.top;

	createNode(elementType, x, y);
}

/*******************************************************
 * CREATE NODE
 *******************************************************/
function createNode(type, x, y) {
	const id = 'node-' + Math.random().toString(36).substring(2);
	const labelDefault = `${type}_${nodes.length + 1}`;

	// Create DOM element
	const nodeEl = document.createElement('div');
	nodeEl.classList.add('canvas-node');
	nodeEl.style.left = x + 'px';
	nodeEl.style.top = y + 'px';

	// Input for label
	const labelInput = document.createElement('input');
	labelInput.type = 'text';
	labelInput.className = 'node-label';
	labelInput.value = labelDefault;
	labelInput.addEventListener('mousedown', (ev) => {
		ev.stopPropagation();
	});
	nodeEl.appendChild(labelInput);

	// Append to canvas
	document.getElementById('canvas-container').appendChild(nodeEl);

	// Create node object
	const nodeObj = {
		id,
		type,
		label: labelDefault,
		x,
		y,
		dom: nodeEl,
		customCode: makeDefaultSnippet(type, labelDefault),
	};
	nodes.push(nodeObj);

	// Event listeners
	nodeEl.addEventListener('mousedown', (e) => {
		e.stopPropagation();
		startNodeDrag(nodeObj, e);
	});
	nodeEl.addEventListener('dblclick', (e) => {
		e.stopPropagation();
		openNodeProperties(nodeObj);
	});
	nodeEl.addEventListener('click', (e) => {
		e.stopPropagation();
		toggleSelection(nodeObj);
	});

	return nodeObj; // ✅ Return the created node
}

/*******************************************************
 * CREATE A DEFAULT SNIPPET FOR A GIVEN TYPE
 *******************************************************/
function makeDefaultSnippet(type, label, code = '') {
	switch (type) {
		case 'Agent':
			return `(agent ${label}) has {\n  // define states, resources, etc.
                ${code} 
            // \n}`;
		case 'Channel':
			return `(channel ${label})`;
		case 'Message':
			return `(message ${label})`;
		case 'State':
			return `(state ${label}) behaves {\n  // define actions here\n
              ${code}
            // }`;
		case 'Action':
			return `(action ${label}) does {${code}}`;
		default:
			return `// custom code for ${type} ${label}`;
	}
}

/*******************************************************
 * NODE SELECTION
 *******************************************************/
function toggleSelection(node) {
	if (selectedNodes.includes(node)) {
		// unselect
		selectedNodes = selectedNodes.filter((n) => n !== node);
		node.dom.classList.remove('selected');
	} else {
		selectedNodes.push(node);
		node.dom.classList.add('selected');
	}
}

function onCanvasMouseDown(e) {
	// if user clicked empty canvas, unselect everything
	if (e.target === e.currentTarget) {
		selectedNodes.forEach((n) => n.dom.classList.remove('selected'));
		selectedNodes = [];
	}
}

/*******************************************************
 * DRAGGING NODES ON THE CANVAS
 *******************************************************/
function startNodeDrag(node, e) {
	draggingNode = node;
	const rect = node.dom.getBoundingClientRect();
	offsetX = e.clientX - rect.left;
	offsetY = e.clientY - rect.top;

	document.addEventListener('mousemove', onNodeMouseMove);
	document.addEventListener('mouseup', onNodeMouseUp);
}

function onNodeMouseMove(e) {
	if (!draggingNode) return;

	const canvasRect = document.getElementById('canvas-container').getBoundingClientRect();
	let newX = e.clientX - canvasRect.left - offsetX;
	let newY = e.clientY - canvasRect.top - offsetY;

	// update node
	draggingNode.dom.style.left = newX + 'px';
	draggingNode.dom.style.top = newY + 'px';

	draggingNode.x = newX;
	draggingNode.y = newY;

	// redraw connections
	drawConnections();
}

function onNodeMouseUp(e) {
	draggingNode = null;
	document.removeEventListener('mousemove', onNodeMouseMove);
	document.removeEventListener('mouseup', onNodeMouseUp);
}

/*******************************************************
 * CONNECTING NODES
 *******************************************************/
function connectSelectedNodes() {
	if (selectedNodes.length != 2) {
		alert('Select only two nodes to connect them!');
		return;
	}

	for (let i = 0; i < selectedNodes.length - 1; i++) {
		const from = selectedNodes[i];
		const to = selectedNodes[i + 1];

		// Check for existing connection
		const exists = connections.find(
			(c) => (c.fromID === from.id && c.toID === to.id) || (c.fromID === to.id && c.toID === from.id)
		);
		if (!exists) {
			connections.push({ fromID: from.id, toID: to.id });
		}
	}

	drawConnections();
	// Optionally unselect after connecting
	selectedNodes.forEach((n) => n.dom.classList.remove('selected'));
	selectedNodes = [];
}

/*******************************************************
 * DRAW CONNECTIONS
 *******************************************************/
function drawConnections() {
	const svg = document.getElementById('connection-svg');
	svg.innerHTML = '';

	connections.forEach((conn) => {
		const fromNode = nodes.find((n) => n.id === conn.fromID);
		const toNode = nodes.find((n) => n.id === conn.toID);
		if (fromNode && toNode) {
			// center points of each node
			const x1 = fromNode.x + fromNode.dom.offsetWidth / 2;
			const y1 = fromNode.y + fromNode.dom.offsetHeight / 2;
			const x2 = toNode.x + toNode.dom.offsetWidth / 2;
			const y2 = toNode.y + toNode.dom.offsetHeight / 2;

			// line
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.classList.add('connection-line');
			line.setAttribute('x1', x1);
			line.setAttribute('y1', y1);
			line.setAttribute('x2', x2);
			line.setAttribute('y2', y2);
			svg.appendChild(line);
		}
	});
}

/*******************************************************
 * GENERATE DIALS CODE (UPDATED FOR MULTIPLE PARENTS)
 *******************************************************/
function generateCode() {
	let codeLines = [];

	if (currentModelName) {
		codeLines.push(`(model ${currentModelName}) \`is defined as\` {`);
	}

	let agents = {};
	let channels = [];
	let messages = [];

	// Classify nodes
	nodes.forEach((n) => {
		const labelInput = n.dom.querySelector('.node-label');
		n.label = labelInput.value.trim() || n.label;

		if (n.type === 'Agent') {
			agents[n.id] = { node: n, states: {} };
		} else if (n.type === 'State') {
			let parentAgents = findParentAgents(n.id);
			parentAgents.forEach((agent) => {
				if (!agents[agent.id]) {
					agents[agent.id] = { node: agent, states: {} };
				}
				agents[agent.id].states[n.id] = { node: n, actions: [] };
			});
		} else if (n.type === 'Action') {
			let parentStates = findParentStates(n.id);
			parentStates.forEach((state) => {
				let parentAgents = findParentAgents(state.id);
				parentAgents.forEach((agent) => {
					if (!agents[agent.id].states[state.id]) {
						agents[agent.id].states[state.id] = { node: state, actions: [] };
					}

					agents[agent.id].states[state.id].actions.push(n);
				});
			});
		} else if (n.type === 'Channel') {
			channels.push(n);
		} else if (n.type === 'Message') {
			messages.push(n);
		}
	});

	// Generate Agent Code
	Object.values(agents).forEach((agentData) => {
		let agent = agentData.node;

		console.log('agentData', agentData);
		codeLines.push(`  (agent ${agent.label}) has {`);

		Object.values(agentData.states).forEach((stateData) => {
			let state = stateData.node;
			codeLines.push(`    (state ${state.label}) behaves {`);

			stateData.actions.forEach((action) => {
				codeLines.push(`      ` + makeDefaultSnippet('Action', action.label, '') + `\n`);
			});

			codeLines.push(`    }`);
		});

		codeLines.push(`  }`);
	});

	// Generate Channels & Messages
	channels.forEach((channel) => {
		codeLines.push(`  (channel ${channel.label})`);
	});

	messages.forEach((message) => {
		codeLines.push(`  (message ${message.label})`);
	});

	// Generate Connections (Only Agents & Channels)
	codeLines.push('\n  // Connections:');
	connections.forEach((conn) => {
		const fromNode = nodes.find((n) => n.id === conn.fromID);
		const toNode = nodes.find((n) => n.id === conn.toID);

		// Only consider connections between Agents and Channels
		if (
			fromNode &&
			toNode &&
			((fromNode.type === 'Agent' && toNode.type === 'Channel') || (fromNode.type === 'Channel' && toNode.type === 'Agent'))
		) {
			codeLines.push(
				`  (${fromNode.type.toLowerCase()} ${fromNode.label}) <~> (${toNode.type.toLowerCase()} ${toNode.label})`
			);
		}
	});

	if (currentModelName) {
		codeLines.push('}');
	}

	// Show the generated code in a modal
	const codeOutputBlock = document.getElementById('generatedCodeBlock');
	codeOutputBlock.textContent = codeLines.join('\n');
	Prism.highlightElement(codeOutputBlock);
	const modal = new bootstrap.Modal(document.getElementById('modalGeneratedCode'));
	modal.show();
}

/*******************************************************
 * FIND ALL PARENT AGENTS FOR A STATE
 *******************************************************/
function findParentAgents(stateID) {
	let parentAgents = [];

	connections.forEach((conn) => {
		let fromNode = nodes.find((n) => n.id === conn.fromID);
		let toNode = nodes.find((n) => n.id === conn.toID);

		if (fromNode && toNode) {
			if (fromNode.id === stateID && toNode.type === 'Agent') {
				parentAgents.push(toNode);
			}
			if (toNode.id === stateID && fromNode.type === 'Agent') {
				parentAgents.push(fromNode);
			}
		}
	});

	return parentAgents;
}

/*******************************************************
 * FIND ALL PARENT STATES FOR AN ACTION
 *******************************************************/
function findParentStates(actionID) {
	let parentStates = [];

	console.log('connections', connections);

	connections.forEach((conn) => {
		let fromNode = nodes.find((n) => n.id === conn.fromID);
		let toNode = nodes.find((n) => n.id === conn.toID);

		if (fromNode && toNode) {
			if (fromNode.id === actionID && toNode.type === 'State') {
				parentStates.push(toNode);
			}
			if (toNode.id === actionID && fromNode.type === 'State') {
				parentStates.push(fromNode);
			}
		}
	});

	return parentStates;
}

/*******************************************************
 * DEFINE MODEL (MODAL)
 *******************************************************/
function showDefineModelModal() {
	const modelNameInput = document.getElementById('modelName');
	modelNameInput.value = currentModelName || '';
	const modal = new bootstrap.Modal(document.getElementById('modalDefineModel'));
	modal.show();
}

function saveModelName() {
	const val = document.getElementById('modelName').value.trim();
	currentModelName = val;
	// close modal
	const modalElem = document.getElementById('modalDefineModel');
	const modal = bootstrap.Modal.getInstance(modalElem);
	modal.hide();
}

/*******************************************************
 * EDIT NODE PROPERTIES (MODAL)
 *******************************************************/
let editingNode = null;

function openNodeProperties(node) {
	editingNode = node;

	// populate the inputs
	const nodeLabelInput = document.getElementById('editNodeLabel');
	nodeLabelInput.value = node.label;

	const nodeCodeArea = document.getElementById('editNodeCode');
	nodeCodeArea.value = node.customCode;

	// show the modal
	const modalElem = document.getElementById('modalDefineModel');
	const modal = bootstrap.Modal.getOrCreateInstance(modalElem);
	modal.show();
}

function saveNodeProperties() {
	if (!editingNode) return;

	const nodeLabelInput = document.getElementById('editNodeLabel');
	const nodeCodeArea = document.getElementById('editNodeCode');

	editingNode.label = nodeLabelInput.value.trim();
	editingNode.customCode = nodeCodeArea.value;

	// Also update the node’s visible label
	editingNode.dom.querySelector('.node-label').value = editingNode.label;

	// close modal
	const modalElem = document.getElementById('modalEditNode');
	const modal = bootstrap.Modal.getInstance(modalElem);
	modal.hide();

	editingNode = null;
}

/*******************************************************
 * LOAD DIALS CODE AND RECREATE STATE
 *******************************************************/
function loadDialsCode(dialsCode) {
	clearDiagram(); // Reset the canvas before loading new data

	const lines = dialsCode
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	let currentAgent = null;
	let currentState = null;

	let agentMap = {};
	let stateMap = {};
	let actionMap = {};
	let channelMap = {};
	let connections = [];

	lines.forEach((line) => {
		// 1. Detect and create Agents
		let agentMatch = line.match(/\(agent (\w+)\) has \{/);
		if (agentMatch) {
			currentAgent = agentMatch[1];
			let agentNode = createNode('Agent', 100, Object.keys(agentMap).length * 150);
			agentMap[currentAgent] = agentNode;
			agentNode.label = currentAgent;
			return;
		}

		// 2. Detect and create States inside Agents
		let stateMatch = line.match(/\(state (\w+)\) behaves \{/);
		if (stateMatch) {
			currentState = stateMatch[1];
			let stateNode = createNode('State', 250, Object.keys(stateMap).length * 100);
			stateMap[currentState] = stateNode;
			stateNode.label = currentState;

			// Connect state to its parent agent
			if (currentAgent && agentMap[currentAgent]) {
				connections.push({ from: agentMap[currentAgent], to: stateNode });
			}
			return;
		}

		// 3. Detect and create Actions inside States
		let actionMatch = line.match(/\(action (\w+)\) does \{/);
		if (actionMatch) {
			let actionName = actionMatch[1];
			let actionNode = createNode('Action', 400, Object.keys(actionMap).length * 80);
			actionMap[actionName] = actionNode;
			actionNode.label = actionName;

			// Connect action to its parent state
			if (currentState && stateMap[currentState]) {
				connections.push({ from: stateMap[currentState], to: actionNode });
			}
			return;
		}

		// 4. Detect and create Channels
		let channelMatch = line.match(/\(channel (\w+)\)/);
		if (channelMatch) {
			let channelName = channelMatch[1];
			let channelNode = createNode('Channel', 600, Object.keys(channelMap).length * 80);
			channelMap[channelName] = channelNode;
			channelNode.label = channelName;
			return;
		}

		// 5. Detect Connections (Only Agents and Channels)
		let connectionMatch = line.match(/\(agent (\w+)\) <~> \(channel (\w+)\)/);
		if (connectionMatch) {
			let agentLabel = connectionMatch[1];
			let channelLabel = connectionMatch[2];

			let agentNode = agentMap[agentLabel];
			let channelNode = channelMap[channelLabel];

			if (agentNode && channelNode) {
				connections.push({ from: agentNode, to: channelNode });
			}
			return;
		}
	});

	// Create connections after all nodes are initialized
	connections.forEach((conn) => createConnection(conn.from, conn.to));
}
/*******************************************************
 * FIND NODE BY LABEL
 *******************************************************/
function findNodeByLabel(label, type) {
	switch (type) {
		case 'agent':
			return agentMap[label] || null;
		case 'state':
			return stateMap[label] || null;
		case 'action':
			return actionMap[label] || null;
		case 'channel':
			return channelMap[label] || null;
		case 'message':
			return messageMap[label] || null;
		default:
			return null;
	}
}

/*******************************************************
 * CREATE CONNECTION BETWEEN TWO NODES
 *******************************************************/
function createConnection(fromNode, toNode) {
	if (!fromNode || !toNode) return;
	connections.push({ fromID: fromNode.id, toID: toNode.id });
	drawConnections();
}

var code = `
  (agent Agent_1) has {
    (state State_2) behaves {
      (action Action_4) does {}

    }
    (state State_3) behaves {
      (action Action_5) does {}

    }
  }
  (agent Agent_7) has {
  }
  (channel Channel_6)

  // Connections:
  (agent Agent_1) <~> (channel Channel_6)
  (agent Agent_7) <~> (channel Channel_6)
`;

loadDialsCode(code);

/*******************************************************
 * CLEAR DIAGRAM
 * ******************************************************/
function clearDiagram() {
	// Clear nodes
	nodes.forEach((n) => n.dom.remove());
	nodes = [];

	// Clear connections
	connections = [];
	document.getElementById('connection-svg').innerHTML = '';
}
