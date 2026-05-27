import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.redirect('/login');
  res.cookies.set({ name: 'admin-auth', value: '', maxAge: 0, path: '/' });
  return res;
}
