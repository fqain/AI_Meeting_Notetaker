// ── history.js ───────────────────────────────────────────────────────────────
// Handles saving, loading, searching, and deleting meeting history.
// All data stored in localStorage under the key 'fyotech_meetings'.
// ─────────────────────────────────────────────────────────────────────────────

const History = (() => {
  const STORAGE_KEY = 'fyotech_meetings';
  const MAX_MEETINGS = 100;

  // ── Load all meetings from localStorage ──────────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('History load error:', e);
      return [];
    }
  }

  // ── Save all meetings to localStorage ────────────────────────────────────
  function save(meetings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
    } catch (e) {
      console.error('History save error:', e);
    }
  }

  // ── Add a new meeting ─────────────────────────────────────────────────────
  function addMeeting(notes, transcript, skillId, skillName) {
    const meetings = load();
    const meeting = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      skillId,
      skillName,
      title: notes.title || 'Untitled Meeting',
      summary: notes.summary || '',
      duration: notes.duration_estimate || '',
      topics: notes.topics_covered || [],
      notes,       // full notes object
      transcript,  // full transcript text
    };
    meetings.unshift(meeting); // newest first
    if (meetings.length > MAX_MEETINGS) meetings.splice(MAX_MEETINGS);
    save(meetings);
    return meeting;
  }

  // ── Get a single meeting by id ────────────────────────────────────────────
  function getMeeting(id) {
    return load().find(m => m.id === id) || null;
  }

  // ── Delete a meeting ──────────────────────────────────────────────────────
  function deleteMeeting(id) {
    const meetings = load().filter(m => m.id !== id);
    save(meetings);
  }

  // ── Search meetings ───────────────────────────────────────────────────────
  // Searches title, summary, topics, and full transcript
  function search(query) {
    if (!query || !query.trim()) return load();
    const q = query.toLowerCase().trim();
    return load().filter(m =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.summary || '').toLowerCase().includes(q) ||
      (m.transcript || '').toLowerCase().includes(q) ||
      (m.skillName || '').toLowerCase().includes(q) ||
      (m.topics || []).some(t => t.toLowerCase().includes(q))
    );
  }

  // ── Format a date for display ─────────────────────────────────────────────
  function formatDate(isoString) {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1)   return 'just now';
    if (diffMins < 60)  return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7)   return `${diffDays}d ago`;
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

  // ── Render the history sidebar ────────────────────────────────────────────
  function renderSidebar(meetings, onSelect, onDelete) {
    const list = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    if (!list) return;

    if (!meetings.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = meetings.map(m => {
      const skill = SKILLS[m.skillId] || { icon: '📋', color: '#6366f1' };
      return `
        <div class="history-item" data-id="${m.id}" onclick="History.selectMeeting('${m.id}')">
          <div class="hi-top">
            <span class="hi-icon">${skill.icon}</span>
            <span class="hi-title">${escHtml(m.title)}</span>
            <button class="hi-del" onclick="event.stopPropagation();History.confirmDelete('${m.id}')" title="Delete">✕</button>
          </div>
          <div class="hi-meta">
            <span class="hi-date">${formatDate(m.savedAt)}</span>
            ${m.duration ? `<span class="hi-dur">${escHtml(m.duration)}</span>` : ''}
          </div>
          ${m.summary ? `<div class="hi-summary">${escHtml(m.summary.slice(0, 90))}${m.summary.length > 90 ? '…' : ''}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ── Select and reload a meeting ───────────────────────────────────────────
  function selectMeeting(id) {
    const meeting = getMeeting(id);
    if (!meeting) return;
    // Highlight selected
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`.history-item[data-id="${id}"]`);
    if (el) el.classList.add('selected');
    // Fire event for app.js to handle
    document.dispatchEvent(new CustomEvent('history:select', { detail: meeting }));
  }

  // ── Confirm and delete ────────────────────────────────────────────────────
  function confirmDelete(id) {
    const meeting = getMeeting(id);
    if (!meeting) return;
    if (confirm(`Delete "${meeting.title}"?`)) {
      deleteMeeting(id);
      const q = document.getElementById('history-search')?.value || '';
      renderSidebar(search(q), selectMeeting, confirmDelete);
      document.dispatchEvent(new CustomEvent('history:deleted', { detail: { id } }));
    }
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return { load, addMeeting, getMeeting, deleteMeeting, search, renderSidebar, selectMeeting, confirmDelete, formatDate };
})();
