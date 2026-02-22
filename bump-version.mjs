/**
 * Bumps the patch version in package.json and updates the build filename
 * in extension_configuration.json to include version + timestamp.
 *
 * The filename format is: dist/<name>-v<version>-<YYYYMMDD-HHmm>.js
 */

import fs from 'fs';
import path from 'path';

const projectDir = process.cwd();

// Bump patch version in package.json
const pkgPath = path.join(projectDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
pkg.version = `${major}.${minor}.${patch + 1}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Build timestamped filename
const now = new Date();
const timestamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
  '-',
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0'),
].join('');

const newFileName = `dist/${pkg.name}-v${pkg.version}-${timestamp}.js`;

// Update extension_configuration.json
const configPath = path.join(projectDir, 'extension_configuration.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.file = newFileName;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

console.log(`Version bumped to ${pkg.version}`);
console.log(`Build file: ${newFileName}`);
