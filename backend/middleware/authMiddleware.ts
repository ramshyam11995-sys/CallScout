import { Request, Response, NextFunction } from 'express';
import { verifyJwtToken, TokenPayload } from '../services/authService.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Express middleware to verify JWT Token from the Authorization header
 * Header format: Authorization: Bearer <jwt_token>
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or malformed Authorization header. Please sign in.'
    });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Token is empty.' });
    return;
  }

  // Verify JWT
  const decoded = verifyJwtToken(token);

  if (!decoded) {
    res.status(401).json({
      error: 'Unauthorized: Invalid or expired authentication token. Please sign in again.'
    });
    return;
  }

  req.user = {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name
  };

  next();
}
