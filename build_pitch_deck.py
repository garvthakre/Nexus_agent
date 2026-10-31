"""
build_pitch_deck.py
Generates the 7-slide winner-level pitch deck for Nexus Teammate
Paytm Build for India AI Hackathon (Track 3: Autonomous AI Teammates)
"""

import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# 16:9 Widescreen dimensions
SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

# Color Palette (Dark Fintech)
COLOR_BG = RGBColor(10, 27, 51)          # #0A1B33 Deep Navy
COLOR_CARD = RGBColor(17, 37, 68)        # #112544 Card Fill
COLOR_CARD_BORDER = RGBColor(31, 62, 109)# #1F3E6D Card Border
COLOR_TEXT_PRIMARY = RGBColor(248, 250, 252) # #F8FAFC White/Near White
COLOR_TEXT_MUTED = RGBColor(148, 163, 184)   # #94A3B8 Muted Gray
COLOR_CYAN = RGBColor(0, 186, 242)       # #00BAF2 Paytm Cyan
COLOR_GREEN = RGBColor(16, 185, 129)     # #10B981 Success Green
COLOR_AMBER = RGBColor(245, 158, 11)     # #F59E0B Warning Amber
COLOR_RED = RGBColor(239, 68, 68)        # #EF4444 Error Red
COLOR_ROW_ALT = RGBColor(21, 46, 84)     # Table alternating row

def apply_slide_background(slide):
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = COLOR_BG

def add_header(slide, tag_text, headline_text):
    # Top Tag / Category
    tag_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.45), Inches(11.7), Inches(0.35))
    tf_tag = tag_box.text_frame
    tf_tag.word_wrap = True
    tf_tag.margin_left = tf_tag.margin_top = tf_tag.margin_right = tf_tag.margin_bottom = 0
    p_tag = tf_tag.paragraphs[0]
    p_tag.text = tag_text.upper()
    p_tag.font.name = "Segoe UI"
    p_tag.font.size = Pt(11)
    p_tag.font.bold = True
    p_tag.font.color.rgb = COLOR_CYAN

    # Main Headline
    head_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.8), Inches(11.7), Inches(0.7))
    tf_head = head_box.text_frame
    tf_head.word_wrap = True
    tf_head.margin_left = tf_head.margin_top = tf_head.margin_right = tf_head.margin_bottom = 0
    p_head = tf_head.paragraphs[0]
    p_head.text = headline_text
    p_head.font.name = "Segoe UI"
    p_head.font.size = Pt(24)
    p_head.font.bold = True
    p_head.font.color.rgb = COLOR_TEXT_PRIMARY

def add_card(slide, left, top, width, height, bg_color=COLOR_CARD, border_color=COLOR_CARD_BORDER):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = bg_color
    shape.line.color.rgb = border_color
    shape.line.width = Pt(1)
    return shape

