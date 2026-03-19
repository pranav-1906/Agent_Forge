import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import { connectDB, agentsCollection, memoryCollection, usersCollection } from './db.js';
import { generateAgentConfig } from './ai.js';
import { sendToSlack } from './integrations.js'; 

const upload = multer({ storage: multer.memoryStorage() });


const app = express();
const PORT = 5000;
const JWT_SECRET = "agentforge_hackathon_super_secret"; // The key to minting tokens

app.use(cors());
app.use(express.json());

// ==========================================
// 🔐 AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // 1. Check if user exists
        const existing = await usersCollection.findOne({ email });
        if (existing) return res.status(400).json({ error: "Email already in use." });

        // 2. Hash password & Save
        const hashedPassword = await bcrypt.hash(password, 10);
        const { insertedId } = await usersCollection.insertOne({ name, email, password: hashedPassword });

        // 3. Mint JWT Token
        const token = jwt.sign({ id: insertedId, name }, JWT_SECRET);
        res.json({ success: true, token, user: { id: insertedId, name } });
    } catch (err) {
        res.status(500).json({ error: "Signup failed." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found." });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(401).json({ error: "Invalid credentials." });

        const token = jwt.sign({ id: user._id, name: user.name }, JWT_SECRET);
        res.json({ success: true, token, user: { id: user._id, name: user.name } });
    } catch (err) {
        res.status(500).json({ error: "Login failed." });
    }
});

// ==========================================
// 🛡️ THE GATEKEEPER MIDDLEWARE
// ==========================================
// Any route using this function requires a valid login token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"
    
    if (!token) return res.status(401).json({ error: "Access Denied. Please log in." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid or expired token." });
        req.user = user; // Attach the user info to the request
        next(); // Let them pass
    });
}

// ==========================================
// 🚀 CORE APP ROUTES (Now Protected!)
// ==========================================

// GET ALL AGENTS (For the future Marketplace - Open to everyone)
app.get('/api/agents', async (req, res) => {
    const agents = await (await agentsCollection.find()).toArray();
    res.json({ success: true, agents: agents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
});

// GET MY AGENTS (For the Sidebar - Requires Login)
app.get('/api/my-agents', authenticateToken, async (req, res) => {
    // Only fetch agents where creator_id matches the logged-in user
    const agents = await (await agentsCollection.find({ creator_id: req.user.id })).toArray();
    res.json({ success: true, agents: agents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
});

// THE BUILDER ROUTE (Requires Login)
app.post('/api/build', authenticateToken, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        const agentConfig = await generateAgentConfig(prompt);
        
        // Tag the agent with the user's ID so they own it!
        const newAgent = { 
            ...agentConfig, 
            creator_id: req.user.id, 
            creator_name: req.user.name,
            status: "active", 
            created_at: new Date().toISOString() 
        };

        await agentsCollection.insertOne(newAgent);
        res.json({ success: true, agent: newAgent });
    } catch (error) {
        res.status(500).json({ error: "Failed to build agent." });
    }
});

// 🧬 THE CLONE ROUTE (Marketplace Magic)
app.post('/api/clone', authenticateToken, async (req, res) => {
    try {
        const { agent_id } = req.body;
        
        // 1. Find the original agent in the global database
        const originalAgent = await agentsCollection.findOne({ _id: new ObjectId(agent_id) });
        if (!originalAgent) return res.status(404).json({ error: "Agent not found" });

        // 2. Strip the old ID and stamp it with the NEW user's ID
        const clonedAgent = {
            agent_name: `${originalAgent.agent_name} (Copy)`,
            task_description: originalAgent.task_description,
            required_tools: originalAgent.required_tools,
            output_format_rules: originalAgent.output_format_rules,
            creator_id: req.user.id,        // The person cloning it
            creator_name: req.user.name,    // Their name
            status: "active",
            created_at: new Date().toISOString()
        };

        // 3. Save it to their personal workspace
        await agentsCollection.insertOne(clonedAgent);
        res.json({ success: true, agent: clonedAgent });
        
    } catch (error) {
        console.error("Clone Error:", error);
        res.status(500).json({ error: "Failed to clone agent." });
    }
});

// 🗑️ THE DELETE ROUTE
app.delete('/api/agents/:id', authenticateToken, async (req, res) => {
    try {
        const agentId = req.params.id;

        // 1. Find the agent to verify ownership
        const agent = await agentsCollection.findOne({ _id: new ObjectId(agentId) });
        if (!agent) return res.status(404).json({ error: "Agent not found." });

        // 2. SECURITY CHECK: Ensure the logged-in user is the creator
        if (agent.creator_id !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized to delete this agent." });
        }

        // 3. Delete from Atlas
        await agentsCollection.deleteOne({ _id: new ObjectId(agentId) });

        // (Optional) Clean up the agent's memory so it doesn't float around
        await memoryCollection.deleteMany({ agent_name: agent.agent_name });

        res.json({ success: true, message: "Agent deleted." });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: "Failed to delete agent." });
    }
});


