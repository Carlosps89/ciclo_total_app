import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from './src/lib/athena';
async function main() {
  const query = `SELECT MOVIMENTO, DS_SITUACAO, count(*) as cnt 
                 FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" 
                 WHERE terminal = 'TRO' 
                 GROUP BY 1, 2 
                 ORDER BY 3 DESC 
                 LIMIT 20`;
  const res = await runQuery(query);
  console.log('--- STATS START ---');
  res.Rows.forEach(row => {
    console.log(row.Data.map(d => d.VarCharValue).join(' | '));
  });
  console.log('--- STATS END ---');
}
main().catch(console.error);
