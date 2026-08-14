#!/usr/bin/env python3
# Live §F probe battery for M2b (OPL training). HTTP via curl (python urllib is CF-blocked).
import json, subprocess, sys, uuid

URL = "https://api.supabase.com/v1/projects/joryoadrvisizkkspuov/database/query"
TOKEN = subprocess.run("security find-generic-password -s 'Supabase CLI' -a supabase -w | sed 's/^go-keyring-base64://' | base64 -d",
                       shell=True, capture_output=True, text=True).stdout.strip()
assert TOKEN.startswith("sbp_"), "token fetch failed"

NPF="00000000-0000-0000-0000-000000000001"; DRY="ffffffff-0000-4000-a000-000000000001"
G1="00000002-0000-0000-0000-000000000001"   # PRINT
F1="2fa59bb8-2de1-4b91-9a7f-52913ee856fb"   # apprentice G1 (PIN)
F2="62ba0c25-8978-4ad4-8f45-6c3bd0c47a51"   # apprentice G1 (PIN)
F3="655ebb8a-678c-4abf-b47d-690abc432bf2"   # apprentice G1 (PIN) never-trained
L1w="7915b47f-984a-4e91-9d37-521a86f6a27e"; L1u="a9fe1088-ae81-4d10-8b86-b771ddb925c5"  # jh_leader G1 (email)
L2w="a7cd8b22-6436-4cde-94cb-d439011fcffc"; L2u="1973cb94-9b91-468a-8604-018a2b15af02"  # jh_leader D1 (email)
DMu="b5251c81-88b8-47b4-8d39-9182620d4142"  # dmt_leader, DMT covers PRINT (email)
ADu="37e66c6b-f324-4a61-8863-9bd1f8785e97"  # admin (email)
OPLP=str(uuid.uuid4())

def q(sql):
    p=subprocess.run(["curl","-s","-X","POST",URL,"-H",f"Authorization: Bearer {TOKEN}",
                      "-H","Content-Type: application/json","-d",json.dumps({"query":sql})],
                     capture_output=True,text=True)
    try: return json.loads(p.stdout)
    except Exception: return {"_raw":p.stdout}

def S(s): return "'"+s.replace("'","''")+"'"
RESET="RESET ROLE; SELECT set_config('request.headers','{}',false); SELECT set_config('request.jwt.claims','{}',false);"
def pin(wid,fac=NPF):
    return RESET+f" SET ROLE anon; SELECT set_config('request.headers',{S(json.dumps({'x-worker-id':wid,'x-factory-id':fac}))},false);"
def email(uid):
    return RESET+f" SET ROLE authenticated; SELECT set_config('request.jwt.claims',{S(json.dumps({'sub':uid,'role':'authenticated'}))},false);"
def svc(): return RESET

results=[]
def check(label, cond, detail=""):
    results.append((label,cond,detail)); print(f"{'PASS' if cond else 'FAIL'}  {label}  {detail if not cond else ''}")
def is_err(r): return isinstance(r,dict)
def is_ok(r):  return isinstance(r,list)
def n(r):
    try: return r[0]['n']
    except Exception: return None

# ── seed (service) ──
q(svc()+f" INSERT INTO opl (id,factory_id,jh_group_id,machine_id,title,opl_type,status,created_by,retrain_frequency_days) VALUES ({S(OPLP)},{S(NPF)},{S(G1)},NULL,'ZZ_M2B_PROBE','know_how','approved',{S(L1w)},90) ON CONFLICT (id) DO UPDATE SET status='approved',retired_at=NULL;")
seed=q(svc()+f" SELECT count(*)::int AS n FROM opl WHERE id={S(OPLP)} AND status='approved';")
check("seed probe OPL", n(seed)==1, str(seed))

