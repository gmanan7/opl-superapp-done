import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
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
        { id: 'm-1', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'jh_kpi', is_enabled: true },
        { id: 'm-2', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'opl', is_enabled: true },
        { id: 'm-3', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'kaizen', is_enabled: true },
        { id: 'm-4', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'clti', is_enabled: true },
        { id: 'm-5', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'abnormality', is_enabled: true },
        { id: 'm-6', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'meetings', is_enabled: true },
        { id: 'm-7', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'jh_audit', is_enabled: true },
        { id: 'm-8', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'dashboards', is_enabled: true },
        { id: 'm-9', factory_id: '00000000-0000-0000-0000-000000000001', module_key: 'content_translation', is_enabled: true }
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
    abnormalities: [
        {
            id: 'abn-1',
            factory_id: '00000000-0000-0000-0000-000000000001',
            machine_id: 'mac-1',
            subsection_id: 'sub-1',
            reporter_worker_id: '11111111-1111-1111-1111-111111111111',
            title: 'Oil Leakage at Main Gearbox',
            description: 'Minor oil seepage observed during autonomous maintenance audit.',
            status: 'open',
            type: 'minor_flaw',
            tag_color: 'white',
            before_image_url: null,
            after_image_url: null,
            target_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
            closed_at: null,
            created_at: new Date().toISOString()
        }
    ],
    abnormalityAssignments: [],
    abnormalityUpdates: [],
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
            classification: 'Knowledge',
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
            classification: 'Knowledge',
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
    kpiDefinitions: [
        { id: 'kpi-1', factory_id: '00000000-0000-0000-0000-000000000001', name: 'Autonomous Cleaning Completion %', unit: '%', target_value: 95, is_active: true },
        { id: 'kpi-2', factory_id: '00000000-0000-0000-0000-000000000001', name: 'Tag Resolution Time', unit: 'Days', target_value: 3, is_active: true }
    ],
    kpiEntries: [],
};
// ----------------------------------------------------------------------------
// Express REST API Routes (/api/*)
// ----------------------------------------------------------------------------
// 1. Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: pool ? 'postgres' : 'in-memory-preview' });
});
// 2. Auth Routes
app.post('/api/auth/login', async (req, res) => {
    const { email, employee_id } = req.body;
    try {
        if (pool) {
            const rows = await query('SELECT * FROM user_details WHERE (email = $1 OR emp_id = $2 OR emp_id = $1) AND is_active = true LIMIT 1', [email || '', employee_id || email || '']);
            if (rows.length > 0) {
                const u = { ...rows[0], id: rows[0].emp_id, employee_id: rows[0].emp_id };
                return res.json({ user: u, token: `token-${u.emp_id}` });
            }
        }
        const user = mockDb.userDetails.find(u => (email && u.email === email) || (employee_id && u.emp_id === employee_id) || u.email === 'admin@fulcrum.com') || mockDb.userDetails[0];
        const resUser = { ...user, id: user.emp_id, employee_id: user.emp_id };
        res.json({ user: resUser, token: `token-${user.emp_id}` });
    }
    catch {
        res.status(500).json({ error: 'Login failed' });
    }
});
app.get('/api/auth/me', async (req, res) => {
    const workerId = req.headers['x-worker-id'] || '136109';
    try {
        if (pool) {
            const rows = await query('SELECT * FROM user_details WHERE emp_id = $1 OR email = $1 LIMIT 1', [workerId]);
            if (rows.length > 0) {
                const u = { ...rows[0], id: rows[0].emp_id, employee_id: rows[0].emp_id };
                return res.json([u]);
            }
        }
        const user = mockDb.userDetails.find(u => u.emp_id === workerId || u.email === workerId) || mockDb.userDetails[0];
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
app.get('/api/org/jh-groups', async (req, res) => {
    const { module_group_id } = req.query;
    try {
        if (pool) {
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
    const { name, module_group_id, factory_id, leader_emp_id, leader_name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Group name is required' });
    }
    try {
        if (pool) {
            const rows = await query(`
                INSERT INTO jh_group (name, module_group_id, factory_id, leader_emp_id, leader_name, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
                RETURNING *
            `, [name, module_group_id || null, factory_id || null, leader_emp_id || null, leader_name || null]);
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
            await query('DELETE FROM jh_groups_list WHERE id = $1', [id]);
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
app.get('/api/org/modules', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM factory_module');
            return res.json(rows);
        }
        res.json(mockDb.modules);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch modules' });
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
    const { module, factory_id, module_lead_emp_id, module_lead_name } = req.body;
    if (!module) {
        return res.status(400).json({ error: 'Module name is required' });
    }
    try {
        if (pool) {
            const rows = await query(`
                INSERT INTO module_groups (module, factory_id, module_lead_emp_id, module_lead_name)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [module, factory_id || null, module_lead_emp_id || null, module_lead_name || null]);
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
app.patch('/api/org/modules/:key', async (req, res) => {
    const { key } = req.params;
    const { is_enabled } = req.body;
    try {
        if (pool) {
            const rows = await query(`UPDATE factory_module SET is_enabled = $1 WHERE module_key = $2 RETURNING *`, [is_enabled, key]);
            return res.json(rows[0]);
        }
        const mod = mockDb.modules.find(m => m.module_key === key);
        if (mod)
            mod.is_enabled = is_enabled;
        res.json(mod);
    }
    catch {
        res.status(500).json({ error: 'Failed to update module' });
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
    const { jh_group_id } = req.query;
    try {
        if (pool) {
            let sql = 'SELECT * FROM machine WHERE is_active = true';
            const params = [];
            if (jh_group_id) {
                sql += ' AND jh_group_id = $1';
                params.push(jh_group_id);
            }
            sql += ' ORDER BY name ASC';
            const rows = await query(sql, params);
            return res.json(rows);
        }
        let resList = mockDb.machines.filter(m => m.is_active);
        if (jh_group_id) {
            resList = resList.filter(m => m.jh_group_id === jh_group_id);
        }
        res.json(resList);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch machines' });
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
// 6. Abnormalities
app.get('/api/abnormalities', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM abnormality ORDER BY created_at DESC');
            return res.json(rows);
        }
        res.json(mockDb.abnormalities);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch abnormalities' });
    }
});
app.get('/api/abnormalities/:id', async (req, res) => {
    const { id } = req.params;
    try {
        if (pool) {
            const rows = await query('SELECT * FROM abnormality WHERE id = $1', [id]);
            const assign = await query('SELECT * FROM abnormality_assignment WHERE abnormality_id = $1', [id]);
            const updates = await query('SELECT * FROM abnormality_update WHERE abnormality_id = $1 ORDER BY created_at ASC', [id]);
            if (rows.length === 0)
                return res.status(404).json({ error: 'Not found' });
            return res.json({ abnormality: rows[0], assignments: assign, updates });
        }
        const abn = mockDb.abnormalities.find(a => a.id === id);
        if (!abn)
            return res.status(404).json({ error: 'Not found' });
        const assign = mockDb.abnormalityAssignments.filter(a => a.abnormality_id === id);
        const updates = mockDb.abnormalityUpdates.filter(u => u.abnormality_id === id);
        res.json({ abnormality: abn, assignments: assign, updates });
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch abnormality' });
    }
});
app.post('/api/abnormalities', async (req, res) => {
    const payload = req.body;
    try {
        if (pool) {
            const rows = await query(`INSERT INTO abnormality (factory_id, machine_id, subsection_id, reporter_worker_id, title, description, status, type, tag_color, before_image_url, target_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`, [
                '00000000-0000-0000-0000-000000000001',
                payload.machine_id || null,
                payload.subsection_id || null,
                payload.reporter_worker_id || '11111111-1111-1111-1111-111111111111',
                payload.title,
                payload.description || '',
                payload.status || 'open',
                payload.type || 'minor_flaw',
                payload.tag_color || 'white',
                payload.before_image_url || null,
                payload.target_date || null
            ]);
            return res.json(rows[0]);
        }
        const newAbn = {
            id: `abn-${Date.now()}`,
            factory_id: '00000000-0000-0000-0000-000000000001',
            machine_id: payload.machine_id || null,
            subsection_id: payload.subsection_id || null,
            reporter_worker_id: payload.reporter_worker_id || '11111111-1111-1111-1111-111111111111',
            title: payload.title,
            description: payload.description || '',
            status: payload.status || 'open',
            type: payload.type || 'minor_flaw',
            tag_color: payload.tag_color || 'white',
            before_image_url: payload.before_image_url || null,
            after_image_url: null,
            target_date: payload.target_date || null,
            closed_at: null,
            created_at: new Date().toISOString()
        };
        mockDb.abnormalities.unshift(newAbn);
        res.json(newAbn);
    }
    catch {
        res.status(500).json({ error: 'Failed to create abnormality' });
    }
});
// 7. OPL (One Point Lessons)
app.get('/api/opl', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM opl WHERE is_active = true ORDER BY created_at DESC');
            return res.json(rows);
        }
        res.json(mockDb.opls);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch OPLs' });
    }
});
app.get('/api/opl/training-due', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM opl_training_due_v');
            return res.json(rows);
        }
        const dueList = mockDb.opls.map(o => ({
            opl_id: o.id,
            opl_title: o.title,
            factory_id: o.factory_id,
            jh_group_id: o.jh_group_id,
            worker_id: '11111111-1111-1111-1111-111111111111',
            worker_name: 'Plant Admin',
            last_trained_at: o.created_at,
            is_due: false
        }));
        res.json(dueList);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch OPL training due' });
    }
});
app.get('/api/opl-details', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT opl_id, title, content, before_image, after_image, before_description, after_description, classification, submitted_by, status, timestamp FROM opl_details ORDER BY timestamp DESC');
            return res.json(rows);
        }
        res.json(mockDb.oplDetails);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch OPL details' });
    }
});
app.post('/api/opl-details', async (req, res) => {
    const { title, content, before_image, after_image, before_description, before_remarks, after_description, after_remarks, classification, submitted_by, status } = req.body;
    const submitter = submitted_by || (req.headers['x-worker-id'] ? String(req.headers['x-worker-id']) : 'Plant Admin');
    const itemStatus = status || 'draft';
    const itemClass = classification || 'Knowledge';
    const finalBeforeDesc = before_description || before_remarks || null;
    const finalAfterDesc = after_description || after_remarks || null;
    try {
        if (pool) {
            const rows = await query(`INSERT INTO opl_details (title, content, before_image, after_image, before_description, after_description, classification, submitted_by, status, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING opl_id, title, content, before_image, after_image, before_description, after_description, classification, submitted_by, status, timestamp`, [
                title,
                content || '',
                before_image || null,
                after_image || null,
                finalBeforeDesc,
                finalAfterDesc,
                itemClass,
                submitter,
                itemStatus
            ]);
            const created = rows[0];
            if (created) {
                await query(
                    `INSERT INTO opl_audit_trail (opl_id, action, status_from, status_to, submitted_by_from, submitted_by_to, performed_by, comments, timestamp)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
                    [String(created.opl_id), 'created', null, itemStatus, null, submitter, submitter, 'Created OPL Detail']
                ).catch(() => {});
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
    const actor = performed_by || req.headers['x-worker-id'] || 'Plant Admin';
    try {
        if (pool) {
            const existingRows = await query('SELECT * FROM opl_details WHERE opl_id = $1', [id]);
            const existing = existingRows[0];
            if (!existing) return res.status(404).json({ error: 'OPL detail not found' });

            const newTitle = title !== undefined ? title : existing.title;
            const newContent = content !== undefined ? content : existing.content;
            const newBeforeImg = before_image !== undefined ? before_image : existing.before_image;
            const newAfterImg = after_image !== undefined ? after_image : existing.after_image;
            const newBeforeDesc = before_description !== undefined ? before_description : existing.before_description;
            const newAfterDesc = after_description !== undefined ? after_description : existing.after_description;
            const newClass = classification !== undefined ? classification : existing.classification;
            const newSubmitter = submitted_by !== undefined ? submitted_by : existing.submitted_by;
            const newStatus = status !== undefined ? status : existing.status;
            const newStar = is_star !== undefined ? Boolean(is_star) : (existing.is_star || false);
            const newRejection = rejection_reason !== undefined ? rejection_reason : (existing.rejection_reason || null);

            // Attempt to update with newly supported columns gracefully
            let updatedRows = [];
            try {
                updatedRows = await query(
                    `UPDATE opl_details SET
                       title = $1, content = $2, before_image = $3, after_image = $4,
                       before_description = $5, after_description = $6, classification = $7,
                       submitted_by = $8, status = $9, is_star = $10, rejection_reason = $11
                     WHERE opl_id = $12 RETURNING *`,
                    [newTitle, newContent, newBeforeImg, newAfterImg, newBeforeDesc, newAfterDesc, newClass, newSubmitter, newStatus, newStar, newRejection, id]
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
                        rejection_reason: newRejection
                    })
                ]
            ).catch(() => {});

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
    const actor = performed_by || req.headers['x-worker-id'] || 'Plant Admin';
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
app.post('/api/opl', async (req, res) => {
    const payload = req.body;
    const submitter = payload.submitted_by || payload.author_worker_id || 'Plant Admin';
    const textContent = payload.content_text || payload.content || '';
    const beforeImg = payload.before_image_url || payload.before_image || null;
    const afterImg = payload.after_image_url || payload.after_image || null;
    try {
        if (pool) {
            const rows = await query(`INSERT INTO opl (factory_id, machine_id, jh_group_id, author_worker_id, title, opl_type, content_text, before_remarks, after_remarks, before_image_url, after_image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`, [
                '00000000-0000-0000-0000-000000000001',
                payload.machine_id || null,
                payload.jh_group_id || null,
                payload.author_worker_id || '11111111-1111-1111-1111-111111111111',
                payload.title,
                payload.opl_type || 'one_point_lesson',
                textContent,
                payload.before_remarks || '',
                payload.after_remarks || '',
                beforeImg,
                afterImg
            ]);
            await query(`INSERT INTO opl_details (title, content, before_image, after_image, submitted_by, status, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`, [payload.title, textContent, beforeImg, afterImg, submitter, 'published']).catch(() => { });
            return res.json(rows[0]);
        }
        const newOpl = {
            id: `opl-${Date.now()}`,
            factory_id: '00000000-0000-0000-0000-000000000001',
            machine_id: payload.machine_id || null,
            jh_group_id: payload.jh_group_id || null,
            author_worker_id: payload.author_worker_id || '11111111-1111-1111-1111-111111111111',
            title: payload.title,
            opl_type: payload.opl_type || 'one_point_lesson',
            content_text: textContent,
            before_remarks: payload.before_remarks || '',
            after_remarks: payload.after_remarks || '',
            before_image_url: beforeImg,
            after_image_url: afterImg,
            status: 'published',
            retrain_frequency_days: 90,
            retired_at: null,
            retired_by: null,
            is_active: true,
            created_at: new Date().toISOString()
        };
        mockDb.opls.unshift(newOpl);
        mockDb.oplDetails.unshift({
            opl_id: mockDb.oplDetails.length + 1,
            title: payload.title,
            content: textContent,
            before_image: beforeImg,
            after_image: afterImg,
            submitted_by: submitter,
            timestamp: new Date().toISOString()
        });
        res.json(newOpl);
    }
    catch {
        res.status(500).json({ error: 'Failed to create OPL' });
    }
});
// 8. Kaizens
app.get('/api/kaizen', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM kaizen ORDER BY created_at DESC');
            return res.json(rows);
        }
        res.json(mockDb.kaizens);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch Kaizens' });
    }
});
app.post('/api/kaizen', async (req, res) => {
    const payload = req.body;
    try {
        if (pool) {
            const rows = await query(`INSERT INTO kaizen (factory_id, jh_group_id, author_worker_id, team_member_ids, title, description, before_remarks, after_remarks, before_image_url, after_image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`, [
                '00000000-0000-0000-0000-000000000001',
                payload.jh_group_id || null,
                payload.author_worker_id || '11111111-1111-1111-1111-111111111111',
                payload.team_member_ids || [],
                payload.title,
                payload.description || '',
                payload.before_remarks || '',
                payload.after_remarks || '',
                payload.before_image_url || null,
                payload.after_image_url || null
            ]);
            return res.json(rows[0]);
        }
        const newKz = {
            id: `kz-${Date.now()}`,
            factory_id: '00000000-0000-0000-0000-000000000001',
            jh_group_id: payload.jh_group_id || null,
            author_worker_id: payload.author_worker_id || '11111111-1111-1111-1111-111111111111',
            team_member_ids: payload.team_member_ids || [],
            title: payload.title,
            description: payload.description || '',
            before_remarks: payload.before_remarks || '',
            after_remarks: payload.after_remarks || '',
            before_image_url: payload.before_image_url || null,
            after_image_url: payload.after_image_url || null,
            status: 'approved',
            created_at: new Date().toISOString()
        };
        mockDb.kaizens.unshift(newKz);
        res.json(newKz);
    }
    catch {
        res.status(500).json({ error: 'Failed to create Kaizen' });
    }
});
// 9. KPIs
app.get('/api/kpis/definitions', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM jh_kpi_definition WHERE is_active = true');
            return res.json(rows);
        }
        res.json(mockDb.kpiDefinitions);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch KPI definitions' });
    }
});
app.get('/api/kpis/entries', async (req, res) => {
    try {
        if (pool) {
            const rows = await query('SELECT * FROM jh_kpi_entry ORDER BY entry_date DESC');
            return res.json(rows);
        }
        res.json(mockDb.kpiEntries);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch KPI entries' });
    }
});
app.post('/api/kpis/entries', async (req, res) => {
    const { definition_id, jh_group_id, entry_date, value, recorded_by_worker_id } = req.body;
    try {
        if (pool) {
            const rows = await query(`INSERT INTO jh_kpi_entry (definition_id, jh_group_id, entry_date, value, recorded_by_worker_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (definition_id, jh_group_id, entry_date)
         DO UPDATE SET value = EXCLUDED.value RETURNING *`, [definition_id, jh_group_id, entry_date, value, recorded_by_worker_id || '11111111-1111-1111-1111-111111111111']);
            return res.json(rows[0]);
        }
        const idx = mockDb.kpiEntries.findIndex(e => e.definition_id === definition_id && e.jh_group_id === jh_group_id && e.entry_date === entry_date);
        if (idx !== -1) {
            mockDb.kpiEntries[idx].value = value;
            return res.json(mockDb.kpiEntries[idx]);
        }
        const newEntry = {
            id: `kpie-${Date.now()}`,
            definition_id,
            jh_group_id,
            entry_date,
            value,
            recorded_by_worker_id: recorded_by_worker_id || '11111111-1111-1111-1111-111111111111',
            created_at: new Date().toISOString()
        };
        mockDb.kpiEntries.push(newEntry);
        res.json(newEntry);
    }
    catch {
        res.status(500).json({ error: 'Failed to record KPI entry' });
    }
});
// 10. File Upload & Translations
app.post('/api/upload', (req, res) => {
    const { imageBase64, filename } = req.body;
    const url = imageBase64 || `https://picsum.photos/600/400?random=${Math.floor(Math.random() * 1000)}`;
    res.json({ url, key: filename || `upload-${Date.now()}.png` });
});
app.post('/api/translate', (req, res) => {
    const { text, targetLang } = req.body;
    res.json({ translatedText: `[${targetLang || 'translated'}] ${text}` });
});

// --- DIAGNOSTIC LOGGING (temporary, remove once issue is found) ---
process.on('exit', (code) => {
    console.log(`[DEBUG] Process exiting with code: ${code}`);
    console.trace('[DEBUG] Exit trace');
});
process.on('SIGINT', () => console.log('[DEBUG] Received SIGINT'));
process.on('SIGTERM', () => console.log('[DEBUG] Received SIGTERM'));
process.on('SIGHUP', () => console.log('[DEBUG] Received SIGHUP'));
process.on('uncaughtException', (err) => {
    console.error('[DEBUG] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[DEBUG] Unhandled Rejection:', reason);
});
// --- END DIAGNOSTIC LOGGING ---

// Standalone execution entry point
if (process.argv[1] && path.basename(process.argv[1]) === 'server.js') {
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`[Backend Server] TPM Fulcrum listening on http://0.0.0.0:${PORT}`);
        console.log('[DEBUG] Active handles:', process._getActiveHandles().length);
    });
    server.ref();

    // Forced keepalive timer -- if the server STILL exits with this running,
    // something external is killing the process (not a Node event-loop issue).
    setInterval(() => {}, 1000 * 60 * 60);
}