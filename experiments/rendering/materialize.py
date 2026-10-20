"""Create isolated, reproducible renderer prototypes; never edits the checkout.
Usage: python3 experiments/rendering/materialize.py tiles|svg|gpu|combined-svg|combined-gpu DEST
Requires git and patch. Baseline is fixed to the measured repository commit.
"""
from pathlib import Path
import subprocess,sys,tempfile
kind,destination=sys.argv[1:]
if kind not in ['tiles','svg','gpu','combined-svg','combined-gpu','retained','combined-retained','prefix','combined-prefix','unified','combined-unified','no-msaa','no-stencil']: raise SystemExit('Unknown prototype')
dest=Path(destination).resolve()
if dest.exists(): raise SystemExit('Destination must not exist')
dest.mkdir(parents=True)
source=Path(__file__).resolve().parent
root=source.parent.parent
base='f49fc0d83998fde4916f1881a66d5e6b7b74bd13'
for name in ['index.html','trace-renderer.js','replay-core.js','session-codec.js']:
 (dest/name).write_bytes(subprocess.check_output(['git','show',base+':'+name],cwd=root))
renderer=kind.removeprefix('combined-')
if renderer in ['no-msaa','no-stencil']:renderer='prefix'
patch='gpu' if renderer in ['retained','prefix'] else renderer
subprocess.run(['patch','-p1','-i',str(source/(patch+'.patch'))],cwd=dest,check=True)
if renderer in ['gpu','retained','prefix','unified']:(dest/'gpu-overlay.js').write_bytes((source/(renderer+'-overlay.js' if renderer in ['retained','prefix','unified'] else 'gpu-overlay.js')).read_bytes())
if renderer=='svg':(dest/'svg-adapter.js').write_bytes((source/'svg-adapter.js').read_bytes())
if kind.startswith('combined-') or kind in ['no-msaa','no-stencil']:
 with tempfile.TemporaryDirectory(prefix='ocm-tiles-materialize-') as scratch:
  tile_dir=Path(scratch)
  (tile_dir/'index.html').write_bytes(subprocess.check_output(['git','show',base+':index.html'],cwd=root))
  subprocess.run(['patch','-p1','-i',str(source/'tiles.patch')],cwd=tile_dir,check=True)
  t=(tile_dir/'index.html').read_text();s=(dest/'index.html').read_text()
  a=s.index('const VS = `');b=s.index('try { buildProgram(); }',a)
  s=s[:a]+t[t.index('// Background shading'):t.index('try { buildProgram(); }')]+s[b:]
  a=s.index('    gl.viewport(0, 0, c.width, c.height);\n    gl.useProgram(prog);');b=s.index('\n  drawReplayLayer();',a)
  ta=t.index('    gl.viewport(0, 0, c.width, c.height);\n    gl.bindBuffer(gl.ARRAY_BUFFER,quadBuf);');tb=t.index('\n  drawReplayLayer();',ta)
  (dest/'index.html').write_text(s[:a]+t[ta:tb]+s[b:])
if kind in ['no-msaa','no-stencil']:
 p=dest/'gpu-overlay.js';s=p.read_text()
 s=s.replace('antialias:true','antialias:false') if kind=='no-msaa' else s.replace('this.accurateStrokes=true','this.accurateStrokes=false')
 p.write_text(s)
print(dest)
