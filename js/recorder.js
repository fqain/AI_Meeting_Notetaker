// ── recorder.js ──────────────────────────────────────────────────────────────
// Handles all recording logic: screen capture, mic capture, audio mixing,
// MediaRecorder, waveform visualiser, and timer.
// ─────────────────────────────────────────────────────────────────────────────

const Recorder = (() => {
  let mediaRecorder = null;
  let recChunks = [];
  let recStream = null;
  let micStream = null;
  let timerInterval = null;
  let recSeconds = 0;
  let analyser = null;
  let vizAF = null;
  let recSource = 'screen';
  let onStopCallback = null;

  // ── Set which source to record ────────────────────────────────────────────
  function setSource(src) { recSource = src; }

  // ── Set callback for when recording stops ─────────────────────────────────
  function onStop(cb) { onStopCallback = cb; }

  // ── Toggle start/stop ─────────────────────────────────────────────────────
  async function toggle() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stop();
    } else {
      await start();
    }
  }

  // ── Start recording ───────────────────────────────────────────────────────
  async function start() {
    try {
      recChunks = [];

      if (recSource === 'screen') {
        recStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false }
        });
        try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch (e) { micStream = null; }
      } else {
        recStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        micStream = null;
      }

      // Mix both tracks into a single AudioContext destination
      const actx = new AudioContext();
      const dest = actx.createMediaStreamDestination();

      const addTrack = (stream) => {
        if (!stream) return;
        const tracks = stream.getAudioTracks();
        if (tracks.length > 0) {
          const src = actx.createMediaStreamSource(new MediaStream([tracks[0]]));
          src.connect(dest);
        }
      };
      addTrack(recStream);
      if (micStream) addTrack(micStream);

      // Set up analyser for visualiser
      analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      dest.stream.getAudioTracks().forEach(t => {
        const s = actx.createMediaStreamSource(new MediaStream([t]));
        s.connect(analyser);
      });

      // Start MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      mediaRecorder = new MediaRecorder(dest.stream, { mimeType });
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data); };
      mediaRecorder.onstop = handleStop;
      mediaRecorder.start(100);

      // Auto-stop if user closes screen share
      recStream.getVideoTracks().forEach(t => {
        t.onended = () => { if (mediaRecorder?.state === 'recording') stop(); };
      });

      // Update UI
      setRecordingUI(true);
      startTimer();
      drawViz();

    } catch (e) {
      App.showError('Could not start recording: ' + e.message);
    }
  }

  // ── Stop recording ────────────────────────────────────────────────────────
  function stop() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    stopTimer();
    cancelAnimationFrame(vizAF);
    recStream?.getTracks().forEach(t => t.stop()); recStream = null;
    micStream?.getTracks().forEach(t => t.stop()); micStream = null;
    setRecordingUI(false);
  }

  // ── Called when MediaRecorder finishes ────────────────────────────────────
  function handleStop() {
    const mimeType = recChunks[0]?.type || 'audio/webm';
    const blob = new Blob(recChunks, { type: mimeType });

    // Show preview
    const url = URL.createObjectURL(blob);
    const audio = document.getElementById('rec-audio');
    if (audio) audio.src = url;

    const m = String(Math.floor(recSeconds / 60)).padStart(2, '0');
    const s = String(recSeconds % 60).padStart(2, '0');
    const info = document.getElementById('rec-preview-info');
    if (info) info.textContent = `${m}:${s} · ${fmtSize(blob.size)} · ${mimeType}`;

    document.getElementById('rec-preview')?.classList.add('show');
    document.getElementById('viz-wrap')?.classList.remove('show');

    if (onStopCallback) onStopCallback(blob);
  }

  // ── Discard current recording ─────────────────────────────────────────────
  function discard() {
    recChunks = [];
    document.getElementById('rec-preview')?.classList.remove('show');
    const audio = document.getElementById('rec-audio');
    if (audio) audio.src = '';
    if (onStopCallback) onStopCallback(null);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  function startTimer() {
    recSeconds = 0;
    timerInterval = setInterval(() => {
      recSeconds++;
      const m = String(Math.floor(recSeconds / 60)).padStart(2, '0');
      const s = String(recSeconds % 60).padStart(2, '0');
      const el = document.getElementById('rec-timer');
      if (el) el.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopTimer() { clearInterval(timerInterval); }

  // ── Waveform visualiser ───────────────────────────────────────────────────
  function drawViz() {
    const canvas = document.getElementById('viz-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 360;
    canvas.height = 48;
    const W = canvas.width, H = 48;
    const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);

    function draw() {
      vizAF = requestAnimationFrame(draw);
      if (analyser) analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#1e2a40';
      ctx.fillRect(0, 0, W, H);
      const bw = W / data.length * 2;
      for (let i = 0; i < data.length; i++) {
        const h = (data[i] / 255) * H * 0.9;
        const grad = ctx.createLinearGradient(0, H - h, 0, H);
        grad.addColorStop(0, '#3b82f6');
        grad.addColorStop(1, '#6366f1');
        ctx.fillStyle = grad;
        ctx.fillRect(i * bw, H - h, bw - 1, h);
      }
    }
    draw();
  }

  // ── Recording UI state ────────────────────────────────────────────────────
  function setRecordingUI(recording) {
    const btn = document.getElementById('rec-btn');
    const label = document.getElementById('rec-btn-label');
    const stopBtn = document.getElementById('stop-btn');
    const vizWrap = document.getElementById('viz-wrap');
    const tabBtn = document.getElementById('tab-btn-record');

    if (btn) btn.classList.toggle('recording', recording);
    if (label) label.textContent = recording ? 'Recording…' : 'Start Recording';
    if (stopBtn) stopBtn.classList.toggle('show', recording);
    if (vizWrap) vizWrap.classList.toggle('show', recording);
    if (tabBtn) tabBtn.classList.toggle('recording', recording);
  }

  function fmtSize(b) {
    return b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
  }

  return { toggle, start, stop, discard, setSource, onStop };
})();
