import { DatabaseSync } from 'node:sqlite';
import { openApplication } from '../../src/application';
import { basic, character, png } from './catalog';

const [profileDirectory, boundary] = process.argv.slice(2);
function hold() {
  process.send?.({ boundary });
  // The parent terminates this owned process. No application shutdown runs.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
}

// Fault injection at SQLite's transaction boundary, outside the application.
const originalExec = DatabaseSync.prototype.exec;
DatabaseSync.prototype.exec = function (sql: string) {
  const commit = sql.trim() === 'COMMIT;';
  if (commit && boundary === 'before-commit') hold();
  originalExec.call(this, sql);
  if (commit && boundary === 'after-commit') hold();
};
const app = openApplication({ profileDirectory, catalogSource: {
  async fetchPage() { return { cards: [basic, character], total: 2, has_more: false, offset: 0 }; },
  async fetchArtwork() {
    if (boundary === 'artwork') hold();
    return new Response(png, { headers: { 'Content-Type': 'image/png' } });
  },
} });
void app.execute({ type: 'catalog.sync' });
