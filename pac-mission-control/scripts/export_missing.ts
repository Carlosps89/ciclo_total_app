import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { runQuery, getSchemaMap } from '../src/lib/athena';
import { COMMON_CTES } from '../src/lib/athena-sql';
import fs from 'fs';
import * as xlsx from 'xlsx';
import Database from 'better-sqlite3';

async function main() {
    console.log('Lendo planilha data (2).xlsx...');
    const workbook = xlsx.readFile('../data (2).xlsx'); // Parent folder
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    const existingIds = new Set(data.map((row: any) => row.gmo_id?.toString().trim()));
    console.log(`Encontrados ${existingIds.size} IDs únicos na planilha excel.`);
    
    // Sample check
    const sampleId = '5992428';
    console.log(`Sample check: ID ${sampleId} in Excel Set? ${existingIds.has(sampleId)}`);
    console.log(`First 5 Excel IDs: ${Array.from(existingIds).slice(0, 5).join(', ')}`);

    console.log('\nLendo base local do Dashboard (pac_history.db) para checar o total...');
    const db = new Database('./data/pac_history.db');
    const localRows = db.prepare(`SELECT gmo_id FROM gmo_history WHERE dt_peso_saida >= '2026-04-01' AND terminal = 'TRO'`).all() as { gmo_id: string }[];
    
    const missingIdsFromExcel = new Set<string>();
    for (const r of localRows) {
        if (!existingIds.has(r.gmo_id)) {
            missingIdsFromExcel.add(r.gmo_id);
        }
    }

    console.log(`Identificadas ${missingIdsFromExcel.size} viagens ausentes na planilha em relação à nossa base.\nBuscando o detalhamento no Athena...`);

    const map = await getSchemaMap();
    const gmoIdList = Array.from(missingIdsFromExcel).map(id => `'${id}'`).join(',');
    
    // Pegando todas as métricas padrão para TRO em todo o mês de Abril
    const query = `
        ${COMMON_CTES(map, 'TRO', '', { start: '2026-04-01', end: '2026-04-30' })}
        SELECT
            gmo_id,
            placa_tracao,
            origem,
            produto,
            cliente,
            dt_emissao,
            dt_agendamento,
            janela_agendamento,
            cheguei,
            dt_chamada,
            dt_chegada,
            peso_saida,
            ciclo_total_h,
            tempo_viagem_h,
            tempo_interno_h,
            aguardando_agendamento_h,
            is_antecipado,
            is_area_verde,
            evento_descricao,
            situacao_descricao
        FROM calc
        WHERE CAST(gmo_id AS VARCHAR) IN (${gmoIdList})
    `;

    const results = await runQuery(query);
    if (!results || !results.Rows || results.Rows.length <= 1) {
        return console.log('Nenhum dado encontrado no Athena para os IDs informados.');
    }

    const headers = results.Rows[0].Data!.map(d => d.VarCharValue);
    const rows = results.Rows.slice(1);

    const missingRows = [];

    for (const r of rows) {
        let id = r.Data![0]?.VarCharValue?.trim();
        if (id && id.endsWith('.0')) id = id.substring(0, id.length - 2);

        missingRows.push(r.Data!.map(d => `"${d.VarCharValue || ''}"`));
    }

    console.log(`Athena retornou dados completos para ${missingRows.length} viagens.`);

    // Criar CSV
    let csv = headers.join(',') + '\n';
    missingRows.forEach(row => {
        csv += String(row.join(',')) + '\n';
    });

    fs.writeFileSync('../viagens_faltantes_auditoria.csv', csv);
    console.log('Concluído! Salvo em /Users/carlospereira/ciclo_total_app/viagens_faltantes_auditoria.csv');
}

main().catch(console.error);
