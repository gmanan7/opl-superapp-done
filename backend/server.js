import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool, types } from 'pg';
import bcrypt from 'bcryptjs';
// Postgres DATE columns (oid 1082) are parsed into a JS Date by default, which pg then
// serializes as a UTC midnight ISO string — shifting the calendar date backward by a day
// for any timezone ahead of UTC (e.g. IST). Return the raw 'YYYY-MM-DD' text instead so
// dates round-trip exactly as stored, no matter the server's local timezone.
types.setTypeParser(1082, (val) => val);
// .env lives at the project root. Resolve it from the script's own real location
// rather than process.cwd() — the terminal's working directory at launch time isn't
// reliable across `npm run dev`, a standalone `node backend/server.js`, and the
// esbuild-bundled `dist/server.cjs` (where import.meta.url isn't available either).
(function loadEnv() {
    const candidates = [];
    try {
        const here = path.dirname(fileURLToPath(import.meta.url));
        candidates.push(path.resolve(here, '.env'), path.resolve(here, '..', '.env'));
    } catch { /* import.meta.url is unavailable in the CJS bundle */ }
    if (process.argv[1]) {
        const entryDir = path.dirname(process.argv[1]);
        candidates.push(path.resolve(entryDir, '.env'), path.resolve(entryDir, '..', '.env'));
    }
    candidates.push(path.resolve(process.cwd(), '.env'));
    const found = candidates.find((p) => fs.existsSync(p));
    dotenv.config(found ? { path: found } : undefined);
})();
const __dirname = process.cwd();
const PORT = 3000;
// Initialize Express
export const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Initialize PostgreSQL Connection Pool if DATABASE_URL or DB_* environment variables are set
let pool = null;
const dbUrl = process.env.DATABASE_URL || (
    process.env.DB_HOST && process.env.DB_USER && (process.env.DB_DATABASE || process.env.DB_NAME)
        ? `postgres://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD || '')}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_DATABASE || process.env.DB_NAME}`
        : null
);

if (dbUrl) {
    try {
        pool = new Pool({
            connectionString: dbUrl,
            ssl: (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) ? false : { rejectUnauthorized: false }
        });
        pool.on('error', (err) => {
            console.error('[PostgreSQL] Idle client error:', err.message || err);
        });
        console.log('[PostgreSQL] Configured database connection pool.');
    }
    catch (err) {
        console.error('[PostgreSQL] Failed to initialize pool:', err);
    }
}
else {
    console.log('[PostgreSQL] No DATABASE_URL or DB parameters provided. Operating with stateful in-memory store for preview mode.');
}
// Helper query function that falls back smoothly
async function query(sql, params = []) {
    if (pool) {
        try {
            const res = await pool.query(sql, params);
            return res.rows;
        }
        catch (err) {
            console.error('[PostgreSQL Error]', err);
            throw err;
        }
    }
    return [];
}
// ----------------------------------------------------------------------------
// Stateful Mock Database Store for local preview without live Postgres DB
// ----------------------------------------------------------------------------
const mockDb = {
    factories: [
        { id: '1', name: 'TVT', code: 'TVT', is_active: true },
        { id: '2', name: 'NPF', code: 'NPF', is_active: true },
        { id: '3', name: 'UPF', code: 'UPF', is_active: true },
        { id: '4', name: 'MPF', code: 'MPF', is_active: true }
    ],
    areas: [
        { id: 'area-1', factory_id: '00000000-0000-0000-0000-000000000001', department_id: 'dep-1', name: 'Packing Line 1', is_active: true },
        { id: 'area-2', factory_id: '00000000-0000-0000-0000-000000000001', department_id: 'dep-1', name: 'Assembly Section', is_active: true }
    ],
    jhGroups: [
        { id: 'jhg-1', factory_id: '1', module_group_id: 'mg-1', name: 'Alpha Team', leader_emp_id: 'EMP-002', leader_name: 'Rajesh Kumar', is_active: true },
        { id: 'jhg-2', factory_id: '2', module_group_id: 'mg-2', name: 'Beta Team', leader_emp_id: '136109', leader_name: 'Manan Gupta', is_active: true }
    ],
    jhGroupsList: [
        { id: 'jhgl-1', jh_group_id: 'jhg-1', emp_id: 'EMP-002', worker_name: 'Rajesh Kumar', role: 'leader', created_at: new Date().toISOString() },
        { id: 'jhgl-2', jh_group_id: 'jhg-2', emp_id: '136109', worker_name: 'Manan Gupta', role: 'leader', created_at: new Date().toISOString() }
    ],
    dmts: [
        { id: 'dmt-1', factory_id: '00000000-0000-0000-0000-000000000001', name: 'DMT Printing', is_active: true }
    ],
    userDetails: [
        { emp_id: 'EMP-001', name: 'Plant Admin', email: 'admin@fulcrum.com', role: 'it_lead', default_plant: 'Main Plant', is_active: true },
        { emp_id: 'EMP-002', name: 'Rajesh Kumar', email: 'leader@fulcrum.com', role: 'jh_lead', default_plant: 'Main Plant', is_active: true },
        { emp_id: '136109', name: 'Manan Gupta', email: 'manan.gupta@itc.in', role: 'it_lead', default_plant: 'NPF', is_active: true },
        { emp_id: '125246', name: 'Ankit Srivastava', email: 'ankit.srivastava@itc.in', role: 'be_lead', default_plant: 'TVT', is_active: true }
    ],
    userPlantAccess: [
        { id: 'upa-1', emp_id: '136109', factory_id: '1', is_active: true },
        { id: 'upa-2', emp_id: '125246', factory_id: '1', is_active: true },
        { id: 'upa-3', emp_id: '125246', factory_id: '2', is_active: true },
        { id: 'upa-4', emp_id: '125246', factory_id: '3', is_active: true },
        { id: 'upa-5', emp_id: '125246', factory_id: '4', is_active: true }
    ],
    moduleGroups: [
        { id: 'mg-1', module: 'SFM', factory_id: '1', module_lead_emp_id: 'EMP-002', module_lead_name: 'Rajesh Kumar' },
        { id: 'mg-2', module: 'RFM', factory_id: '2', module_lead_emp_id: '136109', module_lead_name: 'Manan Gupta' }
    ],
    moduleNames: [
        { id: 'm-1', name: 'SFM' },
        { id: 'm-2', name: 'RFM' },
        { id: 'm-3', name: 'Labels' },
        { id: 'm-4', name: 'Flexibles' }
    ],
    modules: [
        { id: 'm-1', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'audits', is_enabled: true },
        { id: 'm-2', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'opl', is_enabled: true },
        { id: 'm-3', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'kaizen', is_enabled: true },
        { id: 'm-4', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'abnormality', is_enabled: true }
    ],
    roles: [
        { id: 'role-1', code: 'operator', name: 'Operator', description: 'Machine & Shopfloor Operator', is_active: true },
        { id: 'role-2', code: 'jh_lead', name: 'JH Lead', description: 'Jishuken Group Leader', is_active: true },
        { id: 'role-3', code: 'module_lead', name: 'Module Lead', description: 'TPM Module Leader', is_active: true },
        { id: 'role-4', code: 'admin_5s', name: '5s Admin', description: '5S Administrative Controller', is_active: true },
        { id: 'role-5', code: 'area_champion_5s', name: '5s Area Champion', description: '5S Area Champion', is_active: true },
        { id: 'role-6', code: 'auditor_pool', name: 'Auditor Pool', description: 'Auditor Pool Member', is_active: true },
        { id: 'role-7', code: 'be_lead', name: 'BE Lead', description: 'Business Excellence Lead', is_active: true },
        { id: 'role-8', code: 'it_lead', name: 'IT Lead', description: 'IT Administrator & Lead', is_active: true },
        { id: 'role-9', code: 'leadership', name: 'Leadership', description: 'Executive & Plant Leadership', is_active: true }
    ],
    machines: [
        { id: 'mac-1', factory_id: '00000000-0000-0000-0000-000000000001', jh_group_id: 'jhg-1', name: 'Flexo Printer Machine 01', code: 'PRT-01', is_active: true },
        { id: 'mac-2', factory_id: '00000000-0000-0000-0000-000000000001', jh_group_id: 'jhg-2', name: 'High Speed Lamination Unit', code: 'LAM-02', is_active: true }
    ],
    machineSubsections: [
        { id: 'sub-1', machine_id: 'mac-1', name: 'Unwind Stand', description: 'Primary tension roller section', is_active: true },
        { id: 'sub-2', machine_id: 'mac-1', name: 'Drying Tunnel', description: 'Hot air blower and exhaust', is_active: true }
    ],
    abnormalitiesDetails: [],
    opls: [
        {
            id: 'opl-1',
            factory_id: '00000000-0000-0000-0000-000000000001',
            machine_id: 'mac-1',
            jh_group_id: 'jhg-1',
            author_worker_id: '11111111-1111-1111-1111-111111111111',
            title: 'Correct Cleaning Method for Flexo Anilox Roller',
            opl_type: 'one_point_lesson',
            content_text: 'Always use soft brass wire brush and neutral pH solvent.',
            before_remarks: 'Scratched surfaces when using steel wire',
            after_remarks: 'Clean surface without scratches',
            before_image_url: null,
            after_image_url: null,
            status: 'published',
            retrain_frequency_days: 90,
            retired_at: null,
            retired_by: null,
            is_active: true,
            created_at: new Date().toISOString()
        }
    ],
    oplDetails: [
        {
            opl_id: 1,
            title: 'Correct Cleaning Method for Flexo Anilox Roller',
            content: 'Always use soft brass wire brush and neutral pH solvent.',
            before_image: null,
            after_image: null,
            before_description: 'Anilox roller clogged with ink residue.',
            after_description: 'Clean surface without scratches.',
            classification: 'Basic Condition',
            submitted_by: 'Plant Admin',
            status: 'draft',
            plant_name: 'TVT',
            jh_group_name: 'Alpha Team',
            is_star: false,
            rejection_reason: null,
            timestamp: new Date(Date.now() - 3600000 * 24 * 3).toISOString()
        },
        {
            opl_id: 2,
            title: 'Proper Lubrication Procedure for Main Drive Gearbox',
            content: 'Check oil level sight glass before startup and top up ISO VG 220 gear oil weekly.',
            before_image: null,
            after_image: null,
            before_description: 'Dry gears with high friction noise.',
            after_description: 'Smooth gear engagement and normal temperature.',
            classification: 'Troubleshoot',
            submitted_by: 'Manan Gupta (ID: 136109)',
            status: 'pending_jh_review',
            plant_name: 'NPF',
            jh_group_name: 'Beta Team',
            is_star: true,
            rejection_reason: null,
            timestamp: new Date(Date.now() - 3600000 * 12).toISOString()
        },
        {
            opl_id: 3,
            title: 'Feeder Belt Tensioning Adjustment Protocol',
            content: 'Adjust belt tensioner bolts to 15Nm torque to prevent slippage during high-speed runs.',
            before_image: null,
            after_image: null,
            before_description: 'Loose belt causing carton jamming.',
            after_description: 'Properly tensioned belt with smooth feed.',
            classification: 'Improvement',
            submitted_by: 'Operator Worker',
            status: 'rejected',
            plant_name: 'TVT',
            jh_group_name: 'Alpha Team',
            is_star: false,
            rejection_reason: 'JH Lead Rajesh Kumar: Please verify torque spec against OEM manual.',
            timestamp: new Date(Date.now() - 3600000 * 6).toISOString()
        },
        {
            opl_id: 4,
            title: 'Safety Lockout Tagout (LOTO) for Printing Press Area',
            content: 'Mandatory 5-step LOTO procedure prior to entering machine enclosure.',
            before_image: null,
            after_image: null,
            before_description: 'Unsafe access during maintenance.',
            after_description: 'Locked out energy sources with red tag applied.',
            classification: 'Basic Condition',
            submitted_by: 'Rajesh Kumar (ID: EMP-002)',
            status: 'approved',
            plant_name: 'TVT',
            jh_group_name: 'Alpha Team',
            is_star: true,
            rejection_reason: null,
            timestamp: new Date(Date.now() - 3600000 * 48).toISOString()
        },
        {
            opl_id: 5,
            title: 'Obsolete Solvent Disposal Standard',
            content: 'Dispose chemical solvent in plastic container without grounding wire.',
            before_image: null,
            after_image: null,
            before_description: 'Improper storage container.',
            after_description: 'Non-compliant disposal protocol.',
            classification: 'Basic Condition',
            submitted_by: 'Apprentice Worker',
            status: 'rejected',
            plant_name: 'UPF',
            jh_group_name: 'Gamma Team',
            is_star: false,
            rejection_reason: 'BE Lead Ankit Srivastava: Violates factory environmental safety guidelines.',
            timestamp: new Date(Date.now() - 3600000 * 72).toISOString()
        },
        {
            opl_id: 6,
            title: 'Autonomous Maintenance Inspection Checklist for Ink Pumps',
            content: 'Perform daily visual inspection for diaphragm seal wear and pneumatic line pressure.',
            before_image: null,
            after_image: null,
            before_description: 'Frequent pump pressure drops during shift.',
            after_description: 'Consistent 4.5 bar operating pressure maintained.',
            classification: 'Basic Condition',
            submitted_by: 'Manan Gupta',
            status: 'approved',
            plant_name: 'NPF',
            jh_group_name: 'Beta Team',
            is_star: false,
            rejection_reason: null,
            timestamp: new Date(Date.now() - 3600000 * 30).toISOString()
        },
        {
            opl_id: 7,
            title: 'Die-Cutter Pressure Calibration & Safety Guard Standard',
            content: 'Calibrate pressure sensors to zero benchmark before loading new cutting matrix.',
            before_image: null,
            after_image: null,
            before_description: 'Inconsistent creasing depth across sheet width.',
            after_description: 'Uniform creasing with verified safety interlock.',
            classification: 'Improvement',
            submitted_by: 'Ankit Srivastava',
            status: 'approved',
            plant_name: 'UPF',
            jh_group_name: 'Gamma Team',
            is_star: true,
            rejection_reason: null,
            timestamp: new Date(Date.now() - 3600000 * 18).toISOString()
        },
        {
            opl_id: 8,
            title: 'Emergency Stop Reset and Safety Recovery Protocol',
            content: 'Complete visual inspection around nip points before resetting safety relay switch.',
            before_image: null,
            after_image: null,
            before_description: 'Immediate restart without verifying perimeter clear.',
            after_description: 'Safe 2-person verification step added.',
            classification: 'Basic Condition',
            submitted_by: 'Rajesh Kumar',
            status: 'approved',
            plant_name: 'MPF',
            jh_group_name: 'Delta Team',
            is_star: false,
            rejection_reason: null,
            timestamp: new Date(Date.now() - 3600000 * 96).toISOString()
        }
    ],
    oplAuditTrail: [
        {
            id: 'audit-1',
            opl_id: '1',
            action: 'created',
            status_from: null,
            status_to: 'draft',
            submitted_by_from: null,
            submitted_by_to: 'Plant Admin',
            performed_by: 'Plant Admin',
            comments: 'Initial draft created',
            changed_fields: null,
            timestamp: new Date(Date.now() - 3600000 * 24 * 3).toISOString()
        },
        {
            id: 'audit-2',
            opl_id: '2',
            action: 'submitted_for_review',
            status_from: 'draft',
            status_to: 'pending_jh_review',
            submitted_by_from: 'Manan Gupta (ID: 136109)',
            submitted_by_to: 'Manan Gupta (ID: 136109)',
            performed_by: 'Manan Gupta (ID: 136109)',
            comments: 'Submitted for JH Group Lead review',
            changed_fields: null,
            timestamp: new Date(Date.now() - 3600000 * 12).toISOString()
        },
        {
            id: 'audit-3',
            opl_id: '3',
            action: 'jh_rejected',
            status_from: 'pending_jh_review',
            status_to: 'rejected',
            submitted_by_from: 'Operator Worker',
            submitted_by_to: 'Operator Worker',
            performed_by: 'Rajesh Kumar (JH Lead)',
            comments: 'JH Lead Rajesh Kumar: Please verify torque spec against OEM manual.',
            changed_fields: { rejection_reason: 'Please verify torque spec against OEM manual.' },
            timestamp: new Date(Date.now() - 3600000 * 6).toISOString()
        },
        {
            id: 'audit-4',
            opl_id: '4',
            action: 'jh_accepted',
            status_from: 'pending_jh_review',
            status_to: 'approved',
            submitted_by_from: 'Rajesh Kumar (ID: EMP-002)',
            submitted_by_to: 'Rajesh Kumar (ID: EMP-002)',
            performed_by: 'Rajesh Kumar (JH Lead)',
            comments: 'Approved by JH Lead',
            changed_fields: null,
            timestamp: new Date(Date.now() - 3600000 * 48).toISOString()
        },
        {
            id: 'audit-5',
            opl_id: '5',
            action: 'be_rejected',
            status_from: 'pending_be_review',
            status_to: 'rejected',
            submitted_by_from: 'Apprentice Worker',
            submitted_by_to: 'Apprentice Worker',
            performed_by: 'Ankit Srivastava (BE Lead)',
            comments: 'BE Lead Ankit Srivastava: Violates factory environmental safety guidelines.',
            changed_fields: { rejection_reason: 'Violates factory environmental safety guidelines.' },
            timestamp: new Date(Date.now() - 3600000 * 72).toISOString()
        }
    ],
    oplTrainingEvents: [],
    kaizens: [
        {
            id: 'kz-1',
            factory_id: '00000000-0000-0000-0000-000000000001',
            jh_group_id: 'jhg-1',
            author_worker_id: '11111111-1111-1111-1111-111111111111',
            team_member_ids: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
            title: 'Quick Changeover Jig for Blade Replacement',
            description: 'Reduced setup time from 25 mins to 12 mins.',
            before_remarks: 'Manual wrench alignment taking 25 minutes',
            after_remarks: 'Magnetic quick guide alignment fixture',
            before_image_url: null,
            after_image_url: null,
            status: 'approved',
            created_at: new Date().toISOString()
        }
    ],
    zones: [],
    auditTemplates: [],
    auditTemplateQuestions: [],
    auditSchedules: [],
    auditScheduleAuditors: [],
    auditSubmissions: [],
    auditResponses: [],
    auditSubmissionCategoryScores: [],
};
// ----------------------------------------------------------------------------
// Express REST API Routes (/api/*)
// ----------------------------------------------------------------------------
// 1. Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: pool ? 'postgres' : 'in-memory-preview' });
});
// Resolves a user's JH group either via membership (jh_groups_list) or, for JH
// leaders who aren't also listed as a member, via jh_group.leader_emp_id.
async function resolveUserJhGroupId(empId) {
    if (!empId || !pool) return null;
    const memberRows = await query(
        'SELECT jh_group_id FROM jh_groups_list WHERE emp_id = $1 ORDER BY created_at ASC LIMIT 1',
        [empId]
    );
    if (memberRows[0]?.jh_group_id) return memberRows[0].jh_group_id;
    const leaderRows = await query('SELECT id FROM jh_group WHERE leader_emp_id = $1 LIMIT 1', [empId]);
    return leaderRows[0]?.id || null;
}
// 2. Auth Routes
app.post('/api/auth/login', async (req, res) => {
    const { email, employee_id, password } = req.body;
    if (!email && !employee_id) {
        return res.status(400).json({ error: 'email or employee_id is required' });
    }
    if (!password) {
        return res.status(400).json({ error: 'password is required' });
    }
    try {
        if (pool) {
            const rows = await query('SELECT * FROM user_details WHERE (email = $1 OR emp_id = $2 OR emp_id = $1) AND is_active = true LIMIT 1', [email || '', employee_id || email || '']);
            const found = rows[0];
            if (!found || !found.password_hash || !(await bcrypt.compare(password, found.password_hash))) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            const jhGroupId = await resolveUserJhGroupId(found.emp_id);
            const u = { ...found, id: found.emp_id, employee_id: found.emp_id, jh_group_id: jhGroupId };
            delete u.password_hash;
            return res.json({ user: u, token: `token-${u.emp_id}` });
        }
        const user = mockDb.userDetails.find(u => (email && u.email === email) || (employee_id && u.emp_id === employee_id));
        if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const resUser = { ...user, id: user.emp_id, employee_id: user.emp_id };
        delete resUser.password_hash;
        res.json({ user: resUser, token: `token-${user.emp_id}` });
    }
    catch {
        res.status(500).json({ error: 'Login failed' });
    }
});
app.get('/api/auth/me', async (req, res) => {
    const workerId = req.headers['x-worker-id'];
    if (!workerId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    try {
        if (pool) {
            const rows = await query('SELECT * FROM user_details WHERE emp_id = $1 OR email = $1 LIMIT 1', [workerId]);
            if (rows.length > 0) {
                const jhGroupId = await resolveUserJhGroupId(rows[0].emp_id);
                const u = { ...rows[0], id: rows[0].emp_id, employee_id: rows[0].emp_id, jh_group_id: jhGroupId };
                return res.json([u]);
            }
            return res.status(404).json({ error: 'Worker not found' });
        }
        const user = mockDb.userDetails.find(u => u.emp_id === workerId || u.email === workerId);
        if (!user) {
            return res.status(404).json({ error: 'Worker not found' });
        }
        const resUser = { ...user, id: user.emp_id, employee_id: user.emp_id };
        res.json([resUser]);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch worker context' });
    }
});
app.post('/api/auth/set-language', async (req, res) => {
    const { lang, worker_id } = req.body;
    res.json({ success: true, lang });
});
// 3. Workers / People MDM
app.get('/api/workers', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT *, emp_id AS id, emp_id AS employee_id FROM user_details ORDER BY name ASC');
            return res.json(rows);
        }
        res.json(mockDb.userDetails.map(u => ({ ...u, id: u.emp_id, employee_id: u.emp_id })));
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch workers' });
    }
});
app.get('/api/departments', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT id, name, factory_id FROM departments WHERE is_active = true ORDER BY name ASC');
            return res.json(rows);
        }
        res.json([]);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});
app.get('/api/worker-names', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT emp_id AS id, name, emp_id AS employee_id, role, is_active FROM user_details WHERE is_active = true ORDER BY name ASC');
            return res.json(rows);
        }
        res.json(mockDb.userDetails.map(w => ({ id: w.emp_id, name: w.name, employee_id: w.emp_id, role: w.role, is_active: w.is_active })));
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch worker names' });
    }
});

// Helper function to resolve factory ID from plant name/code/ID string
async function resolveFactoryId(plantInput) {
    if (!plantInput) return '1';
    if (pool) {
        try {
            const rows = await query(
                'SELECT id FROM factory WHERE id = $1 OR LOWER(code) = LOWER($1) OR LOWER(name) = LOWER($1) LIMIT 1',
                [plantInput]
            );
            if (rows.length > 0) return rows[0].id;
            const defaultRows = await query('SELECT id FROM factory WHERE is_active = true ORDER BY id ASC LIMIT 1');
            return defaultRows.length > 0 ? defaultRows[0].id : '1';
        } catch {
            return '1';
        }
    }
    const f = mockDb.factories.find(fac => 
        fac.id === plantInput || 
        fac.code?.toLowerCase() === plantInput.toLowerCase() || 
        fac.name?.toLowerCase() === plantInput.toLowerCase()
    );
    return f ? f.id : (mockDb.factories[0]?.id || '1');
}

// Resolve which module (SFM/RFM/Labels/Flexibles/PPB) an emp_id belongs to, via the
// person's own user_details.module_id — independent of their department.
async function resolveUserModuleId(empId) {
    if (!empId || !pool) return null;
    const rows = await query(
        `SELECT ud.module_id, m.name AS module_name
         FROM user_details ud
         LEFT JOIN modules m ON m.id = ud.module_id
         WHERE ud.emp_id = $1 LIMIT 1`,
        [empId]
    );
    return rows[0]?.module_id ? rows[0] : null; // { module_id, module_name } or null (no module assigned)
}

app.post('/api/workers', async (req, res) => {
    const { name, email, employee_id, role, default_plant, factory_id } = req.body;
    const empId = employee_id || `EMP-${Date.now().toString().slice(-4)}`;
    const targetPlant = factory_id || default_plant || 'TVT';
    try {
        const resolvedFactoryId = await resolveFactoryId(targetPlant);
        const newUser = {
            emp_id: empId,
            id: empId,
            employee_id: empId,
            name,
            email: email || null,
            role: role || 'operator',
            default_plant: targetPlant,
            is_active: true,
            created_at: new Date().toISOString()
        };
        if (pool) {
            const rows = await query(`INSERT INTO user_details (emp_id, name, email, role, default_plant)
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT (emp_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role, default_plant = EXCLUDED.default_plant
         RETURNING *, emp_id AS id, emp_id AS employee_id`, [empId, name, email || null, role || 'operator', targetPlant]);

            if (resolvedFactoryId) {
                await query(`
                    INSERT INTO user_plant_access (emp_id, factory_id, is_active)
                    VALUES ($1, $2, true)
                    ON CONFLICT (emp_id, factory_id) DO UPDATE SET is_active = true
                `, [empId, resolvedFactoryId]);
            }
            return res.json(rows[0]);
        }

        const existingIdx = mockDb.userDetails.findIndex(u => u.emp_id === empId);
        if (existingIdx >= 0) {
            mockDb.userDetails[existingIdx] = newUser;
        } else {
            mockDb.userDetails.push(newUser);
        }

        if (resolvedFactoryId) {
            const existingUpa = mockDb.userPlantAccess.find(upa => upa.emp_id === empId && upa.factory_id === resolvedFactoryId);
            if (!existingUpa) {
                mockDb.userPlantAccess.push({
                    id: `upa-${Date.now()}`,
                    emp_id: empId,
                    factory_id: resolvedFactoryId,
                    is_active: true
                });
            } else {
                existingUpa.is_active = true;
            }
        }
        res.json(newUser);
    }
    catch (err) {
        console.error('Error creating worker:', err);
        res.status(500).json({ error: 'Failed to create worker' });
    }
});
app.patch('/api/workers/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        if (pool) {
            const fields = Object.keys(updates).map((k, idx) => `${k} = $${idx + 2}`).join(', ');
            const values = Object.values(updates);
            const rows = await query(`UPDATE user_details SET ${fields} WHERE emp_id = $1 RETURNING *, emp_id AS id, emp_id AS employee_id`, [id, ...values]);
            return res.json(rows[0]);
        }
        const idx = mockDb.userDetails.findIndex(w => w.emp_id === id);
        if (idx !== -1) {
            mockDb.userDetails[idx] = { ...mockDb.userDetails[idx], ...updates };
            const u = mockDb.userDetails[idx];
            return res.json({ ...u, id: u.emp_id, employee_id: u.emp_id });
        }
        res.status(404).json({ error: 'Worker not found' });
    }
    catch {
        res.status(500).json({ error: 'Failed to update worker' });
    }
});
// 4. Org Structure & Modules
app.get('/api/org/factories', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM factory WHERE is_active = true');
            return res.json(rows);
        }
        res.json(mockDb.factories);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch factories' });
    }
});
app.get('/api/org/areas', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM area ORDER BY name ASC');
            return res.json(rows);
        }
        res.json(mockDb.areas);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch areas' });
    }
});
// Self-healing: jh_group / module_groups gained a `level` column (Level 1/2/3) after the
// tables existed. Additive, default 1 so existing rows are Level 1.
let _orgLevelSchemaEnsured = false;
async function ensureOrgLevelSchema() {
    if (_orgLevelSchemaEnsured || !pool) return;
    try {
        await query('ALTER TABLE jh_group ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1');
        await query('ALTER TABLE module_groups ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1');
        _orgLevelSchemaEnsured = true;
    } catch (e) {
        console.error('ensureOrgLevelSchema failed:', e.message);
    }
}
const clampLevel = (v) => {
    const n = Math.round(Number(v));
    return (n === 1 || n === 2 || n === 3) ? n : 1;
};

app.get('/api/org/jh-groups', async (req, res) => {
    const { module_group_id } = req.query;
    try {
        if (pool) {
            await ensureOrgLevelSchema();
            let sql = 'SELECT * FROM jh_group';
            const params = [];
            if (module_group_id) {
                sql += ' WHERE module_group_id = $1';
                params.push(module_group_id);
            }
            sql += ' ORDER BY name ASC';
            const rows = await query(sql, params);
            return res.json(rows);
        }
        let list = mockDb.jhGroups;
        if (module_group_id) {
            list = list.filter(g => g.module_group_id === module_group_id);
        }
        res.json(list);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch JH groups' });
    }
});
app.post('/api/org/jh-groups', async (req, res) => {
    const { name, module_group_id, factory_id, leader_emp_id, leader_name, level } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
    }
    try {
        if (pool) {
            await ensureOrgLevelSchema();
            const rows = await query(`
                INSERT INTO jh_group (name, module_group_id, factory_id, leader_emp_id, leader_name, is_active, level)
                VALUES ($1, $2, $3, $4, $5, true, $6)
                RETURNING *
            `, [name, module_group_id || null, factory_id || null, leader_emp_id || null, leader_name || null, clampLevel(level)]);
            if (rows[0] && leader_emp_id) {
                await query(
                    `INSERT INTO jh_group_membership_history (jh_group_id, emp_id, role, joined_at)
                     VALUES ($1, $2, 'leader', NOW())`,
                    [rows[0].id, leader_emp_id]
                ).catch(() => {});
            }
            return res.json(rows[0]);
        }
        const newGroup = {
            id: 'jhg-' + Date.now(),
            name,
            module_group_id: module_group_id || '',
            factory_id: factory_id || '',
            leader_emp_id: leader_emp_id || '',
            leader_name: leader_name || '',
            is_active: true,
            created_at: new Date().toISOString()
        };
        mockDb.jhGroups.push(newGroup);
        res.json(newGroup);
    }
    catch {
        res.status(500).json({ error: 'Failed to create JH group' });
    }
});
app.patch('/api/org/jh-groups/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const role = (await query('SELECT role FROM user_details WHERE emp_id = $1', [requesterEmpId]))[0]?.role || '';
        if (!BE_LEAD_ROLES.has(role) && role !== 'admin') {
            return res.status(403).json({ error: 'Only a BE Lead can edit JH groups' });
        }
        await ensureOrgLevelSchema();
        const { name, level } = req.body;
        const sets = [];
        const params = [];
        if (name !== undefined && String(name).trim()) { params.push(String(name).trim()); sets.push(`name = $${params.length}`); }
        if (level !== undefined) { params.push(clampLevel(level)); sets.push(`level = $${params.length}`); }
        if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
        params.push(req.params.id);
        const rows = await query(`UPDATE jh_group SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
        if (!rows[0]) return res.status(404).json({ error: 'JH group not found' });
        res.json(rows[0]);
    } catch (e) {
        console.error('Error updating JH group:', e);
        res.status(500).json({ error: 'Failed to update JH group' });
    }
});
app.delete('/api/org/jh-groups/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (pool) {
            await query('DELETE FROM jh_group WHERE id = $1', [id]);
            return res.json({ success: true });
        }
        const idx = mockDb.jhGroups.findIndex(g => g.id === id);
        if (idx !== -1) mockDb.jhGroups.splice(idx, 1);
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'Failed to delete JH group' });
    }
});

// JH Groups Member List Endpoints
app.get('/api/org/jh-groups-list', async (req, res) => {
    const { jh_group_id } = req.query;
    try {
        if (pool) {
            let sql = `
                SELECT jgl.*, ud.name as worker_name, ud.email
                FROM jh_groups_list jgl
                LEFT JOIN user_details ud ON jgl.emp_id = ud.emp_id
            `;
            const params = [];
            if (jh_group_id) {
                sql += ' WHERE jgl.jh_group_id = $1';
                params.push(jh_group_id);
            }
            sql += ' ORDER BY jgl.created_at ASC';
            const rows = await query(sql, params);
            return res.json(rows);
        }
        let list = mockDb.jhGroupsList || [];
        if (jh_group_id) {
            list = list.filter(m => m.jh_group_id === jh_group_id);
        }
        res.json(list);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch JH group members list' });
    }
});

app.post('/api/org/jh-groups-list', async (req, res) => {
    const { jh_group_id, emp_id, worker_name, role } = req.body;
    if (!jh_group_id || !emp_id) {
        return res.status(400).json({ error: 'jh_group_id and emp_id are required' });
    }
    try {
        if (pool) {
            const rows = await query(`
                INSERT INTO jh_groups_list (jh_group_id, emp_id, worker_name, role)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (jh_group_id, emp_id) DO UPDATE SET role = EXCLUDED.role, worker_name = EXCLUDED.worker_name
                RETURNING *
            `, [jh_group_id, emp_id, worker_name || null, role || 'member']);
            // Open a new membership-history record only if this person doesn't already have
            // an open one for this group — re-adding someone who never left is a no-op here.
            await query(
                `INSERT INTO jh_group_membership_history (jh_group_id, emp_id, role, joined_at)
                 SELECT $1, $2, $3, NOW()
                 WHERE NOT EXISTS (
                     SELECT 1 FROM jh_group_membership_history
                     WHERE jh_group_id = $1 AND emp_id = $2 AND left_at IS NULL
                 )`,
                [jh_group_id, emp_id, role || 'member']
            ).catch(() => {});
            return res.json(rows[0]);
        }
        if (!mockDb.jhGroupsList) mockDb.jhGroupsList = [];
        const existingIdx = mockDb.jhGroupsList.findIndex(m => m.jh_group_id === jh_group_id && m.emp_id === emp_id);
        if (existingIdx !== -1) {
            mockDb.jhGroupsList[existingIdx].role = role || 'member';
            if (worker_name) mockDb.jhGroupsList[existingIdx].worker_name = worker_name;
            return res.json(mockDb.jhGroupsList[existingIdx]);
        }
        const newMember = {
            id: 'jhgl-' + Date.now(),
            jh_group_id,
            emp_id,
            worker_name: worker_name || emp_id,
            role: role || 'member',
            created_at: new Date().toISOString()
        };
        mockDb.jhGroupsList.push(newMember);
        res.json(newMember);
    }
    catch {
        res.status(500).json({ error: 'Failed to add JH group member' });
    }
});

app.delete('/api/org/jh-groups-list/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (pool) {
            const existingRows = await query('SELECT jh_group_id, emp_id FROM jh_groups_list WHERE id = $1', [id]);
            const existing = existingRows[0];
            await query('DELETE FROM jh_groups_list WHERE id = $1', [id]);
            if (existing) {
                // Close the open membership-history record so past months correctly still
                // count this person as a member up to today, and future months don't.
                await query(
                    `UPDATE jh_group_membership_history SET left_at = NOW()
                     WHERE jh_group_id = $1 AND emp_id = $2 AND left_at IS NULL`,
                    [existing.jh_group_id, existing.emp_id]
                ).catch(() => {});
            }
            return res.json({ success: true });
        }
        if (mockDb.jhGroupsList) {
            const idx = mockDb.jhGroupsList.findIndex(m => m.id === id);
            if (idx !== -1) mockDb.jhGroupsList.splice(idx, 1);
        }
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'Failed to remove JH group member' });
    }
});

// DMT Members List Endpoints
app.get('/api/org/dmt-members-list', async (req, res) => {
    const { module_group_id, dmt_id } = req.query;
    const groupId = module_group_id || dmt_id;
    try {
        if (pool) {
            await query(`
                CREATE TABLE IF NOT EXISTS dmt_members_list (
                    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                    module_group_id text NOT NULL,
                    emp_id text NOT NULL,
                    worker_name text,
                    role text DEFAULT 'member',
                    created_at timestamp with time zone DEFAULT now() NOT NULL,
                    CONSTRAINT dmt_members_list_group_emp_key UNIQUE (module_group_id, emp_id)
                )
            `);
            let sql = `
                SELECT dml.*, ud.name as worker_name, ud.email
                FROM dmt_members_list dml
                LEFT JOIN user_details ud ON dml.emp_id = ud.emp_id
            `;
            const params = [];
            if (groupId) {
                sql += ' WHERE dml.module_group_id = $1';
                params.push(groupId);
            }
            sql += ' ORDER BY dml.created_at ASC';
            const rows = await query(sql, params);
            return res.json(rows);
        }
        let list = mockDb.dmtMembersList || [];
        if (groupId) {
            list = list.filter(m => m.module_group_id === groupId || m.dmt_id === groupId);
        }
        res.json(list);
    }
    catch (err) {
        console.error('Error fetching DMT members:', err);
        res.status(500).json({ error: 'Failed to fetch DMT members list' });
    }
});

app.post('/api/org/dmt-members-list', async (req, res) => {
    const { module_group_id, dmt_id, emp_id, worker_name, role } = req.body;
    const groupId = module_group_id || dmt_id;
    if (!groupId || !emp_id) {
        return res.status(400).json({ error: 'module_group_id and emp_id are required' });
    }
    try {
        if (pool) {
            await query(`
                CREATE TABLE IF NOT EXISTS dmt_members_list (
                    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                    module_group_id text NOT NULL,
                    emp_id text NOT NULL,
                    worker_name text,
                    role text DEFAULT 'member',
                    created_at timestamp with time zone DEFAULT now() NOT NULL,
                    CONSTRAINT dmt_members_list_group_emp_key UNIQUE (module_group_id, emp_id)
                )
            `);
            const rows = await query(`
                INSERT INTO dmt_members_list (module_group_id, emp_id, worker_name, role)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (module_group_id, emp_id) DO UPDATE SET role = EXCLUDED.role, worker_name = EXCLUDED.worker_name
                RETURNING *
            `, [groupId, emp_id, worker_name || null, role || 'member']);
            return res.json(rows[0]);
        }
        if (!mockDb.dmtMembersList) mockDb.dmtMembersList = [];
        const existingIdx = mockDb.dmtMembersList.findIndex(m => (m.module_group_id === groupId || m.dmt_id === groupId) && m.emp_id === emp_id);
        if (existingIdx !== -1) {
            mockDb.dmtMembersList[existingIdx].role = role || 'member';
            if (worker_name) mockDb.dmtMembersList[existingIdx].worker_name = worker_name;
            return res.json(mockDb.dmtMembersList[existingIdx]);
        }
        const newMember = {
            id: 'dmtml-' + Date.now(),
            module_group_id: groupId,
            emp_id,
            worker_name: worker_name || emp_id,
            role: role || 'member',
            created_at: new Date().toISOString()
        };
        mockDb.dmtMembersList.push(newMember);
        res.json(newMember);
    }
    catch (err) {
        console.error('Error adding DMT member:', err);
        res.status(500).json({ error: 'Failed to add DMT member' });
    }
});

app.delete('/api/org/dmt-members-list/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (pool) {
            await query('DELETE FROM dmt_members_list WHERE id = $1', [id]);
            return res.json({ success: true });
        }
        if (mockDb.dmtMembersList) {
            const idx = mockDb.dmtMembersList.findIndex(m => m.id === id);
            if (idx !== -1) mockDb.dmtMembersList.splice(idx, 1);
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting DMT member:', err);
        res.status(500).json({ error: 'Failed to remove DMT member' });
    }
});

// Approval Routing Endpoints
app.get('/api/org/approval-routing', async (req, res) => {
    const { factory_id, jh_group_id } = req.query;
    try {
        if (pool) {
            await query(`
                CREATE TABLE IF NOT EXISTS approval_routing (
                    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                    factory_id text,
                    jh_group_id text NOT NULL,
                    entity_type text NOT NULL,
                    approver_emp_id text,
                    approver_name text,
                    approver_role text DEFAULT 'jh_leader',
                    is_active boolean DEFAULT true,
                    updated_at timestamp with time zone DEFAULT now() NOT NULL,
                    CONSTRAINT approval_routing_jh_entity_key UNIQUE (jh_group_id, entity_type)
                )
            `);
            let sql = 'SELECT * FROM approval_routing WHERE 1=1';
            const params = [];
            if (factory_id) {
                params.push(factory_id);
                sql += ` AND factory_id = $${params.length}`;
            }
            if (jh_group_id) {
                params.push(jh_group_id);
                sql += ` AND jh_group_id = $${params.length}`;
            }
            const rows = await query(sql, params);
            return res.json(rows);
        }
        if (!mockDb.approvalRoutings) mockDb.approvalRoutings = [];
        let list = mockDb.approvalRoutings;
        if (factory_id) {
            list = list.filter(r => r.factory_id === factory_id);
        }
        if (jh_group_id) {
            list = list.filter(r => r.jh_group_id === jh_group_id);
        }
        res.json(list);
    } catch (err) {
        console.error('Error fetching approval routing:', err);
        res.status(500).json({ error: 'Failed to fetch approval routing' });
    }
});

app.post('/api/org/approval-routing', async (req, res) => {
    const { factory_id, jh_group_id, routings } = req.body;
    if (!jh_group_id || !Array.isArray(routings)) {
        return res.status(400).json({ error: 'jh_group_id and routings array are required' });
    }
    try {
        if (pool) {
            const authorized = await authorizeWorkflowConfigWrite(req, res, { jhGroupId: jh_group_id, factoryId: factory_id });
            if (!authorized) return;
            await query(`
                CREATE TABLE IF NOT EXISTS approval_routing (
                    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                    factory_id text,
                    jh_group_id text NOT NULL,
                    entity_type text NOT NULL,
                    approver_emp_id text,
                    approver_name text,
                    approver_role text DEFAULT 'jh_leader',
                    is_active boolean DEFAULT true,
                    updated_at timestamp with time zone DEFAULT now() NOT NULL,
                    CONSTRAINT approval_routing_jh_entity_key UNIQUE (jh_group_id, entity_type)
                )
            `);
            const savedResults = [];
            for (const r of routings) {
                const { entity_type, approver_emp_id, approver_name, approver_role } = r;
                if (!entity_type) continue;
                const rows = await query(`
                    INSERT INTO approval_routing (factory_id, jh_group_id, entity_type, approver_emp_id, approver_name, approver_role, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, now())
                    ON CONFLICT (jh_group_id, entity_type) DO UPDATE SET
                        factory_id = EXCLUDED.factory_id,
                        approver_emp_id = EXCLUDED.approver_emp_id,
                        approver_name = EXCLUDED.approver_name,
                        approver_role = EXCLUDED.approver_role,
                        updated_at = now()
                    RETURNING *
                `, [factory_id || null, jh_group_id, entity_type, approver_emp_id || null, approver_name || null, approver_role || 'jh_leader']);
                savedResults.push(rows[0]);
            }
            return res.json({ success: true, routings: savedResults });
        }
        if (!mockDb.approvalRoutings) mockDb.approvalRoutings = [];
        for (const r of routings) {
            const { entity_type, approver_emp_id, approver_name, approver_role } = r;
            if (!entity_type) continue;
            const idx = mockDb.approvalRoutings.findIndex(ar => ar.jh_group_id === jh_group_id && ar.entity_type === entity_type);
            const item = {
                id: idx !== -1 ? mockDb.approvalRoutings[idx].id : 'ar-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
                factory_id: factory_id || null,
                jh_group_id,
                entity_type,
                approver_emp_id: approver_emp_id || null,
                approver_name: approver_name || null,
                approver_role: approver_role || 'jh_leader',
                updated_at: new Date().toISOString()
            };
            if (idx !== -1) {
                mockDb.approvalRoutings[idx] = item;
            } else {
                mockDb.approvalRoutings.push(item);
            }
        }
        res.json({ success: true, routings: mockDb.approvalRoutings.filter(ar => ar.jh_group_id === jh_group_id) });
    } catch (err) {
        console.error('Error saving approval routing:', err);
        res.status(500).json({ error: 'Failed to save approval routing' });
    }
});

// OPL Workflow Stages — the admin-editable, ordered list of review stages an OPL passes
// through for a given factory. Structure only (name + order); WHO approves each stage is
// still configured per JH group via /api/org/approval-routing, entity_type 'opl' (stage 1)
// or 'opl_stage_N' (stage N).
app.get('/api/org/opl-workflow-stages', async (req, res) => {
    const { factory_id } = req.query;
    if (!factory_id) {
        return res.status(400).json({ error: 'factory_id is required' });
    }
    try {
        const stages = await resolveOplStages(factory_id);
        res.json(stages);
    } catch (err) {
        console.error('Error fetching OPL workflow stages:', err);
        res.status(500).json({ error: 'Failed to fetch OPL workflow stages' });
    }
});

app.post('/api/org/opl-workflow-stages', async (req, res) => {
    const { factory_id, stages } = req.body;
    if (!factory_id || !Array.isArray(stages) || stages.length === 0) {
        return res.status(400).json({ error: 'factory_id and a non-empty stages array are required' });
    }
    try {
        if (pool) {
            const authorized = await authorizeWorkflowConfigWrite(req, res, { factoryId: factory_id });
            if (!authorized) return;

            // Refuse to shrink the stage list out from under an OPL that's actively sitting
            // on a stage number that would no longer exist — block, don't silently reassign.
            const strandedRows = await query(
                `SELECT opl_id FROM opl_details WHERE factory_id = $1 AND status NOT IN ('approved', 'rejected') AND current_stage_order > $2`,
                [factory_id, stages.length]
            );
            if (strandedRows.length > 0) {
                return res.status(409).json({
                    error: `${strandedRows.length} OPL item(s) are currently at a review stage this change would remove. Resolve those reviews first.`,
                    opl_ids: strandedRows.map((r) => r.opl_id),
                });
            }

            await query('DELETE FROM opl_workflow_stage WHERE factory_id = $1', [factory_id]);
            const saved = [];
            for (let i = 0; i < stages.length; i++) {
                const order = i + 1;
                const name = String(stages[i]?.stage_name || `Stage ${order}`).trim() || `Stage ${order}`;
                const rows = await query(
                    `INSERT INTO opl_workflow_stage (factory_id, stage_order, stage_name, updated_by, updated_at)
                     VALUES ($1, $2, $3, $4, now()) RETURNING *`,
                    [factory_id, order, name, authorized]
                );
                saved.push(rows[0]);
            }
            // Drop any per-JH-group routing rows left over for stages that no longer exist
            // (e.g. an admin deleted stage 3 — its 'opl_stage_3' routing entries are now orphaned).
            const validEntityTypes = saved.map((s) => (s.stage_order === 1 ? 'opl' : `opl_stage_${s.stage_order}`));
            await query(
                `DELETE FROM approval_routing WHERE factory_id = $1 AND entity_type ~ '^opl(_stage_[0-9]+)?$' AND entity_type <> ALL($2::text[])`,
                [factory_id, validEntityTypes]
            );
            return res.json({ success: true, stages: saved });
        }
        res.json({ success: true, stages });
    } catch (err) {
        console.error('Error saving OPL workflow stages:', err);
        res.status(500).json({ error: 'Failed to save OPL workflow stages' });
    }
});

// Generalized version of the OPL workflow-stage endpoints above, for Kaizen/Abnormality's two
// review phases each. See resolveModulePhaseStages/WORKFLOW_STAGE_FLOOR for the floor-stage
// convention (Kaizen phase 2 has a 2-stage floor; every other phase has 1).
const WORKFLOW_STAGE_MODULES = new Set(['kaizen', 'abnormality']);
app.get('/api/org/workflow-stages', async (req, res) => {
    const { factory_id, module: moduleName, phase } = req.query;
    const phaseNum = Number(phase);
    if (!factory_id || !WORKFLOW_STAGE_MODULES.has(moduleName) || (phaseNum !== 1 && phaseNum !== 2)) {
        return res.status(400).json({ error: 'factory_id, module (kaizen|abnormality), and phase (1|2) are required' });
    }
    try {
        const stages = await resolveModulePhaseStages(factory_id, moduleName, phaseNum);
        res.json(stages);
    } catch (err) {
        console.error('Error fetching workflow stages:', err);
        res.status(500).json({ error: 'Failed to fetch workflow stages' });
    }
});
app.post('/api/org/workflow-stages', async (req, res) => {
    const { factory_id, module: moduleName, phase, stages } = req.body;
    const phaseNum = Number(phase);
    if (!factory_id || !WORKFLOW_STAGE_MODULES.has(moduleName) || (phaseNum !== 1 && phaseNum !== 2) || !Array.isArray(stages) || stages.length === 0) {
        return res.status(400).json({ error: 'factory_id, module (kaizen|abnormality), phase (1|2), and a non-empty stages array are required' });
    }
    const floor = WORKFLOW_STAGE_FLOOR[`${moduleName}_${phaseNum}`];
    if (stages.length < floor.length) {
        return res.status(400).json({ error: `${moduleName} phase ${phaseNum} requires at least ${floor.length} stage(s)` });
    }
    try {
        if (pool) {
            const authorized = await authorizeWorkflowConfigWrite(req, res, { factoryId: factory_id });
            if (!authorized) return;

            const detailsTable = moduleName === 'kaizen' ? 'kaizen_details' : 'abnormalities_details';
            // Phase 1 items are anything not yet past the submitter's own implementation/closure
            // step; phase 2 items are past it. Only block shrinking the ladder out from under an
            // item that's actually IN that phase right now.
            const phaseStatusFilter = moduleName === 'kaizen'
                ? (phaseNum === 1 ? `status IN ('proposed','submitted','pending_review')` : `status = 'submitted_for_confirmation'`)
                : (phaseNum === 1 ? `status = 'pending_review'` : `status IN ('assigned','pending_dmt_review')`);
            const strandedRows = await query(
                `SELECT * FROM ${detailsTable} WHERE factory_id = $1 AND ${phaseStatusFilter} AND current_stage_order > $2`,
                [factory_id, stages.length]
            );
            if (strandedRows.length > 0) {
                return res.status(409).json({
                    error: `${strandedRows.length} item(s) are currently at a review stage this change would remove. Resolve those reviews first.`,
                });
            }

            await query('DELETE FROM workflow_stage WHERE factory_id = $1 AND module = $2 AND phase = $3', [factory_id, moduleName, phaseNum]);
            const saved = [];
            for (let i = 0; i < stages.length; i++) {
                const order = i + 1;
                const name = String(stages[i]?.stage_name || `Reviewer ${order}`).trim() || `Reviewer ${order}`;
                const rows = await query(
                    `INSERT INTO workflow_stage (factory_id, module, phase, stage_order, stage_name, updated_by, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING *`,
                    [factory_id, moduleName, phaseNum, order, name, authorized]
                );
                saved.push(rows[0]);
            }
            // Drop any per-JH-group routing rows left over for stages that no longer exist.
            const validEntityTypes = saved.map((s, i) => (i < floor.length ? floor[i] : `${moduleName}_p${phaseNum}_stage_${s.stage_order}`));
            const suffixPattern = `^${moduleName}_p${phaseNum}_stage_[0-9]+$`;
            await query(
                `DELETE FROM approval_routing WHERE factory_id = $1 AND entity_type ~ $2 AND entity_type <> ALL($3::text[])`,
                [factory_id, suffixPattern, validEntityTypes]
            );
            return res.json({ success: true, stages: saved });
        }
        res.json({ success: true, stages });
    } catch (err) {
        console.error('Error saving workflow stages:', err);
        res.status(500).json({ error: 'Failed to save workflow stages' });
    }
});

app.get('/api/org/module-names', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM modules ORDER BY name ASC');
            return res.json(rows);
        }
        res.json(mockDb.moduleNames);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch module names' });
    }
});
app.get('/api/org/module-groups', async (req, res) => {
    try {
        if (pool) {
            await ensureOrgLevelSchema();
            const rows = await query(`
                SELECT mg.*, f.name AS factory_name, f.code AS factory_code
                FROM module_groups mg
                LEFT JOIN factory f ON mg.factory_id = f.id
                ORDER BY mg.created_at DESC
            `);
            return res.json(rows);
        }
        const mapped = mockDb.moduleGroups.map(mg => {
            const f = mockDb.factories.find(fac => fac.id === mg.factory_id);
            return { ...mg, factory_name: f?.name || '', factory_code: f?.code || '' };
        });
        res.json(mapped);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch module groups' });
    }
});
app.post('/api/org/module-groups', async (req, res) => {
    const { module, factory_id, module_lead_emp_id, module_lead_name, level } = req.body;
    if (!module) {
        return res.status(400).json({ error: 'Module name is required' });
    }
    try {
        if (pool) {
            await ensureOrgLevelSchema();
            const rows = await query(`
                INSERT INTO module_groups (module, factory_id, module_lead_emp_id, module_lead_name, level)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [module, factory_id || null, module_lead_emp_id || null, module_lead_name || null, clampLevel(level)]);
            return res.json(rows[0]);
        }
        const newGroup = {
            id: 'mg-' + Date.now(),
            module,
            factory_id: factory_id || '',
            module_lead_emp_id: module_lead_emp_id || '',
            module_lead_name: module_lead_name || ''
        };
        mockDb.moduleGroups.push(newGroup);
        const f = mockDb.factories.find(fac => fac.id === newGroup.factory_id);
        res.json({ ...newGroup, factory_name: f?.name || '', factory_code: f?.code || '' });
    }
    catch {
        res.status(500).json({ error: 'Failed to create module group' });
    }
});
app.patch('/api/org/module-groups/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const role = (await query('SELECT role FROM user_details WHERE emp_id = $1', [requesterEmpId]))[0]?.role || '';
        if (!BE_LEAD_ROLES.has(role) && role !== 'admin') {
            return res.status(403).json({ error: 'Only a BE Lead can edit Module/DMT groups' });
        }
        await ensureOrgLevelSchema();
        const { module: moduleName, level } = req.body;
        const sets = [];
        const params = [];
        if (moduleName !== undefined && String(moduleName).trim()) { params.push(String(moduleName).trim()); sets.push(`module = $${params.length}`); }
        if (level !== undefined) { params.push(clampLevel(level)); sets.push(`level = $${params.length}`); }
        if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
        params.push(req.params.id);
        const rows = await query(`UPDATE module_groups SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
        if (!rows[0]) return res.status(404).json({ error: 'Module/DMT group not found' });
        res.json(rows[0]);
    } catch (e) {
        console.error('Error updating Module/DMT group:', e);
        res.status(500).json({ error: 'Failed to update Module/DMT group' });
    }
});
app.delete('/api/org/module-groups/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (pool) {
            await query('DELETE FROM module_groups WHERE id = $1', [id]);
            return res.json({ success: true });
        }
        const idx = mockDb.moduleGroups.findIndex(mg => mg.id === id);
        if (idx !== -1) mockDb.moduleGroups.splice(idx, 1);
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'Failed to delete module group' });
    }
});
app.get('/api/roles', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM roles WHERE is_active = true ORDER BY name ASC');
            if (rows.length > 0) return res.json(rows);
        }
        res.json(mockDb.roles);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});
// User Plant Access API
app.get('/api/user-plant-access', async (req, res) => {
    const { emp_id } = req.query;
    try {
        if (pool) {
            // Auto backfill default plant access for active users
            const users = await query('SELECT emp_id, default_plant FROM user_details WHERE is_active = true');
            for (const u of users) {
                if (u.default_plant) {
                    const facId = await resolveFactoryId(u.default_plant);
                    if (facId) {
                        await query(`
                            INSERT INTO user_plant_access (emp_id, factory_id, is_active)
                            VALUES ($1, $2, true)
                            ON CONFLICT (emp_id, factory_id) DO NOTHING
                        `, [u.emp_id, facId]);
                    }
                }
            }

            let sql = `SELECT upa.*, f.name AS factory_name, f.code AS factory_code 
                       FROM user_plant_access upa 
                       JOIN factory f ON upa.factory_id = f.id 
                       WHERE upa.is_active = true`;
            const params = [];
            if (emp_id) {
                sql += ` AND upa.emp_id = $1`;
                params.push(emp_id);
            }
            const rows = await query(sql, params);
            return res.json(rows);
        }

        // Mock mode auto backfill
        for (const u of mockDb.userDetails) {
            if (u.default_plant) {
                const facId = await resolveFactoryId(u.default_plant);
                if (facId) {
                    const exists = mockDb.userPlantAccess.some(upa => upa.emp_id === u.emp_id && upa.factory_id === facId && upa.is_active);
                    if (!exists) {
                        mockDb.userPlantAccess.push({
                            id: `upa-def-${u.emp_id}-${facId}`,
                            emp_id: u.emp_id,
                            factory_id: facId,
                            is_active: true
                        });
                    }
                }
            }
        }

        let list = mockDb.userPlantAccess.filter(upa => upa.is_active);
        if (emp_id) {
            list = list.filter(upa => upa.emp_id === emp_id);
        }
        const mapped = list.map(upa => {
            const f = mockDb.factories.find(f => f.id === upa.factory_id);
            return { ...upa, factory_name: f?.name || 'Plant', factory_code: f?.code || '' };
        });
        res.json(mapped);
    } catch {
        res.status(500).json({ error: 'Failed to fetch user plant access' });
    }
});

app.post('/api/user-plant-access', async (req, res) => {
    const { emp_id, factory_id } = req.body;
    if (!emp_id || !factory_id) {
        return res.status(400).json({ error: 'emp_id and factory_id are required' });
    }
    try {
        if (pool) {
            const rows = await query(`
                INSERT INTO user_plant_access (emp_id, factory_id)
                VALUES ($1, $2)
                ON CONFLICT (emp_id, factory_id) DO UPDATE SET is_active = true
                RETURNING *
            `, [emp_id, factory_id]);
            return res.json(rows[0]);
        }
        let existing = mockDb.userPlantAccess.find(upa => upa.emp_id === emp_id && upa.factory_id === factory_id);
        if (existing) {
            existing.is_active = true;
            return res.json(existing);
        }
        const newRecord = {
            id: `upa-${Date.now()}`,
            emp_id,
            factory_id,
            is_active: true
        };
        mockDb.userPlantAccess.push(newRecord);
        res.json(newRecord);
    } catch {
        res.status(500).json({ error: 'Failed to grant plant access' });
    }
});

app.delete('/api/user-plant-access/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (pool) {
            await query('DELETE FROM user_plant_access WHERE id = $1', [id]);
            return res.json({ success: true });
        }
        const idx = mockDb.userPlantAccess.findIndex(upa => upa.id === id);
        if (idx !== -1) {
            mockDb.userPlantAccess.splice(idx, 1);
        }
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Failed to revoke plant access' });
    }
});
// 5. Machines & Subsections
app.get('/api/machines', async (req, res) => {
    const { jh_group_id, include_inactive } = req.query;
    try {
        if (pool) {
            let sql = `SELECT m.*, jg.name AS jh_group_name FROM machine m LEFT JOIN jh_group jg ON jg.id = m.jh_group_id WHERE ${include_inactive === 'true' ? '1=1' : 'm.is_active = true'}`;
            const params = [];
            if (jh_group_id) {
                params.push(jh_group_id);
                sql += ` AND m.jh_group_id = $${params.length}`;
            }
            sql += ' ORDER BY m.name ASC';
            const rows = await query(sql, params);
            return res.json(rows.map(r => ({ ...r, jh_group: r.jh_group_name ? { name: r.jh_group_name } : null })));
        }
        let resList = include_inactive === 'true' ? mockDb.machines : mockDb.machines.filter(m => m.is_active);
        if (jh_group_id) {
            resList = resList.filter(m => m.jh_group_id === jh_group_id);
        }
        res.json(resList);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch machines' });
    }
});
app.put('/api/machines/:id', async (req, res) => {
    const { id } = req.params;
    const { name, code, jh_group_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    try {
        if (pool) {
            const rows = await query(
                `UPDATE machine SET name = $1, code = $2, jh_group_id = $3 WHERE id = $4 RETURNING *`,
                [name.trim(), code || null, jh_group_id || null, id]
            );
            if (!rows[0]) return res.status(404).json({ error: 'Machine not found' });
            return res.json(rows[0]);
        }
        const m = (mockDb.machines || []).find(x => x.id === id);
        if (!m) return res.status(404).json({ error: 'Machine not found' });
        Object.assign(m, { name: name.trim(), code: code || null, jh_group_id: jh_group_id || null });
        res.json(m);
    } catch {
        res.status(500).json({ error: 'Failed to update machine' });
    }
});
app.patch('/api/machines/:id/active', async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'is_active (boolean) is required' });
    try {
        if (pool) {
            const rows = await query(`UPDATE machine SET is_active = $1 WHERE id = $2 RETURNING *`, [is_active, id]);
            if (!rows[0]) return res.status(404).json({ error: 'Machine not found' });
            return res.json(rows[0]);
        }
        const m = (mockDb.machines || []).find(x => x.id === id);
        if (!m) return res.status(404).json({ error: 'Machine not found' });
        m.is_active = is_active;
        res.json(m);
    } catch {
        res.status(500).json({ error: 'Failed to update machine status' });
    }
});
app.post('/api/machines', async (req, res) => {
    const { name, code, jh_group_id } = req.body;
    try {
        if (pool) {
            const rows = await query(`INSERT INTO machine (factory_id, jh_group_id, name, code)
         VALUES ($1, $2, $3, $4) RETURNING *`, ['00000000-0000-0000-0000-000000000001', jh_group_id || null, name, code || null]);
            return res.json(rows[0]);
        }
        const newMac = {
            id: `mac-${Date.now()}`,
            factory_id: '00000000-0000-0000-0000-000000000001',
            jh_group_id: jh_group_id || null,
            name,
            code: code || null,
            is_active: true
        };
        mockDb.machines.push(newMac);
        res.json(newMac);
    }
    catch {
        res.status(500).json({ error: 'Failed to create machine' });
    }
});
app.get('/api/machine-subsections', async (req, res) => {
    const { machine_id } = req.query;
    try {
        if (pool) {
            let sql = 'SELECT * FROM machine_subsection WHERE is_active = true';
            const params = [];
            if (machine_id) {
                sql += ' AND machine_id = $1';
                params.push(machine_id);
            }
            sql += ' ORDER BY name ASC';
            const rows = await query(sql, params);
            return res.json(rows);
        }
        let resList = mockDb.machineSubsections;
        if (machine_id)
            resList = resList.filter(s => s.machine_id === machine_id);
        res.json(resList);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch subsections' });
    }
});
// 6. Abnormalities Details (mirrors kaizen_details/opl_details)
const ABNORMALITY_TYPES = new Set([
    'minor_flaw',
    'unfulfilled_basic_condition',
    'source_of_contamination',
    'inaccessible_place',
    'source_of_quality_defect',
    'unnecessary_item',
    'unsafe_place',
]);
app.get('/api/abnormalities-details', async (req, res) => {
    try {
        if (pool) {
            const rows = await query(`
                SELECT ad.abnormality_id, ad.description, ad.before_image, ad.after_image, ad.submitted_by, ad.submitter_emp_id,
                       ad.type, ad.tag_color, ad.status, ad.jh_group_id, ad.factory_id, ad.timestamp, jg.name AS jh_group_name,
                       ad.assignee_emp_id, ad.assigned_by, ad.assigned_at, ad.closure_notes, ad.closed_by, ad.closed_at,
                       ad.rejection_reason, ad.reviewed_by, ad.reviewed_at,
                       ad.action, ad.responsibility_id, ar.name AS responsibility_name, ad.target_date, ad.completion_date, ad.review_changes, ad.current_stage_order
                FROM abnormalities_details ad
                LEFT JOIN jh_group jg ON jg.id = ad.jh_group_id
                LEFT JOIN abnormality_responsibility ar ON ar.id = ad.responsibility_id
                ORDER BY ad.timestamp DESC
            `);
            // approver_emp_ids/dmt_approver_emp_ids reflect whichever stage this item is
            // CURRENTLY sitting on within its active phase — same pattern as Kaizen.
            const abnP1StagesByFactory = new Map();
            const abnP2StagesByFactory = new Map();
            const withApprovers = await Promise.all(rows.map(async (row) => {
                if (!abnP1StagesByFactory.has(row.factory_id)) {
                    abnP1StagesByFactory.set(row.factory_id, await resolveModulePhaseStages(row.factory_id, 'abnormality', 1));
                }
                if (!abnP2StagesByFactory.has(row.factory_id)) {
                    abnP2StagesByFactory.set(row.factory_id, await resolveModulePhaseStages(row.factory_id, 'abnormality', 2));
                }
                const p1Stages = abnP1StagesByFactory.get(row.factory_id);
                const p2Stages = abnP2StagesByFactory.get(row.factory_id);
                const isPhase2 = row.status === 'pending_dmt_review';
                const currentStages = isPhase2 ? p2Stages : p1Stages;
                const stageOrder = row.current_stage_order || currentStages[0].stage_order;
                const stage = currentStages.find((s) => s.stage_order === stageOrder) || currentStages[0];
                return {
                    ...row,
                    approver_emp_ids: !isPhase2 ? await resolveStageApproversFor(row.jh_group_id, 'abnormality', 1, stage, row.factory_id) : [],
                    dmt_approver_emp_ids: isPhase2 ? await resolveStageApproversFor(row.jh_group_id, 'abnormality', 2, stage, row.factory_id) : [],
                    current_stage_order: stage.stage_order,
                    current_stage_name: stage.stage_name,
                    total_stages: currentStages.length,
                };
            }));
            return res.json(withApprovers);
        }
        res.json(mockDb.abnormalitiesDetails || []);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch abnormality details' });
    }
});
app.get('/api/abnormalities-details/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (pool) {
            const rows = await query(`
                SELECT ad.abnormality_id, ad.description, ad.before_image, ad.after_image, ad.submitted_by, ad.submitter_emp_id,
                       ad.type, ad.tag_color, ad.status, ad.jh_group_id, ad.factory_id, ad.timestamp, jg.name AS jh_group_name,
                       ad.assignee_emp_id, ad.assigned_by, ad.assigned_at, ad.closure_notes, ad.closed_by, ad.closed_at,
                       ad.rejection_reason, ad.reviewed_by, ad.reviewed_at,
                       ad.action, ad.responsibility_id, ar.name AS responsibility_name, ad.target_date, ad.completion_date, ad.review_changes, ad.current_stage_order
                FROM abnormalities_details ad
                LEFT JOIN jh_group jg ON jg.id = ad.jh_group_id
                LEFT JOIN abnormality_responsibility ar ON ar.id = ad.responsibility_id
                WHERE ad.abnormality_id = $1
            `, [id]);
            if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
            return res.json(rows[0]);
        }
        const abn = (mockDb.abnormalitiesDetails || []).find(a => String(a.abnormality_id) === String(id));
        if (!abn) return res.status(404).json({ error: 'Not found' });
        res.json(abn);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch abnormality detail' });
    }
});
const ABNORMALITY_TAG_COLORS = new Set(['red', 'white']);
const ABNORMALITY_STATUSES = new Set(['draft', 'pending_review']);
// Who is allowed to review a given Abnormality's JH-level review: approval_routing
// if configured for this JH group + 'abnormality', else the JH group's leader_emp_id.
// Mirrors resolveOplApprovers/resolveKaizenApprovers exactly.
async function resolveAbnormalityApprovers(jhGroupId) {
    if (!jhGroupId || !pool) return [];
    const routingRows = await query(
        `SELECT approver_role, approver_emp_id FROM approval_routing WHERE jh_group_id = $1 AND entity_type = 'abnormality' AND is_active = true LIMIT 1`,
        [jhGroupId]
    );
    const routing = routingRows[0];
    if (routing && routing.approver_role === 'specific' && routing.approver_emp_id) {
        return routing.approver_emp_id.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const groupRows = await query(`SELECT leader_emp_id FROM jh_group WHERE id = $1`, [jhGroupId]);
    const leaderEmpId = groupRows[0]?.leader_emp_id;
    return leaderEmpId ? [leaderEmpId] : [];
}
// Who does the module/DMT lead's final closure review on a red-tag Abnormality once the
// owner submits closure work: approval_routing (entity_type='abnormality_dmt') if configured
// for this JH group, else the module_lead of the JH group's linked module_groups row.
// Mirrors resolveKaizenDmtApprovers exactly.
async function resolveAbnormalityDmtApprovers(jhGroupId) {
    if (!jhGroupId || !pool) return [];
    const routingRows = await query(
        `SELECT approver_role, approver_emp_id FROM approval_routing WHERE jh_group_id = $1 AND entity_type = 'abnormality_dmt' AND is_active = true LIMIT 1`,
        [jhGroupId]
    );
    const routing = routingRows[0];
    if (routing && routing.approver_role === 'specific' && routing.approver_emp_id) {
        return routing.approver_emp_id.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const rows = await query(
        `SELECT mg.module_lead_emp_id FROM jh_group jg
         LEFT JOIN module_groups mg ON mg.id = jg.module_group_id
         WHERE jg.id = $1`,
        [jhGroupId]
    );
    const leaderEmpId = rows[0]?.module_lead_emp_id;
    return leaderEmpId ? [leaderEmpId] : [];
}
app.post('/api/abnormalities-details', async (req, res) => {
    const { description, before_image, submitted_by, type, tag_color, status, action, responsibility_id, assignee_emp_id, target_date, jh_group_id } = req.body;
    const submitter = submitted_by || req.headers['x-worker-id'];
    if (!submitter) {
        return res.status(400).json({ error: 'submitted_by or x-worker-id header is required' });
    }
    if (!type || !ABNORMALITY_TYPES.has(type)) {
        return res.status(400).json({ error: 'A valid abnormality type is required' });
    }
    if (tag_color && !ABNORMALITY_TAG_COLORS.has(tag_color)) {
        return res.status(400).json({ error: 'tag_color must be red or white' });
    }
    if (status && !ABNORMALITY_STATUSES.has(status)) {
        return res.status(400).json({ error: 'status must be draft or pending_review' });
    }
    const tagColor = tag_color || 'white';
    const itemStatus = status || 'draft';
    // Default closure target date from the reporting date: white tag = 3 days, red tag = 7 days.
    // Only applied when the caller didn't supply one.
    let resolvedTargetDate = target_date || null;
    if (!resolvedTargetDate) {
        const days = tagColor === 'red' ? 7 : 3;
        const d = new Date();
        d.setDate(d.getDate() + days);
        resolvedTargetDate = d.toISOString().slice(0, 10);
    }
    if (itemStatus === 'pending_review' && !before_image) {
        return res.status(400).json({ error: 'A before photo is required to submit for review' });
    }
    if (assignee_emp_id) {
        const assigneeRows = await query('SELECT emp_id, department_id FROM user_details WHERE emp_id = $1', [assignee_emp_id]);
        if (!assigneeRows.length) {
            return res.status(400).json({ error: 'assignee_emp_id does not match a known worker' });
        }
        // Department match is required UNLESS assigning to yourself — the person doing the
        // assigning can always take it on personally, even outside their home department.
        if (responsibility_id && assignee_emp_id !== req.headers['x-worker-id']) {
            const respRows = await query('SELECT department_id FROM abnormality_responsibility WHERE id = $1', [responsibility_id]);
            const respDeptId = respRows[0]?.department_id;
            if (respDeptId && assigneeRows[0].department_id !== respDeptId) {
                return res.status(400).json({ error: 'assignee_emp_id must belong to the selected responsibility\'s department' });
            }
        }
    }
    try {
        if (pool) {
            const { jhGroupId, factoryId, mustSelectGroup } = await resolveSubmitterJhGroupForFiling(req.headers['x-worker-id'], jh_group_id);
            if (mustSelectGroup && itemStatus !== 'draft') {
                return res.status(400).json({ error: 'Select a DMT and JH group to file this under before submitting.' });
            }
            const rows = await query(`INSERT INTO abnormalities_details (description, before_image, submitted_by, submitter_emp_id, type, tag_color, status, jh_group_id, factory_id, action, responsibility_id, assignee_emp_id, target_date, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()) RETURNING *`, [
                description || null,
                before_image || null,
                submitter,
                req.headers['x-worker-id'] || null,
                type,
                tagColor,
                itemStatus,
                jhGroupId,
                factoryId,
                action || null,
                responsibility_id || null,
                assignee_emp_id || null,
                resolvedTargetDate,
            ]);
            const created = rows[0];
            await logAbnormalityAudit({
                abnormalityId: created.abnormality_id,
                action: itemStatus === 'pending_review' ? 'submitted_for_review' : 'created',
                statusFrom: null,
                statusTo: itemStatus,
                performedBy: req.headers['x-worker-id'] || submitter,
            });
            if (itemStatus === 'pending_review') {
                try {
                    const appr = await resolveAbnormalityApprovers(created.jh_group_id);
                    await notify(appr, {
                        kind: 'abn_review_pending', module: 'abnormality', entityId: created.abnormality_id,
                        createdBy: req.headers['x-worker-id'],
                        title: 'Abnormality to review',
                        body: `A ${created.tag_color}-tag abnormality was reported for your review.`,
                    });
                } catch (e) { console.error('abnormality report notify failed:', e.message); }
            }
            return res.json(created);
        }
        if (!mockDb.abnormalitiesDetails) mockDb.abnormalitiesDetails = [];
        const newAbn = {
            abnormality_id: mockDb.abnormalitiesDetails.length + 1,
            description: description || null,
            before_image: before_image || null,
            submitted_by: submitter,
            submitter_emp_id: req.headers['x-worker-id'] || null,
            type,
            tag_color: tagColor,
            status: itemStatus,
            jh_group_id: null,
            factory_id: null,
            action: action || null,
            responsibility_id: responsibility_id || null,
            assignee_emp_id: assignee_emp_id || null,
            target_date: resolvedTargetDate,
            timestamp: new Date().toISOString(),
        };
        mockDb.abnormalitiesDetails.unshift(newAbn);
        res.json(newAbn);
    }
    catch {
        res.status(500).json({ error: 'Failed to create abnormality detail' });
    }
});
app.get('/api/abnormality-responsibilities', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT id, factory_id, name, department_id FROM abnormality_responsibility ORDER BY name ASC');
            return res.json(rows);
        }
        res.json([]);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch abnormality responsibilities' });
    }
});
// Abnormality Audit Trail — mirrors opl_audit_trail/kaizen_audit_trail exactly. Viewing is
// admin-only (unlike OPL/Kaizen's BE-lead-tier gate — owner specifically wants this one
// restricted to admin); logging happens unconditionally on every lifecycle action below.
async function logAbnormalityAudit({ abnormalityId, action, statusFrom, statusTo, performedBy, comments, changedFields }) {
    if (!pool) return;
    try {
        await query(
            `INSERT INTO abnormality_audit_trail (abnormality_id, action, status_from, status_to, performed_by, comments, changed_fields, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [String(abnormalityId), action, statusFrom || null, statusTo || null, performedBy || null, comments || null, changedFields ? JSON.stringify(changedFields) : null]
        );
    } catch (e) {
        console.error('Error logging abnormality audit trail:', e);
    }
}
app.get('/api/abnormality-audit-trail', async (req, res) => {
    const { abnormality_id } = req.query;
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    try {
        const requesterRows = await query('SELECT role FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        if ((requesterRows[0]?.role || '') !== 'admin') {
            return res.status(403).json({ error: 'You are not authorized to view the Abnormality audit trail' });
        }
        if (pool) {
            let sql = 'SELECT * FROM abnormality_audit_trail';
            const params = [];
            if (abnormality_id) {
                sql += ' WHERE abnormality_id = $1';
                params.push(String(abnormality_id));
            }
            sql += ' ORDER BY timestamp DESC';
            const rows = await query(sql, params);
            return res.json(rows);
        }
        res.json([]);
    } catch {
        res.status(500).json({ error: 'Failed to fetch Abnormality audit trail' });
    }
});
// Review/workflow actions on an existing Abnormality:
//   mark_for_deletion  — JH approver only. Soft-delete: status -> marked_for_deletion,
//                        never a real DELETE, requires rejection_reason.
//   assign_for_closure — JH approver only. The reviewer can edit every reported field
//                        (type, tag_color, description, action, target_date, before_image)
//                        and MUST pick a responsibility + a specific assignee in that
//                        department (any factory worker, not restricted to the JH group) —
//                        mandatory for both red and white tags. status -> assigned.
//   submit_closure     — assignee only, both tag colors. status -> pending_dmt_review — every
//                        closure (red or white) goes through the DMT/module lead's final review
//                        before it's actually closed; nobody closes their own work directly.
//   dmt_close          — DMT approver only, pending_dmt_review only. status -> closed.
const ABNORMALITY_REVIEW_ACTIONS = new Set(['mark_for_deletion', 'assign_for_closure', 'submit_closure', 'dmt_close']);
app.put('/api/abnormalities-details/:id', async (req, res) => {
    const { id } = req.params;
    const {
        action, rejection_reason, closure_notes, after_image, completion_date,
        type, tag_color, description, action_text, responsibility_id, assignee_emp_id, target_date, before_image,
        submit: submitAfterEdit,
    } = req.body;
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    if (action !== 'edit_draft' && !ABNORMALITY_REVIEW_ACTIONS.has(action)) {
        return res.status(400).json({ error: 'A valid action is required' });
    }
    try {
        if (pool) {
            const existingRows = await query('SELECT * FROM abnormalities_details WHERE abnormality_id = $1', [id]);
            const existing = existingRows[0];
            if (!existing) return res.status(404).json({ error: 'Abnormality detail not found' });

            // Submitter fixing their own abnormality before it goes for review. Draft only.
            if (action === 'edit_draft') {
                const editorRows = await query('SELECT role FROM user_details WHERE emp_id = $1', [requesterEmpId]);
                const editorRole = editorRows[0]?.role || '';
                const isPrivileged = BE_LEAD_ROLES.has(editorRole) || editorRole === 'admin';
                if (existing.status !== 'draft') {
                    return res.status(409).json({ error: 'An abnormality can only be edited while it is a draft' });
                }
                if (!isPrivileged && existing.submitter_emp_id && requesterEmpId !== existing.submitter_emp_id) {
                    return res.status(403).json({ error: 'Only the submitter can edit this draft' });
                }
                if (type && !ABNORMALITY_TYPES.has(type)) {
                    return res.status(400).json({ error: 'A valid abnormality type is required' });
                }
                if (tag_color && !ABNORMALITY_TAG_COLORS.has(tag_color)) {
                    return res.status(400).json({ error: 'tag_color must be red or white' });
                }
                const nextAbnStatus = submitAfterEdit ? 'pending_review' : 'draft';
                const rows = await query(
                    `UPDATE abnormalities_details SET
                       description = COALESCE($1, description), type = COALESCE($2, type),
                       tag_color = COALESCE($3, tag_color), before_image = $4,
                       action = COALESCE($5, action), status = $6
                     WHERE abnormality_id = $7 RETURNING *`,
                    [description ?? null, type ?? null, tag_color ?? null, before_image ?? null, action_text ?? null, nextAbnStatus, id]
                );
                await logAbnormalityAudit({
                    abnormalityId: id, action: submitAfterEdit ? 'submitted_for_review' : 'edit_draft',
                    statusFrom: 'draft', statusTo: nextAbnStatus,
                    performedBy: requesterEmpId, comments: submitAfterEdit ? 'Submitted for review' : 'Draft edited by submitter',
                });
                if (submitAfterEdit) {
                    try {
                        const appr = await resolveAbnormalityApprovers(rows[0].jh_group_id);
                        await notify(appr, {
                            kind: 'abn_review_pending', module: 'abnormality', entityId: id, createdBy: requesterEmpId,
                            title: 'Abnormality to review',
                            body: `A ${rows[0].tag_color}-tag abnormality was reported for your review.`,
                        });
                    } catch (e) { console.error('abnormality submit-from-draft notify failed:', e.message); }
                }
                return res.json(rows[0]);
            }

            // Phase 1 (JH review) stage resolution — used by both mark_for_deletion (terminal
            // reject, valid at any stage) and assign_for_closure (approve; advances to the
            // next stage, or finalizes to 'assigned' on the last one). No rows configured =
            // today's exact single-stage behavior.
            let abnP1Stages, abnP1CurrentStage, abnP1NextStage;
            if (action === 'mark_for_deletion' || action === 'assign_for_closure') {
                if (existing.status !== 'pending_review') {
                    return res.status(409).json({ error: 'Only a pending-review item can be reviewed' });
                }
                abnP1Stages = await resolveModulePhaseStages(existing.factory_id, 'abnormality', 1);
                const abnP1CurrentOrder = existing.current_stage_order || abnP1Stages[0].stage_order;
                const abnP1CurrentIdx = abnP1Stages.findIndex((s) => s.stage_order === abnP1CurrentOrder);
                abnP1CurrentStage = abnP1CurrentIdx >= 0 ? abnP1Stages[abnP1CurrentIdx] : abnP1Stages[0];
                abnP1NextStage = abnP1Stages[(abnP1CurrentIdx >= 0 ? abnP1CurrentIdx : 0) + 1];
                const approvers = await resolveStageApproversFor(existing.jh_group_id, 'abnormality', 1, abnP1CurrentStage, existing.factory_id);
                if (!approvers.includes(requesterEmpId)) {
                    return res.status(403).json({ error: 'You are not authorized to review this Abnormality' });
                }
            }
            if (action === 'assign_for_closure') {
                if (type && !ABNORMALITY_TYPES.has(type)) {
                    return res.status(400).json({ error: 'A valid abnormality type is required' });
                }
                if (tag_color && !ABNORMALITY_TAG_COLORS.has(tag_color)) {
                    return res.status(400).json({ error: 'tag_color must be red or white' });
                }
                if (!action_text || !action_text.trim()) {
                    return res.status(400).json({ error: 'An action for the abnormality is required' });
                }
                // Picking a responsibility + assignee only actually happens on the LAST
                // configured phase-1 stage — that's the point an item genuinely becomes
                // "assigned." An earlier stage's approval just advances it to the next
                // reviewer (same edit-and-diff capability, no assignee required yet).
                if (!abnP1NextStage) {
                    if (!responsibility_id) {
                        return res.status(400).json({ error: 'A responsibility must be selected' });
                    }
                    if (!assignee_emp_id) {
                        return res.status(400).json({ error: 'An assignee must be selected' });
                    }
                    const assigneeRows = await query('SELECT emp_id, department_id FROM user_details WHERE emp_id = $1', [assignee_emp_id]);
                    if (!assigneeRows.length) {
                        return res.status(400).json({ error: 'assignee_emp_id does not match a known worker' });
                    }
                    // Department match is required UNLESS the reviewer is assigning it to themselves.
                    if (assignee_emp_id !== requesterEmpId) {
                        const respRows = await query('SELECT department_id FROM abnormality_responsibility WHERE id = $1', [responsibility_id]);
                        const respDeptId = respRows[0]?.department_id;
                        if (respDeptId && assigneeRows[0].department_id !== respDeptId) {
                            return res.status(400).json({ error: 'assignee_emp_id must belong to the selected responsibility\'s department' });
                        }
                    }
                }
            }
            if (action === 'submit_closure') {
                if (existing.status !== 'assigned') {
                    return res.status(409).json({ error: 'Only an assigned item can be submitted for closure' });
                }
                if (existing.assignee_emp_id !== requesterEmpId) {
                    return res.status(403).json({ error: 'Only the assigned owner can submit closure' });
                }
                if (!after_image) {
                    return res.status(400).json({ error: 'An after photo is required to submit closure' });
                }
                if (!closure_notes || !closure_notes.trim()) {
                    return res.status(400).json({ error: 'Closure notes are required to submit closure' });
                }
                if (!completion_date) {
                    return res.status(400).json({ error: 'The date of completion is required to submit closure' });
                }
            }
            // Phase 2 (DMT review) — one action (dmt_close) serves as both "advance" (any
            // non-final stage) and "finalize" (the last stage); Abnormality's phase 2 has no
            // reject option, matching today's behavior. No rows configured = today's exact
            // single-stage behavior (status goes straight to 'closed').
            let abnP2Stages, abnP2CurrentStage, abnP2NextStage;
            if (action === 'dmt_close') {
                if (existing.status !== 'pending_dmt_review') {
                    return res.status(409).json({ error: 'Only an item pending DMT review can be closed' });
                }
                abnP2Stages = await resolveModulePhaseStages(existing.factory_id, 'abnormality', 2);
                const abnP2CurrentOrder = existing.current_stage_order || abnP2Stages[0].stage_order;
                const abnP2CurrentIdx = abnP2Stages.findIndex((s) => s.stage_order === abnP2CurrentOrder);
                abnP2CurrentStage = abnP2CurrentIdx >= 0 ? abnP2Stages[abnP2CurrentIdx] : abnP2Stages[0];
                abnP2NextStage = abnP2Stages[(abnP2CurrentIdx >= 0 ? abnP2CurrentIdx : 0) + 1];
                const dmtApprovers = await resolveStageApproversFor(existing.jh_group_id, 'abnormality', 2, abnP2CurrentStage, existing.factory_id);
                if (!dmtApprovers.includes(requesterEmpId)) {
                    return res.status(403).json({ error: 'You are not authorized to close this Abnormality' });
                }
            }

            let newStatus = existing.status;
            let auditChangedFields = null;
            let updateFields = {
                rejection_reason: existing.rejection_reason,
                reviewed_by: existing.reviewed_by,
                reviewed_at: existing.reviewed_at,
                assignee_emp_id: existing.assignee_emp_id,
                assigned_by: existing.assigned_by,
                assigned_at: existing.assigned_at,
                closure_notes: existing.closure_notes,
                after_image: existing.after_image,
                closed_by: existing.closed_by,
                closed_at: existing.closed_at,
                type: existing.type,
                tag_color: existing.tag_color,
                description: existing.description,
                action_text: existing.action,
                responsibility_id: existing.responsibility_id,
                target_date: existing.target_date,
                before_image: existing.before_image,
                completion_date: existing.completion_date,
                review_changes: existing.review_changes,
            };

            let newStageOrder = existing.current_stage_order;
            if (action === 'mark_for_deletion') {
                if (!rejection_reason || !rejection_reason.trim()) {
                    return res.status(400).json({ error: 'rejection_reason is required to mark for deletion' });
                }
                newStatus = 'marked_for_deletion';
                updateFields.rejection_reason = rejection_reason.trim();
                updateFields.reviewed_by = requesterEmpId;
                updateFields.reviewed_at = new Date().toISOString();
            } else if (action === 'assign_for_closure') {
                // Approving at a non-final phase-1 stage just advances the stage pointer
                // (status stays 'pending_review') — only the last stage actually assigns.
                if (abnP1NextStage) {
                    newStatus = 'pending_review';
                    newStageOrder = abnP1NextStage.stage_order;
                } else {
                    newStatus = 'assigned';
                    newStageOrder = abnP1CurrentStage.stage_order;
                    updateFields.assignee_emp_id = assignee_emp_id;
                    updateFields.assigned_by = requesterEmpId;
                    updateFields.assigned_at = new Date().toISOString();
                }
                updateFields.reviewed_by = requesterEmpId;
                updateFields.reviewed_at = new Date().toISOString();
                // Snapshot what the reviewer actually changed vs what the submitter reported,
                // so the submitter can see it later (shown on the detail view).
                const diffCandidates = [
                    ['type', existing.type, type, ABNORMALITY_TYPES.has(type) ? type : existing.type],
                    ['tag_color', existing.tag_color, tag_color, tag_color || existing.tag_color],
                    ['description', existing.description, description, description !== undefined ? (description || null) : existing.description],
                    ['action', existing.action, action_text, action_text !== undefined ? (action_text || null) : existing.action],
                    ['target_date', existing.target_date, target_date, target_date !== undefined ? (target_date || null) : existing.target_date],
                    ['responsibility_id', existing.responsibility_id, responsibility_id, responsibility_id],
                    ['assignee_emp_id', existing.assignee_emp_id, assignee_emp_id, assignee_emp_id],
                ];
                const changes = {};
                for (const [field, oldVal, provided, newVal] of diffCandidates) {
                    if (provided !== undefined && String(oldVal ?? '') !== String(newVal ?? '')) {
                        changes[field] = { from: oldVal, to: newVal };
                    }
                }
                updateFields.review_changes = Object.keys(changes).length ? JSON.stringify(changes) : existing.review_changes;
                auditChangedFields = Object.keys(changes).length ? changes : null;

                if (type) updateFields.type = type;
                if (tag_color) updateFields.tag_color = tag_color;
                if (description !== undefined) updateFields.description = description || null;
                if (action_text !== undefined) updateFields.action_text = action_text || null;
                if (!abnP1NextStage) updateFields.responsibility_id = responsibility_id;
                if (target_date !== undefined) updateFields.target_date = target_date || null;
                if (before_image !== undefined) updateFields.before_image = before_image || null;
            } else if (action === 'submit_closure') {
                newStatus = 'pending_dmt_review';
                updateFields.closure_notes = closure_notes.trim();
                updateFields.after_image = after_image;
                updateFields.completion_date = completion_date;
                // Entering phase 2 always restarts the stage pointer at phase 2's first
                // configured stage, regardless of wherever phase 1 ended up.
                newStageOrder = (await resolveModulePhaseStages(existing.factory_id, 'abnormality', 2))[0].stage_order;
            } else if (action === 'dmt_close') {
                // Advancing at a non-final phase-2 stage just moves the stage pointer
                // (status stays 'pending_dmt_review'); only the last stage actually closes.
                if (abnP2NextStage) {
                    newStatus = 'pending_dmt_review';
                    newStageOrder = abnP2NextStage.stage_order;
                    updateFields.reviewed_by = requesterEmpId;
                    updateFields.reviewed_at = new Date().toISOString();
                    const updatedRows = await query(
                        `UPDATE abnormalities_details SET status = $1, current_stage_order = $2, reviewed_by = $3, reviewed_at = $4 WHERE abnormality_id = $5 RETURNING *`,
                        [newStatus, newStageOrder, updateFields.reviewed_by, updateFields.reviewed_at, id]
                    );
                    await logAbnormalityAudit({
                        abnormalityId: id, action: 'dmt_close', performedBy: requesterEmpId,
                        comments: `Approved at "${abnP2CurrentStage.stage_name}" — moved to "${abnP2NextStage.stage_name}"`,
                    }).catch(() => {});
                    try {
                        await resolveNotifications('abnormality', id, ['abn_dmt_pending']);
                        const appr = await resolveStageApproversFor(existing.jh_group_id, 'abnormality', 2, abnP2NextStage, existing.factory_id);
                        await notify(appr, {
                            kind: 'abn_dmt_pending', module: 'abnormality', entityId: id, createdBy: requesterEmpId,
                            title: 'Abnormality closure to review', body: `Moved to ${abnP2NextStage.stage_name}.`,
                        });
                    } catch (e) { console.error('abnormality notify (dmt advance) failed:', e.message); }
                    return res.json(updatedRows[0]);
                }
                newStatus = 'closed';
                updateFields.closed_by = requesterEmpId;
                updateFields.closed_at = new Date().toISOString();
            }

            const updatedRows = await query(
                `UPDATE abnormalities_details SET
                   status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = $4,
                   assignee_emp_id = $5, assigned_by = $6, assigned_at = $7,
                   closure_notes = $8, after_image = $9, closed_by = $10, closed_at = $11,
                   type = $12, tag_color = $13, description = $14, action = $15,
                   responsibility_id = $16, target_date = $17, before_image = $18,
                   completion_date = $19, review_changes = $20, current_stage_order = $21
                 WHERE abnormality_id = $22 RETURNING *`,
                [
                    newStatus, updateFields.rejection_reason, updateFields.reviewed_by, updateFields.reviewed_at,
                    updateFields.assignee_emp_id, updateFields.assigned_by, updateFields.assigned_at,
                    updateFields.closure_notes, updateFields.after_image, updateFields.closed_by, updateFields.closed_at,
                    updateFields.type, updateFields.tag_color, updateFields.description, updateFields.action_text,
                    updateFields.responsibility_id, updateFields.target_date, updateFields.before_image,
                    updateFields.completion_date, updateFields.review_changes, newStageOrder,
                    id
                ]
            );
            const AUDIT_ACTION_LABEL = {
                mark_for_deletion: 'marked_for_deletion',
                assign_for_closure: 'assigned_for_closure',
                submit_closure: 'submitted_for_dmt_review',
                dmt_close: 'dmt_closed',
            };
            const auditComments = action === 'mark_for_deletion' ? updateFields.rejection_reason
                : (action === 'submit_closure') ? updateFields.closure_notes
                : null;
            await logAbnormalityAudit({
                abnormalityId: id,
                action: AUDIT_ACTION_LABEL[action] || action,
                statusFrom: existing.status,
                statusTo: newStatus,
                performedBy: requesterEmpId,
                comments: auditComments,
                changedFields: auditChangedFields,
            });
            try {
                if (action === 'mark_for_deletion') {
                    await resolveNotifications('abnormality', id, ['abn_review_pending']);
                    await notify(existing.submitter_emp_id, {
                        kind: 'abn_rejected', module: 'abnormality', entityId: id, createdBy: requesterEmpId,
                        title: 'Your abnormality was marked for deletion', body: updateFields.rejection_reason || 'Marked for deletion.',
                    });
                } else if (action === 'assign_for_closure') {
                    await resolveNotifications('abnormality', id, ['abn_review_pending']);
                    if (newStatus === 'assigned') {
                        await notify(updateFields.assignee_emp_id, {
                            kind: 'abn_assigned', module: 'abnormality', entityId: id, createdBy: requesterEmpId,
                            title: 'Abnormality assigned to you', body: 'You have been assigned an abnormality to close out.',
                        });
                    } else if (abnP1NextStage) {
                        const appr = await resolveStageApproversFor(existing.jh_group_id, 'abnormality', 1, abnP1NextStage, existing.factory_id);
                        await notify(appr, {
                            kind: 'abn_review_pending', module: 'abnormality', entityId: id, createdBy: requesterEmpId,
                            title: 'Abnormality to review', body: `Moved to ${abnP1NextStage.stage_name}.`,
                        });
                    }
                } else if (action === 'submit_closure') {
                    await resolveNotifications('abnormality', id, ['abn_assigned']);
                    const p2 = await resolveModulePhaseStages(existing.factory_id, 'abnormality', 2);
                    const appr = await resolveStageApproversFor(existing.jh_group_id, 'abnormality', 2, p2[0], existing.factory_id);
                    await notify(appr, {
                        kind: 'abn_dmt_pending', module: 'abnormality', entityId: id, createdBy: requesterEmpId,
                        title: 'Abnormality closure to review', body: 'Closure evidence was submitted for your review.',
                    });
                } else if (action === 'dmt_close' && newStatus === 'closed') {
                    await resolveNotifications('abnormality', id, ['abn_dmt_pending', 'abn_review_pending', 'abn_assigned']);
                    await notify([existing.submitter_emp_id, updateFields.assignee_emp_id], {
                        kind: 'abn_closed', module: 'abnormality', entityId: id, createdBy: requesterEmpId,
                        title: 'Abnormality closed', body: 'An abnormality you were involved in has been closed.',
                    });
                }
            } catch (e) { console.error('abnormality notify failed:', e.message); }
            return res.json(updatedRows[0]);
        }
        res.status(500).json({ error: 'Review actions require a database connection' });
    }
    catch {
        res.status(500).json({ error: 'Failed to update abnormality detail' });
    }
});
// Abnormality Analytics — BE-lead+ only. Live-computed from abnormalities_details/jh_group/
// module_groups/jh_groups_list; no separate snapshot table, always reflects current real data.
// Mirrors /api/opl-analytics's structure exactly, adapted to abnormality's fields (type,
// tag_color, status lifecycle, responsibility) in place of OPL's classification/criticality.
app.get('/api/abnormality-analytics', async (req, res) => {
    if (!pool) return res.json({ byDmt: [], byJhGroup: [], from: null, to: null });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    try {
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const requesterRole = requesterRows[0]?.role || '';
        if (!BE_LEAD_ROLES.has(requesterRole)) {
            return res.status(403).json({ error: 'You are not authorized to view Abnormality analytics' });
        }
        const requesterPlantCode = requesterRows[0]?.default_plant || null;
        const factoryRows = requesterPlantCode
            ? await query('SELECT id FROM factory WHERE code = $1', [requesterPlantCode])
            : [];
        const requesterFactoryId = factoryRows[0]?.id || null;
        if (!requesterFactoryId) {
            return res.status(400).json({ error: 'Your account has no plant assigned — cannot scope analytics' });
        }

        const now = new Date();
        const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        const from = req.query.from ? new Date(req.query.from) : defaultFrom;
        const toRaw = req.query.to ? new Date(req.query.to) : now;
        const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return res.status(400).json({ error: 'Invalid from/to date' });
        }

        const scopedJhGroupId = req.query.jh_group_id || null;
        const scopedDmtId = req.query.dmt_id || null;
        if (scopedJhGroupId && scopedDmtId) {
            return res.status(400).json({ error: 'Pass jh_group_id or dmt_id, not both' });
        }

        // "Counted" abnormalities are anything actually submitted (not a draft) — reporting
        // activity is the signal here, not just fully-closed ones (unlike OPL, which only
        // counts approved content).
        const byDmtParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let byDmtScopeClause = '';
        if (scopedDmtId) { byDmtParams.push(scopedDmtId); byDmtScopeClause = ' AND mg.id = $4'; }
        else if (scopedJhGroupId) { byDmtParams.push(scopedJhGroupId); byDmtScopeClause = ' AND jg.id = $4'; }
        const byDmt = await query(
            `SELECT mg.id AS dmt_id, mg.module AS dmt_name, COUNT(DISTINCT ad.abnormality_id) AS abnormality_count
             FROM module_groups mg
             LEFT JOIN jh_group jg ON jg.module_group_id = mg.id
             LEFT JOIN abnormalities_details ad ON ad.jh_group_id = jg.id AND ad.status != 'draft'
               AND ad.timestamp >= $1 AND ad.timestamp <= $2
             WHERE mg.factory_id = $3${byDmtScopeClause}
             GROUP BY mg.id, mg.module
             ORDER BY mg.module ASC`,
            byDmtParams
        );

        // abnormality_count is attributed to the submitter's HOME JH group (via membership
        // history), never to whichever group it was FILED under — same fix as OPL analytics.
        const byJhGroupParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let byJhGroupScopeClause = '';
        if (scopedJhGroupId) { byJhGroupParams.push(scopedJhGroupId); byJhGroupScopeClause = ' AND jg.id = $4'; }
        else if (scopedDmtId) { byJhGroupParams.push(scopedDmtId); byJhGroupScopeClause = ' AND mg.id = $4'; }
        const byJhGroup = await query(
            `SELECT jg.id AS jh_group_id, jg.name AS jh_group_name, mg.module AS dmt_name,
                    COUNT(DISTINCT ad.abnormality_id) AS abnormality_count,
                    COUNT(DISTINCT combined.emp_id) AS member_count
             FROM jh_group jg
             LEFT JOIN module_groups mg ON mg.id = jg.module_group_id
             LEFT JOIN (
                 SELECT DISTINCT jh_group_id, emp_id FROM jh_group_membership_history
                 WHERE joined_at <= $2 AND (left_at IS NULL OR left_at >= $1)
             ) combined ON combined.jh_group_id = jg.id
             LEFT JOIN abnormalities_details ad ON ad.submitter_emp_id = combined.emp_id AND ad.status != 'draft'
               AND ad.timestamp >= $1 AND ad.timestamp <= $2
             WHERE jg.factory_id = $3${byJhGroupScopeClause}
             GROUP BY jg.id, jg.name, mg.module
             ORDER BY jg.name ASC`,
            byJhGroupParams
        );
        const byJhGroupWithIndex = byJhGroup.map(row => {
            const abnCount = Number(row.abnormality_count) || 0;
            const memberCount = Number(row.member_count) || 0;
            return {
                ...row,
                abnormality_count: abnCount,
                member_count: memberCount,
                abnormality_index: memberCount > 0 ? Number((abnCount / memberCount).toFixed(2)) : null
            };
        });

        const memberSubmissionsParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let memberSubmissionsScopeClause = '';
        if (scopedJhGroupId) { memberSubmissionsParams.push(scopedJhGroupId); memberSubmissionsScopeClause = ' AND jg.id = $4'; }
        else if (scopedDmtId) { memberSubmissionsParams.push(scopedDmtId); memberSubmissionsScopeClause = ' AND mg.id = $4'; }
        const memberSubmissions = await query(
            `SELECT combined.emp_id, ud.name AS worker_name, jg.id AS jh_group_id, jg.name AS jh_group_name
                    ${scopedDmtId ? ', mg.module AS dmt_name' : ''},
                    COUNT(DISTINCT ad.abnormality_id) AS abnormality_count
             FROM jh_group jg
             LEFT JOIN module_groups mg ON mg.id = jg.module_group_id
             LEFT JOIN (
                 SELECT DISTINCT jh_group_id, emp_id FROM jh_group_membership_history
                 WHERE joined_at <= $2 AND (left_at IS NULL OR left_at >= $1)
             ) combined ON combined.jh_group_id = jg.id
             LEFT JOIN user_details ud ON ud.emp_id = combined.emp_id
             LEFT JOIN abnormalities_details ad ON ad.submitter_emp_id = combined.emp_id AND ad.status != 'draft'
               AND ad.timestamp >= $1 AND ad.timestamp <= $2
             WHERE jg.factory_id = $3 AND combined.emp_id IS NOT NULL${memberSubmissionsScopeClause}
             GROUP BY combined.emp_id, ud.name, jg.id, jg.name${scopedDmtId ? ', mg.module' : ''}
             ORDER BY abnormality_count DESC, ud.name ASC`,
            memberSubmissionsParams
        );

        // Type, tag color, status, and responsibility breakdowns — same scope applied
        // consistently, same as classification/criticality on the OPL endpoint.
        const breakdownParams = [requesterFactoryId, from.toISOString(), to.toISOString()];
        let groupFilterClause = '';
        if (scopedJhGroupId) {
            breakdownParams.push(scopedJhGroupId);
            groupFilterClause = ' AND jh_group_id = $4';
        } else if (scopedDmtId) {
            breakdownParams.push(scopedDmtId);
            groupFilterClause = ' AND jh_group_id IN (SELECT id FROM jh_group WHERE module_group_id = $4)';
        }

        const byType = await query(
            `SELECT COALESCE(type, 'Unclassified') AS type, COUNT(DISTINCT abnormality_id) AS abnormality_count
             FROM abnormalities_details
             WHERE status != 'draft' AND factory_id = $1 AND timestamp >= $2 AND timestamp <= $3${groupFilterClause}
             GROUP BY type
             ORDER BY abnormality_count DESC`,
            breakdownParams
        );
        const byTagColor = await query(
            `SELECT tag_color, COUNT(DISTINCT abnormality_id) AS abnormality_count
             FROM abnormalities_details
             WHERE status != 'draft' AND factory_id = $1 AND timestamp >= $2 AND timestamp <= $3${groupFilterClause}
             GROUP BY tag_color`,
            breakdownParams
        );
        const byStatus = await query(
            `SELECT status, COUNT(DISTINCT abnormality_id) AS abnormality_count
             FROM abnormalities_details
             WHERE status != 'draft' AND factory_id = $1 AND timestamp >= $2 AND timestamp <= $3${groupFilterClause}
             GROUP BY status`,
            breakdownParams
        );
        const byResponsibilityParams = [...breakdownParams];
        const byResponsibility = await query(
            `SELECT COALESCE(ar.name, 'Unassigned') AS responsibility_name, COUNT(DISTINCT ad.abnormality_id) AS abnormality_count
             FROM abnormalities_details ad
             LEFT JOIN abnormality_responsibility ar ON ar.id = ad.responsibility_id
             WHERE ad.status != 'draft' AND ad.factory_id = $1 AND ad.timestamp >= $2 AND ad.timestamp <= $3${groupFilterClause.replace(/jh_group_id/g, 'ad.jh_group_id')}
             GROUP BY ar.name
             ORDER BY abnormality_count DESC`,
            byResponsibilityParams
        );

        const redCount = Number(byTagColor.find(r => r.tag_color === 'red')?.abnormality_count) || 0;
        const whiteCount = Number(byTagColor.find(r => r.tag_color === 'white')?.abnormality_count) || 0;

        // Reviewer workload + per-submitter status breakdown. Approver identity is never
        // stored on the row (resolved live from approval_routing, same as every review
        // action) so this walks every in-flight/terminal item and resolves each one's
        // current-stage approvers the same way the review screen does.
        const allAbnRowsParams = [requesterFactoryId];
        let allAbnRowsScopeClause = '';
        if (scopedJhGroupId) { allAbnRowsParams.push(scopedJhGroupId); allAbnRowsScopeClause = ' AND jh_group_id = $2'; }
        else if (scopedDmtId) { allAbnRowsParams.push(scopedDmtId); allAbnRowsScopeClause = ' AND jh_group_id IN (SELECT id FROM jh_group WHERE module_group_id = $2)'; }
        const allAbnRows = await query(
            `SELECT abnormality_id, status, jh_group_id, submitter_emp_id, submitted_by
             FROM abnormalities_details WHERE factory_id = $1 AND status != 'draft'${allAbnRowsScopeClause}`,
            allAbnRowsParams
        );

        const STATUS_LABEL = {
            pending_review: 'Pending Review', assigned: 'Assigned for Closure',
            pending_dmt_review: 'Pending DMT Review', closed: 'Closed', marked_for_deletion: 'Marked for Deletion',
        };
        const reviewerCounts = new Map();
        const submitterCounts = new Map();
        for (const row of allAbnRows) {
            const stageLabel = STATUS_LABEL[row.status] || row.status;
            if (row.status === 'pending_review' && row.jh_group_id) {
                const approvers = await resolveAbnormalityApprovers(row.jh_group_id);
                for (const empId of approvers) {
                    const key = `${empId}|JH Review`;
                    if (!reviewerCounts.has(key)) reviewerCounts.set(key, { emp_id: empId, stage_name: 'JH Review', abnormality_count: 0 });
                    reviewerCounts.get(key).abnormality_count += 1;
                }
            } else if (row.status === 'pending_dmt_review' && row.jh_group_id) {
                const approvers = await resolveAbnormalityDmtApprovers(row.jh_group_id);
                for (const empId of approvers) {
                    const key = `${empId}|DMT Review`;
                    if (!reviewerCounts.has(key)) reviewerCounts.set(key, { emp_id: empId, stage_name: 'DMT Review', abnormality_count: 0 });
                    reviewerCounts.get(key).abnormality_count += 1;
                }
            }
            if (row.submitter_emp_id) {
                const key = `${row.submitter_emp_id}|${stageLabel}`;
                if (!submitterCounts.has(key)) submitterCounts.set(key, { emp_id: row.submitter_emp_id, stage_label: stageLabel, abnormality_count: 0 });
                submitterCounts.get(key).abnormality_count += 1;
            }
        }
        const namedEmpIds = [...new Set([
            ...[...reviewerCounts.values()].map((r) => r.emp_id),
            ...[...submitterCounts.values()].map((r) => r.emp_id),
        ])];
        const nameRows = namedEmpIds.length
            ? await query('SELECT emp_id, name FROM user_details WHERE emp_id = ANY($1)', [namedEmpIds])
            : [];
        const nameByEmpId = Object.fromEntries(nameRows.map((r) => [r.emp_id, r.name]));
        const reviewerWorkload = [...reviewerCounts.values()]
            .map((r) => ({ ...r, worker_name: nameByEmpId[r.emp_id] || r.emp_id }))
            .sort((a, b) => b.abnormality_count - a.abnormality_count || (a.worker_name || '').localeCompare(b.worker_name || ''));
        const submitterStageBreakdown = [...submitterCounts.values()]
            .map((r) => ({ ...r, worker_name: nameByEmpId[r.emp_id] || r.emp_id }))
            .sort((a, b) => (a.worker_name || '').localeCompare(b.worker_name || '') || (a.stage_label || '').localeCompare(b.stage_label || ''));

        res.json({
            from: from.toISOString(),
            to: to.toISOString(),
            byDmt: byDmt.map(r => ({ ...r, abnormality_count: Number(r.abnormality_count) || 0 })),
            byJhGroup: byJhGroupWithIndex,
            memberSubmissions: memberSubmissions.map(r => ({ ...r, abnormality_count: Number(r.abnormality_count) || 0 })),
            byType: byType.map(r => ({ ...r, abnormality_count: Number(r.abnormality_count) || 0 })),
            byStatus: byStatus.map(r => ({ ...r, status_label: STATUS_LABEL[r.status] || r.status, abnormality_count: Number(r.abnormality_count) || 0 })),
            byResponsibility: byResponsibility.map(r => ({ ...r, abnormality_count: Number(r.abnormality_count) || 0 })),
            tagColor: { red: redCount, white: whiteCount },
            reviewerWorkload,
            submitterStageBreakdown,
        });
    } catch (e) {
        console.error('Error computing Abnormality analytics:', e);
        res.status(500).json({ error: 'Failed to compute Abnormality analytics' });
    }
});
// Month-on-month trend for one JH group — abnormality index, participants, and count per
// calendar month over the last N months. BE-lead+ only, scoped to the requester's plant.
app.get('/api/abnormality-analytics/trend', async (req, res) => {
    if (!pool) return res.json({ months: [] });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    const jhGroupId = req.query.jh_group_id;
    if (!jhGroupId) {
        return res.status(400).json({ error: 'jh_group_id is required' });
    }
    const monthsBack = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));
    try {
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const requesterRole = requesterRows[0]?.role || '';
        if (!BE_LEAD_ROLES.has(requesterRole)) {
            return res.status(403).json({ error: 'You are not authorized to view Abnormality analytics' });
        }
        const requesterPlantCode = requesterRows[0]?.default_plant || null;
        const factoryRows = requesterPlantCode
            ? await query('SELECT id FROM factory WHERE code = $1', [requesterPlantCode])
            : [];
        const requesterFactoryId = factoryRows[0]?.id || null;
        if (!requesterFactoryId) {
            return res.status(400).json({ error: 'Your account has no plant assigned — cannot scope analytics' });
        }
        const groupRows = await query('SELECT id, name, factory_id FROM jh_group WHERE id = $1', [jhGroupId]);
        const group = groupRows[0];
        if (!group || group.factory_id !== requesterFactoryId) {
            return res.status(404).json({ error: 'JH group not found' });
        }

        const monthlyRows = await query(
            `WITH months AS (
                 SELECT date_trunc('month', NOW()) - (n || ' months')::interval AS month_start
                 FROM generate_series(0, $2::int - 1) AS n
             )
             SELECT to_char(m.month_start, 'YYYY-MM') AS month,
                    COUNT(DISTINCT ad.abnormality_id) AS abnormality_count,
                    COUNT(DISTINCT ad.submitter_emp_id) AS participants,
                    (SELECT COUNT(DISTINCT h.emp_id) FROM jh_group_membership_history h
                     WHERE h.jh_group_id = $1
                       AND h.joined_at < m.month_start + interval '1 month'
                       AND (h.left_at IS NULL OR h.left_at >= m.month_start)) AS month_member_count
             FROM months m
             LEFT JOIN abnormalities_details ad ON ad.jh_group_id = $1 AND ad.status != 'draft'
               AND ad.timestamp >= m.month_start AND ad.timestamp < m.month_start + interval '1 month'
             GROUP BY m.month_start
             ORDER BY m.month_start ASC`,
            [jhGroupId, monthsBack]
        );
        const months = monthlyRows.map(r => {
            const abnCount = Number(r.abnormality_count) || 0;
            const participants = Number(r.participants) || 0;
            const monthMemberCount = Number(r.month_member_count) || 0;
            return {
                month: r.month,
                abnormality_count: abnCount,
                participants,
                member_count: monthMemberCount,
                participation_pct: monthMemberCount > 0 ? Math.round((participants / monthMemberCount) * 100) : null,
                abnormality_index: monthMemberCount > 0 ? Number((abnCount / monthMemberCount).toFixed(2)) : null
            };
        });
        res.json({ jh_group_name: group.name, months });
    } catch (e) {
        console.error('Error computing Abnormality analytics trend:', e);
        res.status(500).json({ error: 'Failed to compute Abnormality analytics trend' });
    }
});

// Kaizen Analytics — BE-lead+ only, own-plant scoped. Mirrors /api/abnormality-analytics
// exactly, adapted to Kaizen's fields: category (6 result areas) in place of type/tag_color,
// its own status lifecycle, and a Kaizen-only "savings realised" rollup (Σ savings_estimate
// per unit for confirmed-closed Kaizens). Live-computed, no snapshot table.
const KAIZEN_ANALYTICS_STATUS_LABEL = {
    proposed: 'Proposed', submitted: 'Proposed', pending_review: 'Proposed',
    approved_for_implementation: 'Approved for Implementation', approved: 'Approved for Implementation',
    submitted_for_confirmation: 'Submitted for Validation',
    confirmed_closed: 'Confirmed Closed', confirmed_close: 'Confirmed Closed',
    rejected: 'Rejected',
};
const KAIZEN_CLOSED_STATUSES = ['confirmed_closed', 'confirmed_close'];
app.get('/api/kaizen-analytics', async (req, res) => {
    if (!pool) return res.json({ byDmt: [], byJhGroup: [], from: null, to: null });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const requesterRole = requesterRows[0]?.role || '';
        if (!BE_LEAD_ROLES.has(requesterRole)) {
            return res.status(403).json({ error: 'You are not authorized to view Kaizen analytics' });
        }
        const requesterPlantCode = requesterRows[0]?.default_plant || null;
        const factoryRows = requesterPlantCode ? await query('SELECT id FROM factory WHERE code = $1', [requesterPlantCode]) : [];
        const requesterFactoryId = factoryRows[0]?.id || null;
        if (!requesterFactoryId) {
            return res.status(400).json({ error: 'Your account has no plant assigned — cannot scope analytics' });
        }

        const now = new Date();
        const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        const from = req.query.from ? new Date(req.query.from) : defaultFrom;
        const toRaw = req.query.to ? new Date(req.query.to) : now;
        const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) return res.status(400).json({ error: 'Invalid from/to date' });

        const scopedJhGroupId = req.query.jh_group_id || null;
        const scopedDmtId = req.query.dmt_id || null;
        if (scopedJhGroupId && scopedDmtId) return res.status(400).json({ error: 'Pass jh_group_id or dmt_id, not both' });

        const byDmtParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let byDmtScopeClause = '';
        if (scopedDmtId) { byDmtParams.push(scopedDmtId); byDmtScopeClause = ' AND mg.id = $4'; }
        else if (scopedJhGroupId) { byDmtParams.push(scopedJhGroupId); byDmtScopeClause = ' AND jg.id = $4'; }
        const byDmt = await query(
            `SELECT mg.id AS dmt_id, mg.module AS dmt_name, COUNT(DISTINCT kd.kaizen_id) AS kaizen_count
             FROM module_groups mg
             LEFT JOIN jh_group jg ON jg.module_group_id = mg.id
             LEFT JOIN kaizen_details kd ON kd.jh_group_id = jg.id AND kd.status != 'draft'
               AND kd.timestamp >= $1 AND kd.timestamp <= $2
             WHERE mg.factory_id = $3${byDmtScopeClause}
             GROUP BY mg.id, mg.module ORDER BY mg.module ASC`,
            byDmtParams
        );

        // kaizen_count attributed to the submitter's HOME JH group via membership history,
        // never the FILED-under group (same fix as OPL/Abnormality analytics).
        const byJhGroupParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let byJhGroupScopeClause = '';
        if (scopedJhGroupId) { byJhGroupParams.push(scopedJhGroupId); byJhGroupScopeClause = ' AND jg.id = $4'; }
        else if (scopedDmtId) { byJhGroupParams.push(scopedDmtId); byJhGroupScopeClause = ' AND mg.id = $4'; }
        const byJhGroup = await query(
            `SELECT jg.id AS jh_group_id, jg.name AS jh_group_name, mg.module AS dmt_name,
                    COUNT(DISTINCT kd.kaizen_id) AS kaizen_count,
                    COUNT(DISTINCT kd.kaizen_id) FILTER (WHERE kd.status IN ('confirmed_closed','confirmed_close')) AS closed_count,
                    COUNT(DISTINCT combined.emp_id) AS member_count
             FROM jh_group jg
             LEFT JOIN module_groups mg ON mg.id = jg.module_group_id
             LEFT JOIN (
                 SELECT DISTINCT jh_group_id, emp_id FROM jh_group_membership_history
                 WHERE joined_at <= $2 AND (left_at IS NULL OR left_at >= $1)
             ) combined ON combined.jh_group_id = jg.id
             LEFT JOIN kaizen_details kd ON kd.submitter_emp_id = combined.emp_id AND kd.status != 'draft'
               AND kd.timestamp >= $1 AND kd.timestamp <= $2
             WHERE jg.factory_id = $3${byJhGroupScopeClause}
             GROUP BY jg.id, jg.name, mg.module ORDER BY jg.name ASC`,
            byJhGroupParams
        );
        const byJhGroupWithIndex = byJhGroup.map(row => {
            const kCount = Number(row.kaizen_count) || 0;
            const closed = Number(row.closed_count) || 0;
            const memberCount = Number(row.member_count) || 0;
            return {
                ...row, kaizen_count: kCount, closed_count: closed, member_count: memberCount,
                kaizen_index: memberCount > 0 ? Number((kCount / memberCount).toFixed(2)) : null,
            };
        });

        const memberSubmissionsParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let memberSubmissionsScopeClause = '';
        if (scopedJhGroupId) { memberSubmissionsParams.push(scopedJhGroupId); memberSubmissionsScopeClause = ' AND jg.id = $4'; }
        else if (scopedDmtId) { memberSubmissionsParams.push(scopedDmtId); memberSubmissionsScopeClause = ' AND mg.id = $4'; }
        const memberSubmissions = await query(
            `SELECT combined.emp_id, ud.name AS worker_name, jg.id AS jh_group_id, jg.name AS jh_group_name
                    ${scopedDmtId ? ', mg.module AS dmt_name' : ''},
                    COUNT(DISTINCT kd.kaizen_id) AS kaizen_count
             FROM jh_group jg
             LEFT JOIN module_groups mg ON mg.id = jg.module_group_id
             LEFT JOIN (
                 SELECT DISTINCT jh_group_id, emp_id FROM jh_group_membership_history
                 WHERE joined_at <= $2 AND (left_at IS NULL OR left_at >= $1)
             ) combined ON combined.jh_group_id = jg.id
             LEFT JOIN user_details ud ON ud.emp_id = combined.emp_id
             LEFT JOIN kaizen_details kd ON kd.submitter_emp_id = combined.emp_id AND kd.status != 'draft'
               AND kd.timestamp >= $1 AND kd.timestamp <= $2
             WHERE jg.factory_id = $3 AND combined.emp_id IS NOT NULL${memberSubmissionsScopeClause}
             GROUP BY combined.emp_id, ud.name, jg.id, jg.name${scopedDmtId ? ', mg.module' : ''}
             ORDER BY kaizen_count DESC, ud.name ASC`,
            memberSubmissionsParams
        );

        const breakdownParams = [requesterFactoryId, from.toISOString(), to.toISOString()];
        let groupFilterClause = '';
        if (scopedJhGroupId) { breakdownParams.push(scopedJhGroupId); groupFilterClause = ' AND jh_group_id = $4'; }
        else if (scopedDmtId) { breakdownParams.push(scopedDmtId); groupFilterClause = ' AND jh_group_id IN (SELECT id FROM jh_group WHERE module_group_id = $4)'; }

        const byCategory = await query(
            `SELECT COALESCE(NULLIF(category, ''), 'Uncategorised') AS category, COUNT(DISTINCT kaizen_id) AS kaizen_count
             FROM kaizen_details
             WHERE status != 'draft' AND factory_id = $1 AND timestamp >= $2 AND timestamp <= $3${groupFilterClause}
             GROUP BY 1 ORDER BY kaizen_count DESC`,
            breakdownParams
        );
        const byStatus = await query(
            `SELECT status, COUNT(DISTINCT kaizen_id) AS kaizen_count
             FROM kaizen_details
             WHERE status != 'draft' AND factory_id = $1 AND timestamp >= $2 AND timestamp <= $3${groupFilterClause}
             GROUP BY status`,
            breakdownParams
        );
        // Savings realised — only confirmed-closed Kaizens, grouped by the submitter-chosen unit.
        const savingsByUnit = await query(
            `SELECT COALESCE(NULLIF(savings_unit, ''), 'Unspecified') AS unit,
                    COUNT(DISTINCT kaizen_id) AS kaizen_count,
                    COALESCE(SUM(savings_estimate), 0) AS total
             FROM kaizen_details
             WHERE status IN ('confirmed_closed','confirmed_close') AND factory_id = $1
               AND timestamp >= $2 AND timestamp <= $3${groupFilterClause}
             GROUP BY 1 ORDER BY total DESC`,
            breakdownParams
        );

        // Reviewer workload + per-submitter status breakdown — approver identity is resolved
        // live (never stored on the row), same as the review screen.
        const allRowsParams = [requesterFactoryId];
        let allRowsScopeClause = '';
        if (scopedJhGroupId) { allRowsParams.push(scopedJhGroupId); allRowsScopeClause = ' AND jh_group_id = $2'; }
        else if (scopedDmtId) { allRowsParams.push(scopedDmtId); allRowsScopeClause = ' AND jh_group_id IN (SELECT id FROM jh_group WHERE module_group_id = $2)'; }
        const allRows = await query(
            `SELECT kaizen_id, status, jh_group_id, submitter_emp_id FROM kaizen_details
             WHERE factory_id = $1 AND status != 'draft'${allRowsScopeClause}`,
            allRowsParams
        );
        const reviewerCounts = new Map();
        const submitterCounts = new Map();
        for (const row of allRows) {
            const stageLabel = KAIZEN_ANALYTICS_STATUS_LABEL[row.status] || row.status;
            if (['proposed', 'submitted', 'pending_review'].includes(row.status) && row.jh_group_id) {
                for (const empId of await resolveKaizenApprovers(row.jh_group_id)) {
                    const key = `${empId}|JH Review`;
                    if (!reviewerCounts.has(key)) reviewerCounts.set(key, { emp_id: empId, stage_name: 'JH Review', kaizen_count: 0 });
                    reviewerCounts.get(key).kaizen_count += 1;
                }
            } else if (row.status === 'submitted_for_confirmation' && row.jh_group_id) {
                for (const empId of await resolveKaizenDmtApprovers(row.jh_group_id)) {
                    const key = `${empId}|Implementation Review`;
                    if (!reviewerCounts.has(key)) reviewerCounts.set(key, { emp_id: empId, stage_name: 'Implementation Review', kaizen_count: 0 });
                    reviewerCounts.get(key).kaizen_count += 1;
                }
            }
            if (row.submitter_emp_id) {
                const key = `${row.submitter_emp_id}|${stageLabel}`;
                if (!submitterCounts.has(key)) submitterCounts.set(key, { emp_id: row.submitter_emp_id, stage_label: stageLabel, kaizen_count: 0 });
                submitterCounts.get(key).kaizen_count += 1;
            }
        }
        const namedEmpIds = [...new Set([
            ...[...reviewerCounts.values()].map((r) => r.emp_id),
            ...[...submitterCounts.values()].map((r) => r.emp_id),
        ])];
        const nameRows = namedEmpIds.length
            ? await query('SELECT emp_id, name FROM user_details WHERE emp_id = ANY($1)', [namedEmpIds])
            : [];
        const nameByEmpId = Object.fromEntries(nameRows.map((r) => [r.emp_id, r.name]));
        const reviewerWorkload = [...reviewerCounts.values()]
            .map((r) => ({ ...r, worker_name: nameByEmpId[r.emp_id] || r.emp_id }))
            .sort((a, b) => b.kaizen_count - a.kaizen_count || (a.worker_name || '').localeCompare(b.worker_name || ''));
        const submitterStageBreakdown = [...submitterCounts.values()]
            .map((r) => ({ ...r, worker_name: nameByEmpId[r.emp_id] || r.emp_id }))
            .sort((a, b) => (a.worker_name || '').localeCompare(b.worker_name || '') || (a.stage_label || '').localeCompare(b.stage_label || ''));

        res.json({
            from: from.toISOString(),
            to: to.toISOString(),
            byDmt: byDmt.map(r => ({ ...r, kaizen_count: Number(r.kaizen_count) || 0 })),
            byJhGroup: byJhGroupWithIndex,
            memberSubmissions: memberSubmissions.map(r => ({ ...r, kaizen_count: Number(r.kaizen_count) || 0 })),
            byCategory: byCategory.map(r => ({ ...r, kaizen_count: Number(r.kaizen_count) || 0 })),
            byStatus: byStatus.map(r => ({ ...r, status_label: KAIZEN_ANALYTICS_STATUS_LABEL[r.status] || r.status, kaizen_count: Number(r.kaizen_count) || 0 })),
            savingsByUnit: savingsByUnit.map(r => ({ unit: r.unit, kaizen_count: Number(r.kaizen_count) || 0, total: Number(r.total) || 0 })),
            reviewerWorkload,
            submitterStageBreakdown,
        });
    } catch (e) {
        console.error('Error computing Kaizen analytics:', e);
        res.status(500).json({ error: 'Failed to compute Kaizen analytics' });
    }
});
app.get('/api/kaizen-analytics/trend', async (req, res) => {
    if (!pool) return res.json({ months: [] });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const jhGroupId = req.query.jh_group_id;
    if (!jhGroupId) return res.status(400).json({ error: 'jh_group_id is required' });
    const monthsBack = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));
    try {
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        if (!BE_LEAD_ROLES.has(requesterRows[0]?.role || '')) {
            return res.status(403).json({ error: 'You are not authorized to view Kaizen analytics' });
        }
        const requesterPlantCode = requesterRows[0]?.default_plant || null;
        const factoryRows = requesterPlantCode ? await query('SELECT id FROM factory WHERE code = $1', [requesterPlantCode]) : [];
        const requesterFactoryId = factoryRows[0]?.id || null;
        if (!requesterFactoryId) return res.status(400).json({ error: 'Your account has no plant assigned — cannot scope analytics' });
        const groupRows = await query('SELECT id, name, factory_id FROM jh_group WHERE id = $1', [jhGroupId]);
        const group = groupRows[0];
        if (!group || group.factory_id !== requesterFactoryId) return res.status(404).json({ error: 'JH group not found' });

        const monthlyRows = await query(
            `WITH months AS (
                 SELECT date_trunc('month', NOW()) - (n || ' months')::interval AS month_start
                 FROM generate_series(0, $2::int - 1) AS n
             )
             SELECT to_char(m.month_start, 'YYYY-MM') AS month,
                    COUNT(DISTINCT kd.kaizen_id) AS kaizen_count,
                    COUNT(DISTINCT kd.submitter_emp_id) AS participants,
                    (SELECT COUNT(DISTINCT h.emp_id) FROM jh_group_membership_history h
                     WHERE h.jh_group_id = $1
                       AND h.joined_at < m.month_start + interval '1 month'
                       AND (h.left_at IS NULL OR h.left_at >= m.month_start)) AS month_member_count
             FROM months m
             LEFT JOIN kaizen_details kd ON kd.jh_group_id = $1 AND kd.status != 'draft'
               AND kd.timestamp >= m.month_start AND kd.timestamp < m.month_start + interval '1 month'
             GROUP BY m.month_start ORDER BY m.month_start ASC`,
            [jhGroupId, monthsBack]
        );
        const months = monthlyRows.map(r => {
            const kCount = Number(r.kaizen_count) || 0;
            const participants = Number(r.participants) || 0;
            const mc = Number(r.month_member_count) || 0;
            return {
                month: r.month, kaizen_count: kCount, participants, member_count: mc,
                participation_pct: mc > 0 ? Math.round((participants / mc) * 100) : null,
                kaizen_index: mc > 0 ? Number((kCount / mc).toFixed(2)) : null,
            };
        });
        res.json({ jh_group_name: group.name, months });
    } catch (e) {
        console.error('Error computing Kaizen analytics trend:', e);
        res.status(500).json({ error: 'Failed to compute Kaizen analytics trend' });
    }
});
// 7. OPL (One Point Lessons)
const OPL_REVIEW_ACTIONS = new Set(['jh_accepted', 'jh_rejected', 'be_accepted', 'be_rejected']);
const BE_LEAD_ROLES = new Set(['be_lead', 'it_lead', 'leadership']);
// Resolves the submitter's JH group at submission time, via jh_groups_list membership OR —
// for a JH leader who isn't also listed as a member — via jh_group.leader_emp_id. Leading a
// group counts as belonging to one (so a JH leader doesn't get the "pick a filing group" flow).
async function resolveSubmitterJhGroup(empId) {
    if (!empId || !pool) return { jhGroupId: null, factoryId: null };
    const memberRows = await query(
        `SELECT jh_group_id FROM jh_groups_list WHERE emp_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [empId]
    );
    let jhGroupId = memberRows[0]?.jh_group_id || null;
    if (!jhGroupId) {
        const leaderRows = await query(`SELECT id FROM jh_group WHERE leader_emp_id = $1 LIMIT 1`, [empId]);
        jhGroupId = leaderRows[0]?.id || null;
    }
    if (jhGroupId) {
        const groupRows = await query(`SELECT factory_id FROM jh_group WHERE id = $1`, [jhGroupId]);
        return { jhGroupId, factoryId: groupRows[0]?.factory_id || null };
    }
    // No JH group (e.g. a DMT member) — still give the OPL a plant home, resolved from the
    // submitter's own default plant, so it can route to that plant's BE-lead tier.
    const ud = await query('SELECT default_plant FROM user_details WHERE emp_id = $1', [empId]);
    const factoryId = ud[0]?.default_plant ? await resolveFactoryId(ud[0].default_plant) : null;
    return { jhGroupId: null, factoryId };
}
// Some submitters do work FOR a JH group they don't belong to, or don't belong to any JH
// group at all — so unlike a regular operator (who always files under their own membership),
// they explicitly choose the filing JH group via requestedJhGroupId. This applies to:
//   - anyone with NO home JH group (incl. DMT members who aren't in a JH group)
//   - anyone in the Engineering department (even if they're also in a JH group)
//   - BE-admin tier (be_lead / it_lead / leadership)
// For those submitters the choice is MANDATORY on a real submission (not a draft): the caller
// gets back `mustSelectGroup: true` when they're eligible to pick but didn't, and each POST
// handler 400s that unless the item is being saved as a draft.
// NOTE: filing group only drives routing/visibility — analytics still attribute the submission
// to the submitter's real home group via jh_group_membership_history.
async function resolveSubmitterJhGroupForFiling(empId, requestedJhGroupId) {
    const home = await resolveSubmitterJhGroup(empId);
    if (!pool) return { ...home, mustSelectGroup: false };
    const rows = await query(
        `SELECT ud.role, d.name AS dept
         FROM user_details ud LEFT JOIN departments d ON d.id = ud.department_id
         WHERE ud.emp_id = $1`,
        [empId]
    );
    const role = (rows[0]?.role || '').toLowerCase();
    const dept = rows[0]?.dept || '';
    const canPickGroup = !home.jhGroupId || dept === 'Engineering' || BE_LEAD_ROLES.has(role);
    if (!canPickGroup) return { ...home, mustSelectGroup: false };
    if (requestedJhGroupId) {
        const groupRows = await query(`SELECT factory_id FROM jh_group WHERE id = $1`, [requestedJhGroupId]);
        if (groupRows.length) {
            return { jhGroupId: requestedJhGroupId, factoryId: groupRows[0].factory_id || home.factoryId || null, mustSelectGroup: false };
        }
    }
    return { ...home, mustSelectGroup: true };
}
// Who is allowed to approve/reject/request-changes on a given Kaizen's JH-level review:
// approval_routing if configured for this JH group + 'kaizen', else the JH group's leader_emp_id.
// Mirrors resolveOplApprovers exactly (see below), scoped to entity_type 'kaizen'.
async function resolveKaizenApprovers(jhGroupId) {
    if (!jhGroupId || !pool) return [];
    const routingRows = await query(
        `SELECT approver_role, approver_emp_id FROM approval_routing WHERE jh_group_id = $1 AND entity_type = 'kaizen' AND is_active = true LIMIT 1`,
        [jhGroupId]
    );
    const routing = routingRows[0];
    if (routing && routing.approver_role === 'specific' && routing.approver_emp_id) {
        return routing.approver_emp_id.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const groupRows = await query(`SELECT leader_emp_id FROM jh_group WHERE id = $1`, [jhGroupId]);
    const leaderEmpId = groupRows[0]?.leader_emp_id;
    return leaderEmpId ? [leaderEmpId] : [];
}
// Who does the post-implementation review (confirm-close / mark-for-deletion) on a Kaizen:
// approval_routing (entity_type='kaizen_dmt') if configured for this JH group, else the JH
// group's own leader. (Phase 2's default is now a single JH-leader review — the old
// mandatory DMT-lead confirm stage was dropped; an admin can still add extra stages, and a
// factory that had configured a specific 'kaizen_dmt' approver keeps it.)
async function resolveKaizenDmtApprovers(jhGroupId) {
    if (!jhGroupId || !pool) return [];
    const routingRows = await query(
        `SELECT approver_role, approver_emp_id FROM approval_routing WHERE jh_group_id = $1 AND entity_type = 'kaizen_dmt' AND is_active = true LIMIT 1`,
        [jhGroupId]
    );
    const routing = routingRows[0];
    if (routing && routing.approver_role === 'specific' && routing.approver_emp_id) {
        return routing.approver_emp_id.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const groupRows = await query(`SELECT leader_emp_id FROM jh_group WHERE id = $1`, [jhGroupId]);
    const leaderEmpId = groupRows[0]?.leader_emp_id;
    return leaderEmpId ? [leaderEmpId] : [];
}
// Who is allowed to approve/reject a given OPL at a given stage: approval_routing
// if configured for this JH group + the stage's entity_type, else the JH group's leader_emp_id.
// entityType defaults to 'opl' (stage 1) for backward compatibility with callers that
// haven't been made stage-aware yet.
async function resolveOplApprovers(jhGroupId, entityType = 'opl') {
    if (!jhGroupId || !pool) return [];
    const routingRows = await query(
        `SELECT approver_role, approver_emp_id FROM approval_routing WHERE jh_group_id = $1 AND entity_type = $2 AND is_active = true LIMIT 1`,
        [jhGroupId, entityType]
    );
    const routing = routingRows[0];
    if (routing && routing.approver_role === 'specific' && routing.approver_emp_id) {
        return routing.approver_emp_id.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const groupRows = await query(`SELECT leader_emp_id FROM jh_group WHERE id = $1`, [jhGroupId]);
    const leaderEmpId = groupRows[0]?.leader_emp_id;
    return leaderEmpId ? [leaderEmpId] : [];
}

// Active BE-lead-tier users for a factory — the fallback reviewer pool when an OPL has no
// usable stage approver of its own.
async function beLeadEmpIdsForFactory(factoryId) {
    if (!factoryId || !pool) return [];
    const fac = await query('SELECT code FROM factory WHERE id = $1', [factoryId]);
    const code = fac[0]?.code;
    if (!code) return [];
    const rows = await query(
        `SELECT emp_id FROM user_details
         WHERE is_active = true AND default_plant = $1 AND role IN ('be_lead','it_lead','leadership')`,
        [code]
    );
    return rows.map((r) => r.emp_id).filter(Boolean);
}

// The people who may actually review a given OPL right now: the stage's configured approvers
// (JH leader / routing incharges). A JH leader or routing incharge who submits their OWN OPL
// may still review and approve it — themselves, or a co-approver on the same stage (owner
// direction). Only when the stage has NO configured approver at all (e.g. a DMT member with
// no JH group filed it) does it fall back to the plant's BE-lead tier.
async function resolveEffectiveOplApprovers(oplRow, entityType = 'opl') {
    const base = (await resolveOplApprovers(oplRow.jh_group_id, entityType)).filter(Boolean);
    if (base.length > 0) return base;
    return (await beLeadEmpIdsForFactory(oplRow.factory_id)).filter(Boolean);
}
// The admin-configured, ordered list of OPL review stages for a factory. Every stage after
// the first is addressed in approval_routing via a synthetic entity_type ('opl_stage_2',
// 'opl_stage_3', ...); stage 1 keeps the original 'opl' entity_type so factories that never
// touch the workflow builder see zero behavior change. No configured rows = one implicit
// "JH Review" stage, matching today's default behavior exactly.
async function resolveOplStages(factoryId) {
    const defaultStage = [{ stage_order: 1, stage_name: 'Reviewer 1', entity_type: 'opl' }];
    if (!factoryId || !pool) return defaultStage;
    const rows = await query(
        'SELECT stage_order, stage_name FROM opl_workflow_stage WHERE factory_id = $1 ORDER BY stage_order ASC',
        [factoryId]
    );
    if (rows.length === 0) return defaultStage;
    return rows.map((r) => ({
        stage_order: r.stage_order,
        stage_name: r.stage_name,
        entity_type: r.stage_order === 1 ? 'opl' : `opl_stage_${r.stage_order}`,
    }));
}

// Generalizes the OPL stage-ladder pattern to Kaizen and Abnormality, each of which has TWO
// review points ("phase" 1 = pre-implementation/pre-assignment JH review, phase 2 =
// post-implementation/post-closure-evidence final review). Unlike OPL (one fixed floor stage),
// Kaizen's phase 2 has a two-stage floor (JH forwards, then DMT confirms) — this is the
// existing default flow (D-confirmed with the owner) and must stay the default when nobody has
// touched the workflow builder for that (factory, module, phase).
const WORKFLOW_STAGE_FLOOR = {
    kaizen_1: ['kaizen'],
    // Phase 2 floor is now a single post-implementation review (JH leader by default via
    // resolveKaizenDmtApprovers). The old mandatory second "DMT confirm" stage was removed;
    // admins can still add stages beyond this floor, same as OPL/Abnormality.
    kaizen_2: ['kaizen_dmt'],
    abnormality_1: ['abnormality'],
    abnormality_2: ['abnormality_dmt'],
};
async function resolveModulePhaseStages(factoryId, moduleName, phase) {
    const floor = WORKFLOW_STAGE_FLOOR[`${moduleName}_${phase}`];
    const defaultStages = floor.map((entityType, i) => ({
        stage_order: i + 1,
        stage_name: `Reviewer ${i + 1}`,
        entity_type: entityType,
    }));
    if (!factoryId || !pool) return defaultStages;
    const rows = await query(
        'SELECT stage_order, stage_name FROM workflow_stage WHERE factory_id = $1 AND module = $2 AND phase = $3 ORDER BY stage_order ASC',
        [factoryId, moduleName, phase]
    );
    if (rows.length === 0) return defaultStages;
    return rows.map((r) => ({
        stage_order: r.stage_order,
        stage_name: r.stage_name,
        // Positions within the fixed floor keep their established entity_type (so existing
        // approval_routing rows for 'kaizen'/'kaizen_dmt'/etc keep working unchanged);
        // admin-added positions beyond the floor get a synthetic per-(module,phase) entity_type.
        entity_type: (r.stage_order - 1) < floor.length ? floor[r.stage_order - 1] : `${moduleName}_p${phase}_stage_${r.stage_order}`,
    }));
}
// Role-aware approver resolver for stages ADDED beyond a module/phase's fixed floor — unlike
// the older per-entity-type resolvers (resolveKaizenApprovers etc, kept unchanged for the fixed
// floor to avoid any behavior drift for existing configured factories), this one actually
// honors an explicit 'dmt_leader' approver_role by looking up the module lead, not just
// 'specific'. defaultRole is used only when no approval_routing row exists at all.
async function resolveGenericStageApprovers(jhGroupId, entityType, defaultRole) {
    if (!jhGroupId || !pool) return [];
    const routingRows = await query(
        `SELECT approver_role, approver_emp_id FROM approval_routing WHERE jh_group_id = $1 AND entity_type = $2 AND is_active = true LIMIT 1`,
        [jhGroupId, entityType]
    );
    const routing = routingRows[0];
    const role = routing?.approver_role || defaultRole;
    if (role === 'specific' && routing?.approver_emp_id) {
        return routing.approver_emp_id.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (role === 'dmt_leader') {
        const rows = await query(
            `SELECT mg.module_lead_emp_id FROM jh_group jg LEFT JOIN module_groups mg ON mg.id = jg.module_group_id WHERE jg.id = $1`,
            [jhGroupId]
        );
        const leaderEmpId = rows[0]?.module_lead_emp_id;
        return leaderEmpId ? [leaderEmpId] : [];
    }
    const groupRows = await query(`SELECT leader_emp_id FROM jh_group WHERE id = $1`, [jhGroupId]);
    const leaderEmpId = groupRows[0]?.leader_emp_id;
    return leaderEmpId ? [leaderEmpId] : [];
}
// Dispatches to the right approver list for one resolved stage of a module/phase's ladder:
// the established per-entity resolver for a fixed-floor position, the generic role-aware one
// for anything admin-added beyond it.
async function resolveStageApproversFor(jhGroupId, moduleName, phase, stage, factoryId) {
    const floor = WORKFLOW_STAGE_FLOOR[`${moduleName}_${phase}`];
    const floorIdx = stage.stage_order - 1;
    let base;
    if (floorIdx < floor.length && moduleName === 'kaizen') {
        // Phase 1 floor = the proposal-review JH approvers; phase 2 floor (single stage) =
        // the post-implementation reviewer (JH leader by default, or a configured 'kaizen_dmt').
        base = await (phase === 1 ? resolveKaizenApprovers(jhGroupId) : resolveKaizenDmtApprovers(jhGroupId));
    } else if (floorIdx < floor.length && moduleName === 'abnormality') {
        base = await (phase === 1 ? resolveAbnormalityApprovers(jhGroupId) : resolveAbnormalityDmtApprovers(jhGroupId));
    } else {
        base = await resolveGenericStageApprovers(jhGroupId, stage.entity_type, phase === 2 ? 'dmt_leader' : 'jh_leader');
    }
    base = (base || []).filter(Boolean);
    if (base.length > 0) return base;
    // Nobody resolved from routing / group leader / module lead. Fallback chain:
    //   phase 1 → JH group leader (already tried above) → BE-lead tier
    //   phase 2 → module lead (already tried above) → JH group leader → BE-lead tier
    // A be_admin can always override any of this in Org Structure → Approval Routing.
    if (phase === 2 && jhGroupId) {
        const g = await query('SELECT leader_emp_id FROM jh_group WHERE id = $1', [jhGroupId]);
        if (g[0]?.leader_emp_id) return [g[0].leader_emp_id];
    }
    if (factoryId) return (await beLeadEmpIdsForFactory(factoryId)).filter(Boolean);
    return [];
}
// The set of factory_ids a worker currently has active plant access to (be_admin/it_lead/
// leadership may have more than one; a single-plant be_lead has exactly one).
async function resolveWorkerFactoryIds(empId) {
    if (!empId || !pool) return [];
    const rows = await query('SELECT factory_id FROM user_plant_access WHERE emp_id = $1 AND is_active = true', [empId]);
    return rows.map((r) => r.factory_id);
}
// Shared gate for the approval-routing / workflow-stage admin write endpoints: caller must
// resolve to a be_lead-tier role (or admin), and — when a jh_group_id is supplied — that
// group must belong to a factory the caller actually has plant access to. Writes a 401/403
// response and returns null on failure; returns the caller's emp_id on success.
async function authorizeWorkflowConfigWrite(req, res, { jhGroupId, factoryId } = {}) {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        res.status(401).json({ error: 'x-worker-id header is required' });
        return null;
    }
    const requesterRows = await query('SELECT role FROM user_details WHERE emp_id = $1', [requesterEmpId]);
    const role = requesterRows[0]?.role || '';
    if (!BE_LEAD_ROLES.has(role) && role !== 'admin') {
        res.status(403).json({ error: 'Not authorized to configure approval routing' });
        return null;
    }
    let targetFactoryId = factoryId || null;
    if (!targetFactoryId && jhGroupId) {
        const groupRows = await query('SELECT factory_id FROM jh_group WHERE id = $1', [jhGroupId]);
        targetFactoryId = groupRows[0]?.factory_id || null;
    }
    if (targetFactoryId) {
        const myFactoryIds = await resolveWorkerFactoryIds(requesterEmpId);
        if (!myFactoryIds.includes(targetFactoryId)) {
            res.status(403).json({ error: 'That plant is outside your access' });
            return null;
        }
    }
    return requesterEmpId;
}
app.get('/api/opl-details', async (req, res) => {
    try {
        if (pool) {
            const rows = await query(`
                SELECT od.opl_id, od.title, od.content, od.before_image, od.after_image, od.before_description,
                       od.after_description, od.classification, od.submitted_by, od.submitter_emp_id, od.status,
                       od.timestamp, od.jh_group_id, od.factory_id, od.is_star, od.rejection_reason, od.current_stage_order,
                       od.review_changes,
                       jg.name AS jh_group_name,
                       f.code AS plant_code, f.name AS plant_name
                FROM opl_details od
                LEFT JOIN jh_group jg ON jg.id = od.jh_group_id
                LEFT JOIN factory f ON f.id = od.factory_id
                ORDER BY od.timestamp DESC
            `);
            const stagesByFactory = new Map();
            const withApprovers = await Promise.all(rows.map(async (row) => {
                if (!stagesByFactory.has(row.factory_id)) {
                    stagesByFactory.set(row.factory_id, await resolveOplStages(row.factory_id));
                }
                const stages = stagesByFactory.get(row.factory_id);
                const stageOrder = row.current_stage_order || stages[0].stage_order;
                const stage = stages.find((s) => s.stage_order === stageOrder) || stages[0];
                return {
                    ...row,
                    approver_emp_ids: await resolveEffectiveOplApprovers(row, stage.entity_type),
                    current_stage_order: stage.stage_order,
                    current_stage_name: stage.stage_name,
                    total_stages: stages.length,
                };
            }));
            return res.json(withApprovers);
        }
        res.json(mockDb.oplDetails);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch OPL details' });
    }
});

// Per-plant "Standard Lessons" repository scope. A plant always sees its own approved
// lessons; `extra_factory_ids` lists ADDITIONAL plants whose lessons it also sees. Default
// (no row) = own plant only. GET returns the caller's own plant's setting plus the plant
// list; POST (BE-lead-tier / admin) sets the list for the caller's own plant only — the
// plant is resolved server-side, never client-supplied.
app.get('/api/opl-repository-setting', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (!pool) return res.json({ factory_id: null, extra_factory_ids: [], all_plants: [], can_edit: false });
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const factoryId = await resolveFactoryId(requesterRows[0]?.default_plant);
        const settingRows = await query('SELECT extra_factory_ids FROM opl_repository_setting WHERE factory_id = $1', [factoryId]);
        const allPlants = await query('SELECT id, code, name FROM factory ORDER BY id ASC');
        const validIds = new Set(allPlants.map((p) => String(p.id)));
        const extra = (settingRows[0]?.extra_factory_ids || [])
            .map(String)
            .filter((id) => validIds.has(id) && id !== String(factoryId));
        return res.json({
            factory_id: factoryId,
            extra_factory_ids: extra,
            all_plants: allPlants,
            can_edit: BE_LEAD_ROLES.has(requesterRows[0]?.role || '') || (requesterRows[0]?.role || '') === 'admin',
        });
    } catch {
        res.status(500).json({ error: 'Failed to fetch repository setting' });
    }
});

app.post('/api/opl-repository-setting', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const role = requesterRows[0]?.role || '';
        if (!BE_LEAD_ROLES.has(role) && role !== 'admin') {
            return res.status(403).json({ error: 'Only a BE Lead can change the repository scope' });
        }
        const factoryId = await resolveFactoryId(requesterRows[0]?.default_plant);
        if (!factoryId) return res.status(400).json({ error: 'Your account has no plant assigned' });
        const allPlants = await query('SELECT id FROM factory');
        const validIds = new Set(allPlants.map((p) => String(p.id)));
        // Only real, other-than-own plant ids are stored; own plant is always implicit.
        const extra = Array.isArray(req.body?.extra_factory_ids)
            ? Array.from(new Set(req.body.extra_factory_ids.map(String)))
                .filter((id) => validIds.has(id) && id !== String(factoryId))
            : [];
        await query(
            `INSERT INTO opl_repository_setting (factory_id, extra_factory_ids, updated_by_emp_id, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (factory_id) DO UPDATE SET
               extra_factory_ids = EXCLUDED.extra_factory_ids,
               updated_by_emp_id = EXCLUDED.updated_by_emp_id,
               updated_at = NOW()`,
            [factoryId, extra, requesterEmpId]
        );
        return res.json({ factory_id: factoryId, extra_factory_ids: extra });
    } catch {
        res.status(500).json({ error: 'Failed to update repository setting' });
    }
});

// Per-plant Kaizen repository scope — mirrors opl_repository_setting exactly. A plant's
// "All Standard Kaizens" tab shows its own closed kaizens plus any OTHER plants a BE lead
// has opted into. Self-healing schema (no migration runner in this codebase).
let _kaizenRepoSchemaEnsured = false;
async function ensureKaizenRepoSchema() {
    if (_kaizenRepoSchemaEnsured || !pool) return;
    try {
        await query(`CREATE TABLE IF NOT EXISTS kaizen_repository_setting (
            factory_id text PRIMARY KEY,
            extra_factory_ids text[] NOT NULL DEFAULT '{}',
            updated_by_emp_id text,
            updated_at timestamptz DEFAULT NOW()
        )`);
        _kaizenRepoSchemaEnsured = true;
    } catch (e) {
        console.error('ensureKaizenRepoSchema failed:', e.message);
    }
}
app.get('/api/kaizen-repository-setting', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (!pool) return res.json({ factory_id: null, extra_factory_ids: [], all_plants: [], can_edit: false });
        await ensureKaizenRepoSchema();
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const factoryId = await resolveFactoryId(requesterRows[0]?.default_plant);
        const settingRows = await query('SELECT extra_factory_ids FROM kaizen_repository_setting WHERE factory_id = $1', [factoryId]);
        const allPlants = await query('SELECT id, code, name FROM factory ORDER BY id ASC');
        const validIds = new Set(allPlants.map((p) => String(p.id)));
        const extra = (settingRows[0]?.extra_factory_ids || [])
            .map(String)
            .filter((id) => validIds.has(id) && id !== String(factoryId));
        return res.json({
            factory_id: factoryId,
            extra_factory_ids: extra,
            all_plants: allPlants,
            can_edit: BE_LEAD_ROLES.has(requesterRows[0]?.role || '') || (requesterRows[0]?.role || '') === 'admin',
        });
    } catch {
        res.status(500).json({ error: 'Failed to fetch Kaizen repository setting' });
    }
});
app.post('/api/kaizen-repository-setting', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        await ensureKaizenRepoSchema();
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const role = requesterRows[0]?.role || '';
        if (!BE_LEAD_ROLES.has(role) && role !== 'admin') {
            return res.status(403).json({ error: 'Only a BE Lead can change the repository scope' });
        }
        const factoryId = await resolveFactoryId(requesterRows[0]?.default_plant);
        if (!factoryId) return res.status(400).json({ error: 'Your account has no plant assigned' });
        const allPlants = await query('SELECT id FROM factory');
        const validIds = new Set(allPlants.map((p) => String(p.id)));
        const extra = Array.isArray(req.body?.extra_factory_ids)
            ? Array.from(new Set(req.body.extra_factory_ids.map(String)))
                .filter((id) => validIds.has(id) && id !== String(factoryId))
            : [];
        await query(
            `INSERT INTO kaizen_repository_setting (factory_id, extra_factory_ids, updated_by_emp_id, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (factory_id) DO UPDATE SET
               extra_factory_ids = EXCLUDED.extra_factory_ids,
               updated_by_emp_id = EXCLUDED.updated_by_emp_id,
               updated_at = NOW()`,
            [factoryId, extra, requesterEmpId]
        );
        return res.json({ factory_id: factoryId, extra_factory_ids: extra });
    } catch {
        res.status(500).json({ error: 'Failed to update Kaizen repository setting' });
    }
});

// Per-plant Abnormality repository scope — mirrors kaizen_repository_setting exactly. A plant's
// "Repository" tab (closed abnormalities) shows its own plus any OTHER plants a BE lead opts in.
let _abnRepoSchemaEnsured = false;
async function ensureAbnRepoSchema() {
    if (_abnRepoSchemaEnsured || !pool) return;
    try {
        await query(`CREATE TABLE IF NOT EXISTS abnormality_repository_setting (
            factory_id text PRIMARY KEY,
            extra_factory_ids text[] NOT NULL DEFAULT '{}',
            updated_by_emp_id text,
            updated_at timestamptz DEFAULT NOW()
        )`);
        _abnRepoSchemaEnsured = true;
    } catch (e) {
        console.error('ensureAbnRepoSchema failed:', e.message);
    }
}
app.get('/api/abnormality-repository-setting', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (!pool) return res.json({ factory_id: null, extra_factory_ids: [], all_plants: [], can_edit: false });
        await ensureAbnRepoSchema();
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const factoryId = await resolveFactoryId(requesterRows[0]?.default_plant);
        const settingRows = await query('SELECT extra_factory_ids FROM abnormality_repository_setting WHERE factory_id = $1', [factoryId]);
        const allPlants = await query('SELECT id, code, name FROM factory ORDER BY id ASC');
        const validIds = new Set(allPlants.map((p) => String(p.id)));
        const extra = (settingRows[0]?.extra_factory_ids || [])
            .map(String)
            .filter((id) => validIds.has(id) && id !== String(factoryId));
        return res.json({
            factory_id: factoryId,
            extra_factory_ids: extra,
            all_plants: allPlants,
            can_edit: BE_LEAD_ROLES.has(requesterRows[0]?.role || '') || (requesterRows[0]?.role || '') === 'admin',
        });
    } catch {
        res.status(500).json({ error: 'Failed to fetch Abnormality repository setting' });
    }
});
app.post('/api/abnormality-repository-setting', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        await ensureAbnRepoSchema();
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const role = requesterRows[0]?.role || '';
        if (!BE_LEAD_ROLES.has(role) && role !== 'admin') {
            return res.status(403).json({ error: 'Only a BE Lead can change the repository scope' });
        }
        const factoryId = await resolveFactoryId(requesterRows[0]?.default_plant);
        if (!factoryId) return res.status(400).json({ error: 'Your account has no plant assigned' });
        const allPlants = await query('SELECT id FROM factory');
        const validIds = new Set(allPlants.map((p) => String(p.id)));
        const extra = Array.isArray(req.body?.extra_factory_ids)
            ? Array.from(new Set(req.body.extra_factory_ids.map(String)))
                .filter((id) => validIds.has(id) && id !== String(factoryId))
            : [];
        await query(
            `INSERT INTO abnormality_repository_setting (factory_id, extra_factory_ids, updated_by_emp_id, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (factory_id) DO UPDATE SET
               extra_factory_ids = EXCLUDED.extra_factory_ids,
               updated_by_emp_id = EXCLUDED.updated_by_emp_id,
               updated_at = NOW()`,
            [factoryId, extra, requesterEmpId]
        );
        return res.json({ factory_id: factoryId, extra_factory_ids: extra });
    } catch {
        res.status(500).json({ error: 'Failed to update Abnormality repository setting' });
    }
});

app.post('/api/opl-details', async (req, res) => {
    const { title, content, before_image, after_image, before_description, before_remarks, after_description, after_remarks, classification, submitted_by, status, jh_group_id } = req.body;
    const submitter = submitted_by || req.headers['x-worker-id'];
    if (!submitter) {
        return res.status(400).json({ error: 'submitted_by or x-worker-id header is required' });
    }
    const itemStatus = status || 'draft';
    const itemClass = classification || 'Basic Condition';
    const finalBeforeDesc = before_description || before_remarks || null;
    const finalAfterDesc = after_description || after_remarks || null;
    try {
        if (pool) {
            // submitted_by may be a formatted display string ("Name (ID: X)"); the JH group
            // lookup needs the real emp_id, which only the x-worker-id header reliably carries.
            const { jhGroupId, factoryId, mustSelectGroup } = await resolveSubmitterJhGroupForFiling(req.headers['x-worker-id'], jh_group_id);
            if (mustSelectGroup && itemStatus !== 'draft') {
                return res.status(400).json({ error: 'Select a DMT and JH group to file this under before submitting.' });
            }
            const rows = await query(`INSERT INTO opl_details (title, content, before_image, after_image, before_description, after_description, classification, submitted_by, submitter_emp_id, status, jh_group_id, factory_id, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING opl_id, title, content, before_image, after_image, before_description, after_description, classification, submitted_by, submitter_emp_id, status, timestamp, jh_group_id, factory_id`, [
                title,
                content || '',
                before_image || null,
                after_image || null,
                finalBeforeDesc,
                finalAfterDesc,
                itemClass,
                submitter,
                req.headers['x-worker-id'] || null,
                itemStatus,
                jhGroupId,
                factoryId
            ]);
            const created = rows[0];
            if (created) {
                await query(
                    `INSERT INTO opl_audit_trail (opl_id, action, status_from, status_to, submitted_by_from, submitted_by_to, performed_by, comments, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                    [String(created.opl_id), 'created', null, itemStatus, null, submitter, submitter, 'Created OPL Detail']
                ).catch(() => {});
            }
            if (created && ['pending_jh_review', 'pending_approval', 'pending_be_review'].includes(created.status)) {
                try {
                    const stages = await resolveOplStages(created.factory_id);
                    const approvers = await resolveEffectiveOplApprovers(
                        { jh_group_id: created.jh_group_id, submitter_emp_id: created.submitter_emp_id, factory_id: created.factory_id },
                        stages[0].entity_type
                    );
                    await notify(approvers, {
                        kind: 'opl_review_pending', module: 'opl', entityId: created.opl_id,
                        createdBy: req.headers['x-worker-id'],
                        title: 'OPL to review',
                        body: `"${created.title || `OPL #${created.opl_id}`}" is waiting for your review.`,
                    });
                } catch (e) { console.error('OPL submit notify failed:', e.message); }
            }
            return res.json({ ...created, before_remarks: finalBeforeDesc, after_remarks: finalAfterDesc });
        }
        const newDetail = {
            opl_id: mockDb.oplDetails.length + 1,
            title: title || 'Untitled OPL',
            content: content || '',
            before_image: before_image || null,
            after_image: after_image || null,
            before_description: finalBeforeDesc,
            before_remarks: finalBeforeDesc,
            after_description: finalAfterDesc,
            after_remarks: finalAfterDesc,
            classification: itemClass,
            submitted_by: submitter,
            status: itemStatus,
            timestamp: new Date().toISOString()
        };
        mockDb.oplDetails.unshift(newDetail);
        if (!mockDb.oplAuditTrail) mockDb.oplAuditTrail = [];
        mockDb.oplAuditTrail.unshift({
            id: `audit-${Date.now()}`,
            opl_id: String(newDetail.opl_id),
            action: 'created',
            status_from: null,
            status_to: itemStatus,
            submitted_by_from: null,
            submitted_by_to: submitter,
            performed_by: submitter,
            comments: 'Created OPL Detail',
            changed_fields: null,
            timestamp: new Date().toISOString()
        });
        res.json(newDetail);
    }
    catch {
        res.status(500).json({ error: 'Failed to create OPL detail' });
    }
});
app.put('/api/opl-details/:id', async (req, res) => {
    const { id } = req.params;
    const {
        title, content, before_image, after_image, before_description, after_description,
        classification, submitted_by, status, comments, performed_by,
        is_star, rejection_reason, action: customAction
    } = req.body;
    // Prefer the authenticated header identity (a bare emp_id) over the request body's
    // performed_by (historically a display name) so opl_audit_trail.performed_by is a
    // consistent emp_id going forward — see the normaliser in GET /api/opl-analytics.
    const actor = req.headers['x-worker-id'] || performed_by;
    if (!actor) {
        return res.status(400).json({ error: 'performed_by or x-worker-id header is required' });
    }
    try {
        if (pool) {
            const existingRows = await query('SELECT * FROM opl_details WHERE opl_id = $1', [id]);
            const existing = existingRows[0];
            if (!existing) return res.status(404).json({ error: 'OPL detail not found' });

            // Stage overrides computed below when the action is a stage transition — these
            // take precedence over any client-supplied `status`/current_stage_order, since the
            // server (not the client) owns which stage an OPL is on and when it's truly done.
            let stageOverrideStatus;
            let stageOverrideStageOrder;
            let stageAuditNote = '';

            if (OPL_REVIEW_ACTIONS.has(customAction)) {
                // performed_by from the request body is a display name, not reliable for
                // authorization. The real identity comes only from the x-worker-id header.
                const requesterEmpId = req.headers['x-worker-id'];
                if (!requesterEmpId) {
                    return res.status(401).json({ error: 'x-worker-id header is required for review actions' });
                }
                const requesterRows = await query('SELECT role FROM user_details WHERE emp_id = $1', [requesterEmpId]);
                const requesterRole = requesterRows[0]?.role || '';
                const PENDING_REVIEW_STATUSES = new Set(['pending_jh_review', 'pending_approval', 'pending_be_review']);
                let authorized;
                if (customAction === 'jh_accepted' || customAction === 'jh_rejected') {
                    // First-approver-wins / no re-deciding: once this item has left the
                    // "awaiting review" statuses (approved, rejected, or moved to a later
                    // stage no longer resolvable to this approver), a second reviewer's action
                    // is rejected outright rather than silently re-applying.
                    if (!PENDING_REVIEW_STATUSES.has(existing.status)) {
                        return res.status(409).json({ error: 'This OPL is no longer awaiting review — it may have already been decided.' });
                    }
                    // Review is strictly limited to the configured approver(s) for the OPL's
                    // CURRENT stage — no role-based bypass, even for BE Admin/leadership.
                    const stages = await resolveOplStages(existing.factory_id);
                    const currentStageOrder = existing.current_stage_order || stages[0].stage_order;
                    const currentStage = stages.find((s) => s.stage_order === currentStageOrder) || stages[0];
                    // A JH leader / routing incharge listed as the stage's approver may review
                    // their own submission (owner direction) — so no self-submitter block here.
                    // Falls back to the BE-lead tier only when the stage has no approver at all.
                    const approvers = await resolveEffectiveOplApprovers(existing, currentStage.entity_type);
                    authorized = approvers.includes(requesterEmpId);
                    if (authorized && customAction === 'jh_accepted') {
                        const currentIdx = stages.findIndex((s) => s.stage_order === currentStage.stage_order);
                        const nextStage = stages[currentIdx + 1];
                        if (nextStage) {
                            stageOverrideStatus = existing.status; // still pending review, just moved to the next stage
                            stageOverrideStageOrder = nextStage.stage_order;
                            stageAuditNote = `Approved at "${currentStage.stage_name}" — moved to "${nextStage.stage_name}"`;
                        } else {
                            stageOverrideStatus = 'approved';
                            stageOverrideStageOrder = currentStage.stage_order;
                            stageAuditNote = `Approved at "${currentStage.stage_name}" (final stage)`;
                        }
                    } else if (authorized && customAction === 'jh_rejected') {
                        stageAuditNote = `Rejected at "${currentStage.stage_name}"`;
                    }
                } else {
                    // BE-stage review (be_accepted/be_rejected) remains a BE-lead role privilege.
                    authorized = BE_LEAD_ROLES.has(requesterRole);
                }
                if (!authorized) {
                    return res.status(403).json({ error: 'You are not authorized to review this OPL' });
                }
            }

            // Plain content edit (no review action): only the submitter may edit their own
            // OPL, and only while it is still a draft. BE-lead tier / admin may edit any draft.
            if (!OPL_REVIEW_ACTIONS.has(customAction) && (title !== undefined || content !== undefined || before_description !== undefined || after_description !== undefined || before_image !== undefined || after_image !== undefined)) {
                const editorEmpId = req.headers['x-worker-id'];
                const editorRows = editorEmpId ? await query('SELECT role FROM user_details WHERE emp_id = $1', [editorEmpId]) : [];
                const editorRole = editorRows[0]?.role || '';
                const isPrivileged = BE_LEAD_ROLES.has(editorRole) || editorRole === 'admin';
                if (existing.status !== 'draft') {
                    return res.status(409).json({ error: 'An OPL can only be edited while it is a draft.' });
                }
                if (!isPrivileged && existing.submitter_emp_id && editorEmpId !== existing.submitter_emp_id) {
                    return res.status(403).json({ error: 'Only the submitter can edit this draft.' });
                }
            }

            const newTitle = title !== undefined ? title : existing.title;
            const newContent = content !== undefined ? content : existing.content;
            const newBeforeImg = before_image !== undefined ? before_image : existing.before_image;
            const newAfterImg = after_image !== undefined ? after_image : existing.after_image;
            const newBeforeDesc = before_description !== undefined ? before_description : existing.before_description;
            const newAfterDesc = after_description !== undefined ? after_description : existing.after_description;
            const classificationLocked = ['approved', 'rejected', 'published'].includes(existing.status);
            if (classificationLocked && classification !== undefined && classification !== existing.classification) {
                return res.status(403).json({ error: 'Classification cannot be changed once an OPL is approved, rejected, or published' });
            }
            // The submitter picks the classification on the create form and while it's still a
            // draft — but once submitted, only a reviewer may change it.
            if (classification !== undefined && classification !== existing.classification
                && existing.status !== 'draft'
                && req.headers['x-worker-id'] && existing.submitter_emp_id === req.headers['x-worker-id']) {
                return res.status(403).json({ error: 'Only the reviewer can change the classification after an OPL is submitted' });
            }
            const newClass = classification !== undefined ? classification : existing.classification;
            const newSubmitter = submitted_by !== undefined ? submitted_by : existing.submitted_by;

            // JH reviewer edit-and-diff: when approving, snapshot whatever the reviewer changed
            // from what the submitter reported, so the submitter sees a before/after diff
            // (mirrors Kaizen/Abnormality). Merges across stages rather than overwriting.
            let newReviewChanges = existing.review_changes || null;
            if (customAction === 'jh_accepted') {
                const merged = { ...(existing.review_changes || {}) };
                const editCandidates = [
                    ['title', existing.title, newTitle],
                    ['content', existing.content, newContent],
                    ['before_description', existing.before_description, newBeforeDesc],
                    ['after_description', existing.after_description, newAfterDesc],
                    ['before_image', existing.before_image, newBeforeImg],
                    ['after_image', existing.after_image, newAfterImg],
                    ['classification', existing.classification, newClass],
                ];
                for (const [field, from, to] of editCandidates) {
                    if ((from ?? '') !== (to ?? '')) merged[field] = { from: from ?? null, to: to ?? null };
                }
                newReviewChanges = Object.keys(merged).length ? JSON.stringify(merged) : (existing.review_changes || null);
            }
            // A stage-transition override (computed above from server-side stage config) always
            // wins over whatever `status` the client sent — the client only sends 'approved' as
            // an optimistic guess, but only the server knows whether another stage still remains.
            const newStatus = stageOverrideStatus !== undefined ? stageOverrideStatus : (status !== undefined ? status : existing.status);
            const PENDING_REVIEW_STATUSES_ALL = new Set(['pending_jh_review', 'pending_approval', 'pending_be_review']);
            // A (re)submission — status moving INTO a pending-review state from something that
            // wasn't (draft, or rejected-then-reworked) — always restarts at stage 1, even if it
            // was rejected deep in a multi-stage flow. Reworked content deserves a full review,
            // not a resume from wherever it got kicked back.
            const isFreshSubmission = stageOverrideStageOrder === undefined
                && PENDING_REVIEW_STATUSES_ALL.has(newStatus)
                && !PENDING_REVIEW_STATUSES_ALL.has(existing.status);
            let newStageOrder = stageOverrideStageOrder !== undefined ? stageOverrideStageOrder : existing.current_stage_order;
            if (isFreshSubmission) {
                const stagesForReset = await resolveOplStages(existing.factory_id);
                newStageOrder = stagesForReset[0].stage_order;
            }
            const newStar = is_star !== undefined ? Boolean(is_star) : (existing.is_star || false);
            const newRejection = rejection_reason !== undefined ? rejection_reason : (existing.rejection_reason || null);

            // Attempt to update with newly supported columns gracefully
            let updatedRows = [];
            try {
                updatedRows = await query(
                    `UPDATE opl_details SET
                       title = $1, content = $2, before_image = $3, after_image = $4,
                       before_description = $5, after_description = $6, classification = $7,
                       submitted_by = $8, status = $9, is_star = $10, rejection_reason = $11, current_stage_order = $12,
                       review_changes = $13
                     WHERE opl_id = $14 RETURNING *`,
                    [newTitle, newContent, newBeforeImg, newAfterImg, newBeforeDesc, newAfterDesc, newClass, newSubmitter, newStatus, newStar, newRejection, newStageOrder, newReviewChanges, id]
                );
            } catch {
                // Fallback for standard schema
                updatedRows = await query(
                    `UPDATE opl_details SET
                       title = $1, content = $2, before_image = $3, after_image = $4,
                       before_description = $5, after_description = $6, classification = $7,
                       submitted_by = $8, status = $9
                     WHERE opl_id = $10 RETURNING *`,
                    [newTitle, newContent, newBeforeImg, newAfterImg, newBeforeDesc, newAfterDesc, newClass, newSubmitter, newStatus, id]
                );
            }

            // On approval, auto-push training to every member of the OPL's own submitting
            // JH group (including the author) — but never to the approver themselves, since
            // approving isn't the same as needing to be trained on it. The manual Push
            // Training flow is only needed for pushing beyond this default group.
            if ((customAction === 'jh_accepted' || customAction === 'be_accepted') && newStatus === 'approved' && existing.jh_group_id) {
                const approverEmpId = req.headers['x-worker-id'] || actor;
                const memberRows = await query('SELECT emp_id FROM jh_groups_list WHERE jh_group_id = $1', [existing.jh_group_id]);
                for (const member of memberRows) {
                    if (!member.emp_id || member.emp_id === approverEmpId) continue;
                    await query(
                        `INSERT INTO opl_training_assignment (opl_id, jh_group_id, assigned_emp_id, assigned_by_emp_id, status, assigned_at)
                         VALUES ($1, $2, $3, $4, 'assigned', NOW())
                         ON CONFLICT (opl_id, assigned_emp_id) DO NOTHING`,
                        [id, existing.jh_group_id, member.emp_id, approverEmpId]
                    ).catch(() => {});
                }
            }

            let logAction = customAction || 'updated';
            if (!customAction) {
                if (existing.classification !== newClass) {
                    logAction = 'classification_changed';
                } else if (existing.submitted_by !== newSubmitter && existing.status !== newStatus) {
                    logAction = 'submitted_by_and_status_changed';
                } else if (existing.submitted_by !== newSubmitter) {
                    logAction = 'submitted_by_updated';
                } else if (existing.status !== newStatus) {
                    logAction = 'status_changed';
                }
            }

            const baseComments = comments || (
                logAction === 'classification_changed'
                    ? `Classification changed from "${existing.classification}" to "${newClass}" by ${actor}`
                    : `Updated OPL Detail #${id}`
            );
            const auditComments = stageAuditNote ? `${baseComments} (${stageAuditNote})` : baseComments;

            await query(
                `INSERT INTO opl_audit_trail (opl_id, action, status_from, status_to, submitted_by_from, submitted_by_to, performed_by, comments, changed_fields, timestamp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
                [
                    String(id),
                    logAction,
                    existing.status,
                    newStatus,
                    existing.submitted_by,
                    newSubmitter,
                    actor,
                    auditComments,
                    JSON.stringify({
                        title_changed: existing.title !== newTitle,
                        content_changed: existing.content !== newContent,
                        submitter_changed: existing.submitted_by !== newSubmitter,
                        status_changed: existing.status !== newStatus,
                        classification_changed: existing.classification !== newClass,
                        old_classification: existing.classification,
                        new_classification: newClass,
                        rejection_reason: newRejection,
                        review_changes: customAction === 'jh_accepted' && typeof newReviewChanges === 'string'
                            ? JSON.parse(newReviewChanges) : undefined
                    })
                ]
            ).catch(() => {});

            // --- notify the person at the receiving end of this transition ---
            try {
                const linkTitle = newTitle || existing.title || `OPL #${id}`;
                if (customAction === 'jh_rejected') {
                    await resolveNotifications('opl', id, ['opl_review_pending']);
                    await notify(existing.submitter_emp_id, {
                        kind: 'opl_rejected', module: 'opl', entityId: id, createdBy: actor,
                        title: 'Your OPL needs changes',
                        body: `"${linkTitle}" was sent back${newRejection ? `: ${newRejection}` : ''}.`,
                    });
                } else if (newStatus === 'approved') {
                    await resolveNotifications('opl', id, ['opl_review_pending']);
                    await notify(existing.submitter_emp_id, {
                        kind: 'opl_approved', module: 'opl', entityId: id, createdBy: actor,
                        title: 'Your OPL was approved', body: `"${linkTitle}" is now a standard lesson.`,
                    });
                } else if (PENDING_REVIEW_STATUSES_ALL.has(newStatus)) {
                    // fresh submission, resubmission, or a stage advance — whoever must act now
                    await resolveNotifications('opl', id, ['opl_review_pending']);
                    const stages = await resolveOplStages(existing.factory_id);
                    const curStage = stages.find((s) => s.stage_order === newStageOrder) || stages[0];
                    const approvers = await resolveEffectiveOplApprovers(
                        { jh_group_id: existing.jh_group_id, submitter_emp_id: existing.submitter_emp_id, factory_id: existing.factory_id },
                        curStage.entity_type
                    );
                    await notify(approvers, {
                        kind: 'opl_review_pending', module: 'opl', entityId: id, createdBy: actor,
                        title: 'OPL to review',
                        body: `"${linkTitle}" is waiting for your review${stages.length > 1 ? ` (${curStage.stage_name})` : ''}.`,
                    });
                }
            } catch (e) { console.error('OPL notify failed:', e.message); }

            const result = updatedRows[0] || {};
            result.is_star = newStar;
            result.rejection_reason = newRejection;
            return res.json(result);
        }

        const idx = mockDb.oplDetails.findIndex(d => String(d.opl_id) === String(id));
        if (idx === -1) return res.status(404).json({ error: 'OPL detail not found' });

        const existing = mockDb.oplDetails[idx];
        const newSubmitter = submitted_by !== undefined ? submitted_by : existing.submitted_by;
        const newStatus = status !== undefined ? status : existing.status;
        const newClass = classification !== undefined ? classification : existing.classification;
        const newStar = is_star !== undefined ? Boolean(is_star) : (existing.is_star || false);
        const newRejection = rejection_reason !== undefined ? rejection_reason : (existing.rejection_reason || null);

        const updated = {
            ...existing,
            title: title !== undefined ? title : existing.title,
            content: content !== undefined ? content : existing.content,
            before_image: before_image !== undefined ? before_image : existing.before_image,
            after_image: after_image !== undefined ? after_image : existing.after_image,
            before_description: before_description !== undefined ? before_description : existing.before_description,
            after_description: after_description !== undefined ? after_description : existing.after_description,
            classification: newClass,
            submitted_by: newSubmitter,
            status: newStatus,
            is_star: newStar,
            rejection_reason: newRejection
        };
        mockDb.oplDetails[idx] = updated;

        let logAction = customAction || 'updated';
        if (!customAction) {
            if (existing.classification !== newClass) {
                logAction = 'classification_changed';
            } else if (existing.submitted_by !== newSubmitter && existing.status !== newStatus) {
                logAction = 'submitted_by_and_status_changed';
            } else if (existing.submitted_by !== newSubmitter) {
                logAction = 'submitted_by_updated';
            } else if (existing.status !== newStatus) {
                logAction = 'status_changed';
            }
        }

        const auditComments = comments || (
            logAction === 'classification_changed'
                ? `Classification changed from "${existing.classification}" to "${newClass}" by ${actor}`
                : `Updated OPL Detail #${id}`
        );

        if (!mockDb.oplAuditTrail) mockDb.oplAuditTrail = [];
        mockDb.oplAuditTrail.unshift({
            id: `audit-${Date.now()}`,
            opl_id: String(id),
            action: logAction,
            status_from: existing.status,
            status_to: newStatus,
            submitted_by_from: existing.submitted_by,
            submitted_by_to: newSubmitter,
            performed_by: actor,
            comments: auditComments,
            changed_fields: {
                submitter_changed: existing.submitted_by !== newSubmitter,
                status_changed: existing.status !== newStatus,
                classification_changed: existing.classification !== newClass,
                old_classification: existing.classification,
                new_classification: newClass,
                rejection_reason: newRejection
            },
            timestamp: new Date().toISOString()
        });

        res.json(updated);
    } catch (e) {
        console.error('Error updating OPL detail:', e);
        res.status(500).json({ error: 'Failed to update OPL detail' });
    }
});
// Training push — JH lead+ and BE-lead roles can assign an already-approved OPL as
// training to an individual, a whole JH group, or a specific subset of a group's members.
const PUSH_TRAINING_ROLES = new Set(['jh_lead', 'module_lead', ...BE_LEAD_ROLES]);
app.post('/api/opl-training/push', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const { opl_id, target_type, jh_group_id, emp_ids } = req.body;
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    if (!opl_id || !target_type) {
        return res.status(400).json({ error: 'opl_id and target_type are required' });
    }
    try {
        const requesterRows = await query('SELECT role FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const requesterRole = requesterRows[0]?.role || '';
        if (!PUSH_TRAINING_ROLES.has(requesterRole)) {
            return res.status(403).json({ error: 'You are not authorized to push training' });
        }

        const oplRows = await query('SELECT opl_id, status FROM opl_details WHERE opl_id = $1', [opl_id]);
        const opl = oplRows[0];
        if (!opl) return res.status(404).json({ error: 'OPL not found' });
        if (opl.status !== 'approved') {
            return res.status(409).json({ error: 'Only approved OPLs can be pushed as training' });
        }

        let targetEmpIds = [];
        if (target_type === 'user') {
            if (!Array.isArray(emp_ids) || emp_ids.length === 0) {
                return res.status(400).json({ error: 'emp_ids is required for target_type "user"' });
            }
            targetEmpIds = emp_ids;
        } else if (target_type === 'jh_group') {
            if (!jh_group_id) {
                return res.status(400).json({ error: 'jh_group_id is required for target_type "jh_group"' });
            }
            const memberRows = await query('SELECT emp_id FROM jh_groups_list WHERE jh_group_id = $1', [jh_group_id]);
            targetEmpIds = memberRows.map(r => r.emp_id);
        } else if (target_type === 'jh_group_members') {
            if (!jh_group_id || !Array.isArray(emp_ids) || emp_ids.length === 0) {
                return res.status(400).json({ error: 'jh_group_id and emp_ids are required for target_type "jh_group_members"' });
            }
            const memberRows = await query('SELECT emp_id FROM jh_groups_list WHERE jh_group_id = $1', [jh_group_id]);
            const validMembers = new Set(memberRows.map(r => r.emp_id));
            targetEmpIds = emp_ids.filter(id => validMembers.has(id));
        } else {
            return res.status(400).json({ error: 'target_type must be one of "user", "jh_group", "jh_group_members"' });
        }

        targetEmpIds = [...new Set(targetEmpIds.filter(Boolean))];
        if (targetEmpIds.length === 0) {
            return res.status(400).json({ error: 'No valid target users resolved for this push' });
        }

        const inserted = [];
        for (const empId of targetEmpIds) {
            // A manual push always (re)assigns as pending — including resetting a
            // previously-completed assignment back to "assigned" for retraining.
            const rows = await query(
                `INSERT INTO opl_training_assignment (opl_id, jh_group_id, assigned_emp_id, assigned_by_emp_id, status, assigned_at)
                 VALUES ($1, $2, $3, $4, 'assigned', NOW())
                 ON CONFLICT (opl_id, assigned_emp_id) DO UPDATE SET
                   assigned_by_emp_id = EXCLUDED.assigned_by_emp_id,
                   status = 'assigned',
                   assigned_at = NOW(),
                   completed_at = NULL
                 RETURNING *`,
                [opl_id, jh_group_id || null, empId, requesterEmpId]
            );
            inserted.push(rows[0]);
        }
        res.json({ pushed: inserted.length, assignments: inserted });
    } catch (e) {
        console.error('Error pushing training:', e);
        res.status(500).json({ error: 'Failed to push training' });
    }
});
app.get('/api/opl-training/assignments', async (req, res) => {
    if (!pool) return res.json([]);
    // Backstop for the recurring-training sweep in case the hourly timer is asleep
    // (e.g. IIS app-pool idle-recycle). Fire-and-forget, throttled internally.
    sweepDueOplTrainingSchedules().catch(() => {});
    const { opl_id, emp_id } = req.query;
    try {
        const conditions = [];
        const params = [];
        if (opl_id) {
            params.push(opl_id);
            conditions.push(`ota.opl_id = $${params.length}`);
        }
        if (emp_id) {
            params.push(emp_id);
            conditions.push(`ota.assigned_emp_id = $${params.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = await query(
            `SELECT ota.*, ud.name AS assigned_name, jg.name AS jh_group_name, jg.factory_id AS plant_id,
                    f.code AS plant_code, f.name AS plant_name, mg.module AS dmt_name, d.name AS department_name
             FROM opl_training_assignment ota
             LEFT JOIN user_details ud ON ud.emp_id = ota.assigned_emp_id
             LEFT JOIN jh_group jg ON jg.id = ota.jh_group_id
             LEFT JOIN factory f ON f.id = jg.factory_id
             LEFT JOIN module_groups mg ON mg.id = jg.module_group_id
             LEFT JOIN departments d ON d.id = ud.department_id
             ${where}
             ORDER BY ota.assigned_at DESC`,
            params
        );
        res.json(rows);
    } catch (e) {
        console.error('Error fetching training assignments:', e);
        res.status(500).json({ error: 'Failed to fetch training assignments' });
    }
});
// Permanent, append-only log of EVERY training completion — one row per completion event.
// opl_training_assignment holds only the person's CURRENT status per OPL (it's reset on a
// re-push / recurring cycle), so without this we'd lose the record of earlier completions.
// Self-healing schema + one-time backfill of already-completed assignments as cycle 1.
let _trainingCompletionSchemaEnsured = false;
async function ensureTrainingCompletionSchema() {
    if (_trainingCompletionSchemaEnsured || !pool) return;
    try {
        await query(`CREATE TABLE IF NOT EXISTS opl_training_completion (
            id serial PRIMARY KEY,
            opl_id integer NOT NULL,
            emp_id text NOT NULL,
            jh_group_id text,
            assigned_by_emp_id text,
            assigned_at timestamptz,
            completed_at timestamptz NOT NULL DEFAULT NOW(),
            created_at timestamptz NOT NULL DEFAULT NOW()
        )`);
        await query('CREATE INDEX IF NOT EXISTS opl_training_completion_idx ON opl_training_completion (opl_id, emp_id, completed_at DESC)');
        const cnt = await query('SELECT COUNT(*)::int AS n FROM opl_training_completion');
        if ((cnt[0]?.n || 0) === 0) {
            await query(`INSERT INTO opl_training_completion (opl_id, emp_id, jh_group_id, assigned_by_emp_id, assigned_at, completed_at)
                         SELECT opl_id, assigned_emp_id, jh_group_id, assigned_by_emp_id, assigned_at, completed_at
                         FROM opl_training_assignment
                         WHERE status = 'completed' AND completed_at IS NOT NULL`);
        }
        _trainingCompletionSchemaEnsured = true;
    } catch (e) {
        console.error('ensureTrainingCompletionSchema failed:', e.message);
    }
}

app.patch('/api/opl-training/assignments/:id', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const { id } = req.params;
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    try {
        const rows = await query('SELECT * FROM opl_training_assignment WHERE id = $1', [id]);
        const assignment = rows[0];
        if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
        if (assignment.assigned_emp_id !== requesterEmpId) {
            return res.status(403).json({ error: 'You can only complete your own training assignment' });
        }
        const wasAlreadyDone = assignment.status === 'completed';
        const updated = await query(
            `UPDATE opl_training_assignment SET status = 'completed', completed_at = NOW() WHERE id = $1 RETURNING *`,
            [id]
        );
        // Log this completion permanently — but not if it was already 'completed' (a no-op
        // re-click shouldn't create a duplicate history row).
        if (!wasAlreadyDone) {
            await ensureTrainingCompletionSchema();
            await query(
                `INSERT INTO opl_training_completion (opl_id, emp_id, jh_group_id, assigned_by_emp_id, assigned_at, completed_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [assignment.opl_id, assignment.assigned_emp_id, assignment.jh_group_id || null,
                 assignment.assigned_by_emp_id || null, assignment.assigned_at || null, updated[0].completed_at]
            ).catch((e) => console.error('completion-log insert failed:', e.message));
        }
        res.json(updated[0]);
    } catch (e) {
        console.error('Error completing training assignment:', e);
        res.status(500).json({ error: 'Failed to update training assignment' });
    }
});

// Full completion history. `?opl_id=` → every completion of that OPL by anyone (incharge/
// reviewer only). `?emp_id=` → that person's history (self always allowed; others need
// incharge). No filter → the caller's own full history.
app.get('/api/opl-training/completions', async (req, res) => {
    if (!pool) return res.json([]);
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        await ensureTrainingCompletionSchema();
        const oplId = req.query.opl_id ? Number(req.query.opl_id) : null;
        const empId = req.query.emp_id ? String(req.query.emp_id) : null;
        const selfOnly = !oplId && (!empId || empId === requesterEmpId);
        if (!selfOnly && !(await isOplTrainingIncharge(requesterEmpId))) {
            return res.status(403).json({ error: 'Not authorized to view other people\'s training history' });
        }
        const clauses = [];
        const params = [];
        if (oplId) { params.push(oplId); clauses.push(`c.opl_id = $${params.length}`); }
        if (selfOnly) { params.push(requesterEmpId); clauses.push(`c.emp_id = $${params.length}`); }
        else if (empId) { params.push(empId); clauses.push(`c.emp_id = $${params.length}`); }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const rows = await query(
            `SELECT c.*, u.name AS emp_name, ab.name AS assigned_by_name, od.title AS opl_title,
                    ROW_NUMBER() OVER (PARTITION BY c.opl_id, c.emp_id ORDER BY c.completed_at ASC) AS cycle
             FROM opl_training_completion c
             LEFT JOIN user_details u ON u.emp_id = c.emp_id
             LEFT JOIN user_details ab ON ab.emp_id = c.assigned_by_emp_id
             LEFT JOIN opl_details od ON od.opl_id = c.opl_id
             ${where}
             ORDER BY c.completed_at DESC
             LIMIT 1000`,
            params
        );
        res.json(rows);
    } catch (e) {
        console.error('Error fetching training completions:', e);
        res.status(500).json({ error: 'Failed to fetch training completions' });
    }
});

// ============================================================================
// Recurring OPL training schedules
// An "incharge" (BE-lead tier / module lead / JH lead / a JH-group leader / a named OPL
// reviewer) can put an approved OPL on a fortnightly/monthly/quarterly cycle that
// auto-assigns it as training to the current members of one or more JH groups. All
// incharges see and manage every schedule. Firing: an in-process hourly sweep (below)
// plus a throttled backstop on GET /api/opl-training/assignments — no external scheduler.
// ============================================================================

async function isOplTrainingIncharge(empId) {
    if (!empId || !pool) return false;
    const rows = await query('SELECT role FROM user_details WHERE emp_id = $1', [empId]);
    const role = rows[0]?.role || '';
    if (BE_LEAD_ROLES.has(role) || role === 'admin' || role === 'module_lead' || role === 'jh_lead') return true;
    const lead = await query('SELECT 1 FROM jh_group WHERE leader_emp_id = $1 LIMIT 1', [empId]);
    if (lead.length > 0) return true;
    const routing = await query(
        `SELECT approver_emp_id FROM approval_routing WHERE entity_type ~ '^opl' AND approver_role = 'specific' AND is_active = true`
    );
    for (const r of routing) {
        const ids = String(r.approver_emp_id || '').split(',').map((s) => s.trim());
        if (ids.includes(empId)) return true;
    }
    return false;
}

function addDays(dateLike, n) {
    const d = new Date(dateLike);
    d.setDate(d.getDate() + Number(n || 0));
    return d;
}
function ymdLocal(dateLike) {
    const x = new Date(dateLike);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function scheduleNextDueDate(schedule) {
    if (!schedule.last_run_at) return new Date(`${schedule.start_date}T00:00:00`);
    return addDays(schedule.last_run_at, schedule.interval_days);
}
function scheduleIsDue(schedule, now = new Date()) {
    if (!schedule.is_active) return false;
    if (schedule.end_date) {
        const end = new Date(`${schedule.end_date}T23:59:59`);
        if (now > end) return false;
    }
    return scheduleNextDueDate(schedule) <= now;
}

async function resolveScheduleTargets(schedule) {
    const groupIds = (schedule.target_jh_group_ids || []).map(String);
    if (groupIds.length === 0) return [];
    const rows = await query(
        'SELECT emp_id, jh_group_id FROM jh_groups_list WHERE jh_group_id = ANY($1::text[])',
        [groupIds]
    );
    let members = rows.filter((r) => r.emp_id);
    const subset = (schedule.target_emp_ids || []).map(String);
    if (subset.length > 0) {
        const set = new Set(subset);
        members = members.filter((m) => set.has(String(m.emp_id)));
    }
    const seen = new Set();
    const out = [];
    for (const m of members) {
        if (seen.has(String(m.emp_id))) continue;
        seen.add(String(m.emp_id));
        out.push(m);
    }
    return out;
}

async function runOplTrainingSchedule(schedule, triggeredBy = 'auto') {
    const oplRows = await query('SELECT status FROM opl_details WHERE opl_id = $1', [schedule.opl_id]);
    const oplOk = oplRows[0] && oplRows[0].status === 'approved';
    let count = 0;
    if (oplOk) {
        const targets = await resolveScheduleTargets(schedule);
        for (const t of targets) {
            await query(
                `INSERT INTO opl_training_assignment (opl_id, jh_group_id, assigned_emp_id, assigned_by_emp_id, status, assigned_at)
                 VALUES ($1, $2, $3, $4, 'assigned', NOW())
                 ON CONFLICT (opl_id, assigned_emp_id) DO UPDATE SET
                   assigned_by_emp_id = EXCLUDED.assigned_by_emp_id,
                   jh_group_id = EXCLUDED.jh_group_id,
                   status = 'assigned',
                   assigned_at = NOW(),
                   completed_at = NULL`,
                [schedule.opl_id, t.jh_group_id || null, t.emp_id, `SCHEDULE:${schedule.id}`]
            ).catch(() => {});
            count += 1;
        }
    }
    await query(
        'INSERT INTO opl_training_schedule_run (schedule_id, assigned_count, triggered_by) VALUES ($1, $2, $3)',
        [schedule.id, count, triggeredBy]
    );
    await query('UPDATE opl_training_schedule SET last_run_at = NOW(), updated_at = NOW() WHERE id = $1', [schedule.id]);
    return count;
}

let _lastTrainingSweepMs = 0;
async function sweepDueOplTrainingSchedules(force = false) {
    if (!pool) return;
    const nowMs = Date.now();
    if (!force && nowMs - _lastTrainingSweepMs < 10 * 60 * 1000) return;
    _lastTrainingSweepMs = nowMs;
    try {
        const rows = await query('SELECT * FROM opl_training_schedule WHERE is_active = true');
        const now = new Date();
        for (const s of rows) {
            if (!scheduleIsDue(s, now)) continue;
            try {
                await runOplTrainingSchedule(s, 'auto');
            } catch (e) {
                console.error(`[training-schedule] run failed for schedule ${s.id}:`, e.message);
            }
        }
    } catch (e) {
        console.error('[training-schedule] sweep failed:', e.message);
    }
}
// Day-before audit reminders. For every active schedule whose next occurrence is
// tomorrow (and we haven't already reminded for that date), notify the assigned auditors
// + the schedule's Audit Admin, then stamp last_reminded_for so it fires exactly once per
// occurrence. In-process, no external scheduler — mirrors the OPL training sweep.
async function sweepDueAuditReminders() {
    if (!pool) return;
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrowStr = auditToDateOnly(auditAddDays(today, 1));
        const rows = await query('SELECT * FROM audit_schedule WHERE is_active = true');
        for (const s of rows) {
            let occ;
            try { occ = nextAuditOccurrence(s, today); } catch { continue; }
            if (occ !== tomorrowStr) continue;
            if (s.last_reminded_for && String(s.last_reminded_for).slice(0, 10) === occ) continue;
            const auditors = await query('SELECT emp_id FROM audit_schedule_auditor WHERE schedule_id = $1', [s.id]);
            const recipients = [...new Set([...auditors.map((a) => a.emp_id), s.admin_emp_id].filter(Boolean))];
            const meta = await query(
                'SELECT t.name AS template_name, z.name AS zone_name FROM audit_schedule sc JOIN audit_template t ON t.id = sc.template_id JOIN zone z ON z.id = sc.zone_id WHERE sc.id = $1',
                [s.id]
            );
            const label = meta[0] ? `${meta[0].template_name} · ${meta[0].zone_name}` : 'A scheduled audit';
            try {
                await notify(recipients, {
                    kind: 'audit_reminder', module: 'audit', entityId: s.id,
                    title: 'Scheduled audit tomorrow',
                    body: `${label} is scheduled for ${occ}.`,
                });
                await query('UPDATE audit_schedule SET last_reminded_for = $1 WHERE id = $2', [occ, s.id]);
            } catch (e) {
                console.error(`[audit-reminder] failed for schedule ${s.id}:`, e.message);
            }
        }
    } catch (e) {
        console.error('[audit-reminder] sweep failed:', e.message);
    }
}
if (pool) {
    const _sweepTimer = setInterval(() => { sweepDueOplTrainingSchedules(true); sweepDueAuditReminders(); }, 60 * 60 * 1000);
    if (_sweepTimer.unref) _sweepTimer.unref();
    setTimeout(() => { sweepDueOplTrainingSchedules(true); sweepDueAuditReminders(); }, 15 * 1000);
}

app.get('/api/opl-training/schedules', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.json([]);
    try {
        if (!(await isOplTrainingIncharge(requesterEmpId))) {
            return res.status(403).json({ error: 'You are not authorized to view training schedules' });
        }
        sweepDueOplTrainingSchedules().catch(() => {});
        const rows = await query(`
            SELECT s.*, od.title AS opl_title, od.is_star AS opl_is_star, od.status AS opl_status,
                   cu.name AS created_by_name, pu.name AS paused_by_name
            FROM opl_training_schedule s
            LEFT JOIN opl_details od ON od.opl_id = s.opl_id
            LEFT JOIN user_details cu ON cu.emp_id = s.created_by_emp_id
            LEFT JOIN user_details pu ON pu.emp_id = s.paused_by_emp_id
            ORDER BY s.created_at DESC
        `);
        const allGroupIds = [...new Set(rows.flatMap((r) => (r.target_jh_group_ids || []).map(String)))];
        const groupNameById = {};
        if (allGroupIds.length) {
            const g = await query('SELECT id, name FROM jh_group WHERE id = ANY($1::text[])', [allGroupIds]);
            g.forEach((x) => { groupNameById[String(x.id)] = x.name; });
        }
        const lastRuns = await query(`
            SELECT DISTINCT ON (schedule_id) schedule_id, run_at, assigned_count, triggered_by
            FROM opl_training_schedule_run ORDER BY schedule_id, run_at DESC
        `);
        const lastRunBySched = {};
        lastRuns.forEach((x) => { lastRunBySched[x.schedule_id] = x; });
        res.json(rows.map((s) => ({
            ...s,
            target_group_names: (s.target_jh_group_ids || []).map((id) => groupNameById[String(id)] || id),
            next_due: s.is_active ? ymdLocal(scheduleNextDueDate(s)) : null,
            last_run: lastRunBySched[s.id] || null,
        })));
    } catch (e) {
        console.error('Error fetching training schedules:', e);
        res.status(500).json({ error: 'Failed to fetch training schedules' });
    }
});

app.post('/api/opl-training/schedules', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    try {
        if (!(await isOplTrainingIncharge(requesterEmpId))) {
            return res.status(403).json({ error: 'You are not authorized to create training schedules' });
        }
        const { opl_id, interval_days, target_jh_group_ids, target_emp_ids, start_date, end_date } = req.body;
        const days = Math.round(Number(interval_days));
        if (!opl_id || !Array.isArray(target_jh_group_ids) || target_jh_group_ids.length === 0) {
            return res.status(400).json({ error: 'opl_id and at least one target JH group are required' });
        }
        if (!Number.isFinite(days) || days < 1 || days > 3650) {
            return res.status(400).json({ error: 'interval_days must be a whole number between 1 and 3650' });
        }
        const oplRows = await query('SELECT status FROM opl_details WHERE opl_id = $1', [opl_id]);
        if (!oplRows[0]) return res.status(404).json({ error: 'OPL not found' });
        if (oplRows[0].status !== 'approved') return res.status(409).json({ error: 'Only approved OPLs can be scheduled' });
        const rows = await query(
            `INSERT INTO opl_training_schedule
               (opl_id, interval_days, target_jh_group_ids, target_emp_ids, start_date, end_date, created_by_emp_id)
             VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6::date, $7)
             RETURNING *`,
            [opl_id, days, target_jh_group_ids.map(String), (target_emp_ids || []).map(String),
             start_date || null, end_date || null, requesterEmpId]
        );
        res.json(rows[0]);
    } catch (e) {
        console.error('Error creating training schedule:', e);
        res.status(500).json({ error: 'Failed to create training schedule' });
    }
});

app.patch('/api/opl-training/schedules/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    try {
        if (!(await isOplTrainingIncharge(requesterEmpId))) return res.status(403).json({ error: 'Not authorized' });
        const existing = (await query('SELECT * FROM opl_training_schedule WHERE id = $1', [req.params.id]))[0];
        if (!existing) return res.status(404).json({ error: 'Schedule not found' });
        const { is_active, pause_reason, interval_days, target_jh_group_ids, target_emp_ids, start_date, end_date } = req.body;
        const newActive = is_active !== undefined ? Boolean(is_active) : existing.is_active;
        const pausingNow = is_active === false && existing.is_active;
        let days = null;
        if (interval_days !== undefined) {
            days = Math.round(Number(interval_days));
            if (!Number.isFinite(days) || days < 1 || days > 3650) {
                return res.status(400).json({ error: 'interval_days must be a whole number between 1 and 3650' });
            }
        }
        const rows = await query(
            `UPDATE opl_training_schedule SET
               is_active = $1,
               paused_by_emp_id = $2,
               pause_reason = $3,
               interval_days = COALESCE($4, interval_days),
               target_jh_group_ids = COALESCE($5::text[], target_jh_group_ids),
               target_emp_ids = COALESCE($6::text[], target_emp_ids),
               start_date = COALESCE($7::date, start_date),
               end_date = $8::date,
               updated_at = NOW()
             WHERE id = $9 RETURNING *`,
            [
                newActive,
                pausingNow ? requesterEmpId : (newActive ? null : existing.paused_by_emp_id),
                pausingNow ? (pause_reason || null) : (newActive ? null : existing.pause_reason),
                days,
                Array.isArray(target_jh_group_ids) ? target_jh_group_ids.map(String) : null,
                Array.isArray(target_emp_ids) ? target_emp_ids.map(String) : null,
                start_date || null,
                end_date !== undefined ? (end_date || null) : (existing.end_date || null),
                req.params.id,
            ]
        );
        res.json(rows[0]);
    } catch (e) {
        console.error('Error updating training schedule:', e);
        res.status(500).json({ error: 'Failed to update training schedule' });
    }
});

app.delete('/api/opl-training/schedules/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    try {
        if (!(await isOplTrainingIncharge(requesterEmpId))) return res.status(403).json({ error: 'Not authorized' });
        const del = await query('DELETE FROM opl_training_schedule WHERE id = $1 RETURNING id', [req.params.id]);
        if (!del[0]) return res.status(404).json({ error: 'Schedule not found' });
        res.json({ deleted: del[0].id });
    } catch (e) {
        console.error('Error deleting training schedule:', e);
        res.status(500).json({ error: 'Failed to delete training schedule' });
    }
});

app.post('/api/opl-training/schedules/:id/run', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    try {
        if (!(await isOplTrainingIncharge(requesterEmpId))) return res.status(403).json({ error: 'Not authorized' });
        const s = (await query('SELECT * FROM opl_training_schedule WHERE id = $1', [req.params.id]))[0];
        if (!s) return res.status(404).json({ error: 'Schedule not found' });
        const count = await runOplTrainingSchedule(s, requesterEmpId);
        res.json({ assigned: count });
    } catch (e) {
        console.error('Error running training schedule:', e);
        res.status(500).json({ error: 'Failed to run training schedule' });
    }
});

app.get('/api/opl-training/schedules/:id/runs', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.json([]);
    try {
        if (!(await isOplTrainingIncharge(requesterEmpId))) return res.status(403).json({ error: 'Not authorized' });
        const rows = await query(
            `SELECT r.*, u.name AS triggered_by_name
             FROM opl_training_schedule_run r
             LEFT JOIN user_details u ON u.emp_id = r.triggered_by
             WHERE r.schedule_id = $1 ORDER BY r.run_at DESC LIMIT 30`,
            [req.params.id]
        );
        res.json(rows);
    } catch (e) {
        console.error('Error fetching schedule runs:', e);
        res.status(500).json({ error: 'Failed to fetch schedule runs' });
    }
});

// ============================================================================
// In-app notifications (poll-based, no external services)
// ============================================================================

// Fan a notification out to a set of recipients. `module` ('opl'|'kaizen'|'abnormality'
// |'audit') tags it for the bell's tabs; `entityId` is the deep-link target. Whoever
// performed the triggering action is never notified. A still-unread notification of the
// same (recipient, kind, module, entity) is refreshed rather than duplicated.
// Self-healing schema: the notification table predates the module/entity_id columns. This
// codebase applies additive DDL lazily from route handlers (see approval_routing) rather
// than via a migration runner — mirror that so a plain restart is enough, no manual SQL.
let _notifSchemaEnsured = false;
async function ensureNotificationSchema() {
    if (_notifSchemaEnsured || !pool) return;
    try {
        await query('ALTER TABLE notification ADD COLUMN IF NOT EXISTS module text');
        await query('ALTER TABLE notification ADD COLUMN IF NOT EXISTS entity_id text');
        await query("UPDATE notification SET module = 'opl', entity_id = opl_id::text WHERE opl_id IS NOT NULL AND module IS NULL");
        await query('CREATE INDEX IF NOT EXISTS notification_module_entity_idx ON notification (module, entity_id, kind)');
        _notifSchemaEnsured = true;
    } catch (e) {
        console.error('ensureNotificationSchema failed:', e.message);
    }
}

async function notify(recipientEmpIds, { kind, module, entityId, title, body, createdBy }) {
    if (!pool) return;
    await ensureNotificationSchema();
    const actor = createdBy != null ? String(createdBy) : null;
    const list = Array.isArray(recipientEmpIds) ? recipientEmpIds : [recipientEmpIds];
    const ids = [...new Set(list.filter(Boolean).map(String))];
    const eid = entityId != null ? String(entityId) : null;
    const oplId = module === 'opl' && eid != null && /^\d+$/.test(eid) ? Number(eid) : null;
    for (const rid of ids) {
        if (rid === actor) continue;
        try {
            const dup = await query(
                `SELECT id FROM notification
                 WHERE recipient_emp_id = $1 AND kind = $2 AND module = $3
                   AND entity_id IS NOT DISTINCT FROM $4 AND is_read = false
                 LIMIT 1`,
                [rid, kind, module, eid]
            );
            if (dup[0]) {
                await query(
                    'UPDATE notification SET created_at = NOW(), title = $2, body = $3, created_by_emp_id = $4 WHERE id = $1',
                    [dup[0].id, title, body || null, actor]
                );
            } else {
                await query(
                    `INSERT INTO notification (recipient_emp_id, kind, module, entity_id, opl_id, title, body, created_by_emp_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [rid, kind, module, eid, oplId, title, body || null, actor]
                );
            }
        } catch (e) {
            console.error('notify insert failed:', e.message);
        }
    }
}

// Clear "please act" notifications for an entity once the action is no longer needed
// (item advanced to the next stage, or was decided). Info notifications ('*_approved',
// '*_rejected', '*_closed') are left for the recipient to open and dismiss themselves.
async function resolveNotifications(module, entityId, kinds) {
    if (!pool || entityId == null) return;
    await ensureNotificationSchema();
    const list = Array.isArray(kinds) ? kinds : [kinds];
    try {
        await query(
            'DELETE FROM notification WHERE module = $1 AND entity_id = $2 AND kind = ANY($3::text[])',
            [module, String(entityId), list]
        );
    } catch (e) {
        console.error('resolveNotifications failed:', e.message);
    }
}

app.get('/api/notifications', async (req, res) => {
    const empId = req.headers['x-worker-id'];
    if (!empId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.json({ notifications: [], unread_count: 0 });
    try {
        await ensureNotificationSchema();
        // Drop this person's notifications that point at an item that no longer exists
        // (e.g. the OPL/Kaizen/Abnormality was deleted) — nothing to link to any more.
        await query(
            `DELETE FROM notification n
             WHERE n.recipient_emp_id = $1 AND n.entity_id IS NOT NULL AND (
               (n.module = 'opl' AND n.entity_id ~ '^[0-9]+$'
                  AND NOT EXISTS (SELECT 1 FROM opl_details o WHERE o.opl_id::text = n.entity_id))
               OR (n.module = 'kaizen'
                  AND NOT EXISTS (SELECT 1 FROM kaizen_details k WHERE k.kaizen_id::text = n.entity_id))
               OR (n.module = 'abnormality'
                  AND NOT EXISTS (SELECT 1 FROM abnormalities_details a WHERE a.abnormality_id::text = n.entity_id))
             )`,
            [empId]
        ).catch((e) => console.error('notification orphan cleanup failed:', e.message));
        const rows = await query(
            `SELECT n.*, u.name AS created_by_name
             FROM notification n
             LEFT JOIN user_details u ON u.emp_id = n.created_by_emp_id
             WHERE n.recipient_emp_id = $1
             ORDER BY n.is_read ASC, n.created_at DESC
             LIMIT 120`,
            [empId]
        );
        const unread = rows.filter((r) => !r.is_read).length;
        res.json({ notifications: rows, unread_count: unread });
    } catch (e) {
        console.error('Error fetching notifications:', e);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.post('/api/notifications/read-all', async (req, res) => {
    const empId = req.headers['x-worker-id'];
    if (!empId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    try {
        await query(
            `UPDATE notification SET is_read = true, read_at = NOW()
             WHERE recipient_emp_id = $1 AND is_read = false`,
            [empId]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('Error marking notifications read:', e);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

app.post('/api/notifications/:id/read', async (req, res) => {
    const empId = req.headers['x-worker-id'];
    if (!empId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    try {
        const rows = await query(
            `UPDATE notification SET is_read = true, read_at = NOW()
             WHERE id = $1 AND recipient_emp_id = $2 RETURNING id`,
            [req.params.id, empId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Notification not found' });
        res.json({ ok: true });
    } catch (e) {
        console.error('Error marking notification read:', e);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Dismiss (delete) one notification — used for the "info" kinds ('*_approved' / '*_rejected'
// / '*_closed') the moment the recipient opens them. The actionable "*_pending" kinds are
// removed automatically by resolveNotifications() when the item moves on, not from here.
app.delete('/api/notifications/:id', async (req, res) => {
    const empId = req.headers['x-worker-id'];
    if (!empId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    try {
        await query('DELETE FROM notification WHERE id = $1 AND recipient_emp_id = $2', [req.params.id, empId]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Error dismissing notification:', e);
        res.status(500).json({ error: 'Failed to dismiss notification' });
    }
});

// An incharge (leader / routing reviewer for the target's JH group, or a training incharge)
// nudges a team member about training they've been assigned but not completed. One
// notification per lesson; a still-unread reminder for the same lesson is refreshed, not
// duplicated.
app.post('/api/opl-training/remind', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    try {
        await ensureNotificationSchema();
        const { emp_id } = req.body;
        const oplIds = Array.isArray(req.body.opl_ids)
            ? req.body.opl_ids
            : (req.body.opl_id != null ? [req.body.opl_id] : []);
        if (!emp_id || oplIds.length === 0) {
            return res.status(400).json({ error: 'emp_id and at least one opl_id are required' });
        }

        // Authorisation: the requester must oversee a JH group the target belongs to, or be a
        // training incharge.
        let authorized = await isOplTrainingIncharge(requesterEmpId);
        if (!authorized) {
            const myGroups = await jhGroupsLedOrReviewedBy(requesterEmpId);
            if (myGroups.length > 0) {
                const gids = myGroups.map((g) => String(g.id));
                const inGroup = await query(
                    `SELECT 1 FROM jh_groups_list WHERE emp_id = $1 AND jh_group_id::text = ANY($2::text[]) LIMIT 1`,
                    [emp_id, gids]
                );
                authorized = inGroup.length > 0;
            }
        }
        if (!authorized) return res.status(403).json({ error: 'You are not authorized to remind this person' });

        // Only lessons actually assigned to them and NOT yet completed.
        const pending = await query(
            `SELECT ota.opl_id, od.title
             FROM opl_training_assignment ota
             LEFT JOIN opl_details od ON od.opl_id = ota.opl_id
             WHERE ota.assigned_emp_id = $1 AND ota.status = 'assigned'
               AND ota.opl_id = ANY($2::int[])`,
            [emp_id, oplIds.map(Number)]
        );
        if (pending.length === 0) {
            return res.status(409).json({ error: 'That person has no pending training for the selected lessons' });
        }

        let sent = 0;
        for (const p of pending) {
            const title = 'Training pending';
            const body = `Please complete the OPL training: "${p.title || `OPL #${p.opl_id}`}".`;
            const dup = await query(
                `SELECT id FROM notification
                 WHERE recipient_emp_id = $1 AND kind = 'training_reminder' AND opl_id = $2 AND is_read = false
                 LIMIT 1`,
                [emp_id, p.opl_id]
            );
            if (dup[0]) {
                await query('UPDATE notification SET created_at = NOW(), created_by_emp_id = $2 WHERE id = $1', [dup[0].id, requesterEmpId]);
            } else {
                await query(
                    `INSERT INTO notification (recipient_emp_id, kind, module, entity_id, title, body, opl_id, created_by_emp_id)
                     VALUES ($1, 'training_reminder', 'opl', $2::text, $3, $4, $2::int, $5)`,
                    [emp_id, p.opl_id, title, body, requesterEmpId]
                );
            }
            sent += 1;
        }
        res.json({ reminded: sent });
    } catch (e) {
        console.error('Error sending training reminder:', e);
        res.status(500).json({ error: 'Failed to send reminder' });
    }
});

// OPL Analytics — BE-lead+ only. Live-computed from opl_details/jh_group/module_groups/
// jh_groups_list; no separate snapshot table, always reflects current real data.
app.get('/api/opl-analytics', async (req, res) => {
    if (!pool) return res.json({ byDmt: [], byJhGroup: [], from: null, to: null });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    try {
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const requesterRole = requesterRows[0]?.role || '';
        if (!BE_LEAD_ROLES.has(requesterRole)) {
            return res.status(403).json({ error: 'You are not authorized to view OPL analytics' });
        }
        // Scope every result to the requester's own plant — a BE admin registered at one
        // plant must never see another plant's OPL data.
        const requesterPlantCode = requesterRows[0]?.default_plant || null;
        const factoryRows = requesterPlantCode
            ? await query('SELECT id FROM factory WHERE code = $1', [requesterPlantCode])
            : [];
        const requesterFactoryId = factoryRows[0]?.id || null;
        if (!requesterFactoryId) {
            return res.status(400).json({ error: 'Your account has no plant assigned — cannot scope analytics' });
        }

        const now = new Date();
        const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        const from = req.query.from ? new Date(req.query.from) : defaultFrom;
        const toRaw = req.query.to ? new Date(req.query.to) : now;
        // Treat "to" as inclusive of the whole day.
        const to = new Date(toRaw.getFullYear(), toRaw.getMonth(), toRaw.getDate(), 23, 59, 59, 999);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return res.status(400).json({ error: 'Invalid from/to date' });
        }

        // Optional global scope: EITHER a single JH group OR a single DMT (module group) —
        // never both at once. Applied consistently to every query below, not just
        // classification/criticality, so the whole endpoint narrows together.
        const scopedJhGroupId = req.query.jh_group_id || null;
        const scopedDmtId = req.query.dmt_id || null;
        if (scopedJhGroupId && scopedDmtId) {
            return res.status(400).json({ error: 'Pass jh_group_id or dmt_id, not both' });
        }

        const byDmtParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let byDmtScopeClause = '';
        if (scopedDmtId) { byDmtParams.push(scopedDmtId); byDmtScopeClause = ' AND mg.id = $4'; }
        else if (scopedJhGroupId) { byDmtParams.push(scopedJhGroupId); byDmtScopeClause = ' AND jg.id = $4'; }
        const byDmt = await query(
            `SELECT mg.id AS dmt_id, mg.module AS dmt_name, COUNT(DISTINCT od.opl_id) AS opl_count
             FROM module_groups mg
             LEFT JOIN jh_group jg ON jg.module_group_id = mg.id
             LEFT JOIN opl_details od ON od.jh_group_id = jg.id AND od.status = 'approved'
               AND od.timestamp >= $1 AND od.timestamp <= $2
             WHERE mg.factory_id = $3${byDmtScopeClause}
             GROUP BY mg.id, mg.module
             ORDER BY mg.module ASC`,
            byDmtParams
        );

        // Member count = anyone who was actually a member (or leader) at ANY point that
        // overlaps the selected date range, per jh_group_membership_history — not just
        // today's membership. Someone who joined/left mid-range still correctly counts.
        const byJhGroupParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let byJhGroupScopeClause = '';
        if (scopedJhGroupId) { byJhGroupParams.push(scopedJhGroupId); byJhGroupScopeClause = ' AND jg.id = $4'; }
        else if (scopedDmtId) { byJhGroupParams.push(scopedDmtId); byJhGroupScopeClause = ' AND mg.id = $4'; }
        // opl_count is attributed to the submitter's HOME JH group (via membership history),
        // never to whichever group the OPL happened to be filed under — an Engineering
        // submitter who files something under another group still counts toward their own.
        const byJhGroup = await query(
            `SELECT jg.id AS jh_group_id, jg.name AS jh_group_name, mg.module AS dmt_name,
                    COUNT(DISTINCT od.opl_id) AS opl_count,
                    COUNT(DISTINCT combined.emp_id) AS member_count
             FROM jh_group jg
             LEFT JOIN module_groups mg ON mg.id = jg.module_group_id
             LEFT JOIN (
                 SELECT DISTINCT jh_group_id, emp_id FROM jh_group_membership_history
                 WHERE joined_at <= $2 AND (left_at IS NULL OR left_at >= $1)
             ) combined ON combined.jh_group_id = jg.id
             LEFT JOIN opl_details od ON od.submitter_emp_id = combined.emp_id AND od.status = 'approved'
               AND od.timestamp >= $1 AND od.timestamp <= $2
             WHERE jg.factory_id = $3${byJhGroupScopeClause}
             GROUP BY jg.id, jg.name, mg.module
             ORDER BY jg.name ASC`,
            byJhGroupParams
        );

        const byJhGroupWithIndex = byJhGroup.map(row => {
            const oplCount = Number(row.opl_count) || 0;
            const memberCount = Number(row.member_count) || 0;
            return {
                ...row,
                opl_count: oplCount,
                member_count: memberCount,
                opl_index: memberCount > 0 ? Number((oplCount / memberCount).toFixed(2)) : null
            };
        });

        // Per-member approved-OPL submission counts, scoped to this plant and date range —
        // the frontend buckets these into 0 / exactly N / more than N with an editable
        // threshold, so no extra request is needed when the threshold changes.
        const memberSubmissionsParams = [from.toISOString(), to.toISOString(), requesterFactoryId];
        let memberSubmissionsScopeClause = '';
        if (scopedJhGroupId) { memberSubmissionsParams.push(scopedJhGroupId); memberSubmissionsScopeClause = ' AND jg.id = $4'; }
        else if (scopedDmtId) { memberSubmissionsParams.push(scopedDmtId); memberSubmissionsScopeClause = ' AND mg.id = $4'; }
        const memberSubmissions = await query(
            `SELECT combined.emp_id, ud.name AS worker_name, jg.id AS jh_group_id, jg.name AS jh_group_name
                    ${scopedDmtId ? ', mg.module AS dmt_name' : ''},
                    COUNT(DISTINCT od.opl_id) AS opl_count
             FROM jh_group jg
             LEFT JOIN module_groups mg ON mg.id = jg.module_group_id
             LEFT JOIN (
                 SELECT DISTINCT jh_group_id, emp_id FROM jh_group_membership_history
                 WHERE joined_at <= $2 AND (left_at IS NULL OR left_at >= $1)
             ) combined ON combined.jh_group_id = jg.id
             LEFT JOIN user_details ud ON ud.emp_id = combined.emp_id
             LEFT JOIN opl_details od ON od.submitter_emp_id = combined.emp_id AND od.status = 'approved'
               AND od.timestamp >= $1 AND od.timestamp <= $2
             WHERE jg.factory_id = $3 AND combined.emp_id IS NOT NULL${memberSubmissionsScopeClause}
             GROUP BY combined.emp_id, ud.name, jg.id, jg.name${scopedDmtId ? ', mg.module' : ''}
             ORDER BY opl_count DESC, ud.name ASC`,
            memberSubmissionsParams
        );

        // Category (classification) and critical vs standard bifurcation — same scope
        // (JH group or DMT) applied here as everywhere else on this endpoint.
        const classificationParams = [requesterFactoryId, from.toISOString(), to.toISOString()];
        const criticalityParams = [requesterFactoryId, from.toISOString(), to.toISOString()];
        let groupFilterClause = '';
        if (scopedJhGroupId) {
            classificationParams.push(scopedJhGroupId);
            criticalityParams.push(scopedJhGroupId);
            groupFilterClause = ' AND jh_group_id = $4';
        } else if (scopedDmtId) {
            classificationParams.push(scopedDmtId);
            criticalityParams.push(scopedDmtId);
            groupFilterClause = ' AND jh_group_id IN (SELECT id FROM jh_group WHERE module_group_id = $4)';
        }

        const byClassification = await query(
            `SELECT COALESCE(classification, 'Unclassified') AS classification, COUNT(DISTINCT opl_id) AS opl_count
             FROM opl_details
             WHERE status = 'approved' AND factory_id = $1 AND timestamp >= $2 AND timestamp <= $3${groupFilterClause}
             GROUP BY classification
             ORDER BY opl_count DESC`,
            classificationParams
        );

        const byCriticality = await query(
            `SELECT COALESCE(is_star, false) AS is_critical, COUNT(DISTINCT opl_id) AS opl_count
             FROM opl_details
             WHERE status = 'approved' AND factory_id = $1 AND timestamp >= $2 AND timestamp <= $3${groupFilterClause}
             GROUP BY is_star`,
            criticalityParams
        );
        const criticalCount = Number(byCriticality.find(r => r.is_critical === true)?.opl_count) || 0;
        const standardCount = Number(byCriticality.find(r => r.is_critical === false)?.opl_count) || 0;

        // Reviewer workload + per-submitter stage breakdown. Approver identity is never
        // stored on the OPL row (it's resolved live from approval_routing, same as every
        // review action) so this walks every in-flight/terminal item in the plant and
        // resolves each one's current stage/approvers the same way the review screen does —
        // there is no separate "who's assigned" table to just SELECT from.
        const allOplRowsParams = [requesterFactoryId];
        let allOplRowsScopeClause = '';
        if (scopedJhGroupId) { allOplRowsParams.push(scopedJhGroupId); allOplRowsScopeClause = ' AND jh_group_id = $2'; }
        else if (scopedDmtId) { allOplRowsParams.push(scopedDmtId); allOplRowsScopeClause = ' AND jh_group_id IN (SELECT id FROM jh_group WHERE module_group_id = $2)'; }
        const allOplRows = await query(
            `SELECT opl_id, status, current_stage_order, jh_group_id, submitter_emp_id, submitted_by, timestamp
             FROM opl_details WHERE factory_id = $1${allOplRowsScopeClause}`,
            allOplRowsParams
        );
        const plantStages = await resolveOplStages(requesterFactoryId);
        const stageByOrder = new Map(plantStages.map((s) => [s.stage_order, s]));
        const jhGroupStagesCache = new Map();
        async function resolversForStage(jhGroupId, entityType) {
            const cacheKey = `${jhGroupId}|${entityType}`;
            if (!jhGroupStagesCache.has(cacheKey)) {
                jhGroupStagesCache.set(cacheKey, await resolveOplApprovers(jhGroupId, entityType));
            }
            return jhGroupStagesCache.get(cacheKey);
        }

        const TERMINAL = new Set(['approved', 'rejected', 'draft']);
        const reviewerCounts = new Map(); // `${empId}|${stageOrder}` -> { emp_id, stage_name, stage_order, opl_count }
        const submitterCounts = new Map(); // `${empId}|${label}` -> { emp_id, worker_name, stage_label, opl_count }
        // Per-incharge (OPL reviewer) rollup — one row per person who is a live approver
        // somewhere, aggregated across every stage/group they review for.
        const inchargeMap = new Map();
        const ensureIncharge = (empId) => {
            if (!inchargeMap.has(empId)) {
                inchargeMap.set(empId, { emp_id: empId, pending: 0, oldest_ts: null, groups: new Set(), decided: 0, tSum: 0, tN: 0 });
            }
            return inchargeMap.get(empId);
        };

        for (const row of allOplRows) {
            const stageOrder = row.current_stage_order || plantStages[0]?.stage_order || 1;
            const stage = stageByOrder.get(stageOrder) || plantStages[0];
            const stageLabel = row.status === 'approved' ? 'Approved'
                : row.status === 'rejected' ? 'Rejected'
                : row.status === 'draft' ? 'Draft'
                : stage.stage_name;

            // Reviewer workload only counts items actually awaiting someone's action.
            if (!TERMINAL.has(row.status) && row.jh_group_id) {
                const approvers = await resolversForStage(row.jh_group_id, stage.entity_type);
                const rowTs = row.timestamp ? new Date(row.timestamp) : null;
                for (const empId of approvers) {
                    const key = `${empId}|${stage.stage_order}`;
                    if (!reviewerCounts.has(key)) {
                        reviewerCounts.set(key, { emp_id: empId, stage_name: stage.stage_name, stage_order: stage.stage_order, opl_count: 0 });
                    }
                    reviewerCounts.get(key).opl_count += 1;

                    const ic = ensureIncharge(empId);
                    ic.pending += 1;
                    ic.groups.add(String(row.jh_group_id));
                    if (rowTs && !Number.isNaN(rowTs.getTime()) && (!ic.oldest_ts || rowTs < ic.oldest_ts)) ic.oldest_ts = rowTs;
                }
            }

            // Submitter breakdown covers every status, so a user can see their full pipeline
            // (draft / at Reviewer N / approved / rejected), not just what's pending.
            if (row.submitter_emp_id) {
                const key = `${row.submitter_emp_id}|${stageLabel}`;
                if (!submitterCounts.has(key)) {
                    submitterCounts.set(key, { emp_id: row.submitter_emp_id, stage_label: stageLabel, opl_count: 0 });
                }
                submitterCounts.get(key).opl_count += 1;
            }
        }

        const namedEmpIds = [...new Set([
            ...[...reviewerCounts.values()].map((r) => r.emp_id),
            ...[...submitterCounts.values()].map((r) => r.emp_id),
        ])];
        const nameRows = namedEmpIds.length
            ? await query('SELECT emp_id, name FROM user_details WHERE emp_id = ANY($1)', [namedEmpIds])
            : [];
        const nameByEmpId = Object.fromEntries(nameRows.map((r) => [r.emp_id, r.name]));

        const reviewerWorkload = [...reviewerCounts.values()]
            .map((r) => ({ ...r, worker_name: nameByEmpId[r.emp_id] || r.emp_id }))
            .sort((a, b) => b.opl_count - a.opl_count || (a.worker_name || '').localeCompare(b.worker_name || ''));

        const submitterStageBreakdown = [...submitterCounts.values()]
            .map((r) => ({ ...r, worker_name: nameByEmpId[r.emp_id] || r.emp_id }))
            .sort((a, b) => (a.worker_name || '').localeCompare(b.worker_name || '') || (a.stage_label || '').localeCompare(b.stage_label || ''));

        // --- Incharge Breakdown: review decisions in range + team training completion ---
        // Decisions: every jh/be accept/reject in opl_audit_trail for this plant's OPLs.
        // Turnaround per decision = decision time minus the immediately preceding audit event
        // for that OPL (i.e. how long it sat in that reviewer's court).
        const oplIdList = allOplRows.map((r) => String(r.opl_id));
        const groupByOplId = new Map(allOplRows.map((r) => [String(r.opl_id), r.jh_group_id]));
        const DECISION_ACTIONS = new Set(['jh_accepted', 'jh_rejected', 'be_accepted', 'be_rejected']);
        // opl_audit_trail.performed_by is inconsistent across historical writes — a bare emp_id
        // ('333333'), 'Name (ID: 333333)', or just a display name ('JH Leader'). Normalise to a
        // bare emp_id so one reviewer isn't split into several rows and names resolve.
        const allUsers = await query('SELECT emp_id, name FROM user_details');
        const nameToEmpId = new Map(allUsers.filter((u) => u.name).map((u) => [String(u.name).trim().toLowerCase(), u.emp_id]));
        const normalisePerformedBy = (raw) => {
            const s = String(raw || '').trim();
            if (!s) return null;
            if (/^\d+$/.test(s)) return s;
            const m = s.match(/ID:\s*([A-Za-z0-9-]+)\s*\)?/i);
            if (m) return m[1];
            return nameToEmpId.get(s.toLowerCase()) || s;
        };
        if (oplIdList.length) {
            const auditRows = await query(
                `SELECT performed_by, opl_id, action, timestamp FROM opl_audit_trail
                 WHERE opl_id = ANY($1::text[]) ORDER BY timestamp ASC`,
                [oplIdList]
            );
            const prevTsByOpl = new Map();
            for (const a of auditRows) {
                const t = new Date(a.timestamp);
                const performer = normalisePerformedBy(a.performed_by);
                if (DECISION_ACTIONS.has(a.action) && performer && !Number.isNaN(t.getTime()) && t >= from && t <= to) {
                    const ic = ensureIncharge(performer);
                    ic.decided += 1;
                    // Attribute the group they reviewed for, so team-training rolls up even
                    // when this incharge currently has nothing pending.
                    const g = groupByOplId.get(String(a.opl_id));
                    if (g) ic.groups.add(String(g));
                    const prev = prevTsByOpl.get(String(a.opl_id));
                    if (prev) { ic.tSum += (t - prev); ic.tN += 1; }
                }
                if (!Number.isNaN(t.getTime())) prevTsByOpl.set(String(a.opl_id), t);
            }
        }

        const inchargeEmpIds = [...inchargeMap.keys()];
        const allInchargeGroupIds = [...new Set([...inchargeMap.values()].flatMap((ic) => [...ic.groups]))].filter(Boolean);
        const [icNameRows, icGroupRows, icMemberRows] = await Promise.all([
            inchargeEmpIds.length ? query('SELECT emp_id, name FROM user_details WHERE emp_id = ANY($1)', [inchargeEmpIds]) : [],
            allInchargeGroupIds.length ? query('SELECT id::text AS id, name FROM jh_group WHERE id::text = ANY($1::text[])', [allInchargeGroupIds]) : [],
            allInchargeGroupIds.length ? query('SELECT jh_group_id::text AS gid, emp_id FROM jh_groups_list WHERE jh_group_id::text = ANY($1::text[])', [allInchargeGroupIds]) : [],
        ]);
        const icNameByEmp = Object.fromEntries(icNameRows.map((r) => [r.emp_id, r.name]));
        const icGroupName = new Map(icGroupRows.map((r) => [r.id, r.name]));
        const membersByGroup = new Map();
        icMemberRows.forEach((m) => {
            if (!membersByGroup.has(m.gid)) membersByGroup.set(m.gid, new Set());
            if (m.emp_id) membersByGroup.get(m.gid).add(m.emp_id);
        });
        const allTeamEmpIds = [...new Set(icMemberRows.map((m) => m.emp_id))].filter(Boolean);
        const trainByEmp = new Map();
        if (allTeamEmpIds.length) {
            const trainRows = await query(
                `SELECT assigned_emp_id, status FROM opl_training_assignment WHERE assigned_emp_id = ANY($1::text[])`,
                [allTeamEmpIds]
            );
            trainRows.forEach((r) => {
                const e = trainByEmp.get(r.assigned_emp_id) || { a: 0, c: 0 };
                e.a += 1;
                if (r.status === 'completed') e.c += 1;
                trainByEmp.set(r.assigned_emp_id, e);
            });
        }
        const nowMs = Date.now();
        const inchargeBreakdown = [...inchargeMap.values()].map((ic) => {
            const memberSet = new Set();
            ic.groups.forEach((g) => (membersByGroup.get(String(g)) || new Set()).forEach((e) => memberSet.add(e)));
            let ta = 0, tc = 0;
            memberSet.forEach((e) => { const t = trainByEmp.get(e); if (t) { ta += t.a; tc += t.c; } });
            return {
                emp_id: ic.emp_id,
                worker_name: icNameByEmp[ic.emp_id] || ic.emp_id,
                groups: [...ic.groups].map((g) => icGroupName.get(String(g)) || g),
                pending: ic.pending,
                oldest_days: ic.oldest_ts ? Math.floor((nowMs - ic.oldest_ts.getTime()) / 86400000) : null,
                decided_in_range: ic.decided,
                avg_turnaround_days: ic.tN ? Number((ic.tSum / ic.tN / 86400000).toFixed(1)) : null,
                avg_turnaround_hours: ic.tN ? Number((ic.tSum / ic.tN / 3600000).toFixed(1)) : null,
                team_members: memberSet.size,
                team_training_assigned: ta,
                team_training_completed: tc,
                team_training_pct: ta ? Math.round((tc / ta) * 100) : null,
            };
        }).sort((a, b) => b.pending - a.pending || (b.decided_in_range - a.decided_in_range) || (a.worker_name || '').localeCompare(b.worker_name || ''));

        res.json({
            from: from.toISOString(),
            to: to.toISOString(),
            byDmt: byDmt.map(r => ({ ...r, opl_count: Number(r.opl_count) || 0 })),
            byJhGroup: byJhGroupWithIndex,
            memberSubmissions: memberSubmissions.map(r => ({ ...r, opl_count: Number(r.opl_count) || 0 })),
            byClassification: byClassification.map(r => ({ ...r, opl_count: Number(r.opl_count) || 0 })),
            criticality: { critical: criticalCount, standard: standardCount },
            reviewerWorkload,
            submitterStageBreakdown,
            inchargeBreakdown,
        });
    } catch (e) {
        console.error('Error computing OPL analytics:', e);
        res.status(500).json({ error: 'Failed to compute OPL analytics' });
    }
});
// Month-on-month trend for one JH group — OPL index, participants, and OPL count per
// calendar month over the last N months. BE-lead+ only, scoped to the requester's plant.
app.get('/api/opl-analytics/trend', async (req, res) => {
    if (!pool) return res.json({ months: [] });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    const jhGroupId = req.query.jh_group_id;
    if (!jhGroupId) {
        return res.status(400).json({ error: 'jh_group_id is required' });
    }
    const monthsBack = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));
    try {
        const requesterRows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [requesterEmpId]);
        const requesterRole = requesterRows[0]?.role || '';
        if (!BE_LEAD_ROLES.has(requesterRole)) {
            return res.status(403).json({ error: 'You are not authorized to view OPL analytics' });
        }
        const requesterPlantCode = requesterRows[0]?.default_plant || null;
        const factoryRows = requesterPlantCode
            ? await query('SELECT id FROM factory WHERE code = $1', [requesterPlantCode])
            : [];
        const requesterFactoryId = factoryRows[0]?.id || null;
        if (!requesterFactoryId) {
            return res.status(400).json({ error: 'Your account has no plant assigned — cannot scope analytics' });
        }
        // The group must actually belong to the requester's own plant.
        const groupRows = await query('SELECT id, name, factory_id FROM jh_group WHERE id = $1', [jhGroupId]);
        const group = groupRows[0];
        if (!group || group.factory_id !== requesterFactoryId) {
            return res.status(404).json({ error: 'JH group not found' });
        }

        const currentMemberCountRows = await query(
            `SELECT COUNT(DISTINCT emp_id) AS cnt FROM jh_group_membership_history
             WHERE jh_group_id = $1 AND left_at IS NULL`,
            [jhGroupId]
        );
        const currentMemberCount = Number(currentMemberCountRows[0]?.cnt) || 0;

        // member_count is computed PER MONTH from membership history (whoever was actually
        // a member/leader at any point during that specific month) — not today's headcount
        // applied blindly to every past month. Someone who joined/left mid-history is
        // correctly included only for the months they were actually present.
        const monthlyRows = await query(
            `WITH months AS (
                 SELECT date_trunc('month', NOW()) - (n || ' months')::interval AS month_start
                 FROM generate_series(0, $2::int - 1) AS n
             )
             SELECT to_char(m.month_start, 'YYYY-MM') AS month,
                    COUNT(DISTINCT od.opl_id) AS opl_count,
                    COUNT(DISTINCT od.submitter_emp_id) AS participants,
                    (SELECT COUNT(DISTINCT h.emp_id) FROM jh_group_membership_history h
                     WHERE h.jh_group_id = $1
                       AND h.joined_at < m.month_start + interval '1 month'
                       AND (h.left_at IS NULL OR h.left_at >= m.month_start)) AS month_member_count
             FROM months m
             LEFT JOIN opl_details od ON od.jh_group_id = $1 AND od.status = 'approved'
               AND od.timestamp >= m.month_start AND od.timestamp < m.month_start + interval '1 month'
             GROUP BY m.month_start
             ORDER BY m.month_start ASC`,
            [jhGroupId, monthsBack]
        );

        const months = monthlyRows.map(r => {
            const oplCount = Number(r.opl_count) || 0;
            const participants = Number(r.participants) || 0;
            const monthMemberCount = Number(r.month_member_count) || 0;
            return {
                month: r.month,
                opl_count: oplCount,
                participants,
                member_count: monthMemberCount,
                participation_pct: monthMemberCount > 0 ? Math.round((participants / monthMemberCount) * 100) : null,
                opl_index: monthMemberCount > 0 ? Number((oplCount / monthMemberCount).toFixed(2)) : null
            };
        });

        res.json({ jh_group_id: jhGroupId, jh_group_name: group.name, member_count: currentMemberCount, months });
    } catch (e) {
        console.error('Error computing OPL analytics trend:', e);
        res.status(500).json({ error: 'Failed to compute OPL analytics trend' });
    }
});

// JH groups this person currently oversees. Resolved live every call so access follows
// whatever the org config says right now:
//   - a group whose jh_group.leader_emp_id is them (designated leader)
//   - a group where they're listed as a leader in jh_groups_list
//   - ALL groups under a module (DMT) they lead
//   - if their role is jh_lead / module_lead: the group(s) they're a member of
//   - a group where they're a routing-configured 'specific' OPL reviewer (this one is the
//     "routing incharge" — it disappears the instant routing is changed)
// entityPrefix selects which module's approval_routing rows count as "reviews this JH
// group's items" (routing entity_type is 'opl'/'opl_stage_N', 'kaizen'/'kaizen_dmt', or
// 'abnormality'/'abnormality_dmt') — the leader/module-lead/list-role checks are module-
// agnostic (a JH leader leads the group across every module), only the routing-approver
// check needs to know which module's "My Team" tab is asking.
async function jhGroupsLedOrReviewedBy(empId, entityPrefix = 'opl') {
    if (!empId || !pool) return [];
    const byId = new Map();
    const add = (rows) => rows.forEach((g) => byId.set(String(g.id), { id: g.id, name: g.name }));

    // jh_group.id / jh_groups_list.jh_group_id / approval_routing.jh_group_id have drifted to
    // different column types (uuid vs text) — every jh_group join here casts both to text.
    add(await query('SELECT id, name FROM jh_group WHERE leader_emp_id = $1', [empId]));
    add(await query(
        `SELECT jg.id, jg.name FROM jh_group jg
         JOIN module_groups mg ON mg.id::text = jg.module_group_id::text
         WHERE mg.module_lead_emp_id = $1`,
        [empId]
    ));
    add(await query(
        `SELECT jg.id, jg.name FROM jh_groups_list jgl
         JOIN jh_group jg ON jg.id::text = jgl.jh_group_id::text
         WHERE jgl.emp_id = $1 AND jgl.role ILIKE '%lead%'`,
        [empId]
    ));

    // Any lead-ish role (jh_lead / jh_leader / module_lead / …) gets the analytics for the
    // JH group(s) they belong to — tolerant of role-name drift in the data. BE-lead tier is
    // deliberately excluded here: "be_lead"/"leadership" contain "lead" but are plant-wide
    // roles, not JH reviewers — a BE admin only reaches "My Team" if they're an actual
    // group leader / module lead / named routing approver (the checks above still apply).
    // Their plant-wide view lives in the BE Analytics tab instead.
    const roleRow = await query('SELECT role FROM user_details WHERE emp_id = $1', [empId]);
    const role = String(roleRow[0]?.role || '').toLowerCase();
    const isBeLeadTier = ['be_lead', 'it_lead', 'leadership'].includes(role);
    if (role.includes('lead') && !isBeLeadTier) {
        add(await query(
            `SELECT jg.id, jg.name FROM jh_groups_list jgl
             JOIN jh_group jg ON jg.id::text = jgl.jh_group_id::text
             WHERE jgl.emp_id = $1`,
            [empId]
        ));
    }

    // approval_routing.jh_group_id and jh_group.id are stored as different types (uuid vs
    // text) — cast both to text to join them.
    const routing = await query(
        `SELECT ar.jh_group_id::text AS jh_group_id, ar.approver_emp_id, jg.name
         FROM approval_routing ar JOIN jh_group jg ON jg.id::text = ar.jh_group_id::text
         WHERE ar.entity_type ~ ('^' || $1) AND ar.approver_role = 'specific' AND ar.is_active = true`,
        [entityPrefix]
    );
    routing.forEach((r) => {
        const ids = String(r.approver_emp_id || '').split(',').map((s) => s.trim());
        if (ids.includes(empId)) byId.set(String(r.jh_group_id), { id: r.jh_group_id, name: r.name });
    });
    return [...byId.values()];
}

// Per-member OPL + training analytics for ONE JH group, for its leader / routing reviewer.
// Roster is membership-history-overlap for the date range (mirrors the BE analytics tab):
// someone who has since left counts for the part of the range they were a member, not after.
app.get('/api/opl-analytics/jh-group', async (req, res) => {
    if (!pool) return res.json({ authorized_groups: [], members: [] });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const groups = await jhGroupsLedOrReviewedBy(requesterEmpId);
        if (groups.length === 0) {
            return res.status(403).json({ error: 'You are not a JH group leader or reviewer' });
        }
        const requestedId = req.query.jh_group_id ? String(req.query.jh_group_id) : String(groups[0].id);
        const group = groups.find((g) => String(g.id) === requestedId);
        if (!group) return res.status(403).json({ error: 'You are not authorized for that JH group' });

        const now = new Date();
        const from = req.query.from ? new Date(req.query.from) : new Date('2000-01-01T00:00:00Z');
        const to = req.query.to ? new Date(req.query.to) : now;
        const fromIso = from.toISOString();
        const toIso = to.toISOString();

        const roster = await query(
            `SELECT DISTINCT h.emp_id, ud.name AS worker_name, ud.is_active
             FROM jh_group_membership_history h
             LEFT JOIN user_details ud ON ud.emp_id = h.emp_id
             WHERE h.jh_group_id = $1 AND h.joined_at <= $3 AND (h.left_at IS NULL OR h.left_at >= $2)`,
            [group.id, fromIso, toIso]
        );
        const empIds = roster.map((r) => r.emp_id).filter(Boolean);

        const byEmp = {};
        roster.forEach((r) => {
            if (!r.emp_id) return;
            byEmp[r.emp_id] = {
                emp_id: r.emp_id,
                name: r.worker_name || r.emp_id,
                is_active: r.is_active !== false,
                opl_submitted: 0,
                opl_approved: 0,
                opl_critical: 0,
                training_assigned: 0,
                training_completed: 0,
                trainings: [],
            };
        });

        if (empIds.length > 0) {
            const opls = await query(
                `SELECT submitter_emp_id AS emp_id, opl_id, status, is_star
                 FROM opl_details
                 WHERE submitter_emp_id = ANY($1::text[]) AND timestamp >= $2 AND timestamp <= $3`,
                [empIds, fromIso, toIso]
            );
            opls.forEach((o) => {
                const m = byEmp[o.emp_id];
                if (!m) return;
                m.opl_submitted += 1;
                if (o.status === 'approved') m.opl_approved += 1;
                if (o.is_star === true) m.opl_critical += 1;
            });
            // Training is current-state / lifetime (re-pushes reset the row, so historical
            // date-slicing isn't meaningful) — "assigned" = a row exists, "completed" = done.
            const trainings = await query(
                `SELECT ota.assigned_emp_id AS emp_id, ota.opl_id, ota.status, ota.assigned_at, ota.completed_at,
                        od.title AS opl_title, od.is_star
                 FROM opl_training_assignment ota
                 LEFT JOIN opl_details od ON od.opl_id = ota.opl_id
                 WHERE ota.assigned_emp_id = ANY($1::text[])
                 ORDER BY ota.assigned_at ASC NULLS FIRST`,
                [empIds]
            );
            trainings.forEach((t) => {
                const m = byEmp[t.emp_id];
                if (!m) return;
                m.training_assigned += 1;
                if (t.status === 'completed') m.training_completed += 1;
                m.trainings.push({
                    opl_id: t.opl_id,
                    title: t.opl_title || `OPL #${t.opl_id}`,
                    is_star: t.is_star === true,
                    status: t.status,
                    assigned_at: t.assigned_at,
                    completed_at: t.completed_at,
                });
            });
        }

        const members = Object.values(byEmp).map((m) => ({
            ...m,
            unique_training_opls: new Set(m.trainings.map((x) => String(x.opl_id))).size,
            completion_pct: m.training_assigned ? Math.round((m.training_completed / m.training_assigned) * 100) : null,
        }));
        const participants = members.filter((m) => m.opl_submitted > 0).length;

        res.json({
            jh_group_id: group.id,
            jh_group_name: group.name,
            authorized_groups: groups,
            from: fromIso,
            to: toIso,
            member_count: members.length,
            participation_pct: members.length ? Math.round((participants / members.length) * 100) : 0,
            total_opl_submitted: members.reduce((s, m) => s + m.opl_submitted, 0),
            total_opl_approved: members.reduce((s, m) => s + m.opl_approved, 0),
            total_opl_critical: members.reduce((s, m) => s + m.opl_critical, 0),
            total_training_assigned: members.reduce((s, m) => s + m.training_assigned, 0),
            total_training_completed: members.reduce((s, m) => s + m.training_completed, 0),
            members,
        });
    } catch (e) {
        console.error('Error computing JH-group analytics:', e);
        res.status(500).json({ error: 'Failed to compute JH-group analytics' });
    }
});

// Per-member Kaizen analytics for ONE JH group, for its leader / routing reviewer — same
// authorization + roster pattern as /api/opl-analytics/jh-group. Kaizen has no training
// mechanism, so the per-member shape is submission/status counts + a drill-down list of
// their own Kaizens, instead of OPL's assigned/completed training pair.
app.get('/api/kaizen-analytics/jh-group', async (req, res) => {
    if (!pool) return res.json({ authorized_groups: [], members: [] });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const groups = await jhGroupsLedOrReviewedBy(requesterEmpId, 'kaizen');
        if (groups.length === 0) {
            return res.status(403).json({ error: 'You are not a JH group leader or reviewer' });
        }
        const requestedId = req.query.jh_group_id ? String(req.query.jh_group_id) : String(groups[0].id);
        const group = groups.find((g) => String(g.id) === requestedId);
        if (!group) return res.status(403).json({ error: 'You are not authorized for that JH group' });

        const now = new Date();
        const from = req.query.from ? new Date(req.query.from) : new Date('2000-01-01T00:00:00Z');
        const to = req.query.to ? new Date(req.query.to) : now;
        const fromIso = from.toISOString();
        const toIso = to.toISOString();

        const roster = await query(
            `SELECT DISTINCT h.emp_id, ud.name AS worker_name, ud.is_active
             FROM jh_group_membership_history h
             LEFT JOIN user_details ud ON ud.emp_id = h.emp_id
             WHERE h.jh_group_id = $1 AND h.joined_at <= $3 AND (h.left_at IS NULL OR h.left_at >= $2)`,
            [group.id, fromIso, toIso]
        );
        const empIds = roster.map((r) => r.emp_id).filter(Boolean);

        const byEmp = {};
        roster.forEach((r) => {
            if (!r.emp_id) return;
            byEmp[r.emp_id] = {
                emp_id: r.emp_id, name: r.worker_name || r.emp_id, is_active: r.is_active !== false,
                kaizen_submitted: 0, kaizen_confirmed_closed: 0, kaizen_rejected: 0,
                // "Pending" split into its real sub-stages instead of one lump number
                // (owner direction) — proposed (awaiting JH review), approved_for_implementation
                // (awaiting the submitter's implementation report), submitted_for_confirmation
                // (awaiting final validation/close).
                kaizen_proposed: 0, kaizen_approved_for_implementation: 0, kaizen_submitted_for_confirmation: 0,
                savings_total: 0, kaizens: [],
            };
        });

        if (empIds.length > 0) {
            const rows = await query(
                `SELECT kaizen_id, submitter_emp_id AS emp_id, title, category, status, savings_estimate, timestamp
                 FROM kaizen_details
                 WHERE submitter_emp_id = ANY($1::text[]) AND status != 'draft'
                   AND timestamp >= $2 AND timestamp <= $3
                 ORDER BY timestamp DESC`,
                [empIds, fromIso, toIso]
            );
            rows.forEach((k) => {
                const m = byEmp[k.emp_id];
                if (!m) return;
                m.kaizen_submitted += 1;
                if (k.status === 'confirmed_closed') {
                    m.kaizen_confirmed_closed += 1;
                    if (k.savings_estimate != null) m.savings_total += Number(k.savings_estimate) || 0;
                } else if (k.status === 'rejected') m.kaizen_rejected += 1;
                else if (k.status === 'proposed') m.kaizen_proposed += 1;
                else if (k.status === 'approved_for_implementation') m.kaizen_approved_for_implementation += 1;
                else if (k.status === 'submitted_for_confirmation') m.kaizen_submitted_for_confirmation += 1;
                m.kaizens.push({ kaizen_id: k.kaizen_id, title: k.title, category: k.category, status: k.status, timestamp: k.timestamp });
            });
        }

        const members = Object.values(byEmp).map((m) => ({
            ...m,
            kaizen_pending: m.kaizen_proposed + m.kaizen_approved_for_implementation + m.kaizen_submitted_for_confirmation,
        }));
        const participants = members.filter((m) => m.kaizen_submitted > 0).length;
        res.json({
            jh_group_id: group.id, jh_group_name: group.name, authorized_groups: groups,
            from: fromIso, to: toIso,
            member_count: members.length,
            participation_pct: members.length ? Math.round((participants / members.length) * 100) : 0,
            total_kaizen_submitted: members.reduce((s, m) => s + m.kaizen_submitted, 0),
            total_kaizen_proposed: members.reduce((s, m) => s + m.kaizen_proposed, 0),
            total_kaizen_approved_for_implementation: members.reduce((s, m) => s + m.kaizen_approved_for_implementation, 0),
            total_kaizen_submitted_for_confirmation: members.reduce((s, m) => s + m.kaizen_submitted_for_confirmation, 0),
            total_kaizen_confirmed_closed: members.reduce((s, m) => s + m.kaizen_confirmed_closed, 0),
            total_kaizen_pending: members.reduce((s, m) => s + m.kaizen_pending, 0),
            total_kaizen_rejected: members.reduce((s, m) => s + m.kaizen_rejected, 0),
            members,
        });
    } catch (e) {
        console.error('Error computing Kaizen JH-group analytics:', e);
        res.status(500).json({ error: 'Failed to compute JH-group analytics' });
    }
});

// Per-member Abnormality analytics for ONE JH group, for its leader / routing reviewer —
// same pattern as the OPL/Kaizen jh-group endpoints.
app.get('/api/abnormality-analytics/jh-group', async (req, res) => {
    if (!pool) return res.json({ authorized_groups: [], members: [] });
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const groups = await jhGroupsLedOrReviewedBy(requesterEmpId, 'abnormality');
        if (groups.length === 0) {
            return res.status(403).json({ error: 'You are not a JH group leader or reviewer' });
        }
        const requestedId = req.query.jh_group_id ? String(req.query.jh_group_id) : String(groups[0].id);
        const group = groups.find((g) => String(g.id) === requestedId);
        if (!group) return res.status(403).json({ error: 'You are not authorized for that JH group' });

        const now = new Date();
        const from = req.query.from ? new Date(req.query.from) : new Date('2000-01-01T00:00:00Z');
        const to = req.query.to ? new Date(req.query.to) : now;
        const fromIso = from.toISOString();
        const toIso = to.toISOString();

        const roster = await query(
            `SELECT DISTINCT h.emp_id, ud.name AS worker_name, ud.is_active
             FROM jh_group_membership_history h
             LEFT JOIN user_details ud ON ud.emp_id = h.emp_id
             WHERE h.jh_group_id = $1 AND h.joined_at <= $3 AND (h.left_at IS NULL OR h.left_at >= $2)`,
            [group.id, fromIso, toIso]
        );
        const empIds = roster.map((r) => r.emp_id).filter(Boolean);

        const byEmp = {};
        roster.forEach((r) => {
            if (!r.emp_id) return;
            byEmp[r.emp_id] = {
                emp_id: r.emp_id, name: r.worker_name || r.emp_id, is_active: r.is_active !== false,
                abn_reported: 0, abn_closed: 0, abn_pending: 0, abn_red_tag: 0, abnormalities: [],
            };
        });

        const PENDING_STATUSES = new Set(['pending_review', 'assigned', 'pending_dmt_review']);
        if (empIds.length > 0) {
            const rows = await query(
                `SELECT abnormality_id, submitter_emp_id AS emp_id, description, type, tag_color, status, timestamp
                 FROM abnormalities_details
                 WHERE submitter_emp_id = ANY($1::text[]) AND status != 'draft'
                   AND timestamp >= $2 AND timestamp <= $3
                 ORDER BY timestamp DESC`,
                [empIds, fromIso, toIso]
            );
            rows.forEach((a) => {
                const m = byEmp[a.emp_id];
                if (!m) return;
                m.abn_reported += 1;
                if (a.tag_color === 'red') m.abn_red_tag += 1;
                if (a.status === 'closed') m.abn_closed += 1;
                else if (PENDING_STATUSES.has(a.status)) m.abn_pending += 1;
                m.abnormalities.push({ abnormality_id: a.abnormality_id, description: a.description, type: a.type, tag_color: a.tag_color, status: a.status, timestamp: a.timestamp });
            });
        }

        const members = Object.values(byEmp);
        const participants = members.filter((m) => m.abn_reported > 0).length;
        res.json({
            jh_group_id: group.id, jh_group_name: group.name, authorized_groups: groups,
            from: fromIso, to: toIso,
            member_count: members.length,
            participation_pct: members.length ? Math.round((participants / members.length) * 100) : 0,
            total_abn_reported: members.reduce((s, m) => s + m.abn_reported, 0),
            total_abn_closed: members.reduce((s, m) => s + m.abn_closed, 0),
            total_abn_pending: members.reduce((s, m) => s + m.abn_pending, 0),
            total_abn_red_tag: members.reduce((s, m) => s + m.abn_red_tag, 0),
            members,
        });
    } catch (e) {
        console.error('Error computing Abnormality JH-group analytics:', e);
        res.status(500).json({ error: 'Failed to compute JH-group analytics' });
    }
});

app.patch('/api/opl-details/:id', async (req, res) => {
    // Forward to PUT logic
    req.method = 'PUT';
    return app._router.handle(req, res);
});

// Audit Trail API Endpoints
app.get('/api/opl-audit-trail', async (req, res) => {
    const { opl_id } = req.query;
    try {
        if (pool) {
            let sql = 'SELECT * FROM opl_audit_trail';
            const params = [];
            if (opl_id) {
                sql += ' WHERE opl_id = $1';
                params.push(String(opl_id));
            }
            sql += ' ORDER BY timestamp DESC';
            const rows = await query(sql, params);
            return res.json(rows);
        }
        let list = mockDb.oplAuditTrail || [];
        if (opl_id) {
            list = list.filter(a => String(a.opl_id) === String(opl_id));
        }
        res.json(list);
    } catch {
        res.status(500).json({ error: 'Failed to fetch OPL audit trail' });
    }
});
app.post('/api/opl-audit-trail', async (req, res) => {
    const { opl_id, action, status_from, status_to, submitted_by_from, submitted_by_to, performed_by, comments, changed_fields } = req.body;
    const actor = performed_by || req.headers['x-worker-id'];
    if (!actor) {
        return res.status(400).json({ error: 'performed_by or x-worker-id header is required' });
    }
    try {
        if (pool) {
            const rows = await query(
                `INSERT INTO opl_audit_trail (opl_id, action, status_from, status_to, submitted_by_from, submitted_by_to, performed_by, comments, changed_fields, timestamp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
                [
                    String(opl_id || '1'),
                    action || 'updated',
                    status_from || null,
                    status_to || null,
                    submitted_by_from || null,
                    submitted_by_to || null,
                    actor,
                    comments || null,
                    changed_fields ? JSON.stringify(changed_fields) : null
                ]
            );
            return res.json(rows[0]);
        }
        const newLog = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            opl_id: String(opl_id || '1'),
            action: action || 'updated',
            status_from: status_from || null,
            status_to: status_to || null,
            submitted_by_from: submitted_by_from || null,
            submitted_by_to: submitted_by_to || null,
            performed_by: actor,
            comments: comments || null,
            changed_fields: changed_fields || null,
            timestamp: new Date().toISOString()
        };
        if (!mockDb.oplAuditTrail) mockDb.oplAuditTrail = [];
        mockDb.oplAuditTrail.unshift(newLog);
        res.json(newLog);
    } catch {
        res.status(500).json({ error: 'Failed to create audit trail log' });
    }
});
app.get('/api/user-details', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT emp_id, name, email, role, default_plant, is_active, created_at FROM user_details ORDER BY emp_id ASC');
            return res.json(rows);
        }
        res.json(mockDb.userDetails);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});
app.post('/api/user-details', async (req, res) => {
    const { emp_id, name, email, role, default_plant, is_active } = req.body;
    if (!emp_id || !name) {
        return res.status(400).json({ error: 'emp_id and name are required' });
    }
    const userRole = role || 'operator';
    const active = is_active !== undefined ? Boolean(is_active) : true;
    const targetPlant = default_plant || 'TVT';
    try {
        const resolvedFactoryId = await resolveFactoryId(targetPlant);
        if (pool) {
            const rows = await query(
                `INSERT INTO user_details (emp_id, name, email, role, default_plant, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (emp_id) DO UPDATE SET
                   name = EXCLUDED.name,
                   email = EXCLUDED.email,
                   role = EXCLUDED.role,
                   default_plant = EXCLUDED.default_plant,
                   is_active = EXCLUDED.is_active
                 RETURNING *`,
                [emp_id, name, email || null, userRole, targetPlant, active]
            );
            if (resolvedFactoryId) {
                await query(`
                    INSERT INTO user_plant_access (emp_id, factory_id, is_active)
                    VALUES ($1, $2, true)
                    ON CONFLICT (emp_id, factory_id) DO UPDATE SET is_active = true
                `, [emp_id, resolvedFactoryId]);
            }
            return res.json(rows[0]);
        }
        const existingIdx = mockDb.userDetails.findIndex(u => u.emp_id === emp_id);
        const newUser = {
            emp_id,
            name,
            email: email || null,
            role: userRole,
            default_plant: targetPlant,
            is_active: active
        };
        if (existingIdx >= 0) {
            mockDb.userDetails[existingIdx] = newUser;
        } else {
            mockDb.userDetails.push(newUser);
        }
        if (resolvedFactoryId) {
            const existingUpa = mockDb.userPlantAccess.find(upa => upa.emp_id === emp_id && upa.factory_id === resolvedFactoryId);
            if (!existingUpa) {
                mockDb.userPlantAccess.push({
                    id: `upa-${Date.now()}`,
                    emp_id,
                    factory_id: resolvedFactoryId,
                    is_active: true
                });
            } else {
                existingUpa.is_active = true;
            }
        }
        res.json(newUser);
    }
    catch {
        res.status(500).json({ error: 'Failed to create/update user details' });
    }
});
// 8. Kaizens
app.get('/api/kaizen-details', async (req, res) => {
    try {
        if (pool) {
            const rows = await query(`
                SELECT kd.kaizen_id, kd.title, kd.content, kd.category, kd.previous_category, kd.before_image, kd.after_image,
                       kd.savings_estimate, kd.savings_unit, kd.improvement_notes, kd.implementation_date,
                       kd.team_member_emp_ids, kd.implementation_cost,
                       kd.submitted_by, kd.submitter_emp_id,
                       kd.status, kd.timestamp, kd.jh_group_id, kd.factory_id, kd.rejection_reason,
                       kd.change_requested_field, kd.change_requested_note, kd.reviewed_by, kd.reviewed_at,
                       kd.forwarded_to_dmt_at, kd.forwarded_to_dmt_by,
                       kd.review_changes, kd.current_stage_order,
                       jg.name AS jh_group_name, f.name AS factory_name, f.code AS factory_code
                FROM kaizen_details kd
                LEFT JOIN jh_group jg ON jg.id = kd.jh_group_id
                LEFT JOIN factory f ON f.id = kd.factory_id
                ORDER BY kd.timestamp DESC
            `);
            // approver_emp_ids reflects whichever phase-1 stage this Kaizen is CURRENTLY
            // sitting on — a stage-2+ reviewer only sees it in their queue once stage 1 has
            // approved, and stage 1's reviewer no longer sees it once they've acted.
            // phase2_stage_approver_emp_ids is the phase-2 equivalent (gates the "Review &
            // Forward" button on any non-final phase-2 stage); dmt_approver_emp_ids is always
            // the LAST phase-2 stage's approvers (gates Confirm & Close / Reject).
            const kzP1StagesByFactory = new Map();
            const kzP2StagesByFactory = new Map();
            const withApprovers = await Promise.all(rows.map(async (row) => {
                if (!kzP1StagesByFactory.has(row.factory_id)) {
                    kzP1StagesByFactory.set(row.factory_id, await resolveModulePhaseStages(row.factory_id, 'kaizen', 1));
                }
                if (!kzP2StagesByFactory.has(row.factory_id)) {
                    kzP2StagesByFactory.set(row.factory_id, await resolveModulePhaseStages(row.factory_id, 'kaizen', 2));
                }
                const p1Stages = kzP1StagesByFactory.get(row.factory_id);
                const p2Stages = kzP2StagesByFactory.get(row.factory_id);
                const isPhase2 = row.status === 'submitted_for_confirmation';
                const currentStages = isPhase2 ? p2Stages : p1Stages;
                const currentPhase = isPhase2 ? 2 : 1;
                const stageOrder = row.current_stage_order || currentStages[0].stage_order;
                const stage = currentStages.find((s) => s.stage_order === stageOrder) || currentStages[0];
                const p2LastStage = p2Stages[p2Stages.length - 1];
                const isOnLastPhase2Stage = isPhase2 && stage.stage_order === p2LastStage.stage_order;
                return {
                    ...row,
                    approver_emp_ids: currentPhase === 1 ? await resolveStageApproversFor(row.jh_group_id, 'kaizen', 1, stage, row.factory_id) : [],
                    phase2_stage_approver_emp_ids: (isPhase2 && !isOnLastPhase2Stage) ? await resolveStageApproversFor(row.jh_group_id, 'kaizen', 2, stage, row.factory_id) : [],
                    dmt_approver_emp_ids: (isPhase2 && isOnLastPhase2Stage) ? await resolveStageApproversFor(row.jh_group_id, 'kaizen', 2, p2LastStage, row.factory_id) : [],
                    current_stage_order: stage.stage_order,
                    current_stage_name: stage.stage_name,
                    total_stages: currentStages.length,
                };
            }));
            return res.json(withApprovers);
        }
        res.json(mockDb.kaizenDetails || []);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch Kaizen details' });
    }
});
app.post('/api/kaizen-details', async (req, res) => {
    const { title, content, category, before_image, submitted_by, status, jh_group_id } = req.body;
    const submitter = submitted_by || req.headers['x-worker-id'];
    if (!submitter) {
        return res.status(400).json({ error: 'submitted_by or x-worker-id header is required' });
    }
    if (!title) {
        return res.status(400).json({ error: 'title is required' });
    }
    const itemStatus = status || 'draft';
    if (itemStatus === 'proposed' && !(title && content && category && before_image)) {
        return res.status(400).json({ error: 'title, content, category, and before_image are all required to propose a kaizen' });
    }
    try {
        if (pool) {
            const { jhGroupId, factoryId, mustSelectGroup } = await resolveSubmitterJhGroupForFiling(req.headers['x-worker-id'], jh_group_id);
            if (mustSelectGroup && itemStatus !== 'draft') {
                return res.status(400).json({ error: 'Select a DMT and JH group to file this under before submitting.' });
            }
            const rows = await query(`INSERT INTO kaizen_details (title, content, category, before_image, submitted_by, submitter_emp_id, status, jh_group_id, factory_id, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING kaizen_id, title, content, category, before_image, submitted_by, submitter_emp_id, status, timestamp, jh_group_id, factory_id`, [
                title,
                content || '',
                category || null,
                before_image,
                submitter,
                req.headers['x-worker-id'] || null,
                itemStatus,
                jhGroupId,
                factoryId
            ]);
            const created = rows[0];
            if (created) {
                await query(
                    `INSERT INTO kaizen_audit_trail (kaizen_id, action, status_from, status_to, performed_by, comments, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                    [String(created.kaizen_id), itemStatus === 'proposed' ? 'proposed' : 'created_draft', null, itemStatus, submitter, itemStatus === 'proposed' ? 'Proposed for JH review' : 'Saved as draft']
                ).catch(() => {});
            }
            if (created && itemStatus === 'proposed') {
                try {
                    const stages = await resolveModulePhaseStages(created.factory_id, 'kaizen', 1);
                    const approvers = await resolveStageApproversFor(created.jh_group_id, 'kaizen', 1, stages[0], created.factory_id);
                    await notify(approvers, {
                        kind: 'kaizen_review_pending', module: 'kaizen', entityId: created.kaizen_id,
                        createdBy: req.headers['x-worker-id'],
                        title: 'Kaizen to review',
                        body: `"${created.title || `Kaizen #${created.kaizen_id}`}" was proposed for your review.`,
                    });
                } catch (e) { console.error('Kaizen propose notify failed:', e.message); }
            }
            return res.json(created);
        }
        const newDetail = {
            kaizen_id: (mockDb.kaizenDetails?.length || 0) + 1,
            title,
            content: content || '',
            category: category || null,
            before_image,
            submitted_by: submitter,
            status: itemStatus,
            timestamp: new Date().toISOString()
        };
        if (!mockDb.kaizenDetails) mockDb.kaizenDetails = [];
        mockDb.kaizenDetails.unshift(newDetail);
        res.json(newDetail);
    }
    catch {
        res.status(500).json({ error: 'Failed to create Kaizen detail' });
    }
});
// Kaizen review actions: approve / reject / update_category — all JH-group approver only,
// resolved via resolveKaizenApprovers. approve/reject also accept optional title/content/
// category/before_image edits from the reviewer, diffed into review_changes (mirrors
// Abnormality's assign_for_closure). submit_implementation is the submitter's own step
// (author only) between approval and JH confirmation. Every action is logged to kaizen_audit_trail.
const KAIZEN_REVIEW_ACTIONS = new Set(['approve', 'reject', 'update_category', 'submit_implementation', 'forward_to_dmt', 'confirm_close', 'mark_for_deletion']);
app.put('/api/kaizen-details/:id', async (req, res) => {
    const { id } = req.params;
    const { action, category, rejection_reason, after_image, savings_estimate, savings_unit, improvement_notes, implementation_date, title, content, before_image, team_member_emp_ids, implementation_cost, submit: submitAfterEdit } = req.body;
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) {
        return res.status(401).json({ error: 'x-worker-id header is required' });
    }
    if (action !== 'edit_draft' && !KAIZEN_REVIEW_ACTIONS.has(action)) {
        return res.status(400).json({ error: 'action must be one of approve, reject, update_category, submit_implementation, forward_to_dmt, confirm_close, mark_for_deletion, edit_draft' });
    }
    try {
        if (pool) {
            const existingRows = await query('SELECT * FROM kaizen_details WHERE kaizen_id = $1', [id]);
            const existing = existingRows[0];
            if (!existing) return res.status(404).json({ error: 'Kaizen detail not found' });

            // Submitter fixing their own Kaizen before it goes for review. Draft only.
            if (action === 'edit_draft') {
                const editorRows = await query('SELECT role FROM user_details WHERE emp_id = $1', [requesterEmpId]);
                const editorRole = editorRows[0]?.role || '';
                const isPrivileged = BE_LEAD_ROLES.has(editorRole) || editorRole === 'admin';
                if (existing.status !== 'draft') {
                    return res.status(409).json({ error: 'A Kaizen can only be edited while it is a draft' });
                }
                if (!isPrivileged && existing.submitter_emp_id && requesterEmpId !== existing.submitter_emp_id) {
                    return res.status(403).json({ error: 'Only the submitter can edit this draft' });
                }
                const nextStatus = submitAfterEdit ? 'proposed' : 'draft';
                const rows = await query(
                    `UPDATE kaizen_details SET
                       title = COALESCE($1, title), content = COALESCE($2, content),
                       category = COALESCE($3, category), before_image = $4, status = $5
                     WHERE kaizen_id = $6 RETURNING *`,
                    [title ?? null, content ?? null, category ?? null, before_image ?? null, nextStatus, id]
                );
                await query(
                    `INSERT INTO kaizen_audit_trail (kaizen_id, action, status_from, status_to, performed_by, comments, timestamp)
                     VALUES ($1, $2, 'draft', $3, $4, $5, NOW())`,
                    [String(id), submitAfterEdit ? 'proposed' : 'edit_draft', nextStatus, requesterEmpId,
                     submitAfterEdit ? 'Proposed for JH review' : 'Draft edited by submitter']
                ).catch(() => {});
                if (submitAfterEdit) {
                    try {
                        const stages = await resolveModulePhaseStages(rows[0].factory_id, 'kaizen', 1);
                        const approvers = await resolveStageApproversFor(rows[0].jh_group_id, 'kaizen', 1, stages[0], rows[0].factory_id);
                        await notify(approvers, {
                            kind: 'kaizen_review_pending', module: 'kaizen', entityId: id, createdBy: requesterEmpId,
                            title: 'Kaizen to review',
                            body: `"${rows[0].title || `Kaizen #${id}`}" was proposed for your review.`,
                        });
                    } catch (e) { console.error('kaizen propose-from-draft notify failed:', e.message); }
                }
                return res.json(rows[0]);
            }

            if (action === 'submit_implementation') {
                if (requesterEmpId !== existing.submitter_emp_id) {
                    return res.status(403).json({ error: 'Only the original submitter may report implementation on this Kaizen' });
                }
                if (existing.status !== 'approved_for_implementation') {
                    return res.status(400).json({ error: 'Kaizen must be approved for implementation before reporting implementation' });
                }
                if (!(after_image && savings_estimate != null && savings_unit && improvement_notes && implementation_date)) {
                    return res.status(400).json({ error: 'after_image, savings_estimate, savings_unit, improvement_notes, and implementation_date are all required' });
                }
                // Optional "who helped" — up to 3 teammates, never mandatory. Dedupe, drop the
                // submitter themselves (they're already credited as the author), and cap at 3
                // server-side too (never trust the client's own limit).
                let teamMemberEmpIds = null;
                if (Array.isArray(team_member_emp_ids) && team_member_emp_ids.length > 0) {
                    const cleaned = [...new Set(team_member_emp_ids.map((e) => String(e).trim()).filter(Boolean))]
                        .filter((e) => e !== requesterEmpId);
                    if (cleaned.length > 3) {
                        return res.status(400).json({ error: 'You can name at most 3 team members' });
                    }
                    if (cleaned.length > 0) teamMemberEmpIds = cleaned;
                }
                // Optional implementation cost — many Kaizens cost nothing to implement, so
                // an empty/absent value stays NULL. Reject a non-numeric or negative value.
                let implementationCost = null;
                if (implementation_cost !== undefined && implementation_cost !== null && String(implementation_cost).trim() !== '') {
                    const c = Number(implementation_cost);
                    if (Number.isNaN(c) || c < 0) {
                        return res.status(400).json({ error: 'implementation_cost must be a non-negative number' });
                    }
                    implementationCost = c;
                }
                // Client offers the fixed SAVINGS_UNITS as a toggle plus a free-text "Others"
                // option — accept any non-empty unit rather than re-enforcing the fixed set here.
                // current_stage_order is shared across both phases sequentially — entering
                // phase 2 here always restarts it at phase 2's first configured stage,
                // regardless of wherever it ended up at the end of phase 1.
                const kzP2StartStages = await resolveModulePhaseStages(existing.factory_id, 'kaizen', 2);
                const rows = await query(
                    `UPDATE kaizen_details SET
                       status = 'submitted_for_confirmation', after_image = $1, savings_estimate = $2,
                       savings_unit = $3, improvement_notes = $4, implementation_date = $5,
                       current_stage_order = $6, team_member_emp_ids = $7, implementation_cost = $8
                     WHERE kaizen_id = $9 RETURNING *`,
                    [after_image, savings_estimate, savings_unit, improvement_notes, implementation_date, kzP2StartStages[0].stage_order, teamMemberEmpIds, implementationCost, id]
                );
                await query(
                    `INSERT INTO kaizen_audit_trail (kaizen_id, action, status_from, status_to, performed_by, comments, timestamp)
                     VALUES ($1, 'submit_implementation', $2, 'submitted_for_confirmation', $3, $4, NOW())`,
                    [String(id), existing.status, requesterEmpId, `Implementation reported: ${savings_estimate} ${savings_unit} saved`]
                ).catch(() => {});
                try {
                    const p2 = await resolveModulePhaseStages(existing.factory_id, 'kaizen', 2);
                    const appr = await resolveStageApproversFor(existing.jh_group_id, 'kaizen', 2, p2[0], existing.factory_id);
                    await notify(appr, {
                        kind: 'kaizen_review_pending', module: 'kaizen', entityId: id, createdBy: requesterEmpId,
                        title: 'Kaizen implementation to review',
                        body: `"${existing.title || `Kaizen #${id}`}" — implementation was reported.`,
                    });
                } catch (e) { console.error('kaizen notify (submit_implementation) failed:', e.message); }
                return res.json(rows[0]);
            }

            if (action === 'confirm_close' || action === 'mark_for_deletion') {
                if (existing.status !== 'submitted_for_confirmation') {
                    return res.status(400).json({ error: 'Kaizen must be submitted for confirmation before final review' });
                }
                const kzP2StagesForFinal = await resolveModulePhaseStages(existing.factory_id, 'kaizen', 2);
                const kzP2CurrentOrderForFinal = existing.current_stage_order || kzP2StagesForFinal[0].stage_order;
                const kzP2CurrentStageForFinal = kzP2StagesForFinal.find((s) => s.stage_order === kzP2CurrentOrderForFinal) || kzP2StagesForFinal[0];
                const kzP2LastStage = kzP2StagesForFinal[kzP2StagesForFinal.length - 1];
                // confirm_close/mark_for_deletion are only valid on the LAST configured phase-2
                // stage — earlier stages must use forward_to_dmt to advance instead. For the
                // default 2-stage floor this is exactly today's behavior (stage 2 = 'kaizen_dmt'),
                // reached only once forward_to_dmt has run (which is what forwarded_to_dmt_at
                // being set already guaranteed).
                if (kzP2CurrentStageForFinal.stage_order !== kzP2LastStage.stage_order) {
                    return res.status(400).json({ error: 'This Kaizen must complete every earlier review stage first' });
                }
                const dmtApprovers = await resolveStageApproversFor(existing.jh_group_id, 'kaizen', 2, kzP2LastStage, existing.factory_id);
                if (!dmtApprovers.includes(requesterEmpId)) {
                    return res.status(403).json({ error: 'You are not authorized to give final review on this Kaizen' });
                }
                if (action === 'mark_for_deletion' && !rejection_reason) {
                    return res.status(400).json({ error: 'rejection_reason is required to mark for deletion' });
                }
                // mark_for_deletion now lands on the same 'rejected' status the JH-stage
                // reject uses — it's the same outcome (never a real delete), just at the
                // 2nd review stage instead of the 1st. Which stage it happened at is told
                // apart by forwarded_to_dmt_at (only ever set once forwarded), not a
                // separate status value.
                const newStatus = action === 'confirm_close' ? 'confirmed_closed' : 'rejected';
                const rows = await query(
                    `UPDATE kaizen_details SET
                       status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW()
                     WHERE kaizen_id = $4 RETURNING *`,
                    [newStatus, action === 'mark_for_deletion' ? rejection_reason : null, requesterEmpId, id]
                );
                const auditComments = action === 'confirm_close' ? 'Confirmed and closed at implementation review' : `Rejected at implementation review: ${rejection_reason}`;
                await query(
                    `INSERT INTO kaizen_audit_trail (kaizen_id, action, status_from, status_to, performed_by, comments, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                    [String(id), action, existing.status, newStatus, requesterEmpId, auditComments]
                ).catch(() => {});
                try {
                    await resolveNotifications('kaizen', id, ['kaizen_review_pending', 'kaizen_dmt_pending']);
                    if (action === 'confirm_close') {
                        await notify(existing.submitter_emp_id, {
                            kind: 'kaizen_closed',
                            module: 'kaizen', entityId: id, createdBy: requesterEmpId,
                            title: 'Your Kaizen was confirmed & closed',
                            body: `"${existing.title || `Kaizen #${id}`}" is complete.`,
                        });
                    } else {
                        // A phase-2 rejection goes to the submitter, the plant's BE leads, and
                        // the JH group leader — all with the reviewer's comment.
                        const jhLeaderRows = existing.jh_group_id
                            ? await query('SELECT leader_emp_id FROM jh_group WHERE id = $1', [existing.jh_group_id])
                            : [];
                        const rejectRecipients = [...new Set([
                            existing.submitter_emp_id,
                            jhLeaderRows[0]?.leader_emp_id,
                            ...(existing.factory_id ? await beLeadEmpIdsForFactory(existing.factory_id) : []),
                        ].filter(Boolean).filter((e) => e !== requesterEmpId))];
                        await notify(rejectRecipients, {
                            kind: 'kaizen_rejected',
                            module: 'kaizen', entityId: id, createdBy: requesterEmpId,
                            title: 'Kaizen rejected at implementation review',
                            body: `"${existing.title || `Kaizen #${id}`}" — ${rejection_reason}`,
                        });
                    }
                } catch (e) { console.error('kaizen notify (final) failed:', e.message); }
                return res.json(rows[0]);
            }

            // update_category: still the flat, un-staged JH-group approver check (not
            // wired to any live UI button anymore, kept for API-testing compatibility).
            if (action === 'update_category') {
                const approvers = await resolveKaizenApprovers(existing.jh_group_id);
                if (!approvers.includes(requesterEmpId)) {
                    return res.status(403).json({ error: 'You are not authorized to review this Kaizen' });
                }
            }
            if (action === 'forward_to_dmt') {
                // forward_to_dmt is phase 2's "advance, not final" action — valid on any
                // configured phase-2 stage EXCEPT the last one (that's confirm_close/
                // mark_for_deletion's job instead). Stage-aware authorization, mirroring
                // phase 1's approve/reject above.
                if (existing.status !== 'submitted_for_confirmation') {
                    return res.status(400).json({ error: 'Kaizen must be submitted for confirmation before forwarding to the DMT lead' });
                }
                const kzP2Stages = await resolveModulePhaseStages(existing.factory_id, 'kaizen', 2);
                const kzP2CurrentOrder = existing.current_stage_order || kzP2Stages[0].stage_order;
                const kzP2CurrentIdx = kzP2Stages.findIndex((s) => s.stage_order === kzP2CurrentOrder);
                const kzP2CurrentStage = kzP2CurrentIdx >= 0 ? kzP2Stages[kzP2CurrentIdx] : kzP2Stages[0];
                const kzP2NextStage = kzP2Stages[(kzP2CurrentIdx >= 0 ? kzP2CurrentIdx : 0) + 1];
                if (!kzP2NextStage) {
                    return res.status(400).json({ error: 'This Kaizen is on its final review stage — use Confirm & Close or Reject instead' });
                }
                const kzP2Approvers = await resolveStageApproversFor(existing.jh_group_id, 'kaizen', 2, kzP2CurrentStage, existing.factory_id);
                if (!kzP2Approvers.includes(requesterEmpId)) {
                    return res.status(403).json({ error: 'You are not authorized to review this Kaizen' });
                }
                // The JH lead can edit whatever the submitter reported at implementation
                // (after-photo, savings estimate/unit, improvement notes, implementation date)
                // before forwarding to the DMT lead — replaces the old 3-checkbox validation
                // (jh_validated_category/savings/outcome are no longer written). Diffed the
                // same way as the approve/reject edit, and merged into any existing
                // review_changes from the earlier approve-stage edit rather than overwriting it.
                const fwdEditCandidates = [
                    ['after_image', existing.after_image, after_image, after_image !== undefined ? (after_image || existing.after_image) : existing.after_image],
                    ['savings_estimate', existing.savings_estimate, savings_estimate, savings_estimate !== undefined ? savings_estimate : existing.savings_estimate],
                    ['savings_unit', existing.savings_unit, savings_unit, savings_unit !== undefined ? (savings_unit || existing.savings_unit) : existing.savings_unit],
                    ['improvement_notes', existing.improvement_notes, improvement_notes, improvement_notes !== undefined ? (improvement_notes ?? existing.improvement_notes) : existing.improvement_notes],
                    ['implementation_date', existing.implementation_date, implementation_date, implementation_date !== undefined ? (implementation_date || existing.implementation_date) : existing.implementation_date],
                ];
                const fwdEditChanges = {};
                for (const [field, oldVal, provided, newVal] of fwdEditCandidates) {
                    // improvement_notes is free text the reviewer may just retype with
                    // different casing (e.g. "none" -> "None") without meaning to change it —
                    // compare case-insensitively for that field only; every other field is an
                    // exact-value comparison (photo URL, numeric estimate, unit, date).
                    const changed = field === 'improvement_notes'
                        ? String(oldVal ?? '').trim().toLowerCase() !== String(newVal ?? '').trim().toLowerCase()
                        : String(oldVal ?? '') !== String(newVal ?? '');
                    if (provided !== undefined && changed) {
                        fwdEditChanges[field] = { from: oldVal, to: newVal };
                    }
                }
                const newAfterImage = fwdEditChanges.after_image ? fwdEditChanges.after_image.to : existing.after_image;
                const newSavingsEstimate = fwdEditChanges.savings_estimate ? fwdEditChanges.savings_estimate.to : existing.savings_estimate;
                const newSavingsUnit = fwdEditChanges.savings_unit ? fwdEditChanges.savings_unit.to : existing.savings_unit;
                const newImprovementNotes = fwdEditChanges.improvement_notes ? fwdEditChanges.improvement_notes.to : existing.improvement_notes;
                const newImplementationDate = fwdEditChanges.implementation_date ? fwdEditChanges.implementation_date.to : existing.implementation_date;
                const mergedReviewChanges = { ...(existing.review_changes || {}), ...fwdEditChanges };
                const newReviewChanges = Object.keys(mergedReviewChanges).length ? JSON.stringify(mergedReviewChanges) : existing.review_changes;

                // forwarded_to_dmt_at/_by mean "has this Kaizen ever passed its first phase-2
                // stage" — set once, the first time forward_to_dmt succeeds (advancing off
                // stage 1). Advancing further (stage 2→3, admin-added stages only) doesn't
                // touch them again; they're what the frontend's "1st vs 2nd review" rejected
                // tab split and the forward-stage gating both key off.
                // Stamp forwarded_to_dmt_at/_by only on the FIRST phase-2 advance (off stage 1).
                // Fixed param indices — a conditionally-built SET clause left `$1` unreferenced
                // on later advances (admin-added stages) while the param stayed in the array,
                // which PostgreSQL rejects as a parameter-count mismatch.
                const stampForward = kzP2CurrentIdx <= 0 && !existing.forwarded_to_dmt_at;
                const rows = await query(
                    `UPDATE kaizen_details SET
                       forwarded_to_dmt_at = COALESCE(forwarded_to_dmt_at, CASE WHEN $1 THEN NOW() ELSE NULL END),
                       forwarded_to_dmt_by = COALESCE(forwarded_to_dmt_by, CASE WHEN $1 THEN $2 ELSE NULL END),
                       current_stage_order = $3,
                       after_image = $4, savings_estimate = $5, savings_unit = $6,
                       improvement_notes = $7, implementation_date = $8, review_changes = $9
                     WHERE kaizen_id = $10 RETURNING *`,
                    [stampForward, requesterEmpId, kzP2NextStage.stage_order, newAfterImage, newSavingsEstimate, newSavingsUnit, newImprovementNotes, newImplementationDate, newReviewChanges, id]
                );
                const FWD_FIELD_LABEL = { after_image: 'After Photo', savings_estimate: 'One-Time Benefit', savings_unit: 'Benefit Unit', improvement_notes: 'Improvements Made', implementation_date: 'Implementation Date' };
                const fwdAuditChangedFields = Object.entries(fwdEditChanges).map(([field, { from, to }]) => ({
                    field, label: FWD_FIELD_LABEL[field] || field, old: from, new: to,
                }));
                const fwdEditSummary = fwdAuditChangedFields.length ? ` (edited: ${Object.keys(fwdEditChanges).join(', ')})` : '';
                await query(
                    `INSERT INTO kaizen_audit_trail (kaizen_id, action, status_from, status_to, performed_by, comments, changed_fields, timestamp)
                     VALUES ($1, 'forward_to_dmt', $2, $2, $3, $4, $5, NOW())`,
                    [String(id), existing.status, requesterEmpId, `Approved at "${kzP2CurrentStage.stage_name}" — moved to "${kzP2NextStage.stage_name}"${fwdEditSummary}`, fwdAuditChangedFields.length ? JSON.stringify(fwdAuditChangedFields) : null]
                ).catch(() => {});
                try {
                    await resolveNotifications('kaizen', id, ['kaizen_review_pending', 'kaizen_dmt_pending']);
                    const appr = await resolveStageApproversFor(existing.jh_group_id, 'kaizen', 2, kzP2NextStage, existing.factory_id);
                    await notify(appr, {
                        kind: kzP2NextStage.entity_type === 'kaizen_dmt' ? 'kaizen_dmt_pending' : 'kaizen_review_pending',
                        module: 'kaizen', entityId: id, createdBy: requesterEmpId,
                        title: 'Kaizen awaiting your confirmation',
                        body: `"${existing.title || `Kaizen #${id}`}" was forwarded to ${kzP2NextStage.stage_name}.`,
                    });
                } catch (e) { console.error('kaizen notify (forward_to_dmt) failed:', e.message); }
                return res.json(rows[0]);
            }
            if (action === 'update_category') {
                const newCategory = category !== undefined ? category : existing.category;
                const rows = await query(
                    `UPDATE kaizen_details SET category = $1, previous_category = $2 WHERE kaizen_id = $3 RETURNING *`,
                    [newCategory, existing.category !== newCategory ? existing.category : existing.previous_category, id]
                );
                if (existing.category !== newCategory) {
                    await query(
                        `INSERT INTO kaizen_audit_trail (kaizen_id, action, status_from, status_to, performed_by, comments, changed_fields, timestamp)
                         VALUES ($1, 'category_updated', $2, $2, $3, $4, $5, NOW())`,
                        [
                            String(id), existing.status, requesterEmpId,
                            `Category changed from "${existing.category}" to "${newCategory}"`,
                            JSON.stringify([{ field: 'category', label: 'Category', old: existing.category, new: newCategory }])
                        ]
                    ).catch(() => {});
                }
                return res.json(rows[0]);
            }
            // approve/reject: phase 1 (proposal review) — stage-aware. Authorization is scoped
            // to whichever stage this Kaizen is CURRENTLY sitting on, resolved from the
            // factory's configured stage ladder (resolveModulePhaseStages), not a flat
            // JH-group check — no rows configured = today's exact single-stage behavior.
            const kzStages = await resolveModulePhaseStages(existing.factory_id, 'kaizen', 1);
            const kzCurrentStageOrder = existing.current_stage_order || kzStages[0].stage_order;
            const kzCurrentStage = kzStages.find((s) => s.stage_order === kzCurrentStageOrder) || kzStages[0];
            const kzStageApprovers = await resolveStageApproversFor(existing.jh_group_id, 'kaizen', 1, kzCurrentStage, existing.factory_id);
            if (!kzStageApprovers.includes(requesterEmpId)) {
                return res.status(403).json({ error: 'You are not authorized to review this Kaizen' });
            }
            if (action === 'reject' && !rejection_reason) {
                return res.status(400).json({ error: 'rejection_reason is required to reject' });
            }
            // The JH reviewer may edit any of the submitter's reported fields (title, content,
            // category, before_image) in the same request as approve/reject — mirrors
            // Abnormality's assign_for_closure edit-and-diff pattern. Only fields actually
            // changed are snapshotted to review_changes (jsonb) so the submitter can see a
            // before/after diff, and logged into kaizen_audit_trail.changed_fields.
            const editCandidates = [
                ['title', existing.title, title, title !== undefined ? (title || existing.title) : existing.title],
                ['content', existing.content, content, content !== undefined ? (content ?? existing.content) : existing.content],
                ['category', existing.category, category, category !== undefined ? (category || existing.category) : existing.category],
                ['before_image', existing.before_image, before_image, before_image !== undefined ? (before_image || existing.before_image) : existing.before_image],
            ];
            const editChanges = {};
            for (const [field, oldVal, provided, newVal] of editCandidates) {
                if (provided !== undefined && String(oldVal ?? '') !== String(newVal ?? '')) {
                    editChanges[field] = { from: oldVal, to: newVal };
                }
            }
            const newTitle = editChanges.title ? editChanges.title.to : existing.title;
            const newContent = editChanges.content ? editChanges.content.to : existing.content;
            const newCategory = editChanges.category ? editChanges.category.to : existing.category;
            const newBeforeImage = editChanges.before_image ? editChanges.before_image.to : existing.before_image;
            const newReviewChanges = Object.keys(editChanges).length ? JSON.stringify(editChanges) : existing.review_changes;

            // Approving at a non-final stage just advances the stage pointer and keeps the
            // Kaizen's status exactly where it was (still pending review, one stage over) —
            // only the LAST configured stage's approval actually finalizes to
            // approved_for_implementation. Rejecting is terminal at any stage, same as today.
            let newStatus = existing.status;
            let newStageOrder = kzCurrentStage.stage_order;
            let stageAuditNote = '';
            if (action === 'reject') {
                newStatus = 'rejected';
                stageAuditNote = `Rejected at "${kzCurrentStage.stage_name}"`;
            } else {
                const currentIdx = kzStages.findIndex((s) => s.stage_order === kzCurrentStage.stage_order);
                const nextStage = kzStages[currentIdx + 1];
                if (nextStage) {
                    newStageOrder = nextStage.stage_order;
                    stageAuditNote = `Approved at "${kzCurrentStage.stage_name}" — moved to "${nextStage.stage_name}"`;
                } else {
                    newStatus = 'approved_for_implementation';
                    stageAuditNote = `Approved at "${kzCurrentStage.stage_name}" (final stage)`;
                }
            }
            const rows = await query(
                `UPDATE kaizen_details SET
                   status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW(),
                   title = $4, content = $5, category = $6, before_image = $7, review_changes = $8,
                   current_stage_order = $9
                 WHERE kaizen_id = $10 RETURNING *`,
                [
                    newStatus,
                    action === 'reject' ? rejection_reason : null,
                    requesterEmpId,
                    newTitle, newContent, newCategory, newBeforeImage, newReviewChanges,
                    newStageOrder,
                    id
                ]
            );
            const editSummary = Object.keys(editChanges).length ? ` (edited: ${Object.keys(editChanges).join(', ')})` : '';
            const auditComments = `${stageAuditNote}${action === 'reject' ? `: ${rejection_reason}` : ''}${editSummary}`;
            const EDIT_FIELD_LABEL = { title: 'Title', content: 'Description', category: 'Category', before_image: 'Before Photo' };
            // kaizen_audit_trail.changed_fields is an array-of-{field,label,old,new} (matches
            // update_category's shape, which the Audit Trail modal's parser expects) — a
            // different shape from review_changes (an object keyed by field), which is what
            // the submitter's diff view on the detail sheet reads instead.
            const auditChangedFields = Object.entries(editChanges).map(([field, { from, to }]) => ({
                field, label: EDIT_FIELD_LABEL[field] || field, old: from, new: to,
            }));
            await query(
                `INSERT INTO kaizen_audit_trail (kaizen_id, action, status_from, status_to, performed_by, comments, changed_fields, timestamp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [String(id), action, existing.status, newStatus, requesterEmpId, auditComments, auditChangedFields.length ? JSON.stringify(auditChangedFields) : null]
            ).catch(() => {});
            try {
                const link = newTitle || existing.title || `Kaizen #${id}`;
                if (action === 'reject') {
                    await resolveNotifications('kaizen', id, ['kaizen_review_pending']);
                    await notify(existing.submitter_emp_id, {
                        kind: 'kaizen_rejected', module: 'kaizen', entityId: id, createdBy: requesterEmpId,
                        title: 'Your Kaizen was sent back', body: `"${link}" — ${rejection_reason}`,
                    });
                } else if (newStatus === 'approved_for_implementation') {
                    await resolveNotifications('kaizen', id, ['kaizen_review_pending']);
                    await notify(existing.submitter_emp_id, {
                        kind: 'kaizen_approved', module: 'kaizen', entityId: id, createdBy: requesterEmpId,
                        title: 'Your Kaizen was approved', body: `"${link}" — report implementation when it's done.`,
                    });
                } else {
                    // advanced to a later phase-1 stage
                    await resolveNotifications('kaizen', id, ['kaizen_review_pending']);
                    const nextStage = kzStages.find((s) => s.stage_order === newStageOrder) || kzCurrentStage;
                    const appr = await resolveStageApproversFor(existing.jh_group_id, 'kaizen', 1, nextStage, existing.factory_id);
                    await notify(appr, {
                        kind: 'kaizen_review_pending', module: 'kaizen', entityId: id, createdBy: requesterEmpId,
                        title: 'Kaizen to review', body: `"${link}" moved to ${nextStage.stage_name}.`,
                    });
                }
            } catch (e) { console.error('kaizen notify (approve/reject) failed:', e.message); }
            return res.json(rows[0]);
        }
        res.status(501).json({ error: 'Kaizen review actions require the database connection' });
    }
    catch {
        res.status(500).json({ error: 'Failed to update Kaizen detail' });
    }
});
app.get('/api/kaizen-audit-trail', async (req, res) => {
    const { kaizen_id } = req.query;
    try {
        if (pool) {
            let sql = 'SELECT * FROM kaizen_audit_trail';
            const params = [];
            if (kaizen_id) {
                sql += ' WHERE kaizen_id = $1';
                params.push(String(kaizen_id));
            }
            sql += ' ORDER BY timestamp DESC';
            const rows = await query(sql, params);
            return res.json(rows);
        }
        res.json([]);
    } catch {
        res.status(500).json({ error: 'Failed to fetch Kaizen audit trail' });
    }
});
// 9. Audits (5S etc.) — configurable templates. A template has a `structure`
// ('questions' | 'categories' | 'categories_questions'), a `scoring_mode`
// ('required' | 'optional' | 'off') and a mark scale (score_min/score_max/score_step).
// Categories are free-form rows (audit_template_category); the array below is only the
// legacy 5S pillar slugs that older templates were seeded with.
const AUDIT_CATEGORIES = ['sort', 'set_in_order', 'shine', 'standardize', 'sustain'];
const AUDIT_STRUCTURES = ['questions', 'categories', 'categories_questions'];
const AUDIT_SCORING_MODES = ['required', 'optional', 'off'];
// A score is valid when it sits on the template's scale: min <= s <= max AND (s - min) is
// a whole multiple of step (within a small float tolerance, since step can be e.g. 0.5).
function isScoreOnScale(s, min, max, step) {
    const n = Number(s);
    if (!Number.isFinite(n)) return false;
    if (n < Number(min) - 1e-9 || n > Number(max) + 1e-9) return false;
    const k = (n - Number(min)) / Number(step);
    return Math.abs(k - Math.round(k)) < 1e-6;
}

// ---- Audit schedule recurrence (Teams-style) ---------------------------------------
const AUDIT_FREQ = ['once', 'daily', 'weekly', 'monthly'];
const AUDIT_END_TYPES = ['never', 'on', 'after'];
function auditParseDateOnly(s) {
    if (!s) return null;
    const str = typeof s === 'string' ? s.slice(0, 10) : new Date(s).toISOString().slice(0, 10);
    const [y, m, d] = str.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}
function auditToDateOnly(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function auditAddDays(dt, n) { const x = new Date(dt); x.setDate(x.getDate() + n); return x; }
function auditMonthlyDate(start, monthsFromStart, dom) {
    const base = new Date(start.getFullYear(), start.getMonth() + monthsFromStart, 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    return new Date(base.getFullYear(), base.getMonth(), Math.min(dom, lastDay));
}
// Validate + normalise a recurrence payload. Returns { error } or { value: {...} }.
function normaliseAuditRecurrence(body) {
    let freq = body.freq || (body.recurrence === 'none' ? 'once' : body.recurrence) || 'once';
    if (freq === 'fortnightly') freq = 'weekly';
    if (!AUDIT_FREQ.includes(freq)) return { error: `freq must be one of ${AUDIT_FREQ.join(', ')}` };
    const startDate = String(body.start_date || body.specific_date || '').slice(0, 10);
    if (!auditParseDateOnly(startDate)) return { error: 'start_date is required (YYYY-MM-DD)' };
    if (freq === 'once') {
        return { value: { freq: 'once', recur_interval: 1, weekdays: [], day_of_month: null, start_date: startDate, end_type: 'never', end_date: null, occurrence_count: null } };
    }
    let interval = parseInt(body.recur_interval ?? body.interval ?? 1, 10);
    interval = Number.isFinite(interval) ? Math.max(1, Math.min(365, interval)) : 1;
    let weekdays = Array.isArray(body.weekdays) ? [...new Set(body.weekdays.map((n) => parseInt(n, 10)).filter((n) => n >= 0 && n <= 6))].sort((a, b) => a - b) : [];
    if (freq === 'weekly' && weekdays.length === 0) weekdays = [auditParseDateOnly(startDate).getDay()];
    if (freq !== 'weekly') weekdays = [];
    let dayOfMonth = null;
    if (freq === 'monthly') {
        dayOfMonth = body.day_of_month != null ? parseInt(body.day_of_month, 10) : auditParseDateOnly(startDate).getDate();
        if (!(dayOfMonth >= 1 && dayOfMonth <= 31)) return { error: 'day_of_month must be 1-31' };
    }
    const endType = body.end_type || 'never';
    if (!AUDIT_END_TYPES.includes(endType)) return { error: 'end_type must be never, on or after' };
    let endDate = null, occurrenceCount = null;
    if (endType === 'on') {
        endDate = String(body.end_date || '').slice(0, 10);
        if (!auditParseDateOnly(endDate)) return { error: 'end_date is required when the schedule ends on a date' };
        if (auditParseDateOnly(endDate) < auditParseDateOnly(startDate)) return { error: 'end_date cannot be before start_date' };
    }
    if (endType === 'after') {
        occurrenceCount = parseInt(body.occurrence_count, 10);
        if (!(occurrenceCount >= 1 && occurrenceCount <= 1000)) return { error: 'occurrence_count must be between 1 and 1000' };
    }
    return { value: { freq, recur_interval: interval, weekdays, day_of_month: dayOfMonth, start_date: startDate, end_type: endType, end_date: endDate, occurrence_count: occurrenceCount } };
}
function legacyAuditRecurrence(v) {
    if (v.freq === 'once') return 'none';
    if (v.freq === 'daily') return 'daily';
    if (v.freq === 'monthly') return 'monthly';
    return v.recur_interval === 2 ? 'fortnightly' : 'weekly';
}
// The next occurrence date (YYYY-MM-DD) on or after `from` (a Date), or null once the
// pattern has ended. `sched` carries freq/recur_interval/weekdays/day_of_month/start_date/
// end_type/end_date/occurrence_count.
function nextAuditOccurrence(sched, from) {
    const start = auditParseDateOnly(sched.start_date);
    if (!start) return null;
    const freq = sched.freq || 'once';
    const cursor = from < start ? start : from;
    if (freq === 'once') return auditToDateOnly(start);
    const interval = Math.max(1, sched.recur_interval || 1);
    const hardEnd = sched.end_type === 'on' ? auditParseDateOnly(sched.end_date) : null;
    const maxCount = sched.end_type === 'after' ? (sched.occurrence_count || null) : null;
    const weekdays = (sched.weekdays && sched.weekdays.length) ? [...sched.weekdays].sort((a, b) => a - b) : [start.getDay()];
    const dom = sched.day_of_month || start.getDate();
    const GUARD = 6000;
    let occ = 0;
    if (freq === 'weekly') {
        const wkStart0 = auditAddDays(start, -start.getDay());
        for (let w = 0; w < GUARD; w++) {
            const wkStart = auditAddDays(wkStart0, w * interval * 7);
            for (const day of weekdays) {
                const d = auditAddDays(wkStart, day);
                if (d < start) continue;
                occ++;
                if (maxCount && occ > maxCount) return null;
                if (hardEnd && d > hardEnd) return null;
                if (d >= cursor) return auditToDateOnly(d);
            }
        }
        return null;
    }
    for (let i = 0; i < GUARD; i++) {
        const d = freq === 'daily' ? auditAddDays(start, i * interval) : auditMonthlyDate(start, i * interval, dom);
        occ++;
        if (maxCount && occ > maxCount) return null;
        if (hardEnd && d > hardEnd) return null;
        if (d >= cursor) return auditToDateOnly(d);
    }
    return null;
}

async function resolveRequesterRoleAndFactory(empId) {
    const rows = await query('SELECT role, default_plant FROM user_details WHERE emp_id = $1', [empId]);
    const role = rows[0]?.role || '';
    const plantCode = rows[0]?.default_plant || null;
    const factoryId = plantCode ? await resolveFactoryId(plantCode) : null;
    return { role, factoryId };
}
// A Global 5S Admin (audit_global_admin) has the same audit capability as a true
// BE-lead — create templates, configure ANY template, schedule ANY audit, manage ANY
// schedule's auditors — across the whole factory. It does NOT grant zone/home-zone
// management or the right to appoint anyone (appointing stays BE_LEAD_ROLES-only).
async function isGlobalAuditAdmin(empId, factoryId) {
    if (!pool || !factoryId) return false;
    const rows = await query('SELECT 1 FROM audit_global_admin WHERE factory_id = $1 AND emp_id = $2', [factoryId, empId]);
    return rows.length > 0;
}
// "Full" audit capability: a true BE-lead, or an appointed Global 5S Admin.
async function isFullAuditAdmin(empId, role, factoryId) {
    return BE_LEAD_ROLES.has(role) || (await isGlobalAuditAdmin(empId, factoryId));
}
// Everyone else's audit-configure capability is per-template only (audit_template_admin)
// — NOT global/factory-wide: being admin of "5S Audit" grants nothing on any other
// template. Role is never touched (same non-role-overwrite pattern as
// approval_routing/audit_schedule_auditor). Appointing a template's admin, or a Global
// 5S Admin, is itself strictly BE_LEAD_ROLES-only — nobody delegated can appoint anyone.
async function isTemplateAdmin(empId, role, templateId, factoryId) {
    if (await isFullAuditAdmin(empId, role, factoryId)) return true;
    if (!pool || !templateId) return false;
    const rows = await query('SELECT 1 FROM audit_template_admin WHERE template_id = $1 AND emp_id = $2', [templateId, empId]);
    return rows.length > 0;
}
// A schedule's mandatory admin_emp_id (picked at creation) grants configure rights over
// THAT schedule and its submissions specifically — narrower than, and independent of,
// template-level admin. Pass the schedule row (must include template_id, admin_emp_id).
async function isScheduleAdmin(empId, role, factoryId, schedule) {
    if (!schedule) return false;
    if (schedule.admin_emp_id === empId) return true;
    return isTemplateAdmin(empId, role, schedule.template_id, factoryId);
}
// Every template_id a requester administers (empty for a full audit admin, who instead
// gets unrestricted access checked separately — this only scopes list/filter queries).
async function getAdminTemplateIds(empId) {
    if (!pool) return [];
    const rows = await query('SELECT template_id FROM audit_template_admin WHERE emp_id = $1', [empId]);
    return rows.map((r) => r.template_id);
}
// A worker's home zone is where they normally work -- they may NOT audit it themselves
// (independence: no self-auditing). Returns true if empId's home zone equals zoneId.
async function isHomeZoneConflict(empId, zoneId) {
    if (!pool) return false;
    const rows = await query('SELECT 1 FROM audit_home_zone WHERE emp_id = $1 AND zone_id = $2', [empId, zoneId]);
    return rows.length > 0;
}
// Auditor headcount cap (audit_template.max_auditors; null = unlimited). The count is the
// distinct set of the schedule's Audit Admin PLUS every pool auditor — so max_auditors = 1
// means "only the Audit Admin". Returns an error string if `addingEmpIds` would exceed it.
async function auditAuditorCapError(templateId, adminEmpId, currentEmpIds, addingEmpIds) {
    const tpl = await query('SELECT max_auditors FROM audit_template WHERE id = $1', [templateId]);
    const max = tpl[0]?.max_auditors;
    if (!max) return null;
    const set = new Set([adminEmpId, ...(currentEmpIds || [])].filter(Boolean));
    for (const id of (addingEmpIds || [])) if (id) set.add(id);
    if (set.size > max) return `This audit is capped at ${max} auditor${max === 1 ? '' : 's'} — the Audit Admin counts as one.`;
    return null;
}
// Everyone expected to fill in a scorecard for a schedule's occurrence = its auditor pool
// PLUS the Audit Admin (distinct).
async function auditExpectedAuditors(scheduleId) {
    const s = await query('SELECT admin_emp_id FROM audit_schedule WHERE id = $1', [scheduleId]);
    const poolRows = await query('SELECT emp_id FROM audit_schedule_auditor WHERE schedule_id = $1', [scheduleId]);
    return [...new Set([s[0]?.admin_emp_id, ...poolRows.map((r) => r.emp_id)].filter(Boolean))];
}
// Find-or-create the audit_occurrence for one (schedule, date).
async function getOrCreateAuditOccurrence(schedule, dueDate) {
    const existing = await query('SELECT * FROM audit_occurrence WHERE schedule_id = $1 AND due_date = $2', [schedule.id, dueDate]);
    if (existing[0]) return existing[0];
    const rows = await query(
        `INSERT INTO audit_occurrence (schedule_id, template_id, zone_id, factory_id, due_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (schedule_id, due_date) DO UPDATE SET schedule_id = EXCLUDED.schedule_id
         RETURNING *`,
        [schedule.id, schedule.template_id, schedule.zone_id, schedule.factory_id, dueDate]
    );
    return rows[0];
}
// Roll up an occurrence from its SUBMITTED scorecards. Combined score = the plain average of
// the submitted total_scores (people who didn't submit are NOT counted as zero). Auto-closes
// once every expected auditor has submitted. Returns the updated occurrence row.
async function recomputeAuditOccurrence(occId, { forceClose = false, closedBy = null } = {}) {
    const occ = (await query('SELECT * FROM audit_occurrence WHERE id = $1', [occId]))[0];
    if (!occ) return null;
    const cards = await query("SELECT total_score, max_score FROM audit_submission WHERE occurrence_id = $1 AND status = 'submitted'", [occId]);
    const scored = cards.filter((c) => c.total_score != null);
    const combined = scored.length ? scored.reduce((a, c) => a + Number(c.total_score), 0) / scored.length : null;
    const combinedMax = cards.length ? (cards[0].max_score != null ? Number(cards[0].max_score) : null) : occ.combined_max;
    const expected = await auditExpectedAuditors(occ.schedule_id);
    // Auto-close when every person CURRENTLY on the list has submitted — checked by identity,
    // not by count. A plain count would let a card from someone since removed from the audit
    // stand in for a person who still hasn't submitted.
    const submitters = new Set(
        (await query(
            `SELECT DISTINCT COALESCE(submitted_by_emp_id, started_by_emp_id) AS emp_id
             FROM audit_submission WHERE occurrence_id = $1 AND status = 'submitted'`,
            [occId]
        )).map((r) => r.emp_id)
    );
    const everyoneExpectedIsIn = expected.length > 0 && expected.every((e) => submitters.has(e));
    const shouldClose = occ.status === 'open' && (forceClose || (cards.length > 0 && everyoneExpectedIsIn));
    const rows = await query(
        `UPDATE audit_occurrence SET combined_score = $1, combined_max = $2, submitted_count = $3, expected_count = $4
         ${shouldClose ? ", status = 'closed', closed_at = now(), closed_by_emp_id = $6" : ''}
         WHERE id = $5 RETURNING *`,
        shouldClose ? [combined, combinedMax, cards.length, expected.length, occId, closedBy] : [combined, combinedMax, cards.length, expected.length, occId]
    );
    if (shouldClose) {
        await query(
            'INSERT INTO audit_audit_trail (template_id, action, actor_emp_id, changed_fields) VALUES ($1, $2, $3, $4)',
            [occ.template_id, forceClose ? 'occurrence_force_closed' : 'occurrence_closed', closedBy,
                JSON.stringify({ occurrence_id: occId, combined_score: combined, submitted: cards.length, expected: expected.length })]
        );
    }
    return rows[0];
}

// Zones
app.get('/api/zones', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (pool) {
            const { factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
            const rows = await query('SELECT * FROM zone WHERE factory_id = $1 AND is_active = true ORDER BY name', [factoryId]);
            return res.json(rows);
        }
        res.json(mockDb.zones);
    } catch {
        res.status(500).json({ error: 'Failed to fetch zones' });
    }
});
app.post('/api/zones', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to create zones' });
        if (pool) {
            const rows = await query('INSERT INTO zone (factory_id, name) VALUES ($1, $2) RETURNING *', [factoryId, name.trim()]);
            return res.json(rows[0]);
        }
        const newZone = { id: `zone-${Date.now()}`, factory_id: factoryId, name: name.trim(), is_active: true, created_at: new Date().toISOString() };
        mockDb.zones.push(newZone);
        res.json(newZone);
    } catch {
        res.status(500).json({ error: 'Failed to create zone' });
    }
});
app.delete('/api/zones/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to delete zones' });
        if (pool) {
            const inUse = await query('SELECT id FROM audit_schedule WHERE zone_id = $1 AND is_active = true LIMIT 1', [req.params.id]);
            if (inUse.length > 0) return res.status(409).json({ error: 'This zone has an active audit schedule — remove that schedule first' });
            await query('UPDATE zone SET is_active = false WHERE id = $1', [req.params.id]);
        } else {
            mockDb.zones = mockDb.zones.filter((z) => z.id !== req.params.id);
        }
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to delete zone' });
    }
});

// Home zones — master mapping of each worker's home zone, configured by a BE-lead or a
// delegated 5S admin, so someone can be quickly assigned to audit their own home zone.
app.get('/api/audit-home-zones', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to view home zones' });
        if (pool) {
            const rows = await query(
                `SELECT hz.emp_id, u.name, hz.zone_id, z.name AS zone_name FROM audit_home_zone hz
         JOIN user_details u ON u.emp_id = hz.emp_id
         JOIN zone z ON z.id = hz.zone_id
         WHERE hz.factory_id = $1 ORDER BY u.name`,
                [factoryId]
            );
            return res.json(rows);
        }
        res.json([]);
    } catch {
        res.status(500).json({ error: 'Failed to fetch home zones' });
    }
});
app.post('/api/audit-home-zones', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { emp_id, zone_id } = req.body;
    if (!emp_id || !zone_id) return res.status(400).json({ error: 'emp_id and zone_id are required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to set a home zone' });
        if (pool) {
            const rows = await query(
                `INSERT INTO audit_home_zone (factory_id, emp_id, zone_id, assigned_by_emp_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (emp_id) DO UPDATE SET zone_id = EXCLUDED.zone_id, assigned_by_emp_id = EXCLUDED.assigned_by_emp_id, assigned_at = now()
         RETURNING *`,
                [factoryId, emp_id, zone_id, requesterEmpId]
            );
            return res.json(rows[0]);
        }
        res.json({ factory_id: factoryId, emp_id, zone_id });
    } catch {
        res.status(500).json({ error: 'Failed to set home zone' });
    }
});
app.delete('/api/audit-home-zones/:empId', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to remove a home zone' });
        if (pool) {
            await query('DELETE FROM audit_home_zone WHERE factory_id = $1 AND emp_id = $2', [factoryId, req.params.empId]);
        }
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to remove home zone' });
    }
});

// Templates
app.get('/api/audit-templates', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (pool) {
            const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
            const isBeLead = await isFullAuditAdmin(requesterEmpId, role, factoryId);
            const adminTemplateIds = isBeLead ? null : new Set(await getAdminTemplateIds(requesterEmpId));
            const templates = await query('SELECT * FROM audit_template WHERE factory_id = $1 AND is_active = true ORDER BY created_at DESC', [factoryId]);
            const questions = await query(
                `SELECT q.* FROM audit_template_question q
         JOIN audit_template t ON t.id = q.template_id
         WHERE t.factory_id = $1 AND q.is_active = true ORDER BY q.question_order ASC`,
                [factoryId]
            );
            const categories = await query(
                `SELECT c.* FROM audit_template_category c
         JOIN audit_template t ON t.id = c.template_id
         WHERE t.factory_id = $1 AND c.is_active = true ORDER BY c.category_order ASC`,
                [factoryId]
            );
            const qByTemplate = {};
            questions.forEach(q => { (qByTemplate[q.template_id] ||= []).push(q); });
            const cByTemplate = {};
            categories.forEach(c => { (cByTemplate[c.template_id] ||= []).push(c); });
            return res.json(templates.map(t => ({
                ...t,
                questions: qByTemplate[t.id] || [],
                categories: cByTemplate[t.id] || [],
                is_admin: isBeLead || adminTemplateIds.has(t.id),
            })));
        }
        res.json(mockDb.auditTemplates.map(t => ({ ...t, questions: mockDb.auditTemplateQuestions.filter(q => q.template_id === t.id) })));
    } catch {
        res.status(500).json({ error: 'Failed to fetch audit templates' });
    }
});
// Create a template. Body:
//   { name, structure, scoring_mode, score_min, score_max, score_step,
//     categories: [{ name, photo_required }],          // 'categories' | 'categories_questions'
//     questions:  [{ question_text, photo_required, category_index }] }  // 'questions' | 'categories_questions'
// category_index points into the categories array (only for 'categories_questions').
function validateTemplatePayload(body) {
    const { name, structure, scoring_mode } = body;
    if (!name || !name.trim()) return 'name is required';
    if (!AUDIT_STRUCTURES.includes(structure)) return `structure must be one of ${AUDIT_STRUCTURES.join(', ')}`;
    if (!AUDIT_SCORING_MODES.includes(scoring_mode)) return `scoring_mode must be one of ${AUDIT_SCORING_MODES.join(', ')}`;
    if (scoring_mode !== 'off') {
        const mn = Number(body.score_min), mx = Number(body.score_max), st = Number(body.score_step);
        if (![mn, mx, st].every(Number.isFinite)) return 'score_min, score_max and score_step must be numbers';
        if (mx <= mn) return 'score_max must be greater than score_min';
        if (st <= 0) return 'score_step must be greater than 0';
        if ((mx - mn) / st > 200) return 'too many score steps between min and max';
    }
    const cats = Array.isArray(body.categories) ? body.categories : [];
    const qs = Array.isArray(body.questions) ? body.questions : [];
    if (structure === 'questions') {
        if (qs.length === 0) return 'add at least one question';
    } else if (structure === 'categories') {
        if (cats.length === 0) return 'add at least one category';
    } else {
        if (cats.length === 0) return 'add at least one category';
        if (qs.length === 0) return 'add at least one question';
    }
    for (const c of cats) if (!c.name || !c.name.trim()) return 'every category needs a name';
    for (const q of qs) {
        if (!q.question_text || !q.question_text.trim()) return 'every question needs text';
        if (structure === 'categories_questions') {
            const ci = q.category_index;
            if (!Number.isInteger(ci) || ci < 0 || ci >= cats.length) return 'every question must be linked to a category';
        }
    }
    return null;
}
app.post('/api/audit-templates', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const err = validateTemplatePayload(req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, structure, scoring_mode } = req.body;
    const scoreMin = scoring_mode === 'off' ? 1 : Number(req.body.score_min);
    const scoreMax = scoring_mode === 'off' ? 4 : Number(req.body.score_max);
    const scoreStep = scoring_mode === 'off' ? 1 : Number(req.body.score_step);
    let maxAuditors = null;
    if (req.body.max_auditors !== undefined && req.body.max_auditors !== null && req.body.max_auditors !== '') {
        maxAuditors = parseInt(req.body.max_auditors, 10);
        if (!(maxAuditors >= 1 && maxAuditors <= 100)) return res.status(400).json({ error: 'max_auditors must be between 1 and 100' });
    }
    const cats = Array.isArray(req.body.categories) ? req.body.categories : [];
    const qs = Array.isArray(req.body.questions) ? req.body.questions : [];
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        // Creating a brand-new audit type needs full capability (true BE-lead or a Global
        // Audit Admin) — a per-template admin can only be appointed on a template that
        // already exists (see /audit-templates/:id/admins).
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to create a new audit template' });
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const templateRows = await query(
            `INSERT INTO audit_template (factory_id, name, created_by_emp_id, structure, scoring_mode, score_min, score_max, score_step, max_auditors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [factoryId, name.trim(), requesterEmpId, structure, scoring_mode, scoreMin, scoreMax, scoreStep, maxAuditors]
        );
        const template = templateRows[0];
        const insertedCategories = [];
        for (let i = 0; i < cats.length; i++) {
            const c = cats[i];
            const cRows = await query(
                'INSERT INTO audit_template_category (template_id, name, category_order, photo_required) VALUES ($1, $2, $3, $4) RETURNING *',
                [template.id, c.name.trim(), i, !!c.photo_required]
            );
            insertedCategories.push(cRows[0]);
        }
        const insertedQuestions = [];
        for (let i = 0; i < qs.length; i++) {
            const q = qs[i];
            const categoryId = structure === 'categories_questions' ? insertedCategories[q.category_index].id : null;
            const qRows = await query(
                'INSERT INTO audit_template_question (template_id, question_text, question_order, category, category_id, photo_required) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [template.id, q.question_text.trim(), i, categoryId ? (insertedCategories[q.category_index].name) : null, categoryId, !!q.photo_required]
            );
            insertedQuestions.push(qRows[0]);
        }
        return res.json({ ...template, categories: insertedCategories, questions: insertedQuestions });
    } catch (e) {
        console.error('create audit template failed:', e.message);
        res.status(500).json({ error: 'Failed to create audit template' });
    }
});
// Update a template's name / scoring mode / scale. Structure is immutable (changing it
// would orphan existing submissions) — build a new template instead.
app.put('/api/audit-templates/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { name, scoring_mode } = req.body;
    if (scoring_mode !== undefined && !AUDIT_SCORING_MODES.includes(scoring_mode)) return res.status(400).json({ error: 'invalid scoring_mode' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const existing = await query('SELECT * FROM audit_template WHERE id = $1', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Template not found' });
        if (!(await isTemplateAdmin(requesterEmpId, role, req.params.id, factoryId))) return res.status(403).json({ error: 'You are not authorized to edit this audit' });
        const nextMode = scoring_mode !== undefined ? scoring_mode : existing[0].scoring_mode;
        const nextMin = req.body.score_min !== undefined ? Number(req.body.score_min) : Number(existing[0].score_min);
        const nextMax = req.body.score_max !== undefined ? Number(req.body.score_max) : Number(existing[0].score_max);
        const nextStep = req.body.score_step !== undefined ? Number(req.body.score_step) : Number(existing[0].score_step);
        if (nextMode !== 'off') {
            if (!(nextMax > nextMin) || !(nextStep > 0)) return res.status(400).json({ error: 'score_max must exceed score_min and score_step must be positive' });
        }
        let nextMaxAuditors = existing[0].max_auditors;
        if (req.body.max_auditors !== undefined) {
            if (req.body.max_auditors === null || req.body.max_auditors === '') nextMaxAuditors = null;
            else {
                nextMaxAuditors = parseInt(req.body.max_auditors, 10);
                if (!(nextMaxAuditors >= 1 && nextMaxAuditors <= 100)) return res.status(400).json({ error: 'max_auditors must be between 1 and 100' });
            }
        }
        const rows = await query(
            'UPDATE audit_template SET name = $1, scoring_mode = $2, score_min = $3, score_max = $4, score_step = $5, max_auditors = $6 WHERE id = $7 RETURNING *',
            [name !== undefined && name.trim() ? name.trim() : existing[0].name, nextMode, nextMin, nextMax, nextStep, nextMaxAuditors, req.params.id]
        );
        res.json(rows[0]);
    } catch (e) {
        console.error('update audit template failed:', e.message);
        res.status(500).json({ error: 'Failed to update audit template' });
    }
});
// Add a category to an existing template (for 'categories' / 'categories_questions').
app.post('/api/audit-templates/:id/categories', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { name, photo_required } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isTemplateAdmin(requesterEmpId, role, req.params.id, factoryId))) return res.status(403).json({ error: 'You are not authorized to edit this audit' });
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const ord = await query('SELECT COALESCE(MAX(category_order), -1) + 1 AS next_order FROM audit_template_category WHERE template_id = $1', [req.params.id]);
        const rows = await query(
            'INSERT INTO audit_template_category (template_id, name, category_order, photo_required) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.params.id, name.trim(), ord[0].next_order, !!photo_required]
        );
        res.json(rows[0]);
    } catch (e) {
        console.error('add audit category failed:', e.message);
        res.status(500).json({ error: 'Failed to add category' });
    }
});
// Edit a category, or retire it (is_active: false) — retiring keeps every past submission
// that scored it intact; it just stops appearing on new captures.
app.put('/api/audit-template-categories/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { name, photo_required, is_active } = req.body;
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const existing = await query('SELECT * FROM audit_template_category WHERE id = $1', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Category not found' });
        if (!(await isTemplateAdmin(requesterEmpId, role, existing[0].template_id, factoryId))) return res.status(403).json({ error: 'You are not authorized to edit this audit' });
        const merged = {
            name: name !== undefined && name.trim() ? name.trim() : existing[0].name,
            photo_required: photo_required !== undefined ? !!photo_required : existing[0].photo_required,
            is_active: is_active !== undefined ? !!is_active : existing[0].is_active,
        };
        const rows = await query(
            'UPDATE audit_template_category SET name = $1, photo_required = $2, is_active = $3 WHERE id = $4 RETURNING *',
            [merged.name, merged.photo_required, merged.is_active, req.params.id]
        );
        res.json(rows[0]);
    } catch (e) {
        console.error('update audit category failed:', e.message);
        res.status(500).json({ error: 'Failed to update category' });
    }
});
// Add a question to an existing template — separate from retiring one, so a template can
// evolve (drop a stale question, add its replacement) without ever touching old submissions.
app.post('/api/audit-templates/:id/questions', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { question_text, category_id, question_order, photo_required } = req.body;
    if (!question_text || !question_text.trim()) return res.status(400).json({ error: 'question_text is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isTemplateAdmin(requesterEmpId, role, req.params.id, factoryId))) return res.status(403).json({ error: 'You are not authorized to edit this audit' });
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const tpl = await query('SELECT structure FROM audit_template WHERE id = $1', [req.params.id]);
        if (!tpl[0]) return res.status(404).json({ error: 'Template not found' });
        let catId = null, catName = null;
        if (tpl[0].structure === 'categories_questions') {
            if (!category_id) return res.status(400).json({ error: 'category_id is required for this audit' });
            const cat = await query('SELECT id, name FROM audit_template_category WHERE id = $1 AND template_id = $2 AND is_active = true', [category_id, req.params.id]);
            if (!cat[0]) return res.status(400).json({ error: 'category_id does not belong to this audit' });
            catId = cat[0].id; catName = cat[0].name;
        }
        const orderRows = question_order === undefined
            ? await query('SELECT COALESCE(MAX(question_order), -1) + 1 AS next_order FROM audit_template_question WHERE template_id = $1', [req.params.id])
            : null;
        const order = question_order ?? orderRows[0].next_order;
        const rows = await query(
            'INSERT INTO audit_template_question (template_id, question_text, question_order, category, category_id, photo_required) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [req.params.id, question_text.trim(), order, catName, catId, !!photo_required]
        );
        return res.json(rows[0]);
    } catch (e) {
        console.error('add audit question failed:', e.message);
        res.status(500).json({ error: 'Failed to add question' });
    }
});
// Edit a question, or retire it (is_active: false) -- retiring never deletes the row, so
// every past submission that scored this question keeps its history intact; a retired
// question just stops appearing on new templates/captures (GETs already filter is_active).
app.put('/api/audit-template-questions/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { question_text, category_id, photo_required, is_active } = req.body;
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!pool) return res.status(503).json({ error: 'Database unavailable' });
        const existing = await query('SELECT * FROM audit_template_question WHERE id = $1', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Question not found' });
        if (!(await isTemplateAdmin(requesterEmpId, role, existing[0].template_id, factoryId))) return res.status(403).json({ error: 'You are not authorized to edit this audit' });
        let nextCatId = existing[0].category_id, nextCatName = existing[0].category;
        if (category_id !== undefined && category_id !== existing[0].category_id) {
            if (category_id === null) { nextCatId = null; nextCatName = null; }
            else {
                const cat = await query('SELECT id, name FROM audit_template_category WHERE id = $1 AND template_id = $2 AND is_active = true', [category_id, existing[0].template_id]);
                if (!cat[0]) return res.status(400).json({ error: 'category_id does not belong to this audit' });
                nextCatId = cat[0].id; nextCatName = cat[0].name;
            }
        }
        const merged = {
            question_text: question_text !== undefined ? question_text.trim() : existing[0].question_text,
            photo_required: photo_required !== undefined ? !!photo_required : existing[0].photo_required,
            is_active: is_active !== undefined ? !!is_active : existing[0].is_active,
        };
        const rows = await query(
            'UPDATE audit_template_question SET question_text = $1, category = $2, category_id = $3, photo_required = $4, is_active = $5 WHERE id = $6 RETURNING *',
            [merged.question_text, nextCatName, nextCatId, merged.photo_required, merged.is_active, req.params.id]
        );
        return res.json(rows[0]);
    } catch (e) {
        console.error('update audit question failed:', e.message);
        res.status(500).json({ error: 'Failed to update question' });
    }
});
// Delete a whole audit type — soft-delete only (is_active = false), so every past
// submission it produced keeps referencing it unchanged. Its active schedules are
// deactivated in the same step (a dead audit type must not keep generating occurrences).
// Full audit capability only (true BE-lead or a Global Audit Admin).
app.delete('/api/audit-templates/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to delete an audit type' });
        if (pool) {
            const existing = await query('SELECT * FROM audit_template WHERE id = $1', [req.params.id]);
            if (!existing[0]) return res.status(404).json({ error: 'Audit type not found' });
            if (existing[0].factory_id !== factoryId) return res.status(403).json({ error: 'This audit type belongs to a different plant' });
            await query('UPDATE audit_template SET is_active = false WHERE id = $1', [req.params.id]);
            const deactivated = await query('UPDATE audit_schedule SET is_active = false WHERE template_id = $1 AND is_active = true RETURNING id', [req.params.id]);
            await query(
                'INSERT INTO audit_audit_trail (template_id, action, actor_emp_id, changed_fields) VALUES ($1, $2, $3, $4)',
                [req.params.id, 'template_deleted', requesterEmpId, JSON.stringify({ name: existing[0].name, schedules_deactivated: deactivated.length })]
            );
            return res.json({ ok: true, schedules_deactivated: deactivated.length });
        }
        res.status(404).json({ error: 'Audit type not found' });
    } catch {
        res.status(500).json({ error: 'Failed to delete audit type' });
    }
});

// Schedules
app.get('/api/audit-schedules', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (pool) {
            const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
            const isBeLead = await isFullAuditAdmin(requesterEmpId, role, factoryId);
            // A schedule is visible to: a full audit admin (everything); its own named
            // admin_emp_id; the admin of that schedule's template (per-template, not
            // factory-wide); or anyone actually assigned as an auditor on it (so "My
            // Audits" shows only their own).
            const sql = isBeLead
                ? `SELECT s.*, t.name AS template_name, t.max_auditors, z.name AS zone_name, au.name AS admin_name
           FROM audit_schedule s JOIN audit_template t ON t.id = s.template_id JOIN zone z ON z.id = s.zone_id
           JOIN user_details au ON au.emp_id = s.admin_emp_id
           WHERE s.factory_id = $1 AND s.is_active = true ORDER BY s.created_at DESC`
                : `SELECT s.*, t.name AS template_name, t.max_auditors, z.name AS zone_name, au.name AS admin_name
           FROM audit_schedule s JOIN audit_template t ON t.id = s.template_id JOIN zone z ON z.id = s.zone_id
           JOIN user_details au ON au.emp_id = s.admin_emp_id
           WHERE s.factory_id = $1 AND s.is_active = true AND (
             s.admin_emp_id = $2
             OR EXISTS (SELECT 1 FROM audit_template_admin ta WHERE ta.template_id = s.template_id AND ta.emp_id = $2)
             OR EXISTS (SELECT 1 FROM audit_schedule_auditor sa WHERE sa.schedule_id = s.id AND sa.emp_id = $2)
           ) ORDER BY s.created_at DESC`;
            const schedules = await query(sql, isBeLead ? [factoryId] : [factoryId, requesterEmpId]);
            const auditors = schedules.length
                ? await query(
                    `SELECT sa.schedule_id, sa.emp_id, u.name, u.role,
                    d.name AS department,
                    (SELECT jg.name FROM jh_groups_list jgl JOIN jh_group jg ON jg.id = jgl.jh_group_id
                     WHERE jgl.emp_id = sa.emp_id ORDER BY jgl.created_at ASC LIMIT 1) AS jh_group
             FROM audit_schedule_auditor sa
             JOIN user_details u ON u.emp_id = sa.emp_id
             LEFT JOIN departments d ON d.id = u.department_id
             WHERE sa.schedule_id = ANY($1::uuid[])
             ORDER BY u.name ASC`,
                    [schedules.map((s) => s.id)]
                )
                : [];
            const byBySchedule = {};
            auditors.forEach(a => { (byBySchedule[a.schedule_id] ||= []).push(a); });
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const todayStr = auditToDateOnly(today);
            // MY scorecards on these schedules: my open (pending) one per schedule, and the
            // latest occurrence date I've personally submitted (so "next" rolls past it for me).
            const mineRows = schedules.length
                ? await query(
                    `SELECT s.schedule_id, s.id, s.status, s.due_date
             FROM audit_submission s
             WHERE s.schedule_id = ANY($1::uuid[])
               AND (s.started_by_emp_id = $2 OR s.submitted_by_emp_id = $2)`,
                    [schedules.map((x) => x.id), requesterEmpId]
                )
                : [];
            const myOpen = {}, myDoneById = {};
            mineRows.forEach((r) => {
                const dd = String(r.due_date).slice(0, 10);
                if (r.status !== 'submitted') myOpen[r.schedule_id] = myOpen[r.schedule_id] || r;
                else (myDoneById[r.schedule_id] ||= {})[dd] = r.id;
            });
            return res.json(schedules.map((s) => {
                const auditorIds = (byBySchedule[s.id] || []).map((a) => a.emp_id);
                const isMine = auditorIds.includes(requesterEmpId) || s.admin_emp_id === requesterEmpId;
                const doneDates = Object.keys(myDoneById[s.id] || {});
                const latestDone = doneDates.sort().pop() || null;
                const fromStr = latestDone && latestDone >= todayStr
                    ? auditToDateOnly(auditAddDays(auditParseDateOnly(latestDone), 1))
                    : todayStr;
                const next = nextAuditOccurrence(s, auditParseDateOnly(fromStr));
                // The occurrence date "now" (not rolled past my done) — is it one I've submitted?
                const currentDate = nextAuditOccurrence(s, today);
                const myCurrentDone = currentDate ? (myDoneById[s.id] || {})[currentDate] : null;
                return {
                    ...s,
                    auditors: byBySchedule[s.id] || [],
                    next_occurrence: next,
                    current_occurrence: currentDate,
                    is_my_audit: isMine,
                    open_submission_id: myOpen[s.id]?.id || null,
                    my_current_submission_id: myCurrentDone || null,
                };
            }));
        }
        res.json(mockDb.auditSchedules);
    } catch {
        res.status(500).json({ error: 'Failed to fetch audit schedules' });
    }
});
app.post('/api/audit-schedules', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { template_id, zone_id, auditor_emp_ids, admin_emp_id } = req.body;
    if (!template_id || !zone_id) return res.status(400).json({ error: 'template_id and zone_id are required' });
    if (!admin_emp_id) return res.status(400).json({ error: 'An Audit Admin for this schedule is required' });
    const rec = normaliseAuditRecurrence(req.body);
    if (rec.error) return res.status(400).json({ error: rec.error });
    const R = rec.value;
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isTemplateAdmin(requesterEmpId, role, template_id, factoryId))) return res.status(403).json({ error: 'You are not authorized to schedule this audit' });
        const capErr = await auditAuditorCapError(template_id, admin_emp_id, [], Array.isArray(auditor_emp_ids) ? auditor_emp_ids : []);
        if (capErr) return res.status(409).json({ error: capErr });
        if (pool) {
            const rows = await query(
                `INSERT INTO audit_schedule
           (template_id, zone_id, factory_id, created_by_emp_id, admin_emp_id,
            recurrence, specific_date, freq, recur_interval, weekdays, day_of_month, start_date, end_type, end_date, occurrence_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
                [template_id, zone_id, factoryId, requesterEmpId, admin_emp_id,
                    legacyAuditRecurrence(R), R.freq === 'once' ? R.start_date : null,
                    R.freq, R.recur_interval, R.weekdays, R.day_of_month, R.start_date, R.end_type, R.end_date, R.occurrence_count]
            );
            const schedule = rows[0];
            const auditorIds = Array.isArray(auditor_emp_ids) ? auditor_emp_ids : [];
            const addedAuditors = [];
            for (const empId of auditorIds) {
                const aRows = await query(
                    'INSERT INTO audit_schedule_auditor (schedule_id, emp_id, assigned_by_emp_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
                    [schedule.id, empId, requesterEmpId]
                );
                if (aRows[0]) addedAuditors.push(aRows[0]);
            }
            for (const a of addedAuditors) {
                await notify(a.emp_id, {
                    kind: 'audit_assigned', module: 'audit', entityId: schedule.id, createdBy: requesterEmpId,
                    title: 'You were added as an auditor', body: 'You have been added to a scheduled audit.',
                });
            }
            const today0 = new Date(); today0.setHours(0, 0, 0, 0);
            return res.json({ ...schedule, auditors: addedAuditors, next_occurrence: nextAuditOccurrence(schedule, today0) });
        }
        const schedule = { id: `sched-${Date.now()}`, template_id, zone_id, factory_id: factoryId, ...R, recurrence: legacyAuditRecurrence(R), is_active: true, created_by_emp_id: requesterEmpId, created_at: new Date().toISOString() };
        mockDb.auditSchedules.push(schedule);
        res.json({ ...schedule, auditors: [] });
    } catch (e) {
        console.error('create audit schedule failed:', e.message);
        res.status(500).json({ error: 'Failed to create audit schedule' });
    }
});
app.put('/api/audit-schedules/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { zone_id, admin_emp_id } = req.body;
    const rec = normaliseAuditRecurrence(req.body);
    if (rec.error) return res.status(400).json({ error: rec.error });
    const R = rec.value;
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!pool) return res.status(404).json({ error: 'Schedule not found' });
        const existing = await query('SELECT template_id, admin_emp_id, zone_id FROM audit_schedule WHERE id = $1', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Schedule not found' });
        if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, existing[0]))) return res.status(403).json({ error: 'You are not authorized to edit this schedule' });
        // Zone (and the Audit Admin) are audit-wide master data — only a full audit admin or
        // the audit type's admin may change them. A per-schedule Audit Admin edits recurrence
        // / dates only; their zone_id in the payload is ignored.
        const canChangeZone = await isTemplateAdmin(requesterEmpId, role, existing[0].template_id, factoryId);
        const effectiveZoneId = canChangeZone ? (zone_id || existing[0].zone_id) : existing[0].zone_id;
        const rows = await query(
            `UPDATE audit_schedule SET zone_id = $1, admin_emp_id = $2,
               recurrence = $3, specific_date = $4, freq = $5, recur_interval = $6, weekdays = $7,
               day_of_month = $8, start_date = $9, end_type = $10, end_date = $11, occurrence_count = $12
             WHERE id = $13 RETURNING *`,
            [effectiveZoneId, (canChangeZone && admin_emp_id) ? admin_emp_id : existing[0].admin_emp_id,
                legacyAuditRecurrence(R), R.freq === 'once' ? R.start_date : null,
                R.freq, R.recur_interval, R.weekdays, R.day_of_month, R.start_date, R.end_type, R.end_date, R.occurrence_count,
                req.params.id]
        );
        const today0 = new Date(); today0.setHours(0, 0, 0, 0);
        return res.json({ ...rows[0], next_occurrence: nextAuditOccurrence(rows[0], today0) });
    } catch (e) {
        console.error('update audit schedule failed:', e.message);
        res.status(500).json({ error: 'Failed to update audit schedule' });
    }
});
// Delete one schedule — soft-delete (is_active = false) so it stops generating new
// occurrences; every submission it already produced stays intact and visible.
// Its own named admin, a template admin, or a full audit admin may do this.
app.delete('/api/audit-schedules/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (pool) {
            const existing = await query('SELECT id, factory_id, template_id, admin_emp_id FROM audit_schedule WHERE id = $1', [req.params.id]);
            if (!existing[0]) return res.status(404).json({ error: 'Schedule not found' });
            if (existing[0].factory_id !== factoryId) return res.status(403).json({ error: 'This schedule belongs to a different plant' });
            if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, existing[0]))) return res.status(403).json({ error: 'You are not authorized to delete this schedule' });
            await query('UPDATE audit_schedule SET is_active = false WHERE id = $1', [req.params.id]);
            await query(
                'INSERT INTO audit_audit_trail (template_id, action, actor_emp_id, changed_fields) VALUES ($1, $2, $3, $4)',
                [existing[0].template_id, 'schedule_deleted', requesterEmpId, JSON.stringify({ schedule_id: req.params.id })]
            );
            return res.json({ ok: true });
        }
        res.status(404).json({ error: 'Schedule not found' });
    } catch {
        res.status(500).json({ error: 'Failed to delete audit schedule' });
    }
});
app.post('/api/audit-schedules/:id/auditors', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { emp_id, copy_from_schedule_id } = req.body;
    if (!emp_id && !copy_from_schedule_id) return res.status(400).json({ error: 'emp_id or copy_from_schedule_id is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (pool) {
            const scheduleRows = await query('SELECT zone_id, template_id, admin_emp_id FROM audit_schedule WHERE id = $1', [req.params.id]);
            if (!scheduleRows[0]) return res.status(404).json({ error: 'Schedule not found' });
            if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, scheduleRows[0]))) return res.status(403).json({ error: 'You are not authorized to assign auditors for this audit' });
            const zoneId = scheduleRows[0].zone_id;
            const currentAuditors = (await query('SELECT emp_id FROM audit_schedule_auditor WHERE schedule_id = $1', [req.params.id])).map((r) => r.emp_id);
            if (copy_from_schedule_id) {
                const source = await query('SELECT emp_id FROM audit_schedule_auditor WHERE schedule_id = $1', [copy_from_schedule_id]);
                const capErr = await auditAuditorCapError(scheduleRows[0].template_id, scheduleRows[0].admin_emp_id, currentAuditors, source.map((r) => r.emp_id));
                if (capErr) return res.status(409).json({ error: capErr });
                const added = [];
                let skippedHomeZone = 0;
                for (const row of source) {
                    if (await isHomeZoneConflict(row.emp_id, zoneId)) { skippedHomeZone++; continue; }
                    const inserted = await query(
                        'INSERT INTO audit_schedule_auditor (schedule_id, emp_id, assigned_by_emp_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
                        [req.params.id, row.emp_id, requesterEmpId]
                    );
                    if (inserted[0]) added.push(inserted[0]);
                }
                return res.json({ copied: added.length, skipped_home_zone: skippedHomeZone, auditors: added });
            }
            if (await isHomeZoneConflict(emp_id, zoneId)) {
                return res.status(409).json({ error: 'This is their home zone — they cannot be assigned to audit it' });
            }
            if (!currentAuditors.includes(emp_id)) {
                const capErr = await auditAuditorCapError(scheduleRows[0].template_id, scheduleRows[0].admin_emp_id, currentAuditors, [emp_id]);
                if (capErr) return res.status(409).json({ error: capErr });
            }
            const rows = await query(
                'INSERT INTO audit_schedule_auditor (schedule_id, emp_id, assigned_by_emp_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
                [req.params.id, emp_id, requesterEmpId]
            );
            if (rows[0]) {
                await notify(emp_id, {
                    kind: 'audit_assigned', module: 'audit', entityId: req.params.id, createdBy: requesterEmpId,
                    title: 'You were added as an auditor', body: 'You have been added to a scheduled audit.',
                });
            }
            return res.json(rows[0] || { schedule_id: req.params.id, emp_id, already_assigned: true });
        }
        res.json({ schedule_id: req.params.id, emp_id, assigned_by_emp_id: requesterEmpId, assigned_at: new Date().toISOString() });
    } catch {
        res.status(500).json({ error: 'Failed to assign auditor' });
    }
});
app.delete('/api/audit-schedules/:id/auditors/:empId', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (pool) {
            const scheduleRows = await query('SELECT template_id, admin_emp_id FROM audit_schedule WHERE id = $1', [req.params.id]);
            if (!scheduleRows[0]) return res.status(404).json({ error: 'Schedule not found' });
            if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, scheduleRows[0]))) return res.status(403).json({ error: 'You are not authorized to remove auditors for this audit' });
            await query('DELETE FROM audit_schedule_auditor WHERE schedule_id = $1 AND emp_id = $2', [req.params.id, req.params.empId]);

            // Removing someone mid-audit is the normal way to unblock an occurrence they can't
            // finish (off sick, shift ended). Two things have to follow, or the audit sits open
            // for a person who is no longer on it:
            //   1. bin their unfinished scorecard — an already-SUBMITTED one is kept, that work
            //      is real and still counts toward the combined score;
            //   2. re-evaluate every open occurrence of this schedule, so it closes right away
            //      if everyone still on the list has already submitted.
            const openOccs = await query(
                "SELECT id FROM audit_occurrence WHERE schedule_id = $1 AND status = 'open'",
                [req.params.id]
            );
            for (const o of openOccs) {
                await query(
                    "DELETE FROM audit_response WHERE submission_id IN (SELECT id FROM audit_submission WHERE occurrence_id = $1 AND started_by_emp_id = $2 AND status <> 'submitted')",
                    [o.id, req.params.empId]
                ).catch(() => {});
                await query(
                    "DELETE FROM audit_submission WHERE occurrence_id = $1 AND started_by_emp_id = $2 AND status <> 'submitted'",
                    [o.id, req.params.empId]
                ).catch(() => {});
                await recomputeAuditOccurrence(o.id);
            }
        }
        res.json({ ok: true });
    } catch (e) {
        console.error('remove auditor failed:', e.message);
        res.status(500).json({ error: 'Failed to remove auditor' });
    }
});

// Self-check: tells the UI whether to show the Configure tab at all, and which specific
// templates this person can configure — never exposes anyone else's assignment. A true
// BE-lead gets isBeLead:true (implicit access to every template, not enumerated here).
app.get('/api/audit-admins/me', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        const isTrueBeLead = BE_LEAD_ROLES.has(role);
        const isGlobalAdmin = isTrueBeLead ? false : await isGlobalAuditAdmin(requesterEmpId, factoryId);
        const isBeLead = isTrueBeLead || isGlobalAdmin; // "full" audit capability, kept as isBeLead for backward compatibility
        const adminTemplateIds = isBeLead ? [] : await getAdminTemplateIds(requesterEmpId);
        // Being the named admin_emp_id on any active schedule (tier 4) also opens the
        // Configure tab — so a per-schedule admin can manage that schedule's auditors.
        const schedAdminRows = isBeLead ? [] : await query(
            'SELECT 1 FROM audit_schedule s WHERE s.admin_emp_id = $1 AND s.is_active = true AND s.factory_id = $2 LIMIT 1',
            [requesterEmpId, factoryId]
        );
        const isScheduleAdmin = schedAdminRows.length > 0;
        res.json({
            isBeLead, isGlobalAdmin, adminTemplateIds, isScheduleAdmin,
            isAuditAdmin: isBeLead || adminTemplateIds.length > 0 || isScheduleAdmin,
        });
    } catch {
        res.status(500).json({ error: 'Failed to check audit admin status' });
    }
});
// Per-template admin roster (5S Admin delegation) — strictly BE_LEAD_ROLES, and scoped to
// ONE template, never factory-wide. An appointed template admin cannot appoint anyone,
// including on their own template.
app.get('/api/audit-templates/:id/admins', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to view this audit\'s admins' });
        if (pool) {
            const rows = await query(
                `SELECT a.emp_id, u.name, u.role, a.assigned_at, a.assigned_by_emp_id, b.name AS assigned_by_name
         FROM audit_template_admin a
         JOIN user_details u ON u.emp_id = a.emp_id
         LEFT JOIN user_details b ON b.emp_id = a.assigned_by_emp_id
         WHERE a.template_id = $1 ORDER BY u.name`,
                [req.params.id]
            );
            return res.json(rows);
        }
        res.json([]);
    } catch {
        res.status(500).json({ error: 'Failed to fetch admins' });
    }
});
app.post('/api/audit-templates/:id/admins', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { emp_id } = req.body;
    if (!emp_id) return res.status(400).json({ error: 'emp_id is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to appoint an admin for this audit' });
        if (pool) {
            const rows = await query(
                'INSERT INTO audit_template_admin (template_id, emp_id, assigned_by_emp_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
                [req.params.id, emp_id, requesterEmpId]
            );
            return res.json(rows[0] || { template_id: req.params.id, emp_id, already_assigned: true });
        }
        res.json({ template_id: req.params.id, emp_id });
    } catch {
        res.status(500).json({ error: 'Failed to appoint admin' });
    }
});
app.delete('/api/audit-templates/:id/admins/:empId', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to remove an admin from this audit' });
        if (pool) {
            await query('DELETE FROM audit_template_admin WHERE template_id = $1 AND emp_id = $2', [req.params.id, req.params.empId]);
        }
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to remove admin' });
    }
});

// Global 5S Admins — strictly BE_LEAD_ROLES to appoint/remove, same as per-template
// admins. A Global 5S Admin gets full audit capability (create/configure/schedule ANY
// audit) without touching their user_details.role, but cannot appoint anyone else.
app.get('/api/audit-global-admins', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!BE_LEAD_ROLES.has(role)) return res.status(403).json({ error: 'You are not authorized to view global 5S admins' });
        if (pool) {
            const rows = await query(
                `SELECT a.emp_id, u.name, u.role, a.assigned_at, a.assigned_by_emp_id,
                b.name AS assigned_by_name
         FROM audit_global_admin a
         JOIN user_details u ON u.emp_id = a.emp_id
         LEFT JOIN user_details b ON b.emp_id = a.assigned_by_emp_id
         WHERE a.factory_id = $1 ORDER BY u.name`,
                [factoryId]
            );
            return res.json(rows);
        }
        res.json([]);
    } catch {
        res.status(500).json({ error: 'Failed to fetch global 5S admins' });
    }
});
app.post('/api/audit-global-admins', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { emp_id } = req.body;
    if (!emp_id) return res.status(400).json({ error: 'emp_id is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!BE_LEAD_ROLES.has(role)) return res.status(403).json({ error: 'You are not authorized to appoint a global 5S admin' });
        if (pool) {
            const rows = await query(
                'INSERT INTO audit_global_admin (factory_id, emp_id, assigned_by_emp_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
                [factoryId, emp_id, requesterEmpId]
            );
            return res.json(rows[0] || { factory_id: factoryId, emp_id, already_assigned: true });
        }
        res.json({ factory_id: factoryId, emp_id });
    } catch {
        res.status(500).json({ error: 'Failed to appoint global 5S admin' });
    }
});
app.delete('/api/audit-global-admins/:empId', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!BE_LEAD_ROLES.has(role)) return res.status(403).json({ error: 'You are not authorized to remove a global 5S admin' });
        if (pool) {
            await query('DELETE FROM audit_global_admin WHERE factory_id = $1 AND emp_id = $2', [factoryId, req.params.empId]);
        }
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to remove global 5S admin' });
    }
});

// Submissions
app.get('/api/audit-submissions', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (pool) {
            const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
            const isBeLead = await isFullAuditAdmin(requesterEmpId, role, factoryId);
            // A scorecard is "mine" only if I started it or submitted it. (Each auditor fills
            // their own; a pending scorecard belongs to whoever hit Start.)
            const mineExpr = `(s.started_by_emp_id = $2 OR s.submitted_by_emp_id = $2)`;
            const cols = `SELECT s.*, t.name AS template_name, z.name AS zone_name, sc.admin_emp_id,
              o.status AS occurrence_status, o.combined_score, o.combined_max,
              o.submitted_count, o.expected_count,
              su.name AS started_by_name, sb.name AS submitted_by_name,
              ${mineExpr} AS is_mine
       FROM audit_submission s
       JOIN audit_template t ON t.id = s.template_id JOIN zone z ON z.id = s.zone_id
       JOIN audit_schedule sc ON sc.id = s.schedule_id
       LEFT JOIN audit_occurrence o ON o.id = s.occurrence_id
       LEFT JOIN user_details su ON su.emp_id = s.started_by_emp_id
       LEFT JOIN user_details sb ON sb.emp_id = s.submitted_by_emp_id`;
            const sql = isBeLead
                ? `${cols} WHERE s.factory_id = $1 ORDER BY s.due_date DESC`
                : `${cols} WHERE s.factory_id = $1 AND (
             ${mineExpr}
             OR EXISTS (SELECT 1 FROM audit_template_admin ta WHERE ta.template_id = s.template_id AND ta.emp_id = $2)
           ) ORDER BY s.due_date DESC`;
            const rows = await query(sql, [factoryId, requesterEmpId]);
            return res.json(rows);
        }
        res.json(mockDb.auditSubmissions);
    } catch {
        res.status(500).json({ error: 'Failed to fetch audit submissions' });
    }
});
app.post('/api/audit-submissions', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { schedule_id, due_date } = req.body;
    if (!schedule_id) return res.status(400).json({ error: 'schedule_id is required' });
    try {
        if (pool) {
            const scheduleRows = await query('SELECT * FROM audit_schedule WHERE id = $1', [schedule_id]);
            const schedule = scheduleRows[0];
            if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
            const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
            const isFull = await isFullAuditAdmin(requesterEmpId, role, factoryId);
            // Only an assigned auditor or this schedule's own Audit Admin may start filling in
            // an audit. Creating the schedule, or being a template-wide / BE-lead admin, is not
            // enough (a full audit admin may still pre-create for assignment purposes).
            const isAuditor = await query('SELECT 1 FROM audit_schedule_auditor WHERE schedule_id = $1 AND emp_id = $2', [schedule_id, requesterEmpId]);
            const mayStart = isFull || schedule.admin_emp_id === requesterEmpId || isAuditor.length > 0;
            if (!mayStart) return res.status(403).json({ error: 'Only an assigned auditor or this schedule\'s Audit Admin can start this audit' });
            // The auditor's OWN next due date — roll past occurrences they've already submitted.
            const today0 = new Date(); today0.setHours(0, 0, 0, 0);
            const todayStr0 = auditToDateOnly(today0);
            const myDone = await query(
                `SELECT o.due_date FROM audit_submission s JOIN audit_occurrence o ON o.id = s.occurrence_id
         WHERE o.schedule_id = $1 AND s.status = 'submitted' AND s.submitted_by_emp_id = $2
         ORDER BY o.due_date DESC LIMIT 1`,
                [schedule_id, requesterEmpId]
            );
            let fromStr = todayStr0;
            if (myDone[0] && String(myDone[0].due_date).slice(0, 10) >= todayStr0) {
                const d = auditParseDateOnly(String(myDone[0].due_date).slice(0, 10));
                fromStr = auditToDateOnly(auditAddDays(d, 1));
            }
            const occDate = nextAuditOccurrence(schedule, auditParseDateOnly(fromStr)) || due_date || todayStr0;
            // An auditor / schedule-admin can't open it before it's due; a full admin can.
            if (!isFull && occDate > todayStr0) {
                return res.status(409).json({ error: `This audit isn't due until ${occDate}` });
            }
            const occurrence = await getOrCreateAuditOccurrence(schedule, occDate);
            if (occurrence.status === 'closed') return res.status(409).json({ error: 'This audit occurrence has been closed.' });
            // Find-or-create MY scorecard under this occurrence.
            const mine = await query(
                `SELECT * FROM audit_submission WHERE occurrence_id = $1 AND started_by_emp_id = $2 AND status <> 'submitted' LIMIT 1`,
                [occurrence.id, requesterEmpId]
            );
            if (mine[0]) return res.json(mine[0]);
            const rows = await query(
                `INSERT INTO audit_submission (schedule_id, template_id, zone_id, factory_id, due_date, occurrence_id, started_by_emp_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [schedule.id, schedule.template_id, schedule.zone_id, schedule.factory_id, occDate, occurrence.id, requesterEmpId]
            );
            await recomputeAuditOccurrence(occurrence.id);
            return res.json(rows[0]);
        }
        const submission = { id: `sub-${Date.now()}`, schedule_id, due_date, status: 'pending', created_at: new Date().toISOString() };
        mockDb.auditSubmissions.push(submission);
        res.json(submission);
    } catch {
        res.status(500).json({ error: 'Failed to start audit submission' });
    }
});
app.get('/api/audit-submissions/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        if (pool) {
            const subRows = await query(
                `SELECT s.*, t.name AS template_name, t.structure, t.scoring_mode, t.score_min, t.score_max, t.score_step,
                z.name AS zone_name, sc.admin_emp_id, sc.template_id AS schedule_template_id
         FROM audit_submission s
         JOIN audit_template t ON t.id = s.template_id JOIN zone z ON z.id = s.zone_id
         JOIN audit_schedule sc ON sc.id = s.schedule_id WHERE s.id = $1`,
                [req.params.id]
            );
            if (!subRows[0]) return res.status(404).json({ error: 'Submission not found' });
            const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
            const canManage = await isScheduleAdmin(requesterEmpId, role, factoryId, subRows[0]);
            // Closing early is now the audit's own Audit Admin's call, same tier as managing it.
            const canClose = canManage;
            const questions = await query(
                'SELECT * FROM audit_template_question WHERE template_id = $1 AND is_active = true ORDER BY question_order ASC',
                [subRows[0].template_id]
            );
            const categories = await query(
                'SELECT * FROM audit_template_category WHERE template_id = $1 AND is_active = true ORDER BY category_order ASC',
                [subRows[0].template_id]
            );
            const responses = await query('SELECT * FROM audit_response WHERE submission_id = $1', [req.params.id]);
            const respPhotos = responses.length
                ? await query('SELECT * FROM audit_response_photo WHERE response_id = ANY($1::uuid[]) ORDER BY photo_order ASC', [responses.map((r) => r.id)])
                : [];
            const photosByResponse = {};
            respPhotos.forEach((p) => { (photosByResponse[p.response_id] ||= []).push({ photo_url: p.photo_url, caption: p.caption, photo_order: p.photo_order }); });
            responses.forEach((r) => { r.photos = photosByResponse[r.id] || (r.photo_url ? [{ photo_url: r.photo_url, caption: null, photo_order: 0 }] : []); });
            const categoryScores = await query('SELECT * FROM audit_submission_category_score WHERE submission_id = $1', [req.params.id]);
            const overrideAuditors = await query(
                `SELECT sao.emp_id, u.name FROM audit_submission_auditor sao
         JOIN user_details u ON u.emp_id = sao.emp_id WHERE sao.submission_id = $1`,
                [req.params.id]
            );
            const effectiveAuditors = overrideAuditors.length > 0
                ? overrideAuditors
                : await query(
                    `SELECT sa.emp_id, u.name FROM audit_schedule_auditor sa
             JOIN user_details u ON u.emp_id = sa.emp_id WHERE sa.schedule_id = $1`,
                    [subRows[0].schedule_id]
                );
            // Occurrence context: the shared status + combined score, every auditor's scorecard,
            // and the per-category combined average across the submitted scorecards.
            let occurrence = null, scorecards = [], combinedCategories = [];
            if (subRows[0].occurrence_id) {
                occurrence = (await query(
                    `SELECT o.*, cr.name AS close_requested_by_name, cb.name AS closed_by_name
             FROM audit_occurrence o
             LEFT JOIN user_details cr ON cr.emp_id = o.close_requested_by_emp_id
             LEFT JOIN user_details cb ON cb.emp_id = o.closed_by_emp_id
             WHERE o.id = $1`,
                    [subRows[0].occurrence_id]
                ))[0];
                const expected = await auditExpectedAuditors(subRows[0].schedule_id);
                scorecards = await query(
                    `SELECT s.id, s.status, s.total_score, s.max_score, s.submitted_at, s.started_by_emp_id,
                    COALESCE(su.name, sb.name) AS auditor_name
             FROM audit_submission s
             LEFT JOIN user_details su ON su.emp_id = s.started_by_emp_id
             LEFT JOIN user_details sb ON sb.emp_id = s.submitted_by_emp_id
             WHERE s.occurrence_id = $1 ORDER BY s.created_at ASC`,
                    [subRows[0].occurrence_id]
                );
                const doneIds = scorecards.filter((c) => c.status === 'submitted').map((c) => c.started_by_emp_id).filter(Boolean);
                if (expected.length) {
                    const doneSet = new Set(doneIds);
                    const missing = expected.filter((e) => !doneSet.has(e));
                    // Split the stragglers so the close-confirmation can say WHICH kind each is:
                    // someone who never opened the audit vs someone part-way through a scorecard
                    // (whose in-progress work would be discarded by closing now).
                    const startedSet = new Set(
                        scorecards.filter((c) => c.status !== 'submitted').map((c) => c.started_by_emp_id).filter(Boolean)
                    );
                    if (missing.length) {
                        const names = await query('SELECT emp_id, name FROM user_details WHERE emp_id = ANY($1)', [missing]);
                        const nameOf = Object.fromEntries(names.map((n) => [n.emp_id, n.name]));
                        occurrence.missing_auditors = missing.map((e) => nameOf[e] || e);
                        occurrence.in_progress_auditors = missing.filter((e) => startedSet.has(e)).map((e) => nameOf[e] || e);
                        occurrence.not_started_auditors = missing.filter((e) => !startedSet.has(e)).map((e) => nameOf[e] || e);
                    } else {
                        occurrence.missing_auditors = [];
                        occurrence.in_progress_auditors = [];
                        occurrence.not_started_auditors = [];
                    }
                }
                const submittedIds = scorecards.filter((c) => c.status === 'submitted').map((c) => c.id);
                if (submittedIds.length) {
                    const catRows = await query('SELECT category, category_id, avg_score FROM audit_submission_category_score WHERE submission_id = ANY($1::uuid[])', [submittedIds]);
                    const byCat = {};
                    catRows.forEach((r) => { (byCat[r.category_id || r.category] ||= { name: r.category, arr: [] }).arr.push(Number(r.avg_score)); });
                    combinedCategories = Object.values(byCat).map((v) => ({ category: v.name, avg_score: v.arr.reduce((a, b) => a + b, 0) / v.arr.length }));
                }
            }
            return res.json({
                ...subRows[0], questions, categories, responses, category_scores: categoryScores,
                auditors: effectiveAuditors, has_auditor_override: overrideAuditors.length > 0, can_manage: canManage, can_close: canClose,
                occurrence, scorecards, combined_categories: combinedCategories,
                is_audit_admin: subRows[0].admin_emp_id === requesterEmpId,
            });
        }
        res.status(404).json({ error: 'Submission not found' });
    } catch {
        res.status(500).json({ error: 'Failed to fetch audit submission' });
    }
});
// Per-occurrence auditor override — a 5S admin reassigns who audits this specific day's
// submission, leaving the schedule's default pool (and every other occurrence) untouched.
app.post('/api/audit-submissions/:id/auditors', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { emp_id } = req.body;
    if (!emp_id) return res.status(400).json({ error: 'emp_id is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (pool) {
            const subRows = await query(
                `SELECT s.zone_id, s.template_id, sc.admin_emp_id FROM audit_submission s
         JOIN audit_schedule sc ON sc.id = s.schedule_id WHERE s.id = $1`,
                [req.params.id]
            );
            if (!subRows[0]) return res.status(404).json({ error: 'Submission not found' });
            if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, subRows[0]))) return res.status(403).json({ error: 'You are not authorized to reassign auditors for this audit' });
            if (await isHomeZoneConflict(emp_id, subRows[0].zone_id)) {
                return res.status(409).json({ error: 'This is their home zone — they cannot be assigned to audit it' });
            }
            const currentOverride = (await query('SELECT emp_id FROM audit_submission_auditor WHERE submission_id = $1', [req.params.id])).map((r) => r.emp_id);
            if (!currentOverride.includes(emp_id)) {
                const capErr = await auditAuditorCapError(subRows[0].template_id, subRows[0].admin_emp_id, currentOverride, [emp_id]);
                if (capErr) return res.status(409).json({ error: capErr });
            }
            const rows = await query(
                'INSERT INTO audit_submission_auditor (submission_id, emp_id, assigned_by_emp_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *',
                [req.params.id, emp_id, requesterEmpId]
            );
            if (rows[0]) {
                await notify(emp_id, {
                    kind: 'audit_assigned', module: 'audit', entityId: req.params.id, createdBy: requesterEmpId,
                    title: 'You were assigned an audit', body: "You have been assigned to a specific day's audit.",
                });
            }
            return res.json(rows[0] || { submission_id: req.params.id, emp_id, already_assigned: true });
        }
        res.status(404).json({ error: 'Submission not found' });
    } catch {
        res.status(500).json({ error: 'Failed to reassign auditor' });
    }
});
app.delete('/api/audit-submissions/:id/auditors/:empId', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (pool) {
            const subRows = await query(
                `SELECT s.template_id, sc.admin_emp_id FROM audit_submission s
         JOIN audit_schedule sc ON sc.id = s.schedule_id WHERE s.id = $1`,
                [req.params.id]
            );
            if (!subRows[0]) return res.status(404).json({ error: 'Submission not found' });
            if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, subRows[0]))) return res.status(403).json({ error: 'You are not authorized to reassign auditors for this audit' });
            await query('DELETE FROM audit_submission_auditor WHERE submission_id = $1 AND emp_id = $2', [req.params.id, req.params.empId]);
        }
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Failed to remove auditor override' });
    }
});
// Save a draft or submit an audit occurrence. Body:
//   { draft: bool,
//     responses: [ { question_id?, category_id?, score?, remarks?, photos: [{photo_url, caption}] } ] }
// Each response targets one item: a question (structure 'questions'/'categories_questions')
// or a category directly (structure 'categories'). Scoring depends on the template's
// scoring_mode ('required' = every active item scored; 'optional' = may skip; 'off' = no
// scores). Any score given must sit on the template's scale (min..max, step). An item whose
// photo_required flag is set needs >= 1 photo on a final submit; there is no cap on photos
// and no automatic low-score photo rule any more. Draft skips the completeness checks.
app.put('/api/audit-submissions/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { responses, draft } = req.body;
    if (!Array.isArray(responses)) return res.status(400).json({ error: 'responses is required' });
    if (!pool) return res.status(404).json({ error: 'Submission not found' });
    try {
        const subMeta = await query(
            `SELECT s.*, t.structure, t.scoring_mode, t.score_min, t.score_max, t.score_step
       FROM audit_submission s JOIN audit_template t ON t.id = s.template_id WHERE s.id = $1`,
            [req.params.id]
        );
        const sub = subMeta[0];
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.status === 'submitted') return res.status(409).json({ error: 'This audit has already been submitted' });
        // This scorecard belongs to whoever started it.
        if (sub.started_by_emp_id && sub.started_by_emp_id !== requesterEmpId) {
            const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
            if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) {
                return res.status(403).json({ error: 'This scorecard belongs to another auditor' });
            }
        }
        if (sub.occurrence_id) {
            const occ = (await query('SELECT status FROM audit_occurrence WHERE id = $1', [sub.occurrence_id]))[0];
            if (occ && occ.status === 'closed') return res.status(409).json({ error: 'This audit occurrence has been closed.' });
        }

        const scoreMin = Number(sub.score_min), scoreMax = Number(sub.score_max), scoreStep = Number(sub.score_step);
        const scoresEnabled = sub.scoring_mode !== 'off';
        const usesCategories = sub.structure === 'categories';
        const questions = await query('SELECT id, category_id, photo_required FROM audit_template_question WHERE template_id = $1 AND is_active = true', [sub.template_id]);
        const categories = await query('SELECT id, name, photo_required FROM audit_template_category WHERE template_id = $1 AND is_active = true', [sub.template_id]);
        const questionById = Object.fromEntries(questions.map((q) => [q.id, q]));
        const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
        const catNameById = Object.fromEntries(categories.map((c) => [c.id, c.name]));

        // Items every response must map onto, and which ones require a photo.
        const items = usesCategories
            ? categories.map((c) => ({ key: c.id, kind: 'category', photo_required: c.photo_required }))
            : questions.map((q) => ({ key: q.id, kind: 'question', photo_required: q.photo_required }));
        const itemKeys = new Set(items.map((i) => i.key));

        // Normalise + validate each incoming response.
        const norm = [];
        for (const r of responses) {
            const isCat = usesCategories;
            const key = isCat ? r.category_id : r.question_id;
            if (!key || !itemKeys.has(key)) return res.status(400).json({ error: 'A response points at an item that is not part of this audit' });
            let score = null;
            if (scoresEnabled && r.score !== null && r.score !== undefined && r.score !== '') {
                score = Number(r.score);
                if (!isScoreOnScale(score, scoreMin, scoreMax, scoreStep)) {
                    return res.status(400).json({ error: `A score must be between ${scoreMin} and ${scoreMax} in steps of ${scoreStep}` });
                }
            }
            const photos = Array.isArray(r.photos)
                ? r.photos.filter((p) => p && p.photo_url).map((p, i) => ({ photo_url: p.photo_url, caption: (p.caption || '').trim() || null, photo_order: i }))
                : (r.photo_url ? [{ photo_url: r.photo_url, caption: null, photo_order: 0 }] : []);
            norm.push({
                question_id: isCat ? null : key,
                category_id: isCat ? key : (questionById[key] ? questionById[key].category_id : null),
                score, remarks: (r.remarks || '').trim() || null, photos,
            });
        }

        if (!draft) {
            const answeredKeys = new Set(norm.filter((n) => n.score !== null || n.remarks || n.photos.length).map((n) => usesCategories ? n.category_id : n.question_id));
            const scoredKeys = new Set(norm.filter((n) => n.score !== null).map((n) => usesCategories ? n.category_id : n.question_id));
            if (scoresEnabled && sub.scoring_mode === 'required') {
                const missing = items.filter((i) => !scoredKeys.has(i.key));
                if (missing.length) return res.status(400).json({ error: 'Score every item before submitting' });
            }
            const missingPhoto = items.filter((i) => i.photo_required).find((i) => {
                const n = norm.find((x) => (usesCategories ? x.category_id : x.question_id) === i.key);
                return !n || n.photos.length === 0;
            });
            if (missingPhoto) return res.status(400).json({ error: 'A photo is required for at least one item and is missing' });
            if (!scoresEnabled && answeredKeys.size === 0) return res.status(400).json({ error: 'Add at least one photo or comment before submitting' });
        }

        await query('DELETE FROM audit_response WHERE submission_id = $1', [req.params.id]);
        for (const n of norm) {
            if (n.score === null && !n.remarks && n.photos.length === 0) continue;
            const rr = await query(
                'INSERT INTO audit_response (submission_id, question_id, category_id, score, remarks) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [req.params.id, n.question_id, n.category_id, n.score, n.remarks]
            );
            for (const p of n.photos) {
                await query(
                    'INSERT INTO audit_response_photo (response_id, photo_url, caption, photo_order) VALUES ($1, $2, $3, $4)',
                    [rr[0].id, p.photo_url, p.caption, p.photo_order]
                );
            }
        }

        if (draft) {
            await query(
                'INSERT INTO audit_audit_trail (submission_id, template_id, action, actor_emp_id) VALUES ($1, $2, $3, $4)',
                [req.params.id, sub.template_id, 'draft_saved', requesterEmpId]
            );
            return res.json({ ...sub, status: 'pending' });
        }

        // Recompute category / overall averages from the scored responses.
        await query('DELETE FROM audit_submission_category_score WHERE submission_id = $1', [req.params.id]);
        const scoredNorm = norm.filter((n) => n.score !== null);
        const categoryAverages = [];
        if (scoresEnabled && scoredNorm.length) {
            if (usesCategories) {
                for (const n of scoredNorm) {
                    await query('INSERT INTO audit_submission_category_score (submission_id, category, category_id, avg_score) VALUES ($1, $2, $3, $4)',
                        [req.params.id, catNameById[n.category_id] || null, n.category_id, n.score]);
                    categoryAverages.push({ category_id: n.category_id, category: catNameById[n.category_id] || null, avg_score: n.score });
                }
            } else if (sub.structure === 'categories_questions') {
                const byCat = {};
                scoredNorm.forEach((n) => { if (n.category_id) (byCat[n.category_id] ||= []).push(n.score); });
                for (const [catId, arr] of Object.entries(byCat)) {
                    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
                    await query('INSERT INTO audit_submission_category_score (submission_id, category, category_id, avg_score) VALUES ($1, $2, $3, $4)',
                        [req.params.id, catNameById[catId] || null, catId, avg]);
                    categoryAverages.push({ category_id: catId, category: catNameById[catId] || null, avg_score: avg });
                }
            }
        }
        const overallAvg = (scoresEnabled && scoredNorm.length)
            ? scoredNorm.reduce((a, n) => a + n.score, 0) / scoredNorm.length
            : null;
        const updated = await query(
            `UPDATE audit_submission SET status = 'submitted', submitted_by_emp_id = $1, submitted_at = now(), total_score = $2, max_score = $3,
             started_by_emp_id = COALESCE(started_by_emp_id, $1)
       WHERE id = $4 RETURNING *`,
            [requesterEmpId, overallAvg, scoresEnabled ? scoreMax : null, req.params.id]
        );
        await query(
            'INSERT INTO audit_audit_trail (submission_id, template_id, action, actor_emp_id, changed_fields) VALUES ($1, $2, $3, $4, $5)',
            [req.params.id, sub.template_id, 'submitted', requesterEmpId, JSON.stringify({ overall_avg: overallAvg, category_averages: categoryAverages })]
        );
        let occurrence = null;
        if (sub.occurrence_id) occurrence = await recomputeAuditOccurrence(sub.occurrence_id);
        return res.json({ ...updated[0], category_scores: categoryAverages, occurrence });
    } catch (e) {
        console.error('submit audit failed:', e.message);
        res.status(500).json({ error: 'Failed to submit audit' });
    }
});
// Hard-delete one audit occurrence (draft or already submitted) — for a wrong entry or
// one started by mistake. Removes its answers, photos, category scores, auditor overrides
// and change requests (all FK ON DELETE CASCADE), plus its audit-trail rows (no cascade),
// in one transaction, then logs a standalone 'submission_deleted' trail entry. The
// occurrence's schedule/template/history are untouched. Its schedule admin, a template
// admin, or a full audit admin may do this.
app.delete('/api/audit-submissions/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(404).json({ error: 'Submission not found' });
    const client = await pool.connect();
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        const subRows = await client.query(
            `SELECT s.*, sc.admin_emp_id FROM audit_submission s
       JOIN audit_schedule sc ON sc.id = s.schedule_id WHERE s.id = $1`,
            [req.params.id]
        );
        const submission = subRows.rows[0];
        if (!submission) return res.status(404).json({ error: 'Submission not found' });
        if (submission.factory_id !== factoryId) return res.status(403).json({ error: 'This audit belongs to a different plant' });
        if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, submission))) return res.status(403).json({ error: 'You are not authorized to delete this audit' });

        await client.query('BEGIN');
        await client.query('DELETE FROM audit_change_request WHERE submission_id = $1', [req.params.id]);
        await client.query('DELETE FROM audit_submission_auditor WHERE submission_id = $1', [req.params.id]);
        await client.query('DELETE FROM audit_submission_category_score WHERE submission_id = $1', [req.params.id]);
        await client.query('DELETE FROM audit_response WHERE submission_id = $1', [req.params.id]);
        await client.query('DELETE FROM audit_audit_trail WHERE submission_id = $1', [req.params.id]);
        await client.query('DELETE FROM audit_submission WHERE id = $1', [req.params.id]);
        await client.query(
            'INSERT INTO audit_audit_trail (template_id, action, actor_emp_id, changed_fields) VALUES ($1, $2, $3, $4)',
            [submission.template_id, 'submission_deleted', requesterEmpId, JSON.stringify({ deleted_submission_id: req.params.id, due_date: submission.due_date, status: submission.status })]
        );
        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* noop */ }
        console.error('audit submission delete failed:', e.message);
        res.status(500).json({ error: 'Failed to delete audit' });
    } finally {
        client.release();
    }
});

// Change requests — post-submission corrections. The submitter asks to change a
// score/photo/remarks on one or more questions of an already-submitted audit, with a
// reason; a 5S admin or BE-lead approves (applies the change, recomputes averages) or
// rejects. Every step is logged to audit_audit_trail for 5S Admin/BE-lead visibility.
const CHANGE_REQUEST_FIELDS = ['score', 'photo', 'remarks'];
app.post('/api/audit-change-requests', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { submission_id, reason, items } = req.body;
    if (!submission_id || !reason || !reason.trim()) return res.status(400).json({ error: 'submission_id and reason are required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one change item is required' });
    for (const it of items) {
        if (!it.question_id || !CHANGE_REQUEST_FIELDS.includes(it.field)) return res.status(400).json({ error: 'Every item needs question_id and a valid field (score/photo/remarks)' });
    }
    try {
        if (pool) {
            const subRows = await query(
                `SELECT s.*, t.scoring_mode, t.score_min, t.score_max, t.score_step
         FROM audit_submission s JOIN audit_template t ON t.id = s.template_id WHERE s.id = $1`,
                [submission_id]
            );
            if (!subRows[0]) return res.status(404).json({ error: 'Submission not found' });
            if (subRows[0].submitted_by_emp_id !== requesterEmpId) return res.status(403).json({ error: 'Only the person who submitted this audit can request a change to it' });
            if (subRows[0].status !== 'submitted') return res.status(409).json({ error: 'This audit has not been submitted yet' });
            for (const it of items) {
                if (it.field === 'score' && !isScoreOnScale(Number(it.new_value), subRows[0].score_min, subRows[0].score_max, subRows[0].score_step)) {
                    return res.status(400).json({ error: `A score change must be between ${subRows[0].score_min} and ${subRows[0].score_max} in steps of ${subRows[0].score_step}` });
                }
            }

            const crRows = await query(
                'INSERT INTO audit_change_request (submission_id, requested_by_emp_id, reason) VALUES ($1, $2, $3) RETURNING *',
                [submission_id, requesterEmpId, reason.trim()]
            );
            const changeRequest = crRows[0];
            const insertedItems = [];
            for (const it of items) {
                const current = await query('SELECT score, photo_url, remarks FROM audit_response WHERE submission_id = $1 AND question_id = $2', [submission_id, it.question_id]);
                const oldValue = it.field === 'score' ? current[0]?.score : it.field === 'photo' ? current[0]?.photo_url : current[0]?.remarks;
                const itemRows = await query(
                    'INSERT INTO audit_change_request_item (change_request_id, question_id, field, old_value, new_value) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                    [changeRequest.id, it.question_id, it.field, oldValue != null ? String(oldValue) : null, String(it.new_value ?? '')]
                );
                insertedItems.push(itemRows[0]);
            }
            await query(
                'INSERT INTO audit_audit_trail (submission_id, template_id, action, actor_emp_id, changed_fields) VALUES ($1, $2, $3, $4, $5)',
                [submission_id, subRows[0].template_id, 'change_requested', requesterEmpId, JSON.stringify({ change_request_id: changeRequest.id, reason: reason.trim(), items })]
            );
            try {
                const adminRows = await query(
                    `SELECT sc.admin_emp_id FROM audit_submission s JOIN audit_schedule sc ON sc.id = s.schedule_id WHERE s.id = $1`,
                    [submission_id]
                );
                await notify(adminRows.map((r) => r.admin_emp_id), {
                    kind: 'audit_cr_pending', module: 'audit', entityId: submission_id, createdBy: requesterEmpId,
                    title: 'Audit change request', body: `A change was requested on a submitted audit: ${reason.trim()}`,
                });
            } catch (e) { console.error('audit change-request notify failed:', e.message); }
            return res.json({ ...changeRequest, items: insertedItems });
        }
        res.status(404).json({ error: 'Submission not found' });
    } catch {
        res.status(500).json({ error: 'Failed to submit change request' });
    }
});
app.get('/api/audit-change-requests', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { submission_id } = req.query;
    try {
        if (pool) {
            const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
            const isBeLead = await isFullAuditAdmin(requesterEmpId, role, factoryId);
            let sql = `SELECT cr.*, s.factory_id, t.name AS template_name, z.name AS zone_name, u.name AS requested_by_name
        FROM audit_change_request cr
        JOIN audit_submission s ON s.id = cr.submission_id
        JOIN audit_template t ON t.id = s.template_id
        JOIN zone z ON z.id = s.zone_id
        JOIN audit_schedule sc ON sc.id = s.schedule_id
        JOIN user_details u ON u.emp_id = cr.requested_by_emp_id
        WHERE s.factory_id = $1`;
            const params = [factoryId];
            if (submission_id) { params.push(submission_id); sql += ` AND cr.submission_id = $${params.length}`; }
            // Visible to a full audit admin (everything), that schedule's own admin, the
            // admin of that submission's template (per-template, not factory-wide), or
            // the person who filed it.
            if (!isBeLead) {
                params.push(requesterEmpId);
                sql += ` AND (cr.requested_by_emp_id = $${params.length} OR sc.admin_emp_id = $${params.length} OR EXISTS (
          SELECT 1 FROM audit_template_admin ta WHERE ta.template_id = s.template_id AND ta.emp_id = $${params.length}
        ))`;
            }
            sql += ' ORDER BY cr.created_at DESC';
            const requests = await query(sql, params);
            const items = await query(
                `SELECT cri.*, q.question_text, q.category FROM audit_change_request_item cri
         JOIN audit_template_question q ON q.id = cri.question_id
         WHERE cri.change_request_id = ANY($1::uuid[])`,
                [requests.map((r) => r.id)]
            );
            const itemsByRequest = {};
            items.forEach((it) => { (itemsByRequest[it.change_request_id] ||= []).push(it); });
            return res.json(requests.map((r) => ({ ...r, items: itemsByRequest[r.id] || [] })));
        }
        res.json([]);
    } catch {
        res.status(500).json({ error: 'Failed to fetch change requests' });
    }
});
app.put('/api/audit-change-requests/:id', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    const { action, review_note } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (pool) {
            const crRows = await query(
                `SELECT cr.*, s.factory_id, s.template_id, sc.admin_emp_id FROM audit_change_request cr
         JOIN audit_submission s ON s.id = cr.submission_id
         JOIN audit_schedule sc ON sc.id = s.schedule_id WHERE cr.id = $1`,
                [req.params.id]
            );
            const changeRequest = crRows[0];
            if (!changeRequest) return res.status(404).json({ error: 'Change request not found' });
            if (changeRequest.factory_id !== factoryId) return res.status(403).json({ error: 'This change request belongs to a different plant' });
            if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, changeRequest))) return res.status(403).json({ error: 'You are not authorized to review this change request' });
            if (changeRequest.status !== 'pending') return res.status(409).json({ error: 'This change request has already been reviewed' });

            const items = await query('SELECT * FROM audit_change_request_item WHERE change_request_id = $1', [req.params.id]);
            if (action === 'approve') {
                for (const it of items) {
                    const respRows = await query('SELECT id FROM audit_response WHERE submission_id = $1 AND question_id = $2', [changeRequest.submission_id, it.question_id]);
                    let respId = respRows[0]?.id;
                    if (!respId) {
                        const created = await query('INSERT INTO audit_response (submission_id, question_id) VALUES ($1, $2) RETURNING id', [changeRequest.submission_id, it.question_id]);
                        respId = created[0].id;
                    }
                    if (it.field === 'score') {
                        await query('UPDATE audit_response SET score = $1 WHERE id = $2', [Number(it.new_value), respId]);
                    } else if (it.field === 'remarks') {
                        await query('UPDATE audit_response SET remarks = $1 WHERE id = $2', [it.new_value, respId]);
                    } else if (it.field === 'photo') {
                        const ord = await query('SELECT COALESCE(MAX(photo_order), -1) + 1 AS n FROM audit_response_photo WHERE response_id = $1', [respId]);
                        await query('INSERT INTO audit_response_photo (response_id, photo_url, photo_order) VALUES ($1, $2, $3)', [respId, it.new_value, ord[0].n]);
                    }
                }
                // Recompute category and overall averages from the now-updated responses.
                const questions = await query('SELECT id, category_id FROM audit_template_question WHERE template_id = $1', [changeRequest.template_id]);
                const catIdByQuestion = {};
                questions.forEach((q) => { catIdByQuestion[q.id] = q.category_id; });
                const cats = await query('SELECT id, name FROM audit_template_category WHERE template_id = $1', [changeRequest.template_id]);
                const catNameById = Object.fromEntries(cats.map((c) => [c.id, c.name]));
                const responses = await query('SELECT question_id, category_id, score FROM audit_response WHERE submission_id = $1 AND score IS NOT NULL', [changeRequest.submission_id]);
                const scoresByCategory = {};
                responses.forEach((r) => {
                    const catId = r.category_id || catIdByQuestion[r.question_id];
                    if (!catId) return;
                    (scoresByCategory[catId] ||= []).push(Number(r.score));
                });
                await query('DELETE FROM audit_submission_category_score WHERE submission_id = $1', [changeRequest.submission_id]);
                const categoryAverages = [];
                for (const [catId, scores] of Object.entries(scoresByCategory)) {
                    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                    await query('INSERT INTO audit_submission_category_score (submission_id, category, category_id, avg_score) VALUES ($1, $2, $3, $4)', [changeRequest.submission_id, catNameById[catId] || null, catId, avg]);
                    categoryAverages.push({ category_id: catId, category: catNameById[catId] || null, avg_score: avg });
                }
                const overallAvg = responses.length ? responses.reduce((a, r) => a + Number(r.score), 0) / responses.length : null;
                await query('UPDATE audit_submission SET total_score = $1 WHERE id = $2', [overallAvg, changeRequest.submission_id]);
                await query(
                    'INSERT INTO audit_audit_trail (submission_id, template_id, action, actor_emp_id, changed_fields) VALUES ($1, $2, $3, $4, $5)',
                    [changeRequest.submission_id, changeRequest.template_id, 'change_approved', requesterEmpId, JSON.stringify({ change_request_id: changeRequest.id, items, new_overall_avg: overallAvg })]
                );
            } else {
                await query(
                    'INSERT INTO audit_audit_trail (submission_id, template_id, action, actor_emp_id, changed_fields) VALUES ($1, $2, $3, $4, $5)',
                    [changeRequest.submission_id, changeRequest.template_id, 'change_rejected', requesterEmpId, JSON.stringify({ change_request_id: changeRequest.id, review_note: review_note || null })]
                );
            }
            const updated = await query(
                'UPDATE audit_change_request SET status = $1, reviewed_by_emp_id = $2, reviewed_at = now(), review_note = $3 WHERE id = $4 RETURNING *',
                [action === 'approve' ? 'approved' : 'rejected', requesterEmpId, review_note || null, req.params.id]
            );
            try {
                await resolveNotifications('audit', changeRequest.submission_id, ['audit_cr_pending']);
                await notify(changeRequest.requested_by_emp_id, {
                    kind: 'audit_cr_decided', module: 'audit', entityId: changeRequest.submission_id, createdBy: requesterEmpId,
                    title: `Your audit change request was ${action === 'approve' ? 'approved' : 'rejected'}`,
                    body: review_note || (action === 'approve' ? 'The scores have been updated.' : 'No changes were made.'),
                });
            } catch (e) { console.error('audit change-decision notify failed:', e.message); }
            return res.json(updated[0]);
        }
        res.status(404).json({ error: 'Change request not found' });
    } catch {
        res.status(500).json({ error: 'Failed to review change request' });
    }
});

// ---- Occurrences (multi-auditor) --------------------------------------------------------
// Plant-wide occurrence list for the All Audits board — one row per (schedule, date), with
// the combined score + how many auditors have submitted. BE-lead / Global Audit Admin only.
app.get('/api/audit-occurrences', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'Not authorized' });
        if (!pool) return res.json([]);
        const occ = await query(
            `SELECT o.*, t.name AS template_name, z.name AS zone_name, sc.admin_emp_id, au.name AS admin_name,
              cr.name AS close_requested_by_name, cb.name AS closed_by_name
       FROM audit_occurrence o
       JOIN audit_template t ON t.id = o.template_id
       JOIN zone z ON z.id = o.zone_id
       JOIN audit_schedule sc ON sc.id = o.schedule_id
       LEFT JOIN user_details au ON au.emp_id = sc.admin_emp_id
       LEFT JOIN user_details cr ON cr.emp_id = o.close_requested_by_emp_id
       LEFT JOIN user_details cb ON cb.emp_id = o.closed_by_emp_id
       WHERE o.factory_id = $1 ORDER BY o.due_date DESC`,
            [factoryId]
        );
        const cards = occ.length
            ? await query(
                `SELECT s.occurrence_id, s.id, s.status, s.total_score, s.max_score, s.submitted_at,
                COALESCE(su.name, sb.name) AS auditor_name
         FROM audit_submission s
         LEFT JOIN user_details su ON su.emp_id = s.started_by_emp_id
         LEFT JOIN user_details sb ON sb.emp_id = s.submitted_by_emp_id
         WHERE s.occurrence_id = ANY($1::uuid[]) ORDER BY s.created_at ASC`,
                [occ.map((o) => o.id)]
            )
            : [];
        const byOcc = {};
        cards.forEach((c) => { (byOcc[c.occurrence_id] ||= []).push(c); });
        // Recompute expected count live (auditor pool can change).
        for (const o of occ) {
            o.expected_count = (await auditExpectedAuditors(o.schedule_id)).length;
            o.scorecards = byOcc[o.id] || [];
        }
        res.json(occ);
    } catch (e) {
        console.error('audit occurrences failed:', e.message);
        res.status(500).json({ error: 'Failed to fetch audit occurrences' });
    }
});
// Closes the occurrence now, without waiting for the stragglers. Whoever has NOT submitted
// simply drops out — the combined score is the mean of the scorecards actually handed in, and
// a no-show is never scored zero.
//
// This is the audit's OWN Audit Admin's call (owner direction, Sept 2026) — it used to be a
// two-step "Audit Admin requests -> BE-lead approves", which was more ceremony than the
// decision warranted. A BE-lead / Global Audit Admin can still close any audit, since
// isScheduleAdmin subsumes them.
app.post('/api/audit-occurrences/:id/close', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(404).json({ error: 'Occurrence not found' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        const occ = (await query(
            `SELECT o.*, sc.admin_emp_id FROM audit_occurrence o
             JOIN audit_schedule sc ON sc.id = o.schedule_id WHERE o.id = $1`,
            [req.params.id]
        ))[0];
        if (!occ) return res.status(404).json({ error: 'Occurrence not found' });
        if (occ.factory_id !== factoryId) return res.status(403).json({ error: 'Different plant' });
        if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, occ))) {
            return res.status(403).json({ error: 'Only this audit\'s Audit Admin (or a BE-lead / Global Audit Admin) can close it' });
        }
        if (occ.status === 'closed') return res.status(409).json({ error: 'Already closed' });
        const updated = await recomputeAuditOccurrence(req.params.id, { forceClose: true, closedBy: requesterEmpId });
        try {
            const cards = await query("SELECT DISTINCT COALESCE(started_by_emp_id, submitted_by_emp_id) AS emp_id FROM audit_submission WHERE occurrence_id = $1 AND status = 'submitted'", [req.params.id]);
            const admin = (await query('SELECT admin_emp_id FROM audit_schedule WHERE id = $1', [occ.schedule_id]))[0]?.admin_emp_id;
            await notify([...new Set([admin, ...cards.map((c) => c.emp_id)].filter(Boolean))], {
                kind: 'audit_closed', module: 'audit', entityId: req.params.id, createdBy: requesterEmpId,
                title: 'Audit occurrence closed', body: 'A BE-lead / Global Audit Admin has closed this audit.',
            });
        } catch (e) { console.error('close notify failed:', e.message); }
        res.json(updated);
    } catch (e) {
        console.error('close occurrence failed:', e.message);
        res.status(500).json({ error: 'Failed to close occurrence' });
    }
});

// The final audit report for one CLOSED occurrence — everything the printable report page
// needs in a single fetch: occurrence + template + zone + the scoring legend, every auditor's
// scorecard (per-item scores, observations, photos) AND the combined roll-up. The frontend
// renders either the combined view or one auditor's view from the same payload. Gated by
// isScheduleAdmin, so the Audit Admin, template admins and the BE-lead / Global tier can pull
// it; anyone else 403s. Only works once the occurrence is closed.
function auditScoreLegend(min, max, scoringMode) {
    if (scoringMode === 'off') return null;
    const lo = Math.floor((Number(min) + Number(max)) / 2);
    const rng = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
    return `${max} = Good  |  ${rng(lo, max - 1)} = Marginal  |  ${rng(min, lo - 1)} = Poor`;
}
app.get('/api/audit-occurrences/:id/report', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    if (!pool) return res.status(404).json({ error: 'Occurrence not found' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        const occ = (await query(
            `SELECT o.*, sc.admin_emp_id, sc.template_id,
                    t.name AS template_name, t.structure, t.scoring_mode, t.score_min, t.score_max, t.score_step,
                    z.name AS zone_name, f.name AS plant_name, f.code AS plant_code,
                    cb.name AS closed_by_name
             FROM audit_occurrence o
             JOIN audit_schedule sc ON sc.id = o.schedule_id
             JOIN audit_template t ON t.id = o.template_id
             JOIN zone z ON z.id = o.zone_id
             LEFT JOIN factory f ON f.id = o.factory_id
             LEFT JOIN user_details cb ON cb.emp_id = o.closed_by_emp_id
             WHERE o.id = $1`,
            [req.params.id]
        ))[0];
        if (!occ) return res.status(404).json({ error: 'Occurrence not found' });
        if (occ.factory_id !== factoryId) return res.status(403).json({ error: 'Different plant' });
        if (!(await isScheduleAdmin(requesterEmpId, role, factoryId, occ))) {
            return res.status(403).json({ error: 'You are not authorized to view this audit report' });
        }
        if (occ.status !== 'closed') return res.status(409).json({ error: 'A report is only available once the audit is closed' });

        const categories = await query(
            'SELECT id, name, category_order FROM audit_template_category WHERE template_id = $1 AND is_active = true ORDER BY category_order ASC',
            [occ.template_id]
        );
        const questions = await query(
            'SELECT id, question_text, question_order, category_id FROM audit_template_question WHERE template_id = $1 AND is_active = true ORDER BY question_order ASC',
            [occ.template_id]
        );
        const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));

        const cards = await query(
            `SELECT s.id, s.total_score, s.max_score, s.submitted_at,
                    COALESCE(sb.name, su.name) AS auditor_name,
                    COALESCE(s.submitted_by_emp_id, s.started_by_emp_id) AS auditor_emp_id
             FROM audit_submission s
             LEFT JOIN user_details su ON su.emp_id = s.started_by_emp_id
             LEFT JOIN user_details sb ON sb.emp_id = s.submitted_by_emp_id
             WHERE s.occurrence_id = $1 AND s.status = 'submitted'
             ORDER BY s.submitted_at ASC NULLS LAST`,
            [req.params.id]
        );
        const cardIds = cards.map((c) => c.id);
        const allResp = cardIds.length
            ? await query('SELECT * FROM audit_response WHERE submission_id = ANY($1::uuid[])', [cardIds])
            : [];
        const allPhotos = allResp.length
            ? await query('SELECT * FROM audit_response_photo WHERE response_id = ANY($1::uuid[]) ORDER BY photo_order ASC', [allResp.map((r) => r.id)])
            : [];
        const photosByResp = {};
        allPhotos.forEach((p) => { (photosByResp[p.response_id] ||= []).push({ photo_url: p.photo_url, caption: p.caption }); });
        const catScores = cardIds.length
            ? await query('SELECT submission_id, category, category_id, avg_score FROM audit_submission_category_score WHERE submission_id = ANY($1::uuid[])', [cardIds])
            : [];

        const scorecards = cards.map((c) => ({
            submission_id: c.id,
            auditor_name: c.auditor_name || c.auditor_emp_id,
            auditor_emp_id: c.auditor_emp_id,
            total_score: c.total_score != null ? Number(c.total_score) : null,
            max_score: c.max_score != null ? Number(c.max_score) : null,
            submitted_at: c.submitted_at,
            category_scores: catScores.filter((cs) => cs.submission_id === c.id)
                .map((cs) => ({ category: cs.category || catName[cs.category_id] || 'Uncategorised', avg_score: Number(cs.avg_score) })),
            responses: allResp.filter((r) => r.submission_id === c.id).map((r) => ({
                question_id: r.question_id, category_id: r.category_id,
                score: r.score != null ? Number(r.score) : null,
                remarks: (r.remarks || '').trim() || null,
                photos: photosByResp[r.id] || (r.photo_url ? [{ photo_url: r.photo_url, caption: null }] : []),
            })),
        }));

        // Combined per-category = mean of each scorecard's per-category average.
        const combinedByCat = {};
        scorecards.forEach((s) => s.category_scores.forEach((cs) => {
            (combinedByCat[cs.category] ||= []).push(cs.avg_score);
        }));
        const combined_categories = Object.entries(combinedByCat).map(([category, arr]) => ({
            category, avg_score: arr.reduce((a, b) => a + b, 0) / arr.length,
        }));

        res.json({
            occurrence: {
                id: occ.id, due_date: occ.due_date, closed_at: occ.closed_at,
                combined_score: occ.combined_score != null ? Number(occ.combined_score) : null,
                combined_max: occ.combined_max != null ? Number(occ.combined_max) : Number(occ.score_max),
                submitted_count: occ.submitted_count, expected_count: occ.expected_count,
            },
            template: {
                name: occ.template_name, structure: occ.structure, scoring_mode: occ.scoring_mode,
                score_min: Number(occ.score_min), score_max: Number(occ.score_max), score_step: Number(occ.score_step),
            },
            zone_name: occ.zone_name, plant_name: occ.plant_name || occ.plant_code || null,
            closed_by_name: occ.closed_by_name || null,
            legend: auditScoreLegend(occ.score_min, occ.score_max, occ.scoring_mode),
            categories: categories.map((c) => ({ id: c.id, name: c.name })),
            questions: questions.map((q, i) => ({
                id: q.id, number: i + 1, text: q.question_text,
                category_id: q.category_id, category_name: catName[q.category_id] || null,
            })),
            combined_categories,
            scorecards,
        });
    } catch (e) {
        console.error('audit report failed:', e.message);
        res.status(500).json({ error: 'Failed to build audit report' });
    }
});

// Plant-wide grading view — every CLOSED occurrence with its combined + per-category score.
// BE-lead / Global Audit Admin only (the same tier that owns the All Audits board).
app.get('/api/audit-scores', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        if (!(await isFullAuditAdmin(requesterEmpId, role, factoryId))) return res.status(403).json({ error: 'You are not authorized to view audit grades' });
        if (!pool) return res.json([]);
        const occ = await query(
            `SELECT o.id, o.due_date, o.closed_at, o.combined_score AS total_score, o.combined_max AS max_score,
              o.submitted_count, o.expected_count,
              t.name AS template_name, t.scoring_mode, z.name AS zone_name
       FROM audit_occurrence o
       JOIN audit_template t ON t.id = o.template_id
       JOIN zone z ON z.id = o.zone_id
       WHERE o.factory_id = $1 AND o.status = 'closed'
       ORDER BY o.closed_at DESC NULLS LAST`,
            [factoryId]
        );
        // Per-category combined = average across every submitted scorecard of the occurrence.
        for (const o of occ) {
            const cat = await query(
                `SELECT css.category, AVG(css.avg_score) AS avg_score
         FROM audit_submission_category_score css
         JOIN audit_submission s ON s.id = css.submission_id
         WHERE s.occurrence_id = $1 AND s.status = 'submitted'
         GROUP BY css.category`,
                [o.id]
            );
            o.categories = cat.map((c) => ({ category: c.category, avg_score: c.avg_score }));
            o.submitted_by_name = null;
        }
        res.json(occ);
    } catch (e) {
        console.error('audit scores failed:', e.message);
        res.status(500).json({ error: 'Failed to fetch audit grades' });
    }
});

// Audit trail — a true BE-lead / Global Audit Admin sees every audit event in the plant; a
// per-template / per-schedule admin sees only events for what they administer. Includes
// rows with no submission_id (template_deleted / schedule_deleted / submission_deleted),
// which carry template_id directly.
app.get('/api/audit-audit-trail', async (req, res) => {
    const requesterEmpId = req.headers['x-worker-id'];
    if (!requesterEmpId) return res.status(401).json({ error: 'x-worker-id header is required' });
    try {
        const { role, factoryId } = await resolveRequesterRoleAndFactory(requesterEmpId);
        const isBeLead = await isFullAuditAdmin(requesterEmpId, role, factoryId);
        if (!pool) return res.json([]);
        const base = `
      SELECT at.id, at.action, at.actor_emp_id, at.changed_fields, at.created_at,
             u.name AS actor_name,
             t.name AS template_name, t.id AS template_id,
             z.name AS zone_name, s.due_date, s.status AS submission_status
      FROM audit_audit_trail at
      LEFT JOIN audit_submission s ON s.id = at.submission_id
      LEFT JOIN audit_template t ON t.id = COALESCE(s.template_id, at.template_id)
      LEFT JOIN zone z ON z.id = s.zone_id
      LEFT JOIN user_details u ON u.emp_id = at.actor_emp_id`;
        const sql = isBeLead
            ? `${base} WHERE COALESCE(s.factory_id, t.factory_id) = $1 ORDER BY at.created_at DESC LIMIT 1000`
            : `${base}
         LEFT JOIN audit_schedule sc ON sc.id = s.schedule_id
         WHERE COALESCE(s.factory_id, t.factory_id) = $1 AND (
           sc.admin_emp_id = $2
           OR EXISTS (SELECT 1 FROM audit_template_admin ta WHERE ta.template_id = COALESCE(s.template_id, at.template_id) AND ta.emp_id = $2)
         ) ORDER BY at.created_at DESC LIMIT 1000`;
        const rows = await query(sql, isBeLead ? [factoryId] : [factoryId, requesterEmpId]);
        return res.json(rows);
    } catch (e) {
        console.error('audit trail failed:', e.message);
        res.status(500).json({ error: 'Failed to fetch audit trail' });
    }
});

// 10. File Upload & Translations
// Images are stored inline as base64 data URIs on the entity row (no filesystem, no
// object store, no CDN) — this keeps the whole app self-contained for an offline /
// air-gapped IIS deployment. The client always sends the compressed base64; if it
// somehow doesn't, that's a client bug — reject it rather than reach out to the internet.
app.post('/api/upload', (req, res) => {
    const { imageBase64, filename } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: 'imageBase64 is required' });
    }
    res.json({ url: imageBase64, key: filename || `upload-${Date.now()}.png` });
});

// ===========================================================================
// 11. DMT (Daily Management Tool) — migrated off Supabase to this shared stack
// ===========================================================================
// Tables: dmt_* in this same superdb (see backend/sql/dmt_schema.sql).
// Identity: shared user_details + x-worker-id header (no Supabase Auth, no RLS).
// Authorization: hand-rolled here. The TPM user_details.role is mapped to a DMT
// permission tier; route guards check the tier. This is a STARTING POINT — the
// per-route tier requirements are deliberately permissive and will be tightened
// once each page is migrated (Phase 2).
// ---------------------------------------------------------------------------

// TPM role  ->  DMT tier. Anything unlisted falls through to 'jh_lead'.
const DMT_ROLE_MAP = {
    it_lead: 'be_lead',
    be_lead: 'be_lead',
    admin: 'be_lead',        // defensive: not a real TPM role today
    leadership: 'leadership',
    module_lead: 'module_lead',
    jh_lead: 'jh_lead',
    operator: 'jh_lead',
};
const DMT_TIER_ORDER = ['jh_lead', 'module_lead', 'leadership', 'be_lead'];
const dmtTier = (tpmRole) => DMT_ROLE_MAP[String(tpmRole || '').toLowerCase()] || 'jh_lead';
const dmtTierAtLeast = (tier, min) => DMT_TIER_ORDER.indexOf(tier) >= DMT_TIER_ORDER.indexOf(min);

// Resolve the requester from the x-worker-id header. Returns null when missing/unknown.
// Every DMT user belongs to a real TPM plant via user_details.default_plant — DMT is not
// its own separate factory concept any more (see factory-table unification). Resolve it the
// same way the rest of the app does, never hardcode a plant here.
async function dmtUserFactoryId(dmtUser) {
    return resolveFactoryId(dmtUser?.default_plant);
}

async function dmtResolveUser(req) {
    const empId = req.headers['x-worker-id'];
    if (!empId) return null;
    try {
        const rows = await query(
            'SELECT emp_id, name, role, default_plant, department_id, is_active FROM user_details WHERE emp_id = $1 OR email = $1 LIMIT 1',
            [empId]
        );
        if (!rows.length || rows[0].is_active === false) return null;
        return { ...rows[0], tier: dmtTier(rows[0].role) };
    } catch {
        return null;
    }
}

// Express guard factory: 401 if unauthenticated, 403 if below `minTier`.
// Attaches req.dmtUser for the handler.
function dmtGuard(minTier = 'jh_lead') {
    return async (req, res, next) => {
        const u = await dmtResolveUser(req);
        if (!u) return res.status(401).json({ error: 'x-worker-id header is required' });
        if (!dmtTierAtLeast(u.tier, minTier)) {
            return res.status(403).json({ error: `Requires DMT ${minTier} tier` });
        }
        req.dmtUser = u;
        next();
    };
}

// Fire-and-forget audit row for the DMT change log (dmt_audit_logs). Never throws.
async function dmtAudit(tableName, recordId, action, oldValues, newValues, empId) {
    try {
        if (!recordId) return;
        await query(
            `INSERT INTO dmt_audit_logs (table_name, record_id, action, old_values, new_values, performed_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tableName, recordId, action,
             oldValues ? JSON.stringify(oldValues) : null,
             newValues ? JSON.stringify(newValues) : null,
             empId || null]
        );
    } catch (err) {
        console.error('[DMT] audit write failed:', err.message);
    }
}
// Resources whose create/update/delete are worth logging.
const DMT_AUDITED = new Set([
    'tasks', 'kpi-master', 'kpi-entries', 'meetings', 'meeting-decisions',
    'pd-jobs', 'department', 'factory', 'pm-machines', 'project-tracker-items',
]);

// Is this user a member of the DMT department with the given name (e.g. 'Engineering')?
async function dmtUserInDeptName(empId, name) {
    try {
        const rows = await query(
            `SELECT 1 FROM dmt_user_departments ud
             JOIN departments d ON d.id = ud.department_id
             WHERE ud.emp_id = $1 AND LOWER(d.name) = LOWER($2) LIMIT 1`,
            [empId, name]
        );
        return rows.length > 0;
    } catch { return false; }
}

// The DMT departments a user personally belongs to.
async function dmtUserDepartmentIds(empId) {
    try {
        const rows = await query('SELECT department_id FROM dmt_user_departments WHERE emp_id = $1', [empId]);
        return rows.map((r) => String(r.department_id));
    } catch { return []; }
}

const DMT_WIDGET_TYPES = new Set([
    'kpi_chart', 'multi_kpi_chart', 'saved_chart', 'kpi_stat', 'task_list', 'task_count',
]);

// Dashboard widgets are per-user, but their *scope* is not free: a plain user may only
// build widgets over a department they belong to. Picking another department — or the
// cross-department "all" view (department_id null) — is factory_manager+ only.
async function dmtValidateWidget(body, user) {
    const type = body.widget_type;
    if (type !== undefined && !DMT_WIDGET_TYPES.has(type)) return { status: 400, error: 'Unknown widget type' };
    const config = body.config;
    if (config === undefined) return null;
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        return { status: 400, error: 'config must be an object' };
    }
    // Chart widgets are KPI-scoped, not department-scoped — any user may chart any KPI,
    // same as the My View pinning they replace.
    if (type === 'kpi_chart') {
        if (!config.kpi_id) return { status: 400, error: 'A KPI must be selected' };
        return null;
    }
    if (type === 'multi_kpi_chart') {
        if (!Array.isArray(config.kpi_ids) || config.kpi_ids.length === 0) {
            return { status: 400, error: 'At least one KPI must be selected' };
        }
        if (config.chart_type && !['line', 'bar', 'composed'].includes(config.chart_type)) {
            return { status: 400, error: 'Unknown chart type' };
        }
        return null;
    }
    if (type === 'saved_chart') {
        if (!config.chart_id) return { status: 400, error: 'A saved chart must be selected' };
        return null;
    }
    if (dmtTierAtLeast(user.tier, 'leadership')) return null;
    const deptId = config.department_id;
    if (!deptId) return { status: 403, error: 'Only leadership can add an all-departments widget' };
    const mine = await dmtUserDepartmentIds(user.emp_id);
    if (!mine.includes(String(deptId))) {
        return { status: 403, error: 'You can only add widgets for your own department' };
    }
    return null;
}

// Write guard for a DMT_RESOURCES entry — tier check, with an optional ENG-dept
// bypass (mirrors the original PM Schedule canMarkActual rule).
function dmtWriteGuard(cfg) {
    return async (req, res, next) => {
        const u = await dmtResolveUser(req);
        if (!u) return res.status(401).json({ error: 'x-worker-id header is required' });
        req.dmtUser = u;
        if (dmtTierAtLeast(u.tier, cfg.write)) return next();
        if (cfg.engBypass && await dmtUserInDeptName(u.emp_id, 'Engineering')) return next();
        return res.status(403).json({ error: `Requires DMT ${cfg.write} tier` });
    };
}

// ---------------------------------------------------------------------------
// Table-driven CRUD. `cols` is the write whitelist (INSERT/UPDATE only touch
// these). Reads return `SELECT *`. Ordering per `orderBy`. Tiers per entry.
// ---------------------------------------------------------------------------
const DMT_RESOURCES = {
    factory:                 { table: 'factory', cols: ['name', 'code', 'location', 'is_active'], orderBy: 'name', write: 'be_lead' },
    department:              { table: 'departments', cols: ['name', 'display_order', 'is_active', 'factory_id'], orderBy: 'display_order', write: 'be_lead', factoryScoped: true },
    'user-departments':      { table: 'dmt_user_departments', cols: ['emp_id', 'department_id', 'is_primary'], orderBy: 'created_at', write: 'leadership' },
    'kpi-master':            { table: 'dmt_kpi_master', cols: ['department_id', 'name', 'unit', 'kpi_type', 'frequency', 'direction', 'target_value', 'green_threshold', 'amber_threshold', 'display_order', 'is_active', 'description', 'mtd_aggregation', 'is_hidden_from_trends'], orderBy: 'display_order', write: 'leadership' },
    'kpi-entries':           { table: 'dmt_kpi_entries', cols: ['kpi_id', 'reporting_date', 'actual_value', 'text_value', 'computed_status', 'meeting_id', 'submitted_by', 'is_late_entry', 'remarks'], orderBy: 'reporting_date', write: 'jh_lead' },
    'project-tracker-items': { table: 'dmt_project_tracker_items', cols: ['kpi_id', 'department_id', 'title', 'description', 'status', 'display_order', 'created_by'], orderBy: 'display_order', write: 'jh_lead' },
    'project-item-stage-updates': { table: 'dmt_project_item_stage_updates', cols: ['item_id', 'stage_name', 'update_note', 'reporting_date', 'updated_by'], orderBy: 'created_at', write: 'jh_lead' },
    meetings:                { table: 'dmt_meetings', cols: ['factory_id', 'title', 'scheduled_date', 'scheduled_start_time', 'scheduled_end_time', 'actual_start', 'actual_end', 'status', 'facilitator_id', 'location', 'summary', 'created_by'], orderBy: 'scheduled_date', write: 'jh_lead' },
    'meeting-invitees':      { table: 'dmt_meeting_invitees', cols: ['meeting_id', 'user_id', 'guest_name', 'guest_designation', 'department_id', 'is_mandatory'], orderBy: 'created_at', write: 'jh_lead' },
    'meeting-attendance':    { table: 'dmt_meeting_attendance', cols: ['meeting_id', 'invitee_id', 'status', 'marked_by', 'remarks'], orderBy: 'marked_at', write: 'jh_lead' },
    'meeting-discussion-points': { table: 'dmt_meeting_discussion_points', cols: ['meeting_id', 'title', 'notes', 'sequence', 'created_by'], orderBy: 'sequence', write: 'jh_lead' },
    'meeting-decisions':     { table: 'dmt_meeting_decisions', cols: ['meeting_id', 'discussion_point_id', 'decision_text', 'linked_task_id', 'created_by'], orderBy: 'created_at', write: 'jh_lead' },
    'meeting-templates':     { table: 'dmt_meeting_templates', cols: ['factory_id', 'name', 'description', 'default_duration_minutes', 'default_start_time', 'default_location', 'is_active', 'created_by'], orderBy: 'name', write: 'leadership', factoryScoped: true },
    'meeting-template-invitees': { table: 'dmt_meeting_template_invitees', cols: ['template_id', 'user_id', 'is_mandatory'], orderBy: 'created_at', write: 'leadership' },
    tasks:                   { table: 'dmt_tasks', cols: ['title', 'description', 'department_id', 'owner_id', 'assigned_by', 'priority', 'status', 'due_date', 'completed_at', 'resolution_note', 'origin_type', 'origin_meeting_id', 'origin_kpi_entry_id', 'is_carryover', 'is_private', 'task_group_id', 'created_by'], orderBy: 'created_at', write: 'jh_lead', scoped: true },
    'task-updates':          { table: 'dmt_task_updates', cols: ['task_id', 'previous_status', 'new_status', 'update_note', 'update_type', 'previous_due_date', 'new_due_date', 'previous_text', 'new_text', 'updated_by'], orderBy: 'created_at', write: 'jh_lead' },
    'task-due-date-history': { table: 'dmt_task_due_date_history', cols: ['task_id', 'previous_due_date', 'new_due_date', 'reason', 'changed_by'], orderBy: 'created_at', write: 'jh_lead' },
    'task-groups':           { table: 'dmt_task_groups', cols: ['name', 'created_by', 'factory_id', 'color'], orderBy: 'name', write: 'jh_lead' },
    'task-group-members':    { table: 'dmt_task_group_members', cols: ['group_id', 'user_id', 'added_by', 'is_leader'], orderBy: 'created_at', write: 'jh_lead' },
    'planner-items':         { table: 'dmt_planner_items', cols: ['emp_id', 'title', 'notes', 'due_date', 'is_completed', 'completed_at', 'display_order', 'recurrence_type', 'recurrence_day_of_week', 'recurrence_day_of_month', 'origin_context'], orderBy: 'display_order', write: 'jh_lead', owner: 'emp_id' },
    'dashboard-widgets':     { table: 'dmt_dashboard_widgets', cols: ['emp_id', 'widget_type', 'config', 'display_order'], orderBy: 'display_order', write: 'jh_lead', owner: 'emp_id', validate: dmtValidateWidget },
    'hidden-kpis':           { table: 'dmt_hidden_kpis', cols: ['emp_id', 'kpi_id'], orderBy: 'created_at', write: 'jh_lead', owner: 'emp_id' },
    'pm-machines':           { table: 'dmt_pm_machines', cols: ['factory_id', 'line', 'group_name', 'name', 'is_critical', 'is_active', 'display_order'], orderBy: 'display_order', write: 'leadership' },
    'pm-plan':               { table: 'dmt_pm_plan', cols: ['machine_id', 'planned_date', 'created_by'], orderBy: 'planned_date', write: 'module_lead' },
    'pm-actual':             { table: 'dmt_pm_actual', cols: ['machine_id', 'actual_date', 'remarks', 'recorded_by'], orderBy: 'actual_date', write: 'module_lead', engBypass: true },
    'pd-jobs':               { table: 'dmt_pd_jobs', cols: ['factory_id', 'title', 'customer', 'product', 'substrate', 'stage', 'feedback_note', 'previous_job_id', 'respawn_reason', 'target_dispatch_date', 'created_by', 'closed_at'], orderBy: 'created_at', write: 'module_lead' },
    'pd-job-comments':       { table: 'dmt_pd_job_comments', cols: ['job_id', 'author_id', 'body', 'stage_at_comment'], orderBy: 'created_at', write: 'jh_lead' },
    'pd-stage-history':      { table: 'dmt_pd_stage_history', cols: ['job_id', 'from_stage', 'to_stage', 'changed_by', 'note'], orderBy: 'changed_at', write: 'module_lead' },
    'kpi-charts':            { table: 'dmt_kpi_charts', cols: ['name', 'factory_id', 'department_id', 'size_width', 'size_height', 'chart_type', 'display_order', 'created_by'], orderBy: 'display_order', write: 'leadership' },
    'kpi-chart-kpis':        { table: 'dmt_kpi_chart_kpis', cols: ['chart_id', 'kpi_id', 'render_as', 'axis', 'color', 'display_order'], orderBy: 'display_order', write: 'leadership', pk: 'chart_id' },
    'audit-logs':            { table: 'dmt_audit_logs', cols: ['table_name', 'record_id', 'action', 'old_values', 'new_values', 'performed_by'], orderBy: 'performed_at', write: 'jh_lead' },
};

// Build a parametrised WHERE from ?col=val query params that name real columns.
function dmtBuildFilter(cfg, q, startIdx = 1) {
    const clauses = [];
    const params = [];
    let i = startIdx;
    const known = new Set([...cfg.cols, 'id', 'created_at', cfg.orderBy]);
    for (const [k, v] of Object.entries(q)) {
        if (k === 'select' || k === 'order' || k === 'limit') continue;
        if (!known.has(k)) continue;
        if (v === 'null') { clauses.push(`${k} IS NULL`); continue; }
        clauses.push(`${k} = $${i++}`);
        params.push(v);
    }
    return { where: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params, next: i };
}

for (const [resource, cfg] of Object.entries(DMT_RESOURCES)) {
    const base = `/api/dmt/${resource}`;

    // For per-user tables (owner set), reads/writes are always scoped to the caller.
    const pk = cfg.pk || 'id';

    // LIST
    app.get(base, dmtGuard('jh_lead'), async (req, res) => {
        try {
            const q = { ...req.query };
            if (cfg.owner) q[cfg.owner] = req.dmtUser.emp_id;
            const { where, params, next } = dmtBuildFilter(cfg, q);
            let sql = `SELECT * FROM ${cfg.table}${where}`;
            const allParams = [...params];
            // Task-board visibility scoping. The full-visibility escape hatch is
            // ?scope=all, allowed only for factory_manager+ (Admin Task Overview).
            const fullVisibility = cfg.scoped && req.query.scope === 'all' && dmtTierAtLeast(req.dmtUser.tier, 'leadership');
            if (cfg.scoped && !fullVisibility) {
                const me = req.dmtUser.emp_id;
                sql += `${where ? ' AND' : ' WHERE'} (
                    (is_private = false AND task_group_id IS NULL)
                    OR owner_id = $${next} OR assigned_by = $${next + 1} OR created_by = $${next + 2}
                    OR task_group_id IN (SELECT group_id FROM dmt_task_group_members WHERE user_id = $${next + 3})
                )`;
                allParams.push(me, me, me, me);
            }
            // Every plant only ever sees/edits its own rows here — DMT used to be assumed
            // single-plant; now that its tables share the real multi-plant `factory` table,
            // this stops one plant's BE Admin from seeing another plant's departments etc.
            if (cfg.factoryScoped) {
                const fid = await dmtUserFactoryId(req.dmtUser);
                const idx = allParams.length + 1;
                sql += `${/where/i.test(sql) ? ' AND' : ' WHERE'} factory_id = $${idx}`;
                allParams.push(fid);
            }
            const order = cfg.orderBy ? ` ORDER BY ${cfg.orderBy} ASC NULLS LAST` : '';
            const limit = /^\d+$/.test(req.query.limit || '') ? ` LIMIT ${req.query.limit}` : '';
            const rows = await query(`${sql}${order}${limit}`, allParams);
            res.json(rows);
        } catch (err) {
            console.error(`[DMT] GET ${base}`, err.message);
            res.status(500).json({ error: `Failed to list ${resource}` });
        }
    });

    // GET one
    app.get(`${base}/:id`, dmtGuard('jh_lead'), async (req, res) => {
        try {
            const rows = await query(`SELECT * FROM ${cfg.table} WHERE ${pk} = $1 LIMIT 1`, [req.params.id]);
            if (!rows.length) return res.status(404).json({ error: `${resource} not found` });
            if (cfg.owner && rows[0][cfg.owner] !== req.dmtUser.emp_id) return res.status(403).json({ error: 'Not yours' });
            if (cfg.factoryScoped && String(rows[0].factory_id) !== String(await dmtUserFactoryId(req.dmtUser))) {
                return res.status(403).json({ error: 'Not your plant' });
            }
            res.json(rows[0]);
        } catch (err) {
            console.error(`[DMT] GET ${base}/:id`, err.message);
            res.status(500).json({ error: `Failed to get ${resource}` });
        }
    });

    // CREATE
    app.post(base, dmtWriteGuard(cfg), async (req, res) => {
        try {
            const body = { ...req.body };
            if (cfg.owner) body[cfg.owner] = req.dmtUser.emp_id;
            if (cfg.factoryScoped) body.factory_id = await dmtUserFactoryId(req.dmtUser);
            if (cfg.validate) {
                const bad = await cfg.validate(body, req.dmtUser);
                if (bad) return res.status(bad.status).json({ error: bad.error });
            }
            const entries = Object.entries(body).filter(([k]) => cfg.cols.includes(k));
            if (!entries.length) return res.status(400).json({ error: 'No writable fields supplied' });
            const names = entries.map(([k]) => k);
            const vals = entries.map(([, v]) => v);
            const ph = names.map((_, i) => `$${i + 1}`);
            const rows = await query(
                `INSERT INTO ${cfg.table} (${names.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`,
                vals
            );
            if (DMT_AUDITED.has(resource)) dmtAudit(cfg.table, rows[0]?.id, 'INSERT', null, rows[0], req.dmtUser.emp_id);
            res.status(201).json(rows[0]);
        } catch (err) {
            console.error(`[DMT] POST ${base}`, err.message);
            res.status(500).json({ error: `Failed to create ${resource}`, detail: err.message });
        }
    });

    // UPDATE (partial)
    app.patch(`${base}/:id`, dmtWriteGuard(cfg), async (req, res) => {
        try {
            if (cfg.owner) {
                const own = await query(`SELECT ${cfg.owner} FROM ${cfg.table} WHERE ${pk} = $1`, [req.params.id]);
                if (!own.length) return res.status(404).json({ error: `${resource} not found` });
                if (own[0][cfg.owner] !== req.dmtUser.emp_id) return res.status(403).json({ error: 'Not yours' });
            }
            if (cfg.factoryScoped) {
                const own = await query(`SELECT factory_id FROM ${cfg.table} WHERE ${pk} = $1`, [req.params.id]);
                if (!own.length) return res.status(404).json({ error: `${resource} not found` });
                if (String(own[0].factory_id) !== String(await dmtUserFactoryId(req.dmtUser))) {
                    return res.status(403).json({ error: 'Not your plant' });
                }
            }
            if (cfg.validate) {
                const bad = await cfg.validate(req.body, req.dmtUser);
                if (bad) return res.status(bad.status).json({ error: bad.error });
            }
            const entries = Object.entries(req.body).filter(([k]) => cfg.cols.includes(k) && k !== cfg.owner && k !== 'factory_id');
            if (!entries.length) return res.status(400).json({ error: 'No writable fields supplied' });
            const before = DMT_AUDITED.has(resource)
                ? (await query(`SELECT * FROM ${cfg.table} WHERE ${pk} = $1`, [req.params.id]))[0]
                : null;
            const set = entries.map(([k], i) => `${k} = $${i + 2}`);
            const rows = await query(
                `UPDATE ${cfg.table} SET ${set.join(', ')} WHERE ${pk} = $1 RETURNING *`,
                [req.params.id, ...entries.map(([, v]) => v)]
            );
            if (!rows.length) return res.status(404).json({ error: `${resource} not found` });
            if (DMT_AUDITED.has(resource)) dmtAudit(cfg.table, rows[0]?.id, 'UPDATE', before, rows[0], req.dmtUser.emp_id);
            res.json(rows[0]);
        } catch (err) {
            console.error(`[DMT] PATCH ${base}/:id`, err.message);
            res.status(500).json({ error: `Failed to update ${resource}`, detail: err.message });
        }
    });

    // DELETE
    app.delete(`${base}/:id`, dmtWriteGuard(cfg), async (req, res) => {
        try {
            if (cfg.factoryScoped) {
                const own = await query(`SELECT factory_id FROM ${cfg.table} WHERE ${pk} = $1`, [req.params.id]);
                if (own.length && String(own[0].factory_id) !== String(await dmtUserFactoryId(req.dmtUser))) {
                    return res.status(403).json({ error: 'Not your plant' });
                }
            }
            const owned = cfg.owner ? ` AND ${cfg.owner} = $2` : '';
            const params = cfg.owner ? [req.params.id, req.dmtUser.emp_id] : [req.params.id];
            const before = DMT_AUDITED.has(resource)
                ? (await query(`SELECT * FROM ${cfg.table} WHERE ${pk} = $1`, [req.params.id]))[0]
                : null;
            await query(`DELETE FROM ${cfg.table} WHERE ${pk} = $1${owned}`, params);
            if (DMT_AUDITED.has(resource) && before) dmtAudit(cfg.table, before.id, 'DELETE', before, null, req.dmtUser.emp_id);
            res.json({ success: true });
        } catch (err) {
            console.error(`[DMT] DELETE ${base}/:id`, err.message);
            res.status(500).json({ error: `Failed to delete ${resource}`, detail: err.message });
        }
    });
}

// ---------------------------------------------------------------------------
// DMT — operations that were Supabase RPCs (now plain route logic, no DB funcs)
// ---------------------------------------------------------------------------

// who am I, in DMT terms
app.get('/api/dmt/me', dmtGuard('jh_lead'), async (req, res) => {
    const u = req.dmtUser;
    const factoryId = await dmtUserFactoryId(u);
    const factoryRows = factoryId ? await query('SELECT name, code FROM factory WHERE id = $1', [factoryId]) : [];
    res.json({
        emp_id: u.emp_id, name: u.name, role: u.role, tier: u.tier, department_id: u.department_id,
        default_plant: u.default_plant,
        factory_name: factoryRows[0]?.name || null,
        factory_code: factoryRows[0]?.code || null,
    });
});

// KPI entries — upsert a batch keyed on (kpi_id, reporting_date). Former Supabase
// `.upsert(rows, { onConflict: 'kpi_id,reporting_date' })`.
app.post('/api/dmt/kpi-entries/upsert', dmtGuard('jh_lead'), async (req, res) => {
    const rows = Array.isArray(req.body) ? req.body : req.body?.rows;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows[] is required' });
    try {
        const saved = [];
        for (const r of rows) {
            if (!r.kpi_id || !r.reporting_date) continue;
            const out = await query(
                `INSERT INTO dmt_kpi_entries
                   (kpi_id, reporting_date, actual_value, text_value, computed_status, submitted_by, is_late_entry, remarks)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                 ON CONFLICT (kpi_id, reporting_date) DO UPDATE SET
                   actual_value = EXCLUDED.actual_value,
                   text_value = EXCLUDED.text_value,
                   computed_status = EXCLUDED.computed_status,
                   submitted_by = EXCLUDED.submitted_by,
                   is_late_entry = EXCLUDED.is_late_entry,
                   remarks = EXCLUDED.remarks,
                   submitted_at = now()
                 RETURNING *`,
                [r.kpi_id, r.reporting_date, r.actual_value ?? null, r.text_value ?? null,
                 r.computed_status ?? null, req.dmtUser.emp_id, r.is_late_entry ?? false, r.remarks ?? null]
            );
            saved.push(out[0]);
        }
        res.json(saved);
    } catch (err) {
        console.error('[DMT] kpi-entries upsert', err.message);
        res.status(500).json({ error: 'Failed to save KPI entries', detail: err.message });
    }
});

// bulk-clear the caller's completed planner items
app.post('/api/dmt/planner-items/clear-completed', dmtGuard('jh_lead'), async (req, res) => {
    try {
        await query('DELETE FROM dmt_planner_items WHERE emp_id = $1 AND is_completed = true', [req.dmtUser.emp_id]);
        res.json({ success: true });
    } catch (err) {
        console.error('[DMT] planner clear-completed', err.message);
        res.status(500).json({ error: 'Failed to clear completed items' });
    }
});

// Task groups the requester belongs to (with is_leader). Used for the Task Board group pills.
app.get('/api/dmt/my-task-groups', dmtGuard('jh_lead'), async (req, res) => {
    try {
        const rows = await query(
            `SELECT g.id, g.name, g.color, g.created_by, gm.is_leader
             FROM dmt_task_group_members gm
             JOIN dmt_task_groups g ON g.id = gm.group_id
             WHERE gm.user_id = $1
             ORDER BY g.name ASC`,
            [req.dmtUser.emp_id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[DMT] my-task-groups', err.message);
        res.status(500).json({ error: 'Failed to load groups' });
    }
});

// former get_user_departments(p_user_id) RPC
app.get('/api/dmt/my-departments', dmtGuard('jh_lead'), async (req, res) => {
    try {
        const empId = req.query.emp_id || req.dmtUser.emp_id;
        const rows = await query(
            `SELECT d.* FROM departments d
             JOIN dmt_user_departments ud ON ud.department_id = d.id
             WHERE ud.emp_id = $1 ORDER BY d.display_order ASC`,
            [empId]
        );
        res.json(rows);
    } catch (err) {
        console.error('[DMT] my-departments', err.message);
        res.status(500).json({ error: 'Failed to resolve departments' });
    }
});

// former update_task_status(p_task_id, p_new_status, p_note) RPC
app.post('/api/dmt/tasks/:id/status', dmtGuard('jh_lead'), async (req, res) => {
    const { id } = req.params;
    const { new_status, note } = req.body;
    if (!new_status) return res.status(400).json({ error: 'new_status is required' });
    try {
        const cur = (await query('SELECT status FROM dmt_tasks WHERE id = $1', [id]))[0];
        if (!cur) return res.status(404).json({ error: 'Task not found' });
        const terminal = new_status === 'completed' || new_status === 'cancelled';
        const rows = await query(
            `UPDATE dmt_tasks SET status = $2, completed_at = ${terminal ? 'now()' : 'NULL'},
                    resolution_note = COALESCE($3, resolution_note)
             WHERE id = $1 RETURNING *`,
            [id, new_status, terminal ? (note || null) : null]
        );
        await query(
            `INSERT INTO dmt_task_updates (task_id, previous_status, new_status, update_type, update_note, updated_by)
             VALUES ($1, $2, $3, 'status_change', $4, $5)`,
            [id, cur.status, new_status, note || null, req.dmtUser.emp_id]
        );
        dmtAudit('dmt_tasks', id, 'UPDATE', { status: cur.status }, { status: new_status, note: note || null }, req.dmtUser.emp_id);
        res.json(rows[0]);
    } catch (err) {
        console.error('[DMT] task status', err.message);
        res.status(500).json({ error: 'Failed to change status', detail: err.message });
    }
});

// former update_task_due_date(p_task_id, p_new_due_date, p_reason) RPC
app.post('/api/dmt/tasks/:id/due-date', dmtGuard('jh_lead'), async (req, res) => {
    const { id } = req.params;
    const { new_due_date, reason } = req.body;
    if (!new_due_date) return res.status(400).json({ error: 'new_due_date is required' });
    try {
        const cur = (await query('SELECT due_date FROM dmt_tasks WHERE id = $1', [id]))[0];
        if (!cur) return res.status(404).json({ error: 'Task not found' });
        const rows = await query('UPDATE dmt_tasks SET due_date = $2 WHERE id = $1 RETURNING *', [id, new_due_date]);
        await query(
            `INSERT INTO dmt_task_due_date_history (task_id, previous_due_date, new_due_date, reason, changed_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, cur.due_date, new_due_date, reason || 'Not specified', req.dmtUser.emp_id]
        );
        await query(
            `INSERT INTO dmt_task_updates (task_id, update_type, previous_due_date, new_due_date, update_note, updated_by)
             VALUES ($1, 'due_date_change', $2, $3, $4, $5)`,
            [id, cur.due_date, new_due_date, reason || null, req.dmtUser.emp_id]
        );
        dmtAudit('dmt_tasks', id, 'UPDATE', { due_date: cur.due_date }, { due_date: new_due_date, reason: reason || null }, req.dmtUser.emp_id);
        res.json(rows[0]);
    } catch (err) {
        console.error('[DMT] task due-date', err.message);
        res.status(500).json({ error: 'Failed to change due date', detail: err.message });
    }
});

// former update_task_fields(p_task_id, p_title, p_description, p_owner_id, p_priority, p_department_id) RPC
app.post('/api/dmt/tasks/:id/fields', dmtGuard('jh_lead'), async (req, res) => {
    const { id } = req.params;
    const { title, description, owner_id, priority, department_id } = req.body;
    try {
        const cur = (await query('SELECT title, description, owner_id, priority, department_id FROM dmt_tasks WHERE id = $1', [id]))[0];
        if (!cur) return res.status(404).json({ error: 'Task not found' });
        const rows = await query(
            `UPDATE dmt_tasks SET title = COALESCE($2, title), description = $3,
                    owner_id = COALESCE($4, owner_id), priority = COALESCE($5, priority),
                    department_id = COALESCE($6, department_id)
             WHERE id = $1 RETURNING *`,
            [id, title ?? null, description ?? null, owner_id ?? null, priority ?? null, department_id ?? null]
        );
        const me = req.dmtUser.emp_id;
        if (title && title !== cur.title) {
            await query(`INSERT INTO dmt_task_updates (task_id, update_type, previous_text, new_text, updated_by) VALUES ($1,'title_change',$2,$3,$4)`, [id, cur.title, title, me]);
        }
        if (owner_id && owner_id !== cur.owner_id) {
            await query(`INSERT INTO dmt_task_updates (task_id, update_type, previous_text, new_text, updated_by) VALUES ($1,'assignee_change',$2,$3,$4)`, [id, cur.owner_id, owner_id, me]);
        }
        if (description !== undefined && description !== cur.description) {
            await query(`INSERT INTO dmt_task_updates (task_id, update_type, previous_text, new_text, updated_by) VALUES ($1,'description_change',$2,$3,$4)`, [id, cur.description, description, me]);
        }
        dmtAudit('dmt_tasks', id, 'UPDATE', cur, rows[0], me);
        res.json(rows[0]);
    } catch (err) {
        console.error('[DMT] task fields', err.message);
        res.status(500).json({ error: 'Failed to update task', detail: err.message });
    }
});

// add a plain comment to a task's activity feed
app.post('/api/dmt/tasks/:id/comment', dmtGuard('jh_lead'), async (req, res) => {
    const { text } = req.body;
    if (!String(text || '').trim()) return res.status(400).json({ error: 'text is required' });
    try {
        const exists = await query('SELECT 1 FROM dmt_tasks WHERE id = $1', [req.params.id]);
        if (!exists.length) return res.status(404).json({ error: 'Task not found' });
        const rows = await query(
            `INSERT INTO dmt_task_updates (task_id, update_type, update_note, updated_by)
             VALUES ($1, 'comment', $2, $3) RETURNING *`,
            [req.params.id, text.trim(), req.dmtUser.emp_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[DMT] task comment', err.message);
        res.status(500).json({ error: 'Failed to add comment', detail: err.message });
    }
});

// former update_pd_job_stage(p_job_id, p_new_stage, p_note, p_feedback_note) RPC
app.post('/api/dmt/pd-jobs/:id/stage', dmtGuard('module_lead'), async (req, res) => {
    const { id } = req.params;
    const { new_stage, note, feedback_note } = req.body;
    const VALID = {
        upcoming: ['in_process', 'abandoned'],
        in_process: ['processing_finished', 'abandoned'],
        processing_finished: ['feedback_approved', 'feedback_rejected', 'abandoned'],
    };
    try {
        const cur = (await query('SELECT stage FROM dmt_pd_jobs WHERE id = $1', [id]))[0];
        if (!cur) return res.status(404).json({ error: 'PD job not found' });
        if (!(VALID[cur.stage] || []).includes(new_stage)) {
            return res.status(400).json({ error: `Invalid stage transition from ${cur.stage} to ${new_stage}` });
        }
        if (['feedback_rejected', 'abandoned'].includes(new_stage) && !String(feedback_note || '').trim()) {
            return res.status(400).json({ error: `Feedback note is required when moving to ${new_stage}` });
        }
        const closes = ['feedback_approved', 'feedback_rejected', 'abandoned'].includes(new_stage);
        const rows = await query(
            `UPDATE dmt_pd_jobs SET stage = $2, feedback_note = COALESCE($3, feedback_note),
                    closed_at = ${closes ? 'now()' : 'closed_at'}
             WHERE id = $1 RETURNING *`,
            [id, new_stage, feedback_note || null]
        );
        await query(
            `INSERT INTO dmt_pd_stage_history (job_id, from_stage, to_stage, changed_by, note) VALUES ($1,$2,$3,$4,$5)`,
            [id, cur.stage, new_stage, req.dmtUser.emp_id, note || null]
        );
        dmtAudit('dmt_pd_jobs', id, 'UPDATE', { stage: cur.stage }, { stage: new_stage, feedback_note: feedback_note || null }, req.dmtUser.emp_id);
        res.json(rows[0]);
    } catch (err) {
        console.error('[DMT] pd stage', err.message);
        res.status(500).json({ error: 'Failed to change PD stage', detail: err.message });
    }
});

// former spawn_pd_job_from(p_source_job_id, p_respawn_reason, p_new_title, p_new_target_dispatch_date) RPC
app.post('/api/dmt/pd-jobs/:id/spawn', dmtGuard('module_lead'), async (req, res) => {
    const { id } = req.params;
    const { respawn_reason, new_title, new_target_dispatch_date } = req.body;
    if (!String(respawn_reason || '').trim()) return res.status(400).json({ error: 'Respawn reason is required' });
    try {
        const src = (await query('SELECT * FROM dmt_pd_jobs WHERE id = $1', [id]))[0];
        if (!src) return res.status(404).json({ error: 'Source PD job not found' });
        if (!['feedback_rejected', 'abandoned'].includes(src.stage)) {
            return res.status(400).json({ error: 'Can only spawn from a rejected or abandoned job' });
        }
        const rows = await query(
            `INSERT INTO dmt_pd_jobs (factory_id, title, customer, product, substrate, target_dispatch_date, previous_job_id, respawn_reason, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [src.factory_id, (new_title || '').trim() || src.title, src.customer, src.product, src.substrate,
             new_target_dispatch_date || null, src.id, respawn_reason, req.dmtUser.emp_id]
        );
        dmtAudit('dmt_pd_jobs', rows[0]?.id, 'INSERT', null, { spawned_from: src.id, respawn_reason }, req.dmtUser.emp_id);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[DMT] pd spawn', err.message);
        res.status(500).json({ error: 'Failed to spawn PD job', detail: err.message });
    }
});

// DMT audit log viewer — newest first, optional ?table= and ?limit= (default 200, max 1000).
app.get('/api/dmt/audit', dmtGuard('be_lead'), async (req, res) => {
    try {
        const clauses = [];
        const params = [];
        if (req.query.table) { params.push(req.query.table); clauses.push(`al.table_name = $${params.length}`); }
        const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
        const lim = Math.min(1000, parseInt(req.query.limit, 10) || 200);
        const rows = await query(
            `SELECT al.*, ud.name AS performed_by_name
             FROM dmt_audit_logs al
             LEFT JOIN user_details ud ON ud.emp_id = al.performed_by
             ${where}
             ORDER BY al.performed_at DESC
             LIMIT ${lim}`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('[DMT] audit list', err.message);
        res.status(500).json({ error: 'Failed to load audit log' });
    }
});

// ---------------------------------------------------------------------------
// DMT Tiers (T4/T3/T2, more to follow) — per-factory review tiers.
// BE Lead: create a tier, activate/deactivate it, appoint/remove its Lead.
// BE Lead OR that tier's own Lead: add/remove members, pick which KPIs it sees.
// ---------------------------------------------------------------------------

// True if `dmtUser` may manage membership/KPIs for this tier row (BE Lead, or its own Lead).
function dmtCanManageTier(tierRow, dmtUser) {
    if (dmtTierAtLeast(dmtUser.tier, 'be_lead')) return true;
    return tierRow.lead_emp_id === dmtUser.emp_id;
}

// List this factory's tiers. BE Lead sees all (incl. inactive); everyone else sees only
// active tiers they're the Lead of or a member of.
app.get('/api/dmt/tiers', dmtGuard('jh_lead'), async (req, res) => {
    try {
        const fid = await dmtUserFactoryId(req.dmtUser);
        const isBe = dmtTierAtLeast(req.dmtUser.tier, 'be_lead');
        const rows = await query(
            `SELECT t.*, ud.name AS lead_name,
                    (SELECT count(*) FROM dmt_tier_member m WHERE m.tier_id = t.id) AS member_count,
                    (SELECT count(*) FROM dmt_tier_kpi k WHERE k.tier_id = t.id) AS kpi_count,
                    EXISTS(SELECT 1 FROM dmt_tier_member m WHERE m.tier_id = t.id AND m.emp_id = $2) AS is_member
             FROM dmt_tier t
             LEFT JOIN user_details ud ON ud.emp_id = t.lead_emp_id
             WHERE t.factory_id = $1
             ORDER BY t.name ASC`,
            [fid, req.dmtUser.emp_id]
        );
        const visible = isBe
            ? rows
            : rows.filter(r => r.is_active && (r.is_member || r.lead_emp_id === req.dmtUser.emp_id));
        res.json(visible);
    } catch (err) {
        console.error('[DMT] GET tiers', err.message);
        res.status(500).json({ error: 'Failed to list tiers' });
    }
});

// Create a tier (BE Lead only). Body: { name }.
app.post('/api/dmt/tiers', dmtGuard('be_lead'), async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'name is required' });
        const fid = await dmtUserFactoryId(req.dmtUser);
        const rows = await query(
            `INSERT INTO dmt_tier (factory_id, name) VALUES ($1, $2) RETURNING *`,
            [fid, name]
        );
        dmtAudit('dmt_tier', rows[0].id, 'INSERT', null, rows[0], req.dmtUser.emp_id);
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: `A tier named "${req.body.name}" already exists for this plant` });
        console.error('[DMT] POST tiers', err.message);
        res.status(500).json({ error: 'Failed to create tier' });
    }
});

// Toggle active / set-or-change the Lead (BE Lead only). Body: { is_active?, lead_emp_id? }.
app.patch('/api/dmt/tiers/:id', dmtGuard('be_lead'), async (req, res) => {
    try {
        const own = await query('SELECT * FROM dmt_tier WHERE id = $1', [req.params.id]);
        if (!own.length) return res.status(404).json({ error: 'Tier not found' });
        const fid = await dmtUserFactoryId(req.dmtUser);
        if (String(own[0].factory_id) !== String(fid)) return res.status(403).json({ error: 'Not your plant' });

        const sets = [];
        const params = [];
        if ('is_active' in req.body) { params.push(!!req.body.is_active); sets.push(`is_active = $${params.length}`); }
        if ('lead_emp_id' in req.body) {
            const leadEmpId = req.body.lead_emp_id || null;
            if (leadEmpId) {
                const leadRows = await query('SELECT emp_id FROM user_details WHERE emp_id = $1 AND is_active = true', [leadEmpId]);
                if (!leadRows.length) return res.status(400).json({ error: 'Lead must be a real, active user' });
            }
            params.push(leadEmpId); sets.push(`lead_emp_id = $${params.length}`);
        }
        if (!sets.length) return res.status(400).json({ error: 'No writable fields supplied' });
        params.push(req.params.id);
        const rows = await query(`UPDATE dmt_tier SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
        dmtAudit('dmt_tier', rows[0].id, 'UPDATE', own[0], rows[0], req.dmtUser.emp_id);
        res.json(rows[0]);
    } catch (err) {
        console.error('[DMT] PATCH tiers/:id', err.message);
        res.status(500).json({ error: 'Failed to update tier' });
    }
});

// Members of a tier — visible to anyone who can see the tier at all.
app.get('/api/dmt/tiers/:id/members', dmtGuard('jh_lead'), async (req, res) => {
    try {
        const rows = await query(
            `SELECT m.*, ud.name, ud.role FROM dmt_tier_member m
             JOIN user_details ud ON ud.emp_id = m.emp_id
             WHERE m.tier_id = $1 ORDER BY ud.name ASC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[DMT] GET tier members', err.message);
        res.status(500).json({ error: 'Failed to list tier members' });
    }
});

// Add a member (BE Lead or this tier's own Lead).
app.post('/api/dmt/tiers/:id/members', dmtGuard('jh_lead'), async (req, res) => {
    try {
        const tierRows = await query('SELECT * FROM dmt_tier WHERE id = $1', [req.params.id]);
        if (!tierRows.length) return res.status(404).json({ error: 'Tier not found' });
        if (!dmtCanManageTier(tierRows[0], req.dmtUser)) return res.status(403).json({ error: 'Only BE Lead or this tier\'s Lead can manage members' });
        const empId = req.body.emp_id;
        if (!empId) return res.status(400).json({ error: 'emp_id is required' });
        const personRows = await query('SELECT emp_id FROM user_details WHERE emp_id = $1 AND is_active = true', [empId]);
        if (!personRows.length) return res.status(400).json({ error: 'Not a real, active user' });
        const rows = await query(
            `INSERT INTO dmt_tier_member (tier_id, emp_id) VALUES ($1, $2)
             ON CONFLICT (tier_id, emp_id) DO NOTHING RETURNING *`,
            [req.params.id, empId]
        );
        dmtAudit('dmt_tier_member', rows[0]?.id || req.params.id, 'INSERT', null, { tier_id: req.params.id, emp_id: empId }, req.dmtUser.emp_id);
        res.status(201).json(rows[0] || { tier_id: req.params.id, emp_id: empId, already_member: true });
    } catch (err) {
        console.error('[DMT] POST tier members', err.message);
        res.status(500).json({ error: 'Failed to add member' });
    }
});

// Remove a member (BE Lead or this tier's own Lead).
app.delete('/api/dmt/tiers/:id/members/:empId', dmtGuard('jh_lead'), async (req, res) => {
    try {
        const tierRows = await query('SELECT * FROM dmt_tier WHERE id = $1', [req.params.id]);
        if (!tierRows.length) return res.status(404).json({ error: 'Tier not found' });
        if (!dmtCanManageTier(tierRows[0], req.dmtUser)) return res.status(403).json({ error: 'Only BE Lead or this tier\'s Lead can manage members' });
        await query('DELETE FROM dmt_tier_member WHERE tier_id = $1 AND emp_id = $2', [req.params.id, req.params.empId]);
        dmtAudit('dmt_tier_member', req.params.id, 'DELETE', { tier_id: req.params.id, emp_id: req.params.empId }, null, req.dmtUser.emp_id);
        res.json({ success: true });
    } catch (err) {
        console.error('[DMT] DELETE tier member', err.message);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

// KPIs curated for a tier — visible to anyone who can see the tier at all.
app.get('/api/dmt/tiers/:id/kpis', dmtGuard('jh_lead'), async (req, res) => {
    try {
        const rows = await query(
            `SELECT k.*, km.name, km.unit, km.target_value, km.direction, km.frequency, km.department_id
             FROM dmt_tier_kpi k
             JOIN dmt_kpi_master km ON km.id = k.kpi_id
             WHERE k.tier_id = $1 ORDER BY km.name ASC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[DMT] GET tier kpis', err.message);
        res.status(500).json({ error: 'Failed to list tier KPIs' });
    }
});

// Replace the full KPI set for a tier (BE Lead or this tier's own Lead). Body: { kpi_ids: [] }.
app.put('/api/dmt/tiers/:id/kpis', dmtGuard('jh_lead'), async (req, res) => {
    try {
        const tierRows = await query('SELECT * FROM dmt_tier WHERE id = $1', [req.params.id]);
        if (!tierRows.length) return res.status(404).json({ error: 'Tier not found' });
        if (!dmtCanManageTier(tierRows[0], req.dmtUser)) return res.status(403).json({ error: 'Only BE Lead or this tier\'s Lead can manage its KPIs' });
        const kpiIds = Array.isArray(req.body.kpi_ids) ? [...new Set(req.body.kpi_ids)] : [];
        const before = await query('SELECT kpi_id FROM dmt_tier_kpi WHERE tier_id = $1', [req.params.id]);
        await query('DELETE FROM dmt_tier_kpi WHERE tier_id = $1', [req.params.id]);
        if (kpiIds.length) {
            const values = kpiIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await query(`INSERT INTO dmt_tier_kpi (tier_id, kpi_id) VALUES ${values}`, [req.params.id, ...kpiIds]);
        }
        dmtAudit('dmt_tier_kpi', req.params.id, 'UPDATE', before, kpiIds, req.dmtUser.emp_id);
        res.json({ success: true, kpi_ids: kpiIds });
    } catch (err) {
        console.error('[DMT] PUT tier kpis', err.message);
        res.status(500).json({ error: 'Failed to update tier KPIs' });
    }
});

console.log('[DMT] routes registered:', Object.keys(DMT_RESOURCES).length, 'resources + operations');

process.on('uncaughtException', (err) => {
    console.error('[Backend Server] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Backend Server] Unhandled Rejection:', reason);
});

// Standalone execution entry point
if (process.argv[1] && path.basename(process.argv[1]) === 'server.js') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[Backend Server] TPM Fulcrum listening on http://0.0.0.0:${PORT}`);
    });
}
