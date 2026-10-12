import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { FileStore } from './index';
import { validKey } from './index';

export class LocalStore implements FileStore {
  private root: string;
  constructor(dir: string) { this.root = resolve(dir); }
  private path(key: string) {
    if (!validKey(key)) throw new Error('Недопустимый ключ файла');
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root + '/')) throw new Error('Недопустимый путь');
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true, mode: 0o700 });
    await writeFile(p, data, { mode: 0o600, flag: 'wx' });
  }
  get(key: string) { return readFile(this.path(key)); }
  async delete(key: string) { await rm(this.path(key), { force: true }); }
}
