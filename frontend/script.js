const API_URL = 'http://localhost:5000/api';
let allAgents = []; 
let isLoginMode = true;
let currentTab = 'my-agents'; // State manager for our tabs

let currentAttachedFile = null; // Add this near your other 'let' variables at the top

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

// 🎨 1. The Bulletproof Sidebar Renderer
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
        
        const textWrapper = document.createElement('div');
        textWrapper.style.flexGrow = "1";
        textWrapper.style.overflow = "hidden";
        textWrapper.style.textOverflow = "ellipsis";

        if (currentTab === 'marketplace') {
            textWrapper.innerHTML = `<div>${agent.agent_name}</div><div style="font-size:0.75rem; color:#666; margin-top:3px;">by ${agent.creator_name}</div>`;
        } else {
            textWrapper.innerText = agent.agent_name;
        }
        item.appendChild(textWrapper);

        if (currentTab === 'my-agents') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.title = "Delete Agent";
            deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
            
            deleteBtn.onclick = (e) => deleteAgent(agent._id, e);
            item.appendChild(deleteBtn);
        }

        // THE FIX: Simple, clean click assignment. 
        // (The delete button's stopPropagation will prevent this from firing if the trash icon is clicked).
        item.onclick = () => selectAgent(agent, item);
        
        agentList.appendChild(item);
    });
}

// 🧠 2. The Crash-Proof Agent Selector
// 🧠 The Crash-Proof & Dynamic Agent Selector
function selectAgent(agent, element) {
    document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    buildView.classList.add('hidden');
    runView.classList.remove('hidden');
    
    // Clear any old files hanging around
    currentAttachedFile = null; 

    const tools = agent.required_tools || [];

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
        const placeholderText = tools.includes('Slack') ? "Paste data to send to Slack..." : "Enter text prompt here...";
        
        // 🔮 DYNAMIC UI: Only build the Dropzone if the AI flagged it!
        const fileUploadHTML = agent.accepts_files ? `
            <div class="file-drop-zone" id="drop-zone">
                <input type="file" id="file-input" class="file-input-hidden" accept=".txt,.pdf">
                <div id="drop-zone-text">📄 Drag & drop a PDF or TXT here, or click to browse</div>
                <div id="file-preview-container"></div>
            </div>
        ` : '';

        activeAgentContainer.innerHTML = `
            <div class="agent-card">
                <div class="agent-header">
                    <div class="agent-title">${agent.agent_name}</div>
                    <div class="tool-badge">⟎ ${tools.join(', ') || 'Native Agent'}</div>
                </div>
                <div class="agent-task">${agent.task_description}</div>
                <div class="run-section">
                    <textarea id="run-input" placeholder="${placeholderText}"></textarea>
                    ${fileUploadHTML} <button class="run-btn" id="execute-btn">Run Agent</button>
                </div>
                <div class="output-box" id="run-output" style="display: none;"></div>
            </div>
        `;

        document.getElementById('execute-btn').onclick = () => executeAgent(agent);

        // 🖱️ Wire up the Drag & Drop mechanics if the zone exists
        if (agent.accepts_files) {
            setupDragAndDrop();
        }
    }
}

// 🖱️ Drag & Drop Handlers
function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('file-preview-container');
    const dropText = document.getElementById('drop-zone-text');

    // Click to open file browser
    dropZone.onclick = () => fileInput.click();

    // Prevent default browser behavior (opening the file)
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelection(e.dataTransfer.files[0], dropText, previewContainer);
        }
    });

    // Handle standard click upload
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelection(e.target.files[0], dropText, previewContainer);
        }
    });
}

function handleFileSelection(file, textEl, previewEl) {
    if (file.type !== "application/pdf" && file.type !== "text/plain") {
        alert("Only .pdf and .txt files are supported right now.");
        return;
    }
    currentAttachedFile = file;
    textEl.style.display = 'none'; // Hide the "Drag & Drop" text
    
    // Build the sleek file badge
    previewEl.innerHTML = `
        <div class="file-badge">
            <span>📎 ${file.name}</span>
            <button class="file-remove-btn" onclick="removeFile(event, '${textEl.id}', '${previewEl.id}')">×</button>
        </div>
    `;
}

// Ensure this function is attached to the window so the inline onclick can find it
window.removeFile = function(event, textElId, previewElId) {
    event.stopPropagation(); // Stop the click from opening the file browser again
    currentAttachedFile = null;
    document.getElementById(previewElId).innerHTML = '';
    document.getElementById(textElId).style.display = 'block';
    document.getElementById('file-input').value = ""; // Reset hidden input
};

// 🏃 The Execution Process (Now handles FormData!)
async function executeAgent(agent) {
    const inputData = document.getElementById('run-input').value;
    const outputBox = document.getElementById('run-output');
    const runBtn = document.getElementById('execute-btn');

    if (!inputData && !currentAttachedFile) {
        alert("Please provide text instructions or upload a file.");
        return;
    }

    runBtn.innerText = 'Running...';
    runBtn.disabled = true;
    outputBox.style.display = 'none';

    // 📦 Pack data into FormData (required for sending files)
    const formData = new FormData();
    formData.append('agent_name', agent.agent_name);
    formData.append('input_data', inputData);
    if (currentAttachedFile) {
        formData.append('file', currentAttachedFile);
    }

    // 🛑 CRITICAL HACKATHON RULE: When using FormData, DO NOT set 'Content-Type'. 
    // The browser will automatically set it to 'multipart/form-data' with the correct boundary.
    const headers = {
        'Authorization': `Bearer ${localStorage.getItem('agentforge_token')}`
    };

    try {
        const response = await fetch(`${API_URL}/run`, {
            method: 'POST',
            headers: headers, 
            body: formData
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



// 🗑️ THE DELETE LOGIC
async function deleteAgent(agentId, event) {
    event.stopPropagation(); // Stops the click from triggering the agent card opening

    // Optional: Add a quick confirmation so they don't accidentally delete a masterpiece
    if (!confirm("Are you sure you want to permanently delete this agent?")) return;

    const btn = event.currentTarget;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';

    try {
        const response = await fetch(`${API_URL}/agents/${agentId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            // Remove from local memory immediately for snappy UI
            allAgents = allAgents.filter(a => a._id !== agentId);
            renderSidebar();

            // Kick them back to the Build View so they aren't looking at a dead agent
            runView.classList.add('hidden');
            buildView.classList.remove('hidden');
        } else {
            alert(data.error || "Failed to delete agent.");
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        }
    } catch (error) {
        alert("Server error while deleting.");
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    }
}

// 🎬 Start the app
checkAuth();