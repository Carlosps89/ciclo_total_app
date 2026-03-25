import { getRawClientsByNorm } from './db';

export function getClientAthenaFilter(terminal: string, clienteNorm: string | null, columnRef: string): string {
    if (!clienteNorm) return '';

    const rawClients = getRawClientsByNorm(terminal, clienteNorm);
    if (rawClients.length === 0) {
        // Fallback: If no mapping found (shouldn't happen with sync), 
        // try to match the norm name as a substring (less accurate but safe)
        return `AND ${columnRef} LIKE '%${clienteNorm.replace(/'/g, "''")}%'`;
    }

    const safeList = rawClients.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
    return `AND ${columnRef} IN (${safeList})`;
}
