import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {openApplication} from '../src/application';
async function main(){
  const fixture=JSON.parse(await readFile('.local/solo-ui-profile.json','utf8')),app=openApplication({profileDirectory:fixture.profileDirectory,matchSeed:'0'.repeat(63)+'1'});
  try{
    const saved=await app.execute({type:'solo.createSetup',requestId:randomUUID(),deckId:fixture.supportedId,expectedRevision:1,opponentKey:'genesis-starter-corpo'});if(!saved.ok)throw new Error(saved.error.message);const id=saved.data.id;
    const chose=await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:0,action:{type:'choose-starter',startingPlayer:0}});if(!chose.ok)throw new Error(chose.error.message);
    const opening=await app.execute({type:'match.read',id});if(!opening.ok||opening.data.phase!=='setup')throw new Error('Expected original setup.');
    const kept=await app.execute({type:'match.setup',id,commandId:randomUUID(),expectedRevision:opening.data.setup.revision,action:{type:'mulligan',bottomOrder:[]}});if(!kept.ok)throw new Error(kept.error.message);
    const bot=await app.execute({type:'match.bot',id});if(!bot.ok)throw new Error(bot.error.message);
    const before=await app.execute({type:'match.read',id});if(!before.ok||before.data.phase!=='game')throw new Error('Expected real unfinished match.');
    await writeFile('.local/backup-ui-profile.json',JSON.stringify({profileDirectory:fixture.profileDirectory,id,before},null,2));
  }finally{await app.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
