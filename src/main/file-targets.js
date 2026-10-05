const fs = require('fs');
const path = require('path');
const { isPathBlacklisted } = require('./security');

function resolveFileTarget(value, basePath) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('An exact file or folder path is required.');
  let target = value.trim().replace(/^"(.*)"$/, '$1');
  target = target.replace(/%([^%]+)%/g, (_, key) => {
    const entry = Object.keys(process.env).find(name => name.toLowerCase() === key.toLowerCase());
    if (!entry) throw new Error(`Unknown environment variable: ${key}`);
    return process.env[entry];
  });
  if (/^~[\\/]/.test(target)) target = path.join(process.env.USERPROFILE || require('os').homedir(), target.slice(2));
  if (!path.isAbsolute(target)) {
    if (!basePath || !path.isAbsolute(basePath)) throw new Error('Use an absolute path or choose a workspace first.');
    target = path.resolve(basePath, target);
  }
  target = path.normalize(target);
  let ancestor = target;
  while (!fs.existsSync(ancestor) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
  if (isPathBlacklisted(target) || isPathBlacklisted(ancestor)) throw new Error(`Access denied: ${target} is protected.`);
  if (target === path.parse(target).root) throw new Error('Select a folder or file inside the drive, not the drive root.');
  return target;
}
function listDirectory(value) {
  const target = resolveFileTarget(value);
  const files = fs.readdirSync(target, { withFileTypes: true }).map(entry => {
    const filePath = path.join(target, entry.name);
    let size = null; try { size = fs.statSync(filePath).size; } catch (_) {}
    return { name: entry.name, path: filePath, isDirectory: entry.isDirectory(), isFile: entry.isFile(), size };
  });
  return { success: true, path: target, dirPath: target, files, items: files };
}
function createDirectory(value) {
  const target = resolveFileTarget(value);
  fs.mkdirSync(target, { recursive: true });
  if (!fs.statSync(target).isDirectory()) throw new Error('Folder creation could not be verified.');
  return { success: true, path: target, verified: true, message: `Created folder ${target}` };
}
function moveFileTarget(source, destination) {
  const from = resolveFileTarget(source), to = resolveFileTarget(destination);
  if (fs.existsSync(to)) throw new Error(`Destination already exists: ${to}`);
  fs.renameSync(from, to);
  return { success: true, previousPath: from, path: to, verified: fs.existsSync(to) && !fs.existsSync(from) };
}
module.exports = { resolveFileTarget, listDirectory, createDirectory, moveFileTarget };
