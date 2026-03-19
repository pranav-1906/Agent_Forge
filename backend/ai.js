// ai.js - The bridge to your local Mistral model
export async function generateAgentConfig(userPrompt) {
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

        if (!response.ok) throw new Error("Ollama is not responding");

        const data = await response.json();
        
        // Ensure we actually got JSON back
        return JSON.parse(data.response);
        
    } catch (error) {
        console.error("AI Generation Error:", error);
        throw error;
    }
}