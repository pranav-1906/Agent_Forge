// backend/ai.js
export async function generateAgentConfig(userPrompt) {
const systemPrompt = `You are the AgentForge Architect. You design autonomous AI agents.
    Based on the user's request, return ONLY a valid JSON object:
    {
        "agent_name": "Catchy Name", 
        "task_description": "Specific instructions for the agent", 
        "required_tools": ["Tool_Name"],
        "required_inputs": ["Input_Label_1", "Input_Label_2"],
        "output_format_rules": "Visual styling for the response",
        "accepts_files": true
    }
    
    CRITICAL ARCHITECT RULES:
    1. TOOLS: Choose from ["Bulk_Email", "Slack", "Google_Sheets"]. 
       - Use "Bulk_Email" if sending to multiple people.
       - Use "Google_Sheets" for CRM/Finance/Data logging.
    2. DYNAMIC INPUTS: These are the "Textboxes" the user fills in.
       - If the task needs external context (e.g., Company Name, Job Role, Spreadsheet ID, Slack Channel), list them in "required_inputs".
       - DO NOT ask for "Target Email" if the agent is meant to find emails in uploaded files.
    3. FILES: Set "accepts_files" to true if the agent needs to read Resumes, Invoices, or Reports.
    
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
        let rawText = data.response.trim();

        // 🛡️ THE SANITIZER PIPELINE
        // 1. Strip out markdown code block wrappers if Mistral added them
        rawText = rawText.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        
        // 2. Eradicate literal newlines, carriage returns, and tabs that break JSON.parse
        rawText = rawText.replace(/[\n\r]/g, ' ').replace(/\t/g, ' ');

        // 3. Find the first '{' and last '}' to extract ONLY the JSON object
        const startIndex = rawText.indexOf('{');
        const endIndex = rawText.lastIndexOf('}');
        
        if (startIndex === -1 || endIndex === -1) {
            throw new Error("LLM did not return a valid JSON object.");
        }
        
        const cleanJsonString = rawText.substring(startIndex, endIndex + 1);

        return JSON.parse(cleanJsonString);
        
    } catch (error) {
        console.error("🔴 AI Generation Error:", error.message);
        throw error;
    }
}