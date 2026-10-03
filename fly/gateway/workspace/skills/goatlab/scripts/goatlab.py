"""Portable entrypoint: python3 <skill>/scripts/goatlab.py <command>."""
import runpy
import sys
from pathlib import Path
scripts = Path(__file__).resolve().parent
sys.path.insert(0, str(scripts))
runpy.run_path(str(scripts / 'workflow.py'), run_name='__main__')
