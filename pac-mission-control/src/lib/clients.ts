// Client Normalization Logic for CCO Mission Control

export function normalizeClient(rawName: string | null | undefined): string {
    if (!rawName) return '';

    // 1. Basic normalization (upper, remove accents, collapse spaces)
    let n = rawName.toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/<BR\/>/g, ' ')
        .replace(/\|/g, ' ')
        .replace(/\//g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 2. Early Filter: If it's mostly numeric/special chars, it's likely a CNPJ or noise
    if (/^[\d.\-/,\s]+$/.test(n)) {
        return '';
    }

    // 3. Take only the first part if multiple are present (common in joined records)
    // But first, let's remove common noise
    const noise = [
        /\bLTDA\b/g,
        /\bS\s?A\b/g,
        /\bS\.A\.\b/g,
        /\bBRASIL\b/g,
        /\bINDUSTRIA\s?E\s?COMERCIO\b/g,
        /\bAGRONEGOCIO\b/g,
        /\bAGROINDUSTRIAL\b/g,
        /\bINFRAESTRUTURA\b/g,
        /\bINFRA\s?ESTRUTURA\b/g,
        /\bDE\b/g,
    ];
    
    noise.forEach(pattern => {
        n = n.replace(pattern, '');
    });

    // Collapse spaces again after removals
    n = n.replace(/\s+/g, ' ').trim();

    // 4. Brand Mapping (Map long/complex names to brands)
    const brands: Record<string, string> = {
        'COFCO': 'COFCO',
        'CARGILL': 'CARGILL',
        'LOUIS DREYFUS': 'LDC',
        'LDC': 'LDC',
        'AMAGGI': 'AMAGGI',
        'ADM': 'ADM',
        'BUNGE': 'BUNGE',
        'CUTRALE': 'CUTRALE',
        'NOVAAGRI': 'NOVAAGRI',
        'TRES TENTOS': '3TENTOS',
        'USIMAT': 'USIMAT',
        'CHS': 'CHS',
        'BOM FUTURO': 'BOM FUTURO',
        'AMAZONIA': 'AMAZONIA',
        'TELHAR': 'TELHAR',
        'SERTRADING': 'SERTRADING',
        'BTG PACTUAL': 'BTG',
        'AGRICOLA': 'AGRICOLA',
        'MULTIGRAIN': 'MULTIGRAIN',
        'YELLOW': 'YELLOW',
    };

    // Check if any brand keyword is present
    for (const [key, value] of Object.entries(brands)) {
        if (n.includes(key)) {
            return value;
        }
    }

    // 5. Handle repetitions (e.g., "YELLOW YELLOW" -> "YELLOW")
    const words = n.split(' ').filter(w => w.length > 0);
    if (words.length >= 2 && words[0] === words[1]) {
        return words[0];
    }

    // 6. Length Filter: If it's too short (less than 3 chars) unless it's a known brand
    if (n.length < 3 && !['ADM', 'LDC', 'CHS', 'BTG'].includes(n)) {
        return '';
    }

    // Default: Return first two words if no brand matches
    if (words.length > 2) {
        return words.slice(0, 2).join(' ');
    }

    return n || 'OUTROS';
}
