import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery } from "../src/lib/athena";

async function describeTable() {
    try {
        const result = await runQuery("DESCRIBE pac_clean_data");
        console.table(result.Rows.map(r => ({ col: r.Data[0].VarCharValue })));
    } catch (e) {
        console.error(e);
    }
}

describeTable();
