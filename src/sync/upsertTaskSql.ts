// Dependency-free on purpose: upsertPreservesLocal.contract.test.ts runs under
// plain Node and must import the REAL statement without dragging in react-native.

/**
 * The task pull upsert. Exported so upsertPreservesLocal.contract.test.ts can
 * execute the REAL statement against node:sqlite (the syncMetadata precedent).
 *
 * form_data_json + verification_outcome are COALESCEd, NOT plain
 * `excluded.…`: they are the two columns the DEVICE writes at submit
 * (SubmitVerificationUseCase → TaskRepository.updateFormData /
 * updateVerificationOutcome) and they do NOT flow through
 * SyncConflictResolver the way status/is_saved/saved_at do. The server echoes
 * them only after the submission actually lands — so while a submission is
 * stuck (CASE-000008 / CASE-000004-2: photos through, form leg failed), every
 * 5-min background pull carried NULL and wiped the device's own copy, leaving
 * the autosave blob as the only surviving copy of the agent's answers.
 * COALESCE keeps the local value when the server has none; a non-null server
 * copy (post-submit echo, office completion) still wins.
 */
export const UPSERT_TASK_FROM_SERVER_SQL = `INSERT INTO tasks
        (id, case_id, case_number, verification_task_id, verification_task_number, title, description, customer_name, customer_calling_code,
         customer_phone, customer_email, company_name, address_street, address_city, address_state, address_pincode, latitude, longitude,
         status, priority, assigned_at, updated_at, completed_at, notes, verification_type, verification_outcome, applicant_type,
         backend_contact_number, created_by_backend_user, assigned_to_field_user, client_id, client_name, client_code,
         product_id, product_name, product_code, verification_type_id, verification_type_name, verification_type_code,
         form_data_json, is_revoked, revoked_at, revoked_by_name, revoke_reason,
         in_progress_at, saved_at, is_saved, attachment_count,
         sync_status, last_synced_at, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         case_id = excluded.case_id,
         case_number = excluded.case_number,
         verification_task_id = excluded.verification_task_id,
         verification_task_number = excluded.verification_task_number,
         title = excluded.title,
         description = excluded.description,
         customer_name = excluded.customer_name,
         customer_calling_code = excluded.customer_calling_code,
         customer_phone = excluded.customer_phone,
         customer_email = excluded.customer_email,
         company_name = excluded.company_name,
         address_street = excluded.address_street,
         address_city = excluded.address_city,
         address_state = excluded.address_state,
         address_pincode = excluded.address_pincode,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         status = excluded.status,
         priority = excluded.priority,
         assigned_at = excluded.assigned_at,
         updated_at = excluded.updated_at,
         completed_at = excluded.completed_at,
         notes = excluded.notes,
         verification_type = excluded.verification_type,
         verification_outcome = COALESCE(excluded.verification_outcome, verification_outcome),
         applicant_type = excluded.applicant_type,
         backend_contact_number = excluded.backend_contact_number,
         created_by_backend_user = excluded.created_by_backend_user,
         assigned_to_field_user = excluded.assigned_to_field_user,
         client_id = excluded.client_id,
         client_name = excluded.client_name,
         client_code = excluded.client_code,
         product_id = excluded.product_id,
         product_name = excluded.product_name,
         product_code = excluded.product_code,
         verification_type_id = excluded.verification_type_id,
         verification_type_name = excluded.verification_type_name,
         verification_type_code = excluded.verification_type_code,
         form_data_json = COALESCE(excluded.form_data_json, form_data_json),
         is_revoked = excluded.is_revoked,
         revoked_at = excluded.revoked_at,
         revoked_by_name = excluded.revoked_by_name,
         revoke_reason = excluded.revoke_reason,
         in_progress_at = excluded.in_progress_at,
         saved_at = excluded.saved_at,
         is_saved = excluded.is_saved,
         attachment_count = excluded.attachment_count,
         sync_status = 'SYNCED',
         last_synced_at = excluded.last_synced_at,
         local_updated_at = excluded.local_updated_at`;
