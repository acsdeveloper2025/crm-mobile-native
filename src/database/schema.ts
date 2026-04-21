// SQLite Database Schema and Migrations
// Offline-first schema for field verification data

export const DB_VERSION = 10;

/**
 * All CREATE TABLE statements for the local SQLite database.
 * Tables mirror backend entities but add sync-tracking columns.
 */
export const SCHEMA_SQL = `
-- Tasks (verification assignments)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  case_id INTEGER NOT NULL,
  verification_task_id TEXT NOT NULL,
  verification_task_number TEXT,
  title TEXT NOT NULL,
  description TEXT,
  customer_name TEXT NOT NULL,
  customer_calling_code TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_pincode TEXT,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL DEFAULT 'ASSIGNED',
  priority TEXT DEFAULT 'MEDIUM',
  assigned_at TEXT,
  updated_at TEXT,
  completed_at TEXT,
  notes TEXT,
  verification_type TEXT,
  verification_outcome TEXT,
  applicant_type TEXT,
  backend_contact_number TEXT,
  created_by_backend_user TEXT,
  assigned_to_field_user TEXT,
  client_id INTEGER,
  client_name TEXT,
  client_code TEXT,
  product_id INTEGER,
  product_name TEXT,
  product_code TEXT,
  verification_type_id INTEGER,
  verification_type_name TEXT,
  verification_type_code TEXT,
  form_data_json TEXT,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  revoked_by_name TEXT,
  revoke_reason TEXT,
  in_progress_at TEXT,
  saved_at TEXT,
  is_saved INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  local_updated_at TEXT NOT NULL
);

-- Attachments (photos, documents)
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  backend_attachment_id TEXT,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  local_path TEXT NOT NULL,
  remote_path TEXT,
  thumbnail_path TEXT,
  uploaded_at TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  location_timestamp TEXT,
  component_type TEXT NOT NULL DEFAULT 'photo',
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  last_sync_attempt_at TEXT,
  sync_error TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Location trail
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL NOT NULL,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'GPS',
  task_id TEXT,
  activity_type TEXT,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  synced_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Form submissions
CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  form_type TEXT NOT NULL,
  form_data_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  submitted_at TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  location_timestamp TEXT,
  location_address TEXT,
  metadata_json TEXT NOT NULL,
  attachment_ids_json TEXT NOT NULL DEFAULT '[]',
  photo_data_json TEXT NOT NULL DEFAULT '[]',
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  sync_attempts INTEGER NOT NULL DEFAULT 0,
  last_sync_attempt_at TEXT,
  sync_error TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Form Templates (JSON configuration for dynamic forms)
CREATE TABLE IF NOT EXISTS form_templates (
  id TEXT PRIMARY KEY,
  form_type TEXT NOT NULL,
  verification_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sections_json TEXT NOT NULL,
  version TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sync queue (offline operations to process)
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  priority INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 10,
  last_error TEXT,
  next_retry_at TEXT,
  started_at TEXT,
  lease_expires_at TEXT,
  user_id TEXT
);

-- Sync metadata (singleton - tracks last sync times)
CREATE TABLE IF NOT EXISTS sync_metadata (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_download_sync_at TEXT,
  last_upload_sync_at TEXT,
  last_full_sync_at TEXT,
  sync_in_progress INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL
);

-- User session
CREATE TABLE IF NOT EXISTS user_session (
  id INTEGER PRIMARY KEY DEFAULT 1,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  employee_id TEXT,
  designation TEXT,
  department TEXT,
  profile_photo_url TEXT,
  assigned_pincodes_json TEXT NOT NULL DEFAULT '[]',
  assigned_areas_json TEXT NOT NULL DEFAULT '[]',
  token_expires_at TEXT NOT NULL,
  logged_in_at TEXT NOT NULL
);

-- Audit log (local operation trail for accountability)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details_json TEXT,
  timestamp TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT,
  is_read INTEGER DEFAULT 0,
  task_id TEXT,
  case_number TEXT,
  action_url TEXT,
  timestamp TEXT NOT NULL
);

-- Key-value store (replaces AsyncStorage)
CREATE TABLE IF NOT EXISTS key_value_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Task list projection (read-optimized list view)
CREATE TABLE IF NOT EXISTS task_list_projection (
  id TEXT PRIMARY KEY,
  case_id INTEGER NOT NULL,
  verification_task_id TEXT NOT NULL,
  verification_task_number TEXT,
  title TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_pincode TEXT,
  status TEXT NOT NULL,
  priority TEXT DEFAULT 'MEDIUM',
  assigned_at TEXT,
  updated_at TEXT,
  completed_at TEXT,
  verification_type TEXT,
  verification_type_name TEXT,
  is_saved INTEGER NOT NULL DEFAULT 0,
  is_revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at TEXT,
  in_progress_at TEXT,
  saved_at TEXT,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  search_text TEXT
);

-- Task detail projection (read-optimized case detail view)
CREATE TABLE IF NOT EXISTS task_detail_projection (
  id TEXT PRIMARY KEY,
  task_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Dashboard projection (singleton row)
CREATE TABLE IF NOT EXISTS dashboard_projection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  assigned_count INTEGER NOT NULL DEFAULT 0,
  in_progress_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  saved_count INTEGER NOT NULL DEFAULT 0,
  active_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  updated_at TEXT NOT NULL
);
`;

