#!/usr/bin/env python3
# Live §F probe battery for M3 (Kaizen). HTTP via curl. Mirrors scripts/p3_m2b_probe.py.
import json, subprocess, sys, uuid
URL="https://api.supabase.com/v1/projects/joryoadrvisizkkspuov/database/query"
TOKEN=subprocess.run("security find-generic-password -s 'Supabase CLI' -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d",
                     shell=True,capture_output=True,text=True).stdout.strip()
assert TOKEN.startswith("sbp_"),"token fetch failed"

NPF="00000000-0000-0000-0000-000000000001"; DRY="ffffffff-0000-4000-a000-000000000001"
PRINT="00000002-0000-0000-0000-000000000001"; D1="00000002-0000-0000-0000-000000000005"
F1="2fa59bb8-2de1-4b91-9a7f-52913ee856fb"                # floor PRINT (PIN)
L1u="a9fe1088-ae81-4d10-8b86-b771ddb925c5"               # jh_leader PRINT (email) — REVIEWER
DMu="59b97a9a-f352-4963-846f-a01c40da69de"               # dmt_member (email) — REVIEWER
DL1u="b5251c81-88b8-47b4-8d39-9182620d4142"              # dmt_leader DMT0001 (email) — APPROVER in-scope for PRINT
DL2u="37095e03-de5b-4a24-afbc-291bfff85d15"              # dmt_leader DMT0002 (email) — APPROVER out-of-scope
ADu="37e66c6b-f324-4a61-8863-9bd1f8785e97"               # admin (email) — APPROVER factory
FD1="7f20db2c-b028-4d30-a2c7-e218100f2927"               # floor D1 (cross-group)
KZS=str(uuid.uuid4()); KZD=str(uuid.uuid4()); KZC=str(uuid.uuid4())

def q(sql):
    p=subprocess.run(["curl","-s","-X","POST",URL,"-H",f"Authorization: Bearer {TOKEN}",
                      "-H","Content-Type: application/json","-d",json.dumps({"query":sql})],capture_output=True,text=True)
    try: return json.loads(p.stdout,strict=False)
    except Exception: return {"_raw":p.stdout}
def S(s): return "'"+str(s).replace("'","''")+"'"
RESET="RESET ROLE; SELECT set_config('request.headers','{}',false); SELECT set_config('request.jwt.claims','{}',false);"
def pin(wid,fac=NPF): return RESET+f" SET ROLE anon; SELECT set_config('request.headers',{S(json.dumps({'x-worker-id':wid,'x-factory-id':fac}))},false);"
def email(uid):       return RESET+f" SET ROLE authenticated; SELECT set_config('request.jwt.claims',{S(json.dumps({'sub':uid,'role':'authenticated'}))},false);"
def svc(): return RESET
def is_err(r): return isinstance(r,dict)
def is_ok(r):  return isinstance(r,list)
def n(r):
    try: return r[0]['n']
    except Exception: return None
results=[]
def check(label,cond,detail=""):
    results.append((label,cond)); print(f"{'PASS' if cond else 'FAIL'}  {label}  {detail if not cond else ''}")

def seed_sub():  # (re)seed KZS as a submitted PRINT kaizen by F1
    q(svc()+f" INSERT INTO kaizen (id,factory_id,jh_group_id,title,status,submitted_by,submitted_at) VALUES ({S(KZS)},{S(NPF)},{S(PRINT)},'ZZ_M3_SUB','submitted',{S(F1)},now()) ON CONFLICT (id) DO UPDATE SET status='submitted',score_pq=NULL,score_ehs=NULL,score_quant=NULL,score_easy=NULL,total_score=NULL,approved_by=NULL,approved_at=NULL,rejection_reason=NULL;")
seed_sub()
q(svc()+f" INSERT INTO kaizen (id,factory_id,jh_group_id,title,brief_description,problem_description,solution_description,status,submitted_by) VALUES ({S(KZD)},{S(NPF)},{S(PRINT)},'ZZ_M3_DRAFT','b','p','s','draft',{S(F1)}) ON CONFLICT (id) DO UPDATE SET status='draft',brief_description='b',problem_description='p',solution_description='s';")
check("seed submitted+draft kaizen", n(q(svc()+f" SELECT count(*)::int AS n FROM kaizen WHERE id IN ({S(KZS)},{S(KZD)})"))==2)

