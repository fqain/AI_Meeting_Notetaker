// ── pipeline.js ──────────────────────────────────────────────────────────────
// The core AI pipeline: HuggingFace Whisper transcription → Groq note extraction.
// Called by app.js after a file is ready (uploaded or recorded).
// ─────────────────────────────────────────────────────────────────────────────

const Pipeline = (() => {

  // ── Main entry point ──────────────────────────────────────────────────────
  async function run(mediaFile, skillId, hfKey, groqKey, customInstructions) {
    const skill = SKILLS[skillId];
    if (!skill) throw new Error('Unknown skill: ' + skillId);

    setSteps(['', '', '', '']);

    // ── Step 1 & 2: Transcription ─────────────────────────────────────────
    const modelId = App.getSelectedModel();
    setStep('s1', 'active', modelId);

    const bytes = await mediaFile.arrayBuffer();
    const contentType = mediaFile.type || 'audio/mpeg';
    const HF_URL = `https://router.huggingface.co/hf-inference/models/${modelId}`;

    setStep('s1', 'done');
    setStep('s2', 'active', 'Processing audio…');

    const hfRes = await fetch(HF_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': contentType },
      body: bytes,
    });

    if (!hfRes.ok) {
      const t = await hfRes.text();
      throw new Error(`HuggingFace Whisper (${hfRes.status}): ${t.slice(0, 200)}`);
    }

    const hfData = await hfRes.json();
    const transcript = hfData.text
      || hfData.transcription
      || (Array.isArray(hfData) ? hfData.map(c => c.text).join(' ') : '');

    if (!transcript || transcript.length < 5) {
      throw new Error('Transcription empty. Try whisper-small or convert file to MP3.');
    }

    setStep('s2', 'done', `${transcript.split(' ').length} words transcribed`);

    // ── Step 3: Note extraction ───────────────────────────────────────────
    setStep('s3', 'active', `${skill.icon} ${skill.name}`);

    let systemPrompt = skill.prompt;
    if (customInstructions?.trim()) {
      systemPrompt += `\n\nADDITIONAL INSTRUCTIONS:\n${customInstructions.trim()}`;
    }

    const groqRes = await fetch('http://localhost:8010', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is the meeting transcript:\n\n${transcript}` }
        ]
      })
    });

    if (!groqRes.ok) {
      const e = await groqRes.json();
      throw new Error('Groq: ' + (e.error?.message || groqRes.statusText));
    }

    const groqData = await groqRes.json();
    const raw = groqData.choices[0].message.content;

    setStep('s3', 'done');
    setStep('s4', 'active');

    // ── Step 4: Parse JSON ────────────────────────────────────────────────
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('No JSON in response. Got: ' + cleaned.slice(0, 300));
    }
    const notes = JSON.parse(cleaned.slice(start, end + 1));
    setStep('s4', 'done');

    return { notes, transcript };
  }

  // ── Step UI helpers ───────────────────────────────────────────────────────
  function setStep(id, state, sub) {
    const el = document.getElementById(id);
    if (el) el.className = 'step ' + state;
    const subEl = document.getElementById(id + 's');
    if (subEl && sub !== undefined) subEl.textContent = sub;
  }

  function setSteps(states) {
    ['s1','s2','s3','s4'].forEach((id, i) => setStep(id, states[i] || ''));
  }

  return { run };
})();
