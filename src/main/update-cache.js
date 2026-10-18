const fs = require('fs/promises');
const path = require('path');
const { verifyInstaller } = require('./update-install');

function createUpdateCache(root) {
  const manifest = path.join(root, 'pending.json');
  return {
    async save(source, payload, expected) {
      await verifyInstaller(source, expected);
      await fs.mkdir(root, { recursive: true });
      const file = `Brown-${String(payload.version).replace(/[^a-zA-Z0-9.-]/g, '')}.exe`;
      const destination = path.join(root, file);
      if (path.resolve(source) !== path.resolve(destination)) {
        await fs.copyFile(source, destination + '.part');
        await verifyInstaller(destination + '.part', expected);
        await fs.rename(destination + '.part', destination);
      }
      const record = { file, payload, expected };
      await fs.writeFile(manifest + '.part', JSON.stringify(record));
      await fs.rename(manifest + '.part', manifest);
      return { ...record, path: destination };
    },
    async restore(currentVersion, compare) {
      try {
        const record = JSON.parse(await fs.readFile(manifest, 'utf8'));
        if (!record.file || path.basename(record.file) !== record.file || !record.file.endsWith('.exe') || !record.payload?.version) return null;
        if (compare(record.payload.version, currentVersion) <= 0) return null;
        const destination = path.join(root, record.file);
        await verifyInstaller(destination, record.expected);
        return { ...record, path: destination };
      } catch (error) {
        // Security scanners can temporarily lock a valid installer. Do not treat
        // an inaccessible cache as a missing download and overwrite its record.
        if (['EACCES', 'EPERM', 'EBUSY'].includes(error.code)) throw error;
        return null;
      }
    }
  };
}
module.exports = { createUpdateCache };
