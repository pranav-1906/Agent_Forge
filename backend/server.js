import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import { connectDB, agentsCollection, memoryCollection, usersCollection, knowledgeBaseCollection } from './db.js';
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



// ==========================================
// 📚 KNOWLEDGE BASE ROUTES
// ==========================================

// 1. UPLOAD to Knowledge Base
app.post('/api/knowledge/upload', authenticateToken, upload.array('files'), async (req, res) => {
    try {
        const { agent_id } = req.body;
        if (!agent_id || !req.files || req.files.length === 0) return res.status(400).json({ error: "Missing data." });

        const { chunkText, generateEmbedding } = await import('./vector.js');
        let totalChunks = 0;

        for (const file of req.files) {
            let fileText = '';
            if (file.mimetype === 'application/pdf') {
                const pdfModule = await import('pdf-extraction');
                const extractPdf = pdfModule.default || pdfModule;
                fileText = (await extractPdf(file.buffer)).text;
            } else if (file.mimetype === 'text/plain') {
                fileText = file.buffer.toString('utf-8');
            } else continue;

            const chunks = chunkText(fileText, 1000, 200);
            for (let i = 0; i < chunks.length; i++) {
                const embedding = await generateEmbedding(chunks[i]);
                await knowledgeBaseCollection.insertOne({
                    agent_id, chunk_text: chunks[i], embedding, source_filename: file.originalname, uploaded_at: new Date().toISOString()
                });
            }
            totalChunks += chunks.length;
        }
        res.json({ success: true, message: `${totalChunks} chunks indexed.`, totalChunks });
        } catch (error) {
                // 🌟 WE ADDED THIS LINE TO REVEAL THE ERROR
                console.error("🔴 KNOWLEDGE UPLOAD ERROR:", error); 
                res.status(500).json({ error: "Failed to process knowledge base upload." });
            }
        });

// 2. GET Knowledge Base Files
app.get('/api/knowledge/:agent_id', authenticateToken, async (req, res) => {
    try {
        const allChunks = await knowledgeBaseCollection.find({ agent_id: req.params.agent_id }).toArray();
        const fileMap = {};
        allChunks.forEach(chunk => {
            if (!fileMap[chunk.source_filename]) fileMap[chunk.source_filename] = { filename: chunk.source_filename, chunks: 0 };
            fileMap[chunk.source_filename].chunks++;
        });
        res.json({ success: true, files: Object.values(fileMap), totalChunks: allChunks.length });
    } catch (error) { res.status(500).json({ error: "Failed to retrieve KB." }); }
});

// 3. DELETE Knowledge Base File
app.delete('/api/knowledge/:agent_id/:filename', authenticateToken, async (req, res) => {
    try {
        const result = await knowledgeBaseCollection.deleteMany({ agent_id: req.params.agent_id, source_filename: decodeURIComponent(req.params.filename) });
        res.json({ success: true, message: `Removed (${result.deletedCount} chunks).` });
    } catch (error) { res.status(500).json({ error: "Failed to delete file." }); }
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
        // 🧠 LONG-TERM PERSISTENT MEMORY (Vector Search)
        let memoryContext = '';
        try {
            const { searchAgentMemory } = await import('./vector.js');
            // Mathematically pull the 2 most relevant past conversations
            const memoryResults = await searchAgentMemory(input_data, memoryCollection, agent.agent_name, 2);
            if (memoryResults.length > 0) {
                memoryContext = memoryResults.join('\n\n');
            }
        } catch (memErr) {
            console.error("⚠️ Memory Search skipped:", memErr.message);
        }
        // 🛠️ 3. DYNAMIC TOOL INSTRUCTIONS
// 🛠️ 3. DYNAMIC TOOL INSTRUCTIONS
        let toolInstructions = "";
        
        if (tools.includes('Gmail') || tools.includes('Bulk_Email')) {
            toolInstructions += `
CRITICAL TOOL INSTRUCTION (Gmail):
If the user wants to send mail, you MUST include a JSON block at the end:
\`\`\`json
{
  "action": "bulk_email",
  "emails": [{"to": "email@example.com", "subject": "Hi", "text": "Body"}]
}
\`\`\`\n`;
        }

        if (tools.includes('Google_Sheets')) {
            toolInstructions += `
CRITICAL TOOL INSTRUCTION (Sheets):
You MUST log data by adding a JSON block at the very end of your response. 
DO NOT explain how to use APIs. DO NOT provide Python code. ONLY output this:
\`\`\`json
{
  "action": "log_to_sheet",
  "payload": {
    "company": "Company Name",
    "role": "Job Role",
    "details": "Extracted details"
  }
}
\`\`\`\n`;
        }


        // 📚 4. RAG SEARCH: Query the vector database
        let kbContext = '';
        try {
            const { searchStoredKnowledge } = await import('./vector.js');
            // We use the user's input to mathematically search the database
            const kbResults = await searchStoredKnowledge(input_data, knowledgeBaseCollection, agent._id.toString(), 3);
            if (kbResults.length > 0) {
                kbContext = `\n\n--- KNOWLEDGE BASE CONTEXT (Use this to answer) ---\n${kbResults.join('\n\n')}\n--- END KNOWLEDGE BASE ---\n`;
            }
        } catch (kbError) {
            console.error("⚠️ KB Search skipped:", kbError.message);
        }

        // 🧠 4. THE MASTER PROMPT

        const executionPrompt = `You are an AI agent named "${agent.agent_name}".
        Your specific task is: "${agent.task_description}".

        CRITICAL RULES:
        1. Format output: ${agent.output_format_rules || 'Keep it clear, professional, and concise. Use Markdown.'}
        2. If a KNOWLEDGE BASE CONTEXT is provided below, you MUST use it as your primary source of truth.
        3. NO CHATTER & NO META-COMMENTARY: 
        - NEVER say "Based on the provided Knowledge Base..." or mention the context I gave you. Act as if you inherently know this information.
        - NEVER introduce your answers (e.g., do not say "Here is the response").
        - Just output the final, direct answer.
        4. TEXT ONLY: Do NOT wrap your standard conversational response in a JSON object (like {"assistant": "..."}). Write directly to the user in plain text or Markdown!
        ${toolInstructions}

        ${kbContext ? `${kbContext}\n` : ''}
        ${memoryContext ? `--- PAST MEMORY (Do not process this again) ---\n${memoryContext}\n-----------------------------------------------\n` : ''}

        --- NEW INPUT (Process this data) ---
        ${input_data}
        -------------------------------------

        Execute your task and format the output now:`;

        // 🚀 5. EXECUTE AI
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'mistral', stream: false, prompt: executionPrompt, options: { num_predict: 2048 } })
        });

        const data = await response.json();
        let aiOutput = data.response.trim();
        let finalOutput = aiOutput;

