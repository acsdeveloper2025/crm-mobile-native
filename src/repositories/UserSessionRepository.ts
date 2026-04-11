import { DatabaseService } from '../database/DatabaseService';
import type { UserProfile } from '../types/api';

type SessionRow = {
  userId: string;
  userName: string;
  username: string;
  email: string;
  role: string;
  employeeId: string;
  designation: string;
  department: string;
  profilePhotoUrl: string | null;
  assignedPincodesJson: string | null;
  assignedAreasJson: string | null;
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

  async getLegacyTokens(): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
  }> {
    const rows = await DatabaseService.query<{
      accessToken?: string | null;
      refreshToken?: string | null;
    }>('SELECT access_token, refresh_token FROM user_session WHERE id = 1');

    return {
      accessToken: rows[0]?.accessToken || null,
      refreshToken: rows[0]?.refreshToken || null,
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

  async updateProfilePhoto(profilePhotoUrl: string | null): Promise<void> {
    await DatabaseService.execute(
      'UPDATE user_session SET profile_photo_url = ? WHERE id = 1',
      [profilePhotoUrl],
    );
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
      id: row.userId,
      name: row.userName,
      username: row.username,
      email: row.email,
      role: row.role,
      employeeId: row.employeeId,
      designation: row.designation,
      department: row.department,
      profilePhotoUrl: row.profilePhotoUrl || undefined,
      assignedPincodes: row.assignedPincodesJson
        ? JSON.parse(row.assignedPincodesJson)
        : [],
      assignedAreas: row.assignedAreasJson
        ? JSON.parse(row.assignedAreasJson)
        : [],
    };
  }
}

export const UserSessionRepository = new UserSessionRepositoryClass();
