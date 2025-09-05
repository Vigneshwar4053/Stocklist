// server.js
import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import connectDB from './config/db.js';

import authRoutes from './routes/auth.routes.js';
import ownerRoutes from './routes/owner.routes.js';
import stocklistRoutes from './routes/stocklist.routes.js';
import customerRoutes from './routes/customer.routes.js';

import { User } from './models/user.model.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// health
app.get('/', (_req, res) => res.json({ ok: true }));

// mount routes
app.use('/api/auth', authRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/stocklist', stocklistRoutes);
app.use('/api/customer', customerRoutes);

// global 404 (after routes)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// safe route printer (call AFTER mounting routes)
function printRoutes() {
  console.log('Registered routes:');
  if (!app._router || !app._router.stack) {
    console.log('  (no routes registered yet)');
    return;
  }

  app._router.stack.forEach(layer => {
    // direct routes
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(',');
      console.log(`  ${methods} ${layer.route.path}`);
      return;
    }

    // router-level (mounted) — inspect nested stack
    if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      layer.handle.stack.forEach(nested => {
        if (nested.route && nested.route.path) {
          const methods = Object.keys(nested.route.methods).map(m => m.toUpperCase()).join(',');
          // include parent mount path if possible (best-effort)
          const parent = (layer.regexp && layer.regexp.fast_star) ? '' : (layer.regexp && layer.regexp.source) ? '' : '';
          console.log(`  ${methods} ${nested.route.path}`);
        }
      });
    }
  });
}

// start
const PORT = process.env.PORT || 4000;
async function bootstrap() {
  await connectDB(process.env.MONGODB_URI);

  // bootstrap owner user if provided in .env
  const ownerUser = process.env.BOOTSTRAP_OWNER_USERNAME;
  const ownerPass = process.env.BOOTSTRAP_OWNER_PASSWORD;
  if (ownerUser && ownerPass) {
    try {
      const exists = await User.findOne({ username: ownerUser });
      if (!exists) {
        await User.create({ username: ownerUser, password: ownerPass, role: 'owner' });
        console.log(`👑 Bootstrapped owner: ${ownerUser}`);
      } else {
        console.log(`👑 Owner already exists: ${ownerUser}`);
      }
    } catch (err) {
      console.error('Error checking/creating bootstrap owner:', err);
    }
  }

  // Print routes (safe)
  printRoutes();

  app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}

bootstrap().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});