# create
check("01 floor create own-group draft → OK", is_ok(q(pin(F1)+f" INSERT INTO kaizen (id,factory_id,jh_group_id,title,status,submitted_by) VALUES ({S(KZC)},{S(NPF)},{S(PRINT)},'ZZ_M3_CREATE','draft',{S(F1)});")))
check("02 floor create CROSS-group → DENIED", is_err(q(pin(F1)+f" INSERT INTO kaizen (factory_id,jh_group_id,title,status,submitted_by) VALUES ({S(NPF)},{S(D1)},'ZZ_X','draft',{S(F1)});")))
# submit
check("03 author submit own draft → OK", is_ok(q(pin(F1)+f" SELECT submit_kaizen({S(KZD)});")))
check("03b draft is now submitted", q(svc()+f" SELECT status::text AS n FROM kaizen WHERE id={S(KZD)}")[0]['n']=='submitted')
check("04 non-author submit → DENIED", is_err(q(email(L1u)+f" SELECT submit_kaizen({S(KZC)});")))
# approve — denials first (no state change)
check("05 REVIEWER jh_leader approve → DENIED", is_err(q(email(L1u)+f" SELECT approve_kaizen({S(KZS)},9,3,9,3);")))
check("06 REVIEWER dmt_member approve → DENIED", is_err(q(email(DMu)+f" SELECT approve_kaizen({S(KZS)},9,3,9,3);")))
check("07 out-of-scope dmt_leader(DMT2) approve → DENIED", is_err(q(email(DL2u)+f" SELECT approve_kaizen({S(KZS)},9,3,9,3);")))
check("08 cross-factory approve → DENIED", is_err(q(pin(F1,DRY)+f" SELECT approve_kaizen({S(KZS)},9,3,9,3);")))
check("09 invalid score value (2) → DENIED", is_err(q(email(DL1u)+f" SELECT approve_kaizen({S(KZS)},2,3,9,3);")))
# client write on privileged cols
check("10 client UPDATE status/score (jh_leader) → DENIED", is_err(q(email(L1u)+f" UPDATE kaizen SET status='approved',score_pq=9 WHERE id={S(KZS)};")))
check("11 client UPDATE status (floor) → DENIED", is_err(q(pin(F1)+f" UPDATE kaizen SET status='approved' WHERE id={S(KZS)};")))
# approve OK + score integrity
check("12 APPROVER in-scope (dmt_leader DMT1) approve → OK", is_ok(q(email(DL1u)+f" SELECT approve_kaizen({S(KZS)},9,3,9,3);")))
row=q(svc()+f" SELECT status::text AS st, total_score::int AS tot, score_pq::int AS pq FROM kaizen WHERE id={S(KZS)}")
check("13 status approved + total=SUM=24 (server-computed) + pq=9", is_ok(row) and row[0]['st']=='approved' and row[0]['tot']==24 and row[0]['pq']==9, str(row))
# reject path (reset to submitted)
seed_sub()
check("14 REVIEWER reject → DENIED", is_err(q(email(L1u)+f" SELECT reject_kaizen({S(KZS)},'no');")))
check("15 reject without reason → DENIED", is_err(q(email(DL1u)+f" SELECT reject_kaizen({S(KZS)},'');")))
check("16 APPROVER reject → OK", is_ok(q(email(DL1u)+f" SELECT reject_kaizen({S(KZS)},'insufficient benefit');")))
rj=q(svc()+f" SELECT status::text AS st, total_score AS tot FROM kaizen WHERE id={S(KZS)}")
check("17 status rejected + scores cleared", is_ok(rj) and rj[0]['st']=='rejected' and rj[0]['tot'] is None, str(rj))
# admin can approve (factory tier) — reset then approve
seed_sub()
check("18 admin approve (factory tier) → OK", is_ok(q(email(ADu)+f" SELECT approve_kaizen({S(KZS)},3,3,3,3);")))
# reads per tier (our 3 PRINT seeds)
IDS=f"({S(KZS)},{S(KZD)},{S(KZC)})"
check("19 floor PRINT reads own-group kaizens", n(q(pin(F1)+f" SELECT count(*)::int AS n FROM kaizen WHERE id IN {IDS};"))==3)
check("20 dmt_leader DMT1 reads (DMT tier)", n(q(email(DL1u)+f" SELECT count(*)::int AS n FROM kaizen WHERE id IN {IDS};"))==3)
check("21 admin reads (factory tier)", n(q(email(ADu)+f" SELECT count(*)::int AS n FROM kaizen WHERE id IN {IDS};"))==3)
check("22 out-of-scope dmt_leader(DMT2) reads PRINT → 0", n(q(email(DL2u)+f" SELECT count(*)::int AS n FROM kaizen WHERE id IN {IDS};"))==0)
check("23 cross-group floor(D1) reads PRINT → 0", n(q(pin(FD1)+f" SELECT count(*)::int AS n FROM kaizen WHERE id IN {IDS};"))==0)
check("24 cross-factory identity reads PRINT → 0", n(q(pin(F1,DRY)+f" SELECT count(*)::int AS n FROM kaizen WHERE id IN {IDS};"))==0)

# teardown
q(svc()+f" DELETE FROM kaizen WHERE id IN {IDS};")
check("teardown removed probe kaizens", n(q(svc()+f" SELECT count(*)::int AS n FROM kaizen WHERE id IN {IDS};"))==0)

fails=[r for r in results if not r[1]]
print(f"\n{'='*50}\n{len(results)-len(fails)}/{len(results)} PASS")
if fails: print("FAILURES:",[f[0] for f in fails]); sys.exit(1)
print("ALL GREEN")
