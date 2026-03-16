import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";

const outputLocation = process.env.ATHENA_OUTPUT_S3;

import { fromIni } from "@aws-sdk/credential-providers";
import { refreshAWSSession } from "./aws-auth-service";

// Ensure region is set, defaulting to sa-east-1 if not provided
const client = new AthenaClient({
    region: process.env.AWS_REGION || "sa-east-1",
    credentials: process.env.AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: process.env.AWS_SESSION_TOKEN
    } : fromIni({ profile: "rumo-sso" }),
});

export const ATHENA_DATABASE = process.env.ATHENA_DATABASE || "db_gmo_trusted";
export const ATHENA_VIEW = process.env.ATHENA_VIEW || "vw_ciclo_v2";
export const ATHENA_WORKGROUP = process.env.ATHENA_WORKGROUP || "athena_workgroup";

export async function runQuery(query: string, retryCount = 0): Promise<any | undefined> {
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

        // Get results with pagination to handle > 1000 rows
        let nextToken: string | undefined = undefined;
        let allRows: any[] = [];
        let resultSetMetadata: any = null;

        do {
            const command = new GetQueryResultsCommand({ 
                QueryExecutionId,
                NextToken: nextToken
            });
            const res: any = await client.send(command);

            if (!resultSetMetadata && res.ResultSet?.ResultSetMetadata) {
                resultSetMetadata = res.ResultSet.ResultSetMetadata;
            }

            if (res.ResultSet?.Rows) {
                allRows = allRows.concat(res.ResultSet.Rows);
            }

            nextToken = res.NextToken;
        } while (nextToken);

        return {
            ResultSetMetadata: resultSetMetadata,
            Rows: allRows
        };
    } catch (error: unknown) {
        console.error("!!! [Athena] ERRO DE EXECUÇÃO !!!");
        
        const err = error as { name?: string; message?: string };
        const isAuthError = err?.name === 'CredentialsProviderError' || 
                           err?.name === 'AccessDeniedException' ||
                           err?.message?.includes('Token is expired') || 
                           err?.message?.includes('ExpiredToken') ||
                           err?.message?.includes('not authorized to perform');

        if (isAuthError && retryCount === 0) {
            console.warn("[Athena] Token expirado detectado. Tentando refresh automático...");
            const refreshed = await refreshAWSSession("rumo-sso");
            if (refreshed) {
                console.info("[Athena] Sessão renovada. Retentando query...");
                return runQuery(query, 1);
            }
        }

        console.error("Error Detail:", error);
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
