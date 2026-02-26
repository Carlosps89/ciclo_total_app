import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";

const outputLocation = process.env.ATHENA_OUTPUT_S3;

import { fromIni } from "@aws-sdk/credential-providers";

// Ensure region is set, defaulting to sa-east-1 if not provided
const client = new AthenaClient({
    region: process.env.AWS_REGION || "sa-east-1",
    credentials: fromIni({ profile: "rumo-sso" }),
});

export const ATHENA_DATABASE = process.env.ATHENA_DATABASE || "db_gmo_trusted";
export const ATHENA_VIEW = process.env.ATHENA_VIEW || "vw_ciclo_v2";
export const ATHENA_WORKGROUP = process.env.ATHENA_WORKGROUP || "athena_workgroup";

export async function runQuery(query: string): Promise<any | undefined> {
    if (!outputLocation) {
        throw new Error("ATHENA_OUTPUT_S3 is not defined");
    }

    try {
        const start = new StartQueryExecutionCommand({
            QueryString: query,
            QueryExecutionContext: { Database: ATHENA_DATABASE },
            ResultConfiguration: { OutputLocation: outputLocation },
            WorkGroup: ATHENA_WORKGROUP,
        });

        const { QueryExecutionId } = await client.send(start);
        if (!QueryExecutionId) throw new Error("Failed to start query");
        
        console.log(`[Athena] Query Iniciada: ${QueryExecutionId}`);

        // Poll for completion
        let status = "QUEUED";
        let pollCount = 0;
        while (status === "QUEUED" || status === "RUNNING") {
            pollCount++;
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Poll every 1s
            const { QueryExecution } = await client.send(
                new GetQueryExecutionCommand({ QueryExecutionId })
            );
            status = QueryExecution?.Status?.State || "FAILED";

            if (pollCount % 5 === 0) {
                console.log(`[Athena] Query ${QueryExecutionId} status: ${status} (${pollCount}s)`);
            }

            if (status === "FAILED" || status === "CANCELLED") {
                const reason = QueryExecution?.Status?.StateChangeReason || "Unknown Error";
                console.error(`[Athena] Query ${QueryExecutionId} FALHOU: ${reason}`);
                throw new Error(`Query failed: ${reason}`);
            }
        }

        console.log(`[Athena] Query ${QueryExecutionId} FINALIZADA com sucesso.`);

        // Get results
        const results = await client.send(
            new GetQueryResultsCommand({ QueryExecutionId })
        );

        return results.ResultSet;
    } catch (error: unknown) {
        console.error("!!! [Athena] ERRO DE EXECUÇÃO !!!");
        console.error("Query:", query.substring(0, 200) + "...");
        console.error("Error Detail:", error);

        const err = error as { name?: string; message?: string };
        // Handle SSO Expiration specifically
        if (err?.name === 'CredentialsProviderError' || err?.message?.includes('Token is expired') || err?.message?.includes('ExpiredToken')) {
            throw new Error("AWS_SSO_EXPIRED: Token expired. Run 'aws sso login --profile rumo-sso' locally.");
        }

        throw error;
    }
}

// Column mapping logic (naive implementation)
export function mapColumns(columns: string[]): Record<string, string> {
    const map: Record<string, string> = {};

    const find = (keywords: string[]) =>
        columns.find(c => keywords.some(k => c.toLowerCase().includes(k)));

    map.dt_emissao = find(['emissao', 'nf', 'nota']) || 'dt_emissao_nf';
    map.dt_agendamento = find(['agendamento', 'criado']) || 'dt_agendamento_criado';
    map.dt_chegada = find(['chegada', 'checkin', 'cheguei']) || 'dt_chegada_terminal';
    map.dt_peso_saida = find(['peso_saida', 'saida', 'peso']) || 'dt_peso_saida';
    map.dt_janela_inicio = find(['janela_inicio', 'window_start', 'inicio', 'janela']) || 'dt_janela_inicio';
    map.praça = find(['praca', 'praça']) || 'praca';
    map.terminal = find(['terminal']) || 'terminal';
    map.origem = find(['origem']) || 'origem';
    map.id = find(['gmo_id', 'id']) || 'gmo_id';
    map.cliente = find(['cliente']) || 'cliente';

    return map;
}
