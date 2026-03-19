const API_URL = 'http://localhost:5000/api';
let allAgents = []; 
let isLoginMode = true;

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

// ==========================================
// 🔐 AUTHENTICATION LOGIC
// ==========================================

// Helper: Get token for API calls
function getAuthHeaders() {
    const token = localStorage.getItem('agentforge_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Check auth state on load
function checkAuth() {
    const token = localStorage.getItem('agentforge_token');
    const userName = localStorage.getItem('agentforge_user');
    
    if (token) {
        authView.classList.add('hidden');
        appLayout.classList.remove('hidden');
        userGreeting.innerText = `👋 Hi, ${userName}`;
        loadAgents(); // Load their specific agents!
    } else {
        authView.classList.remove('hidden');
        appLayout.classList.add('hidden');
    }
}

// Toggle Login / Signup UI
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

// Handle Form Submission
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
            // Save VIP Token & User Info
            localStorage.setItem('agentforge_token', data.token);
            localStorage.setItem('agentforge_user', data.user.name);
            checkAuth(); // Boot them into the app
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

// Handle Logout
logoutBtn.onclick = () => {
    localStorage.removeItem('agentforge_token');
    localStorage.removeItem('agentforge_user');
    checkAuth();
};

// ==========================================
// 🚀 APP LOGIC (Now protected with getAuthHeaders!)
// ==========================================

async function loadAgents() {
    try {
        // NOTE: Hitting /my-agents to only get THIS user's creations
        const response = await fetch(`${API_URL}/my-agents`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (response.status === 401 || response.status === 403) {
            logoutBtn.click(); // Token expired, force logout
            return;
        }

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
        agentList.innerHTML = '<div style="color:#666; font-size:0.85rem; text-align:center; margin-top:20px;">No agents yet.<br>Build one!</div>';
        return;
    }

    allAgents.forEach(agent => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.innerText = agent.agent_name;
        item.onclick = () => selectAgent(agent, item);
        agentList.appendChild(item);
    });
}

function selectAgent(agent, element) {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    buildView.classList.add('hidden');
    runView.classList.remove('hidden');

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
            headers: getAuthHeaders(), // Secure!
            body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        
        if (data.success) {
            await loadAgents();
            selectAgent(data.agent, document.querySelector('.sidebar-item')); // Select the newest one
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
            headers: getAuthHeaders(), // Secure!
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

// 🎬 Start the app by checking Auth Status!
checkAuth();