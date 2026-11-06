"""
Bridge watchdog: starts bridge.py, restarts it whenever it dies,
and reports status to a local file the site can read.
Run once (double-click start-bridge.bat or: python bridge/watchdog.py)
and the bridge stays up across crashes.
"""
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "bridge", "bridge.py")
STATUS = os.path.join(ROOT, "bridge", "watchdog_status.json")
ENV = os.environ.copy()
ENV.setdefault("BRIDGE_CLIENT_ID", "0000")

# Prefer the system python the bridge deps live in
CANDIDATES = [
    r"C:\Users\rio_j\AppData\Local\Python\pythoncore-3.14-64\python.exe",
    sys.executable,
]


def write_status(state, pid, restarts, last_exit):
    import json
    try:
        with open(STATUS, "w") as f:
            json.dump({
                "state": state,
                "pid": pid,
                "restarts": restarts,
                "last_exit_code": last_exit,
                "updated": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }, f)
    except Exception:
        pass



import socket

def bridge_alive():
    """If something is already serving on 5001, another supervisor may own it."""
    try:
        s = socket.create_connection(("127.0.0.1", int(os.environ.get("BRIDGE_PORT", "5001"))), timeout=2)
        s.close()
        return True
    except Exception:
        return False

def main():
    python = next((p for p in CANDIDATES if os.path.exists(p)), sys.executable)
    restarts = 0
    last_exit = None
    print(f"[watchdog] starting bridge supervisor (python={python})")
    if bridge_alive():
        print("[watchdog] bridge already alive on 5001 - exiting (Task Scheduler will re-check)")
        write_status("already-running", None, restarts, last_exit)
        return
    while True:
        proc = subprocess.Popen(
            [python, BRIDGE],
            cwd=ROOT,
            env=ENV,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        write_status("running", proc.pid, restarts, last_exit)
        code = proc.wait()
        last_exit = code
        restarts += 1
        write_status("crashed", None, restarts, last_exit)
        print(f"[watchdog] bridge exited code={code}; restarting in 3s (restart #{restarts})")
        time.sleep(3)


if __name__ == "__main__":
    main()
