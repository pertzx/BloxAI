import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { connectDB } from '@/lib/db';
import { User } from '@/lib/models/User';
import { Project } from '@/lib/models/Project';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback';

export async function POST(req: Request) {
  try {
    await connectDB();
    const rawBody = await req.text();
    let data: any = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch (parseError) {
      console.info('[debug plugin auth] raw parse error');
      console.info('[debug plugin auth] raw body snippet:', rawBody.slice(0, 300));
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }
    const { email, password, placeId, placeName } = data;
    // #region debug-point plugin-auth-request
    console.info('[debug plugin auth] raw body size:', rawBody.length);
    console.info('[debug plugin auth] payload keys:', Object.keys(data || {}));
    console.info('[debug plugin auth] email:', email || null, 'placeId:', placeId || null, 'placeName:', placeName || null);
    // #endregion

    if (!email || !password || !placeId) {
      // #region debug-point plugin-auth-missing-fields
      console.info('[debug plugin auth] missing required fields');
      // #endregion
      return NextResponse.json({ error: 'Email, senha e placeId são obrigatórios' }, { status: 400 });
    }

    // 1. Validar Usuário
    const user = await User.findOne({ email });
    // #region debug-point plugin-auth-user
    console.info('[debug plugin auth] user found:', !!user);
    // #endregion
    if (!user) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    // #region debug-point plugin-auth-password
    console.info('[debug plugin auth] password match:', isMatch);
    // #endregion
    if (!isMatch) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const token = jwt.sign({ id: user._id, plan: user.plan }, JWT_SECRET, { expiresIn: '30d' }); // 30 dias para o plugin não deslogar toda hora

    // 2. Auto-criar ou Retornar o Projeto (baseado no PlaceId e Owner)
    let project = await Project.findOne({ placeId: String(placeId), owner: user._id });
    // #region debug-point plugin-auth-project
    console.info('[debug plugin auth] project exists:', !!project);
    // #endregion
    
    if (!project) {
      const apiKey = crypto.randomBytes(32).toString('hex');
      project = await Project.create({
        name: placeName || `Projeto ${placeId}`,
        placeId: String(placeId),
        owner: user._id,
        apiKey
      });
    }

    // #region debug-point plugin-auth-success
    console.info('[debug plugin auth] login success for user:', String(user._id), 'project:', String(project._id));
    // #endregion

    return NextResponse.json({ 
      token, 
      project: { 
        id: project._id, 
        name: project.name, 
        apiKey: project.apiKey 
      } 
    });
  } catch (error) {
    console.error('[Plugin Auth Error]', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
