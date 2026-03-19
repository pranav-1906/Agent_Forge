// Tactical In-Memory Mock DB to bypass Wi-Fi blocks
const mockDatabase = {
    agents: [],
    memory: []
};

// Mimicking MongoDB's API so we don't have to change server.js later
export const agentsCollection = {
    insertOne: async (doc) => { 
        mockDatabase.agents.push({ ...doc, _id: Date.now() }); 
        return { acknowledged: true }; 
    },
    find: () => ({ toArray: async () => mockDatabase.agents })
};

export const memoryCollection = {
    insertOne: async (doc) => { 
        mockDatabase.memory.push({ ...doc, _id: Date.now() }); 
        return { acknowledged: true }; 
    },
    find: (query = {}) => ({
        toArray: async () => mockDatabase.memory.filter(m => 
            !query.agent_name || m.agent_name === query.agent_name
        )
    })
};

export async function connectDB() {
    console.log("🟡 Network Blocked Atlas: Running Tactical In-Memory DB Instead!");
    return true; // Resolves immediately
}