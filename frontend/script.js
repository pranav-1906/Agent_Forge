const API_URL = 'http://localhost:5000/api';
let allAgents = []; 
let isLoginMode = true;
let currentTab = 'my-agents'; // State manager for our tabs

// DOM Elements - Auth
const authView = document.getElementById('auth-view');
const appLayout = document.getElementById('app-layout');
const authForm = document.getElementById('auth-form');
const authName = document.getElementById('auth-name');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleLink = document.getElementById('auth-toggle-link');
const authToggleText = document.getElementById('auth-toggle-text');
const authSubtitle = document.getElementById('auth-subtitle');
const authError = document.getElementById('auth-error');
const userGreeting = document.getElementById('user-greeting');
const logoutBtn = document.getElementById('logout-btn');

// DOM Elements - App
const agentList = document.getElementById('agent-list');
const newAgentBtn = document.getElementById('new-agent-btn');
const buildView = document.getElementById('build-view');
const runView = document.getElementById('run-view');
const activeAgentContainer = document.getElementById('active-agent-container');
const promptInput = document.getElementById('prompt-input');
const buildBtn = document.getElementById('build-btn');
const loadingState = document.getElementById('loading-state');

// DOM Elements - Tabs
const tabMyWorkspace = document.getElementById('tab-my-workspace');
const tabMarketplace = document.getElementById('tab-marketplace');

// ==========================================
// 🔐 AUTHENTICATION LOGIC
// ==========================================

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('agentforge_token')}`
    };
}

function checkAuth() {
    const token = localStorage.getItem('agentforge_token');
    const userName = localStorage.getItem('agentforge_user');
    
    if (token) {
        authView.classList.add('hidden');
        appLayout.classList.remove('hidden');
        userGreeting.innerText = `👋 Hi, ${userName}`;
        switchTab('my-agents'); // Default to personal workspace
    } else {
        authView.classList.remove('hidden');
        appLayout.classList.add('hidden');
    }
}

authToggleLink.onclick = (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    authError.classList.add('hidden');
    
    if (isLoginMode) {
        authName.classList.add('hidden');
        authName.removeAttribute('required');
        authSubmitBtn.innerText = 'Sign In';
        authSubtitle.innerText = 'Sign in to your workspace';
        authToggleText.innerText = "Don't have an account?";
        authToggleLink.innerText = 'Create one';
    } else {
        authName.classList.remove('hidden');
        authName.setAttribute('required', 'true');
        authSubmitBtn.innerText = 'Create Account';
        authSubtitle.innerText = 'Start forging agents today';
        authToggleText.innerText = "Already have an account?";
        authToggleLink.innerText = 'Sign in';
    }
};

authForm.onsubmit = async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    authSubmitBtn.innerText = 'Please wait...';

    const endpoint = isLoginMode ? '/auth/login' : '/auth/signup';
    const payload = {
        email: authEmail.value,
        password: authPassword.value,
        ...(isLoginMode ? {} : { name: authName.value })
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.success) {
            localStorage.setItem('agentforge_token', data.token);
            localStorage.setItem('agentforge_user', data.user.name);
            checkAuth();
        } else {
            authError.innerText = data.error;
            authError.classList.remove('hidden');
        }
    } catch (error) {
        authError.innerText = 'Server connection failed.';
        authError.classList.remove('hidden');
    } finally {
        authSubmitBtn.innerText = isLoginMode ? 'Sign In' : 'Create Account';
    }
};

logoutBtn.onclick = () => {
    localStorage.removeItem('agentforge_token');
    localStorage.removeItem('agentforge_user');
    checkAuth();
};

// ==========================================
// 🚀 TAB LOGIC (Marketplace vs Workspace)
// ==========================================

tabMyWorkspace.onclick = () => switchTab('my-agents');
tabMarketplace.onclick = () => switchTab('marketplace');

function switchTab(tabName) {
    currentTab = tabName;
    
    // UI Styling for active tab
    if (tabName === 'my-agents') {
        tabMyWorkspace.style.background = '#5e6ad2';
        tabMyWorkspace.style.color = '#fff';
        tabMarketplace.style.background = '#222';
        tabMarketplace.style.color = '#aaa';
    } else {
        tabMarketplace.style.background = '#5e6ad2';
        tabMarketplace.style.color = '#fff';
        tabMyWorkspace.style.background = '#222';
        tabMyWorkspace.style.color = '#aaa';
    }

    loadAgents(); // Fetch the right data based on tab
}

// ==========================================
// 🚀 APP LOGIC
// ==========================================

async function loadAgents() {
    try {
        // Fetch from the correct route based on the active tab!
        const endpoint = currentTab === 'my-agents' ? '/my-agents' : '/agents';
        const response = await fetch(`${API_URL}${endpoint}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (response.status === 401 || response.status === 403) return logoutBtn.click();

        if (data.success) {
            allAgents = data.agents;
            renderSidebar();
        }
    } catch (error) {
        console.error("Failed to load agents.");
    }
}

