# EDUTAINAL MAVERICK WORLD — UI Style & Design System Specification (`design.md`)

> **Version:** 3.0.0 (Stitch Blueprint Aligned)  
> **Target Application:** Edutainal Student Progress & Learning Evidence Portal  
> **Scope:** Parent Console (`/parent`), Company Observer Workspace (`/company`), Component Library, and Stitch Screen Architecture  
> **Document Purpose:** Complete technical design manual and implementation reference based on the official Stitch design templates.

---

## 1. Typography & Font System

The UI uses a calibrated tri-font typographic hierarchy loaded via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">
```

### 1.1 Font Roles
| Role | Family | Tailwind Class | Usage |
|---|---|---|---|
| **Headings & Display** | `Plus Jakarta Sans` | `font-headline-display`, `font-headline-lg`, `font-headline-md` | Page titles, panel headers, tab labels, brand identity |
| **Body & Narrative** | `DM Sans` | `font-body-lg`, `font-body-default`, `font-body-sm` | Observer notes, mentor transcripts, feedback text, explanations |
| **Metrics & Code Tokens** | `JetBrains Mono` | `font-headline-metric`, `font-eyebrow`, `font-label-micro` | KPI numbers, score badges, timestamps, eyebrow tags, hash IDs |

### 1.2 Type Scale Specification
| Token Name | Font Size | Line Height | Letter Spacing | Weight |
|---|---|---|---|---|
| `headline-display` | `40px` | `48px` | `-1.4px` | 700 / Bold |
| `headline-display-mobile` | `28px` | `34px` | `-0.8px` | 700 / Bold |
| `headline-metric` | `32px` | `36px` | `-1.0px` | 600 / SemiBold |
| `headline-lg` | `21px` | `28px` | `-0.4px` | 600 / SemiBold |
| `headline-md` | `16px` | `22px` | `0px` | 600 / SemiBold |
| `body-lg` | `15px` | `24px` | `0px` | 400 / Regular |
| `body-default` | `14px` | `22px` | `0px` | 400 / Regular |
| `body-sm` | `12px` | `20px` | `0px` | 400 / Regular |
| `label-default` | `13px` | `18px` | `0px` | 500 / Medium |
| `eyebrow` | `11px` | `14px` | `+1.8px` | 700 / Bold (Uppercase) |
| `label-micro` | `10px` | `14px` | `+0.4px` | 500 / Medium |

---

## 2. Complete Tailwind Color Palette & Design Tokens

```javascript
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Core Primary
        "primary": "#004e48",
        "primary-container": "#006860",
        "on-primary": "#ffffff",
        "on-primary-container": "#94e4d9",
        "primary-fixed": "#a1f1e6",
        "primary-fixed-dim": "#85d5ca",
        "on-primary-fixed": "#00201d",
        "on-primary-fixed-variant": "#00504a",
        "inverse-primary": "#85d5ca",

        // Secondary & Slate Surfaces
        "secondary": "#45636b",
        "secondary-container": "#c5e5ee",
        "on-secondary": "#ffffff",
        "on-secondary-container": "#49676f",
        "secondary-fixed": "#c8e8f1",
        "secondary-fixed-dim": "#acccd5",
        "on-secondary-fixed": "#001f26",
        "on-secondary-fixed-variant": "#2d4b53",

        // Tertiary / Warm Gold Accents
        "tertiary": "#594000",
        "tertiary-container": "#765705",
        "on-tertiary": "#ffffff",
        "on-tertiary-container": "#facf77",
        "tertiary-fixed": "#ffdea1",
        "tertiary-fixed-dim": "#ebc16a",
        "on-tertiary-fixed": "#261900",
        "on-tertiary-fixed-variant": "#5c4300",
        "gold-accent": "#efc46d",

        // Backgrounds & Surfaces (Daylight Slate / Ice Teal)
        "background": "#effbff",
        "surface": "#effbff",
        "surface-bright": "#effbff",
        "surface-dim": "#bfe0e8",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#def8ff",
        "surface-container": "#d2f4fc",
        "surface-container-high": "#cdeef7",
        "surface-container-highest": "#c7e8f1",
        "surface-variant": "#c7e8f1",
        "on-surface": "#001f25",
        "on-surface-variant": "#3e4947",
        "on-background": "#001f25",

        // Dark Environments (Sidebar & Company Workspace)
        "dark-petrol": "#15343b",
        "company-dark": "#0c1322",
        "inverse-surface": "#14353b",
        "inverse-on-surface": "#d6f6ff",

        // Outlines & Borders
        "outline": "#6e7977",
        "outline-variant": "#bec9c6",
        "focus-ring": "#e9ba68",

        // Live Real-Time Pulse
        "live-broadcast": "#3ca58e",

        // STEAMRE 8 Pillars
        "skill-science": "#168b81",      // Teal
        "skill-technology": "#5276d2",   // Royal Blue
        "skill-research": "#b083d4",     // Amethyst Violet
        "skill-engineering": "#dc9c3c",  // Solar Amber
        "skill-arts": "#d9718b",         // Coral Rose
        "skill-mathematics": "#44a7bb",  // Cyan Azure
        "skill-energy": "#83a64a",       // Verdant Olive
        "skill-resilience": "#65738c",   // Slate Steel

        // Functional Trends
        "trend-up": "#168b81",
        "trend-up-bg": "#edf7f3",
        "trend-down": "#b2714d",
        "trend-down-bg": "#fbf3ec",
        "trend-neutral": "#83949c",
        "trend-neutral-bg": "#f1f4f7",

        // Error States
        "error": "#ba1a1a",
        "error-container": "#ffdad6",
        "on-error": "#ffffff",
        "on-error-container": "#93000a"
      }
    }
  }
};
```

---

## 3. Layout Architecture & Spatial Grid

### 3.1 Shell Geometry
* **Fixed Left Sidebar (`aside`):**
  * Desktop positioning: `fixed left-4 top-4 bottom-4 w-[228px]` (or `w-60`).
  * Styling: `bg-dark-petrol text-surface-container-lowest rounded-[24px] shadow-[0_12px_38px_rgba(21,52,59,0.22)] p-4 flex flex-col justify-between z-50`.
* **Floating Header (`header`):**
  * Positioning: `fixed top-4 left-[264px] right-4 h-16 z-40`.
  * Styling: `bg-surface-container-lowest/85 backdrop-blur-xl rounded-[20px] shadow-[0_12px_38px_rgba(32,79,95,0.07)] flex items-center justify-between px-6`.
* **Main Scroll Surface (`main`):**
  * Margin offset: `pl-[264px] pr-4 pt-16 pb-12 bg-surface min-h-screen`.
  * Content max-width: `max-w-[1720px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6`.

---

## 4. Stitch Screen Blueprints & Component Matrix

### 4.1 Screen 1: Overview & Class-by-Class Progress

#### A. Welcome & Filter Bar
* **Header Block:**
  * Eyebrow: `Parent Console · Authentic Learning Evidence · Motto: Learning, made visible`.
  * Heading H1: `Welcome back, Sarah! Here is Leo Chen's verified learning evidence and classroom trajectory.`
  * CTA: `Download Parent PDF Report` (Primary button with `download` icon).
* **Filter Strip:**
  * Date range selector: `Oct 1, 2024 - Dec 15, 2024` with `date_range` icon.
  * Zone filter: `Space Science & Robotics` with `science` icon.
  * Reset filters button: `restart_alt`.
  * Verification meta pill: `16 of 16 sessions displayed · Verified by Mentor Dr. Aris Thorne` with glowing pulse dot.

#### B. 4-Card KPI Strip
1. **Completed Sessions:** `16 Classes`, `+2 this month` badge, progress bar (`width: 80%`), `80% of Explorer Milestone (4 remaining)`.
2. **Recorded Time:** `38.5 hrs`, `Deep Immersion` badge, sparkline SVG path, `Avg. 2.4 hrs / class · 100% On-Site Hands-On`.
3. **STEAMRE Evidence:** `7 / 8 Pillars`, `92% Consistency` badge, 8 colored pillar dots with Energy marked as awaiting observation.
4. **Zones Explored:** `6 / 10 Zones`, `Multi-Disciplinary` badge, `Active: Space & Robotics · +1 New Zone`.

#### C. Left Column: Class-by-Class Progress Timeline (Col-Span-7)
* **Pillar Filter Chips:** 8 toggle buttons for each STEAMRE pillar (`bg-skill-*/15 text-skill-* font-semibold ring-1 ring-skill-*/30`).
* **SVG Trajectory Chart:**
  * Width: 680px viewBox (`0 0 680 170`).
  * Continuous observation index line connecting Class 1 (`40,105`) through Class 16 (`640,32`).
  * Class 16 Active glowing node with triple circle ring (`r=9 fill-opacity="0.45"`, `r=5`, `r=2.5`).
* **Expanded Class Detail Drawer (Class 16 Focus):**
  * Title: `Martian Habitat Rover: Obstacle Avoidance & Ultrasonic Telemetry`.
  * Metadata: `Dec 12, 2024 · 2.5 hrs · Zone: Robotics & Space Systems · Dr. Aris Thorne`.
  * Demonstrated marks grid:
    * *Engineering:* 92/100 (`Chassis stability & dual-motor torque balance`)
    * *Technology:* 88/100 (`Ultrasonic pulse calibration & serial bus output`)
    * *Resilience:* 95/100 (`Overcame sensor drift via algorithmic logic`)
  * Mentor Observation Quote:
    > *"Leo showed extraordinary tenacity when the ultrasonic sensor reflected erroneous echo distances on sloped Martian sand surfaces..."*
  * Actionable Next Step: `Explore PID motor tuning in Class 17 for smoother turns.`

#### D. Right Column: 8-Pillar STEAMRE Map & Delta Trajectory (Col-Span-5)
* **Octagonal SVG Radar Chart:**
  * Radius: 140px centered at `(160, 140)`.
  * Evaluated polygon connects Science (85), Tech (88), Research (78), Eng (92), Arts (70), Math (86), Resilience (90).
  * **Strict Data Rule:** Energy (Pending) is bypassed with a dashed stroke & empty node, **never plotted as 0**.
* **Trailing 3-Class Velocity Card:**
  * Trailing shift badge: `+8.4 pts Overall`.
  * Top surging item: `Resilience` (+14 pts, from 76 in C13 to 90 in C16).
  * Engineering synthesis: `+9 pts`.

#### E. Bottom Grid: 3 Analytical Panels
1. **Zone Engagement Hours:** Vertical stack of horizontal bar tracks: Robotics (12.5 hrs), Space Science (8.5 hrs), Code Craft (7.0 hrs), BioTech (5.5 hrs), Structural Physics (5.0 hrs).
2. **Behavioral Observation Rubric:** Curiosity & Inquiry (4.0/4 · Exemplary), Autonomy & Problem Solving (3.5/4 · Advancing), Peer Collaboration (3.0/4 · Proficient).
3. **Next Scheduled Class:** Class 17 (`Dec 19, 2024 · 4:00 PM - 6:30 PM`), Blueprint: `Autonomous Rover PID Closed-Loop Control`, Parent Preparation Hint.

---

### 4.2 Screen 2: Skill Breakdown & Session Heatmap

* **Pillar Evidence Progression Matrix Table:**
  * Columns: `Pillar/Skill`, `Weighted Score`, `Observations`, `Evidence Status`, `Trailing Delta`, `Last Verified`, `Primary Mentor`, `Breakthrough Evidence Anchor`, `Inspect`.
  * Expandable accordion row on click reveals the full qualitative rubric transcript and next verification milestone.
* **Chronological Session Heatmap (Classes 1–16):**
  * Matrix of classes across rows and 8 pillars across columns.
  * Cell color intensity scaled by rubric mark:
    * `25 Foundational` (`bg-primary/20`)
    * `50 Developing` (`bg-primary/40`)
    * `75 Proficient` (`bg-primary/75`)
    * `100 Exemplary` (`bg-primary`)
    * `Unobserved` (`bg-trend-neutral-bg text-trend-neutral --`)
  * Floating JavaScript hover tooltip displaying date, session number, rubric score, and mentor transcript snippet.
* **Evidence Validation Threshold Gate:**
  * Progress meters showing qualification towards the 3-observation threshold per pillar.
  * Regional Junior Mars Rover Challenge nomination callout upon completing all 8 gates.
* **Field Telemetry Feed:**
  * Unfiltered observational field voice transcripts from Dr. Aris Thorne and Sarah Lin.

---

### 4.3 Screen 3: Pathways & Mentor Action Plan

* **Curated Exploration Pathways:**
  1. *Autonomous Robotics & Rover Systems:* Flagship track, 4/4 pillars met, 94.2% suitability, PID stability telemetry.
  2. *Sustainable Energy & Bio-Mechanics:* Gated (1 pillar remaining, Energy pending in Class 17).
  3. *Applied Creative Tech & Industrial CAD:* 3/3 pillars met, Onshape parametric 3D modeling.
  4. *Computational Logic & Algorithmic Firmware:* 3/3 pillars met, finite state machines.
  5. *Autonomous Marine Systems & Fluid Dynamics:* Gated (Future Term).
* **Immediate Action Plan Targets:**
  * `01 Priority 1 (Hardware/Controls):` Implement derivative D-term dampening on 30° ramp descent.
  * `02 Priority 2 (Algorithmic/Math):` Calibrate optical encoder pulse tick multiplier.
  * `03 Maintenance (Resilience):` Document gear meshing wear under 10x macro lens.
* **Friction Zones & Cognitive Breakthroughs:**
  * Friction: CAD gusset fillets & aerodynamic drag; serial bus I2C timing contention.
  * Breakthrough: Tenacious mechanical problem-solving (+14 Resilience); collaborative leadership.
* **UN Sustainable Development Goals (SDG) Integration:**
  * SDG 4 (Quality Education), SDG 7 (Clean Energy), SDG 9 (Industry & Innovation), SDG 13 (Climate Action).
  * Cryptographic W3C Verifiable Credential signature (`#8F4A-992B-VERIFIED`).

---

### 4.4 Screen 4: Project Portfolio & Session Journal

* **Search & Filter Strip:**
  * Instant search input: `Search project title, learning zone, mentor, or SDG...`
  * Filter pills for 10 zones and status.
* **Project Cards & Evidence Drawer:**
  * Expandable project entries showing activity signatures, breakthroughs, friction areas, and mentor validation stamps.

---

## 5. Design Integrity & Implementation Rules

When rendering or updating dashboard templates:
1. **Never Replace Nulls with Zero:** Unobserved STEAMRE ratings must be rendered as `--` or a dashed outline.
2. **Preserve Color Coding:** Always map the exact hex tokens for Science, Technology, Research, Engineering, Arts, Mathematics, Energy, and Resilience.
3. **Tabular Figures:** Always use `JetBrains Mono` or `tabular-nums` for rubric scores and delta trends.
4. **WCAG Focus Ring:** All clickable nodes, pills, and buttons must exhibit `outline: 3px solid #e9ba68; outline-offset: 3px`.
