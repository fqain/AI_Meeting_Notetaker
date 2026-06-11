# AI Meeting Notes

A browser-based AI meeting assistant that records, transcribes, and structures your meetings into clean, searchable notes — entirely from the browser, with no backend server required.

Built with HuggingFace Whisper for transcription and Groq's Llama model for structured note generation.

## Features

- **Browser-based recording** — capture meeting audio directly from the tab or microphone, no installs required
- **Local transcription** — HuggingFace Whisper runs in the browser for private, accurate speech-to-text
- **Structured AI notes** — Groq's Llama model turns raw transcripts into summaries, action items, decisions, and key points
- **Speaker detection** — automatic speaker diarization to attribute who said what
- **Meeting history** — past meetings saved locally and browsable from a sidebar
- **Chat with transcript** — ask questions about any meeting and get answers grounded in the transcript
- **Modular architecture** — clean separation of concerns across multiple files for transcription, AI calls, storage, and UI

## Tech Stack

- **Frontend:** Vanilla JS / HTML / CSS (modular file structure)
- **Transcription:** [HuggingFace Whisper](https://huggingface.co/openai/whisper) (in-browser via transformers.js)
- **LLM:** [Groq](https://groq.com/) (Llama 3.x) for structured notes and transcript chat
- **Storage:** Browser localStorage / IndexedDB for meeting history

## Project Structure

```
ai-meeting-notes/
├── index.html              # App entry point
├── css/
│   └── styles.css          # Styling
├── js/
│   ├── app.js              # Main app controller
│   ├── recorder.js         # Audio capture
│   ├── transcription.js    # Whisper integration
│   ├── speakers.js         # Speaker detection
│   ├── ai.js               # Groq API calls (notes + chat)
│   ├── storage.js          # Meeting history persistence
│   └── ui.js               # DOM rendering
└── README.md
```

## Getting Started

### Prerequisites

- A modern browser (Chrome, Edge, or Firefox recommended)
- A Groq API key — get one free at [console.groq.com](https://console.groq.com/)

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/FRSSTeam/ai-meeting-notes.git
   cd ai-meeting-notes
   ```

2. Add your Groq API key. Either create a `config.js`:
   ```js
   export const GROQ_API_KEY = "your-key-here";
   ```
   or paste it into the in-app settings panel on first launch.

3. Serve the project locally (Whisper requires a proper origin, not `file://`):
   ```bash
   npx serve .
   ```

4. Open `http://localhost:3000` and start recording.

## Usage

1. Click **Start Recording** and grant microphone / tab audio permission
2. Talk through your meeting — the transcript builds live
3. Click **Stop** when finished
4. Wait a few seconds while Groq generates structured notes
5. Browse past meetings from the sidebar or use **Chat** to ask questions about any transcript

## Output Format

Each meeting produces:

- **Summary** — a concise overview
- **Key points** — main discussion topics
- **Decisions** — what was agreed
- **Action items** — tasks with owners where mentioned
- **Full transcript** — with speaker labels and timestamps

## Roadmap

- [ ] Export to Markdown / PDF / Notion
- [ ] Calendar integration for auto-titling meetings
- [ ] Multi-language transcription
- [ ] Custom note templates per meeting type (standup, 1:1, interview)
- [ ] Optional cloud sync

## Privacy

Transcription happens entirely in your browser — audio never leaves your device. Only the final transcript text is sent to Groq for note generation. No recordings or transcripts are stored on any server.

## License

MIT

## Author

Built by [Fifi](https://github.com/fqain) under the FyoTech / FRSS umbrella.
