import { Router, Response } from 'express';
import { registerUser, loginUser, getUserById } from '../services/authService.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * POST /api/auth/register
 * Register with Email & Password
 */
router.post('/register', async (req, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const result = await registerUser({ email, password, name });
    res.status(201).json({
      success: true,
      token: result.token,
      user: result.user
    });
  } catch (err: any) {
    console.error('[authRoutes] Registration error:', err.message);
    res.status(400).json({ error: err.message || 'Failed to register.' });
  }
});

/**
 * POST /api/auth/login
 * Log in with Email & Password
 */
router.post('/login', async (req, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const result = await loginUser({ email, password });
    res.json({
      success: true,
      token: result.token,
      user: result.user
    });
  } catch (err: any) {
    console.error('[authRoutes] Login error:', err.message);
    res.status(401).json({ error: err.message || 'Invalid email or password.' });
  }
});

/**
 * GET /api/auth/me
 * Retrieve current authenticated user profile
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const user = await getUserById(req.user.id);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({
      success: true,
      user
    });
  } catch (err: any) {
    console.error('[authRoutes] /me error:', err.message);
    res.status(500).json({ error: 'Internal server error fetching user.' });
  }
});

export default router;
