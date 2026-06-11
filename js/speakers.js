// ── speakers.js ──────────────────────────────────────────────────────────────
// Speaker detection: sends the raw transcript to Groq and asks it to identify
// likely speakers based on conversational patterns, then labels each section.
// ─────────────────────────────────────────────────────────────────────────────

const Speakers = (() => {

  const SPEAKER_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ef4444', // red
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#f97316', // orange
  ];

  // ── Detect speakers from transcript ──────────────────────────────────────
  async function detect(transcript, groqKey) {
    const prompt = `You are a transcript speaker detection specialist.
Analyse the following meeting transcript and identify distinct speakers based on:
- Conversational patterns (questions vs answers)
- Topic ownership (who introduces vs who responds)
- Language style differences
- Any name mentions or self-references

Label speakers as Speaker A, Speaker B, Speaker C, etc.
Split the transcript into segments attributed to each speaker.

Respond ONLY with raw valid JSON — no markdown, no backticks, no text before or after:
{
  "speaker_count": 2,
  "speakers": ["Speaker A", "Speaker B"],
  "segments": [
    { "speaker": "Speaker A", "text": "their words here" },
    { "speaker": "Speaker B", "text": "their words here" }
  ],
  "confidence": "high|medium|low",
  "note": "brief note about detection quality"
}

If the transcript is a single person (monologue/voice memo), return speaker_count: 1 with all text as Speaker A.`;

    const res = await fetch('http://localhost:8010', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 3000,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Transcript:\n\n${transcript}` }
        ]
      })
    });

    if (!res.ok) {
      const e = await res.json();
      throw new Error('Speaker detection failed: ' + (e.error?.message || res.statusText));
    }

    const data = await res.json();
    const raw = data.choices[0].message.content;
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON in speaker response');
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  // ── Render speaker view ───────────────────────────────────────────────────
  function render(speakerData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { speakers, segments, speaker_count, confidence, note } = speakerData;

    // Build colour map
    const colorMap = {};
    (speakers || []).forEach((s, i) => {
      colorMap[s] = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
    });

    // Legend
    const legendHtml = (speakers || []).map(s => `
      <span class="speaker-badge" style="background:${colorMap[s]}22;color:${colorMap[s]};border:1px solid ${colorMap[s]}44">
        ${s}
      </span>
    `).join('');

    // Segments
    const segmentsHtml = (segments || []).map(seg => {
      const color = colorMap[seg.speaker] || '#94a3b8';
      return `
        <div class="speaker-segment">
          <div class="seg-label" style="color:${color}">${escHtml(seg.speaker)}</div>
          <div class="seg-text" style="border-left:2px solid ${color}44">${escHtml(seg.text)}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="speaker-header">
        <div class="speaker-meta">
          <span class="speaker-count">${speaker_count} speaker${speaker_count !== 1 ? 's' : ''} detected</span>
          <span class="speaker-confidence conf-${confidence}">${confidence} confidence</span>
        </div>
        <div class="speaker-legend">${legendHtml}</div>
        ${note ? `<div class="speaker-note">${escHtml(note)}</div>` : ''}
      </div>
      <div class="speaker-segments">${segmentsHtml}</div>
    `;
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { detect, render, SPEAKER_COLORS };
})();
