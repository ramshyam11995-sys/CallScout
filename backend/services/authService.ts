import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient } from './dbService.js';
import { UserProfile } from '../../src/types.js';

const JWT_EXPIRES_IN = '7d';

/**
 * Ephemeral session secret used strictly if process.env.JWT_SECRET is unexpectedly absent,
 * ensuring no hardcoded secrets exist in source code.
 */
let ephemeralSessionSecret: string | null = null;

export function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }

  if (!ephemeralSessionSecret) {
    console.warn(
      '[authService] Warning: process.env.JWT_SECRET is not configured or is under 16 characters. Generating an ephemeral cryptographically random in-memory key for this runtime process.'
    );
    ephemeralSessionSecret = crypto.randomBytes(64).toString('hex');
  }
  return ephemeralSessionSecret;
}

export interface TokenPayload {
  id: string;
  email: string;
  name?: string | null;
}

export function generateJwtToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwtToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch (err) {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Local persistent users fallback
interface StoredLocalUser {
  id: string;
  email: string;
  password: string;
  name: string;
  createdAt: string;
}

const LOCAL_USERS_DIR = path.resolve(process.cwd(), '.data');
const LOCAL_USERS_FILE = path.resolve(LOCAL_USERS_DIR, 'users.json');

function ensureLocalUsersDir(): void {
  if (!fs.existsSync(LOCAL_USERS_DIR)) {
    fs.mkdirSync(LOCAL_USERS_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_USERS_FILE)) {
    fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readLocalUsers(): StoredLocalUser[] {
  try {
    ensureLocalUsersDir();
    const content = fs.readFileSync(LOCAL_USERS_FILE, 'utf-8');
    const users: StoredLocalUser[] = JSON.parse(content || '[]');

    // Automatically ensure the demo user exists for seamless evaluation
    if (!users.some(u => u.email === 'demo@callscout.ai')) {
      const demoUser: StoredLocalUser = {
        id: 'user_demo_default',
        email: 'demo@callscout.ai',
        password: bcrypt.hashSync('password123', 10),
        name: 'CallScout Demo User',
        createdAt: new Date().toISOString()
      };
      users.push(demoUser);
      fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    }

    return users;
  } catch (err) {
    console.error('[authService] Error reading local users:', err);
    return [];
  }
}

function writeLocalUsers(users: StoredLocalUser[]): void {
  try {
    ensureLocalUsersDir();
    fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('[authService] Error writing local users:', err);
  }
}

/**
 * Register a new user with Email and Password
 */
export async function registerUser(data: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ user: UserProfile; token: string }> {
  const email = data.email.trim().toLowerCase();
  const password = data.password.trim();
  const name = data.name?.trim() || email.split('@')[0];

  if (!email || !email.includes('@')) {
    throw new Error('Please provide a valid email address.');
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const prisma = getPrismaClient();

  if (prisma) {
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      throw new Error('An account with this email already exists. Please log in.');
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email,
        password: hashedPassword,
        name
      }
    });

    const userProfile: UserProfile = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name
    };

    const token = generateJwtToken(userProfile);
    return { user: userProfile, token };
  } else {
    // Local persistent storage fallback
    const localUsers = readLocalUsers();
    const existing = localUsers.find(u => u.email.toLowerCase() === email);
    if (existing) {
      throw new Error('An account with this email already exists. Please log in.');
    }

    const hashedPassword = await hashPassword(password);
    const newUser: StoredLocalUser = {
      id: `user_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      email,
      password: hashedPassword,
      name,
      createdAt: new Date().toISOString()
    };

    localUsers.push(newUser);
    writeLocalUsers(localUsers);

    const userProfile: UserProfile = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name
    };

    const token = generateJwtToken(userProfile);
    return { user: userProfile, token };
  }
}

/**
 * Log in an existing user with Email and Password
 */
export async function loginUser(data: {
  email: string;
  password: string;
}): Promise<{ user: UserProfile; token: string }> {
  const email = data.email.trim().toLowerCase();
  const password = data.password.trim();

  if (!email || !password) {
    throw new Error('Please enter both email and password.');
  }

  const prisma = getPrismaClient();

  if (prisma) {
    let user = await prisma.user.findUnique({
      where: { email }
    });

    // Auto-seed demo user into Neon PostgreSQL if logging in with standard demo credentials
    if (!user && email === 'demo@callscout.ai' && password === 'password123') {
      const hashedPassword = await hashPassword('password123');
      user = await prisma.user.upsert({
        where: { email: 'demo@callscout.ai' },
        update: {},
        create: {
          id: 'user_demo_default',
          email: 'demo@callscout.ai',
          password: hashedPassword,
          name: 'CallScout Demo User'
        }
      });
    }

    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      throw new Error('Invalid email or password.');
    }

    const userProfile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name
    };

    const token = generateJwtToken(userProfile);
    return { user: userProfile, token };
  } else {
    // Local persistent storage fallback
    const localUsers = readLocalUsers();
    const user = localUsers.find(u => u.email.toLowerCase() === email);

    if (!user) {
      throw new Error('Invalid email or password. Please check your credentials or create a new account.');
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      throw new Error('Invalid email or password.');
    }

    const userProfile: UserProfile = {
      id: user.id,
      email: user.email,
      name: user.name
    };

    const token = generateJwtToken(userProfile);
    return { user: userProfile, token };
  }
}

/**
 * Fetch user details by ID
 */
export async function getUserById(id: string): Promise<UserProfile | null> {
  const prisma = getPrismaClient();
  if (prisma) {
    const user = await prisma.user.findUnique({
      where: { id }
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name
    };
  }

  const localUsers = readLocalUsers();
  const user = localUsers.find(u => u.id === id);
  if (user) {
    return {
      id: user.id,
      email: user.email,
      name: user.name
    };
  }

  return null;
}
