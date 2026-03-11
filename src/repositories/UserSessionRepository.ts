import { DatabaseService } from '../database/DatabaseService';
import type { UserProfile } from '../types/api';

type SessionRow = {
  user_id: string;
  user_name: string;
  username: string;
  email: string;
  role: string;
  employee_id: string;
  designation: string;
  department: string;
  profile_photo_url: string | null;
  assigned_pincodes_json: string | null;
  assigned_areas_json: string | null;
};

class UserSessionRepositoryClass {
  isReady(): boolean {
    return DatabaseService.isReady();
  }

  async hasLegacyTokenColumns(): Promise<boolean> {
    const columns = await DatabaseService.query<{ name: string }>(
      'PRAGMA table_info(user_session)',
    );
    const names = new Set(columns.map(column => column.name));
    return names.has('access_token') && names.has('refresh_token');
  }

  async getLegacyTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    const rows = await DatabaseService.query<{
      access_token?: string | null;
      refresh_token?: string | null;
    }>('SELECT access_token, refresh_token FROM user_session WHERE id = 1');

    return {
      accessToken: rows[0]?.access_token || null,
      refreshToken: rows[0]?.refresh_token || null,
    };
  }

  async scrubLegacyTokens(): Promise<void> {
    await DatabaseService.execute(
      `UPDATE user_session
       SET access_token = '',
           refresh_token = ''
       WHERE id = 1`,
    );
  }

  async clearSession(): Promise<void> {
    await DatabaseService.execute('DELETE FROM user_session');
  }

  async saveUser(user: UserProfile, expiresAt: string): Promise<void> {
    await this.clearSession();
    await DatabaseService.execute(
      `INSERT INTO user_session
        (id, user_id, user_name, username, email, role, employee_id,
         designation, department, profile_photo_url,
         assigned_pincodes_json, assigned_areas_json,
         token_expires_at, logged_in_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.username,
        user.email || '',
        user.role,
        user.employeeId || '',
        user.designation || '',
        user.department || '',
        user.profilePhotoUrl || null,
        JSON.stringify(user.assignedPincodes || []),
        JSON.stringify(user.assignedAreas || []),
        expiresAt,
        new Date().toISOString(),
      ],
    );
  }

  async loadUser(): Promise<UserProfile | null> {
    const rows = await DatabaseService.query<SessionRow>(
      'SELECT * FROM user_session WHERE id = 1',
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.user_id,
      name: row.user_name,
      username: row.username,
      email: row.email,
      role: row.role,
      employeeId: row.employee_id,
      designation: row.designation,
      department: row.department,
      profilePhotoUrl: row.profile_photo_url || undefined,
      assignedPincodes: row.assigned_pincodes_json
        ? JSON.parse(row.assigned_pincodes_json)
        : [],
      assignedAreas: row.assigned_areas_json
        ? JSON.parse(row.assigned_areas_json)
        : [],
    };
  }
}

export const UserSessionRepository = new UserSessionRepositoryClass();
