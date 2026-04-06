import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE } from "../src/lib/athena";

async function auditAnticipations() {
    console.log("--- STARTING ANTECIPATION CONSISTENCY AUDIT ---");
    
    // We sample 20 trucks that have arrived today/tmr or are ACTIVE
    const sql = `
        WITH raw AS (
            SELECT 
                gmo_id,
                try_cast(cheguei as timestamp) as ts_cheguei,
                try_cast(janela_agendamento as timestamp) as ts_janela,
                dt as partition_dt
            FROM "${ATHENA_DATABASE}"."pac_clean_data"
            WHERE dt = 'ACTIVE' OR dt = format_datetime(current_date, 'yyyy-MM-dd')
            ORDER BY cheguei DESC
            LIMIT 50
        )
        SELECT 
            gmo_id,
            ts_cheguei,
            ts_janela,
            partition_dt,
            CASE WHEN ts_cheguei < ts_janela THEN 1 ELSE 0 END as calc_is_early,
            date_diff('second', ts_cheguei, ts_janela) / 3600.0 as calc_diff_h,
            floor(date_diff('second', ts_cheguei, ts_janela) / 3600.0) as calc_h_bin
        FROM raw
        WHERE ts_cheguei IS NOT NULL AND ts_janela IS NOT NULL
    `;

    try {
        const result: any = await runQuery(sql);
        const rows = result.Rows.slice(1);
        
        console.log(`GMO_ID | CHEGUEI | JANELA | DIFF_H | EARLY? | BIN`);
        console.log("-------------------------------------------------------------------");
        
        let errors = 0;
        rows.forEach((r: any) => {
            const d = r.Data.map((v: any) => v.VarCharValue || "NULL");
            const gmo = d[0];
            const cheguei = d[1];
            const janela = d[2];
            const diff = parseFloat(d[5]);
            const early = d[4] === "1";
            const bin = d[6];
            
            // Manual Logic Check
            const manualEarly = new Date(cheguei) < new Date(janela);
            const status = (manualEarly === early) ? "✅ OK" : "❌ ERR";
            if (!status.includes("OK")) errors++;
            
            console.log(`${gmo} | ${cheguei.substring(11,16)} | ${janela.substring(11,16)} | ${diff.toFixed(1)}h | ${early ? 'YES' : 'NO'} | ${bin} | ${status}`);
        });
        
        console.log("-------------------------------------------------------------------");
        console.log(`Total Samples: ${rows.length} | Errors: ${errors}`);
        
    } catch (e) {
        console.error("Audit failed:", e);
    }
}

auditAnticipations();