# 1 floor self-ack in audience → ok
check("01 floor self_ack in-audience → OK", is_ok(q(pin(F1)+f" SELECT self_ack_opl_training({S(OPLP)});")))
# 2 floor self-ack again (not due) → err
check("02 floor self_ack again same cycle → DENIED", is_err(q(pin(F1)+f" SELECT self_ack_opl_training({S(OPLP)});")))
# 3 floor mark others → err
check("03 floor mark_opl_training → DENIED", is_err(q(pin(F1)+f" SELECT mark_opl_training({S(OPLP)},ARRAY[{S(F2)}]::uuid[]);")))
# 4 floor add audience → err
check("04 floor add_to_opl_audience → DENIED", is_err(q(pin(F1)+f" SELECT add_to_opl_audience({S(OPLP)},{S(F2)});")))
# 5 floor retire → err
check("05 floor retire_opl → DENIED", is_err(q(pin(F1)+f" SELECT retire_opl({S(OPLP)});")))
# 6 leader mark F2 → ok (returns 1)
r6=q(email(L1u)+f" SELECT mark_opl_training({S(OPLP)},ARRAY[{S(F2)}]::uuid[]) AS n;")
check("06 leader mark_opl_training F2 → OK(1)", is_ok(r6) and n(r6)==1, str(r6))
# 7 leader mark non-audience worker (L2 not in PRINT audience) → err (correctness fix #2)
check("07 leader mark non-audience → DENIED", is_err(q(email(L1u)+f" SELECT mark_opl_training({S(OPLP)},ARRAY[{S(L2w)}]::uuid[]);")))
# 8 cross-group leader retire → err
check("08 cross-group leader retire → DENIED", is_err(q(email(L2u)+f" SELECT retire_opl({S(OPLP)});")))
# 9 cross-group leader mark → err
check("09 cross-group leader mark → DENIED", is_err(q(email(L2u)+f" SELECT mark_opl_training({S(OPLP)},ARRAY[{S(F1)}]::uuid[]);")))
# 10 audience exclude/include round-trip
check("10a leader exclude F1 → OK", is_ok(q(email(L1u)+f" SELECT remove_from_opl_audience({S(OPLP)},{S(F1)});")))
ea=q(email(L1u)+f" SELECT count(*)::int AS n FROM opl_effective_audience({S(OPLP)}) WHERE worker_id={S(F1)};")
check("10b F1 dropped from effective audience", n(ea)==0, str(ea))
check("10c excluded F1 self_ack → DENIED", is_err(q(pin(F1)+f" SELECT self_ack_opl_training({S(OPLP)});")))
check("10d leader re-include F1 → OK", is_ok(q(email(L1u)+f" SELECT add_to_opl_audience({S(OPLP)},{S(F1)});")))
ea2=q(email(L1u)+f" SELECT count(*)::int AS n FROM opl_effective_audience({S(OPLP)}) WHERE worker_id={S(F1)};")
check("10e F1 back in effective audience", n(ea2)==1, str(ea2))
# 11 reads per role + worker-own
check("11a floor F1 sees own event only", n(q(pin(F1)+f" SELECT count(*)::int AS n FROM opl_training_event WHERE opl_id={S(OPLP)};"))==1)
check("11b floor F2 sees own event only", n(q(pin(F2)+f" SELECT count(*)::int AS n FROM opl_training_event WHERE opl_id={S(OPLP)};"))==1)
check("11c leader G1 sees both group events", n(q(email(L1u)+f" SELECT count(*)::int AS n FROM opl_training_event WHERE opl_id={S(OPLP)};"))==2)
check("11d dmt_leader sees PRINT events (DMT tier)", n(q(email(DMu)+f" SELECT count(*)::int AS n FROM opl_training_event WHERE opl_id={S(OPLP)};"))==2)
check("11e admin sees events (factory tier)", n(q(email(ADu)+f" SELECT count(*)::int AS n FROM opl_training_event WHERE opl_id={S(OPLP)};"))==2)
check("11f cross-group leader L2 sees 0 PRINT events", n(q(email(L2u)+f" SELECT count(*)::int AS n FROM opl_training_event WHERE opl_id={S(OPLP)};"))==0)
# 12 immutability (client UPDATE/DELETE denied)
check("12a authenticated UPDATE event → DENIED", is_err(q(email(L1u)+f" UPDATE opl_training_event SET acknowledged=false WHERE opl_id={S(OPLP)};")))
check("12b authenticated DELETE event → DENIED", is_err(q(email(L1u)+f" DELETE FROM opl_training_event WHERE opl_id={S(OPLP)};")))
# 13 cross-factory (mismatched factory header)
check("13a foreign-factory identity sees 0 events", n(q(pin(F1,DRY)+f" SELECT count(*)::int AS n FROM opl_training_event WHERE opl_id={S(OPLP)};"))==0)
check("13b foreign-factory self_ack → DENIED", is_err(q(pin(F1,DRY)+f" SELECT self_ack_opl_training({S(OPLP)});")))
# 14 cycle +1 on retrain due
q(svc()+f" UPDATE opl_training_event SET trained_at = now() - interval '200 days' WHERE opl_id={S(OPLP)} AND worker_id={S(F1)};")
check("14a due retrain self_ack → OK", is_ok(q(pin(F1)+f" SELECT self_ack_opl_training({S(OPLP)});")))
cyc=q(svc()+f" SELECT retrain_cycle AS n FROM opl_training_status_v WHERE opl_id={S(OPLP)} AND worker_id={S(F1)};")
check("14b status_v latest cycle = 2", n(cyc)==2, str(cyc))
# 15 due view
check("15a F1 not due right after ack", n(q(pin(F1)+f" SELECT count(*)::int AS n FROM opl_training_due_v WHERE opl_id={S(OPLP)} AND worker_id={S(F1)};"))==0)
r15=q(pin(F3)+f" SELECT count(*)::int AS n, bool_or(never_trained) AS nt FROM opl_training_due_v WHERE opl_id={S(OPLP)} AND worker_id={S(F3)};")
check("15b never-trained F3 surfaces in due_v", (r15[0]['n']==1 and r15[0]['nt']==True) if is_ok(r15) else False, str(r15))
# 16 retire removes from due
check("16a leader retire → OK", is_ok(q(email(L1u)+f" SELECT retire_opl({S(OPLP)});")))
check("16b retired OPL gone from due_v", n(q(pin(F3)+f" SELECT count(*)::int AS n FROM opl_training_due_v WHERE opl_id={S(OPLP)};"))==0)
check("16c leader unretire → OK", is_ok(q(email(L1u)+f" SELECT unretire_opl({S(OPLP)});")))
# 17 retrain-frequency edit (jh_leader+ only)
check("17a leader set_opl_retrain_frequency(60) → OK", is_ok(q(email(L1u)+f" SELECT set_opl_retrain_frequency({S(OPLP)},60);")))
check("17b retrain_frequency_days = 60", n(q(svc()+f" SELECT retrain_frequency_days AS n FROM opl WHERE id={S(OPLP)};"))==60)
check("17c floor set frequency → DENIED", is_err(q(pin(F1)+f" SELECT set_opl_retrain_frequency({S(OPLP)},30);")))
check("17d cross-group leader set frequency → DENIED", is_err(q(email(L2u)+f" SELECT set_opl_retrain_frequency({S(OPLP)},30);")))

# ── teardown (service) ──
q(svc()+f" DELETE FROM opl_training_event WHERE opl_id={S(OPLP)}; DELETE FROM opl_intended_audience WHERE opl_id={S(OPLP)}; DELETE FROM opl WHERE id={S(OPLP)};")
left=q(svc()+f" SELECT count(*)::int AS n FROM opl WHERE id={S(OPLP)};")
check("teardown removed probe OPL", n(left)==0, str(left))

fails=[r for r in results if not r[1]]
print(f"\n{'='*50}\n{len(results)-len(fails)}/{len(results)} PASS")
if fails:
    print("FAILURES:", [f[0] for f in fails]); sys.exit(1)
print("ALL GREEN")