/**
 * Indexes for query performance
 */
export const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_sync_status ON tasks(sync_status);
CREATE INDEX IF NOT EXISTS idx_tasks_verification_task_id ON tasks(verification_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_case_id ON tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_active_status_saved ON tasks(is_revoked, status, is_saved, assigned_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);

CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_sync_status ON attachments(sync_status);
CREATE INDEX IF NOT EXISTS idx_attachments_task_component_uploaded ON attachments(task_id, component_type, uploaded_at);

CREATE INDEX IF NOT EXISTS idx_locations_task_id ON locations(task_id);
CREATE INDEX IF NOT EXISTS idx_locations_sync_status ON locations(sync_status);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp);

CREATE INDEX IF NOT EXISTS idx_form_submissions_task_id ON form_submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_sync_status ON form_submissions(sync_status);

CREATE INDEX IF NOT EXISTS idx_form_templates_lookup ON form_templates(verification_type, outcome);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_pending_window ON sync_queue(status, next_retry_at, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_synced ON audit_log(synced);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);

CREATE INDEX IF NOT EXISTS idx_task_list_projection_status_saved ON task_list_projection(status, is_saved, is_revoked, assigned_at);
CREATE INDEX IF NOT EXISTS idx_task_list_projection_search ON task_list_projection(search_text);
CREATE INDEX IF NOT EXISTS idx_task_detail_projection_updated ON task_detail_projection(updated_at);
`;

/**
 * Migration definitions for database upgrades
 */
export interface Migration {
  version: number;
  description: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  // Version 1 is the initial schema (created by SCHEMA_SQL + INDEX_SQL)
  // Version 2 adds revoke tracking and status timestamp columns to tasks
  {
    version: 2,
    description: 'Add revoke tracking and status timestamp columns to tasks',
    sql: `
      ALTER TABLE tasks ADD COLUMN is_revoked INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN revoked_at TEXT;
      ALTER TABLE tasks ADD COLUMN revoked_by_name TEXT;
      ALTER TABLE tasks ADD COLUMN revoke_reason TEXT;
      ALTER TABLE tasks ADD COLUMN in_progress_at TEXT;
      ALTER TABLE tasks ADD COLUMN saved_at TEXT;
      ALTER TABLE tasks ADD COLUMN is_saved INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN attachment_count INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 3,
    description: 'Add notifications table',
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT,
        is_read INTEGER DEFAULT 0,
        task_id TEXT,
        case_number TEXT,
        action_url TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    `,
  },
  {
    version: 4,
    description: 'Add territory assignment columns to user_session',
    sql: `
      ALTER TABLE user_session ADD COLUMN assigned_pincodes_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE user_session ADD COLUMN assigned_areas_json TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 5,
    description: 'Add backend attachment linkage to attachments',
    sql: `
      ALTER TABLE attachments ADD COLUMN backend_attachment_id TEXT;
    `,
  },
  {
    version: 6,
    description:
      'Add performance indexes for task lists, attachments, and sync queue',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_tasks_active_status_saved ON tasks(is_revoked, status, is_saved, assigned_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
      CREATE INDEX IF NOT EXISTS idx_attachments_task_component_uploaded ON attachments(task_id, component_type, uploaded_at);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_pending_window ON sync_queue(status, next_retry_at, priority, created_at);
    `,
  },
  {
    version: 7,
    description: 'Add queue lease tracking columns for crash recovery',
    sql: `
      ALTER TABLE sync_queue ADD COLUMN started_at TEXT;
      ALTER TABLE sync_queue ADD COLUMN lease_expires_at TEXT;
    `,
  },
  {
    version: 8,
    description:
      'Add projection tables for list/detail/dashboard read optimization',
    sql: `
      CREATE TABLE IF NOT EXISTS task_list_projection (
        id TEXT PRIMARY KEY,
        case_id INTEGER NOT NULL,
        verification_task_id TEXT NOT NULL,
        verification_task_number TEXT,
        title TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        address_street TEXT,
        address_city TEXT,
        address_state TEXT,
        address_pincode TEXT,
        status TEXT NOT NULL,
        priority TEXT DEFAULT 'MEDIUM',
        assigned_at TEXT,
        updated_at TEXT,
        completed_at TEXT,
        verification_type TEXT,
        verification_type_name TEXT,
        is_saved INTEGER NOT NULL DEFAULT 0,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        revoked_at TEXT,
        in_progress_at TEXT,
        saved_at TEXT,
        attachment_count INTEGER NOT NULL DEFAULT 0,
        search_text TEXT
      );
      CREATE TABLE IF NOT EXISTS task_detail_projection (
        id TEXT PRIMARY KEY,
        task_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dashboard_projection (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        assigned_count INTEGER NOT NULL DEFAULT 0,
        in_progress_count INTEGER NOT NULL DEFAULT 0,
        completed_count INTEGER NOT NULL DEFAULT 0,
        saved_count INTEGER NOT NULL DEFAULT 0,
        active_count INTEGER NOT NULL DEFAULT 0,
        last_sync_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_task_list_projection_status_saved ON task_list_projection(status, is_saved, is_revoked, assigned_at);
      CREATE INDEX IF NOT EXISTS idx_task_list_projection_search ON task_list_projection(search_text);
      CREATE INDEX IF NOT EXISTS idx_task_detail_projection_updated ON task_detail_projection(updated_at);
      INSERT OR REPLACE INTO task_list_projection
      SELECT
        id,
        case_id,
        verification_task_id,
        verification_task_number,
        title,
        customer_name,
        address_street,
        address_city,
        address_state,
        address_pincode,
        status,
        priority,
        assigned_at,
        updated_at,
        completed_at,
        verification_type,
        verification_type_name,
        is_saved,
        is_revoked,
        revoked_at,
        in_progress_at,
        saved_at,
        attachment_count,
        TRIM(
          LOWER(
            COALESCE(customer_name, '') || ' ' ||
            COALESCE(address_city, '') || ' ' ||
            COALESCE(verification_task_number, '') || ' ' ||
            COALESCE(case_id, '')
          )
        )
      FROM tasks;
      INSERT OR REPLACE INTO task_detail_projection (id, task_json, updated_at)
      SELECT id, json_object(
        'id', id,
        'caseId', case_id,
        'verificationTaskId', verification_task_id,
        'verificationTaskNumber', verification_task_number,
        'title', title,
        'description', description,
        'customerName', customer_name,
        'customerCallingCode', customer_calling_code,
        'customerPhone', customer_phone,
        'customerEmail', customer_email,
        'addressStreet', address_street,
        'addressCity', address_city,
        'addressState', address_state,
        'addressPincode', address_pincode,
        'latitude', latitude,
        'longitude', longitude,
        'status', status,
        'priority', priority,
        'assignedAt', assigned_at,
        'updatedAt', updated_at,
        'completedAt', completed_at,
        'notes', notes,
        'verificationType', verification_type,
        'verificationOutcome', verification_outcome,
        'applicantType', applicant_type,
        'backendContactNumber', backend_contact_number,
        'createdByBackendUser', created_by_backend_user,
        'assignedToFieldUser', assigned_to_field_user,
        'clientId', client_id,
        'clientName', client_name,
        'clientCode', client_code,
        'productId', product_id,
        'productName', product_name,
        'productCode', product_code,
        'verificationTypeId', verification_type_id,
        'verificationTypeName', verification_type_name,
        'verificationTypeCode', verification_type_code,
        'formDataJson', form_data_json,
        'is_revoked', is_revoked,
        'revoked_at', revoked_at,
        'revoked_by_name', revoked_by_name,
        'revoke_reason', revoke_reason,
        'in_progress_at', in_progress_at,
        'saved_at', saved_at,
        'is_saved', is_saved,
        'attachment_count', attachment_count,
        'syncStatus', sync_status,
        'lastSyncedAt', last_synced_at,
        'localUpdatedAt', local_updated_at
      ), COALESCE(updated_at, assigned_at, local_updated_at, CURRENT_TIMESTAMP)
      FROM tasks;
      INSERT OR REPLACE INTO dashboard_projection
      SELECT
        1,
        COALESCE(SUM(CASE WHEN status = 'ASSIGNED' AND (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'IN_PROGRESS' AND (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN is_saved = 1 AND status != 'COMPLETED' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN (is_revoked IS NULL OR is_revoked = 0) THEN 1 ELSE 0 END), 0),
        (SELECT last_download_sync_at FROM sync_metadata WHERE id = 1),
        CURRENT_TIMESTAMP
      FROM tasks;
    `,
  },
  {
    version: 9,
    description:
      'Raise sync_queue.max_attempts default from 3 to 10 (C11, data-loss safety)',
    sql: `
      UPDATE sync_queue SET max_attempts = 10 WHERE max_attempts = 3;
    `,
  },
  {
    version: 10,
    description:
      'Add sync_queue.user_id to isolate per-user queues on shared devices (C6)',
    sql: `
      ALTER TABLE sync_queue ADD COLUMN user_id TEXT;
    `,
  },
];
