import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import { connectDB, agentsCollection, memoryCollection, usersCollection } from './db.js';
import { generateAgentConfig } from './ai.js';
import { sendEmail, fireWebhook } from './integrations.js';

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
// THE FULLY UPGRADED RUNNER ROUTE (Files + Memory + Tools)
// 🚀 THE UPGRADED RUNNER ROUTE (Handles Multi-File Batches)
// Changed upload.single to upload.array('files', 10) to accept up to 10 files at once
app.post('/api/run', authenticateToken, upload.array('files', 10), async (req, res) => {
    try {
        const agent_name = req.body.agent_name;
        let input_data = req.body.input_data || "";

        // 📄 1. BATCH FILE PARSING LOGIC
        if (req.files && req.files.length > 0) {
            console.log(`📁 Received batch of ${req.files.length} files`);
            input_data += `\n\n--- BATCH DOCUMENT DATA ---\n`;
            
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                if (file.mimetype === 'application/pdf') {
                    const pdfModule = await import('pdf-extraction');
                    const extractPdf = pdfModule.default || pdfModule; 
                    const pdfData = await extractPdf(file.buffer);
                    input_data += `\n[DOCUMENT ${i+1}: ${file.originalname}]\n${pdfData.text}\n`;
                } else if (file.mimetype === 'text/plain') {
                    input_data += `\n[DOCUMENT ${i+1}: ${file.originalname}]\n${file.buffer.toString('utf-8')}\n`;
                }
            }
        }

        if (!input_data.trim()) return res.status(400).json({ error: "Please provide text or upload files." });

        // 🔍 2. FETCH AGENT & PERSISTENT MEMORY
        const agent = await agentsCollection.findOne({ agent_name: agent_name });
        if (!agent) return res.status(404).json({ error: "Agent not found" });

        const tools = agent.required_tools || [];
        const memoryQuery = await memoryCollection.find({ agent_name }).toArray();
        const pastMemories = memoryQuery.slice(-2); 
        const memoryContext = pastMemories.length > 0 ? pastMemories.map(m => `Past Task: ${m.input}\nPast Result: ${m.output}`).join('\n\n') : "";

        // 🛠️ 3. DYNAMIC TOOL INSTRUCTIONS
        let toolInstructions = "";
        
        // NEW: The Bulk Email JSON Structure
        if (tools.includes('Bulk_Email')) {
            toolInstructions += `
CRITICAL TOOL INSTRUCTION:
You have the 'Bulk_Email' tool. You must scan the provided documents, extract the email addresses of the relevant candidates, and draft personalized emails using the SYSTEM CONFIGURATION data. 
You MUST output a JSON block at the end formatted EXACTLY like an array of emails:
\`\`\`json
{
  "action": "bulk_email",
  "emails": [
    {"to": "candidate1@example.com", "subject": "Subject 1", "text": "Full email body 1"},
    {"to": "candidate2@example.com", "subject": "Subject 2", "text": "Full email body 2"}
  ]
}
\`\`\`\n`;
        }

        // 🧠 4. THE MASTER PROMPT
        const executionPrompt = `You are "${agent.agent_name}". Task: "${agent.task_description}".
        
CRITICAL RULES:
1. Format output: ${agent.output_format_rules || 'Professional and concise.'}
${toolInstructions}
${memoryContext ? `--- PAST MEMORY ---\n${memoryContext}\n` : ''}
--- NEW INPUT ---
${input_data}
\nExecute task:`;

        // 🚀 5. EXECUTE AI
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'mistral', stream: false, prompt: executionPrompt, options: { num_predict: 2048 } })
        });

        const data = await response.json();
        let aiOutput = data.response.trim();
        let finalOutput = aiOutput;

        // 🕵️ 6. THE INTERCEPTOR (Bulk Email Loop)
        const jsonMatch = aiOutput.match(/\{[\s\S]*"action"[\s\S]*\}/);

        if (jsonMatch) {
            try {
                const actionData = JSON.parse(jsonMatch[0]);
                
                if (actionData.action === 'bulk_email' && tools.includes('Bulk_Email')) {
                    let sentCount = 0;
                    // Loop through the array Mistral generated and fire individual emails
                    for (const email of actionData.emails) {
                        await sendEmail(email.to, email.subject, email.text);
                        sentCount++;
                    }
                    finalOutput = aiOutput.replace(jsonMatch[0], `\n\n> **✅ Mass Action Executed:** Successfully dispatched ${sentCount} customized emails to candidates.`);
                }
                
                finalOutput = finalOutput.replace(/```json/gi, '').replace(/```/g, '');
            } catch (err) { console.error("Interceptor Parse Error:", err); }
        }

        // ... [LEAVE YOUR 💾 7. SAVE TO MEMORY EXACTLY AS IS] ...

        // 💾 7. SAVE TO MEMORY
        await memoryCollection.insertOne({
            agent_name: agent.agent_name,
            input: input_data.substring(0, 50) + '...',
            output: finalOutput, 
            timestamp: new Date().toISOString()
        });

        res.json({ success: true, output: finalOutput });
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