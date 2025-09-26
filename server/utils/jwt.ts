import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'your-access-secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret';

/**
 * Generate an access token (short-lived)
 */
export const generateAccessToken = (userId: string) => {
    return jwt.sign({ userId }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' }); // Expires in 15 minutes
  };
  
  /**
   * Generate a refresh token (longer-lived)
   */
  export const generateRefreshToken = (userId: string) => {
    return jwt.sign({ userId }, REFRESH_TOKEN_SECRET, { expiresIn: '7d' }); // Expires in 7 days
  };
  
  /**
   * Verify access token
   */
  export const verifyAccessToken = (token: string) => {
    return jwt.verify(token, ACCESS_TOKEN_SECRET);
  };
  
  /**
   * Verify refresh token
   */
  export const verifyRefreshToken = (token: string) => {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
  };