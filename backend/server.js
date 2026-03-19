import express from 'express';
import cors from 'cors';
import { connectDB, agentsCollection, memoryCollection } from './db.js';
import { generateAgentConfig } from './ai.js';
import { sendToSlack } from './integrations.js'; 

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({ status: "AgentForge Core is online ⚡" });
});

// 🚀 Phase 1: THE BUILDER ROUTE
app.post('/api/build', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        console.log(`\n🛠️ Forging agent for request: "${prompt}"`);
        
        const agentConfig = await generateAgentConfig(prompt);
        const newAgent = { ...agentConfig, status: "active", created_at: new Date().toISOString() };

        await agentsCollection.insertOne(newAgent);
        console.log(`✅ Agent forged: [${newAgent.agent_name}] connected to [${newAgent.required_tools.join(', ')}]`);

        res.json({ success: true, agent: newAgent });
    } catch (error) {
        console.error("🔴 Build failed:", error.message);
        res.status(500).json({ error: "Failed to build agent." });
    }
});

// 📋 Phase 3: GET ALL AGENTS (For Sidebar & Marketplace)
app.get('/api/agents', async (req, res) => {
    try {
        const agents = await (await agentsCollection.find()).toArray();
        // Sort them so the newest agent always appears at the top of the list
        const sortedAgents = agents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json({ success: true, agents: sortedAgents });
    } catch (error) {
        console.error("🔴 Fetch failed:", error.message);
        res.status(500).json({ error: "Failed to fetch agents." });
    }
});

// 🏃 Phase 2: THE RUNNER ROUTE (Dynamic Execution & Memory Patch)
app.post('/api/run', async (req, res) => {
    try {
        const { agent_name, input_data } = req.body;

        // 1. Find the agent
        const agents = await (await agentsCollection.find()).toArray();
        const agent = agents.find(a => a.agent_name === agent_name);
        if (!agent) return res.status(404).json({ error: "Agent not found" });

        console.log(`\n⚙️ Executing [${agent.agent_name}]...`);

        // 2. Fetch past memory 
        const memoryQuery = await (await memoryCollection.find({ agent_name })).toArray();
        const pastMemories = memoryQuery.slice(-2); 
        const memoryContext = pastMemories.map(m => `Old Input: ${m.input}\nOld Output: ${m.output}`).join('\n\n');

// 3. The Dynamic Prompt (Now with Formatting Rules!)
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

        console.log("\n--- RAW PROMPT SENT TO MISTRAL ---");
        console.log(executionPrompt);
        console.log("----------------------------------\n");

        // 4. Send to Local LLM
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'mistral', stream: false, prompt: executionPrompt })
        });

        const data = await response.json();
        const aiOutput = data.response.trim();

        // 5. Save to Memory 
        await memoryCollection.insertOne({
            agent_name: agent.agent_name,
            input: input_data.substring(0, 50) + '...', // Save a bit more context
            output: aiOutput,
            timestamp: new Date().toISOString()
        });

        // 6. Trigger the Tool Integration
        if (agent.required_tools && agent.required_tools.length > 0) {
            const { sendToSlack } = await import('./integrations.js');
            await sendToSlack(agent.agent_name, aiOutput);
        }

        // 7. Return to Frontend
        res.json({ success: true, output: aiOutput });

    } catch (error) {
        console.error("🔴 Execution failed:", error.message);
        res.status(500).json({ error: "Failed to run agent." });
    }
});

async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 AgentForge Server running on http://localhost:${PORT}`);
    });
}
startServer();