// 🕵️ 6. THE UNIVERSAL INTERCEPTOR (Mistral-Proof & Multi-Tool)
const jsonMatch = aiOutput.match(/\{[\s\S]*"action"[\s\S]*\}/);

if (jsonMatch) {
    try {
        // 🌟 Fix: actionData is now defined at the top of this block
        const actionData = JSON.parse(jsonMatch[0]);
        console.log("📦 ACTION DETECTED:", actionData.action);

        // --- 📧 1. BULK EMAIL LOGIC ---
        if (actionData.action === 'bulk_email' && tools.includes('Bulk_Email')) {
            let sentCount = 0;
            for (const email of actionData.emails) {
                await sendEmail(email.to, email.subject, email.text);
                sentCount++;
            }
            finalOutput = aiOutput.replace(jsonMatch[0], `\n\n> **✅ Mass Action:** Successfully sent ${sentCount} customized emails.`);
        }
        
        // --- 📊 2. GOOGLE SHEETS LOGIC (For your LeadLogger) ---
        else if (actionData.action === 'log_to_sheet' && tools.includes('Google_Sheets')) {
            // Extracts the URL from the [SYSTEM TARGET] text we injected in script.js
            const sheetUrl = input_data.match(/\[SYSTEM TARGET - Spreadsheet ID\]: (.*)/)?.[1];
            
            if (sheetUrl) {
                await fireWebhook(sheetUrl, actionData.payload);
                finalOutput = aiOutput.replace(jsonMatch[0], `\n\n> **✅ CRM Updated:** Lead data synced to Google Sheets.`);
            }
        }

        // --- 💬 3. SLACK LOGIC ---
        else if (actionData.action === 'post_to_slack' && tools.includes('Slack')) {
            const slackUrl = input_data.match(/\[SYSTEM TARGET - Slack Webhook URL\]: (.*)/)?.[1];
            if (slackUrl) {
                await fireWebhook(slackUrl, { text: actionData.message });
                finalOutput = aiOutput.replace(jsonMatch[0], `\n\n> **✅ Slack Alert:** Message posted to channel.`);
            }
        }

        // Clean up stray backticks
        finalOutput = finalOutput.replace(/```json/gi, '').replace(/```/g, '');

    } catch (err) { 
        console.error("🔴 JSON Parsing Error in Interceptor:", err); 
    }
}

// 💾 UPGRADED MEMORY SAVER (Now with Vector Embeddings!)
        try {
            const { generateEmbedding } = await import('./vector.js');
            
            // We embed the combination of the question and the answer
            const memoryString = `User asked: ${input_data}\nYou answered: ${aiOutput}`;
            const memoryEmbedding = await generateEmbedding(memoryString);

            await memoryCollection.insertOne({
                agent_name: agent.agent_name,
                input: input_data,
                output: aiOutput,
                embedding: memoryEmbedding,
                timestamp: new Date().toISOString()
            });
            console.log("💾 Interaction saved to Long-Term Memory Vector Store.");
        } catch (memErr) {
            console.error("⚠️ Failed to save embedded memory:", memErr);
        }

        // --- 👇 YOU LIKELY ACCIDENTALLY DELETED THIS BOTTOM SECTION 👇 ---
        res.json({ success: true, output: aiOutput });
    } catch (error) {
        console.error("Run Error:", error);
        res.status(500).json({ error: "Failed to run agent." });
    }
}); // <-- These are the crucial missing brackets that close the /api/run route!

async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 AgentForge Secure Server running on http://localhost:${PORT}`);
    });
}
startServer();