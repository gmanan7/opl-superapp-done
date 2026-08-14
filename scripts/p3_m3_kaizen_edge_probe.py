#!/usr/bin/env python3
import json, subprocess, re, uuid, base64
APP="https://joryoadrvisizkkspuov.supabase.co"
FN=f"{APP}/functions/v1/validate-kaizen-image"
MGMT="https://api.supabase.com/v1/projects/joryoadrvisizkkspuov/database/query"
ANON=re.search(r'VITE_SUPABASE_ANON_KEY=(\S+)', open('.env').read()).group(1)
TOKEN=subprocess.run("security find-generic-password -s 'Supabase CLI' -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d",shell=True,capture_output=True,text=True).stdout.strip()
NPF="00000000-0000-0000-0000-000000000001"; PRINT="00000002-0000-0000-0000-000000000001"
F1="2fa59bb8-2de1-4b91-9a7f-52913ee856fb"; F2="62ba0c25-8978-4ad4-8f45-6c3bd0c47a51"
KZ=str(uuid.uuid4())
PNG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
BAD=base64.b64encode(b"this is definitely not an image, just plain text content").decode()

def mgmt(sql):
    subprocess.run(["curl","-s","-X","POST",MGMT,"-H",f"Authorization: Bearer {TOKEN}","-H","Content-Type: application/json","-d",json.dumps({"query":sql})],capture_output=True,text=True)
def S(s): return "'"+str(s).replace("'","''")+"'"

# seed a draft kaizen owned by F1
mgmt(f"INSERT INTO kaizen (id,factory_id,jh_group_id,title,status,submitted_by) VALUES ({S(KZ)},{S(NPF)},{S(PRINT)},'ZZ_M3_IMG','draft',{S(F1)}) ON CONFLICT (id) DO UPDATE SET status='draft';")

def call(worker_id, filename, b64, slot="before"):
    h=["-H",f"apikey: {ANON}","-H",f"Authorization: Bearer {ANON}","-H","Content-Type: application/json"]
    if worker_id: h+=["-H",f"x-worker-id: {worker_id}"]
    body=json.dumps({"kaizen_id":KZ,"slot":slot,"filename":filename,"data_base64":b64})
    p=subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code}",*( ["-X","POST",FN]+h+["-d",body])],capture_output=True,text=True)
    return p.stdout.strip()

results=[]
def check(label, got, expect):
    ok=str(got)==str(expect); results.append(ok); print(f"{'PASS' if ok else 'FAIL'}  {label}  (got {got}, want {expect})")

check("E1 no identity → 401", call(None, "before.png", PNG), 401)
check("E2 not-author (F2) → 403", call(F2, "before.png", PNG), 403)
check("E3 bad magic bytes → 422", call(F1, "before.png", BAD), 422)
check("E4 double-extension name → 422", call(F1, "before.exe.png", PNG), 422)
check("E5 author + valid PNG → 200", call(F1, "before.png", PNG), 200)

# cleanup: delete the probe kaizen row; the 1x1 test object becomes an orphan
# reclaimed by the (now kaizen-aware) daily opl-orphan-sweep.
mgmt(f"DELETE FROM kaizen WHERE id={S(KZ)};")
print(f"\n{'='*40}\n{sum(results)}/{len(results)} PASS", "ALL GREEN" if all(results) else "FAILURES")
import sys; sys.exit(0 if all(results) else 1)
