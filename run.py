"""Launcher: `python3 -I run.py fetch|build` (-I drops cwd from sys.path, so add the repo root)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "fetch":
        from pipeline.fetch import main
    elif cmd == "build":
        from pipeline.build import main
    else:
        sys.exit("usage: python3 -I run.py fetch|build")
    sys.exit(main() or 0)
