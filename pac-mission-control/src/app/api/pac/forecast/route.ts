
import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/athena';

// Force dynamic to properly handle request params
export const dynamic = 'force-dynamic';

const DB = "db_gmo_trusted";
const VIEW_MAIN = "vw_ciclo";

// Helper for strict ISO string (with T)
function toIsoStart(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}T00:00:00.000`;
}

function toIsoEnd(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}T23:59:59.999`;
}

// Add days helper
function addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // 1. Parameters
    const terminal = searchParams.get('terminal') || 'TRO';
    const daysAhead = parseInt(searchParams.get('days_ahead') || '0', 10); // 0, 1, 2, 3...
    
    // Logic Parameters
    const anticipationRate = Math.min(100, Math.max(0, parseInt(searchParams.get('anticipation_rate') || '0', 10))) / 100.0;
    const anticipationWindow = Math.max(1, parseInt(searchParams.get('anticipation_window') || '6', 10)); 

    // 2. Timeline Definition
    // We need a continuous timeline to allow spillover.
    // Range: [D-1, D+3] -> 5 days total.
    // This ensures that D receives from D+1, and D-1 receives from D (if we cared, but we focus on D..D+3).
    // Actually, spillover goes BACKWARDS (anticipation).
    // So to calculate D correctly, we need incoming from D+1, D+2 etc.
    // To calculate D+3 correctly, we need D+4? User only asks for D..D+3.
    // Let's stick to D-1 to D+3 fixed range for now, as it covers most immediate needs.
    // If user asks for D+3, we might miss incoming from D+4. 
    // Ideally we'd query D-1 to D+UserMax+Context.
    // Let's do D-1 to D+4 (6 days) to be safe for a D..D+3 horizon.
    
    const now = new Date(); // "Today" (D)
    
    const timelineStart = addDays(now, -1); // D-1
    const timelineEnd = addDays(now, 4);    // D+4 (to allow spillover into D+3)

    // Query Range
    const startIso = toIsoStart(timelineStart); // D-1 00:00
    const endIso = toIsoEnd(timelineEnd);       // D+4 23:59

    // 3. Query: Get Programmed Arrivals by Hour for Full Timeline
    // We Group By DATE and HOUR to map to our continuous timeline
    const programmedQuery = `
      SELECT 
         date_trunc('hour', janela_agendamento) as h_ts,
         count(DISTINCT gmo_id) as cnt
      FROM "${DB}"."${VIEW_MAIN}"
      WHERE terminal = '${terminal}'
        AND janela_agendamento >= from_iso8601_timestamp('${startIso}')
        AND janela_agendamento <= from_iso8601_timestamp('${endIso}')
        AND UPPER(evento) = 'PROGRAMADO'
      GROUP BY 1
      ORDER BY 1
    `;

    const result = await runQuery(programmedQuery);

    // 4. Build Continuous Timeline Map
    // We'll use a Map<TimestampMS, Volume> for sparse storage, or array.
    // Since we need to iterate sequentially and standard hours, let's build an array of hours starting at timelineStart.
    // Total hours = 6 days * 24 = 144 hours.
    
    const hoursMap: Record<string, { programmed: number, predicted: number, date: string, hour: number }> = {};
    
    // Initialize standard timeline
    const current = new Date(timelineStart);
    current.setHours(0,0,0,0);
    const end = new Date(timelineEnd);
    end.setHours(23,0,0,0);

    // We keep a pointer
    const iter = new Date(current);
    while (iter <= end) {
        const key = iter.toISOString(); // e.g. 2026-02-14T00:00:00.000Z - Care with timezone! 
        // Athena returns UTC usually if not offset. 
        // Our 'toIsoStart' uses local browser time which might differ from server.
        // Let's assume consistent UTC handling for simplicity or matching strings.
        // Actually, easiest is to use the string returned by Athena matching our key gen.
        // Athena 'date_trunc' returns timestamp.
        
        // Better: Use a simple integer index relative to start.
        // Index 0 = D-1 00:00.
        // Index 24 = D 00:00.
        // Index 143 = D+4 23:00.
        // We will execute logic on Arrays.
        iter.setHours(iter.getHours() + 1);
    }

    const totalHours = 6 * 24; // 144
    const timelineProgrammed = new Array(totalHours).fill(0);
    const timelinePredicted = new Array(totalHours).fill(0);

    // Fill Programmed from Query
    if (result && result.Rows && result.Rows.length > 1) {
       result.Rows.slice(1).forEach((r: any) => {
           // Athena timestamp format: "2026-02-14 00:00:00.000"
           const tsStr = r.Data[0].VarCharValue; 
           const cnt = parseFloat(r.Data[1].VarCharValue);
           
           // Parse TS (Assume it matches our local generation logic or is standard ISO-like)
           // We need to find which index this belongs to.
           // Replace space with T for standard parsing
           const isoStr = tsStr.replace(' ', 'T');
           const d = new Date(isoStr);
           
           // Diff in hours from timelineStart
           const diffMs = d.getTime() - timelineStart.getTime(); // timelineStart should be set to 00:00:00 loc/utc consistent
           // Align timelineStart to pure midnight of D-1
           const tStartMs = new Date(timelineStart).setHours(0,0,0,0);
           const diffHours = Math.round((d.getTime() - tStartMs) / 3600000);
           
           if (diffHours >= 0 && diffHours < totalHours) {
               timelineProgrammed[diffHours] = cnt;
           }
       });
    }

    // 5. Apply Cross-Day Linear Anticipation
    // Iterate full timeline
    for (let t = 0; t < totalHours; t++) {
        const vol = timelineProgrammed[t];
        if (vol === 0) continue;

        const shiftVol = vol * anticipationRate;
        const stayVol = vol - shiftVol;

        // Add stay
        timelinePredicted[t] += stayVol;

        // Distribute shift BACKWARDS
        const piece = shiftVol / anticipationWindow;

        for (let k = 1; k <= anticipationWindow; k++) {
            const target = t - k;
            if (target >= 0) {
                // Valid spillover (even to previous days)
                timelinePredicted[target] += piece;
            } else {
                // Before start of D-1.
                // Fallback: stay at t (or discard? User said "devolver ao próprio h" for 00h clamp. 
                // Since this is D-1 which we don't display, it effectively disappears from view but maintains mass conservation in abstract)
                timelinePredicted[t] += piece; 
            }
        }
    }

    // 6. Slice for Requested Day
    // User requested 'daysAhead'.
    // D-1 is index 0..23
    // D   is index 24..47 (daysAhead=0)
    // D+1 is index 48..71 (daysAhead=1)
    
    // Offset for D is 24.
    const startHourIndex = 24 + (daysAhead * 24);
    
    // Safety check
    if (startHourIndex + 24 > totalHours) {
        throw new Error("Horizon out of bounds");
    }

    const sliceProgrammed = timelineProgrammed.slice(startHourIndex, startHourIndex + 24);
    const slicePredicted = timelinePredicted.slice(startHourIndex, startHourIndex + 24);
    
    const sliceProgrammedDisplay = sliceProgrammed.map(v => Math.round(v));
    const slicePredictedDisplay = slicePredicted.map(v => Math.round(v));

    const progTotal = sliceProgrammed.reduce((a,b) => a+b, 0);
    const predTotal = slicePredicted.reduce((a,b) => a+b, 0);

    // Response Date
    const targetDate = addDays(now, daysAhead);
    
    // Hours Labels ["00".."23"]
    const hoursLabels = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0'));

    return NextResponse.json({
        ok: true,
        date: targetDate.toISOString().split('T')[0],
        hours: hoursLabels,
        series: {
            programmed: sliceProgrammedDisplay,
            predicted: slicePredictedDisplay,
        },
        totals: {
            programmed_total: Math.round(progTotal),
            predicted_total: Math.round(predTotal),
        },
        debug: {
            anticipation_rate: anticipationRate,
            anticipation_window: anticipationWindow,
            is_cross_day: true
        }
    });

  } catch (error) {
    console.error("Forecast API Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
