const API_URL = 'http://localhost:5000/api';

const promptInput = document.getElementById('prompt-input');
const buildBtn = document.getElementById('build-btn');
const workspace = document.getElementById('agents-grid');
const loadingState = document.getElementById('loading-state');

// Trigger build on Enter key
promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') buildAgent();
});

buildBtn.addEventListener('click', buildAgent);

async function buildAgent() {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    // UI Updates
    promptInput.value = '';
    loadingState.classList.remove('hidden');

    try {
        const response = await fetch(`${API_URL}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const data = await response.json();
        loadingState.classList.add('hidden');

        if (data.success) {
            renderAgentCard(data.agent);
        } else {
            alert('Build failed. Check server console.');
        }
    } catch (error) {
        loadingState.classList.add('hidden');
        alert('Cannot connect to the backend server.');
    }
}

function renderAgentCard(agent) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    
    // Default placeholder for our hero demo
    const placeholderText = agent.required_tools.includes('Slack') ? 
        "Paste a candidate's resume here..." : "Enter data here...";

    card.innerHTML = `
        <div class="agent-header">
            <div class="agent-title">${agent.agent_name}</div>
            <div class="tool-badge">⟎ ${agent.required_tools.join(', ')}</div>
        </div>
        <div class="agent-task">${agent.task_description}</div>
        
        <div class="run-section">
            <textarea id="input-${agent._id}" placeholder="${placeholderText}"></textarea>
            <button class="run-btn" onclick="runAgent('${agent.agent_name}', '${agent._id}')">Run Agent</button>
        </div>
        
        <div class="output-box" id="output-${agent._id}"></div>
    `;

    // Add to the top of the workspace
    workspace.prepend(card);
}

// Attach to window so the onclick in HTML can find it
window.runAgent = async function(agentName, agentId) {
    const inputData = document.getElementById(`input-${agentId}`).value;
    const outputBox = document.getElementById(`output-${agentId}`);
    const runBtn = event.target;

    if (!inputData) return;

    // UI Loading state for the specific button
    runBtn.innerText = 'Running...';
    runBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent_name: agentName, input_data: inputData })
        });

        const data = await response.json();
        
        // Show output parsed as beautiful HTML
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