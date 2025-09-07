// middleware/requireRole.js
// Usage examples:
//   requireRole('owner')
//   requireRole(['owner','stocklist'])

export default function requireRole(roles) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    return (req, res, next) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
      if (!allowed.includes(req.user.role)) {
        return res.status(403).json({ message: `Access denied: requires one of [${allowed.join(', ')}]` });
      }
      next();
    };
  }
  