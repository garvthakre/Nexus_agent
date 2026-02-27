"""
desktop_agent.py
────────────────────────────────────────────────────────────────────────────────
Windows Desktop GUI Automation Agent using pywinauto + Win32 APIs.

Usage:
  python desktop_agent.py find_window   <app_name> [--timeout 10]
  python desktop_agent.py click         <app_name> <element_name>
  python desktop_agent.py type          <app_name> <element_name> <text>
  python desktop_agent.py focus_window  <app_name>
  python desktop_agent.py list_elements <app_name>

Output: JSON to stdout
  { "success": true,  "message": "..." }
  { "success": false, "error": "..." }
────────────────────────────────────────────────────────────────────────────────
"""

import sys
import json
import time
import argparse

# ─── Output helpers ───────────────────────────────────────────────────────────

def ok(message: str, **extra):
    print(json.dumps({"success": True, "message": message, **extra}))
    sys.exit(0)

def fail(error: str, **extra):
    print(json.dumps({"success": False, "error": error, **extra}))
    sys.exit(1)

# ─── Import pywinauto ─────────────────────────────────────────────────────────

try:
    from pywinauto import Application, Desktop
    from pywinauto.findwindows import ElementNotFoundError, find_windows
    from pywinauto.keyboard import send_keys
except ImportError:
    fail("pywinauto not installed. Run: pip install pywinauto")

# ─── Fuzzy window finder ──────────────────────────────────────────────────────

def normalise(s: str) -> str:
    return s.lower().replace(" ", "").replace("-", "").replace("_", "")

def fuzzy_score(query: str, candidate: str) -> int:
    q = normalise(query)
    c = normalise(candidate)
    if c == q:            return 100
    if c.startswith(q):  return 80
    if q in c:           return 60
    if c in q:           return 50
    overlap = sum(1 for ch in q if ch in c)
    return int((overlap / max(len(q), 1)) * 30)

def find_window_handle(app_name: str, timeout: int = 10):
    """
    Try to find a window matching app_name.
    Returns (pywinauto Application, window) or raises.
    """
    deadline = time.time() + timeout

    while time.time() < deadline:
        # Get all top-level windows
        desktop = Desktop(backend="uia")
        windows = desktop.windows()

        best_score = 0
        best_win = None

        for win in windows:
            try:
                title = win.window_text()
                class_name = win.class_name()
                score = max(fuzzy_score(app_name, title), fuzzy_score(app_name, class_name))
                if score > best_score:
                    best_score = score
                    best_win = win
            except Exception:
                continue

        if best_win and best_score >= 40:
            try:
                app = Application(backend="uia").connect(handle=best_win.handle)
                return app, best_win
            except Exception:
                pass

        time.sleep(0.8)

    fail(f'Window not found for "{app_name}" after {timeout}s. Is the app open?')

# ─── Element finder (tiered) ──────────────────────────────────────────────────

def find_element(window, element_name: str):
    """
    Try multiple strategies to find a UI element by name.
    Returns the element or raises.
    """
    name_lower = element_name.lower()

    # Tier 0: exact title/name match
    try:
        return window.child_window(title=element_name, control_type="Edit")
    except Exception:
        pass

    try:
        return window.child_window(title=element_name)
    except Exception:
        pass

    # Tier 1: auto_id match
    try:
        return window.child_window(auto_id=element_name)
    except Exception:
        pass

    # Tier 2: fuzzy scan of all descendants
    try:
        descendants = window.descendants()
        best_score = 0
        best_el = None
        for el in descendants:
            try:
                title = el.window_text() or ""
                auto_id = el.automation_id() if hasattr(el, 'automation_id') else ""
                ctrl_type = el.element_info.control_type if hasattr(el, 'element_info') else ""

                score = max(
                    fuzzy_score(element_name, title),
                    fuzzy_score(element_name, auto_id),
                    fuzzy_score(element_name, str(ctrl_type)),
                )

                if score > best_score:
                    best_score = score
                    best_el = el
            except Exception:
                continue

        if best_el and best_score >= 40:
            return best_el
    except Exception:
        pass

    # Tier 3: keyboard shortcut fallbacks for common element names
    KEYBOARD_SHORTCUTS = {
        "search":   "^f",      # Ctrl+F
        "find":     "^f",
        "address":  "%d",      # Alt+D (browser address bar)
        "url":      "%d",
        "new tab":  "^t",
        "refresh":  "{F5}",
        "back":     "%{LEFT}",
        "forward":  "%{RIGHT}",
    }
    shortcut = KEYBOARD_SHORTCUTS.get(name_lower)
    if shortcut:
        return ("__keyboard__", shortcut)

    raise ElementNotFoundError(f'Element "{element_name}" not found in window')

