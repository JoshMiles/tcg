'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { addStaff, removeStaff, setStaffRole, type StaffActor, type StaffResult } from '@/lib/staff';

// Staff management. Each action checks the caller itself (server actions are public endpoints) and the rules live in lib/staff.ts:
// admins can add, change and remove mods; only the super admin can touch admins; the super admin can't be changed at all.
async function actor(): Promise<StaffActor> {
  const me = await requireAdmin();
  return { login: me.login, role: me.role };
}

export async function addStaffAction(login: string, role: string): Promise<StaffResult> {
  const res = await addStaff(await actor(), login, role === 'admin' ? 'admin' : 'mod');
  revalidatePath('/admin/staff');
  return res;
}

export async function setStaffRoleAction(login: string, role: string): Promise<StaffResult> {
  const res = await setStaffRole(await actor(), login, role === 'admin' ? 'admin' : 'mod');
  revalidatePath('/admin/staff');
  return res;
}

export async function removeStaffAction(login: string): Promise<StaffResult> {
  const res = await removeStaff(await actor(), login);
  revalidatePath('/admin/staff');
  return res;
}
