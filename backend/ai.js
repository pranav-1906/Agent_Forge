// backend/ai.js
export async function generateAgentConfig(userPrompt) {
    const systemPrompt = `You are a top-tier, no-code AI platform builder. A user will describe a task. 
    Extract the configuration and reply ONLY in valid JSON format like this: 
    {
        "agent_name": "Name", 
        "task_description": "What the agent does", 
        "required_tools": ["Tool1"],
        "output_format_rules": "Strict instructions on how the final output must look visually (e.g., 'Use bullet points with emojis for metrics', 'Return a numbered list', 'Output a simple table format')"
    }
    
    CRITICAL RULES:
    1. For "required_tools", choose ONLY from: ["Slack", "Gmail", "Google Sheets", "Jira"].
    2. "output_format_rules" MUST dictate the visual structure based on what makes sense for the user's goal. Think like a UI/UX designer structuring data.
    
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
        return JSON.parse(data.response);
        
    } catch (error) {
        console.error("AI Generation Error:", error);
        throw error;
    }
}