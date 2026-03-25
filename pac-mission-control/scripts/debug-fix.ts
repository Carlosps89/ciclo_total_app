import { runQuery, ATHENA_DATABASE, ATHENA_VIEW, getTableColumns } from "./src/lib/athena";
import { getCleanMap, COMMON_CTES } from "./src/lib/athena-sql";

async function debug() {
    console.log("Database:", ATHENA_DATABASE);
    console.log("View/Table:", ATHENA_VIEW);

    try {
        const columns = await getTableColumns(ATHENA_DATABASE, ATHENA_VIEW);
        console.log("Columns found:", columns.length);
        
        const map = getCleanMap(columns);
        console.log("Mapped Columns:", JSON.stringify(map, null, 2));

        const sql = `
            ${COMMON_CTES(map, 'TRO', "AND 1=1")}
            SELECT * FROM calc LIMIT 10
        `;
        
        console.log("Executing Test SQL...");
        const result = await runQuery(sql);
        console.log("Success! Found rows:", result.length);
    } catch (e) {
        console.error("DEBUG FAILED!");
        console.error(e);
    }
}

debug();
