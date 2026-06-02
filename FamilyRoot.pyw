"""
FamilyRoot Launcher
Double-click to open. Requires Python 3.9+ (no other dependencies).
Works on Windows, Mac, and Linux.
"""

import os
import sys
import subprocess
import threading
import webbrowser
import tkinter as tk
from tkinter import ttk, font as tkfont
from pathlib import Path

# ── paths ─────────────────────────────────────────────────────────────────────

ROOT     = Path(__file__).parent.resolve()
BACKEND  = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV     = ROOT / "venv"
DATA     = ROOT / "data"
MEDIA    = ROOT / "media"
PORT     = 5050
URL      = f"http://localhost:{PORT}"

if sys.platform == "win32":
    VENV_PYTHON = VENV / "Scripts" / "python.exe"
    VENV_PIP    = VENV / "Scripts" / "pip.exe"
else:
    VENV_PYTHON = VENV / "bin" / "python"
    VENV_PIP    = VENV / "bin" / "pip"

# ── colour palette (matches the web app) ─────────────────────────────────────

BG        = "#1A1916"
BG2       = "#222220"
BG3       = "#2A2926"
ACCENT    = "#1D9E75"
ACCENT2   = "#178860"
RED       = "#C0392B"
AMBER     = "#E67E22"
TEXT      = "#F0EDE4"
TEXT2     = "#9E9B91"
BORDER    = "#3A3835"


