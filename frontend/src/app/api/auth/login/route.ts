import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback';

export async function POST(req: Request) {
  try {
    await connectDB();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const token = jwt.sign({ id: user._id, plan: user.plan }, JWT_SECRET, { expiresIn: '7d' });
    
    return NextResponse.json({ token, user: { id: user._id, email: user.email, username: user.username } });
  } catch (error) {
    console.error('[Auth Error]', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
