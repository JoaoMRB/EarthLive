import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;
let isRedisConnected = false;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => {
        if (retries > 5) {
          console.warn('Redis reconnection limit reached, running on memory fallback');
          return new Error('Redis reconnection failed');
        }
        return Math.min(retries * 500, 2000);
      },
    },
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
    isRedisConnected = false;
  });

  redisClient.on('connect', () => {
    console.log('Redis client: Connecting...');
  });

  redisClient.on('ready', () => {
    console.log('Redis client: Connected and ready');
    isRedisConnected = true;
  });

  redisClient.connect().catch((err) => {
    console.error('Failed to connect to Redis. Running on memory fallback.', err);
    isRedisConnected = false;
  });
} else {
  console.log('REDIS_URL is not set. Cache will fall back to in-memory store.');
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();

export async function getCached<T>(key: string, ttlMs: number): Promise<T | null> {
  if (isRedisConnected && redisClient) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        return JSON.parse(data) as T;
      }
    } catch (err) {
      console.error(`Redis getCached error for key ${key}:`, err);
    }
  }

  // Memory fallback
  const entry = memoryStore.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.timestamp < ttlMs) {
    return entry.data;
  }
  return null;
}

export async function setCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  if (isRedisConnected && redisClient) {
    try {
      const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
      await redisClient.set(key, JSON.stringify(data), { EX: ttlSec });
      return;
    } catch (err) {
      console.error(`Redis setCache error for key ${key}:`, err);
    }
  }

  // Memory fallback
  memoryStore.set(key, { data, timestamp: Date.now() });
}

export async function getCacheMeta(key: string): Promise<{
  present: boolean;
  ageMs: number | null;
}> {
  if (isRedisConnected && redisClient) {
    try {
      const ttl = await redisClient.ttl(key);
      if (ttl > 0) {
        return { present: true, ageMs: null };
      }
      return { present: false, ageMs: null };
    } catch {
      // fallback to memory
    }
  }

  const entry = memoryStore.get(key);
  if (!entry) return { present: false, ageMs: null };
  return { present: true, ageMs: Date.now() - entry.timestamp };
}
