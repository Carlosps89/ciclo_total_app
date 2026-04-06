import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";

const getOutputLocation = () => process.env.ATHENA_OUTPUT_S3;

import { fromIni } from "@aws-sdk/credential-providers";
import { refreshAWSSession } from "./aws-auth-service";
import { getCached, setCached } from "./cache";
import { getCleanMap } from "./athena-sql";
import { ResultSet } from "@aws-sdk/client-athena";

let client: AthenaClient | null = null;

function getClient() {
    if (!client) {
        const region = process.env.AWS_REGION || "us-east-1";
        const profile = process.env.AWS_PROFILE || "rumo-sso";
        
        console.log(`[Athena] Inicializando cliente na região ${region} com perfil ${profile}`);
        
        client = new AthenaClient({
            region: region,
            credentials: process.env.AWS_ACCESS_KEY_ID ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
                sessionToken: process.env.AWS_SESSION_TOKEN
            } : fromIni({ profile: profile }),
        });
    }
    return client;
}

export const getAthenaDatabase = () => process.env.ATHENA_DATABASE || "db_gmo_trusted";
export const getAthenaView = () => process.env.ATHENA_VIEW || "vw_ciclo_v2";
export const getAthenaWorkgroup = () => process.env.ATHENA_WORKGROUP || "athena_workgroup";

export const ATHENA_DATABASE = getAthenaDatabase();
export const ATHENA_VIEW = getAthenaView();

export async function getSchemaMap(targetView: string = ATHENA_VIEW): Promise<Record<string, string>> {
    const cacheKey = `schema_map_v2_${targetView}`;
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) return cached;

    console.log(`[Athena] [Cache-Miss] Buscando mapeamento de esquema para: ${targetView}`);
    const result: ResultSet | undefined = await runQuery(`SELECT * FROM "${getAthenaDatabase()}"."${targetView}" LIMIT 0`);
    const cols = result?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || [];
    const map = getCleanMap(cols);
    
    // Cache for 6 hours (schema changes are rare)
    setCached(cacheKey, map, 6 * 60 * 60 * 1000);
    return map;
}


export async function runQuery(query: string, retryCount = 0, appTag: string = 'CCO_Rodo'): Promise<any | undefined> {
    const outputLocation = getOutputLocation();
    if (!outputLocation) {
        throw new Error("ATHENA_OUTPUT_S3 is not defined");
    }

    try {
        // Tagging query for easier filtering in AWS Console
        const taggedQuery = `-- APP:${appTag}\n${query}`;

        const start = new StartQueryExecutionCommand({
            QueryString: taggedQuery,
            QueryExecutionContext: { Database: getAthenaDatabase() },
            ResultConfiguration: { OutputLocation: outputLocation },
            WorkGroup: getAthenaWorkgroup(),
        });

        const { QueryExecutionId } = await getClient().send(start);
        if (!QueryExecutionId) throw new Error("Failed to start query");
        
        const now = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
        console.log(`[${now}] [Athena] Query Iniciada: ${QueryExecutionId}`);

        // Poll for completion
        let status = "QUEUED";
        let pollCount = 0;
        while (status === "QUEUED" || status === "RUNNING") {
            pollCount++;
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Poll every 1s
            const { QueryExecution } = await getClient().send(
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

        const endNow = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
        console.log(`[${endNow}] [Athena] Query ${QueryExecutionId} FINALIZADA com sucesso.`);

        // Get results with pagination to handle > 1000 rows
        let nextToken: string | undefined = undefined;
        let allRows: any[] = [];
        let resultSetMetadata: any = null;

        do {
            const command = new GetQueryResultsCommand({ 
                QueryExecutionId,
                NextToken: nextToken
            });
            const res: any = await getClient().send(command);

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
