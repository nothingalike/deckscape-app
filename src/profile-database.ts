import type {DatabaseSync} from 'node:sqlite';

export const currentProfileSchemaVersion=8;
/** Shared bootstrap for live profiles and trusted in-memory schema references. */
export function initializeProfileDatabase(db:DatabaseSync){
  const version=Number(db.prepare('PRAGMA user_version').get()?.user_version);
  if(![0,1,2,3,4,5,6,7,8].includes(version))throw new Error('This profile requires a different app version. Your data has been preserved.');
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  if(version===0)db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK(id=1), draft_name TEXT NOT NULL, revision INTEGER NOT NULL);
    INSERT INTO profile VALUES(1, 'Untitled deck', 0);
    PRAGMA user_version=2; COMMIT;`);
  else if(version===1){
    try{db.exec('BEGIN IMMEDIATE;');if(db.prepare('PRAGMA table_info(profile)').all().some(column=>column.name==='name'))db.exec('ALTER TABLE profile RENAME COLUMN name TO draft_name;');db.exec('PRAGMA user_version=2; COMMIT;');}
    catch(error){db.exec('ROLLBACK;');throw error;}
  }
}