def create_deck():
    prs = Presentation()
    prs.slide_width = SLIDE_WIDTH
    prs.slide_height = SLIDE_HEIGHT
    blank_layout = prs.slide_layouts[6]

    # =========================================================================
    # SLIDE 1: TITLE SLIDE
    # =========================================================================
    s1 = prs.slides.add_slide(blank_layout)
    apply_slide_background(s1)

    # Left Container for Text
    # Track Badge
    badge = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.1), Inches(4.3), Inches(0.38))
    badge.fill.solid()
    badge.fill.fore_color.rgb = RGBColor(14, 43, 82)
    badge.line.color.rgb = COLOR_CYAN
    badge.line.width = Pt(1)
    tf_badge = badge.text_frame
    tf_badge.vertical_anchor = MSO_ANCHOR.MIDDLE
    p_b = tf_badge.paragraphs[0]
    p_b.text = "TRACK 3: AUTONOMOUS AI TEAMMATES"
    p_b.font.name = "Segoe UI"
    p_b.font.size = Pt(11)
    p_b.font.bold = True
    p_b.font.color.rgb = COLOR_CYAN
    p_b.alignment = PP_ALIGN.CENTER

    # Event line
    ev_box = s1.shapes.add_textbox(Inches(0.8), Inches(1.6), Inches(6.0), Inches(0.3))
    tf_ev = ev_box.text_frame
    p_ev = tf_ev.paragraphs[0]
    p_ev.text = "Paytm Build for India AI Hackathon | Bengaluru Edition"
    p_ev.font.name = "Segoe UI"
    p_ev.font.size = Pt(12)
    p_ev.font.color.rgb = COLOR_TEXT_MUTED

    # Product Name
    title_box = s1.shapes.add_textbox(Inches(0.8), Inches(2.1), Inches(6.0), Inches(1.0))
    tf_title = title_box.text_frame
    p_title = tf_title.paragraphs[0]
    p_title.text = "Nexus Teammate"
    p_title.font.name = "Segoe UI"
    p_title.font.size = Pt(46)
    p_title.font.bold = True
    p_title.font.color.rgb = COLOR_TEXT_PRIMARY

    # Core Value Line
    tagline_box = s1.shapes.add_textbox(Inches(0.8), Inches(3.2), Inches(5.8), Inches(0.8))
    tf_tag = tagline_box.text_frame
    tf_tag.word_wrap = True
    p_tag = tf_tag.paragraphs[0]
    p_tag.text = "Closes tickets directly on screen instead of answering with text."
    p_tag.font.name = "Segoe UI"
    p_tag.font.size = Pt(22)
    p_tag.font.bold = True
    p_tag.font.color.rgb = COLOR_CYAN

    # Sub-pitch
    sub_box = s1.shapes.add_textbox(Inches(0.8), Inches(4.1), Inches(5.6), Inches(0.9))
    tf_sub = sub_box.text_frame
    tf_sub.word_wrap = True
    p_sub = tf_sub.paragraphs[0]
    p_sub.text = "Autonomous desktop operations teammate for Paytm customer support and merchant workflows. It executes tasks across internal tools without requiring custom APIs."
    p_sub.font.name = "Segoe UI"
    p_sub.font.size = Pt(14)
    p_sub.font.color.rgb = COLOR_TEXT_MUTED

    # Key Stat Chips
    chip1 = add_card(s1, Inches(0.8), Inches(5.3), Inches(2.6), Inches(0.65))
    tf_c1 = chip1.text_frame
    tf_c1.margin_left = Inches(0.15)
    tf_c1.margin_top = Inches(0.08)
    p_c1a = tf_c1.paragraphs[0]
    p_c1a.text = "106 Logged Runs"
    p_c1a.font.size = Pt(13)
    p_c1a.font.bold = True
    p_c1a.font.color.rgb = COLOR_TEXT_PRIMARY
    p_c1b = tf_c1.add_paragraph()
    p_c1b.text = "83% task success rate"
    p_c1b.font.size = Pt(10)
    p_c1b.font.color.rgb = COLOR_CYAN

    chip2 = add_card(s1, Inches(3.6), Inches(5.3), Inches(2.8), Inches(0.65))
    tf_c2 = chip2.text_frame
    tf_c2.margin_left = Inches(0.15)
    tf_c2.margin_top = Inches(0.08)
    p_c2a = tf_c2.paragraphs[0]
    p_c2a.text = "7-Tier Self-Healing"
    p_c2a.font.size = Pt(13)
    p_c2a.font.bold = True
    p_c2a.font.color.rgb = COLOR_TEXT_PRIMARY
    p_c2b = tf_c2.add_paragraph()
    p_c2b.text = "Adapts when UI changes"
    p_c2b.font.size = Pt(10)
    p_c2b.font.color.rgb = COLOR_GREEN

    # Builder Credit
    b_box = s1.shapes.add_textbox(Inches(0.8), Inches(6.4), Inches(6.0), Inches(0.5))
    tf_b = b_box.text_frame
    p_b1 = tf_b.paragraphs[0]
    p_b1.text = "Builder: Garv Thakre | GSoC 2026 Contributor at MetaBrainz | Built 90+ production REST APIs"
    p_b1.font.name = "Segoe UI"
    p_b1.font.size = Pt(11)
    p_b1.font.color.rgb = COLOR_TEXT_MUTED

    # Right side: Product Screenshot in window frame
    frame = add_card(s1, Inches(6.9), Inches(1.1), Inches(5.6), Inches(5.6))
    if os.path.exists("real_screen_raw.png"):
        s1.shapes.add_picture("real_screen_raw.png", Inches(7.05), Inches(1.7), width=Inches(5.3))
    
    # Frame Title Bar
    ft_box = s1.shapes.add_textbox(Inches(7.1), Inches(1.2), Inches(5.2), Inches(0.35))
    tf_ft = ft_box.text_frame
    p_ft = tf_ft.paragraphs[0]
    p_ft.text = "Nexus Execution Engine: Live Plan & Activity Stream"
    p_ft.font.size = Pt(12)
    p_ft.font.bold = True
    p_ft.font.color.rgb = COLOR_TEXT_PRIMARY

    # Frame Caption
    cap_box = s1.shapes.add_textbox(Inches(7.05), Inches(6.1), Inches(5.3), Inches(0.5))
    tf_cap = cap_box.text_frame
    tf_cap.word_wrap = True
    p_cap = tf_cap.paragraphs[0]
    p_cap.text = "Real runtime UI: generates execution plan, audits security risks, and triggers automated screen steps live."
    p_cap.font.size = Pt(10)
    p_cap.font.color.rgb = COLOR_TEXT_MUTED

    # =========================================================================
    # SLIDE 2: PROBLEM STATEMENT
    # =========================================================================
    s2 = prs.slides.add_slide(blank_layout)
    apply_slide_background(s2)
    add_header(s2, "The Reality in Support Ops", "Support teams spend their day clicking, not solving")

    # Flow Container: The 5-hop ticket journey
    f_bg = add_card(s2, Inches(0.8), Inches(1.7), Inches(11.7), Inches(1.9))
    
    flow_title = s2.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(11.3), Inches(0.3))
    tf_fl = flow_title.text_frame
    p_fl = tf_fl.paragraphs[0]
    p_fl.text = "THE MANUAL MAZE: ONE TRANSACTION DISPUTE TRAVERSES 5 SEPARATE SCREENS"
    p_fl.font.size = Pt(11)
    p_fl.font.bold = True
    p_fl.font.color.rgb = COLOR_CYAN

    # 5 Flow Step Cards
    hops = [
        ("1. Ticket Queue", "Zendesk / CRM", "Reads user complaint"),
        ("2. Payment Portal", "Merchant Console", "Looks up Txn status"),
        ("3. Bank Ledger", "Banking Gateway", "Verifies UTR credit"),
        ("4. Dispute Engine", "Internal Web Tool", "Checks refund policy"),
        ("5. Payout Desk", "Finance Tool", "Executes reversal")
    ]
    for i, (h_title, h_sub, h_desc) in enumerate(hops):
        hx = Inches(1.0 + (i * 2.25))
        hc = add_card(s2, hx, Inches(2.2), Inches(2.1), Inches(1.2), bg_color=RGBColor(24, 50, 90), border_color=COLOR_CARD_BORDER)
        tf_hc = hc.text_frame
        tf_hc.margin_left = tf_hc.margin_right = Inches(0.1)
        tf_hc.margin_top = Inches(0.08)
        p1 = tf_hc.paragraphs[0]
        p1.text = h_title
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_TEXT_PRIMARY
        p2 = tf_hc.add_paragraph()
        p2.text = h_sub
        p2.font.size = Pt(10)
        p2.font.color.rgb = COLOR_CYAN
        p3 = tf_hc.add_paragraph()
        p3.text = h_desc
        p3.font.size = Pt(10)
        p3.font.color.rgb = COLOR_TEXT_MUTED
        
        # Click marker tag
        p4 = tf_hc.add_paragraph()
        p4.text = "[Human clicks here]"
        p4.font.size = Pt(9)
        p4.font.bold = True
        p4.font.color.rgb = COLOR_AMBER

    # Three Core Pain Points Cards
    pains = [
        ("Chatbots answer, but humans still click", "Conversational AI answers queries with text, but human operators still have to manually navigate portals and update records."),
        ("Internal operations tools lack APIs", "Core banking portals, legacy admin consoles, and merchant tools have no programmatic endpoints. Human screens are the only interface."),
        ("Routine disputes crowd out complex cases", "Agents spend over 60% of their shifts repeating the same lookup steps instead of managing escalations and merchant relationships.")
    ]
    for i, (ptitle, pdesc) in enumerate(pains):
        px = Inches(0.8 + (i * 4.0))
        pc = add_card(s2, px, Inches(3.8), Inches(3.7), Inches(1.8))
        tf_pc = pc.text_frame
        tf_pc.margin_left = tf_pc.margin_right = Inches(0.2)
        tf_pc.margin_top = Inches(0.15)
        p1 = tf_pc.paragraphs[0]
        p1.text = ptitle
        p1.font.size = Pt(14)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_TEXT_PRIMARY
        p2 = tf_pc.add_paragraph()
        p2.text = pdesc
        p2.font.size = Pt(12)
        p2.font.color.rgb = COLOR_TEXT_MUTED

    # Stat Placeholder Callout
    stat_card = add_card(s2, Inches(0.8), Inches(5.8), Inches(11.7), Inches(1.1), bg_color=RGBColor(16, 38, 70), border_color=COLOR_CYAN)
    tf_sc = stat_card.text_frame
    tf_sc.margin_left = Inches(0.25)
    tf_sc.margin_top = Inches(0.12)
    p_sc1 = tf_sc.paragraphs[0]
    p_sc1.text = "INDUSTRY REALITY: SUPPORT OVERHEAD IN DIGITAL PAYMENTS"
    p_sc1.font.size = Pt(10)
    p_sc1.font.bold = True
    p_sc1.font.color.rgb = COLOR_CYAN
    p_sc2 = tf_sc.add_paragraph()
    p_sc2.text = "[ADD SOURCED STAT: Indian payment gateways report up to 30% of support volume comes from transient failed payment disputes and status queries (Source: CXO Digital Pulse / Industry Average)]"
    p_sc2.font.size = Pt(12)
    p_sc2.font.color.rgb = COLOR_TEXT_PRIMARY

    # =========================================================================
    # SLIDE 3: PROPOSED SOLUTION
    # =========================================================================
    s3 = prs.slides.add_slide(blank_layout)
    apply_slide_background(s3)
    add_header(s3, "Autonomous Action, Not Chat", "Nexus works the ticket from open to closed")

    # 5-Step Connected Execution Flow
    steps_5 = [
        ("1. READ", "Ingests ticket data", "Extracts transaction ID, user claim, and order details."),
        ("2. PLAN", "Compiles steps", "Translates task into a strict multi-step browser plan."),
        ("3. REVIEW", "Audits safety risks", "LLM reviews plan; confirms steps before execution."),
        ("4. ACT", "Operates screens", "Navigates dashboards, fills forms, clicks buttons."),
        ("5. LOG", "Records every action", "Appends execution trace to immutable JSONL audit log.")
    ]
    for i, (stitle, ssub, sdesc) in enumerate(steps_5):
        sx = Inches(0.8 + (i * 2.4))
        sc = add_card(s3, sx, Inches(1.7), Inches(2.25), Inches(2.2))
        tf_s = sc.text_frame
        tf_s.margin_left = tf_s.margin_right = Inches(0.15)
        tf_s.margin_top = Inches(0.15)
        p1 = tf_s.paragraphs[0]
        p1.text = stitle
        p1.font.size = Pt(14)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_CYAN
        p2 = tf_s.add_paragraph()
        p2.text = ssub
        p2.font.size = Pt(12)
        p2.font.bold = True
        p2.font.color.rgb = COLOR_TEXT_PRIMARY
        p3 = tf_s.add_paragraph()
        p3.text = sdesc
        p3.font.size = Pt(10)
        p3.font.color.rgb = COLOR_TEXT_MUTED
        
        # Review callout for Step 3
        if i == 2:
            p4 = tf_s.add_paragraph()
            p4.text = "[Human in the loop: safety verdict + confirm step]"
            p4.font.size = Pt(9)
            p4.font.bold = True
            p4.font.color.rgb = COLOR_AMBER

    # Left Container: Target Workflow Box
    tw_box = add_card(s3, Inches(0.8), Inches(4.1), Inches(5.6), Inches(2.1))
    tf_tw = tw_box.text_frame
    tf_tw.margin_left = Inches(0.2)
    tf_tw.margin_top = Inches(0.15)
    p_tw0 = tf_tw.paragraphs[0]
    p_tw0.text = "TARGET WORKFLOW: FAILED-PAYMENT DISPUTE"
    p_tw0.font.size = Pt(11)
    p_tw0.font.bold = True
    p_tw0.font.color.rgb = COLOR_CYAN
    p_tw1 = tf_tw.add_paragraph()
    p_tw1.text = "A failed-payment dispute arrives. Nexus reads context, plans steps, reviews safety, checks status in the portal, picks refund or escalate, updates the ticket, and logs every step."
    p_tw1.font.size = Pt(12)
    p_tw1.font.color.rgb = COLOR_TEXT_PRIMARY
    p_tw2 = tf_tw.add_paragraph()
    p_tw2.text = "Target workflow for customer operations. Humans only handle unresolved edge cases."
    p_tw2.font.size = Pt(10)
    p_tw2.font.color.rgb = COLOR_TEXT_MUTED

    # Right Container: Live UI Evidence Callout
    ui_box = add_card(s3, Inches(6.7), Inches(4.1), Inches(5.8), Inches(2.1))
    if os.path.exists("nexus_ui_plan.png"):
        s3.shapes.add_picture("nexus_ui_plan.png", Inches(6.85), Inches(4.25), width=Inches(3.2))
    
    tf_uic = s3.shapes.add_textbox(Inches(10.2), Inches(4.2), Inches(2.2), Inches(1.8)).text_frame
    tf_uic.word_wrap = True
    p_u1 = tf_uic.paragraphs[0]
    p_u1.text = "CALLOUTS"
    p_u1.font.size = Pt(10)
    p_u1.font.bold = True
    p_u1.font.color.rgb = COLOR_CYAN
    p_u2 = tf_uic.add_paragraph()
    p_u2.text = "1. Strict JSON Plan: deterministic steps."
    p_u2.font.size = Pt(9)
    p_u2.font.color.rgb = COLOR_TEXT_PRIMARY
    p_u3 = tf_uic.add_paragraph()
    p_u3.text = "2. Safety Auditor: pre-run risk verdict."
    p_u3.font.size = Pt(9)
    p_u3.font.color.rgb = COLOR_TEXT_PRIMARY
    p_u4 = tf_uic.add_paragraph()
    p_u4.text = "3. Activity Log: real-time streaming trace."
    p_u4.font.size = Pt(9)
    p_u4.font.color.rgb = COLOR_TEXT_PRIMARY

    # Bottom Shipped Capabilities Strip
    b_strip = add_card(s3, Inches(0.8), Inches(6.4), Inches(11.7), Inches(0.65), bg_color=RGBColor(12, 32, 62), border_color=COLOR_GREEN)
    tf_bs = b_strip.text_frame
    tf_bs.margin_left = Inches(0.2)
    tf_bs.margin_top = Inches(0.12)
    p_bs = tf_bs.paragraphs[0]
    p_bs.text = "BUILT & RUNNING: Runs on a schedule (cron DB triggers) | Switches models on failure (failover routing) | Takes voice commands (browser en-IN, hi-IN)"
    p_bs.font.size = Pt(11)
    p_bs.font.bold = True
    p_bs.font.color.rgb = COLOR_GREEN

    # =========================================================================
    # SLIDE 4: TECHNOLOGY / TECH STACK
    # =========================================================================
    s4 = prs.slides.add_slide(blank_layout)
    apply_slide_background(s4)
    add_header(s4, "System Architecture", "Engineered to act where APIs do not exist")

    # Architecture Pipeline Grid
    # 1. Inputs Column
    in_card = add_card(s4, Inches(0.8), Inches(1.7), Inches(2.6), Inches(4.5))
    tf_in = in_card.text_frame
    tf_in.margin_left = tf_in.margin_right = Inches(0.15)
    tf_in.margin_top = Inches(0.15)
    p_in0 = tf_in.paragraphs[0]
    p_in0.text = "TRIGGER LAYER"
    p_in0.font.size = Pt(11)
    p_in0.font.bold = True
    p_in0.font.color.rgb = COLOR_CYAN
    
    inputs_list = [
        ("User Prompt (Web UI)", "Plain English task entry", "Built"),
        ("Scheduler Service", "Cron DB stored schedules", "Built"),
        ("Voice Input", "Browser en-IN & hi-IN", "Built"),
        ("Webhooks", "Event triggers start/end", "Built")
    ]
    for ititle, idesc, istatus in inputs_list:
        p1 = tf_in.add_paragraph()
        p1.text = f"{ititle} [{istatus}]"
        p1.font.size = Pt(11)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_TEXT_PRIMARY
        p2 = tf_in.add_paragraph()
        p2.text = idesc
        p2.font.size = Pt(9)
        p2.font.color.rgb = COLOR_TEXT_MUTED

    # 2. Planner & Safety Column
    core_card = add_card(s4, Inches(3.6), Inches(1.7), Inches(2.7), Inches(4.5))
    tf_core = core_card.text_frame
    tf_core.margin_left = tf_core.margin_right = Inches(0.15)
    tf_core.margin_top = Inches(0.15)
    p_c0 = tf_core.paragraphs[0]
    p_c0.text = "INTELLIGENCE LAYER"
    p_c0.font.size = Pt(11)
    p_c0.font.bold = True
    p_c0.font.color.rgb = COLOR_CYAN

    core_list = [
        ("Planner (planner.ts)", "Context budgeting (12K chars); translates prompt into JSON steps."),
        ("Safety Reviewer", "Independent LLM audit: returns SAFE, REVIEW_REQUIRED, or UNSAFE."),
        ("Provider Failover [Built]", "Routes to Groq Llama 3.3 70B, OpenAI GPT-4o, Anthropic Claude on errors.")
    ]
    for ctitle, cdesc in core_list:
        p1 = tf_core.add_paragraph()
        p1.text = ctitle
        p1.font.size = Pt(11)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_TEXT_PRIMARY
        p2 = tf_core.add_paragraph()
        p2.text = cdesc
        p2.font.size = Pt(9)
        p2.font.color.rgb = COLOR_TEXT_MUTED

    # 3. Executor & 7-Tier Self-Healing Engine Column
    eng_card = add_card(s4, Inches(6.5), Inches(1.7), Inches(3.5), Inches(4.5))
    tf_eng = eng_card.text_frame
    tf_eng.margin_left = tf_eng.margin_right = Inches(0.15)
    tf_eng.margin_top = Inches(0.15)
    p_e0 = tf_eng.paragraphs[0]
    p_e0.text = "7-TIER SELF-HEALING ENGINE"
    p_e0.font.size = Pt(11)
    p_e0.font.bold = True
    p_e0.font.color.rgb = COLOR_CYAN
    p_sub = tf_eng.add_paragraph()
    p_sub.text = "Browser execution cascade (Browserengine.ts):"
    p_sub.font.size = Pt(9)
    p_sub.font.color.rgb = COLOR_TEXT_MUTED

    tiers = [
        "Tier -1: Selector Memory (learned cache)",
        "Tier 0: Direct CSS & Site Handlers",
        "Tier 1: DOM Fuzzy Scan (keyword scoring)",
        "Tier 2: Accessibility Tree + Groq",
        "Tier 3: HTML Context + LLM Re-plan",
        "Tier 4: URL Parameter Fallback",
        "Tier 5: Vision Fallback (Gemini Flash)"
    ]
    for t in tiers:
        pt = tf_eng.add_paragraph()
        pt.text = t
        pt.font.size = Pt(9)
        pt.font.color.rgb = COLOR_GREEN if "-1" in t or "5" in t else COLOR_TEXT_PRIMARY

    # 4. Action & Audit Layer
    act_card = add_card(s4, Inches(10.2), Inches(1.7), Inches(2.3), Inches(4.5))
    tf_act = act_card.text_frame
    tf_act.margin_left = tf_act.margin_right = Inches(0.15)
    tf_act.margin_top = Inches(0.15)
    p_a0 = tf_act.paragraphs[0]
    p_a0.text = "ACTIONS & AUDIT"
    p_a0.font.size = Pt(11)
    p_a0.font.bold = True
    p_a0.font.color.rgb = COLOR_CYAN

    act_list = [
        ("Playwright", "Browser session automation."),
        ("Pywinauto", "Windows native app control."),
        ("Auto-Fix Engine", "6 script repair patterns."),
        ("JSONL Trace", "Step-level execution logs."),
        ("PostgreSQL", "AES-256-GCM encrypted BYOK.")
    ]
    for atitle, adesc in act_list:
        p1 = tf_act.add_paragraph()
        p1.text = atitle
        p1.font.size = Pt(10)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_TEXT_PRIMARY
        p2 = tf_act.add_paragraph()
        p2.text = adesc
        p2.font.size = Pt(8.5)
        p2.font.color.rgb = COLOR_TEXT_MUTED

    # Bottom Tech Stack Banner
    b_banner = add_card(s4, Inches(0.8), Inches(6.35), Inches(11.7), Inches(0.7), bg_color=RGBColor(14, 34, 66))
    tf_bb = b_banner.text_frame
    tf_bb.margin_left = Inches(0.2)
    tf_bb.margin_top = Inches(0.12)
    p_bb = tf_bb.paragraphs[0]
    p_bb.text = "Core Stack: TypeScript, Node.js, Express, Playwright, Python (pywinauto), Next.js, PostgreSQL (Prisma), Electron, Docker Compose."
    p_bb.font.size = Pt(11)
    p_bb.font.color.rgb = COLOR_TEXT_PRIMARY

    # =========================================================================
    # SLIDE 5: USP
    # =========================================================================
    s5 = prs.slides.add_slide(blank_layout)
    apply_slide_background(s5)
    add_header(s5, "Competitive Moat", "It works in tools that have no API")

    # Table of Comparison
    rows = 8
    cols = 5
    table_shape = s5.shapes.add_table(rows, cols, Inches(0.8), Inches(1.7), Inches(11.7), Inches(4.3))
    table = table_shape.table
    table.columns[0].width = Inches(3.3)
    table.columns[1].width = Inches(2.0)
    table.columns[2].width = Inches(2.1)
    table.columns[3].width = Inches(2.1)
    table.columns[4].width = Inches(2.2)

    headers = ["Capability", "Chatbot", "API Integration", "Scripted RPA", "Nexus Teammate"]
    for j, h in enumerate(headers):
        cell = table.cell(0, j)
        cell.fill.solid()
        cell.fill.fore_color.rgb = RGBColor(14, 43, 82)
        p = cell.text_frame.paragraphs[0]
        p.text = h
        p.font.size = Pt(12)
        p.font.bold = True
        p.font.color.rgb = COLOR_CYAN if j == 4 else COLOR_TEXT_PRIMARY

    matrix_data = [
        ("Takes real actions across screens", "No (Answers only)", "Yes", "Yes", "Yes"),
        ("Works without custom APIs", "No", "No (Requires APIs)", "Yes", "Yes"),
        ("Adapts when UI layout changes", "No", "No", "No (Brittle scripts)", "Yes (7-Tier Healing)"),
        ("Pre-execution safety review", "No", "No", "No", "Yes (Safety verdict)"),
        ("Full step-by-step audit trace", "Conversation log", "Partial API logs", "Local log files", "Yes (JSONL trace + DB)"),
        ("Runs unattended on a schedule", "No", "Yes", "Yes", "Yes (Cron DB triggers)"),
        ("Switches providers on failure", "No", "No", "No", "Yes (Automatic failover)")
    ]

    for i, row in enumerate(matrix_data):
        for j, val in enumerate(row):
            cell = table.cell(i + 1, j)
            cell.fill.solid()
            if j == 4:
                cell.fill.fore_color.rgb = RGBColor(16, 48, 92)
            else:
                cell.fill.fore_color.rgb = COLOR_ROW_ALT if i % 2 == 1 else COLOR_CARD
            p = cell.text_frame.paragraphs[0]
            p.text = val
            p.font.size = Pt(11)
            if j == 0:
                p.font.bold = True
                p.font.color.rgb = COLOR_TEXT_PRIMARY
            elif j == 4:
                p.font.bold = True
                p.font.color.rgb = COLOR_CYAN
            elif val.startswith("Yes"):
                p.font.color.rgb = COLOR_GREEN
            elif val.startswith("No"):
                p.font.color.rgb = COLOR_TEXT_MUTED
            else:
                p.font.color.rgb = COLOR_TEXT_MUTED

    # Takeaway Callout Box
    to_box = add_card(s5, Inches(0.8), Inches(6.2), Inches(11.7), Inches(0.8), bg_color=RGBColor(12, 32, 62), border_color=COLOR_CYAN)
    tf_to = to_box.text_frame
    tf_to.margin_left = Inches(0.2)
    tf_to.margin_top = Inches(0.12)
    p_to = tf_to.paragraphs[0]
    p_to.text = "THE CORE DIFFERENCE: RPA breaks when a button moves. Chatbots stop at giving advice. Nexus adapts to screen changes and finishes the job."
    p_to.font.size = Pt(12)
    p_to.font.bold = True
    p_to.font.color.rgb = COLOR_TEXT_PRIMARY

    # =========================================================================
    # SLIDE 6: IMPACT & BENEFITS
    # =========================================================================
    s6 = prs.slides.add_slide(blank_layout)
    apply_slide_background(s6)
    add_header(s6, "Proven Execution & Measured Outcomes", "Proven execution speed with 94.4% support accuracy")

    # Left Container: Historical Benchmark Numbers (106 logged runs)
    hist_card = add_card(s6, Inches(0.8), Inches(1.7), Inches(5.6), Inches(3.8))
    tf_h = hist_card.text_frame
    tf_h.margin_left = tf_h.margin_right = Inches(0.2)
    tf_h.margin_top = Inches(0.15)
    p_h0 = tf_h.paragraphs[0]
    p_h0.text = "HISTORICAL RUNS (GENERAL DESKTOP & WEB TASKS)"
    p_h0.font.size = Pt(10)
    p_h0.font.bold = True
    p_h0.font.color.rgb = COLOR_TEXT_MUTED
    p_h_sub = tf_h.add_paragraph()
    p_h_sub.text = "Measured across 106 logged tasks from repository execution logs:"
    p_h_sub.font.size = Pt(9)
    p_h_sub.font.color.rgb = COLOR_TEXT_MUTED

    # 4 big number tiles on left
    h_metrics = [
        ("106", "Recorded runs in log"),
        ("83.0%", "Fully completed tasks"),
        ("5.0", "Average steps per task"),
        ("70.5s", "Average run duration")
    ]
    for i, (num, label) in enumerate(h_metrics):
        mx = Inches(1.0 + ((i % 2) * 2.6))
        my = Inches(2.4 + ((i // 2) * 1.3))
        mc = add_card(s6, mx, my, Inches(2.4), Inches(1.15), bg_color=RGBColor(24, 48, 86))
        tf_m = mc.text_frame
        tf_m.margin_left = Inches(0.15)
        tf_m.margin_top = Inches(0.1)
        p1 = tf_m.paragraphs[0]
        p1.text = num
        p1.font.size = Pt(26)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_CYAN
        p2 = tf_m.add_paragraph()
        p2.text = label
        p2.font.size = Pt(10)
        p2.font.color.rgb = COLOR_TEXT_MUTED

    # Right Container: Fintech Support Benchmark (18 Tasks on mock console)
    mock_card = add_card(s6, Inches(6.7), Inches(1.7), Inches(5.8), Inches(3.8))
    tf_m = mock_card.text_frame
    tf_m.margin_left = tf_m.margin_right = Inches(0.2)
    tf_m.margin_top = Inches(0.15)
    p_m0 = tf_m.paragraphs[0]
    p_m0.text = "PAYTM TRACK 3 BENCHMARK (MOCK SUPPORT CONSOLE)"
    p_m0.font.size = Pt(10)
    p_m0.font.bold = True
    p_m0.font.color.rgb = COLOR_CYAN
    p_m_sub = tf_m.add_paragraph()
    p_m_sub.text = "18 realistic support operations (disputes, refunds, settlements, duplicate debits, KYC):"
    p_m_sub.font.size = Pt(9)
    p_m_sub.font.color.rgb = COLOR_TEXT_MUTED

    f_metrics = [
        ("94.4%", "Support task success rate (17/18)"),
        ("0.90s", "Average resolution time per task"),
        ("7", "Self-healing recovery events"),
        ("0.20¢", "Average cost per ticket ($0.001995)")
    ]
    for i, (num, label) in enumerate(f_metrics):
        fx = Inches(6.9 + ((i % 2) * 2.7))
        fy = Inches(2.4 + ((i // 2) * 1.3))
        fc = add_card(s6, fx, fy, Inches(2.5), Inches(1.15), bg_color=RGBColor(24, 48, 86), border_color=COLOR_GREEN if i==0 else COLOR_CARD_BORDER)
        tf_f = fc.text_frame
        tf_f.margin_left = Inches(0.15)
        tf_f.margin_top = Inches(0.1)
        p1 = tf_f.paragraphs[0]
        p1.text = num
        p1.font.size = Pt(26)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_GREEN if i==0 else COLOR_CYAN
        p2 = tf_f.add_paragraph()
        p2.text = label
        p2.font.size = Pt(10)
        p2.font.color.rgb = COLOR_TEXT_MUTED

    # Bottom Stakeholder Benefits Strip
    stakeholders = [
        ("FOR CUSTOMERS", "Immediate dispute resolution with zero waiting queues."),
        ("FOR SUPPORT AGENTS", "Eliminates repetitive manual portal lookups entirely."),
        ("FOR PAYTM OPERATIONS", "Reduces cost per resolved ticket at scale.")
    ]
    for i, (stitle, sbenefit) in enumerate(stakeholders):
        bx = Inches(0.8 + (i * 4.0))
        bc = add_card(s6, bx, Inches(5.7), Inches(3.7), Inches(1.3))
        tf_b = bc.text_frame
        tf_b.margin_left = tf_b.margin_right = Inches(0.15)
        tf_b.margin_top = Inches(0.12)
        p1 = tf_b.paragraphs[0]
        p1.text = stitle
        p1.font.size = Pt(11)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_CYAN
        p2 = tf_b.add_paragraph()
        p2.text = sbenefit
        p2.font.size = Pt(12)
        p2.font.color.rgb = COLOR_TEXT_PRIMARY

    # =========================================================================
    # SLIDE 7: BUSINESS MODEL
    # =========================================================================
    s7 = prs.slides.add_slide(blank_layout)
    apply_slide_background(s7)
    add_header(s7, "Commercial Strategy & Viability", "Pay per ticket resolved, not per seat")

    # Simple 3-Step Process Flow
    p_bg = add_card(s7, Inches(0.8), Inches(1.7), Inches(11.7), Inches(1.2), bg_color=RGBColor(14, 38, 72))
    steps_3 = [
        ("1. Ticket Resolved", "Nexus navigates screens and closes dispute."),
        ("2. Outcome Logged", "Step trace and audit evidence recorded."),
        ("3. Micro-Billing Generated", "Platform billed purely on verified resolution.")
    ]
    for i, (t1, t2) in enumerate(steps_3):
        sx = Inches(1.0 + (i * 3.8))
        sc = add_card(s7, sx, Inches(1.85), Inches(3.5), Inches(0.9), bg_color=COLOR_CARD)
        tf_s = sc.text_frame
        tf_s.margin_left = Inches(0.15)
        tf_s.margin_top = Inches(0.08)
        p1 = tf_s.paragraphs[0]
        p1.text = t1
        p1.font.size = Pt(12)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_CYAN
        p2 = tf_s.add_paragraph()
        p2.text = t2
        p2.font.size = Pt(10)
        p2.font.color.rgb = COLOR_TEXT_MUTED

    # Three Strategic Commercial Pillars
    pillars = [
        ("INTERNAL COST SAVINGS", "Paytm Support & Ops", "Directly slashes first-level ticket handling overhead by automating repetitive multi-screen dispute resolutions at ~0.2 cents per execution."),
        ("OUTCOME-BASED PRICING", "Pay Per Success", "Eliminates rigid software seat licensing. Enterprise clients pay strictly for successfully resolved workflows verified in audit traces."),
        ("COMMERCIAL PRODUCT PATH", "External Enterprise Offering", "Package autonomous teammate capability for Paytm payment gateway merchants, partner banks, and NBFC support operations.")
    ]
    for i, (p_tag, p_head, p_desc) in enumerate(pillars):
        px = Inches(0.8 + (i * 4.0))
        pc = add_card(s7, px, Inches(3.1), Inches(3.7), Inches(2.4))
        tf_p = pc.text_frame
        tf_p.margin_left = tf_p.margin_right = Inches(0.2)
        tf_p.margin_top = Inches(0.15)
        p1 = tf_p.paragraphs[0]
        p1.text = p_tag
        p1.font.size = Pt(10)
        p1.font.bold = True
        p1.font.color.rgb = COLOR_CYAN
        p2 = tf_p.add_paragraph()
        p2.text = p_head
        p2.font.size = Pt(14)
        p2.font.bold = True
        p2.font.color.rgb = COLOR_TEXT_PRIMARY
        p3 = tf_p.add_paragraph()
        p3.text = p_desc
        p3.font.size = Pt(11)
        p3.font.color.rgb = COLOR_TEXT_MUTED

    # Paytm Earnings Call Alignment Callout
    ptm_card = add_card(s7, Inches(0.8), Inches(5.7), Inches(11.7), Inches(1.3), bg_color=RGBColor(16, 38, 70), border_color=COLOR_CYAN)
    tf_ptm = ptm_card.text_frame
    tf_ptm.margin_left = Inches(0.25)
    tf_ptm.margin_top = Inches(0.12)
    p_pt1 = tf_ptm.paragraphs[0]
    p_pt1.text = "STRATEGIC ALIGNMENT: PAYTM INTERNAL AI COMMERCIALIZATION INITIATIVE"
    p_pt1.font.size = Pt(10)
    p_pt1.font.bold = True
    p_pt1.font.color.rgb = COLOR_CYAN
    p_pt2 = tf_ptm.add_paragraph()
    p_pt2.text = "On its Q1 earnings call, Paytm stated plans to package internal AI tools in merchant support, acquisition, and business automation for external customers. (Source: CXO Digital Pulse)"
    p_pt2.font.size = Pt(12)
    p_pt2.font.color.rgb = COLOR_TEXT_PRIMARY
    p_pt3 = tf_ptm.add_paragraph()
    p_pt3.text = "Unit Economics Benchmark: [Cost per ticket today: Rs 25 to 45 (industry average) vs Cost with Nexus: Rs 0.16 compute cost]"
    p_pt3.font.size = Pt(10)
    p_pt3.font.color.rgb = COLOR_GREEN

    # Save Presentation
    output_path = "nexus_teammate_pitch_deck.pptx"
    prs.save(output_path)
    print(f"Presentation saved successfully to: {output_path}")

if __name__ == "__main__":
    create_deck()
