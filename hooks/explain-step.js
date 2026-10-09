#!/usr/bin/env node
// explain-step.js — 零依赖中文步骤解释器 hook（PreToolUse）
// 铁律：任何情况下 exit 0；异常一律静默；stdout 只输出合法 JSON 或什么都不输出。
// 开关文件（自动放在当前用户目录下）：
//   explain-step.off 存在 → 完全静默；explain-step.quiet 存在 → 跳过只读类解释。

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const OFF_FILE   = path.join(os.homedir(), '.claude', 'hooks', 'explain-step.off');
const QUIET_FILE = path.join(os.homedir(), '.claude', 'hooks', 'explain-step.quiet');
const MAX_LEN = 100; // 命令/路径/描述的最大显示长度

// 精确白名单（settings.json 的 matcher 是子串正则，这里是第二道精确过滤）
const EXPLAINABLE = new Set(['Bash', 'Edit', 'MultiEdit', 'NotebookEdit', 'Write',
  'WebFetch', 'WebSearch', 'Agent', 'Task', 'AskUserQuestion']);

// emoji 集中在顶部；若显示乱码可一键换成 ASCII 标签（如 'RO'、'WARN'）
const EMOJI = { readOnly: '📖', risky: '⚠️', run: '▶️', edit: '✏️', write: '📝',
                web: '🌐', agent: '🤖', ask: '📋' };

function short(s) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > MAX_LEN ? t.slice(0, MAX_LEN) + '…' : t;
}

// —— Bash 命令分类（数据驱动，容易扩充）——
// git/npm/pip 子命令表优先，命中即返回；未命中再走通用词表。
const GIT_RO   = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'tag', 'rev-parse', 'ls-files', 'stash', 'reflog']);
const GIT_RISK = new Set(['push', 'commit', 'merge', 'rebase', 'reset', 'clean', 'rm', 'mv', 'checkout', 'switch', 'restore', 'cherry-pick', 'filter-branch', 'gc', 'clone', 'init']);
const NPM_RO   = new Set(['ls', 'list', 'view', 'outdated', 'version', '-v', '--version', 'whoami', 'doctor', 'config']);
const NPM_RISK = new Set(['install', 'i', 'ci', 'uninstall', 'rm', 'update', 'up', 'publish', 'link', 'dedupe', 'rebuild', 'audit', 'init', 'exec', 'run', 'start', 'test']);
const PIP_RO   = new Set(['list', 'show', 'freeze', '--version', '-V']);
const PIP_RISK = new Set(['install', 'uninstall', 'download']);

const READONLY = new Set(['ls', 'dir', 'cat', 'type', 'head', 'tail', 'grep', 'findstr',
  'find', 'echo', 'pwd', 'cd', 'wc', 'sort', 'uniq', 'tree', 'where', 'which', 'date',
  'time', 'whoami', 'hostname', 'ipconfig', 'tasklist', 'node', 'python', 'gh', 'curl', 'wget']);
const RISKY = new Set(['rm', 'del', 'rd', 'rmdir', 'mv', 'move', 'copy', 'cp', 'xcopy',
  'mkdir', 'md', 'touch', 'chmod', 'chown', 'taskkill', 'shutdown', 'format', 'npx',
  'make', 'docker', 'npm', 'pip', 'git', 'yarn', 'pnpm']);

function classifyBash(cmd) {
  const c = String(cmd || '').trim();
  if (!c) return 'normal';
  // 取第一条命令（处理 "cd x && y"、";"、"||" 分隔）
  const first = c.split(/\s*(?:&&|\|\||;)\s*/)[0].trim();
  if (!first) return 'normal';
  if (/[<>]/.test(first)) return 'risky'; // 重定向：会写入内容
  const m = first.match(/^(?:sudo\s+)?([A-Za-z0-9._+-]+)(?:\s+(.*))?$/);
  if (!m) return 'normal';
  const bin = m[1].toLowerCase();
  const sub = ((m[2] || '').trim().split(/\s+/)[0] || '');

  // 1) 子命令表优先
  if (bin === 'git') return GIT_RO.has(sub) ? 'readonly' : GIT_RISK.has(sub) ? 'risky' : 'normal';
  if (bin === 'npm' || bin === 'yarn' || bin === 'pnpm') return NPM_RO.has(sub) ? 'readonly' : NPM_RISK.has(sub) ? 'risky' : 'normal';
  if (bin === 'pip') return PIP_RO.has(sub) ? 'readonly' : PIP_RISK.has(sub) ? 'risky' : 'normal';

  // 2) 通用词表
  if (READONLY.has(bin)) {
    // curl/wget 带 -o/-O 是下载到文件
    if ((bin === 'curl' || bin === 'wget') && /(^|\s)-[oO]/.test(m[2] || '')) return 'risky';
    return 'readonly';
  }
  if (RISKY.has(bin)) return 'risky';
  return 'normal';
}

// —— 各工具的解释模板（每条一行）——
function explain(name, input, quiet) {
  switch (name) {
    case 'Bash': {
      const level = classifyBash(input.command);
      if (quiet && level === 'readonly') return null; // quiet 模式跳过只读
      if (level === 'readonly') return `${EMOJI.readOnly} 只读命令（不会改动任何东西）：${short(input.command)}`;
      if (level === 'risky')    return `${EMOJI.risky} 要执行命令（可能改动文件或远程数据，请留意）：${short(input.command)}`;
      return `${EMOJI.run} 要执行命令：${short(input.command)}`;
    }
    case 'Edit':         return `${EMOJI.edit} 要修改文件：${short(input.file_path)}（查找并替换一段文本）`;
    case 'MultiEdit':    return `${EMOJI.edit} 要修改文件：${short(input.file_path)}（同一文件多处编辑）`;
    case 'NotebookEdit': return `${EMOJI.edit} 要修改笔记本文件：${short(input.notebook_path)}`;
    case 'Write':        return `${EMOJI.write} 要写入/创建文件：${short(input.file_path)}`;
    case 'WebFetch':     return `${EMOJI.web} 要联网读取网页：${short(input.url)}`;
    case 'WebSearch':    return `${EMOJI.web} 要联网搜索：${short(input.query)}`;
    case 'Agent':
    case 'Task':         return `${EMOJI.agent} 要派一个子任务（AI 帮手去干这件事）：${short(input.description || input.prompt)}`;
    case 'AskUserQuestion': {
      const q = input.questions && input.questions[0];
      return `${EMOJI.ask} Claude 正在向你提问：${short(q && (q.header || q.question))}`;
    }
    default: return null;
  }
}

function run(raw) {
  if (fs.existsSync(OFF_FILE)) return;
  const input = JSON.parse(raw);
  const name = input && input.tool_name;
  if (!name || !EXPLAINABLE.has(name)) return;
  const quiet = fs.existsSync(QUIET_FILE);
  const msg = explain(name, (input && input.tool_input) || {}, quiet);
  if (msg) process.stdout.write(JSON.stringify({ systemMessage: msg }));
}

// 异步读 stdin（Windows 上同步读 fd 0 可能遇 EAGAIN，异步最稳）
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    if (raw && raw.trim()) run(raw);
  } catch (e) {
    // 静默：任何异常都不输出、不非零退出
  }
});
process.stdin.on('error', () => { /* 静默 */ });
