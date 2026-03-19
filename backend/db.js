// Tactical In-Memory Mock DB to bypass Wi-Fi blocks
const mockDatabase = {
    agents: [],
    memory: [],
    users: [] // <-- NEW: Secure storage for our Auth users
};

// Mimicking MongoDB's API so we don't have to change server.js later
export const agentsCollection = {
    insertOne: async (doc) => { 
        mockDatabase.agents.push({ ...doc, _id: Date.now().toString() }); 
        return { acknowledged: true }; 
    },
    find: (query = {}) => ({ 
        toArray: async () => {
            // Upgraded: Allows us to filter "My Agents" vs "Marketplace" later
            return mockDatabase.agents.filter(a => {
                if (query.creator_id) return a.creator_id === query.creator_id;
                return true; 
            });
        }
    })
};

export const memoryCollection = {
    insertOne: async (doc) => { 
        mockDatabase.memory.push({ ...doc, _id: Date.now().toString() }); 
        return { acknowledged: true }; 
    },
    find: (query = {}) => ({
        toArray: async () => mockDatabase.memory.filter(m => 
            !query.agent_name || m.agent_name === query.agent_name
        )
    })
};

// 🔐 NEW: Users Collection for JWT Auth
export const usersCollection = {
    insertOne: async (doc) => {
        const newUser = { ...doc, _id: Date.now().toString() };
        mockDatabase.users.push(newUser);
        return { acknowledged: true, insertedId: newUser._id };
    },
    findOne: async (query) => {
        // Crucial for Login/Signup: Finds a user by their email
        return mockDatabase.users.find(u => u.email === query.email) || null;
    }
};

export async function connectDB() {
    console.log("🟡 Network Blocked Atlas: Running Tactical In-Memory DB Instead!");
    console.log("🔐 JWT Auth Module: Armed and Ready");
    return true; // Resolves immediately
}