function renderSidebar() {
    agentList.innerHTML = '';
    
    if (allAgents.length === 0) {
        const emptyMsg = currentTab === 'my-agents' ? 'No agents yet.<br>Build one!' : 'Marketplace is empty.';
        agentList.innerHTML = `<div style="color:#666; font-size:0.85rem; text-align:center; margin-top:20px;">${emptyMsg}</div>`;
        return;
    }

    allAgents.forEach(agent => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        
        // If in marketplace, show who made it!
        if (currentTab === 'marketplace') {
            item.innerHTML = `<div>${agent.agent_name}</div><div style="font-size:0.75rem; color:#666; margin-top:3px;">by ${agent.creator_name}</div>`;
        } else {
            item.innerText = agent.agent_name;
        }

        item.onclick = () => selectAgent(agent, item);
        agentList.appendChild(item);
    });
}

function selectAgent(agent, element) {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    buildView.classList.add('hidden');
    runView.classList.remove('hidden');

    // 🧬 Conditional Rendering: Clone vs Run
    if (currentTab === 'marketplace') {
        activeAgentContainer.innerHTML = `
            <div class="agent-card">
                <div class="agent-header">
                    <div class="agent-title">${agent.agent_name}</div>
                    <div class="tool-badge">Created by ${agent.creator_name}</div>
                </div>
                <div class="agent-task">${agent.task_description}</div>
                <div class="run-section" style="text-align: center; padding: 30px;">
                    <p style="color: #aaa; margin-bottom: 20px;">Add this agent to your personal workspace to use it.</p>
                    <button class="run-btn" id="clone-btn" style="background: #28a745; max-width: 250px; margin: 0 auto;">Clone to My Workspace</button>
                </div>
            </div>
        `;
        document.getElementById('clone-btn').onclick = () => cloneAgent(agent._id, document.getElementById('clone-btn'));
    } else {
        const placeholderText = agent.required_tools.includes('Slack') ? "Paste data to send to Slack..." : "Enter data here...";
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
        document.getElementById('execute-btn').onclick = () => executeAgent(agent);
    }
}

// 🧬 THE CLONE FUNCTION
async function cloneAgent(agentId, btnElement) {
    btnElement.innerText = 'Cloning...';
    btnElement.disabled = true;

    try {
        const response = await fetch(`${API_URL}/clone`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ agent_id: agentId })
        });
        const data = await response.json();

        if (data.success) {
            btnElement.innerText = 'Cloned!';
            btnElement.style.background = '#5e6ad2';
            
            // Switch back to workspace after 1 second to see the new agent
            setTimeout(() => {
                switchTab('my-agents');
                // Auto-select the newly cloned agent (it will be at the top)
                setTimeout(() => {
                    const firstItem = document.querySelector('.sidebar-item');
                    if(firstItem) firstItem.click();
                }, 300);
            }, 1000);
        } else {
            alert(data.error);
            btnElement.innerText = 'Clone Failed';
        }
    } catch (error) {
        alert("Failed to clone.");
        btnElement.innerText = 'Clone Agent';
        btnElement.disabled = false;
    }
}

newAgentBtn.onclick = () => {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    runView.classList.add('hidden');
    buildView.classList.remove('hidden');
    promptInput.value = '';
    promptInput.focus();
};

buildBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    promptInput.value = '';
    loadingState.classList.remove('hidden');

    try {
        const response = await fetch(`${API_URL}/build`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        
        if (data.success) {
            switchTab('my-agents'); // Ensure we are in workspace
            setTimeout(() => {
                const firstItem = document.querySelector('.sidebar-item');
                if (firstItem) firstItem.click(); // Select the newest one
            }, 300);
        } else {
            alert(data.error || 'Build failed.');
        }
    } catch (error) {
        alert('Build failed. Check server console.');
    } finally {
        loadingState.classList.add('hidden');
    }
};

promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') buildBtn.click();
});

async function executeAgent(agent) {
    const inputData = document.getElementById('run-input').value;
    const outputBox = document.getElementById('run-output');
    const runBtn = document.getElementById('execute-btn');

    if (!inputData) return;

    runBtn.innerText = 'Running...';
    runBtn.disabled = true;
    outputBox.style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/run`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ agent_name: agent.agent_name, input_data: inputData })
        });
        const data = await response.json();
        
        if (data.success) {
            outputBox.innerHTML = marked.parse(data.output);
            outputBox.style.display = 'block';
        } else {
            outputBox.innerText = data.error || 'Execution failed.';
            outputBox.style.display = 'block';
        }
    } catch (error) {
        outputBox.innerText = 'Execution failed. Check connection.';
        outputBox.style.display = 'block';
    } finally {
        runBtn.innerText = 'Run Agent';
        runBtn.disabled = false;
    }
}

// 🎬 Start the app
checkAuth();