#!/usr/bin/env python3
# CORS verification that MIRRORS THE REAL CLIENT (round-2 fix for the false-green).
# The browser preflight lists every non-safelisted header the client will send; the
# round-1 probe asserted only x-worker-id and never sent x-factory-id (the header the
# pinAwareFetch wrapper actually injects, src/lib/supabase.ts:15) → it stayed green
# while the live PIN upload's preflight was rejected for x-factory-id. This probe sends
# the FULL derived client set and asserts the response Allow-Headers covers EVERY one.
import subprocess, re
BASE="https://joryoadrvisizkkspuov.supabase.co/functions/v1"
PROD="https://tpm-fulcrum.pages.dev"; EVIL="https://evil.example.com"
ANON=re.search(r'VITE_SUPABASE_ANON_KEY=(\S+)', open('.env').read()).group(1)
FNS=["validate-kaizen-image","validate-opl-image","translate-content","sign-url"]
# Derived from pinAwareFetch (x-factory-id, x-worker-id) + supabase-js functions.invoke
# (authorization, apikey, content-type, x-client-info). This is what a real PIN upload sends.
CLIENT_HEADERS=["authorization","apikey","content-type","x-client-info","x-factory-id","x-worker-id"]
ACRH=",".join(CLIENT_HEADERS)

def headers(args):
    p=subprocess.run(["curl","-s","-D","-","-o","/dev/null",*args],capture_output=True,text=True)
    h={}
    for line in p.stdout.splitlines():
        if line.startswith('HTTP'): h['_status']=(line.split()+['?'])[1]
        elif ':' in line: k,v=line.split(':',1); h[k.strip().lower()]=v.strip()
    return h

results=[]
def check(label,cond,got=""):
    results.append(cond); print(f"{'PASS' if cond else 'FAIL'}  {label}  {('· '+got) if not cond else ''}")

for fn in FNS:
    url=f"{BASE}/{fn}"
    h=headers(["-X","OPTIONS",url,"-H",f"Origin: {PROD}","-H","Access-Control-Request-Method: POST","-H",f"Access-Control-Request-Headers: {ACRH}"])
    allow=(h.get('access-control-allow-headers') or '').lower()
    check(f"{fn}: preflight 204", h.get('_status')=='204', h.get('_status',''))
    check(f"{fn}: ACAO echoes prod", h.get('access-control-allow-origin')==PROD, h.get('access-control-allow-origin',''))
    check(f"{fn}: ACAM has POST", 'POST' in (h.get('access-control-allow-methods') or ''), h.get('access-control-allow-methods',''))
    missing=[x for x in CLIENT_HEADERS if x not in allow]
    check(f"{fn}: Allow-Headers covers ALL client headers (incl x-factory-id)", not missing, f"missing {missing} · allow='{allow}'")
    he=headers(["-X","OPTIONS",url,"-H",f"Origin: {EVIL}","-H","Access-Control-Request-Method: POST","-H",f"Access-Control-Request-Headers: {ACRH}"])
    check(f"{fn}: disallowed origin NOT echoed", he.get('access-control-allow-origin')!=EVIL, he.get('access-control-allow-origin',''))
    hp=headers(["-X","POST",url,"-H",f"Origin: {PROD}","-H","Content-Type: application/json","-H",f"apikey: {ANON}","-H",f"Authorization: Bearer {ANON}","-H",f"x-factory-id: x","-H","x-worker-id: x","-d","{}"])
    check(f"{fn}: POST response ACAO=prod", hp.get('access-control-allow-origin')==PROD, hp.get('access-control-allow-origin',''))

import sys
print(f"\n{sum(results)}/{len(results)} PASS", "ALL GREEN" if all(results) else "FAILURES")
sys.exit(0 if all(results) else 1)
