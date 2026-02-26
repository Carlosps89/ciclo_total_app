

const cache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();
const DEFAULT_TTL = 60 * 1000; // 60 seconds

export function getCached<T>(key: string): T | null {
    const item = cache.get(key);
    if (!item) return null;

    const effectiveTtl = item.ttl || DEFAULT_TTL;

    if (Date.now() - item.timestamp > effectiveTtl) {
        cache.delete(key);
        return null;
    }

    return item.data as T;
}

export function setCached(key: string, data: unknown, ttl = DEFAULT_TTL): void {
    cache.set(key, { data, timestamp: Date.now(), ttl });
}
