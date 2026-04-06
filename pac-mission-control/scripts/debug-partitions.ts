import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE } from "../src/lib/athena";

async function debugPartitions() {
    console.log("Checking partitions and ACTIVE count in pac_clean_data...");
    const query = `
      SELECT dt, count(*) as vol
      FROM "${ATHENA_DATABASE}"."pac_clean_data"
      WHERE dt = 'ACTIVE' OR dt > date_format(date_add('day', -2, current_date), '%Y-%m-%d')
      GROUP BY dt
      ORDER BY dt DESC
    `;

    try {
        const result = await runQuery(query);
        console.table(result.Rows.slice(1).map(r => ({
            dt: r.Data[0].VarCharValue,
            vol: r.Data[1].VarCharValue
        })));
    } catch (e) {
        console.error("Failed:", e);
    }
}

debugPartitions();
