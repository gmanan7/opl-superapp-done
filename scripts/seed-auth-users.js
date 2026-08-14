// One-time script to create all email users in Supabase Auth
// and link them to worker_profile rows.
// Run with: npx tsx scripts/seed-auth-users.ts
// Requires SUPABASE_SERVICE_ROLE_KEY in .env
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const FACTORY_ID = '00000000-0000-0000-0000-000000000001';
const SFM_DMT = '00000001-0000-0000-0000-000000000001';
const RFM_DMT = '00000001-0000-0000-0000-000000000002';
const JH_PRINTING = '00000002-0000-0000-0000-000000000001';
const JH_CNC = '00000002-0000-0000-0000-000000000002';
const JH_VA = '00000002-0000-0000-0000-000000000003';
const JH_FG = '00000002-0000-0000-0000-000000000004';
const JH_D1 = '00000002-0000-0000-0000-000000000005';
const JH_UTIL = '00000002-0000-0000-0000-000000000008';
const PASSWORD = 'Qwerty@1';
const users = [
    // ── JH Leaders (have both jh_group_id and dmt_id) ──────────────
    // C&C JH — SFM DMT
    { email: 'amol.wagh@itc.in', name: 'Amol Wagh', role: 'jh_leader', jh_group_id: JH_CNC, dmt_id: SFM_DMT },
    { email: 'gaurav.pandey@itc.in', name: 'Gaurav Pandey', role: 'jh_leader', jh_group_id: JH_CNC, dmt_id: SFM_DMT },
    { email: 'narendra.kumar@itc.in', name: 'Narendra Kumar', role: 'jh_leader', jh_group_id: JH_CNC, dmt_id: SFM_DMT },
    // Printing JH — SFM DMT
    { email: 'mandeep.sen@itc.in', name: 'Mandeep Sen', role: 'jh_leader', jh_group_id: JH_PRINTING, dmt_id: SFM_DMT },
    { email: 'ramashankar.yadav@itc.in', name: 'Ramashankar Yadav', role: 'jh_leader', jh_group_id: JH_PRINTING, dmt_id: SFM_DMT },
    { email: 'rakesh.singh-ppb@itc.in', name: 'Rakesh Singh', role: 'jh_leader', jh_group_id: JH_PRINTING, dmt_id: SFM_DMT },
    // Delta 1 JH — RFM DMT
    { email: 'kumar.naveen@itc.in', name: 'Naveen Kumar Singh', role: 'jh_leader', jh_group_id: JH_D1, dmt_id: RFM_DMT },
    { email: 'anand.mohan@itc.in', name: 'Anand Mohan', role: 'jh_leader', jh_group_id: JH_D1, dmt_id: RFM_DMT },
    { email: 'sakthi.murugan@itc.in', name: 'Sakthi Murugan', role: 'jh_leader', jh_group_id: JH_D1, dmt_id: RFM_DMT },
    // F&G JH — SFM DMT
    { email: 'pravin.k@itc.in', name: 'Pravin Kumar', role: 'jh_leader', jh_group_id: JH_FG, dmt_id: SFM_DMT },
    { email: 'indresh.nishad@itc.in', name: 'Indresh Nishad', role: 'jh_leader', jh_group_id: JH_FG, dmt_id: SFM_DMT },
    { email: 'nagendra.yadav@itc.in', name: 'Nagendra Yadav', role: 'jh_leader', jh_group_id: JH_FG, dmt_id: SFM_DMT },
    // Value Addition JH — SFM DMT
    { email: 'sultan.ahmad@itc.in', name: 'Sultan Ahmad', role: 'jh_leader', jh_group_id: JH_VA, dmt_id: SFM_DMT },
    { email: 'sandeepnishad.k@itc.in', name: 'Sandeep Nishad', role: 'jh_leader', jh_group_id: JH_VA, dmt_id: SFM_DMT },
    { email: 'ramesh.kumar@itc.in', name: 'Ramesh Kumar', role: 'jh_leader', jh_group_id: JH_VA, dmt_id: SFM_DMT },
    // Utilities JH — no DMT
    { email: 'sharma.vikash@itc.in', name: 'Vikash Sharma', role: 'jh_leader', jh_group_id: JH_UTIL, dmt_id: null },
    // ── DMT Leaders (jh_group_id null, dmt_id set) ─────────────────
    { email: 'kamal.ppd@itc.in', name: 'Kamal', role: 'dmt_leader', jh_group_id: null, dmt_id: SFM_DMT },
    { email: 'mitesh.kumar@itc.in', name: 'Mitesh Kumar', role: 'dmt_leader', jh_group_id: null, dmt_id: SFM_DMT },
    { email: 'binoy.paul@itc.in', name: 'Binoy Paul', role: 'dmt_leader', jh_group_id: null, dmt_id: RFM_DMT },
    // ── DMT Members SFM (jh_group_id null, dmt_id set) ─────────────
    { email: 'prashant.bisht@itc.in', name: 'Prashant Bisht', role: 'dmt_member', jh_group_id: null, dmt_id: SFM_DMT },
    { email: 'muraleedhar.pandey@itc.in', name: 'Muraleedhar Pandey', role: 'dmt_member', jh_group_id: null, dmt_id: SFM_DMT },
    { email: 'karansinh.chauhan@itc.in', name: 'Karansinh Chauhan', role: 'dmt_member', jh_group_id: null, dmt_id: SFM_DMT },
    { email: 'ankita.kumari@itc.in', name: 'Ankita Kumari', role: 'dmt_member', jh_group_id: null, dmt_id: SFM_DMT },
    { email: 'saurabh.rathi@itc.in', name: 'Saurabh Rathi', role: 'dmt_member', jh_group_id: null, dmt_id: SFM_DMT },
    { email: 'tushar.vaghela@itc.in', name: 'Tushar Vaghela', role: 'dmt_member', jh_group_id: null, dmt_id: SFM_DMT },
    // ── DMT Members RFM ────────────────────────────────────────────
    { email: 'abhishek.g@itc.in', name: 'Abhishek Gupta', role: 'dmt_member', jh_group_id: null, dmt_id: RFM_DMT },
    { email: 'rahul.nautiyal@itc.in', name: 'Rahul Nautiyal', role: 'dmt_member', jh_group_id: null, dmt_id: RFM_DMT },
    { email: 'manoj.kuchara@itc.in', name: 'Manoj Kuchara', role: 'dmt_member', jh_group_id: null, dmt_id: RFM_DMT },
    { email: 'nilesh.thummar@itc.in', name: 'Nilesh Thummar', role: 'dmt_member', jh_group_id: null, dmt_id: RFM_DMT },
    { email: 'pushpendrapratap.singh@itc.in', name: 'Pushpendra Pratap Singh', role: 'dmt_member', jh_group_id: null, dmt_id: RFM_DMT },
    { email: 'anisha.negi@itc.in', name: 'Anisha Negi', role: 'dmt_member', jh_group_id: null, dmt_id: RFM_DMT },
    // ── BE Team (factory-wide, no DMT) ─────────────────────────────
    { email: 'gaurisha.shukla@itc.in', name: 'Gaurisha Shukla', role: 'be_team', jh_group_id: null, dmt_id: null },
    { email: 'pushap.raj@itc.in', name: 'Pushap Raj', role: 'be_team', jh_group_id: null, dmt_id: null },
    { email: 'debanjan.chakraborty@itc.in', name: 'Debanjan Chakraborty', role: 'be_team', jh_group_id: null, dmt_id: null },
];
async function main() {
    console.log(`Creating ${users.length} users...\n`);
    let created = 0, skipped = 0, failed = 0;
    for (const user of users) {
        try {
            // Create (or find existing) auth user first — we need authUserId to key the profile check
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: user.email,
                password: PASSWORD,
                email_confirm: true,
            });
            let authUserId;
            if (authError) {
                if (authError.message.toLowerCase().includes('already')) {
                    // Auth user exists — find their ID
                    const { data: { users: list } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
                    const found = list.find(u => u.email === user.email);
                    if (!found)
                        throw new Error(`Auth exists but not found: ${user.email}`);
                    authUserId = found.id;
                    console.log(`AUTH EXISTS (linking): ${user.email}`);
                }
                else {
                    throw authError;
                }
            }
            else {
                authUserId = authData.user.id;
            }
            // Check if worker_profile is already linked to this auth user
            const { data: existing } = await supabase
                .from('worker_profile')
                .select('id, supabase_user_id')
                .eq('supabase_user_id', authUserId)
                .eq('factory_id', FACTORY_ID)
                .maybeSingle();
            if (existing) {
                console.log(`SKIP (already linked): ${user.email}`);
                skipped++;
                continue;
            }
            // Create fresh worker_profile
            const { error: profileError } = await supabase
                .from('worker_profile')
                .insert({
                factory_id: FACTORY_ID,
                employee_id: null,
                name: user.name,
                role: user.role,
                jh_group_id: user.jh_group_id,
                dmt_id: user.dmt_id,
                supabase_user_id: authUserId,
                lang_pref: 'en',
                is_active: true,
            });
            if (profileError)
                throw profileError;
            console.log(`CREATED: ${user.email} (${user.role})`);
            created++;
            await new Promise(r => setTimeout(r, 250)); // avoid rate limit
        }
        catch (err) {
            console.error(`FAILED: ${user.email} — ${err.message}`);
            failed++;
        }
    }
    console.log(`\n✓ Done: ${created} created, ${skipped} skipped, ${failed} failed`);
}
main().catch(console.error);
