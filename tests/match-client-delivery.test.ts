import test from 'node:test';
import assert from 'node:assert/strict';
import {MatchClientSession,type BattlefieldSnapshot} from '../src/deckscape/lib/simulator/match-client-session';
import {createSetup} from '../src/deckscape/lib/simulator/setup';
import {initialRandomState} from '../src/deckscape/lib/simulator/random';
import {gameFromSetup} from '../src/deckscape/lib/simulator/game-state';
import {projectGame} from '../src/deckscape/lib/simulator/game-view';

function snapshot(revision:number):BattlefieldSnapshot{
  const deck={mainframe:'a'.repeat(64),cyberdeck:Array(50).fill('b'.repeat(64)),ramDeck:Array(25).fill('c'.repeat(64))};
  const setup=createSetup(['a','b'],[deck,deck],initialRandomState('12'.repeat(32)));
  setup.decision={type:'ready'};setup.startingPlayer=0;
  const state=gameFromSetup(setup,'test','1.00');state.revision=revision;
  return {view:projectGame(state,'a',{canInspectFaceDown:()=>false}),presentations:{},decision:null,turnPrompt:null};
}
test('a new command submitted as the acknowledged snapshot appears is delivered without waiting for a fallback poll',async()=>{
  let revision=0,next:Promise<unknown>|undefined;const sent:string[]=[];
  const client=new MatchClientSession(snapshot(0),{
    read:async()=>snapshot(revision),
    send:async(id,command)=>{sent.push(id);assert.equal(command.expectedRevision,revision);return {status:'accepted',acceptedRevision:++revision};},
  },()=>String(sent.length+1));
  client.subscribe(()=>{const state=client.getSnapshot();if(state.phase==='ready'&&state.snapshot.view.revision===1&&!next)next=client.submit({expectedRevision:1,action:{type:'pass'}});});
  try{
    await client.submit({expectedRevision:0,action:{type:'pass'}});await next;
    assert.deepEqual(sent,['1','2']);assert.equal(client.getSnapshot().commandPending,false);assert.equal(client.getSnapshot().snapshot.view.revision,2);
  }finally{client.close();}
});