# ─── Commands ─────────────────────────────────────────────────────────────────

def cmd_find_window(app_name: str, timeout: int):
    app, win = find_window_handle(app_name, timeout)
    title = win.window_text()
    ok(f'Found window: "{title}"', title=title)

def cmd_focus_window(app_name: str):
    app, win = find_window_handle(app_name, timeout=5)
    try:
        win.set_focus()
        time.sleep(0.3)
        ok(f'Focused window: "{win.window_text()}"')
    except Exception as e:
        fail(f"Could not focus window: {e}")

def cmd_click(app_name: str, element_name: str):
    app, win = find_window_handle(app_name, timeout=10)
    try:
        win.set_focus()
        time.sleep(0.3)
    except Exception:
        pass

    el = find_element(win, element_name)

    # Keyboard shortcut fallback
    if isinstance(el, tuple) and el[0] == "__keyboard__":
        send_keys(el[1])
        time.sleep(0.3)
        ok(f'Sent keyboard shortcut for "{element_name}": {el[1]}', strategy="keyboard")
        return

    try:
        el.set_focus()
        time.sleep(0.1)
        el.click_input()
        time.sleep(0.3)
        ok(f'Clicked "{element_name}"', strategy="click_input")
    except Exception:
        try:
            el.click()
            time.sleep(0.3)
            ok(f'Clicked "{element_name}"', strategy="click")
        except Exception as e2:
            fail(f'Could not click "{element_name}": {e2}')

def cmd_type(app_name: str, element_name: str, text: str):
    app, win = find_window_handle(app_name, timeout=10)
    try:
        win.set_focus()
        time.sleep(0.3)
    except Exception:
        pass

    el = find_element(win, element_name)

    # Keyboard shortcut: focus the field first, then type
    if isinstance(el, tuple) and el[0] == "__keyboard__":
        send_keys(el[1])
        time.sleep(0.4)
        send_keys(text, with_spaces=True)
        time.sleep(0.2)
        ok(f'Typed into "{element_name}" via keyboard shortcut', strategy="keyboard+type")
        return

    try:
        el.set_focus()
        time.sleep(0.1)
        try:
            el.click_input()
            time.sleep(0.1)
        except Exception:
            pass
        # Try set_edit_text first (fastest, works for Edit controls)
        try:
            el.set_edit_text(text)
            time.sleep(0.2)
            ok(f'Typed into "{element_name}"', strategy="set_edit_text")
            return
        except Exception:
            pass
        # Fall back to type_keys
        el.type_keys(text, with_spaces=True)
        time.sleep(0.2)
        ok(f'Typed into "{element_name}"', strategy="type_keys")
    except Exception as e:
        # Last resort: focus window and use send_keys
        try:
            send_keys(text, with_spaces=True)
            ok(f'Typed via send_keys fallback', strategy="send_keys")
        except Exception as e2:
            fail(f'Could not type into "{element_name}": {e2}')

def cmd_list_elements(app_name: str):
    app, win = find_window_handle(app_name, timeout=5)
    elements = []
    try:
        for el in win.descendants():
            try:
                title = el.window_text() or ""
                ctrl_type = ""
                auto_id = ""
                try:
                    ctrl_type = str(el.element_info.control_type)
                except Exception:
                    pass
                try:
                    auto_id = el.automation_id() or ""
                except Exception:
                    pass
                if title or auto_id:
                    elements.append({
                        "title": title[:60],
                        "control_type": ctrl_type,
                        "auto_id": auto_id[:60],
                    })
            except Exception:
                continue
    except Exception as e:
        fail(f"Could not list elements: {e}")
    ok(f"Found {len(elements)} elements", elements=elements[:80])

# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Desktop GUI automation agent")
    parser.add_argument("command", choices=["find_window", "click", "type", "focus_window", "list_elements"])
    parser.add_argument("app_name")
    parser.add_argument("element_name", nargs="?", default="")
    parser.add_argument("text", nargs="?", default="")
    parser.add_argument("--timeout", type=int, default=10)
    args = parser.parse_args()

    if args.command == "find_window":
        cmd_find_window(args.app_name, args.timeout)
    elif args.command == "focus_window":
        cmd_focus_window(args.app_name)
    elif args.command == "click":
        if not args.element_name:
            fail("element_name required for click command")
        cmd_click(args.app_name, args.element_name)
    elif args.command == "type":
        if not args.element_name:
            fail("element_name required for type command")
        cmd_type(args.app_name, args.element_name, args.text)
    elif args.command == "list_elements":
        cmd_list_elements(args.app_name)

if __name__ == "__main__":
    main()