# Brag Plan: NEXUS

## What is this app?

NEXUS is a local AI agent that automates tasks on your computer by understanding plain English — it browses the web, controls desktop apps, manages files, sends WhatsApp messages, creates Excel reports, and more, all without you touching a browser or writing code.

## The angle

NEXUS is genuinely impressive — it's a real working AI agent, not a demo. The video should feel like a cinematic product reveal: dark, glowing, technical, and powerful. The hook is that you just *tell* it what to do and it figures out the entire plan, reviews it for safety, and executes it live. Show the actual UI — the dark terminal-like interface, the glowing cyan plan timeline, the live activity log ticking through steps. This is a command center for AI automation.

## Hook (first 2-3 seconds)

Giant text on near-black background: **"What would you like to automate?"** — the exact headline from the Nexus UI. It types in character by character with a blinking cursor, cyan glow. This is the product's own opening line and it's a perfect hook.

## Key moments (the middle)

- **The prompt input** — a task types into the dark input field: "Search for the latest AI news and make an Excel sheet with summaries". The cyan "Generate Plan" button glows.
- **The execution timeline** — 8 steps materialize one by one down a vertical spine. Each step has an icon (🌐 📖 ⚡ 📄 💻), a capability label, and a safety risk badge. The progress bar fills cyan → green.
- **Live activity log** — the right-side panel shows real-time events ticking: ✓ SYS Connected → ◈ AI Planning → ▶ RUN Step 1 → ✓ Done → ✓ DONE All steps complete. Green checkmarks cascade.

## Outro / punchline

Logo hexagon icon + "NEXUS" in Bebas Neue. Below it: **"You describe it. Nexus does it."** Hold. Fade to black.

## User flow worth showing

Entry → key action → result:
1. User types a plain English task into the prompt textarea
2. Nexus generates an 8-step execution plan with safety review, steps materialize in timeline
3. Progress bar fills, activity log cascades green checkmarks — task complete

## Tone
- Preset: cinematic
- Creative direction: AI command center product reveal — dark, technical, glowing
- Interpretation: Dramatic reveals, confident pacing, large type. The product is treated like a serious tool. No comedy. The dark UI and cyan glow palette IS the cinematic look — lean into it.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: #03030a (near-black)
- Accent: #00e5ff (electric cyan)
- Secondary accents: #00ffa3 (green), #ffb340 (amber), #ff3d5a (red), #a855f7 (purple)
- Text: #ddddf0 (soft white)
- Muted: #55557a
- Surface 1: #07070f
- Surface 2: #0c0c18
- Border: rgba(255,255,255,0.055)
- Display font: Bebas Neue
- Body font: DM Sans
- Mono font: JetBrains Mono
- Strongest visual element: The dark execution timeline with glowing cyan progress bar, icon badges per step, and safety risk tags. The ambient grid background with cyan scanline.

## Share copy (draft)
NEXUS — a local AI agent that automates your entire computer. Type what you want in plain English. It plans, reviews for safety, and executes. Web browsing, desktop apps, WhatsApp, Excel — all automated.

## Audio direction
- Role: cinematic support — dramatic bed with confident reveals
- Music: happy-beats-business-moves-vol-1-by-ende-dot-app.mp3 (upbeat, energetic — perfect for a product reveal)
- Music treatment: start at 0s, volume 0.35, let it ride the energy, fade out over final 2s
- Music cue guidance: bundled preset at `assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`; tempo 120.19 BPM. Strong cues at 3.52s (hook type reveal), 5.03s (prompt scene), 7.02s (timeline reveal). Beat grid for sequential timeline steps: 8.02, 8.52, 9.02, 9.52, 10.02, 10.52, 11.02, 11.52.
- Audio-reactive treatment: subtle; use music RMS/bass to make the ambient grid background glow pulse and the cyan progress bar presence breathe slightly. No waveform/equalizer visuals.
- SFX posture: moderate; cinematic — 2-3 big reveal hits plus subtle UI sounds for the timeline
- Audio-coupled moments: typing animation with subtle key sounds, timeline steps popping in with drop sounds, final logo with bell hit
- Restraint rule: audio must not overshadow the product visuals or make it feel like a game trailer

