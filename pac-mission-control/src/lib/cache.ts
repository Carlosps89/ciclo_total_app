

const cache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();
const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes (Standard for Athena optimization)

export function getCached<T>(key: string): T | null {
    const item = cache.get(key);
    if (!item) return null;

    const effectiveTtl = item.ttl || DEFAULT_TTL;

    const now = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());

    if (Date.now() - item.timestamp > effectiveTtl) {
        console.log(`[${now}] [Cache-Expire] Key: ${key}`);
        cache.delete(key);
        return null;
    }

    console.log(`[${now}] [Cache-Hit] Key: ${key}`);
    return item.data as T;
}

export function setCached(key: string, data: unknown, ttl = DEFAULT_TTL): void {
    cache.set(key, { data, timestamp: Date.now(), ttl });
}