# ── main window ───────────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("FamilyRoot")
        self.configure(bg=BG)
        self.resizable(True, True)
        self.minsize(560, 440)

        # Try to set a nice window size centred on screen
        w, h = 620, 540
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        self.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")

        # Icon (tree emoji as window title — real icon would need a .ico file)
        self.title("🌳 FamilyRoot")

        self._server_proc = None
        self._installing  = False

        self._build_ui()
        self._refresh_status()

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ── UI construction ───────────────────────────────────────────────────────

    def _build_ui(self):
        # ── header ──────────────────────────────────────────────────────────
        hdr = tk.Frame(self, bg=BG2, pady=14)
        hdr.pack(fill="x")

        tk.Label(hdr, text="🌳", font=("Segoe UI Emoji", 24), bg=BG2, fg=TEXT).pack(side="left", padx=(20, 8))
        title_frame = tk.Frame(hdr, bg=BG2)
        title_frame.pack(side="left")
        tk.Label(title_frame, text="FamilyRoot",
                 font=("Segoe UI", 16, "bold"), bg=BG2, fg=TEXT).pack(anchor="w")
        tk.Label(title_frame, text="Local family history database",
                 font=("Segoe UI", 9), bg=BG2, fg=TEXT2).pack(anchor="w")

        # ── status bar ───────────────────────────────────────────────────────
        status_frame = tk.Frame(self, bg=BG3, pady=10, padx=20)
        status_frame.pack(fill="x")

        self._dot   = tk.Label(status_frame, text="●", font=("Segoe UI", 14),
                               bg=BG3, fg=TEXT2)
        self._dot.pack(side="left")

        self._status_lbl = tk.Label(status_frame, text="Stopped",
                                    font=("Segoe UI", 10, "bold"), bg=BG3, fg=TEXT2)
        self._status_lbl.pack(side="left", padx=(6, 16))

        self._url_lbl = tk.Label(status_frame, text=URL,
                                 font=("Segoe UI", 9), bg=BG3, fg=TEXT2,
                                 cursor="hand2")
        self._url_lbl.pack(side="left")
        self._url_lbl.bind("<Button-1>", lambda _: webbrowser.open(URL))

        self._open_btn = tk.Button(
            status_frame, text="Open in browser",
            font=("Segoe UI", 9), bg=BG2, fg=TEXT2,
            relief="flat", bd=0, padx=10, pady=4,
            cursor="hand2", activebackground=BG3, activeforeground=TEXT,
            command=lambda: webbrowser.open(URL),
        )
        self._open_btn.pack(side="right")

        # ── separator ─────────────────────────────────────────────────────────
        tk.Frame(self, bg=BORDER, height=1).pack(fill="x")

        # ── action buttons ────────────────────────────────────────────────────
        btn_frame = tk.Frame(self, bg=BG, pady=16, padx=20)
        btn_frame.pack(fill="x")

        self._install_btn = _Button(
            btn_frame, text="⬇  Install / Update",
            color=AMBER, command=self._run_install,
        )
        self._install_btn.pack(side="left", padx=(0, 10))

        self._start_btn = _Button(
            btn_frame, text="▶  Start server",
            color=ACCENT, command=self._start_server,
        )
        self._start_btn.pack(side="left", padx=(0, 10))

        self._stop_btn = _Button(
            btn_frame, text="■  Stop",
            color=RED, command=self._stop_server,
            enabled=False,
        )
        self._stop_btn.pack(side="left")

        # ── separator ─────────────────────────────────────────────────────────
        tk.Frame(self, bg=BORDER, height=1).pack(fill="x")

        # ── log area ─────────────────────────────────────────────────────────
        log_hdr = tk.Frame(self, bg=BG2, pady=6, padx=20)
        log_hdr.pack(fill="x")
        tk.Label(log_hdr, text="Log", font=("Segoe UI", 9, "bold"),
                 bg=BG2, fg=TEXT2).pack(side="left")
        tk.Button(log_hdr, text="Clear", font=("Segoe UI", 8),
                  bg=BG2, fg=TEXT2, relief="flat", bd=0,
                  cursor="hand2", activebackground=BG3,
                  command=self._clear_log).pack(side="right")

        self._log = tk.Text(
            self, bg=BG, fg="#A8C5A0",
            font=("Consolas" if sys.platform == "win32" else "Menlo", 9),
            relief="flat", bd=0, padx=16, pady=10,
            state="disabled", wrap="word",
            insertbackground=TEXT, selectbackground=ACCENT,
        )
        self._log.pack(fill="both", expand=True)

        scroll = tk.Scrollbar(self._log, command=self._log.yview, bg=BG2)
        self._log.configure(yscrollcommand=scroll.set)

        # Colour tags for log lines
        self._log.tag_config("info",    foreground="#A8C5A0")
        self._log.tag_config("success", foreground=ACCENT)
        self._log.tag_config("warn",    foreground=AMBER)
        self._log.tag_config("error",   foreground=RED)
        self._log.tag_config("server",  foreground="#7EC8E3")
        self._log.tag_config("dim",     foreground=TEXT2)

        # ── bottom padding ────────────────────────────────────────────────────
        tk.Frame(self, bg=BG, height=4).pack(fill="x")

    # ── logging ───────────────────────────────────────────────────────────────

    def _log_line(self, text, tag="info"):
        self._log.configure(state="normal")
        self._log.insert("end", text + "\n", tag)
        self._log.see("end")
        self._log.configure(state="disabled")

    def _clear_log(self):
        self._log.configure(state="normal")
        self._log.delete("1.0", "end")
        self._log.configure(state="disabled")

    # ── status refresh ────────────────────────────────────────────────────────

    def _refresh_status(self):
        running = self._server_proc is not None and self._server_proc.poll() is None
        if running:
            self._dot.configure(fg=ACCENT)
            self._status_lbl.configure(text="Running", fg=ACCENT)
            self._url_lbl.configure(fg=ACCENT)
            self._start_btn.set_enabled(False)
            self._stop_btn.set_enabled(True)
            self._open_btn.configure(fg=ACCENT)
        else:
            self._dot.configure(fg=TEXT2)
            self._status_lbl.configure(text="Stopped", fg=TEXT2)
            self._url_lbl.configure(fg=TEXT2)
            self._start_btn.set_enabled(not self._installing)
            self._stop_btn.set_enabled(False)
            self._open_btn.configure(fg=TEXT2)
            if self._server_proc is not None:
                self._server_proc = None

        self.after(1000, self._refresh_status)

    # ── install ───────────────────────────────────────────────────────────────

    def _run_install(self):
        if self._installing:
            return
        self._installing = True
        self._install_btn.set_enabled(False)
        self._start_btn.set_enabled(False)
        threading.Thread(target=self._install_worker, daemon=True).start()

    def _install_worker(self):
        self._log_line("-- Install / Update ---------------------", "dim")

        # Dirs
        for d in [DATA, MEDIA / "originals", MEDIA / "thumbnails"]:
            d.mkdir(parents=True, exist_ok=True)

        # Check available disk space (need at least 500 MB)
        import shutil as _shutil
        free_mb = _shutil.disk_usage(ROOT).free // (1024 * 1024)
        if free_mb < 500:
            self._log_line(f"WARNING: only {free_mb} MB free on this drive.", "warn")
            self._log_line("pip needs ~300 MB of temp space to download packages.", "warn")
            self._log_line("Free up space on your C: drive and try again.", "error")
            self._install_done()
            return
        self._log_line(f"Disk space OK: {free_mb} MB free", "dim")

        # Venv
        if not VENV_PYTHON.exists():
            self._log_line("Creating Python virtual environment...")
            ok = self._run_cmd([sys.executable, "-m", "venv", str(VENV)])
            if not ok:
                self._log_line("Failed to create venv.", "error")
                self._install_done()
                return
            self._log_line("Virtual environment created.", "success")
        else:
            self._log_line("Virtual environment already exists.", "dim")

        # pip — use --no-cache-dir so pip doesn't buffer whole packages to
        # the temp drive (the cause of "No space left on device" on full disks)
        self._log_line("Installing Python dependencies...")
        self._run_cmd([str(VENV_PYTHON), "-m", "pip", "install",
                       "--upgrade", "pip", "--no-cache-dir", "-q"])
        ok = self._run_cmd([str(VENV_PYTHON), "-m", "pip", "install",
                            "--no-cache-dir",
                            "-r", str(BACKEND / "requirements.txt"), "-q"])
        if ok:
            self._log_line("Python dependencies installed.", "success")
        else:
            self._log_line("Some packages failed (face AI is optional on Windows).", "warn")
            self._log_line("Core features (photos, Gramps, map) still work.", "warn")

        # Node / frontend
        dist_index = FRONTEND / "dist" / "index.html"
        if dist_index.exists():
            self._log_line("Frontend already built -- skipping.", "dim")
        else:
            node = self._find_exe("node")
            npm  = self._find_exe("npm")
            if node and npm:
                self._log_line("Installing Node dependencies...")
                self._run_cmd([npm, "install", "--prefer-offline"], cwd=FRONTEND)

                self._log_line("Building React frontend...")
                # Call vite from node_modules directly -- avoids npx
                # downloading a different vite version than the project uses
                vite_cmd = FRONTEND / "node_modules" / ".bin" / "vite.cmd"
                vite_sh  = FRONTEND / "node_modules" / ".bin" / "vite"
                if vite_cmd.exists():
                    ok = self._run_cmd([str(vite_cmd), "build"], cwd=FRONTEND)
                elif vite_sh.exists():
                    ok = self._run_cmd([str(vite_sh), "build"], cwd=FRONTEND)
                else:
                    self._log_line("  vite not found in node_modules -- npm install may have failed", "error")
                    ok = False

                if ok and dist_index.exists():
                    self._log_line("Frontend built successfully.", "success")
                else:
                    self._log_line("Frontend build failed -- UI may not load.", "warn")
            else:
                self._log_line("Node.js not found -- skipping frontend build.", "warn")
                self._log_line("Get it from https://nodejs.org then re-run Install.", "warn")

        self._log_line("Install complete.", "success")
        self._install_done()

    def _install_done(self):
        self._installing = False
        self._install_btn.set_enabled(True)
        self._start_btn.set_enabled(self._server_proc is None)

    # ── start / stop ──────────────────────────────────────────────────────────

    def _start_server(self):
        if self._server_proc and self._server_proc.poll() is None:
            return
        if not VENV_PYTHON.exists():
            self._log_line("Not installed yet — click Install / Update first.", "warn")
            return

        self._log_line("── Starting server ──────────────────────", "dim")

        env = os.environ.copy()
        env["PORT"]             = str(PORT)
        env["DEBUG"]            = "0"
        env["FAMILYROOT_MEDIA"] = str(MEDIA)

        kwargs = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW

        try:
            self._server_proc = subprocess.Popen(
                [str(VENV_PYTHON), "app.py"],
                cwd=str(BACKEND),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                **kwargs,
            )
        except Exception as e:
            self._log_line(f"Failed to start: {e}", "error")
            return

        self._log_line(f"Server started — {URL}", "success")
        threading.Thread(target=self._tail_server, daemon=True).start()

        # Open browser after short delay
        self.after(1800, lambda: webbrowser.open(URL))

    def _tail_server(self):
        """Stream server stdout into the log widget."""
        try:
            for line in self._server_proc.stdout:
                line = line.rstrip()
                if not line:
                    continue
                tag = "server"
                low = line.lower()
                if "error" in low or "traceback" in low:
                    tag = "error"
                elif "warning" in low:
                    tag = "warn"
                self._log_line(line, tag)
        except Exception:
            pass
        if self._server_proc:
            self._log_line("Server process ended.", "dim")

    def _stop_server(self):
        if self._server_proc and self._server_proc.poll() is None:
            self._log_line("Stopping server…", "dim")
            self._server_proc.terminate()
            try:
                self._server_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._server_proc.kill()
            self._log_line("Server stopped.", "warn")
        self._server_proc = None

    # ── helpers ───────────────────────────────────────────────────────────────

    def _run_cmd(self, cmd, cwd=None):
        """Run a command, stream output to log, return True on success."""
        kwargs = {}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        try:
            proc = subprocess.Popen(
                [str(c) for c in cmd],
                cwd=str(cwd or ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True, bufsize=1,
                **kwargs,
            )
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    self._log_line("  " + line, "dim")
            proc.wait()
            return proc.returncode == 0
        except FileNotFoundError as e:
            self._log_line(f"  Command not found: {e}", "error")
            return False

    @staticmethod
    def _find_exe(name):
        """Find an executable on PATH, return full path or None."""
        import shutil
        return shutil.which(name)

    def _on_close(self):
        self._stop_server()
        self.destroy()


# ── reusable styled button ────────────────────────────────────────────────────

class _Button(tk.Button):
    def __init__(self, parent, text, color, command, enabled=True):
        self._color   = color
        self._enabled = enabled
        super().__init__(
            parent,
            text=text,
            font=("Segoe UI", 10),
            bg=color if enabled else BG3,
            fg=TEXT if enabled else TEXT2,
            relief="flat", bd=0,
            padx=16, pady=8,
            cursor="hand2" if enabled else "arrow",
            activebackground=color,
            activeforeground=TEXT,
            command=command,
        )

    def set_enabled(self, enabled: bool):
        self._enabled = enabled
        self.configure(
            state="normal"  if enabled else "disabled",
            bg=self._color  if enabled else BG3,
            fg=TEXT         if enabled else TEXT2,
            cursor="hand2"  if enabled else "arrow",
        )


# ── entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = App()
    # Log a welcome line
    app._log_line("Welcome to FamilyRoot!", "success")

    installed = VENV_PYTHON.exists()
    if installed:
        app._log_line("Installation found — click ▶ Start server to begin.", "info")
    else:
        app._log_line("Not installed yet — click ⬇ Install / Update to set up.", "warn")

    app.mainloop()
