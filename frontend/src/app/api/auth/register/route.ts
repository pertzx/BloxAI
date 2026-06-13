import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback';

export async function POST(req: Request) {
  try {
    await connectDB();
    const { email, username, password } = await req.json();

    if (!email || !username || !password) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, username, password: hashedPassword });

    const token = jwt.sign({ id: user._id, plan: user.plan }, JWT_SECRET, { expiresIn: '7d' });
    
    return NextResponse.json({ token, user: { id: user._id, email: user.email, username: user.username } }, { status: 201 });
  } catch (error) {
    console.error('[Auth Error]', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
