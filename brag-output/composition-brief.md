# Hyperframes Composition Brief: NEXUS

## Objective
Create a short cinematic launch-style brag video for NEXUS — a local AI automation agent.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `C:\Users\garv thakre\OneDrive\Documentos\GitHub\Nexus_agent`
- Primary files read: `web/app/page.tsx`, `web/app/globals.css`, `web/components/Header.tsx`, `web/components/PromptInput.tsx`, `web/components/PlanDisplay.tsx`, `web/components/ActivityLog.tsx`, `README.md`
- Product name: NEXUS
- Tagline / strongest claim: "A local AI agent that automates tasks on your computer by understanding plain English."
- Key UI or visual moment to recreate: The dark execution timeline with cyan progress bar, step icons, and safety risk badges. The typing prompt input. The activity log cascade.
- Copy that must appear verbatim:
  - "What would you like to automate?"
  - "Search for the latest AI news and make an Excel sheet"
  - "Generate Plan"
  - "NEXUS"
  - "You describe it. Nexus does it."

## Creative Direction
- Tone preset: cinematic
- Creative direction: AI command center product reveal — dark, technical, glowing
- Interpretation: Dramatic reveals with confident pacing. Large display type in Bebas Neue. The near-black background with electric cyan accents creates the cinematic look naturally. Treat the product as a serious, powerful tool.
- Angle: NEXUS is a real working AI agent. The video shows the actual user flow: type a task → watch the AI plan materialize → watch it execute live with green checkmarks cascading. The dark UI IS the aesthetic.
- Hook: "What would you like to automate?" types out character by character on dark background
- Outro / punchline: Hexagon logo + "NEXUS" + "You describe it. Nexus does it."
- Avoid:
  - Generic SaaS language ("streamline your workflow")
  - Abstract filler visuals
  - Bright/white backgrounds — this product IS dark mode

## Visual Identity
- Background: #03030a
- Surface 1: #07070f
- Surface 2: #0c0c18
- Border: rgba(255,255,255,0.055)
- Text: #ddddf0
- Accent (primary): #00e5ff (cyan)
- Green: #00ffa3
- Amber: #ffb340
- Red: #ff3d5a
- Purple: #a855f7
- Muted: #55557a
- Display font: Bebas Neue (Google Fonts: `https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap`)
- Body font: DM Sans (Google Fonts: `https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap`)
- Mono font: JetBrains Mono (Google Fonts: `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap`)
- Visual references: ambient grid background with cyan scanline, hexagon logo icon, vertical timeline with spine, capability icons per step

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook / Hero Question — 4s — "What would you like to automate?" types out large on dark bg with grid
2. The Prompt — 4s — task types into dark input card, "Generate Plan" button glows cyan
3. Execution Timeline — 6s — 6 plan steps materialize one by one with icons, progress bar fills, checkmarks pop
4. Activity Log Cascade — 3s — real-time log lines cascade with green checkmarks, summary card appears
5. Logo / Outro — 3s — hexagon icon + "NEXUS" + tagline hold and fade

## Audio
- Audio role: cinematic support
- Audio arc: builds from typing tension through plan cascade to confident logo resolve
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`
- Music treatment: start at 0s, volume 0.35, sustain energy through scenes 2-4, fade out over final 2s under logo
- Music cue guidance: bundled preset at `assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`. Tempo 120.19 BPM. Strong cues: use 3.52s for hook text completion, 5.03s for prompt card reveal, 7.02s for timeline card entrance. Beat grid 8.02-11.52 for sequential step reveals.
- Audio-reactive treatment: subtle; use music RMS/bass to pulse the ambient grid glow and cyan progress bar presence. No waveform/equalizer visuals.
- Audio-coupled moments:
  - Scene 1 — typing with subtle key ticks
  - Scene 2 — click for button highlight
  - Scene 3 — drop sounds for each step card, soft impact for progress complete
  - Scene 4 — subtle ticks for log lines
  - Scene 5 — impactBell_heavy_000 on logo slam
- SFX selection guidance: use interface/drop_001 and drop_002 for step cards, interface/click_001 for button, impact/impactBell_heavy_000 for logo. Keep density moderate — cinematic restraint.
- SFX analysis guidance: `skills/brag/assets/sfx/sfx-analysis.md`
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: music and selected SFX are already copied into `brag-output/composition/assets/`

## Voiceover
Voice is enabled (`--voice`). Narration script from brag-plan.md. Generate via:
```bash
npx hyperframes tts "What would you like to automate? Just tell Nexus. Describe any task in plain English — and it builds a plan, checks it for safety, and runs every step, live. Web browsing, desktop apps, WhatsApp, Excel — all from one prompt. Nexus. You describe it. Nexus does it." --voice af_heart --output brag-output/composition/assets/voiceover.wav
```
Wire on track-index 3 at volume 1.0. Duck music to 0.12-0.15 during voiceover.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, and `hyperframes-cli`. /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow.

Requirements:
- Show at least one real UI element from the Nexus source project (the execution timeline, the prompt input, the activity log).
- Keep all text readable in the final render. Minimum 0.8s hold for short labels, 0.3s per word for sentences.
- Keep the video within 20 seconds.
- Include the planned music/SFX layer.
- Treat music cue metadata as optional timing hints — readability and story come first.
- Use local assets for audio.
- Run `hyperframes check` before render.
