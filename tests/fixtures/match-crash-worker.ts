import {DatabaseSync} from 'node:sqlite';
import {openApplication} from '../../src/application';
import {soloFixture} from './solo';

const [profileDirectory,boundary,requestText]=process.argv.slice(2);
const app=openApplication({profileDirectory,soloContent:soloFixture().content});
function hold(){
  process.send?.({boundary});
  // The parent terminates this owned process; application shutdown cannot flush or repair anything.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
}
// Fault injection stays outside production code and intercepts real SQLite calls.
const exec=DatabaseSync.prototype.exec;
DatabaseSync.prototype.exec=function(sql:string){
  if(sql.trim()==='BEGIN IMMEDIATE;' && boundary==='before-transaction')hold();
  if(sql.trim()==='COMMIT;' && boundary==='before-commit')hold();
  exec.call(this,sql);
  if(sql.trim()==='COMMIT;' && boundary==='after-commit')hold();
};
void app.execute(JSON.parse(requestText)).then(result=>{process.send?.({unexpectedResult:result});return app.close();}).catch(error=>{console.error(error);process.exitCode=1;});
