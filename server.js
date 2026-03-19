import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Setup 
const mongoUri = "mongodb://localhost:27017"; // Swap with Atlas if you prefer
const client = new MongoClient(mongoUri);
let db, agentsCollection;

async function connectDB() {
    await client.connect();
    db = client.db('agentforge');
    agentsCollection = db.collection('agents');
    console.log("Connected to MongoDB 🗄️");
}
connectDB();

// 🚀 Route 1: The Magic Builder
app.post('/api/build-agent', async (req, res) => {
    const { userPrompt } = req.body;

    const systemPrompt = `You are a no-code AI platform builder. A user will describe a task. 
    Extract the configuration and reply ONLY in valid JSON format: 
    {"agent_name": "Name", "task_description": "Task", "required_tools": ["Tool1"]}
    
    CRITICAL RULE: For "required_tools", choose ONLY from: ["Slack", "Gmail", "Google Sheets", "Jira"]. Do not invent tools.
    
    User request: "${userPrompt}"`;

    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'mistral',
                stream: false,
                prompt: systemPrompt
            })
        });

        const data = await response.json();
        
        // Parse the stringified JSON from Mistral
        const agentConfig = JSON.parse(data.response);
        
        // Add a timestamp and save to DB
        const newAgent = { ...agentConfig, created_at: new Date() };
        await agentsCollection.insertOne(newAgent);

        res.json({ success: true, agent: newAgent });

    } catch (error) {
        console.error("Error building agent:", error);
        res.status(500).json({ error: "Failed to build agent. Check Ollama connection." });
    }
});

app.listen(5000, () => console.log('AgentForge Core running on port 5000 ⚡'));