// THE RUNNER ROUTE (Requires Login)
// THE RUNNER ROUTE (Now with File Support!)
// Notice we added `upload.single('file')` as middleware before the async function
app.post('/api/run', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        // Since we might be sending a file, the frontend will send FormData instead of raw JSON
        const agent_name = req.body.agent_name;
        let input_data = req.body.input_data || "";

        // 📄 FILE PARSING LOGIC
        if (req.file) {
            console.log(`📁 Received file: ${req.file.originalname}`);
            
            if (req.file.mimetype === 'application/pdf') {
                // 🛡️ THE MODERN FORK BYPASS
                const pdfModule = await import('pdf-extraction');
                const extractPdf = pdfModule.default || pdfModule; 
                
                const pdfData = await extractPdf(req.file.buffer);
                input_data += `\n\n--- EXTRACTED FILE CONTENT ---\n${pdfData.text}`;
            } 
            else if (req.file.mimetype === 'text/plain') {
                const textData = req.file.buffer.toString('utf-8');
                input_data += `\n\n--- EXTRACTED FILE CONTENT ---\n${textData}`;
            } 
            else {
                return res.status(400).json({ error: "Unsupported file type. Please upload .pdf or .txt" });
            }
        }

        if (!input_data.trim()) {
            return res.status(400).json({ error: "Please provide text or upload a file." });
        }

        // 🔍 Fetch Agent details
        const agent = await agentsCollection.findOne({ agent_name: agent_name });
        if (!agent) return res.status(404).json({ error: "Agent not found" });

        // 🧠 Memory Context
        const memoryQuery = await (await memoryCollection.find({ agent_name })).toArray();
        const pastMemories = memoryQuery.slice(-2); 
        const memoryContext = pastMemories.map(m => `Old Input: ${m.input}\nOld Output: ${m.output}`).join('\n\n');

        const executionPrompt = `You are an AI agent named "${agent.agent_name}".
Your specific task is: "${agent.task_description}".

CRITICAL RULES:
1. You must execute your task ONLY on the "NEW INPUT" provided below.
2. YOU MUST FORMAT YOUR OUTPUT EXACTLY LIKE THIS: ${agent.output_format_rules || 'Keep it clear, professional, and concise.'}
3. Do NOT copy, repeat, or process the "PAST MEMORY". 

${memoryContext ? `--- PAST MEMORY (Do not process this again) ---\n${memoryContext}\n-----------------------------------------------\n` : ''}

--- NEW INPUT (Process this data) ---
${input_data}
-------------------------------------

Execute your task and format the output now:`;

        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'mistral', stream: false, prompt: executionPrompt })
        });

        const data = await response.json();
        const aiOutput = data.response.trim();

        await memoryCollection.insertOne({
            agent_name: agent.agent_name,
            input: input_data.substring(0, 50) + '...',
            output: aiOutput,
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, output: aiOutput });
    } catch (error) {
        console.error("Run Error:", error);
        res.status(500).json({ error: "Failed to run agent." });
    }
});


async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 AgentForge Secure Server running on http://localhost:${PORT}`);
    });
}
startServer();