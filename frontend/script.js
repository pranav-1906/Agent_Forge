const API_URL = 'http://localhost:5000/api';
let allAgents = []; // Holds our database state locally

// DOM Elements
const agentList = document.getElementById('agent-list');
const newAgentBtn = document.getElementById('new-agent-btn');
const buildView = document.getElementById('build-view');
const runView = document.getElementById('run-view');
const activeAgentContainer = document.getElementById('active-agent-container');
const promptInput = document.getElementById('prompt-input');
const buildBtn = document.getElementById('build-btn');
const loadingState = document.getElementById('loading-state');

// 🚀 INITIALIZATION: Fetch from MongoDB Atlas on load
async function loadAgents() {
    try {
        const response = await fetch(`${API_URL}/agents`);
        const data = await response.json();
        if (data.success) {
            allAgents = data.agents;
            renderSidebar();
        }
    } catch (error) {
        console.error("Failed to load agents from DB.");
    }
}

// 🎨 Render the left sidebar
function renderSidebar() {
    agentList.innerHTML = '';
    allAgents.forEach(agent => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.innerText = agent.agent_name;
        item.onclick = () => selectAgent(agent, item);
        agentList.appendChild(item);
    });
}

// 🖱️ Handle clicking an agent in the sidebar
function selectAgent(agent, element) {
    // 1. Update UI active states
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    // 2. Switch Views
    buildView.classList.add('hidden');
    runView.classList.remove('hidden');

    // 3. Render the specific agent card safely
    const placeholderText = agent.required_tools.includes('Slack') ? 
        "Paste data to send to Slack..." : "Enter data here...";

    activeAgentContainer.innerHTML = `
        <div class="agent-card">
            <div class="agent-header">
                <div class="agent-title">${agent.agent_name}</div>
                <div class="tool-badge">⟎ ${agent.required_tools.join(', ')}</div>
            </div>
            <div class="agent-task">${agent.task_description}</div>
            
            <div class="run-section">
                <textarea id="run-input" placeholder="${placeholderText}"></textarea>
                <button class="run-btn" id="execute-btn">Run Agent</button>
            </div>
            
            <div class="output-box" id="run-output" style="display: none;"></div>
        </div>
    `;

    // 4. Attach the exact event listener safely to this specific card
    document.getElementById('execute-btn').onclick = () => executeAgent(agent);
}

// ➕ Handle clicking "+ New Agent"
newAgentBtn.onclick = () => {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    runView.classList.add('hidden');
    buildView.classList.remove('hidden');
    promptInput.value = '';
    promptInput.focus();
};

// 🛠️ The Build Process
buildBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    promptInput.value = '';
    loadingState.classList.remove('hidden');

    try {
        const response = await fetch(`${API_URL}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        
        if (data.success) {
            await loadAgents(); // Refresh the list from DB
            selectAgent(data.agent); // Instantly switch to the new agent
        }
    } catch (error) {
        alert('Build failed. Check server console.');
    } finally {
        loadingState.classList.add('hidden');
    }
};

// Trigger build on Enter key
promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') buildBtn.click();
});

// 🏃 The Execution Process (Now perfectly isolated!)
async function executeAgent(agent) {
    const inputData = document.getElementById('run-input').value;
    const outputBox = document.getElementById('run-output');
    const runBtn = document.getElementById('execute-btn');

    if (!inputData) return;

    runBtn.innerText = 'Running...';
    runBtn.disabled = true;
    outputBox.style.display = 'none'; // Hide old output while thinking

    try {
        const response = await fetch(`${API_URL}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_name: agent.agent_name, input_data: inputData })
        });

        const data = await response.json();
        
        outputBox.innerHTML = marked.parse(data.output);
        outputBox.style.display = 'block';

    } catch (error) {
        outputBox.innerText = 'Execution failed. Check connection.';
        outputBox.style.display = 'block';
    } finally {
        runBtn.innerText = 'Run Agent';
        runBtn.disabled = false;
    }
}

// Start the app!
loadAgents();