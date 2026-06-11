// ── app.js ───────────────────────────────────────────────────────────────────
// Main application controller. Coordinates all modules:
// Recorder, Pipeline, History, Speakers, Chat.
// Handles UI state, rendering, and export.
// ─────────────────────────────────────────────────────────────────────────────

const App = (() => {

  // ── App state ─────────────────────────────────────────────────────────────
  let state = {
    curMode: 'upload',          // 'upload' | 'record'
    uploadedFile: null,
    recordedBlob: null,
    selSkillId: 'cyber',
    selModelId: 'openai/whisper-large-v3',
    fullTranscript: '',
    notesData: null,
    speakerData: null,
    trExpanded: false,
    rightTab: 'notes',          // 'notes' | 'speakers' | 'chat' | 'history'
    historySidebarOpen: false,
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    // Set up recorder callback
    Recorder.onStop(blob => {
      state.recordedBlob = blob;
      state.uploadedFile = null;
      updateBtn();
      if (blob) setTimeout(() => runPipeline(), 400);
    });

    // History select event
    document.addEventListener('history:select', e => loadFromHistory(e.detail));

    // Init history sidebar
    refreshHistorySidebar();

    switchMode('upload');
    switchRightTab('notes');
    restoreDiscordWebhook();
  }

  // ── Keys ──────────────────────────────────────────────────────────────────
  function updateDots() {
    const hfVal = document.getElementById('hf-key')?.value.trim();
    const grVal = document.getElementById('groq-key')?.value.trim();
    const hfDot = document.getElementById('hf-dot');
    const grDot = document.getElementById('gr-dot');
    if (hfDot) hfDot.className = 'kdot' + (hfVal ? ' on' : '');
    if (grDot) grDot.className = 'kdot' + (grVal ? ' on' : '');
    updateBtn();
  }

  function getHFKey()   { return document.getElementById('hf-key')?.value.trim() || ''; }
  function getGroqKey() { return document.getElementById('groq-key')?.value.trim() || ''; }

  function updateBtn() {
    const keys = getHFKey() && getGroqKey();
    const hasMedia = (state.curMode === 'upload' && state.uploadedFile)
                  || (state.curMode === 'record' && state.recordedBlob);
    const btn = document.getElementById('process-btn');
    if (btn) btn.disabled = !(keys && hasMedia);
  }

  // ── Mode (upload / record) ────────────────────────────────────────────────
  function switchMode(m) {
    state.curMode = m;
    document.getElementById('tab-upload').style.display = m === 'upload' ? 'block' : 'none';
    document.getElementById('tab-record').style.display = m === 'record' ? 'block' : 'none';
    document.getElementById('tab-btn-upload').className = 'mode-tab' + (m === 'upload' ? ' active' : '');
    document.getElementById('tab-btn-record').className  = 'mode-tab' + (m === 'record' ? ' active' : '');
    updateBtn();
  }

  // ── Right panel tabs ──────────────────────────────────────────────────────
  function switchRightTab(tab) {
    state.rightTab = tab;
    ['notes','speakers','chat','history'].forEach(t => {
      const btn = document.getElementById(`rtab-${t}`);
      const panel = document.getElementById(`rpanel-${t}`);
      if (btn) btn.className = 'rtab' + (t === tab ? ' active' : '');
      if (panel) panel.style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'history') refreshHistorySidebar();
  }

  // ── File upload ───────────────────────────────────────────────────────────
  function onFile(f) {
    if (!f) return;
    state.uploadedFile = f;
    state.recordedBlob = null;
    document.getElementById('fi-icon').textContent = f.type.startsWith('video/') ? '🎬' : '🎵';
    document.getElementById('fi-name').textContent = f.name;
    document.getElementById('fi-size').textContent = fmtSize(f.size) + ' · ' + f.type;
    document.getElementById('file-info').classList.add('show');
    document.getElementById('drop-zone').style.display = 'none';
    updateBtn();
  }

  function clearFile() {
    state.uploadedFile = null;
    document.getElementById('file-info').classList.remove('show');
    document.getElementById('drop-zone').style.display = 'block';
    document.getElementById('file-input').value = '';
    updateBtn();
  }

  // ── Selectors ─────────────────────────────────────────────────────────────
  function selectSource(el) {
    document.querySelectorAll('.rec-source').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    Recorder.setSource(el.dataset.src);
  }

  function selSkill(el) {
    document.querySelectorAll('.sk').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    state.selSkillId = el.dataset.skill;
  }

  function selModel(el) {
    document.querySelectorAll('.mopt').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    state.selModelId = el.dataset.model;
  }

  function getSelectedModel() { return state.selModelId; }

  function toggleCustom() {
    const w = document.getElementById('custom-wrap');
    const a = document.getElementById('ca');
    const show = !w.classList.contains('show');
    w.classList.toggle('show', show);
    if (a) a.textContent = show ? '▲' : '▼';
  }

  // ── Run the pipeline ──────────────────────────────────────────────────────
  async function runPipeline() {
    const mediaFile = state.recordedBlob || state.uploadedFile;
    if (!mediaFile) return;

    document.getElementById('err').innerHTML = '';
    document.getElementById('process-btn').disabled = true;
    document.getElementById('progress').classList.add('show');
    showEmpty(true);
    switchRightTab('notes');

    try {
      const result = await Pipeline.run(
        mediaFile,
        state.selSkillId,
        getHFKey(),
        getGroqKey(),
        document.getElementById('custom-txt')?.value || ''
      );

      state.fullTranscript = result.transcript;
      state.notesData = result.notes;
      state.speakerData = null;

      // Save to history
      History.addMeeting(result.notes, result.transcript, state.selSkillId, SKILLS[state.selSkillId].name);
      refreshHistorySidebar();

      // Init chat with this meeting's context
      Chat.init(result.transcript, result.notes, getGroqKey());

      // Render
      renderNotes(result.notes, result.transcript, SKILLS[state.selSkillId]);
      showEmpty(false);

    } catch (e) {
      document.getElementById('err').innerHTML = `<div class="err-card">⚠️ ${e.message}</div>`;
    } finally {
      document.getElementById('process-btn').disabled = false;
      updateBtn();
    }
  }

  // ── Detect speakers ───────────────────────────────────────────────────────
  async function detectSpeakers() {
    if (!state.fullTranscript) { showError('No transcript yet. Generate notes first.'); return; }
    const btn = document.getElementById('speaker-detect-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Detecting…'; }

    try {
      state.speakerData = await Speakers.detect(state.fullTranscript, getGroqKey());
      Speakers.render(state.speakerData, 'speaker-output');
      switchRightTab('speakers');
    } catch (e) {
      document.getElementById('speaker-output').innerHTML = `<div class="err-card">⚠️ ${e.message}</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🎤 Detect Speakers'; }
    }
  }

  // ── Load a meeting from history ───────────────────────────────────────────
  function loadFromHistory(meeting) {
    state.fullTranscript = meeting.transcript;
    state.notesData = meeting.notes;
    state.selSkillId = meeting.skillId;
    const skill = SKILLS[meeting.skillId] || SKILLS.general;
    Chat.init(meeting.transcript, meeting.notes, getGroqKey());
    renderNotes(meeting.notes, meeting.transcript, skill);
    showEmpty(false);
    switchRightTab('notes');
  }

  // ── History sidebar ───────────────────────────────────────────────────────
  function refreshHistorySidebar() {
    const q = document.getElementById('history-search')?.value || '';
    const meetings = History.search(q);
    History.renderSidebar(meetings);
    const count = document.getElementById('history-count');
    if (count) count.textContent = History.load().length + ' meetings';
  }

  function onHistorySearch() {
    refreshHistorySidebar();
  }

  function clearAllHistory() {
    if (!confirm('Delete all meeting history? This cannot be undone.')) return;
    localStorage.removeItem('fyotech_meetings');
    refreshHistorySidebar();
  }

  // ── Render notes ──────────────────────────────────────────────────────────
  function renderNotes(notes, transcript, skill) {
    document.getElementById('n-title').textContent = notes.title || 'Meeting Notes';

    const meta = document.getElementById('n-meta');
    meta.innerHTML = `
      <span class="spill" style="background:${skill.color}22;color:${skill.color};border:1px solid ${skill.color}44">
        ${skill.icon} ${skill.name}
      </span>
      ${notes.duration_estimate ? `<span class="mpill">${escHtml(notes.duration_estimate)}</span>` : ''}
      ${notes.topics_covered?.length ? `<span class="mpill">${notes.topics_covered.map(escHtml).join(' · ')}</span>` : ''}
    `;

    document.getElementById('n-summary').innerHTML = `<p>${escHtml(notes.summary || 'No summary.')}</p>`;

    // Skill section
    const ss = document.getElementById('n-skill-sec');
    ss.innerHTML = '';
    if (notes.skill_section) {
      const s = notes.skill_section;
      const tc = s.type === 'risks' ? 'risks' : 'followups';
      const items = (s.items || []).map(item => {
        if (s.type === 'risks') {
          const sc = item.severity === 'HIGH' ? 'ph' : item.severity === 'MEDIUM' ? 'pm' : 'pl';
          const dot = item.severity === 'HIGH' ? '🔴' : item.severity === 'MEDIUM' ? '🟡' : '🔵';
          return `<div class="rrow"><div style="font-size:12px;flex-shrink:0;line-height:1.5">${dot}</div>
            <div class="rtxt">${escHtml(item.text)}${item.severity ? ` <span class="apri ${sc}">${item.severity}</span>` : ''}</div></div>`;
        }
        return `<div class="drow"><div class="dbullet">→</div><div class="dtxt">${escHtml(item.text)}</div></div>`;
      }).join('');
      ss.innerHTML = `<div class="ncard ${tc}"><div class="nlabel">${escHtml(s.label)}</div>
        ${items || '<div style="font-size:12px;color:var(--dim)">None identified.</div>'}</div>`;
    }

    // Actions
    const ae = document.getElementById('n-actions');
    ae.innerHTML = notes.action_items?.length
      ? notes.action_items.map((a, i) => {
          const pc = a.priority === 'HIGH' ? 'ph' : a.priority === 'MEDIUM' ? 'pm' : 'pl';
          return `<div class="arow">
            <div class="chk" id="chk${i}" onclick="this.classList.toggle('done')"></div>
            <div>
              <div class="atxt">${escHtml(a.task)}</div>
              <div class="ameta">
                <span class="aowner">→ ${escHtml(a.owner || 'TBD')}</span>
                ${a.priority ? `<span class="apri ${pc}">${a.priority}</span>` : ''}
              </div>
            </div>
          </div>`;
        }).join('')
      : '<div style="font-size:12px;color:var(--dim)">None identified.</div>';

    // Decisions
    const de = document.getElementById('n-decisions');
    de.innerHTML = notes.key_decisions?.length
      ? notes.key_decisions.map(d => `<div class="drow"><div class="dbullet">◆</div><div class="dtxt">${escHtml(d)}</div></div>`).join('')
      : '<div style="font-size:12px;color:var(--dim)">None identified.</div>';

    // Transcript
    document.getElementById('n-tr').textContent = transcript.slice(0, 400) + (transcript.length > 400 ? '…' : '');
    document.getElementById('n-tr-btn').style.display = transcript.length > 400 ? 'inline' : 'none';
    state.trExpanded = false;
  }

  function toggleTr() {
    const b = document.getElementById('n-tr');
    const btn = document.getElementById('n-tr-btn');
    state.trExpanded = !state.trExpanded;
    b.classList.toggle('exp', state.trExpanded);
    b.textContent = state.trExpanded ? state.fullTranscript : state.fullTranscript.slice(0, 400) + '…';
    btn.textContent = state.trExpanded ? 'Hide transcript ↑' : 'Show full transcript ↓';
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function buildExportText() {
    if (!state.notesData) return '';
    const n = state.notesData;
    const skill = SKILLS[state.selSkillId];
    let o = `# ${n.title || 'Meeting Notes'}\nSkill: ${skill.icon} ${skill.name}${n.duration_estimate ? ' · ' + n.duration_estimate : ''}\n\n`;
    o += `## Summary\n${n.summary}\n\n`;
    if (n.skill_section?.items?.length) {
      o += `## ${n.skill_section.label}\n${n.skill_section.items.map(i => `- ${i.text}${i.severity ? ' [' + i.severity + ']' : ''}`).join('\n')}\n\n`;
    }
    if (n.action_items?.length) {
      o += `## Action Items\n${n.action_items.map(a => `- [ ] ${a.task} → ${a.owner || 'TBD'}${a.priority ? ' [' + a.priority + ']' : ''}`).join('\n')}\n\n`;
    }
    if (n.key_decisions?.length) {
      o += `## Key Decisions\n${n.key_decisions.map(d => `- ${d}`).join('\n')}\n\n`;
    }
    o += `## Transcript\n${state.fullTranscript}`;
    return o;
  }

  function copyNotes() {
    navigator.clipboard.writeText(buildExportText()).then(() => {
      const b = document.getElementById('copy-btn');
      if (b) { b.textContent = '✓ Copied!'; setTimeout(() => b.textContent = '📋 Copy', 2000); }
    });
  }

  function exportMd() {
    const blob = new Blob([buildExportText()], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ((state.notesData?.title) || 'meeting-notes').replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.md';
    a.click();
  }

  // ── Discord ───────────────────────────────────────────────────────────────
  async function sendToDiscord() {
    const webhookUrl = document.getElementById('discord-webhook')?.value.trim();
    if (!webhookUrl) {
      showDiscordStatus('error', '⚠️ Paste your Discord webhook URL first');
      return;
    }
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      showDiscordStatus('error', '⚠️ Invalid webhook URL — must start with https://discord.com/api/webhooks/');
      return;
    }
    if (!state.notesData) {
      showDiscordStatus('error', '⚠️ No notes to send — generate notes first');
      return;
    }

    const btn = document.getElementById('discord-btn');
    if (btn) { btn.disabled = true; btn.textContent = '📤 Sending…'; }

    try {
      const n = state.notesData;
      const skill = SKILLS[state.selSkillId];

      // ── Build skill section field ──────────────────────────────────────
      const skillFields = [];

      if (n.skill_section?.items?.length) {
        const items = n.skill_section.items.map(item => {
          const sev = item.severity ? ` \`${item.severity}\`` : '';
          return `• ${item.text}${sev}`;
        }).join('\n');
        skillFields.push({ name: n.skill_section.label, value: items.slice(0, 1024), inline: false });
      }

      // ── Action items field ─────────────────────────────────────────────
      if (n.action_items?.length) {
        const actions = n.action_items.map(a => {
          const pri = a.priority ? ` \`${a.priority}\`` : '';
          return `☐ **${a.task}** → ${a.owner || 'TBD'}${pri}`;
        }).join('\n');
        skillFields.push({ name: '✅ Action Items', value: actions.slice(0, 1024), inline: false });
      }

      // ── Key decisions field ────────────────────────────────────────────
      if (n.key_decisions?.length) {
        const decisions = n.key_decisions.map(d => `◆ ${d}`).join('\n');
        skillFields.push({ name: '🔷 Key Decisions', value: decisions.slice(0, 1024), inline: false });
      }

      // ── Topics covered ─────────────────────────────────────────────────
      if (n.topics_covered?.length) {
        skillFields.push({
          name: '🏷️ Topics',
          value: n.topics_covered.join(' · ').slice(0, 256),
          inline: true
        });
      }

      // ── Duration ──────────────────────────────────────────────────────
      if (n.duration_estimate) {
        skillFields.push({ name: '⏱️ Duration', value: n.duration_estimate, inline: true });
      }

      // ── Skill used ────────────────────────────────────────────────────
      skillFields.push({ name: '🎯 Skill', value: `${skill.icon} ${skill.name}`, inline: true });

      // ── Discord embed colour per skill ─────────────────────────────────
      const embedColors = {
        cyber:   0xEF4444,
        dev:     0x10B981,
        general: 0x6366F1,
        client:  0xF59E0B,
      };
      const color = embedColors[state.selSkillId] || 0x3B82F6;

      // ── Build payload ─────────────────────────────────────────────────
      const payload = {
        username: 'FyoTech Meeting Notes',
        avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
        embeds: [{
          title: `🎙️ ${n.title || 'Meeting Notes'}`,
          description: `> ${(n.summary || '').slice(0, 400)}`,
          color,
          fields: skillFields,
          footer: {
            text: `FyoTech AI Meeting Notes · ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}`
          },
          timestamp: new Date().toISOString(),
        }]
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok || res.status === 204) {
        showDiscordStatus('ok', '✅ Sent to Discord!');
        // Save webhook for next time
        localStorage.setItem('fyotech_discord_webhook', webhookUrl);
      } else {
        const err = await res.text();
        showDiscordStatus('error', `⚠️ Discord error ${res.status}: ${err.slice(0, 100)}`);
      }

    } catch (e) {
      showDiscordStatus('error', `⚠️ ${e.message}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📤 Send to Discord'; }
      setTimeout(() => showDiscordStatus('', ''), 4000);
    }
  }

  function showDiscordStatus(type, msg) {
    const el = document.getElementById('discord-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'discord-status' + (type ? ' ' + type : '');
  }

  // Restore saved webhook on load
  function restoreDiscordWebhook() {
    const saved = localStorage.getItem('fyotech_discord_webhook');
    const input = document.getElementById('discord-webhook');
    if (saved && input) {
      input.value = saved;
      const dot = document.getElementById('dc-dot');
      if (dot) dot.className = 'kdot on';
    }
  }

  function updateDiscordDot() {
    const val = document.getElementById('discord-webhook')?.value.trim();
    const dot = document.getElementById('dc-dot');
    if (dot) dot.className = 'kdot' + (val?.startsWith('https://discord.com/api/webhooks/') ? ' on' : '');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showEmpty(empty) {
    document.getElementById('output-empty').style.display = empty ? 'flex' : 'none';
    document.getElementById('notes-output').classList.toggle('show', !empty);
  }

  function showError(msg) {
    document.getElementById('err').innerHTML = `<div class="err-card">⚠️ ${msg}</div>`;
  }

  function fmtSize(b) {
    return b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  function onDrag(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-over'); }
  function onDragLeave() { document.getElementById('drop-zone').classList.remove('drag-over'); }
  function onDrop(e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.remove('drag-over');
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    init, updateDots, switchMode, switchRightTab,
    onFile, clearFile, selectSource, selSkill, selModel,
    getSelectedModel, toggleCustom,
    runPipeline, detectSpeakers,
    onHistorySearch, clearAllHistory, refreshHistorySidebar,
    toggleTr, copyNotes, exportMd, sendToDiscord, updateDiscordDot,
    onDrag, onDragLeave, onDrop,
    showError,
    getState: () => state,
  };
})();

// Kick off on page load
window.addEventListener('DOMContentLoaded', App.init);
