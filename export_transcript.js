const fs = require('fs');
const path = require('path');

function findTranscriptDir(targetDir) {
  const normalized = targetDir
    .replace(/^[A-Z]:/i, '')
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]/g, '-')
    .toLowerCase();

  return path.join(
    process.env.HOME || process.env.USERPROFILE,
    '.commandcode', 'projects',
    'c-' + normalized
  );
}

function findParentTranscriptDirs(baseDir) {
  const dirs = [];
  let current = path.resolve(baseDir);
  
  while (true) {
    const candidate = findTranscriptDir(current);
    if (fs.existsSync(candidate)) {
      dirs.push(candidate);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  
  return dirs;
}

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMarkdownLike(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="code-block"><code>${escapeHtml(code.trim())}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function buildHtml(sessions, title) {
  let body = '';
  let msgCount = 0;

  for (const session of sessions) {
    body += `<div class="session">`;
    body += `<div class="session-header">Sesi: ${escapeHtml(session.meta?.title || session.id)} &mdash; ${session.meta?.created || ''}</div>`;

    for (const msg of session.messages) {
      msgCount++;
      const roleClass = msg.role === 'user' ? 'user' : 'assistant';
      const roleLabel = msg.role === 'user' ? '👤 Kamu' : '🤖 Asisten';
      const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString('id-ID') : '';

      let textParts = '';
      if (Array.isArray(msg.content)) {
        textParts = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      } else if (typeof msg.content === 'string') {
        textParts = msg.content;
      }

      body += `<div class="message ${roleClass}">`;
      body += `<div class="msg-meta"><span class="role">${roleLabel}</span><span class="time">${timestamp}</span></div>`;
      body += `<div class="msg-content">${renderMarkdownLike(textParts)}</div>`;
      body += `</div>`;
    }

    body += `</div>`;
  }

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Transcript - ${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 20px; }
  .session { max-width: 900px; margin: 0 auto 40px; background: #16213e; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
  .session-header { background: #0f3460; padding: 14px 20px; font-weight: 600; color: #e94560; font-size: 14px; }
  .message { padding: 16px 20px; border-bottom: 1px solid #1a1a2e; }
  .message.user { background: #16213e; }
  .message.assistant { background: #1a1a3a; }
  .msg-meta { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: #888; }
  .msg-meta .role { font-weight: 600; color: #e94560; }
  .msg-content { line-height: 1.7; }
  .msg-content ul { padding-left: 20px; margin: 8px 0; }
  .msg-content li { margin: 2px 0; }
  .code-block { background: #0d0d1a; padding: 14px; border-radius: 8px; margin: 10px 0; overflow-x: auto; font-family: 'Fira Code', 'Consolas', monospace; font-size: 13px; color: #c0c0e0; border: 1px solid #333; }
  .inline-code { background: #0d0d1a; padding: 2px 6px; border-radius: 4px; font-family: 'Fira Code', 'Consolas', monospace; font-size: 13px; color: #e94560; }
  h2, h3, h4 { margin: 10px 0 6px; color: #e94560; }
  strong { color: #fff; }
  .stats { max-width: 900px; margin: 0 auto 20px; color: #888; font-size: 13px; }
</style>
</head>
<body>

<div class="stats">Total ${sessions.length} sesi, ${msgCount} pesan &mdash; ${new Date().toLocaleString('id-ID')}</div>

${body}

</body>
</html>`;
}

function main() {
  const targetDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : process.cwd();

  const dirs = findParentTranscriptDirs(targetDir);

  if (dirs.length === 0) {
    console.error('❌ Tidak ditemukan folder transcript untuk:', targetDir);
    console.error('   Pastikan ada sesi chat Command Code di direktori ini.');
    process.exit(1);
  }

  const projectName = path.basename(targetDir);
  const outputFile = path.join(targetDir, 'transcript.html');

  const sessions = [];
  const seenIds = new Set();

  for (const dir of dirs) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl') && !f.includes('.checkpoints'));

    for (const f of files) {
      const fullPath = path.join(dir, f);
      const id = f.replace('.jsonl', '');
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const metaPath = path.join(dir, id + '.meta.json');
      let meta = {};
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
      }

      const messages = parseJsonl(fullPath).filter(m => m.role === 'user' || m.role === 'assistant');
      messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      sessions.push({ id, meta, messages });
    }
  }

  sessions.sort((a, b) => new Date(b.meta?.created || 0) - new Date(a.meta?.created || 0));

  const html = buildHtml(sessions, projectName);
  fs.writeFileSync(outputFile, html, 'utf8');
  console.log(`✅ Transcript diexport ke: ${outputFile}`);
  console.log(`   ${sessions.length} sesi, ${sessions.reduce((sum, s) => sum + s.messages.length, 0)} pesan`);
  console.log(`   Sumber: ${dirs.length} folder transcript`);
}

main();
