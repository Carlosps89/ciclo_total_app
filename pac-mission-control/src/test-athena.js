const { runQuery } = require('./lib/athena.js');
runQuery('SELECT origem, dt_peso_saida, try_cast(dt_peso_saida as timestamp) as ts FROM "db_gmo_trusted"."vw_ciclo_v2" WHERE terminal = \'TRO\' ORDER BY dt_peso_saida DESC LIMIT 5')
  .then(d => console.log(JSON.stringify(d, null, 2)))
  .catch(e => console.error(e));
