import type { Request, Response, NextFunction } from "express";
import type { SessionUser } from "../lib/auth";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      isAuthenticated(): this is Request & { user: SessionUser };
    }
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

import { loadSessionUser } from "../lib/auth";

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  req.isAuthenticated = function (this: Request): this is Request & { user: SessionUser } {
    return this.user !== undefined;
  };

  const userId = req.session?.userId;
  if (userId) {
    const user = await loadSessionUser(userId);
    if (user) {
      req.user = user;
    } else {
      delete req.session.userId;
    }
  }

  next();
}
