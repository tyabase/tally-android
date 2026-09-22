#!/usr/bin/env node
/**
 * 校验「打进 APK 的 web 层」与「工作区源码」逐字节一致。
 *
 * 为什么需要这个脚本：
 *   Gradle 的增量构建会把 assets/ 标记为 UP-TO-DATE 直接复用上一次的产物。
 *   改完 HTML/CSS/JS 重新出包，文件名一个不差、签名也正常，但内容是旧的。
 *   `aapt list` 只能证明文件「在」，证明不了内容是新的 —— 唯一可靠的判据是哈希。
 *
 * 用法：
 *   node tools/verify-apk-assets.mjs
 *   node tools/verify-apk-assets.mjs path/to/app-release.apk
 *
 * 退出码：0 = 完全一致；1 = 存在差异或缺失。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'app/src/main/assets');
const DIST = path.join(REPO, 'app/build/outputs/apk/release');

/* ── 最小 ZIP 读取器 ──────────────────────────────────────────
 * 刻意不依赖 jar / unzip / PowerShell 展开压缩包：那些在受限环境里经常
 * 起不来，而 APK 本质就是个 ZIP，Node 自带的 zlib 足够解。
 */
function readCentralDirectory(buf) {
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('找不到 ZIP 中央目录（EOCD）——这不像一个 APK');

  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    throw new Error('检测到 ZIP64 —— 本脚本只处理常规 ZIP，请换用 jar/unzip 解包');
  }

  const out = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`中央目录头部损坏 @${p}`);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    out.push({
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      method: buf.readUInt16LE(p + 10),
      compSize: buf.readUInt32LE(p + 20),
      localOffset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function readEntry(buf, entry) {
  const p = entry.localOffset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`局部头部损坏：${entry.name}`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);

  if (entry.method === 0) return Buffer.from(raw);           // STORE
  if (entry.method === 8) return zlib.inflateRawSync(raw);   // DEFLATE
  throw new Error(`不支持的压缩方式 ${entry.method}：${entry.name}`);
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (fs.statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel);
  }
  return out;
}

/* ── 主流程 ──────────────────────────────────────────────── */
const apk = process.argv[2]
  ? path.resolve(process.argv[2])
  : (() => {
      if (!fs.existsSync(DIST)) return null;
      const f = fs.readdirSync(DIST).find((x) => x.endsWith('.apk'));
      return f ? path.join(DIST, f) : null;
    })();

if (!apk || !fs.existsSync(apk)) {
  console.error('找不到 APK。先构建，或显式传入路径：');
  console.error('  node tools/verify-apk-assets.mjs app/build/outputs/apk/release/app-release.apk');
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.error(`找不到源码资产目录：${SRC}`);
  process.exit(1);
}

console.log(`APK      ${path.relative(REPO, apk)}  (${(fs.statSync(apk).size / 1048576).toFixed(2)} MB)`);
console.log(`源码     ${path.relative(REPO, SRC)}\n`);

const buf = fs.readFileSync(apk);
const entries = readCentralDirectory(buf);
const inApk = new Map();
for (const e of entries) {
  if (e.name.startsWith('assets/') && !e.name.endsWith('/')) {
    inApk.set(e.name.slice('assets/'.length), e);
  }
}

const srcFiles = walk(SRC);
console.log(`源码资产 ${srcFiles.length} 个 · 包内 assets ${inApk.size} 个\n`);

let same = 0, diff = 0, missing = 0;
const rows = [];

for (const rel of srcFiles) {
  const s = path.join(SRC, rel);
  const srcHash = sha256(fs.readFileSync(s));

  if (!inApk.has(rel)) {
    missing++;
    rows.push(['缺失  ', rel, '源码有、包内没有']);
    continue;
  }
  const apkHash = sha256(readEntry(buf, inApk.get(rel)));
  if (srcHash === apkHash) {
    same++;
    rows.push(['一致  ', rel, srcHash.slice(0, 16)]);
  } else {
    diff++;
    rows.push(['不一致', rel, `${srcHash.slice(0, 12)} vs ${apkHash.slice(0, 12)}`]);
  }
}

// 包内多出来的文件（dexopt/baseline.prof 之类）是构建期产物，不算差异，仅提示
const extra = [...inApk.keys()].filter((k) => !srcFiles.includes(k));

for (const [tag, rel, note] of rows) {
  const mark = tag === '一致  ' ? '  ' : '! ';
  console.log(`${mark}${tag} ${rel.padEnd(24)} ${note}`);
}

console.log('\n──────── 汇总 ────────');
console.log(`  一致     ${same}`);
console.log(`  不一致   ${diff}`);
console.log(`  缺失     ${missing}`);
if (extra.length) console.log(`  包内额外 ${extra.length} 个（构建产物，正常）: ${extra.join(', ')}`);

if (diff === 0 && missing === 0) {
  console.log('\n>>> 包内 web 层与源码逐字节一致');
  process.exit(0);
}
console.log('\n>>> 存在差异 —— 增量构建很可能复用了旧产物，请 clean 后重新出包');
process.exit(1);
