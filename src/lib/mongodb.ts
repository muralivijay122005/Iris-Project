import mongoose from "mongoose";
import dns from "dns";

// Node's resolver fails SRV lookups for mongodb+srv:// on some local networks
// (querySrv ECONNREFUSED), so use public DNS in development. Applied right
// before connecting so bundler module ordering can't skip it.
function applyDevDns() {
  if (process.env.NODE_ENV === "development") {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }
}

let cached: {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
} = {
  conn: null,
  promise: null,
};

const MAX_ATTEMPTS = 3;
const INITIAL_DELAY = 100; // Initial delay in ms
const BACKOFF_MULTIPLIER = 2; // Backoff multiplier

export async function connectToDatabase(attempt = 1) {
  if (mongoose.connection.readyState >= 1) {
    console.info("Using existing MongoDB connection");
    return mongoose.connection;
  }

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not defined");
    throw new Error("MONGODB_URI is not defined in environment variables");
  }

  try {
    if (!cached.promise) {
      applyDevDns();
      console.info(`Connecting to MongoDB (Attempt ${attempt})...`);
      cached.promise = mongoose.connect(process.env.MONGODB_URI, {
        dbName: "chatbot",
        bufferCommands: true,
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 5000,
      });
    }
    cached.conn = await cached.promise;
    console.info("MongoDB connected successfully");
    return cached.conn;
  } catch (error) {
    console.error("MongoDB connection failed:");
    console.error(error);

    cached.promise = null;
    if (attempt < MAX_ATTEMPTS) {
      const delay = INITIAL_DELAY * Math.pow(BACKOFF_MULTIPLIER, attempt - 1); // Exponential backoff
      console.log(`Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return connectToDatabase(attempt + 1);
    }
    throw error;
  } finally {
    // Reset cached object
    cached = {
      conn: null,
      promise: null,
    };
  }
}

export async function isMongoDBConnected() {
  return mongoose.connection.readyState === 1;
}
