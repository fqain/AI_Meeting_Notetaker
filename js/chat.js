// ── chat.js ──────────────────────────────────────────────────────────────────
// Chat with your meeting transcript. Sends conversation history + transcript
// context to Groq so the AI can answer questions about what was said.
// ─────────────────────────────────────────────────────────────────────────────

const Chat = (() => {
  let transcript = '';
  let notes = null;
  let history = []; // { role, content }
  let groqKey = '';
  let isLoading = false;

  // ── Initialise with meeting context ──────────────────────────────────────
  function init(meetingTranscript, meetingNotes, key) {
    transcript = meetingTranscript;
    notes = meetingNotes;
    groqKey = key;
    history = [];
    renderMessages();
    document.getElementById('chat-input')?.focus();
  }

  // ── System prompt with meeting context ───────────────────────────────────
  function buildSystemPrompt() {
    const title = notes?.title || 'this meeting';
    const summary = notes?.summary || '';
    return `You are a helpful meeting assistant for FyoTech. You have access to the full transcript of "${title}".

Meeting summary: ${summary}

Full transcript:
${transcript}

Answer questions about what was discussed, who said what, what was decided, action items, and anything else from this meeting. Be concise and reference specific parts of the transcript when relevant. If something wasn't discussed in the meeting, say so clearly.`;
  }

  // ── Send a message ────────────────────────────────────────────────────────
  async function send() {
    const input = document.getElementById('chat-input');
    if (!input || isLoading) return;
    const text = input.value.trim();
    if (!text) return;
    if (!transcript) { showError('No transcript loaded yet. Generate notes first.'); return; }
    if (!groqKey) { showError('No Groq key found.'); return; }

    input.value = '';
    history.push({ role: 'user', content: text });
    renderMessages();
    setLoading(true);

    try {
      const messages = [
        { role: 'system', content: buildSystemPrompt() },
        ...history
      ];

      const res = await fetch('http://localhost:8010', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1000,
          messages
        })
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error?.message || res.statusText);
      }

      const data = await res.json();
      const reply = data.choices[0].message.content;
      history.push({ role: 'assistant', content: reply });
      renderMessages();

    } catch (e) {
      history.push({ role: 'assistant', content: `Sorry, something went wrong: ${e.message}` });
      renderMessages();
    } finally {
      setLoading(false);
    }
  }

  // ── Clear chat history ────────────────────────────────────────────────────
  function clear() {
    history = [];
    renderMessages();
    document.getElementById('chat-input')?.focus();
  }

  // ── Render all messages ───────────────────────────────────────────────────
  function renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    if (!history.length) {
      container.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-icon">💬</div>
          <div class="chat-empty-text">Ask anything about this meeting</div>
          <div class="chat-suggestions">
            <button class="chat-suggest" onclick="Chat.suggest(this)">What were the main action items?</button>
            <button class="chat-suggest" onclick="Chat.suggest(this)">Who is responsible for what?</button>
            <button class="chat-suggest" onclick="Chat.suggest(this)">What decisions were made?</button>
            <button class="chat-suggest" onclick="Chat.suggest(this)">Summarise in one sentence</button>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = history.map(msg => `
      <div class="chat-msg ${msg.role}">
        <div class="chat-bubble">${escHtml(msg.content).replace(/\n/g, '<br>')}</div>
      </div>
    `).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  // ── Use a suggestion ──────────────────────────────────────────────────────
  function suggest(btn) {
    const input = document.getElementById('chat-input');
    if (input) {
      input.value = btn.textContent;
      send();
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  function setLoading(loading) {
    isLoading = loading;
    const btn = document.getElementById('chat-send');
    const input = document.getElementById('chat-input');
    if (btn) btn.disabled = loading;
    if (input) input.disabled = loading;

    if (loading) {
      const container = document.getElementById('chat-messages');
      if (container) {
        container.insertAdjacentHTML('beforeend', `
          <div class="chat-msg assistant" id="chat-typing">
            <div class="chat-bubble chat-typing-bubble">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
            </div>
          </div>`);
        container.scrollTop = container.scrollHeight;
      }
    } else {
      document.getElementById('chat-typing')?.remove();
    }
  }

  function showError(msg) {
    const container = document.getElementById('chat-messages');
    if (container) container.insertAdjacentHTML('beforeend', `<div class="chat-error">${msg}</div>`);
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Handle Enter key in input ─────────────────────────────────────────────
  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return { init, send, clear, suggest, handleKey, renderMessages };
})();