## Voiceover script

"What would you like to automate? Just tell Nexus. Describe any task in plain English — and it builds a plan, checks it for safety, and runs every step, live. Web browsing, desktop apps, WhatsApp, Excel — all from one prompt. Nexus. You describe it. Nexus does it."

## Storyboard

### Scene 1 — Hook / Hero Question — 4s
Dark near-black (#03030a) background with subtle cyan grid lines (the ambient-bg pattern from the real CSS). A blinking cursor appears. The text "What would you like to automate?" types out in Bebas Neue, large, centered. Below it, smaller in DM Sans muted: "Describe your task in plain English."
Sequential/interaction: yes — text types character by character, cursor blinks
Audio intent: tension build, anticipation
Audio-coupled idea: subtle keyboard ticks as letters appear
Music: bed enters, building energy
Transition mood: clean → Scene 2

### Scene 2 — The Prompt — 4s
The Nexus input UI appears: dark card with border, textarea with the placeholder "Describe what you want to automate..." visible. A task types in: "Search for the latest AI news and make an Excel sheet". Below it, the cyan "Generate Plan →" button glows. A spinner appears: "Generating execution plan..."
Sequential/interaction: yes — task text types into the field, then button highlights
Audio intent: momentum, things are happening
Audio-coupled idea: typing sound for the prompt text, click for the button glow
Music: energy rising
Transition mood: clean → Scene 3

### Scene 3 — The Execution Timeline — 6s
The plan materializes. A card shows: Intent badge "search_and_report" in cyan. Below: "8 steps • 6 low risk • 1 medium risk". Then the timeline steps appear one by one down the vertical spine:
1. 🌐 browser_open — "Open Bing search for AI news" [low]
2. ⚡ browser_extract_results — "Extract top 5 results" [low]
3. 📖 browser_read_page — "Read article 1" [low]
4. 📖 browser_read_page — "Read article 2" [low]
5. 📄 create_file — "Create Excel script" [low]
6. 💻 run_shell_command — "Run script" [medium]
Each step card slides in, gets a green ✓ check, progress bar fills. Final state: green "✓ Execution complete" with 6/6 counter.
Sequential/interaction: yes — steps appear one by one with progress bar filling, checkmarks popping
Audio intent: satisfying cascade of completion
Audio-coupled idea: drop sound for each step appearing, progress bar fill momentum
Music: beat grid alignment for step reveals (8.02, 8.52, 9.02, 9.52, 10.02, 10.52)
Transition mood: dramatic → Scene 4

### Scene 4 — Activity Log Cascade — 3s
The activity log panel fills with real-time events, each line sliding up:
- ✓ SYS Connected (green)
- ◈ AI Generating plan... (cyan)
- ✓ PLN Plan ready (green)
- ▶ RUN Executing... (cyan)
- ✓ Step 1 complete (green)
- ✓ DONE All steps completed (green)
Summary card pops: "6 Total steps • 6 Successful • 4.2s Duration"
Sequential/interaction: yes — log lines cascade one by one
Audio intent: rapid resolution, satisfying
Audio-coupled idea: soft ticks for each log line
Music: momentum sustaining
Transition mood: dramatic → Scene 5

### Scene 5 — Logo / Outro — 3s
Black background. The Nexus hexagon icon (cyan square with white hexagon + circle) appears center, scales in. "NEXUS" in Bebas Neue below it. Below that, tagline: "You describe it. Nexus does it." Hold. Fade to black.
Sequential/interaction: none
Audio intent: final resolve, confidence
Audio-coupled idea: bell impact on logo reveal
Music: fade out under logo
Transition mood: end

**Music mood for this video:** cinematic, energetic, confident
**Audio summary:** upbeat corporate bed builds through the typing hook, rides the timeline cascade at full energy, then resolves under the logo with a clean bell hit and fade-out.
