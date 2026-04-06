import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { GET } from "../src/app/api/pac/forecast/route";

async function debugAPI() {
    console.log("Calling Forecast API...");
    const req = new Request("http://localhost/api/pac/forecast?terminal=TRO");
    const res = await GET(req);
    const data = await res.json();
    
    console.log("Summary:");
    console.table(data.summary.map((s: any) => ({
        status: s.status,
        volume: s.volume,
        avg_etapa: s.avg_atual_h,
        avg_acumulado: s.avg_acumulado_h
    })));
}

debugAPI();
