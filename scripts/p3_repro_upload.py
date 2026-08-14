#!/usr/bin/env python3
# Reproduce the image-upload failure with REALISTIC payload sizes (D — diagnose first).
# The edge only checks magic-byte (FF D8 FF) + total size + uploads; it does NOT decode
# the JPEG. So a fabricated blob = [FF D8 FF + padding] faithfully tests transport +
# the §F size gate at any size. HTTP via curl (browser CORS is separate; already 24/24).
import json, subprocess, base64, os, uuid, re
APP="https://joryoadrvisizkkspuov.supabase.co"
FN=f"{APP}/functions/v1/validate-kaizen-image"
MGMT="https://api.supabase.com/v1/projects/joryoadrvisizkkspuov/database/query"
ANON=re.search(r'VITE_SUPABASE_ANON_KEY=(\S+)', open('.env').read()).group(1)
TOKEN=subprocess.run("security find-generic-password -s 'Supabase CLI' -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d",shell=True,capture_output=True,text=True).stdout.strip()
NPF="00000000-0000-0000-0000-000000000001"; PRINT="00000002-0000-0000-0000-000000000001"
F1="2fa59bb8-2de1-4b91-9a7f-52913ee856fb"
KZ=str(uuid.uuid4())

def mgmt(sql):
    subprocess.run(["curl","-s","-X","POST",MGMT,"-H",f"Authorization: Bearer {TOKEN}","-H","Content-Type: application/json","-d",json.dumps({"query":sql})],capture_output=True,text=True)
def S(s): return "'"+str(s).replace("'","''")+"'"

def blob_b64(nbytes):
    body=bytearray(b'\xff\xd8\xff')+bytearray(os.urandom(max(0,nbytes-5)))+bytearray(b'\xff\xd9')
    return base64.b64encode(bytes(body)).decode()

# seed a draft kaizen owned by F1
mgmt(f"INSERT INTO kaizen (id,factory_id,jh_group_id,title,status,submitted_by) VALUES ({S(KZ)},{S(NPF)},{S(PRINT)},'ZZ_REPRO','draft',{S(F1)}) ON CONFLICT (id) DO UPDATE SET status='draft';")

def post(nbytes, slot):
    payload=json.dumps({"kaizen_id":KZ,"slot":slot,"filename":"photo.jpg","data_base64":blob_b64(nbytes)})
    pf=f"/tmp/_payload_{nbytes}.json"; open(pf,"w").write(payload)
    body_mb=os.path.getsize(pf)/1048576
    r=subprocess.run(["curl","-s","-m","60","-w","\n__HTTP__%{http_code}__SIZE__%{size_upload}","-X","POST",FN,
                      "-H",f"Origin: {APP}","-H","Content-Type: application/json","-H",f"apikey: {ANON}",
                      "-H",f"Authorization: Bearer {ANON}","-H",f"x-worker-id: {F1}","--data-binary",f"@{pf}"],
                     capture_output=True,text=True)
    os.remove(pf)
    out=r.stdout
    m=re.search(r'__HTTP__(\d*)__SIZE__(\d+)', out)
    code=m.group(1) if m else '(none)'; sent=int(m.group(2))/1048576 if m else 0
    bodytxt=out[:m.start()] if m else out
    err=r.stderr.strip()
    print(f"  raw={nbytes/1048576:.2f}MB  json_body={body_mb:.2f}MB  uploaded={sent:.2f}MB  HTTP={code or 'NO-RESPONSE'}  resp={bodytxt[:120]!r}  {('curlerr='+err) if (err or not code) else ''}")
    return code

print("SIZE LADDER → validate-kaizen-image (raw image size; json body ≈ 1.33×):")
for kb in [120, 300]:        # under/over the 256KB §F cap
    post(kb*1024, 'before')
for mb in [2, 4, 8]:          # realistic phone-photo range
    post(mb*1024*1024, 'before')

print("\nstored objects under this kaizen:")
mgmt("")  # noop
r=subprocess.run(["curl","-s","-X","POST",MGMT,"-H",f"Authorization: Bearer {TOKEN}","-H","Content-Type: application/json",
                  "-d",json.dumps({"query":f"select coalesce(jsonb_agg(jsonb_build_object('name',name,'size',(metadata->>'size'))),'[]'::jsonb) as j from storage.objects where bucket_id='tpm-uploads' and name like '%/kaizen/{KZ}/%'"})],capture_output=True,text=True)
try: print(" ", json.loads(r.stdout,strict=False)[0]['j'])
except Exception: print("  ", r.stdout[:200])

# teardown
mgmt(f"delete from storage.objects where bucket_id='tpm-uploads' and name like '%/kaizen/{KZ}/%'; delete from kaizen where id={S(KZ)};")
print("\n(teardown done)")
